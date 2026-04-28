import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  School, 
  Users, 
  Calendar, 
  Settings, 
  LogOut, 
  UserCircle,
  MessageSquare,
  ClipboardList,
  GraduationCap,
  LayoutGrid,
  CheckCircle2,
  Database,
  Building2,
  FilePlus,
  Search,
  FileText,
  BellRing,
  UserCheck,
  IdCard,
  X,
  ChevronsUp,
  ChevronsDown,
  Loader2,
  Menu
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ROLE_LABELS } from '../constants';
import ActiveAcademicYearDisplay from './ActiveAcademicYearDisplay';
import VirtualAssistant from './VirtualAssistant';
import { auth, db, handleFirestoreError } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { useAuthStore } from '../lib/auth-store';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, limit, getDocs } from 'firebase/firestore';
import { SchoolData } from '../types';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, switchRole } = useAuthStore();
  const [showRolesDropdown, setShowRolesDropdown] = useState(false);

  const getRolePath = (role: string) => {
    switch(role) {
      case 'ADMIN': return '/admin';
      case 'TEACHER': return '/teacher';
      case 'SUBJECT_TEACHER': return '/subject-teacher';
      case 'PARENT': return '/parent';
      default: return '/login';
    }
  };
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotificationToast, setShowNotificationToast] = useState(false);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const [latestNotification, setLatestNotification] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [pendingCount, setPendingCount] = useState(0);
  const [schoolData, setSchoolData] = useState<SchoolData | null>(null);
  const [isDataAdminOpen, setIsDataAdminOpen] = useState(true);
  const [isAbsensiOpen, setIsAbsensiOpen] = useState(false);
  const [isInputPetugasOpen, setIsInputPetugasOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    async function fetchSchoolData() {
      try {
        const q = query(collection(db, 'schoolData'), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setSchoolData(snapshot.docs[0].data() as SchoolData);
        }
      } catch (error) {
        console.error('Error fetching school data:', error);
      }
    }
    fetchSchoolData();
  }, []);

  useEffect(() => {
    if (!user || !auth.currentUser || user.role !== 'TEACHER' || !user.className) {
      setIsLoading(false);
      return;
    }

    let notifLoaded = false;
    let pendingLoaded = false;

    const checkLoaded = () => {
      if (notifLoaded && pendingLoaded) {
        setIsLoading(false);
      }
    };

    const q = query(
      collection(db, 'notifications'),
      where('className', '==', user.className),
      where('read', '==', false),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newNotifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (newNotifs.length > notifications.length && newNotifs.length > 0 && notifLoaded) {
        setLatestNotification(newNotifs[0]);
        setShowNotificationToast(true);
        
        // Sound notification
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (e) {
          console.log('Audio init failed:', e);
        }

        setTimeout(() => setShowNotificationToast(false), 10000);
      }
      setNotifications(newNotifs);
      notifLoaded = true;
      checkLoaded();
    }, (err) => {
      handleFirestoreError(err, 'list', 'notifications');
      notifLoaded = true;
      checkLoaded();
    });

    const pendingQ = query(
      collection(db, 'attendance'),
      where('className', '==', user.className),
      where('status', '==', 'Pending')
    );
    
    const unsubscribePending = onSnapshot(pendingQ, (snapshot) => {
      setPendingCount(snapshot.docs.length);
      pendingLoaded = true;
      checkLoaded();
    }, (err) => {
      handleFirestoreError(err, 'list', 'attendance pending count');
      pendingLoaded = true;
      checkLoaded();
    });

    return () => {
      unsubscribe();
      unsubscribePending();
    };
  }, [user, notifications.length]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    logout();
    navigate('/login');
  };

  type NavItem = {
    name: string;
    path?: string;
    icon?: any;
    role: string[];
    badge?: number;
    subItems?: Omit<NavItem, 'subItems'>[];
    className?: string; // Add this
  };

  const navItems: NavItem[] = [
    { name: 'Dashboard', path: '/parent', icon: UserCircle, role: ['PARENT'] },
    { name: 'Riwayat Absensi', path: '/parent?view=history', icon: ClipboardList, role: ['PARENT'] },
    { name: 'Dashboard', path: '/teacher?tab=overview', icon: LayoutGrid, role: ['TEACHER'] },
    { name: 'Data Siswa', path: '/teacher?tab=students', icon: GraduationCap, role: ['TEACHER'], className: "text-amber-500 hover:text-amber-400" },
    { name: 'Data Absensi Kelas', path: '/teacher?tab=attendance', icon: CheckCircle2, role: ['TEACHER'], badge: pendingCount },
    { name: 'Rekap Absensi Perbulan', path: '/teacher?tab=rekap', icon: FileText, role: ['TEACHER'] },
    { name: 'Rekap Absensi Semester', path: '/teacher?tab=rekapSemester', icon: FileText, role: ['TEACHER'] },
    { name: 'Input Guru Mapel', path: '/subject-teacher', icon: ClipboardList, role: ['SUBJECT_TEACHER'] },
    { name: 'Dashboard', path: '/admin?tab=overview', icon: LayoutGrid, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
    {
      name: 'DATA ADMINISTRASI',
      role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'],
      subItems: [
        { name: 'Data Sekolah', path: '/admin?tab=school', icon: Building2, role: ['ADMIN', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'], className: "text-amber-500 hover:text-amber-400" },
        { name: 'Data Guru', path: '/admin?tab=teachers-list', icon: Users, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'], className: "text-amber-500 hover:text-amber-400" },
        { name: 'Data Siswa', path: '/admin?tab=students', icon: GraduationCap, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'], className: "text-amber-500 hover:text-amber-400" },
        { name: 'Manajemen PII Siswa', path: '/admin?tab=student-pii', icon: IdCard, role: ['ADMIN'], className: "text-red-500 hover:text-red-400" },
        { name: 'Pengaturan Guru & Siswa', path: '/admin?tab=role-management-guru', icon: Users, role: ['ADMIN', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'], className: "text-amber-500 hover:text-amber-400" },
        { name: 'Wali Kelas', path: '/admin?tab=teachers', icon: Users, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'Guru BK', path: '/admin?tab=counselors', icon: Search, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'Data Guru Mapel', path: '/admin?tab=subject-teachers', icon: Users, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'Data Kelas', path: '/admin?tab=classes', icon: FilePlus, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
      ]
    },
    {
      name: 'DATA ABSENSI',
      role: ['ADMIN', 'COUNSELOR', 'TEACHER', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'],
      subItems: [
        { name: 'Ringkasan Kehadiran', path: '/admin?tab=attendance-summary', icon: LayoutGrid, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'Detail Ketidakhadiran', path: '/admin?tab=attendance-detail', icon: ClipboardList, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'Rekap Absensi Perbulan', path: '/admin?tab=rekap', icon: FileText, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'Rekap Absensi Semester', path: '/admin?tab=rekapSemester', icon: FileText, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'Absensi Individual', path: '/admin?tab=attendance-individual', icon: UserCircle, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
      ]
    },
    { name: 'LAPORAN GURU MAPEL', path: '/admin?tab=subject-attendance-report', icon: UserCheck, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'], className: "text-sky-600 hover:text-sky-700" },
    { name: 'ABSENSI MANUAL', path: '/teacher?tab=attendance&showAddModal=true', icon: FilePlus, role: ['TEACHER', 'SUBJECT_TEACHER', 'ADMIN', 'WALI_KELAS'], className: "text-sky-600 hover:text-sky-700" },
    {
      name: 'INPUT PETUGAS ABSENSI KELAS',
      role: ['ADMIN', 'TEACHER', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'],
      subItems: [
        { name: 'Daftar Petugas', path: '/attendance-officer?tab=officers', icon: Users, role: ['ADMIN', 'TEACHER', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'Absensi Manual', path: '/attendance-officer?tab=history', icon: ClipboardList, role: ['ADMIN', 'TEACHER', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'Rekap Absensi', path: '/attendance-officer?tab=rekap', icon: FileText, role: ['ADMIN', 'TEACHER', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
      ]
    },
    { name: 'Pengaturan', path: '/admin?tab=settings', icon: Settings, role: ['ADMIN', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
  ];

  const filteredNavItems = navItems.filter(item => item.role.includes(user?.role || ''));

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Dark Professional (AdminLTE Style - Lightened for elegance) */}
      <aside className={cn(
        "bg-[#3e444a] flex flex-col shadow-xl z-50 overflow-y-auto transition-transform duration-300 md:relative fixed inset-y-0 left-0 w-64",
        isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="h-16 flex items-center px-6 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-3 text-white">
            <School size={28} className="text-blue-400" />
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold leading-tight truncate">SMPN 2 MAGELANG</h1>
              <p className="text-[9px] text-gray-400 uppercase tracking-widest font-semibold">Sistem Absensi</p>
            </div>
          </div>
        </div>

        {/* User Info Sidebar */}
        <div className="p-4 border-b border-gray-700 flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold text-xs">
            {user?.name?.substring(0, 1) || 'A'}
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-gray-200 truncate">{user?.name || 'Administrator'}</p>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
              <p className="text-[9px] text-gray-400 uppercase font-bold">Online</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2 mt-2 space-y-1">
          <p className="px-4 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Menu Utama</p>
          {filteredNavItems.map((item) => {
            const isActive = item.path && (location.pathname + location.search === item.path || 
                           (location.pathname === item.path && item.path.indexOf('?') === -1) ||
                           (item.path.includes('role-management') && location.search.includes('role-management')));

            if (item.subItems) {
               return (
                <div key={item.name}>
                  <button
                    onClick={() => {
                      if (item.name === 'DATA ABSENSI') setIsAbsensiOpen(!isAbsensiOpen);
                      else if (item.name === 'INPUT PETUGAS ABSENSI KELAS') setIsInputPetugasOpen(!isInputPetugasOpen);
                      else setIsDataAdminOpen(!isDataAdminOpen);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 rounded text-sm transition-all text-gray-300 hover:bg-gray-700 hover:text-white"
                  >
                    <Settings size={18} />
                    <span className="font-medium flex-1 text-left">{item.name}</span>
                    {(item.name === 'DATA ABSENSI' ? isAbsensiOpen : item.name === 'INPUT PETUGAS ABSENSI KELAS' ? isInputPetugasOpen : isDataAdminOpen) ? <ChevronsUp size={16} /> : <ChevronsDown size={16} />}
                  </button>
                  {(item.name === 'DATA ABSENSI' ? isAbsensiOpen : item.name === 'INPUT PETUGAS ABSENSI KELAS' ? isInputPetugasOpen : isDataAdminOpen) && (
                    <div className="pl-4 space-y-1">
                      {item.subItems.map((sub) => {
                        const isSubActive = location.pathname + location.search === sub.path || 
                                           (location.pathname === sub.path && sub.path.indexOf('?') === -1);
                        return (
                          <Link
                            key={`${item.name}-${sub.name}`}
                            to={sub.path!}
                            onClick={() => setIsMobileSidebarOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-4 py-2 rounded text-xs transition-all border-l-4",
                              isSubActive
                                ? "bg-gray-700 text-white border-blue-500"
                                : (sub.className || "border-transparent text-gray-400 hover:bg-gray-700 hover:text-white")
                            )}
                          >
                             {sub.name}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
               )
            }

            return (
              <Link
                key={`${item.name}-${item.path}`}
                to={item.path!}
                onClick={() => setIsMobileSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded text-sm transition-all group border-l-4",
                  isActive
                    ? "bg-gray-700 text-white border-blue-500 shadow-md"
                    : (item.className || "border-transparent text-gray-300 hover:bg-gray-700 hover:text-white")
                )}
              >
                <item.icon size={18} className={cn(
                  "transition-colors",
                  isActive ? "text-white" : "text-gray-400 group-hover:text-white"
                )} />
                <span className="font-medium flex-1">{item.name}</span>
                {(item as any).badge > 0 && (
                  <span className="ml-auto bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {(item as any).badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-2 border-t border-gray-700 mt-auto">
          <button 
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-2.5 rounded text-sm font-medium text-gray-300 hover:bg-red-600 hover:text-white transition-all group"
          >
            <LogOut size={18} className="text-gray-400 group-hover:text-white" />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Navbar - Clean Modern */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-4">
             <div className="md:hidden flex items-center">
                <button
                  onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                  className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                >
                  <Menu size={24} />
                </button>
             </div>
             <p className="text-sm font-medium text-gray-500 hidden md:flex items-center gap-2">
               {schoolData?.logoUrl && <img src={schoolData.logoUrl} alt="Logo" className="w-24 h-24 object-contain" />}
               Beranda / <span className="text-gray-900 font-bold">{navItems.find(i => i.path === location.pathname)?.name || 'Dashboard'}</span>
             </p>
          </div>
          
          <div className="flex items-center gap-4">
              <ActiveAcademicYearDisplay />
              {user && user.roles && user.roles.length > 1 && (
                <div className="relative">
                  <button 
                    onClick={() => setShowRolesDropdown(!showRolesDropdown)}
                    className="text-[10px] bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-blue-200"
                  >
                    Pindah Peran <ChevronsDown size={12} />
                  </button>
                  {showRolesDropdown && (
                     <div className="absolute right-0 mt-2 bg-white p-2 rounded-lg shadow-lg border border-gray-200 z-50 w-40">
                        {user.roles.map(r => (
                           <button 
                             key={r} 
                             onClick={() => { switchRole(r); navigate(getRolePath(r)); setShowRolesDropdown(false); }}
                             className={cn("block w-full text-left p-2 text-xs font-medium hover:bg-gray-100 rounded", user.role === r ? "bg-gray-200" : "")}
                           >
                             {ROLE_LABELS[r]}
                           </button>
                        ))}
                     </div>
                  )}
                </div>
              )}
              {user?.role === 'TEACHER' && (
               <div className="relative flex items-center gap-2">
                 <button 
                  onClick={() => navigate('/teacher?tab=attendance')}
                  className="cursor-pointer hover:bg-gray-50 p-2 rounded-full transition-colors text-gray-400 hover:text-blue-600 outline-none relative"
                  title="Data Absensi Kelas"
                 >
                   <Database size={20} />
                   {pendingCount > 0 && (
                     <span className="absolute top-0 right-0 w-4 h-4 bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
                       {pendingCount}
                     </span>
                   )}
                 </button>
                 <button 
                  onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
                  className="relative cursor-pointer hover:bg-gray-50 p-2 rounded-full transition-colors group outline-none"
                 >
                   <BellRing size={20} className={cn("text-gray-400 group-hover:text-blue-600", notifications.length > 0 && "text-blue-600")} />
                   {notifications.length > 0 && (
                     <span className="absolute top-0 right-0 w-4 h-4 bg-red-600 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
                       {notifications.length}
                     </span>
                   )}
                 </button>

                 <AnimatePresence>
                   {showNotificationsDropdown && (
                     <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 origin-top-right"
                     >
                       <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                         <h3 className="font-bold text-sm text-gray-900">Notifikasi</h3>
                         <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{notifications.length} Baru</span>
                       </div>
                       <div className="max-h-[300px] overflow-y-auto">
                         {notifications.length === 0 ? (
                           <div className="p-6 text-center text-sm text-gray-400">Tidak ada notifikasi baru</div>
                         ) : (
                           <div className="divide-y divide-gray-50">
                             {notifications.map(notif => (
                               <div 
                                key={notif.id} 
                                onClick={() => {
                                  markAsRead(notif.id);
                                  setShowNotificationsDropdown(false);
                                  const route = notif.type === 'INQUIRY' ? '/teacher?tab=overview' : '/teacher?tab=attendance';
                                  if (window.location.pathname + window.location.search === route) {
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  } else {
                                    navigate(route);
                                  }
                                }}
                                className="p-4 hover:bg-blue-50/50 cursor-pointer transition-colors"
                               >
                                 <div className="flex items-start gap-3">
                                   <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold shrink-0 text-xs">
                                     {notif.studentName?.substring(0, 1) || '?'}
                                   </div>
                                   <div>
                                     <p className="text-sm font-bold text-gray-900">{notif.title || notif.studentName}</p>
                                     <p className="text-[11px] text-gray-500 line-clamp-3 mt-0.5">{notif.message}</p>
                                   </div>
                                 </div>
                               </div>
                             ))}
                           </div>
                         )}
                       </div>
                     </motion.div>
                   )}
                 </AnimatePresence>
               </div>
             )}
             <div className="hidden sm:flex flex-col items-end">
                <p className="text-xs font-bold text-gray-900">{user?.name}</p>
                <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">{ROLE_LABELS[user?.role as keyof typeof ROLE_LABELS] || user?.role}</p>
             </div>
             <div className="w-10 h-10 rounded-full border-2 border-gray-100 bg-blue-50 flex items-center justify-center text-blue-700 font-bold text-sm shadow-inner">
                {user?.name?.substring(0, 1) || 'U'}
             </div>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#f4f6f9] relative">
          {isLoading ? (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#f4f6f9]/80 backdrop-blur-sm">
              <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-full shadow-lg border border-gray-100">
                <Loader2 size={24} className="text-blue-600 animate-spin" />
                <span className="text-sm font-bold text-gray-700">Memuat Data...</span>
              </div>
            </div>
          ) : null}
          <div className="max-w-[1600px] mx-auto">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Outlet />
            </motion.div>
          </div>
        </div>

        {/* Global Notification Toast */}
        <AnimatePresence>
          {showNotificationToast && latestNotification && (
            <motion.div
              initial={{ opacity: 0, y: -50, x: 20 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-6 right-6 z-[100] w-[320px] bg-white rounded-2xl shadow-2xl border border-blue-100 overflow-hidden"
            >
              <div className="p-4 bg-blue-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BellRing size={16} className="animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{latestNotification.title || (latestNotification.type === 'INQUIRY' ? 'Inquiry Baru' : 'Pengajuan Izin Baru')}</span>
                </div>
                <button 
                  onClick={() => setShowNotificationToast(false)}
                  className="hover:bg-white/20 p-1 rounded-lg transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold shrink-0">
                    {latestNotification.studentName?.substring(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{latestNotification.title || latestNotification.studentName}</p>
                    <p className="text-[11px] text-gray-500 leading-relaxed mt-1">{latestNotification.message}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button 
                    onClick={() => {
                       markAsRead(latestNotification.id);
                       setShowNotificationToast(false);
                       const route = latestNotification.type === 'INQUIRY' ? '/teacher?tab=overview' : '/teacher?tab=attendance';
                       if (window.location.pathname + window.location.search === route) {
                         window.scrollTo({ top: 0, behavior: 'smooth' });
                       } else {
                         navigate(route);
                       }
                    }}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    Buka Dashboard
                  </button>
                  <button 
                    onClick={() => {
                       markAsRead(latestNotification.id);
                       setShowNotificationToast(false);
                    }}
                    className="px-3 py-2 bg-gray-50 text-gray-400 rounded-lg text-[10px] font-bold uppercase hover:bg-gray-100 transition-colors"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating AI Assistant */}
        <VirtualAssistant />
      </main>
    </div>
  );
}
