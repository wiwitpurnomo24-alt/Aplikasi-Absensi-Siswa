import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ClipboardList, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Send,
  Users,
  Calendar,
  MessageSquare,
  HelpCircle,
  FileText,
  UserCheck,
  Save,
  Download
} from 'lucide-react';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  Timestamp,
  updateDoc,
  doc
} from 'firebase/firestore';
import { cn, formatDate } from '../lib/utils';
import { useAuthStore } from '../lib/auth-store';
import { Student, SchoolClass, SubjectTeacherInquiry, SubjectAttendance } from '../types';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function SubjectTeacherDashboard() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'attendance' | 'inquiry' | 'history'>('attendance');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [inquiries, setInquiries] = useState<SubjectTeacherInquiry[]>([]);
  const [subjectAttendances, setSubjectAttendances] = useState<SubjectAttendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectName, setSubjectName] = useState('');

  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, onConfirm: () => void}>({isOpen: false, message: '', onConfirm: () => {}});
  const showConfirm = (message: string, onConfirm: () => void) => setConfirmDialog({isOpen: true, message, onConfirm});
  const [period, setPeriod] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [message, setMessage] = useState('');
  const [replyMessages, setReplyMessages] = useState<Record<string, string>>({});

  const handleReply = async (id: string, response: string) => {
    try {
      await updateDoc(doc(db, 'subjectInquiries', id), {
        response,
        respondedBy: user?.name,
        respondedAt: serverTimestamp(),
        status: 'Sudah di Jawab'
      });
      setReplyMessages(prev => ({ ...prev, [id]: '' }));
    } catch (err: any) {
      handleFirestoreError(err, 'update', 'subjectInquiries');
    }
  };

  const handleUpdateHistoryNotes = async (id: string, notes: string) => {
    try {
      await updateDoc(doc(db, 'subjectAttendance', id), {
        notes: notes
      });
    } catch (err: any) {
      handleFirestoreError(err, 'update', 'subjectAttendance');
    }
  };

  // Filters for History
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterClass, setFilterClass] = useState('All');

  // Attendance state for mass input
  const [attendanceData, setAttendanceData] = useState<Record<string, { status: 'S' | 'I' | 'D' | 'A' | 'H', notes: string }>>({});

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const q = query(collection(db, 'classes'), orderBy('name', 'asc'));
        const snapshot = await getDocs(q);
        setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolClass)));
      } catch (err: any) {
        handleFirestoreError(err, 'list', 'classes');
      }
    };
    fetchClasses();

    if (!user || !auth.currentUser) return;
    
    // Listen to inquiries
    const qInq = query(
      collection(db, 'subjectInquiries'),
      where('subjectTeacherName', '==', user?.name || ''),
      orderBy('createdAt', 'desc')
    );
    
    const unsubInq = onSnapshot(qInq, (snapshot) => {
      setInquiries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubjectTeacherInquiry)));
    }, (err) => {
      handleFirestoreError(err, 'list', 'subjectInquiries');
    });

    // Listen to subject attendance logs
    const qAtt = query(
      collection(db, 'subjectAttendance'),
      where('teacherName', '==', user?.name || ''),
      orderBy('createdAt', 'desc')
    );

    const unsubAtt = onSnapshot(qAtt, (snapshot) => {
      setSubjectAttendances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubjectAttendance)));
    }, (err) => {
      handleFirestoreError(err, 'list', 'subjectAttendance');
    });

    return () => {
      unsubInq();
      unsubAtt();
    };
  }, [user, auth.currentUser]);

  useEffect(() => {
    if (selectedClass) {
      const fetchStudents = async () => {
        setLoading(true);
        try {
          const q = query(collection(db, 'students'), where('className', '==', selectedClass), orderBy('name', 'asc'));
          const snapshot = await getDocs(q);
          const studentList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
          setStudents(studentList);
          
          // Reset attendance data for all students in new class
          const initialData: Record<string, { status: 'S' | 'I' | 'D' | 'A' | 'H', notes: string }> = {};
          studentList.forEach(s => {
            initialData[s.id] = { status: 'H', notes: '' };
          });
          setAttendanceData(initialData);
        } catch (err: any) {
          handleFirestoreError(err, 'list', 'students in class');
        } finally {
          setLoading(false);
        }
      };
      fetchStudents();
    } else {
      setStudents([]);
      setAttendanceData({});
    }
  }, [selectedClass]);

  const handleUpdateAttendance = (studentId: string, status: 'S' | 'I' | 'D' | 'A' | 'H') => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], status }
    }));
  };

  const handleUpdateNotes = (studentId: string, notes: string) => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], notes }
    }));
  };

  const handleSubmitAttendance = () => {
    if (!selectedClass || !subjectName || !period) {
      alert("Harap lengkapi kelas, mata pelajaran, dan jam ke!");
      return;
    }

    showConfirm(`Kirim absensi untuk kelas ${selectedClass}?`, async () => {
      setSubmitting(true);
      try {
        const entries = Object.entries(attendanceData);
        const today = new Date().toISOString().split('T')[0];

        for (const [studentId, data] of entries as [string, { status: 'S' | 'I' | 'D' | 'A' | 'H', notes: string }][]) {
          const student = students.find(s => s.id === studentId);
          if (!student) continue;

          const attendanceEntry: Omit<SubjectAttendance, 'id'> = {
            studentId,
            studentName: student.name,
            className: selectedClass,
            subjectName,
            teacherName: user?.name || 'Guru Mapel',
            date: today,
            period,
            status: data.status,
            notes: data.notes,
            createdAt: serverTimestamp()
          };

          await addDoc(collection(db, 'subjectAttendance'), attendanceEntry);

          if (data.status === 'A') {
            await addDoc(collection(db, 'notifications'), {
              className: selectedClass,
              studentName: student.name,
              studentId: student.id,
              teacherName: user?.name || 'Guru Mapel',
              subjectName,
              period,
              message: `${student.name} ALPA (Tanpa Keterangan) pada jam ke ${period} mata pelajaran ${subjectName}.`,
              title: `Laporan Siswa Alpa - ${selectedClass}`,
              read: false,
              type: 'INQUIRY',
              createdAt: serverTimestamp()
            });
          }
        }

        alert('Absensi mata pelajaran berhasil disimpan.');
        // Optional: clear form
        setPeriod('');
      } catch (err: any) {
        handleFirestoreError(err, 'create', 'subjectAttendance');
      } finally {
        setSubmitting(false);
      }
    });
  };

  const handleSubmitInquiry = async () => {
    if (!selectedStudent || !subjectName || !period || !message) {
      alert("Harap lengkapi semua data mata pelajaran, jam ke, dan pesan!");
      return;
    }
    
    setSubmitting(true);
    try {
      const inquiryData: Omit<SubjectTeacherInquiry, 'id'> = {
        subjectTeacherName: user?.name || 'Guru Mapel',
        subjectName,
        className: selectedClass,
        studentId: selectedStudent.id,
        studentName: selectedStudent.name,
        date: new Date().toISOString().split('T')[0],
        period,
        status: 'Menunggu',
        message: message,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'subjectInquiries'), inquiryData);
      
      // Also notify Wali Kelas via notifications collection
      await addDoc(collection(db, 'notifications'), {
        className: selectedClass,
        studentName: selectedStudent.name,
        studentId: selectedStudent.id,
        teacherName: user?.name || 'Guru Mapel',
        subjectName: subjectName,
        period: period,
        message: `${user?.name} (Guru ${subjectName}) bertanya: ${selectedStudent.name} tidak ada di kelas tanpa keterangan.`,
        title: `Laporan Siswa Tidak Hadir - ${selectedClass}`,
        read: false,
        type: 'INQUIRY',
        createdAt: serverTimestamp()
      });

      setShowModal(false);
      setSelectedStudent(null);
      setMessage('');
      alert('Informasi berhasil dikirim ke Wali Kelas.');
    } catch (err: any) {
      handleFirestoreError(err, 'create', 'subjectInquiry');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredHistory = subjectAttendances.filter(att => {
    const matchesDate = !filterDate || att.date === filterDate;
    const matchesStatus = filterStatus === 'All' || att.status === filterStatus;
    const matchesClass = filterClass === 'All' || att.className === filterClass;
    return matchesDate && matchesStatus && matchesClass;
  });

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Laporan Absensi Mata Pelajaran - ${user?.name}`, 14, 15);
    doc.text(`Tanggal: ${filterDate || 'Semua'} | Status: ${filterStatus} | Kelas: ${filterClass}`, 14, 25);
    
    autoTable(doc, {
      startY: 30,
      head: [['Tanggal', 'Siswa', 'Kelas', 'Mata Pelajaran', 'Jam', 'Status', 'Catatan']],
      body: filteredHistory.map(a => [
        a.date, 
        a.studentName, 
        a.className, 
        a.subjectName, 
        a.period, 
        a.status === 'H' ? 'Hadir' : a.status === 'S' ? 'Sakit' : a.status === 'I' ? 'Izin' : a.status === 'D' ? 'Dispen' : 'Alpa',
        a.notes || '-'
      ]),
    });
    
    doc.save(`Laporan_Absensi_Mapel_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredHistory.map(a => ({
      'Tanggal': a.date,
      'Nama Siswa': a.studentName,
      'Kelas': a.className,
      'Mata Pelajaran': a.subjectName,
      'Jam Ke': a.period,
      'Status': a.status,
      'Catatan': a.notes,
      'Waktu Input': a.createdAt?.toDate ? a.createdAt.toDate().toLocaleString() : '-'
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absensi Mapel");
    XLSX.writeFile(wb, `Laporan_Absensi_Mapel_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const statusColors = {
    'S': 'bg-orange-100 text-orange-600 border-orange-200',
    'I': 'bg-blue-100 text-blue-600 border-blue-200',
    'D': 'bg-purple-100 text-purple-600 border-purple-200',
    'A': 'bg-red-100 text-red-600 border-red-200',
    'H': 'bg-green-100 text-green-600 border-green-200'
  };

  const unreadInquiries = inquiries.filter(inq => inq.status === 'Menunggu');

  return (
    <div className="space-y-6">
      {unreadInquiries.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 p-4 rounded-2xl flex items-center justify-between text-orange-800 text-sm font-bold">
           <div className="flex items-center gap-2">
             <AlertCircle size={20} />
             <span>Anda memiliki {unreadInquiries.length} inquiry baru yang menunggu balasan.</span>
           </div>
           <button 
             onClick={() => setActiveTab('inquiry')}
             className="bg-orange-600 text-white px-4 py-2 rounded-lg text-xs hover:bg-orange-700 transition-all"
           >
             Lihat Inquiry
           </button>
        </div>
      )}
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Input Guru Mata Pelajaran</h1>
          <p className="text-sm text-gray-500 font-medium tracking-tight">Kelola absensi siswa di kelas Anda sesuai jam pelajaran.</p>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl text-[10px] sm:text-xs">
          <button 
            onClick={() => setActiveTab('attendance')}
            className={cn(
              "px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5",
              activeTab === 'attendance' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <UserCheck size={16} /> Absensi
          </button>
          <button 
            onClick={() => setActiveTab('inquiry')}
            className={cn(
              "px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 relative",
              activeTab === 'inquiry' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <MessageSquare size={16} /> Inquiry
            {unreadInquiries.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white shadow-sm">
                {unreadInquiries.length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={cn(
              "px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5",
              activeTab === 'history' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <Clock size={16} /> Riwayat
          </button>
        </div>
      </div>

      {activeTab === 'attendance' ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-50 bg-blue-50/30 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600 text-white rounded-lg shadow-blue-100 shadow-lg">
                    <ClipboardList size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Input Absensi Kelas</h2>
                    <p className="text-xs text-gray-500 font-medium">Lengkapi data mata pelajaran dan absen siswa.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                   <button 
                    onClick={() => setActiveTab('history')}
                    className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm text-xs font-bold text-gray-600 hover:bg-gray-50"
                   >
                     <Clock size={14} className="text-blue-600" />
                     Riwayat Absensi
                   </button>
                   <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm">
                      <Calendar size={14} className="text-blue-600" />
                      <span className="text-xs font-bold text-gray-700">{formatDate(new Date())}</span>
                   </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Form Header */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Mata Pelajaran</label>
                    <input 
                      type="text"
                      placeholder="Contoh: MM, BING..."
                      value={subjectName}
                      onChange={(e) => setSubjectName(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-semibold text-gray-700 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Jam Ke</label>
                    <input 
                      type="text"
                      placeholder="Contoh: 1-2"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-semibold text-gray-700 transition-all"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Pilih Kelas</label>
                    <select 
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-semibold text-gray-700 transition-all"
                    >
                      <option value="">-- Pilih Kelas --</option>
                      {classes.map(cl => (
                        <option key={cl.id} value={cl.name}>{cl.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedClass && (
                  <div className="space-y-4 border-t border-gray-100 pt-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Users size={18} className="text-blue-600" />
                        Daftar Siswa {selectedClass}
                      </h3>
                      <div className="relative w-64">
                         <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                         <input 
                           type="text"
                           placeholder="Cari siswa..."
                           value={searchTerm}
                           onChange={(e) => setSearchTerm(e.target.value)}
                           className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-300 transition-all"
                         />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px]">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Siswa</th>
                            <th className="px-4 py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Absensi (S/I/D/A/H)</th>
                            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Catatan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {students.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map(student => (
                            <tr key={student.id} className="hover:bg-blue-50/20 transition-colors">
                              <td className="px-4 py-3">
                                <p className="font-bold text-sm text-gray-900">{student.name}</p>
                                <p className="text-[10px] text-gray-500 font-bold tracking-tight uppercase">{student.nis}</p>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1">
                                  {(['S', 'I', 'D', 'A', 'H'] as const).map((status) => (
                                    <button
                                      key={status}
                                      onClick={() => handleUpdateAttendance(student.id, status)}
                                      className={cn(
                                        "w-8 h-8 rounded-lg text-xs font-bold transition-all border",
                                        attendanceData[student.id]?.status === status 
                                          ? statusColors[status] 
                                          : "bg-white text-gray-400 border-gray-100 hover:border-gray-300"
                                      )}
                                    >
                                      {status}
                                    </button>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <input 
                                  type="text"
                                  placeholder="Tambahkan catatan..."
                                  value={attendanceData[student.id]?.notes || ''}
                                  onChange={(e) => handleUpdateNotes(student.id, e.target.value)}
                                  className="w-full px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-xs outline-none focus:border-blue-200 transition-all"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex justify-end pt-6">
                      <button
                        disabled={submitting || !subjectName || !period}
                        onClick={handleSubmitAttendance}
                        className="px-8 py-3 bg-blue-700 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-800 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
                      >
                        {submitting ? 'Menyimpan...' : (
                          <>
                            <Save size={18} />
                            SIMPAN ABSENSI MAPEL
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
              <div className="p-6 border-b border-gray-50 flex items-center gap-3 bg-emerald-50/30">
                <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-emerald-100 shadow-lg">
                   <Clock size={20} />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Riwayat Sesi</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {subjectAttendances.length > 0 ? (
                  subjectAttendances.slice(0, 10).map((att) => (
                    <div key={att.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
                      <div className="flex items-center justify-between">
                         <span className={cn(
                           "text-[9px] font-bold px-2 py-0.5 rounded-full border",
                           statusColors[att.status]
                         )}>
                            {att.status === 'S' ? 'SAKIT' : 
                             att.status === 'I' ? 'IZIN' : 
                             att.status === 'D' ? 'DISPEN' : 
                             att.status === 'A' ? 'ALPA' : 'HADIR'}
                         </span>
                         <span className="text-[9px] text-gray-400 font-bold uppercase">{att.date}</span>
                      </div>
                      <p className="text-xs font-bold text-gray-900 line-clamp-1">{att.studentName}</p>
                      <p className="text-[10px] text-gray-500 font-medium">
                         {att.subjectName} • Jam {att.period}
                      </p>
                      {att.notes && <p className="text-[9px] text-gray-400 italic">"{att.notes}"</p>}
                    </div>
                  ))
                ) : (
                  <div className="h-40 flex flex-col items-center justify-center text-center p-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <AlertCircle size={24} className="text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400 font-medium italic">Belum ada riwayat <br/>absensi mapel.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'inquiry' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Selection Area */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-blue-50/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600 text-white rounded-lg">
                     <Users size={20} />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Daftar Siswa Per Kelas</h2>
                </div>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Nama Guru</label>
                  <input 
                    type="text"
                    value={user?.name || ''}
                    readOnly
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl outline-none font-semibold text-gray-500 cursor-not-allowed"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Mata Pelajaran</label>
                    <input 
                      type="text"
                      placeholder="Contoh: MM, BING..."
                      value={subjectName}
                      onChange={(e) => setSubjectName(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-semibold text-gray-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Jam Ke</label>
                    <input 
                      type="text"
                      placeholder="Contoh: 1-2"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-semibold text-gray-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Pilih Kelas</label>
                    <select 
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none font-semibold text-gray-700"
                    >
                      <option value="">-- Pilih Kelas --</option>
                      {classes.map(cl => (
                        <option key={cl.id} value={cl.name}>{cl.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedClass && (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="text"
                        placeholder="Cari nama atau NIS siswa..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none text-sm"
                      />
                    </div>

                    {loading ? (
                      <div className="py-12 text-center">
                        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-gray-500 text-sm">Memuat data siswa...</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {students.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 ? (
                          students.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map(student => (
                            <div 
                              key={student.id}
                              className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between group hover:border-blue-300 hover:bg-blue-50 transition-all cursor-pointer"
                              onClick={() => {
                                setSelectedStudent(student);
                                setShowModal(true);
                              }}
                            >
                              <div>
                                <p className="font-bold text-gray-900 group-hover:text-blue-700 text-sm">{student.name}</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{student.nis} • {student.gender}</p>
                              </div>
                              <button className="p-2 bg-white text-blue-600 rounded-lg shadow-sm border border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
                                <HelpCircle size={18} />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="col-span-full py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 italic text-gray-400">
                            Tidak ada siswa ditemukan
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* History Area */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 h-full flex flex-col">
              <div className="p-6 border-b border-gray-50 flex items-center gap-3">
                <div className="p-2 bg-orange-600 text-white rounded-lg">
                   <Clock size={20} />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Inquiry Terbaru</h2>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {inquiries.length > 0 ? (
                  inquiries.map((inq) => (
                    <div key={inq.id} className="p-4 bg-[#F8FAFC] rounded-xl border border-gray-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest",
                          inq.status === 'Unconfirmed' ? "bg-orange-100 text-orange-600" :
                          inq.status === 'Found' ? "bg-green-100 text-green-600" :
                          "bg-blue-100 text-blue-600"
                        )}>
                          {inq.status}
                        </span>
                        <span className="text-[9px] text-gray-400 font-bold">
                          {inq.createdAt?.toDate ? inq.createdAt.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Baru'}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-gray-900">{inq.studentName}</p>
                      <p className="text-[10px] text-gray-500 italic">
                        {inq.period && <span className="font-semibold text-gray-600 mr-1">Jam Ke {inq.period}:</span>}
                        "{inq.message}"
                      </p>
                      {inq.status === 'Menunggu' && (
                        <div className="mt-4 flex gap-2">
                           <input 
                             type="text" 
                             placeholder="Balas inquiry..." 
                             className="flex-1 p-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-300"
                             value={replyMessages[inq.id] || ''}
                             onChange={(e) => setReplyMessages(prev => ({ ...prev, [inq.id]: e.target.value }))}
                           />
                           <button 
                             onClick={() => {
                               if(replyMessages[inq.id]) handleReply(inq.id, replyMessages[inq.id]);
                             }}
                             className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700"
                           >
                             Kirim
                           </button>
                        </div>
                      )}
                      {inq.response && (
                        <div className="mt-2 p-2 bg-white rounded-lg border border-blue-50">
                          <p className="text-[10px] font-bold text-blue-600 mb-0.5">Balasan:</p>
                          <p className="text-[10px] text-gray-600">{inq.response}</p>
                          <p className="text-[9px] text-gray-400 mt-1">Oleh: {inq.respondedBy}</p>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="h-40 flex flex-col items-center justify-center text-center p-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <AlertCircle size={32} className="text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400 font-medium italic">Belum ada inquiry <br/>yang diajukan hari ini.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Riwayat & Laporan Absensi Mapel</h2>
              <p className="text-xs text-gray-500 font-medium">Lihat dan unduh laporan absensi yang telah Anda input.</p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={exportPDF}
                className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-red-100"
              >
                <Download size={14} /> PDF
              </button>
              <button 
                onClick={exportExcel}
                className="px-4 py-2 bg-green-50 text-green-600 border border-green-100 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-green-100"
              >
                <Download size={14} /> EXCEL
              </button>
            </div>
          </div>

          <div className="p-6 bg-gray-50/50 border-b border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Tanggal</label>
                <input 
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-300"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Status</label>
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-300"
                >
                  <option value="All">Semua Status</option>
                  <option value="H">Hadir (H)</option>
                  <option value="S">Sakit (S)</option>
                  <option value="I">Izin (I)</option>
                  <option value="D">Dispensasi (D)</option>
                  <option value="A">Alpa (A)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">Kelas</label>
                <select 
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-300"
                >
                  <option value="All">Semua Kelas</option>
                  {classes.map(cl => (
                    <option key={cl.id} value={cl.name}>{cl.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tanggal</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Siswa</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kelas</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mapel / Jam</th>
                  <th className="px-6 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredHistory.length > 0 ? (
                  filteredHistory.map((att) => (
                    <tr key={att.id} className="hover:bg-blue-50/10 transition-colors">
                      <td className="px-6 py-4 text-xs font-medium text-gray-600">{att.date}</td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-gray-900">{att.studentName}</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-gray-600">{att.className}</td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-medium text-gray-700">{att.subjectName}</p>
                        <p className="text-[10px] text-gray-400">Jam {att.period}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <span className={cn(
                            "w-6 h-6 flex items-center justify-center rounded-lg text-[10px] font-bold border",
                            statusColors[att.status as keyof typeof statusColors]
                          )}>
                            {att.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500 italic">
                        <input 
                          type="text"
                          defaultValue={att.notes || ''}
                          onBlur={(e) => handleUpdateHistoryNotes(att.id, e.target.value)}
                          className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-500 outline-none text-xs"
                          placeholder="Tambah catatan..."
                        />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center text-gray-400 italic text-sm">
                      Tidak ada data yang sesuai filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inquiry Modal */}
      {showModal && selectedStudent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 bg-blue-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <MessageSquare size={20} />
                </div>
                <h3 className="font-bold text-lg">Tanya Wali Kelas</h3>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <Clock className="rotate-45" size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs text-blue-600 font-bold uppercase tracking-widest mb-1">Konfirmasi Siswa</p>
                <h4 className="text-lg font-bold text-gray-900">{selectedStudent.name}</h4>
                <p className="text-sm text-gray-500 font-medium">Kelas {selectedStudent.className} • NIS {selectedStudent.nis}</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Pesan Ke Wali Kelas</label>
                  <textarea 
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Contoh: Siswa ybs tidak ada di kelas saat jam pelajaran saya. Apakah ada keterangan?"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 outline-none text-sm font-medium"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    disabled={submitting || !message || !subjectName}
                    onClick={handleSubmitInquiry}
                    className="flex-3 py-3 bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-800 disabled:opacity-50 shadow-lg shadow-blue-100"
                  >
                    {submitting ? 'Mengirim...' : 'Kirim Informasi'}
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full mx-auto text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Konfirmasi</h3>
            <p className="text-gray-600 mb-8">{confirmDialog.message}</p>
            <div className="flex gap-4 mb-2">
              <button
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold transition-all"
                onClick={() => setConfirmDialog({isOpen: false, message: '', onConfirm: () => {}})}
              >
                Batal
              </button>
              <button
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-200"
                onClick={() => {
                  setConfirmDialog({isOpen: false, message: '', onConfirm: () => {}});
                  confirmDialog.onConfirm();
                }}
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
