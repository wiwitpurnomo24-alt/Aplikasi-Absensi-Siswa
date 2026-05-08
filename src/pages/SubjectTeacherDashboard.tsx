import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  ClipboardList, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Send,
  Plus,
  X,
  Users,
  Calendar,
  MessageSquare,
  HelpCircle,
  FileText,
  UserCheck,
  Save,
  Download,
  GraduationCap,
  Star,
  TrendingUp
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
  doc,
  writeBatch
} from 'firebase/firestore';
import { cn, formatDate, formatDateTime } from '../lib/utils';
import { useAuthStore } from '../lib/auth-store';
import { Student, SchoolClass, SubjectTeacherInquiry, SubjectAttendance } from '../types';

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import SubjectAttendanceRecapTable from '../components/SubjectAttendanceRecapTable';
import SubjectAttendanceSemesterRecap from '../components/SubjectAttendanceSemesterRecap';
import { getTenantCollection, getTenantDoc } from '../lib/tenant';

export default function SubjectTeacherDashboard() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const validTabs = ['attendance', 'inquiry', 'history', 'monthly', 'semester'];
  const [activeTab, setActiveTab] = useState<string>('attendance');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && validTabs.includes(tab)) {
      setActiveTab(tab);
    } else {
      setActiveTab('attendance');
    }
  }, [searchParams]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [inquiries, setInquiries] = useState<SubjectTeacherInquiry[]>([]);
  const [subjectAttendances, setSubjectAttendances] = useState<SubjectAttendance[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectName, setSubjectName] = useState(user?.subject || '');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, onConfirm: () => void}>({isOpen: false, message: '', onConfirm: () => {}});
  const showConfirm = (message: string, onConfirm: () => void) => setConfirmDialog({isOpen: true, message, onConfirm});
  const [period, setPeriod] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [message, setMessage] = useState('');
  const [inqDate, setInqDate] = useState(new Date().toISOString().split('T')[0]);
  const [inqTime, setInqTime] = useState(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }));
  const [inqDay, setInqDay] = useState(new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(new Date()));
  const [replyMessages, setReplyMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    const day = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(new Date(inqDate));
    setInqDay(day);
  }, [inqDate]);

  const unreadInquiries = inquiries.filter(inq => inq.status === 'Menunggu');
  const unreadNotifications = notifications.filter(n => !n.read);



  const handleReply = async (id: string, response: string) => {
    try {
      const inq = inquiries.find(i => i.id === id);
      await updateDoc(getTenantDoc('subjectInquiries', id), {
        response,
        respondedBy: user?.name,
        respondedAt: serverTimestamp(),
        status: 'Dijawab'
      });

      if (inq) {
        await addDoc(getTenantCollection('notifications'), {
          studentId: inq.studentId,
          targetRole: 'PARENT',
          title: '💬 Jawaban Tanya Baru',
          message: `Guru ${inq.subjectName} (${inq.subjectTeacherName}) telah menjawab pertanyaan Anda: ${response}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      setReplyMessages(prev => ({ ...prev, [id]: '' }));
    } catch (err: any) {
      handleFirestoreError(err, 'update', 'subjectInquiries');
    }
  };

  useEffect(() => {
    if (activeTab === 'inquiry' && unreadNotifications.length > 0) {
      unreadNotifications.forEach(async (n) => {
        try {
          await updateDoc(getTenantDoc('notifications', n.id), { read: true });
        } catch (err) {
          console.error("Error marking notification as read:", err);
        }
      });
    }
  }, [activeTab, unreadNotifications]);

  const handleUpdateHistoryNotes = async (id: string, notes: string) => {
    try {
      await updateDoc(getTenantDoc('subjectAttendance', id), {
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
  const [filterStudent, setFilterStudent] = useState('All');
  const [filterPeriod, setFilterPeriod] = useState('Semua');

  // Attendance state for mass input
  const [attendanceData, setAttendanceData] = useState<Record<string, { status: 'S' | 'I' | 'D' | 'A' | 'H', notes: string }>>({});

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const q = query(getTenantCollection('classes'), orderBy('name', 'asc'));
        const snapshot = await getDocs(q);
        setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolClass)));
      } catch (err: any) {
        handleFirestoreError(err, 'list', 'classes');
      }
    };
    fetchClasses();

    if (!user) return;
    
    // Listen to inquiries
    const qInq = query(
      getTenantCollection('subjectInquiries'),
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
      getTenantCollection('subjectAttendance'),
      where('teacherName', '==', user?.name || ''),
      orderBy('createdAt', 'desc')
    );

    const unsubAtt = onSnapshot(qAtt, (snapshot) => {
      setSubjectAttendances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubjectAttendance)));
    }, (err) => {
      handleFirestoreError(err, 'list', 'subjectAttendance');
    });

    // Listen to notifications
    const qNotif = query(
      getTenantCollection('notifications'),
      where('targetUserId', '==', user?.uid || ''),
      orderBy('createdAt', 'desc')
    );
    const unsubNotif = onSnapshot(qNotif, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubInq();
      unsubAtt();
      unsubNotif();
    };
  }, [user]);



  useEffect(() => {
    if (selectedClass) {
      const fetchStudents = async () => {
        setLoading(true);
        try {
          const q = query(getTenantCollection('students'), where('className', '==', selectedClass), orderBy('name', 'asc'));
          const snapshot = await getDocs(q);
          const studentList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
          setStudents(studentList);
          
          // Reset attendance data
          const initialAtt: Record<string, { status: 'S' | 'I' | 'D' | 'A' | 'H', notes: string }> = {};
          studentList.forEach(s => {
            initialAtt[s.id] = { status: 'H', notes: '' };
          });
          setAttendanceData(initialAtt);


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

  const handleSubmitAttendance = async () => {
    if (!selectedClass) {
      alert("Harap pilih kelas terlebih dahulu!");
      return;
    }
    if (!subjectName) {
      alert("Harap isi Nama Mata Pelajaran!");
      return;
    }
    if (!period) {
      alert("Harap isi Jam Ke (Contoh: 1-2)!");
      return;
    }

    showConfirm(`Kirim absensi untuk kelas ${selectedClass}?`, async () => {
      setSubmitting(true);
      try {
        const entries = Object.entries(attendanceData);
        if (entries.length === 0) {
          alert('Data siswa kosong untuk kelas ini.');
          setSubmitting(false);
          return;
        }

        const today = new Date().toISOString().split('T')[0];
        const batch = writeBatch(db);

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
            notes: data.notes || '',
            createdAt: serverTimestamp(),
            processedById: user?.uid || null
          };

          const attRef = getTenantDoc('subjectAttendance');
          batch.set(attRef, attendanceEntry);

          if (data.status === 'A') {
            const notifRef = getTenantDoc('notifications');
            batch.set(notifRef, {
              targetRole: 'ADMIN',
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

        await batch.commit();

        alert('Absensi mata pelajaran berhasil disimpan.');
        setPeriod('');
      } catch (err: any) {
        console.error("Error submitting attendance:", err);
        alert('Gagal menyimpan absensi: ' + (err.message || String(err)));
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
        subjectTeacherId: user?.uid || '',
        subjectName,
        className: selectedClass,
        studentId: selectedStudent.id,
        studentName: selectedStudent.name,
        date: inqDate,
        day: inqDay,
        time: inqTime,
        period,
        status: 'Menunggu',
        message: message,
        createdAt: serverTimestamp(),
        processedBy: user?.name,
        processedById: user?.uid
      };

      await addDoc(getTenantCollection('subjectInquiries'), inquiryData);
      
      // Also notify Wali Kelas via notifications collection
      await addDoc(getTenantCollection('notifications'), {
        targetRole: 'TEACHER',
        className: selectedClass,
        studentName: selectedStudent.name,
        studentId: selectedStudent.id,
        teacherName: user?.name || 'Guru Mapel',
        subjectName: subjectName,
        period: period,
        message: `${user?.name} (Guru ${subjectName}) bertanya: ${selectedStudent.name} tidak ada di kelas tanpa keterangan.`,
        title: `❓ Laporan Tidak Hadir - ${selectedClass}`,
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
    const matchesStudent = filterStudent === 'All' || att.studentId === filterStudent;
    
    let matchesPeriod = true;
    if (filterPeriod === 'Harian') matchesPeriod = att.date === new Date().toISOString().split('T')[0];
    else if (filterPeriod === 'Mingguan') {
      const d = new Date(att.date);
      const now = new Date();
      const diff = Math.abs(now.getTime() - d.getTime());
      matchesPeriod = diff < 7 * 24 * 60 * 60 * 1000;
    }
    else if (filterPeriod === 'Bulanan') matchesPeriod = att.date.startsWith(new Date().toISOString().slice(0, 7));

    return matchesDate && matchesStatus && matchesClass && matchesStudent && matchesPeriod;
  });

  const [filterMonth, setFilterMonth] = useState('');
  const [filterSemester, setFilterSemester] = useState('');

  // Pagination states
  const [inputPage, setInputPage] = useState(1);
  const ITEMS_PER_PAGE_INPUT = 25;
  const [historyPage, setHistoryPage] = useState(1);
  const ITEMS_PER_PAGE_HISTORY = 25;

  const filteredStudents = useMemo(() => students.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())), [students, searchTerm]);
  const totalInputPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE_INPUT);
  const paginatedStudents = useMemo(() => filteredStudents.slice((inputPage - 1) * ITEMS_PER_PAGE_INPUT, inputPage * ITEMS_PER_PAGE_INPUT), [filteredStudents, inputPage]);

  const totalHistoryPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE_HISTORY);
  const paginatedHistory = useMemo(() => filteredHistory.slice((historyPage - 1) * ITEMS_PER_PAGE_HISTORY, historyPage * ITEMS_PER_PAGE_HISTORY), [filteredHistory, historyPage]);

  const filteredMonthlyAttendances = useMemo(() => {
    if (!filterMonth) return [];
    return subjectAttendances.filter(a => a.date.startsWith(filterMonth));
  }, [subjectAttendances, filterMonth]);

  const filteredSemesterAttendances = useMemo(() => {
    if (!filterSemester) return [];
    return subjectAttendances.filter(a => {
      const month = parseInt(a.date.split('-')[1]);
      if (filterSemester === '1') return month >= 7 && month <= 12;
      if (filterSemester === '2') return month >= 1 && month <= 6;
      return false;
    });
  }, [subjectAttendances, filterSemester]);

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
    
    const today = new Date().toISOString().split('T')[0];
    doc.save(`Laporan_Absensi_Mapel_${today}.pdf`);
  };

  const exportMonthlyPDF = () => {
    if (!filterMonth) {
      alert("Silakan pilih bulan laporan!");
      return;
    }
    const doc = new jsPDF();
    const monthYear = new Date(filterMonth);
    const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(monthYear);
    const fileName = `Laporan_Bulanan_${monthName.replace(/\s/g, '_')}_${user?.name}`;

    doc.text(`Laporan Bulanan Absensi Mata Pelajaran`, 14, 15);
    doc.text(`Guru: ${user?.name} | Bulan: ${monthName}`, 14, 25);
    
    const monthlyData = subjectAttendances.filter(att => att.date.startsWith(filterMonth));

    autoTable(doc, {
      startY: 30,
      head: [['Tanggal', 'Siswa', 'Kelas', 'Mapel', 'Jam', 'Status', 'Catatan']],
      body: monthlyData.map(a => [
        a.date, 
        a.studentName, 
        a.className, 
        a.subjectName, 
        a.period, 
        a.status,
        a.notes || '-'
      ]),
    });
    doc.save(`${fileName}.pdf`);
  };

  const exportSemesterPDF = () => {
    if (!filterSemester) {
      alert("Silakan pilih semester laporan!");
      return;
    }
    const doc = new jsPDF();
    const fileName = `Laporan_Semester_${filterSemester}_${user?.name}`;

    doc.text(`Laporan Semester Absensi Mata Pelajaran`, 14, 15);
    doc.text(`Guru: ${user?.name} | Semester: ${filterSemester}`, 14, 25);
    
    // Logic for semester filtering (Semester 1: Jul-Dec, Semester 2: Jan-Jun)
    const semesterData = subjectAttendances.filter(att => {
      const month = new Date(att.date).getMonth() + 1;
      return filterSemester === '1' ? (month >= 7 && month <= 12) : (month >= 1 && month <= 6);
    });

    autoTable(doc, {
      startY: 30,
      head: [['Tanggal', 'Siswa', 'Kelas', 'Mapel', 'Jam', 'Status', 'Catatan']],
      body: semesterData.map(a => [
        a.date, 
        a.studentName, 
        a.className, 
        a.subjectName, 
        a.period, 
        a.status,
        a.notes || '-'
      ]),
    });
    doc.save(`${fileName}.pdf`);
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
      'Waktu Input': a.createdAt ? formatDateTime(a.createdAt) : '-'
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absensi Mapel");
    XLSX.writeFile(wb, `Laporan_Absensi_Mapel_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportMonthlyExcel = () => {
    if (!filterMonth) {
      alert("Silakan pilih bulan laporan!");
      return;
    }
    const monthYear = new Date(filterMonth);
    const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(monthYear);
    const monthlyData = subjectAttendances.filter(att => att.date.startsWith(filterMonth));

    const ws = XLSX.utils.json_to_sheet(monthlyData.map(a => ({
      'Tanggal': a.date,
      'Siswa': a.studentName,
      'Kelas': a.className,
      'Mapel': a.subjectName,
      'Jam Ke': a.period,
      'Status': a.status,
      'Catatan': a.notes
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Bulanan");
    XLSX.writeFile(wb, `Laporan_Bulanan_${monthName.replace(/\s/g, '_')}_${user?.name}.xlsx`);
  };

  const exportSemesterExcel = () => {
    if (!filterSemester) {
      alert("Silakan pilih semester laporan!");
      return;
    }
    const semesterData = subjectAttendances.filter(att => {
      const month = new Date(att.date).getMonth() + 1;
      return filterSemester === '1' ? (month >= 7 && month <= 12) : (month >= 1 && month <= 6);
    });

    const ws = XLSX.utils.json_to_sheet(semesterData.map(a => ({
      'Tanggal': a.date,
      'Siswa': a.studentName,
      'Kelas': a.className,
      'Mapel': a.subjectName,
      'Jam Ke': a.period,
      'Status': a.status,
      'Catatan': a.notes
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Semester");
    XLSX.writeFile(wb, `Laporan_Semester_${filterSemester}_${user?.name}.xlsx`);
  };
  const statusColors = {
    'S': 'bg-orange-100 text-orange-600 border-orange-200',
    'I': 'bg-blue-100 text-blue-600 border-blue-200',
    'D': 'bg-purple-100 text-purple-600 border-purple-200',
    'A': 'bg-red-100 text-red-600 border-red-200',
    'H': 'bg-green-100 text-green-600 border-green-200'
  };

  return (
    <div className="space-y-6">
      {(unreadInquiries.length > 0 || unreadNotifications.length > 0) && (
        <div className="bg-orange-50 border border-orange-200 p-4 rounded-2xl flex items-center justify-between text-orange-800 text-sm font-bold">
           <div className="flex items-center gap-2">
             <AlertCircle size={20} />
             <span>
               {unreadInquiries.length > 0 && `Anda memiliki ${unreadInquiries.length} pesan TANYA WALI KELAS baru.`}
               {unreadInquiries.length > 0 && unreadNotifications.length > 0 && ' dan '}
               {unreadNotifications.length > 0 && `ada ${unreadNotifications.length} balasan baru dari Wali Kelas.`}
             </span>
           </div>
           <button 
             onClick={() => navigate('/subject-teacher?tab=inquiry')}
             className="bg-orange-600 text-white px-4 py-2 rounded-lg text-[10px] sm:text-xs hover:bg-orange-700 transition-all uppercase font-bold"
           >
             LIHAT TANYA WALI KELAS
           </button>
        </div>
      )}
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-5">
           <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
              <CheckCircle2 size={32} />
           </div>
           <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none uppercase">Selamat Datang, {user?.name}</h1>
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-black text-green-700 uppercase tracking-widest">Online</span>
                  </div>
                  <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Guru Mata Pelajaran</p>
                </div>
                <p className="text-sm text-gray-500 font-medium leading-tight">
                  Pantau kehadiran dan kelola administrasi presensi siswa pada jam pelajaran Anda.
                </p>
              </div>
           </div>
        </div>
      </div>

  {(() => {
    switch (activeTab) {
      case 'attendance': return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-50 bg-blue-50/30 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600 text-white rounded-lg shadow-blue-100 shadow-lg">
                    <ClipboardList size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 uppercase">Input Absensi Kelas</h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">Lengkapi data mata pelajaran dan absen siswa.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                   <button 
                    onClick={() => navigate('/subject-teacher?tab=history')}
                    className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm text-xs font-bold text-gray-600 hover:bg-gray-50 uppercase"
                   >
                     <Clock size={14} className="text-blue-600" />
                     LAPORAN HARIAN
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
                      {classes.map((cl, index) => (
                        <option key={`class-opt-att-v2-${cl.id || cl.name}-${index}`} value={cl.name}>{cl.name}</option>
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
                          {paginatedStudents.map((student, index) => (
                            <tr key={`attendance-row-${student.id || student.nis || index}`} className="hover:bg-blue-50/20 transition-colors">
                              <td className="px-4 py-3">
                                <p className="font-bold text-sm text-gray-900">{student.name}</p>
                                <p className="text-[10px] text-gray-500 font-bold tracking-tight uppercase">{student.nis}</p>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1">
                                  {(['S', 'I', 'D', 'A', 'H'] as const).map((status) => (
                                    <button
                                      key={`${student.id || student.nis || index}-${status}`}
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

                    {totalInputPages > 1 && (
                      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                          Halaman {inputPage} dari {totalInputPages}
                        </p>
                        <div className="flex gap-1">
                          <button 
                            disabled={inputPage === 1}
                            onClick={() => setInputPage(p => Math.max(1, p - 1))}
                            className="px-3 py-1 rounded border border-gray-200 text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-gray-50"
                          >
                            Prev
                          </button>
                          {[...Array(totalInputPages)].map((_, i) => {
                            // Show max 5 pages around current
                            if (i + 1 === 1 || i + 1 === totalInputPages || (i + 1 >= inputPage - 1 && i + 1 <= inputPage + 1)) {
                              return (
                                <button 
                                  key={`pag-input-${i}`}
                                  onClick={() => setInputPage(i + 1)}
                                  className={cn(
                                    "w-8 h-8 rounded text-xs font-bold transition-all",
                                    inputPage === i + 1 ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                  )}
                                >
                                  {i + 1}
                                </button>
                              )
                            } else if (i + 1 === inputPage - 2 || i + 1 === inputPage + 2) {
                              return <span key={`dash-pag-in-${i}`} className="text-gray-400">...</span>
                            }
                            return null;
                          })}
                          <button 
                            disabled={inputPage === totalInputPages}
                            onClick={() => setInputPage(p => Math.min(totalInputPages, p + 1))}
                            className="px-3 py-1 rounded border border-gray-200 text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-gray-50"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end pt-6">
                    <button
                        onClick={handleSubmitAttendance}
                        className={cn(
                          "px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg",
                          (submitting || !subjectName || !period) 
                            ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none" 
                            : "bg-blue-700 text-white hover:bg-blue-800 shadow-blue-100"
                        )}
                      >
                        {submitting ? 'Menyimpan...' : (
                          <>
                            <Save size={18} />
                            SIMPAN ABSENSI MAPEL
                          </>
                        )}
                      </button>
                      {(!subjectName || !period) && (
                        <p className="text-[10px] text-red-500 font-bold mt-2 text-right italic">
                          * Harap isi Nama Mapel dan Jam Ke
                        </p>
                      )}
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
                <h2 className="text-lg font-bold text-gray-900">Tanya Wali Kelas</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {subjectAttendances.length > 0 ? (
                    subjectAttendances.slice(0, 10).map((att, attIdx) => (
                      <div key={`side-att-v2-${att.id}`} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
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
                    <p className="text-xs text-gray-400 font-medium italic">Belum ada riwayat <br/>absensi.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
      case 'inquiry': return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Selection Area */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-blue-50/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600 text-white rounded-lg">
                     <Users size={20} />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 uppercase">DAFTAR SISWA PER KELAS</h2>
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
                      {classes.map((cl, index) => (
                        <option key={`class-opt-3-${cl.id || cl.name}`} value={cl.name}>{cl.name}</option>
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
                          students.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map((student, index) => (
                            <div 
                              key={`inq-student-${student.id || student.nis || index}`}
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
                <h2 className="text-lg font-bold text-gray-900 uppercase">TANYA WALI KELAS TERBARU</h2>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {inquiries.length > 0 ? (
                  inquiries.map((inq) => (
                    <div key={`recent-inq-${inq.id}`} className="p-4 bg-[#F8FAFC] rounded-xl border border-gray-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest",
                          inq.status === 'Menunggu' ? "bg-orange-100 text-orange-600" :
                          inq.status === 'Dijawab' ? "bg-green-100 text-green-600" :
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
                             placeholder="Balas..." 
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
                        <div className="mt-2 p-2 bg-white rounded-lg border border-blue-50 shadow-sm transition-all hover:shadow-md">
                          <p className="text-[10px] font-bold text-blue-600 mb-0.5 uppercase tracking-wider">Balasan Wali Kelas:</p>
                          <p className="text-xs text-gray-700 font-medium leading-relaxed">{inq.response}</p>
                          <p className="text-[9px] text-gray-400 mt-1 font-bold">Oleh: {inq.respondedBy}</p>
                        </div>
                      )}
                      {inq.replies && inq.replies.length > 0 && (
                        <div className="mt-2 space-y-2">
                           <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">Diskusi Lanjutan:</p>
                           {inq.replies.map((reply: any, rIdx: number) => (
                             <div key={`${inq.id}-reply-${rIdx}`} className="p-2 bg-white rounded-lg border border-gray-100 shadow-sm">
                               <p className="text-[10px] font-bold text-gray-800">{reply.sender}</p>
                               <p className="text-xs text-gray-600">{reply.message}</p>
                             </div>
                           ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="h-40 flex flex-col items-center justify-center text-center p-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <AlertCircle size={32} className="text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400 font-medium italic">Belum ada TANYA WALI KELAS <br/>yang diajukan hari ini.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
      case 'history': return (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex flex-wrap items-center justify-between gap-4 bg-gray-50/50">
               <div>
                  <h2 className="text-lg font-bold text-gray-900 uppercase">LAPORAN HARIAN</h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Catatan absensi harian per kelas dan mata pelajaran.</p>
               </div>
               <div className="flex items-center gap-2">
                 <button onClick={exportPDF} className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-bold hover:bg-red-100 flex items-center gap-2 border border-red-100 uppercase transition-all">
                    <FileText size={14} /> PDF
                 </button>
                 <button onClick={exportExcel} className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-bold hover:bg-green-100 flex items-center gap-2 border border-green-100 uppercase transition-all">
                    <Download size={14} /> Excel
                 </button>
               </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Filter Tanggal</label>
                  <input 
                    type="date" 
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500" 
                    value={filterDate}
                    onChange={e => setFilterDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Status</label>
                  <select 
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500"
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                  >
                    <option value="All">Semua Status</option>
                    <option value="H">Hadir</option>
                    <option value="S">Sakit</option>
                    <option value="I">Izin</option>
                    <option value="D">Dispen</option>
                    <option value="A">Alpa</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Kelas</label>
                  <select 
                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500"
                    value={filterClass}
                    onChange={e => setFilterClass(e.target.value)}
                  >
                    <option value="All">Semua Kelas</option>
                    {classes.map((cl, idx) => <option key={`log-cl-${cl.id || 'c'}-${idx}`} value={cl.name}>{cl.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Rentang Waktu</label>
                  <select 
                     className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500"
                     value={filterPeriod}
                     onChange={e => setFilterPeriod(e.target.value)}
                  >
                    <option value="Semua">Semua Jam</option>
                    <option value="Harian">Hari Ini</option>
                    <option value="Mingguan">Minggu Ini</option>
                    <option value="Bulanan">Bulan Ini</option>
                  </select>
                </div>
                <div className="space-y-1 flex flex-col justify-end">
                   <button 
                    onClick={() => {
                      setFilterDate('');
                      setFilterStatus('All');
                      setFilterClass('All');
                      setFilterStudent('All');
                      setFilterPeriod('Semua');
                    }}
                    className="w-full py-2.5 bg-gray-100 text-gray-500 rounded-xl text-xs font-bold hover:bg-gray-200 uppercase tracking-widest"
                   >
                     RESET FILTER
                   </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-gray-100 rounded-xl shadow-inner bg-gray-50/30">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead>
                    <tr className="bg-white/80 border-b border-gray-100">
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest border-r border-gray-50">Hari/Tgl</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest border-r border-gray-50">Siswa</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest border-r border-gray-50 text-center">Kelas</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest border-r border-gray-50">Mapel</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest border-r border-gray-50 text-center">Jam</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest border-r border-gray-50 text-center">Status</th>
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedHistory.map((att, idx) => (
                      <tr key={att.id} className={cn("hover:bg-blue-50/20 transition-colors bg-white/40", idx % 2 === 0 ? "" : "bg-gray-50/30")}>
                        <td className="px-4 py-3 border-r border-gray-50/50">
                           <p className="text-xs font-black text-gray-900">{att.date}</p>
                        </td>
                        <td className="px-4 py-3 border-r border-gray-50/50">
                           <p className="text-xs font-bold text-gray-800">{att.studentName}</p>
                        </td>
                        <td className="px-4 py-3 border-r border-gray-50/50 text-center">
                           <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[10px] font-black uppercase">{att.className}</span>
                        </td>
                        <td className="px-4 py-3 border-r border-gray-50/50 text-xs font-bold text-gray-600">
                           {att.subjectName}
                        </td>
                        <td className="px-4 py-3 border-r border-gray-50/50 text-center text-xs font-bold text-blue-600">
                           {att.period}
                        </td>
                        <td className="px-4 py-3 border-r border-gray-50/50 text-center">
                           <span className={cn(
                             "px-2 py-0.5 rounded text-[10px] font-black uppercase",
                             statusColors[att.status as keyof typeof statusColors]
                           )}>
                             {att.status === 'H' ? 'Hadir' : att.status === 'S' ? 'Sakit' : att.status === 'I' ? 'Izin' : att.status === 'D' ? 'Dispen' : 'Alpa'}
                           </span>
                        </td>
                        <td className="px-4 py-3">
                          <input 
                            type="text"
                            defaultValue={att.notes}
                            onBlur={(e) => handleUpdateHistoryNotes(att.id, e.target.value)}
                            className="w-full bg-transparent border-none text-[10px] italic text-gray-500 focus:ring-0 outline-none"
                          />
                        </td>
                      </tr>
                    ))}
                    {paginatedHistory.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-20 text-center">
                           <div className="flex flex-col items-center gap-2 opacity-30">
                              <HelpCircle size={48} />
                              <p className="text-sm font-bold uppercase tracking-widest">Tidak ada data absensi</p>
                           </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalHistoryPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 mt-4 pt-4">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    Halaman {historyPage} dari {totalHistoryPages}
                  </p>
                  <div className="flex gap-1">
                    <button 
                      disabled={historyPage === 1}
                      onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                      className="px-3 py-1 rounded border border-gray-200 text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-gray-50"
                    >
                      Prev
                    </button>
                    {[...Array(totalHistoryPages)].map((_, i) => {
                      // Show max 5 pages around current
                      if (i + 1 === 1 || i + 1 === totalHistoryPages || (i + 1 >= historyPage - 1 && i + 1 <= historyPage + 1)) {
                        return (
                          <button 
                            key={`pag-hist-${i}`}
                            onClick={() => setHistoryPage(i + 1)}
                            className={cn(
                              "w-8 h-8 rounded text-xs font-bold transition-all",
                              historyPage === i + 1 ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            )}
                          >
                            {i + 1}
                          </button>
                        )
                      } else if (i + 1 === historyPage - 2 || i + 1 === historyPage + 2) {
                        return <span key={`dash-pag-hi-${i}`} className="text-gray-400">...</span>
                      }
                      return null;
                    })}
                    <button 
                      disabled={historyPage === totalHistoryPages}
                      onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                      className="px-3 py-1 rounded border border-gray-200 text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
      case 'monthly': return (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
            <div className="p-6 border-b border-gray-50 flex flex-wrap items-center justify-between gap-4 bg-gray-50/50">
               <div>
                  <h2 className="text-lg font-bold text-gray-900 uppercase">LAPORAN BULANAN</h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Rekapitulasi absensi mata pelajaran dalam format tabel (Admin Style).</p>
               </div>
            </div>
            
            <div className="p-6 space-y-6">
               <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[200px] space-y-1">
                     <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest ml-1">Pilih Kelas</label>
                     <select 
                       value={selectedClass}
                       onChange={(e) => setSelectedClass(e.target.value)}
                       className="w-full p-2.5 bg-white border border-blue-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
                     >
                       <option value="">-- Pilih Kelas --</option>
                       {classes.map((cl, idx) => <option key={`monthly-cl-${cl.id || 'c'}-${idx}`} value={cl.name}>{cl.name}</option>)}
                     </select>
                  </div>
                  <div className="flex-1 min-w-[200px] space-y-1">
                     <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest ml-1">Mata Pelajaran</label>
                     <input 
                       type="text"
                       placeholder="Nama Mapel..."
                       value={subjectName}
                       onChange={e => setSubjectName(e.target.value)}
                       className="w-full p-2.5 bg-white border border-blue-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
                     />
                  </div>
               </div>

               {selectedClass && subjectName ? (
                 <SubjectAttendanceRecapTable 
                   students={students}
                   attendance={subjectAttendances.filter(a => a.className === selectedClass && a.subjectName === subjectName)}
                   selectedClass={selectedClass}
                   subjectName={subjectName}
                   teacherName={user?.name || ''}
                 />
               ) : (
                 <div className="py-20 text-center bg-gray-50 border border-dashed border-gray-200 rounded-3xl">
                    <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em]">Pilih Kelas dan isi Nama Mapel untuk melihat laporan bulanan</p>
                 </div>
               )}
            </div>
          </div>
        </div>
      );
      case 'semester': return (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
            <div className="p-6 border-b border-gray-50 flex flex-wrap items-center justify-between gap-4 bg-gray-50/50">
               <div>
                  <h2 className="text-lg font-bold text-gray-900 uppercase">LAPORAN SEMESTER</h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">Ringkasan total kehadiran per semester dalam format tabel (Admin Style).</p>
               </div>
            </div>
            
            <div className="p-6 space-y-6">
               <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[200px] space-y-1">
                     <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest ml-1">Pilih Kelas</label>
                     <select 
                       value={selectedClass}
                       onChange={(e) => setSelectedClass(e.target.value)}
                       className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                     >
                       <option value="">-- Pilih Kelas --</option>
                       {classes.map((cl, idx) => <option key={`semester-cl-${cl.id || 'c'}-${idx}`} value={cl.name}>{cl.name}</option>)}
                     </select>
                  </div>
                  <div className="flex-1 min-w-[200px] space-y-1">
                     <label className="text-[9px] font-black text-indigo-600 uppercase tracking-widest ml-1">Mata Pelajaran</label>
                     <input 
                       type="text"
                       placeholder="Nama Mapel..."
                       value={subjectName}
                       onChange={e => setSubjectName(e.target.value)}
                       className="w-full p-2.5 bg-white border border-indigo-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200"
                     />
                  </div>
               </div>

               {selectedClass && subjectName ? (
                 <SubjectAttendanceSemesterRecap 
                   students={students}
                   attendance={subjectAttendances.filter(a => a.className === selectedClass && a.subjectName === subjectName)}
                   selectedClass={selectedClass}
                   subjectName={subjectName}
                   teacherName={user?.name || ''}
                 />
               ) : (
                 <div className="py-20 text-center bg-gray-50 border border-dashed border-gray-200 rounded-3xl">
                    <TrendingUp size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em]">Pilih Kelas dan isi Nama Mapel untuk melihat laporan semester</p>
                 </div>
               )}
            </div>
          </div>
        </div>
      );
      default: return null;
    }
  })()}

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
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Tanggal</label>
                    <input 
                      type="date"
                      value={inqDate}
                      onChange={(e) => setInqDate(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Hari</label>
                    <input 
                      type="text"
                      value={inqDay}
                      readOnly
                      className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-xl outline-none text-sm font-medium text-gray-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Waktu</label>
                    <input 
                      type="text"
                      value={inqTime}
                      readOnly
                      className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-xl outline-none text-sm font-medium text-gray-500"
                    />
                  </div>
                </div>
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
                    className="flex-3 py-3 bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-800 disabled:opacity-50 shadow-lg shadow-blue-100 uppercase"
                  >
                    {submitting ? 'MENGIRIM...' : 'KIRIM INFORMASI'}
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* WhatsApp Import Modal would go here if needed, but manual input is requested */}

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
