import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, getDocs, addDoc } from 'firebase/firestore';
import { useAuthStore } from '../lib/auth-store';
import { MessageCircle, CheckCircle2, Clock, Calendar, FileText, User, Bell, BellRing, X } from 'lucide-react';
import { Student, AttendanceRecord } from '../types';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';
import SimpleNotification from '../components/SimpleNotification';
import { getTenantCollection, getTenantDoc } from '../lib/tenant';
import RoleSwitcher from '../components/RoleSwitcher';
import AttendanceAlertsDisplay from '../components/AttendanceAlertsDisplay';
import PresenceMonthlyReport from '../components/PresenceMonthlyReport';
import AttendanceRecapTable from '../components/AttendanceRecapTable';
import SemesterAttendanceRecapTable from '../components/SemesterAttendanceRecapTable';
import { handleFirestoreError } from '../lib/firebase';

export default function HomeroomTeacherDashboard() {
  const { user } = useAuthStore();
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [presence, setPresence] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'inquiry' | 'monitoring' | 'monthly' | 'semester'>('inquiry');
  const [notifications, setNotifications] = useState<any[]>([]);

  const [showNotifications, setShowNotifications] = useState(false);
  const [toastNotif, setToastNotif] = useState<{title: string, message: string} | null>(null);
  const isInitialNotif = React.useRef(true);

  useEffect(() => {
    if (!user || (!user.className && !user.uid)) return;
    
    // Homeroom teacher listens for notifications for their class OR targeted to them
    const qClass = query(
        getTenantCollection('notifications'),
        where('className', '==', user.className || ''),
        where('targetRole', '==', 'TEACHER'),
        orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(qClass, (snapshot) => {
        const newNotifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setNotifications(newNotifs);

        if (isInitialNotif.current) {
            isInitialNotif.current = false;
            return;
        }

        // Show toast for new unread notifications
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                if (!data.read) {
                    setToastNotif({ 
                        title: data.title || 'Notifikasi Baru', 
                        message: data.message || 'Ada pesan baru untuk Anda' 
                    });
                    // Auto-hide toast after 5s
                    setTimeout(() => setToastNotif(null), 5000);
                }
            }
        });
    }, (error) => handleFirestoreError(error, 'list', 'notifications'));
    
    return unsubscribe;
  }, [user]);

  const markAllRead = async () => {
    try {
        const unread = notifications.filter(n => !n.read);
        for (const n of unread) {
            await updateDoc(getTenantDoc('notifications', n.id), { read: true });
        }
    } catch (err) {
        console.error("Error marking all read:", err);
    }
  };

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
        setLoading(true);

        let className = user?.className;

        if (!className) {
            // Try to find the class assigned to this teacher
            const classQuery = query(getTenantCollection('classes'), where('waliKelasId', '==', user?.uid));
            const classSnap = await getDocs(classQuery);
            if (!classSnap.empty) {
                className = classSnap.docs[0].data().name;
            }
        }

        if (!className) {
            setLoading(false);
            return;
        }

        try {
            // Fetch inquiries
            const q = query(
                getTenantCollection('subjectInquiries'),
                where('className', '==', className),
                orderBy('createdAt', 'desc')
            );
            
            // Fetch students
            const stdQ = query(
                getTenantCollection('students'),
                where('className', '==', className)
            );

            // Fetch school presence logs
            const presQuery = query(
                getTenantCollection('schoolPresence'),
                where('className', '==', className)
            );

            // Fetch absenteeism (attendance collection)
            const attQ = query(
                getTenantCollection('attendance'),
                where('className', '==', className)
            );

            const [inqSnap, stdSnap, presSnap, attSnap] = await Promise.all([
                getDocs(q),
                getDocs(stdQ),
                getDocs(presQuery),
                getDocs(attQ)
            ]);
            
            setInquiries(inqSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setStudents(stdSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
            setPresence(presSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setAttendance(attSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord)));
        } catch (err) {
            console.error("Error fetching dashboard data:", err);
        } finally {
            setLoading(false);
        }
    }
    fetchData();
  }, [user]);

  const handleReply = async (id: string, response: string) => {
    try {
      const inq = inquiries.find(i => i.id === id);
      await updateDoc(getTenantDoc('subjectInquiries', id), {
        response,
        respondedBy: user?.name,
        respondedAt: serverTimestamp(),
        status: 'Sudah di Jawab'
      });

      if (inq) {
        // Notify Subject Teacher
        await addDoc(getTenantCollection('notifications'), {
          targetUserId: inq.subjectTeacherId,
          targetRole: 'SUBJECT_TEACHER', // Special role or just use ID
          title: '💬 Jawaban Wali Kelas',
          message: `Wali Kelas (${user?.name}) telah menjawab pertanyaan Anda untuk ${inq.studentName}: ${response}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      // Update local state
      setInquiries(prev => prev.map(inq => inq.id === id ? { ...inq, response, respondedBy: user?.name, status: 'Sudah di Jawab' } : inq));
    } catch (err) {
      handleFirestoreError(err, 'update', 'subjectInquiries');
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
         <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-100">
               <User size={32} />
            </div>
            <div>
               <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight leading-none">Selamat Datang, {user?.name}</h2>
               <div className="flex flex-col gap-2 mt-2">
                 <div className="flex items-center gap-3">
                   <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
                     <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                     <span className="text-[10px] font-black text-green-700 uppercase tracking-widest">Online</span>
                   </div>
                   <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
                   <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Wali Kelas {user?.className || 'N/A'}</p>
                 </div>
                 <p className="text-sm text-gray-500 font-medium">
                   Panel manajemen kehadiran dan pemantauan aktivitas siswa kelas {user?.className || 'N/A'}. 
                 </p>
               </div>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <div className="relative">
                <button 
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="p-3 bg-gray-50 text-gray-600 rounded-2xl hover:bg-gray-100 transition-all border border-gray-100 relative"
                >
                    {notifications.filter(n => !n.read).length > 0 ? <BellRing className="text-blue-600" size={24} /> : <Bell size={24} />}
                    {notifications.filter(n => !n.read).length > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full font-black animate-bounce border-2 border-white">
                            {notifications.filter(n => !n.read).length}
                        </span>
                    )}
                </button>

                {showNotifications && (
                    <div className="absolute right-0 mt-3 w-80 bg-white rounded-3xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                        <div className="p-5 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Notifikasi</h4>
                            <button 
                                onClick={markAllRead}
                                className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-wide"
                            >
                                Baca Semua
                            </button>
                        </div>
                        <div className="max-h-96 overflow-y-auto custom-scrollbar">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center">
                                    <Bell size={32} className="mx-auto text-gray-200 mb-2" />
                                    <p className="text-gray-400 text-[10px] font-bold uppercase">Belum ada notifikasi</p>
                                </div>
                            ) : (
                                notifications.map((n, i) => (
                                    <div 
                                        key={`homeroom-notif-${n.id || i}`} 
                                        className={cn(
                                            "p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors flex gap-3 relative",
                                            !n.read && "bg-blue-50/30"
                                        )}
                                        onClick={async () => {
                                            if(!n.read) await updateDoc(getTenantDoc('notifications', n.id), { read: true });
                                        }}
                                    >
                                        {!n.read && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}
                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                                            <Bell size={14} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-gray-900 leading-tight mb-1">{n.title}</p>
                                            <p className="text-[11px] text-gray-600 leading-relaxed font-medium">{n.message}</p>
                                            <p className="text-[9px] text-gray-400 font-bold mt-1 uppercase">
                                                {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
            <RoleSwitcher />
         </div>
      </div>

      {toastNotif && (
        <div className="fixed top-24 right-6 z-[100] max-w-sm">
            <SimpleNotification 
                title={toastNotif.title}
                message={toastNotif.message}
                onClose={() => setToastNotif(null)}
            />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 bg-gray-100/50 p-1.5 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('inquiry')}
          className={cn(
            "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2",
            activeTab === 'inquiry' ? "bg-gray-800 text-white shadow-md" : "text-gray-400 hover:text-gray-600"
          )}
        >
          <MessageCircle size={16} /> Tanya Wali
        </button>
        <button 
          onClick={() => setActiveTab('monitoring')}
          className={cn(
            "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 border-2",
            activeTab === 'monitoring' ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200" : "border-blue-600 text-blue-600 hover:bg-blue-50"
          )}
        >
          <Clock size={16} /> Monitoring Harian
        </button>
        <button 
          onClick={() => setActiveTab('monthly')}
          className={cn(
            "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 border-2",
            activeTab === 'monthly' ? "bg-green-600 border-green-600 text-white shadow-md shadow-green-200" : "border-green-600 text-green-600 hover:bg-green-50"
          )}
        >
          <Calendar size={16} /> Laporan Bulanan
        </button>
        <button 
          onClick={() => setActiveTab('semester')}
          className={cn(
            "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 border-2",
            activeTab === 'semester' ? "bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-200" : "border-purple-600 text-purple-600 hover:bg-purple-50"
          )}
        >
          <FileText size={16} /> Laporan Semester
        </button>
      </div>

      <AttendanceAlertsDisplay />

      {activeTab === 'inquiry' && (
        <div className="grid gap-4">
           <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-2">Pertanyaan Siswa</h3>
           {inquiries.length === 0 ? (
             <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-gray-200">
                <p className="text-gray-400 font-bold">Belum ada pertanyaan</p>
             </div>
           ) : (
            inquiries.map(inq => (
              <div key={`homeroom-inq-${inq.id}`} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-blue-200 transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-black text-gray-900">{inq.studentName}</p>
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">{inq.subjectName}</p>
                    <p className="text-sm text-gray-600 leading-relaxed font-medium">{inq.message}</p>
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                    inq.status === 'Sudah di Jawab' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                  )}>
                    {inq.status}
                  </span>
                </div>
                {inq.status === 'Menunggu' && (
                  <div className="mt-4 flex flex-col sm:flex-row gap-2">
                    <textarea 
                        placeholder="Tulis balasan di sini..." 
                        className="flex-1 p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" 
                        id={`reply-${inq.id}`}
                        rows={2}
                    />
                    <button 
                      onClick={() => {
                        const input = document.getElementById(`reply-${inq.id}`) as HTMLTextAreaElement;
                        if(input.value) handleReply(inq.id, input.value);
                      }}
                      className="bg-blue-600 text-white px-6 py-2 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 h-fit self-end flex items-center gap-2"
                    >
                      <CheckCircle2 size={16} /> Kirim
                    </button>
                  </div>
                )}
                {inq.response && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100 relative">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l-xl"></div>
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <Clock size={12} /> Balasan
                    </p>
                    <p className="text-sm text-gray-700 font-medium leading-relaxed">{inq.response}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-2 tracking-wide">Oleh {inq.respondedBy}</p>
                  </div>
                )}
              </div>
            ))
           )}
        </div>
      )}

      {activeTab === 'monitoring' && (
        <PresenceMonthlyReport students={students} presence={presence} />
      )}

      {activeTab === 'monthly' && (
        <AttendanceRecapTable students={students} attendance={attendance} />
      )}

      {activeTab === 'semester' && (
        <SemesterAttendanceRecapTable students={students} attendance={attendance} />
      )}
    </div>
  );
}

