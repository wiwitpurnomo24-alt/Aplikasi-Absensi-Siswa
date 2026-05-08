import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { useAuthStore } from '../lib/auth-store';
import { MessageCircle, CheckCircle2, Clock, Calendar, FileText, User } from 'lucide-react';
import { handleFirestoreError } from '../lib/firebase';
import AttendanceAlertsDisplay from '../components/AttendanceAlertsDisplay';
import RoleSwitcher from '../components/RoleSwitcher';
import { checkAttendanceAlert } from '../services/attendanceNotificationService';
import PresenceMonthlyReport from '../components/PresenceMonthlyReport';
import PresenceSemesterReport from '../components/PresenceSemesterReport';
import AttendanceRecapTable from '../components/AttendanceRecapTable';
import SemesterAttendanceRecapTable from '../components/SemesterAttendanceRecapTable';
import { Student, AttendanceRecord } from '../types';
import { cn } from '../lib/utils';
import Loading from '../components/Loading';
import { getTenantCollection, getTenantDoc } from '../lib/tenant';

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

  useEffect(() => {
    if (!user || !user.className) return;
    
    const q = query(
        getTenantCollection('notifications'),
        where('className', '==', user.className),
        orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    return unsubscribe;
  }, [user]);

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
      await updateDoc(getTenantDoc('subjectInquiries', id), {
        response,
        respondedBy: user?.name,
        respondedAt: serverTimestamp(),
        status: 'Sudah di Jawab'
      });
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
         <RoleSwitcher />
      </div>

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

