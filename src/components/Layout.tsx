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
  Key,
  X,
  ChevronsUp,
  ChevronsDown,
  Loader2,
  Menu,
  Star,
  Clock,
  TrendingUp
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ROLE_LABELS } from '../constants';
import ActiveAcademicYearDisplay from './ActiveAcademicYearDisplay';
import VirtualAssistant from './VirtualAssistant';
import { auth, db, handleFirestoreError } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { useAuthStore } from '../lib/auth-store';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, limit, getDocs } from 'firebase/firestore';
import { SchoolData, UserRole } from '../types';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, switchRole } = useAuthStore();
  const [showRolesDropdown, setShowRolesDropdown] = useState(false);
  const [showHeaderRolesDropdown, setShowHeaderRolesDropdown] = useState(false);

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

  const [schoolData, setSchoolData] = useState<SchoolData | null>(null);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    'DATA ADMINISTRASI': true,
    'DATA ABSENSI': false,
    'INPUT PETUGAS ABSENSI KELAS': false,
  });

  const toggleMenu = (name: string) => {
    setOpenMenus(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
  };

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'schoolData'), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setSchoolData(snapshot.docs[0].data() as SchoolData);
      }
    }, (error) => {
      console.error('Error fetching school data:', error);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    
    // Request Browser Notification Permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    let notifLoaded = false;
    const checkLoaded = () => {
      if (notifLoaded) setIsLoading(false);
    };

    let q: any;
    if (user.role === 'ADMIN') {
        q = query(
          collection(db, 'notifications'),
          where('targetRole', '==', 'ADMIN'),
          where('read', '==', false),
          orderBy('createdAt', 'desc')
        );
    } else if (user.role === 'PARENT') {
        // Find student ID first if not in user profile
        if (user.uid) {
            q = query(
              collection(db, 'notifications'),
              where('studentId', '==', user.uid), // In Login.tsx we set uid to studentDoc.id
              where('read', '==', false),
              orderBy('createdAt', 'desc')
            );
        }
    } else if (user.role === 'SUBJECT_TEACHER') {
        if (user.uid) {
            q = query(
              collection(db, 'notifications'),
              where('targetRole', '==', 'SUBJECT_TEACHER'),
              where('teacherId', '==', user.uid),
              where('read', '==', false),
              orderBy('createdAt', 'desc')
            );
        }
    } else {
        // Default for TEACHER (Wali Kelas)
        if (user.className) {
            q = query(
              collection(db, 'notifications'),
              where('className', '==', user.className),
              where('read', '==', false),
              orderBy('createdAt', 'desc')
            );
        }
    }

    if (!q) {
        setIsLoading(false);
        return;
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newNotifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (newNotifs.length > notifications.length && newNotifs.length > 0 && notifLoaded) {
        const latest = newNotifs[0] as any;
        setLatestNotification(latest);
        setShowNotificationToast(true);
        
        // Sound notification
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (e) {
          console.log('Audio init failed:', e);
        }

        // Browser Notification (System Notification)
        if (Notification.permission === 'granted') {
          new Notification(latest.title || 'Sistem Absensi', {
            body: latest.message,
            icon: '/icon.png'
          });
        }
        
        setTimeout(() => setShowNotificationToast(false), 10000);
      }
      setNotifications(newNotifs);
      notifLoaded = true;
      checkLoaded();
    }, (err) => {
      console.error("Notif fetch error:", err);
      notifLoaded = true;
      checkLoaded();
    });

    return () => {
      unsubscribe();
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
    { name: 'DASHBOARD', path: '/parent', icon: UserCircle, role: ['PARENT'] },
    { name: 'NOTIFIKASI', path: '/parent?view=notifications', icon: BellRing, role: ['PARENT'] },
    { name: 'RIWAYAT ABSENSI', path: '/parent?view=history', icon: ClipboardList, role: ['PARENT'] },
    { name: 'DASHBOARD', path: '/teacher?tab=overview', icon: LayoutGrid, role: ['TEACHER'] },
    { name: 'DATA SISWA', path: '/teacher?tab=students', icon: GraduationCap, role: ['TEACHER'], className: "text-blue-500 hover:text-blue-400" },
    { 
      name: 'INPUT GURU MAPEL', 
      path: '/subject-teacher', 
      icon: ClipboardList, 
      role: ['SUBJECT_TEACHER'],
      subItems: [
        { name: 'ABSENSI', path: '/subject-teacher?tab=attendance', icon: UserCheck, role: ['SUBJECT_TEACHER'] },
        { name: 'TANYA WALI KELAS', path: '/subject-teacher?tab=inquiry', icon: MessageSquare, role: ['SUBJECT_TEACHER'] },
        { name: 'LAPORAN HARIAN', path: '/subject-teacher?tab=history', icon: Clock, role: ['SUBJECT_TEACHER'] },
        { name: 'LAPORAN BULANAN', path: '/subject-teacher?tab=monthly', icon: Calendar, role: ['SUBJECT_TEACHER'] },
        { name: 'LAPORAN SEMESTER', path: '/subject-teacher?tab=semester', icon: Calendar, role: ['SUBJECT_TEACHER'] }
      ]
    },
    { name: 'DASHBOARD', path: '/admin?tab=overview', icon: LayoutGrid, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
    {
      name: 'DATA ADMINISTRASI',
      icon: Database,
      role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'],
      subItems: [
        { name: 'DATA SEKOLAH', path: '/admin?tab=school', icon: Building2, role: ['ADMIN', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'], className: "text-blue-500 hover:text-blue-400" },
        { name: 'DATA GURU', path: '/admin?tab=teachers-list', icon: Users, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'], className: "text-blue-500 hover:text-blue-400" },
        { name: 'DATA SISWA', path: '/admin?tab=students', icon: GraduationCap, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'], className: "text-blue-500 hover:text-blue-400" },
        { name: 'KELOLA PERAN GURU & PETUGAS', path: '/admin?tab=role-management-guru', icon: Users, role: ['ADMIN', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'], className: "text-blue-500 hover:text-blue-400" },
        { name: 'WALI KELAS', path: '/admin?tab=teachers', icon: Users, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'GURU BK', path: '/admin?tab=counselors', icon: Search, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'DATA GURU MAPEL', path: '/admin?tab=subject-teachers', icon: Users, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'DATA KELAS', path: '/admin?tab=classes', icon: FilePlus, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
      ]
    },
    { name: 'KEHADIRAN SISWA', path: '/school-presence', icon: UserCheck, role: ['ADMIN', 'TEACHER', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'], className: "text-slate-900 font-bold" },
    {
      name: 'DATA ABSENSI',
      icon: ClipboardList,
      role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH', 'TEACHER'],
      subItems: [
        { name: 'DATA ABSENSI', path: '/teacher?tab=attendance', icon: CheckCircle2, role: ['TEACHER'] },
        { name: 'RINGKASAN KEHADIRAN', path: '/admin?tab=attendance-summary', icon: LayoutGrid, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'RINGKASAN KEHADIRAN', path: '/teacher?tab=attendance-summary', icon: LayoutGrid, role: ['TEACHER'] },
        { name: 'DETAIL KETIDAKHADIRAN', path: '/admin?tab=attendance-detail', icon: ClipboardList, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'DETAIL KETIDAKHADIRAN', path: '/teacher?tab=attendance-detail', icon: ClipboardList, role: ['TEACHER'] },
        { name: 'REKAP ABSENSI PERBULAN', path: '/admin?tab=rekap', icon: FileText, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'REKAP ABSENSI PERBULAN', path: '/teacher?tab=rekap', icon: FileText, role: ['TEACHER'] },
        { name: 'REKAP ABSENSI SEMESTER', path: '/admin?tab=rekapSemester', icon: FileText, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'REKAP ABSENSI SEMESTER', path: '/teacher?tab=rekapSemester', icon: FileText, role: ['TEACHER'] },
        { name: 'ABSENSI INDIVIDUAL', path: '/admin?tab=attendance-individual', icon: UserCircle, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'ABSENSI INDIVIDUAL', path: '/teacher?tab=attendance-individual', icon: UserCircle, role: ['TEACHER'] },
        { name: 'LAPORAN GURU MAPEL', path: '/admin?tab=subject-attendance-report', icon: UserCheck, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'], className: "text-slate-900 font-bold" },
        { name: 'LAPORAN GURU MAPEL', path: '/teacher?tab=subject-attendance-report', icon: UserCheck, role: ['TEACHER'], className: "text-slate-900 font-bold" },
      ]
    },
    { 
      name: 'ABSENSI MANUAL', 
      path: '/teacher?tab=attendance&showAddModal=true', 
      icon: FilePlus, 
      role: ['TEACHER', 'ADMIN', 'WALI_KELAS'], 
      className: "text-slate-900 font-bold" 
    },
    {
      name: 'PETUGAS ABSENSI KELAS',
      icon: Users,
      role: ['ADMIN', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'],
      subItems: [
        { name: 'DAFTAR PETUGAS', path: '/attendance-officer?tab=officers', icon: Users, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'ABSENSI MANUAL', path: '/attendance-officer?tab=history', icon: ClipboardList, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
        { name: 'REKAP ABSENSI', path: '/attendance-officer?tab=rekap', icon: FileText, role: ['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
      ]
    },
    { name: 'PENGATURAN', path: '/admin?tab=settings', icon: Settings, role: ['ADMIN', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH'] },
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

      {/* Sidebar - Silver Professional Design */}
      <aside className={cn(
        "bg-[#A8ADB6] flex flex-col shadow-xl z-50 overflow-y-auto transition-transform duration-300 md:relative fixed inset-y-0 left-0 w-80",
        isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="h-24 flex items-center px-6 border-b border-blue-100 shrink-0 bg-blue-50/50">
          <div className="flex items-center gap-4 text-blue-900">
            {schoolData?.schoolLogoUrl ? (
              <img src={schoolData.schoolLogoUrl} alt="Logo Sekolah" className="w-12 h-12 object-contain" />
            ) : (
              <School size={42} className="text-blue-600" />
            )}
            <div className="overflow-hidden">
              <h1 className="text-sm font-black leading-tight truncate">{schoolData?.sekolah || 'SMPN 2 MAGELANG'}</h1>
              <p className="text-[9px] text-blue-500 uppercase tracking-widest font-black opacity-90">Sistem Absensi</p>
            </div>
          </div>
        </div>

        {/* User Info Sidebar with Blue Gradient */}
        <div className="p-4 border-b border-blue-800 flex items-center gap-3 shrink-0 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-black text-sm shadow-inner shrink-0 outline outline-2 outline-white/30 backdrop-blur-sm">
            {user?.name?.substring(0, 1) || 'A'}
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-black text-white truncate drop-shadow-sm uppercase tracking-tight">{user?.name || 'Administrator'}</p>
            <div className="flex items-center gap-1 pl-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse ring-2 ring-red-200/50"></div>
              <p className="text-[9px] text-blue-100 uppercase font-black tracking-widest opacity-80">Online</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2 mt-2 space-y-1">
          <p className="px-4 py-2 text-[10px] font-black text-yellow-400 uppercase tracking-widest drop-shadow-sm">Menu Utama</p>
          {filteredNavItems.map((item) => {
            const isActive = item.path && (location.pathname + location.search === item.path || 
                           (location.pathname === item.path && item.path.indexOf('?') === -1) ||
                           (item.path.includes('role-management') && location.search.includes('role-management')));

            if (item.subItems) {
               const isOpen = openMenus[item.name] || false;
               return (
                <div key={`nav-group-${item.name}`}>
                  <button
                    onClick={() => toggleMenu(item.name)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 rounded text-sm transition-all text-slate-900 hover:bg-black/5 hover:text-indigo-700"
                  >
                    {item.icon ? (
                      <item.icon size={18} className="text-slate-700" />
                    ) : (
                      <Settings size={18} className="text-slate-700" />
                    )}
                    <span className="font-bold flex-1 text-left" onClick={(e) => { e.stopPropagation(); toggleMenu(item.name); }}>{item.name}</span>
                    {isOpen ? <ChevronsUp size={16} /> : <ChevronsDown size={16} />}
                  </button>
                  {isOpen && (
                    <div className="pl-4 space-y-1">
                      {item.subItems.map((sub) => {
                        const isSubActive = location.pathname + location.search === sub.path || 
                                           (location.pathname === sub.path && sub.path.indexOf('?') === -1);
                        return (
                          <Link
                            key={`sub-nav-${item.name}-${sub.name}`}
                            to={sub.path!}
                            onClick={() => setIsMobileSidebarOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-4 py-2 rounded text-xs transition-all border-l-4",
                              isSubActive
                                ? "bg-white text-indigo-700 border-indigo-700 font-black shadow-sm"
                                : (sub.className || "border-transparent text-slate-900 hover:bg-black/5 hover:text-indigo-700 font-bold")
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
                key={`nav-item-${item.name}-${item.path}`}
                to={item.path!}
                onClick={() => setIsMobileSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded text-sm transition-all group border-l-4",
                  isActive
                    ? "bg-white text-indigo-700 border-indigo-700 shadow-md font-black"
                    : (item.className || "border-transparent text-slate-900 hover:bg-black/5 hover:text-indigo-700 font-bold")
                )}
              >
                <item.icon size={18} className={cn(
                  "transition-colors",
                  isActive ? "text-indigo-700" : "text-slate-700 group-hover:text-indigo-700"
                )} />
                <span className="flex-1">{item.name}</span>
                {/* No badge for pendingCount */}
              </Link>
            );
          })}

        </nav>

        <div className="p-2 border-t border-slate-400/30 mt-auto space-y-2">
          {/* Fitur Perpindahan Peran UI */}
          <div className="relative">
            <button 
              onClick={() => setShowRolesDropdown(!showRolesDropdown)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm bg-indigo-600 border border-indigo-500 shadow-sm text-white hover:bg-indigo-700 hover:border-indigo-600 transition-all group"
            >
               <div className="flex items-center gap-2">
                 <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center shrink-0">
                    <UserCheck size={14} className="text-white group-hover:scale-110 transition-transform" />
                 </div>
                 <div className="text-left flex flex-col">
                    <span className="text-xs font-black uppercase tracking-wider text-indigo-50">Fitur Pindah Peran</span>
                    <span className="text-[10px] font-medium text-indigo-200">
                      {user?.roles?.length ? `${user.roles.length} Peran Tersedia` : '1 Peran Tersedia'}
                    </span>
                 </div>
               </div>
               <ChevronsDown size={16} className={cn("text-indigo-200 transition-transform", showRolesDropdown && "rotate-180")} />
            </button>
            
            <AnimatePresence>
              {showRolesDropdown && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute bottom-[calc(100%+8px)] left-0 w-full bg-white rounded-xl shadow-2xl border border-indigo-100 p-2 z-50 origin-bottom"
                >
                   <div className="flex items-center justify-between px-2 py-1.5 mb-1 bg-indigo-50/50 rounded-lg">
                      <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Pilih Peran Anda</p>
                      <button onClick={() => setShowRolesDropdown(false)} className="text-indigo-400 hover:text-indigo-600"><X size={14} /></button>
                   </div>
                   
                   {!user?.roles || user.roles.length <= 1 ? (
                      <div className="p-3 text-center">
                        <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-2 border border-gray-100">
                           <IdCard size={18} className="text-gray-400" />
                        </div>
                        <p className="text-xs font-bold text-gray-700">Tidak ada peran lain</p>
                        <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">Akun Anda hanya memiliki 1 peran. Hubungi Administrator jika Anda membutuhkan peran tambahan.</p>
                      </div>
                   ) : (
                     <div className="space-y-1 max-h-[200px] overflow-y-auto">
                       {Array.from(new Set(user.roles)).map((r: any, i) => {
                          const isCurrent = user?.role === r;
                          return (
                            <button 
                              key={`sidebar-role-switch-${r}-${i}`} 
                              onClick={() => { switchRole(r as any); navigate(getRolePath(r as any)); setShowRolesDropdown(false); setIsMobileSidebarOpen(false); }}
                              className={cn(
                                "flex items-center gap-3 w-full text-left p-3 text-xs font-bold rounded-lg transition-all group", 
                                isCurrent 
                                  ? "bg-indigo-600 text-white shadow-md" 
                                  : "text-gray-700 hover:bg-indigo-50 border border-transparent hover:border-indigo-100"
                              )}
                            >
                              <div className={cn("w-6 h-6 rounded flex items-center justify-center shrink-0", isCurrent ? "bg-white/20" : "bg-gray-100 group-hover:bg-indigo-100")}>
                                {isCurrent ? <CheckCircle2 size={14} className="text-white" /> : <UserCircle size={14} className="text-gray-500 group-hover:text-indigo-600" />}
                              </div>
                              <span className="flex-1">{ROLE_LABELS[r as keyof typeof ROLE_LABELS]}</span>
                              {isCurrent && <span className="text-[9px] bg-white text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-widest font-black">Aktif</span>}
                            </button>
                          );
                       })}
                     </div>
                   )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-3 px-4 py-2.5 rounded-lg text-sm font-black uppercase tracking-wider text-slate-700 hover:bg-red-600 hover:text-white transition-all group border border-transparent hover:border-red-500"
          >
            <LogOut size={16} className="text-slate-500 group-hover:text-white" />
            Keluar Aplikasi
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Navbar - Clean Modern */}
        <header className="h-24 bg-sky-600 border-b border-sky-700 flex items-center justify-between px-6 z-10 shadow-sm">
          <div className="flex items-center gap-4">
             <div className="md:hidden flex items-center">
                <button
                  onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                  className="p-2 -ml-2 text-white hover:bg-sky-700 rounded-lg"
                >
                  <Menu size={24} />
                </button>
             </div>
             <div className="text-sm font-medium text-sky-100 hidden md:flex items-center gap-3">
               <img 
                 src="https://i.ibb.co.com/C5SL3dTB/logo-dutatama.png" 
                 alt="Dutatama Logo" 
                 className="h-8 w-auto object-contain"
                 referrerPolicy="no-referrer"
               />
               <span className="h-6 w-[1px] bg-sky-400/50 mx-1"></span>
               <p className="flex items-center gap-2">
                 Beranda / <span className="text-white font-bold">{navItems.find(i => i.path === location.pathname)?.name || 'Dashboard'}</span>
               </p>
             </div>
          </div>
          
          <div className="flex items-center gap-4">
              <ActiveAcademicYearDisplay />
              
              {(user?.role === 'TEACHER' || user?.role === 'ADMIN') && (
               <div className="relative flex items-center gap-2">
                 <button 
                  onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
                  className="relative cursor-pointer hover:bg-sky-500 p-1.5 rounded-full transition-colors group outline-none"
                 >
                   <BellRing size={16} className={cn("text-sky-100 group-hover:text-white", notifications.length > 0 && "text-white")} />
                   {notifications.length > 0 && (
                     <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full border border-sky-600">
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
                                key={`notif-dropdown-${notif.id}`} 
                                onClick={() => {
                                  markAsRead(notif.id);
                                  setShowNotificationsDropdown(false);
                                  let route = '/';
                                  if (user?.role === 'ADMIN') route = '/admin';
                                  else if (user?.role === 'PARENT') route = '/parent?view=history';
                                  else if (user?.role === 'SUBJECT_TEACHER') route = '/subject-teacher?tab=inquiry';
                                  else {
                                    route = notif.type === 'INQUIRY' ? '/teacher?tab=overview' : '/teacher?tab=attendance';
                                  }
                                  
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
                {user?.roles && user.roles.length > 1 && (
                  <button 
                    onClick={() => setShowHeaderRolesDropdown(!showHeaderRolesDropdown)}
                    className="hidden lg:flex items-center gap-2 px-3 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 rounded-xl border border-indigo-200 transition-all group mr-3"
                  >
                    <UserCircle size={14} className="text-indigo-600 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">Perpindahan Peran</span>
                    <ChevronsDown size={12} className={cn("text-indigo-400 transition-transform", showHeaderRolesDropdown && "rotate-180")} />
                  </button>
                )}
                <p className="text-xs font-bold text-white">{user?.name}</p>
                <p className="text-[10px] text-sky-200 font-bold uppercase tracking-widest">
                  {ROLE_LABELS[user?.role as keyof typeof ROLE_LABELS] || user?.role}
                  {user?.role === 'TEACHER' && user?.className ? ` ${user.className}` : ''}
                </p>
             </div>
             <div className="relative">
               <button 
                 onClick={() => setShowHeaderRolesDropdown(!showHeaderRolesDropdown)}
                 className="flex items-center gap-2"
               >
                 <div className="w-10 h-10 rounded-full border-2 border-sky-400/30 bg-sky-500 flex items-center justify-center text-white font-bold text-sm shadow-inner cursor-pointer hover:bg-sky-400 transition-colors">
                    {user?.name?.substring(0, 1) || 'U'}
                 </div>
               </button>

               <AnimatePresence>
                 {showHeaderRolesDropdown && (
                   <motion.div 
                     initial={{ opacity: 0, y: 10, scale: 0.95 }}
                     animate={{ opacity: 1, y: 0, scale: 1 }}
                     exit={{ opacity: 0, y: 10, scale: 0.95 }}
                     className="absolute top-[calc(100%+8px)] right-0 w-64 bg-white rounded-xl shadow-2xl border border-indigo-100 p-2 z-50 origin-top-right text-left"
                   >
                     <div className="flex items-center justify-between px-2 py-1.5 mb-1 bg-indigo-50/50 rounded-lg whitespace-nowrap">
                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Pilih Peran Anda</p>
                        <button onClick={() => setShowHeaderRolesDropdown(false)} className="text-indigo-400 hover:text-indigo-600"><X size={14} /></button>
                     </div>
                     
                     {!user?.roles || user.roles.length <= 1 ? (
                        <div className="p-3 text-center">
                          <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-2 border border-gray-100">
                             <IdCard size={18} className="text-gray-400" />
                          </div>
                          <p className="text-xs font-bold text-gray-700">Tidak ada peran lain</p>
                          <p className="text-[10px] text-gray-500 mt-1 leading-relaxed whitespace-nowrap">Akun Anda hanya memiliki 1 peran.</p>
                        </div>
                     ) : (
                       <div className="space-y-1 max-h-[200px] overflow-y-auto">
                         {Array.from(new Set(user.roles || [])).map((r: any, i) => {
                            const isCurrent = user?.role === r;
                            return (
                              <button 
                                key={`header-role-switch-${r}-${i}`} 
                                onClick={() => { switchRole(r as any); navigate(getRolePath(r as any)); setShowHeaderRolesDropdown(false); setIsMobileSidebarOpen(false); }}
                                className={cn(
                                  "flex items-center gap-3 w-full text-left p-3 text-xs font-bold rounded-lg transition-all group whitespace-nowrap", 
                                  isCurrent 
                                    ? "bg-indigo-600 text-white shadow-md" 
                                    : "text-gray-700 hover:bg-indigo-50 border border-transparent hover:border-indigo-100"
                                )}
                              >
                                <div className={cn("w-6 h-6 rounded flex items-center justify-center shrink-0", isCurrent ? "bg-white/20" : "bg-gray-100 group-hover:bg-indigo-100")}>
                                  {isCurrent ? <CheckCircle2 size={14} className="text-white" /> : <UserCircle size={14} className="text-gray-500 group-hover:text-indigo-600" />}
                                </div>
                                <span className="flex-1">{ROLE_LABELS[r as keyof typeof ROLE_LABELS]}</span>
                                {isCurrent && <span className="text-[9px] bg-white text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-widest font-black">Aktif</span>}
                              </button>
                            );
                         })}
                       </div>
                     )}
                   </motion.div>
                 )}
               </AnimatePresence>
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
                  <span className="text-[10px] font-bold uppercase tracking-wider">{latestNotification.title || (latestNotification.type === 'INQUIRY' ? 'Tanya Wali Kelas Baru' : 'Pengajuan Izin Baru')}</span>
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
                       let route = '/';
                       if (user?.role === 'ADMIN') route = '/admin';
                       else if (user?.role === 'PARENT') route = '/parent?view=history';
                       else if (user?.role === 'SUBJECT_TEACHER') route = '/subject-teacher?tab=inquiry';
                       else {
                         route = latestNotification.type === 'INQUIRY' ? '/teacher?tab=overview' : '/teacher?tab=attendance';
                       }

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
