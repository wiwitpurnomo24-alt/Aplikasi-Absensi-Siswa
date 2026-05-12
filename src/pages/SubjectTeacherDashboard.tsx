import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  History,
  BookOpen,
  Trash2,
  Bell,
  Star,
  TrendingUp,
  ChevronUp,
  ChevronDown
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
  deleteDoc,
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
import SimpleNotification from '../components/SimpleNotification';
import RoleSwitcher from '../components/RoleSwitcher';

export default function SubjectTeacherDashboard() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const validTabs = ['attendance', 'inquiry', 'tasks', 'history', 'monthly', 'semester'];
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
  const [tasks, setTasks] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [toastNotif, setToastNotif] = useState<{title: string, message: string} | null>(null);
  const isInitialNotif = React.useRef(true);
  const [success, setSuccess] = useState(false);
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
  
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showGeneralInquiryModal, setShowGeneralInquiryModal] = useState(false);
  const [generalInqForm, setGeneralInqForm] = useState({
    className: '',
    studentId: '',
    message: ''
  });
  const [taskForm, setTaskForm] = useState({
    subject: '',
    title: '',
    description: '',
    dueDate: '',
    className: ''
  });

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

  const handleDeleteAttendance = async (id: string) => {
    showConfirm('Apakah Anda yakin ingin menghapus data presensi ini?', async () => {
      try {
        await updateDoc(getTenantDoc('subjectAttendance', id), {
          deleted: true, 
        });
        alert('Data presensi berhasil dihapus.');
      } catch (err: any) {
        handleFirestoreError(err, 'delete', 'subjectAttendance');
      }
    });
  };

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
  const [filterSubject, setFilterSubject] = useState('All');
  const [filterPeriod, setFilterPeriod] = useState('Semua');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Attendance state for mass input
  const [attendanceData, setAttendanceData] = useState<Record<string, { status: 'S' | 'I' | 'D' | 'A' | 'H', notes: string }>>({});
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);

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
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(docs);

      if (isInitialNotif.current) {
        isInitialNotif.current = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const newItem = change.doc.data();
          if (!newItem.read) {
            setToastNotif({
              title: newItem.title || 'Pemberitahuan Baru',
              message: newItem.message || 'Ada informasi baru untuk Anda.'
            });
            // Auto hide
            setTimeout(() => setToastNotif(null), 5000);
          }
        }
      });
    }, (err) => {
      handleFirestoreError(err, 'list', 'notifications');
    });

    // Listen to tasks
    const qTasks = query(
      getTenantCollection('tasks'),
      where('teacherId', '==', user?.uid || ''),
      orderBy('createdAt', 'desc')
    );
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubInq();
      unsubAtt();
      unsubNotif();
      unsubTasks();
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

        const today = attendanceDate;
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

      // Also notify Admin for tracking
      await addDoc(getTenantCollection('notifications'), {
        targetRole: 'ADMIN',
        className: selectedClass,
        studentName: selectedStudent.name,
        studentId: selectedStudent.id,
        teacherName: user?.name || 'Guru Mapel',
        subjectName: subjectName,
        period: period,
        message: `${user?.name} (Guru ${subjectName}) bertanya: ${selectedStudent.name} tidak ada di kelas tanpa keterangan di jam ke ${period}.`,
        title: `Tanya Guru Mapel - ${selectedClass}`,
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

  const handleSubmitGeneralInquiry = async () => {
    if (!generalInqForm.className || !generalInqForm.studentId || !generalInqForm.message || !subjectName) {
      alert("Harap lengkapi semua data!");
      return;
    }
    
    setSubmitting(true);
    try {
      const student = students.find(s => s.id === generalInqForm.studentId);
      if (!student) throw new Error("Siswa tidak ditemukan");

      const inqData: Omit<SubjectTeacherInquiry, 'id'> = {
        subjectTeacherName: user?.name || 'Guru Mapel',
        subjectTeacherId: user?.uid || '',
        subjectName,
        className: generalInqForm.className,
        studentId: student.id,
        studentName: student.name,
        date: new Date().toISOString().split('T')[0],
        day: new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(new Date()),
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }),
        period: '-',
        status: 'Menunggu',
        message: generalInqForm.message,
        createdAt: serverTimestamp(),
        processedBy: user?.name,
        processedById: user?.uid
      };

      await addDoc(getTenantCollection('subjectInquiries'), inqData);
      
      // Notify Wali Kelas
      await addDoc(getTenantCollection('notifications'), {
        targetRole: 'TEACHER',
        className: generalInqForm.className,
        studentName: student.name,
        studentId: student.id,
        teacherName: user?.name || 'Guru Mapel',
        subjectName: subjectName,
        message: `${user?.name} (Guru ${subjectName}) mengajukan pertanyaan terkait ${student.name}: ${generalInqForm.message}`,
        title: `❓ Pertanyaan Baru - ${generalInqForm.className}`,
        read: false,
        type: 'INQUIRY',
        createdAt: serverTimestamp()
      });

      setShowGeneralInquiryModal(false);
      setGeneralInqForm({ className: '', studentId: '', message: '' });
      alert('Pertanyaan berhasil dikirim ke Wali Kelas.');
    } catch (err: any) {
      handleFirestoreError(err, 'create', 'subjectInquiry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitTask = async () => {
    if (!taskForm.title || !taskForm.dueDate || !taskForm.className || !taskForm.subject) {
      alert("Harap lengkapi mata pelajaran, judul, tenggat waktu, dan kelas!");
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(getTenantCollection('tasks'), {
        title: taskForm.title,
        description: taskForm.description,
        dueDate: taskForm.dueDate,
        className: taskForm.className,
        subjectName: taskForm.subject,
        teacherId: user?.uid,
        teacherName: user?.name,
        status: 'Aktif',
        createdAt: serverTimestamp()
      });
      
      // Notify Wali Kelas & Admin
      await addDoc(getTenantCollection('notifications'), {
        targetRole: 'TEACHER', // Homeroom
        className: taskForm.className,
        message: `${user?.name} menambahkan tugas baru [${taskForm.title}] untuk kelas ${taskForm.className}.`,
        title: `📝 Tugas Baru: ${taskForm.title}`,
        read: false,
        createdAt: serverTimestamp()
      });

      setShowTaskModal(false);
      setTaskForm({ subject: '', title: '', description: '', dueDate: '', className: '' });
      alert('Tugas berhasil ditambahkan!');
    } catch (err: any) {
      handleFirestoreError(err, 'create', 'tasks');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTask = async (id: string) => {
    showConfirm('Hapus tugas ini?', async () => {
      try {
        await deleteDoc(getTenantDoc('tasks', id));
      } catch (err: any) {
        handleFirestoreError(err, 'delete', 'tasks');
      }
    });
  };

  const filteredHistory = subjectAttendances.filter(att => {
    const matchesDate = !filterDate || att.date === filterDate;
    const matchesStatus = filterStatus === 'All' || att.status === filterStatus;
    const matchesClass = filterClass === 'All' || att.className === filterClass;
    const matchesStudent = filterStudent === 'All' || att.studentId === filterStudent;
    const matchesSubject = filterSubject === 'All' || att.subjectName === filterSubject;
    
    let matchesPeriod = true;
    if (filterPeriod === 'Harian') matchesPeriod = att.date === new Date().toISOString().split('T')[0];
    else if (filterPeriod === 'Mingguan') {
      const d = new Date(att.date);
      const now = new Date();
      const diff = Math.abs(now.getTime() - d.getTime());
      matchesPeriod = diff < 7 * 24 * 60 * 60 * 1000;
    }
    else if (filterPeriod === 'Bulanan') matchesPeriod = att.date.startsWith(new Date().toISOString().slice(0, 7));

    return matchesDate && matchesStatus && matchesClass && matchesStudent && matchesSubject && matchesPeriod;
  });

  const subjectsList = useMemo(() => {
    const subjects = new Set<string>();
    subjectAttendances.forEach(att => {
      if (att.subjectName) subjects.add(att.subjectName);
    });
    return Array.from(subjects).sort();
  }, [subjectAttendances]);

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

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedIds(newExpanded);
  };

  const exportHistoryPDF = () => {
    const doc = new jsPDF();
    doc.text(`Laporan Riwayat Absensi Mata Pelajaran`, 14, 15);
    doc.text(`Tanggal: ${filterDate || 'Semua'} | Status: ${filterStatus} | Kelas: ${filterClass} | Mapel: ${filterSubject}`, 14, 25);
    
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

  const renderView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-3">
        {(() => {
          switch (activeTab) {
            case 'attendance': return (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-50 bg-gray-50/30 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100">
                        <Users size={20} />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900 uppercase">Input Presensi Mapel</h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Pilih kelas dan masukkan data kehadiran siswa.</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Pilih Kelas</label>
                        <select 
                          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all cursor-pointer"
                          value={selectedClass}
                          onChange={(e) => {
                            setSelectedClass(e.target.value);
                            setInputPage(1);
                          }}
                        >
                          <option value="">-- PILIH KELAS --</option>
                          {classes.map((cl, idx) => (
                            <option key={`input-cl-${cl.id || 'c'}-${idx}`} value={cl.name}>{cl.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Tanggal Presensi</label>
                        <input 
                          type="date"
                          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all font-mono"
                          value={attendanceDate}
                          onChange={(e) => setAttendanceDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Mata Pelajaran</label>
                        <input 
                          type="text"
                          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                          placeholder="Contoh: Matematika"
                          value={subjectName}
                          onChange={(e) => setSubjectName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Jam Ke</label>
                        <input 
                          type="text"
                          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                          placeholder="Contoh: 1-2"
                          value={period}
                          onChange={(e) => setPeriod(e.target.value)}
                        />
                      </div>
                    </div>

                    {!selectedClass ? (
                      <div className="py-24 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                        <GraduationCap size={48} className="mx-auto text-gray-300 mb-4" />
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em]">Silakan pilih kelas untuk memulai presensi</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                           <div className="relative w-full sm:w-72">
                             <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                             <input 
                               type="text"
                               placeholder="Cari nama siswa..."
                               className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                               value={searchTerm}
                               onChange={(e) => setSearchTerm(e.target.value)}
                             />
                           </div>
                           <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                             <Users size={14} className="text-blue-500" />
                             <span>Total: {filteredStudents.length} Siswa</span>
                           </div>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-gray-100">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nama Siswa</th>
                                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status Kehadiran</th>
                                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Catatan</th>
                                <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Tanya Wali Kelas</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {paginatedStudents.map((student) => (
                                <tr key={student.id} className="hover:bg-blue-50/30 transition-colors group">
                                  <td className="p-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-black uppercase">
                                        {student.name.charAt(0)}
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{student.name}</p>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">NIS: {student.nis}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    <div className="flex justify-center gap-1.5">
                                      {['H', 'S', 'I', 'D', 'A'].map((s) => (
                                        <button
                                          key={`${student.id}-${s}`}
                                          onClick={() => handleUpdateAttendance(student.id, s as any)}
                                          className={cn(
                                            "w-9 h-9 rounded-xl text-xs font-black transition-all transform active:scale-95",
                                            attendanceData[student.id]?.status === s
                                              ? "bg-blue-600 text-white shadow-lg shadow-blue-200 ring-2 ring-blue-100"
                                              : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                                          )}
                                          title={s === 'H' ? 'Hadir' : s === 'S' ? 'Sakit' : s === 'I' ? 'Izin' : s === 'D' ? 'Dispen' : 'Alpa'}
                                        >
                                          {s}
                                        </button>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    <input 
                                      type="text"
                                      placeholder="Tambahkan catatan..."
                                      className="w-full bg-transparent text-xs p-1 outline-none focus:border-b-2 focus:border-blue-500 transition-all font-medium italic text-gray-500"
                                      value={attendanceData[student.id]?.notes || ''}
                                      onChange={(e) => handleUpdateNotes(student.id, e.target.value)}
                                    />
                                  </td>
                                  <td className="p-4">
                                    <div className="flex justify-center">
                                      <button 
                                        onClick={() => {
                                          setSelectedStudent(student);
                                          setShowModal(true);
                                        }}
                                        className="p-2 text-orange-400 hover:bg-orange-50 hover:text-orange-600 rounded-lg transition-all"
                                        title="Tanya Wali Kelas"
                                      >
                                        <HelpCircle size={18} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {totalInputPages > 1 && (
                          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                               Halaman {inputPage} dari {totalInputPages}
                             </p>
                             <div className="flex gap-2">
                               <button 
                                 disabled={inputPage === 1}
                                 onClick={() => setInputPage(p => Math.max(1, p - 1))}
                                 className="px-4 py-2 rounded-xl bg-gray-100 text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-gray-200 transition-all"
                               >
                                 SEBELUMNYA
                               </button>
                               <button 
                                 disabled={inputPage === totalInputPages}
                                 onClick={() => setInputPage(p => Math.min(totalInputPages, p + 1))}
                                 className="px-4 py-2 rounded-xl bg-gray-100 text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-gray-200 transition-all"
                               >
                                 BERIKUTNYA
                               </button>
                             </div>
                          </div>
                        )}

                        <div className="flex justify-end pt-6">
                          <button
                            onClick={handleSubmitAttendance}
                            disabled={submitting}
                            className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-blue-700 disabled:opacity-50 shadow-xl shadow-blue-100 flex items-center gap-3 transition-all transform active:scale-95 uppercase tracking-widest"
                          >
                            <Save size={20} />
                            {submitting ? 'SEDANG MENYIMPAN...' : 'SIMPAN SEMUA PRESENSI'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
            case 'inquiry': return (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-50 flex items-center justify-between gap-4 bg-gray-50/30">
                    <div className="flex items-center gap-3">
                       <div className="p-2.5 bg-orange-600 text-white rounded-xl shadow-lg shadow-orange-100">
                          <MessageSquare size={20} />
                       </div>
                       <div>
                          <h2 className="text-lg font-bold text-gray-900 uppercase">Daftar Tanya Wali Kelas</h2>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Histori pertanyaan Anda ke Wali Kelas terkait ketidakhadiran siswa.</p>
                       </div>
                    </div>
                    <button 
                      onClick={() => setShowGeneralInquiryModal(true)}
                      className="bg-orange-600 text-white px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-orange-700 transition-all shadow-lg shadow-orange-100 flex items-center gap-2"
                    >
                      <Plus size={18} /> AJUKAN PERTANYAAN
                    </button>
                  </div>
                  
                  <div className="p-6">
                    <div className="space-y-4">
                      {inquiries.length > 0 ? (
                        inquiries.map((inq) => (
                          <div key={inq.id} className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
                             <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-gray-50">
                                <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center font-black">
                                      {inq.studentName.charAt(0)}
                                   </div>
                                   <div>
                                      <h3 className="font-bold text-gray-900">{inq.studentName}</h3>
                                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                        Kelas {inq.className} • Mapel: {inq.subjectName}
                                      </p>
                                   </div>
                                </div>
                                <div className="flex items-center gap-3">
                                   <span className={cn(
                                     "px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-widest",
                                     inq.status === 'Menunggu' ? "bg-orange-100 text-orange-600" :
                                     inq.status === 'Dijawab' ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
                                   )}>
                                     {inq.status}
                                   </span>
                                   <div className="text-right">
                                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{inq.day}, {new Date(inq.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                      <p className="text-[9px] font-black text-gray-500">Jam Ke: {inq.period} • Pukul: {inq.time}</p>
                                   </div>
                                </div>
                             </div>
                             <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                  <AlertCircle size={10} /> Pertanyaan Anda:
                                </p>
                                <p className="text-sm font-medium text-gray-700 italic">"{inq.message}"</p>
                             </div>
                             
                             {inq.response ? (
                               <div className="bg-green-50 p-4 rounded-xl border border-green-100 border-l-4">
                                  <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                    <CheckCircle2 size={10} /> Jawaban Wali Kelas:
                                  </p>
                                  <p className="text-sm font-bold text-gray-900 mb-1">{inq.response}</p>
                                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Oleh: {inq.respondedBy}</p>
                               </div>
                             ) : (
                               <div className="flex items-center gap-2 text-orange-500 bg-orange-50/50 p-4 rounded-xl border border-dashed border-orange-200">
                                  <Clock size={16} />
                                  <p className="text-xs font-bold uppercase tracking-widest">Menunggu respon dari Wali Kelas...</p>
                               </div>
                             )}

                             {/* Discusion Loop */}
                             {inq.replies && inq.replies.length > 0 && (
                               <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                                  {inq.replies.map((reply: any, rIdx: number) => (
                                    <div key={`${inq.id}-reply-${rIdx}`} className={cn(
                                      "p-3 rounded-xl max-w-[80%]",
                                      reply.senderRole === 'TEACHER' ? "bg-blue-50 border border-blue-100" : "bg-gray-50 border border-gray-200 ml-auto"
                                    )}>
                                      <p className="text-[9px] font-black text-gray-400 uppercase mb-1">{reply.sender}</p>
                                      <p className="text-xs font-medium text-gray-700">{reply.message}</p>
                                    </div>
                                  ))}
                               </div>
                             )}
                          </div>
                        ))
                      ) : (
                        <div className="py-24 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                           <MessageSquare size={48} className="mx-auto text-gray-300 mb-4" />
                           <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em]">Belum ada histori pertanyaan diajukan</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
            case 'history': return (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-50 flex flex-wrap items-center justify-between gap-4 bg-gray-50/30">
                    <div className="flex items-center gap-3">
                       <div className="p-2.5 bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-100">
                          <History size={20} />
                       </div>
                       <div>
                          <h2 className="text-lg font-bold text-gray-900 uppercase">Riwayat Presensi Mapel</h2>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Daftar presensi yang telah Anda simpan.</p>
                       </div>
                    </div>
                  </div>
                  
                  <div className="p-6">
                    <div className="flex flex-wrap items-center gap-4 mb-6">
                       <div className="flex-1 min-w-[200px]">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Filter Tanggal</label>
                          <input 
                            type="date"
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all font-mono"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                          />
                       </div>
                       <div className="flex-1 min-w-[150px]">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Filter Mapel</label>
                          <select 
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all font-mono"
                            value={filterSubject}
                            onChange={(e) => setFilterSubject(e.target.value)}
                          >
                            <option value="All">SEMUA MAPEL</option>
                            {Array.from(new Set(subjectAttendances.map(a => a.subjectName))).map((s: any) => (
                              <option key={`filter-s-${s}`} value={s}>{String(s).toUpperCase()}</option>
                            ))}
                          </select>
                       </div>
                       <div className="flex-1 min-w-[150px]">
                          <select 
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all font-mono"
                            value={filterClass}
                            onChange={(e) => setFilterClass(e.target.value)}
                          >
                            <option value="All">SEMUA KELAS</option>
                            {classes.map(cl => (
                              <option key={`filter-c-${cl.id}`} value={cl.name}>{cl.name}</option>
                            ))}
                          </select>
                       </div>
                    </div>

                    <div className="overflow-x-auto rounded-3xl border border-gray-100">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-blue-50">
                            <th className="p-4 text-[10px] font-black text-blue-600 uppercase tracking-widest whitespace-nowrap">Tanggal / Waktu</th>
                            <th className="p-4 text-[10px] font-black text-blue-600 uppercase tracking-widest whitespace-nowrap">Siswa / Kelas</th>
                            <th className="p-4 text-[10px] font-black text-blue-600 uppercase tracking-widest whitespace-nowrap">Mata Pelajaran</th>
                            <th className="p-4 text-[10px] font-black text-blue-600 uppercase tracking-widest text-center whitespace-nowrap">Status</th>
                            <th className="p-4 text-[10px] font-black text-blue-600 uppercase tracking-widest whitespace-nowrap">Catatan</th>
                            <th className="p-4 text-[10px] font-black text-blue-600 uppercase tracking-widest text-center whitespace-nowrap">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-sm">
                          {paginatedHistory.map((att) => (
                            <tr key={att.id} className="hover:bg-blue-50/30 transition-colors group">
                              <td className="p-4 whitespace-nowrap">
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-gray-900">{formatDate(att.date)}</span>
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Jam: {att.period}</span>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-[10px] font-black uppercase">
                                    {att.studentName?.charAt(0) || '?'}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-gray-900 leading-tight">{att.studentName}</p>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">KELAS {att.className}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="p-4">
                                <span className="text-xs font-bold text-blue-600 uppercase">{att.subjectName}</span>
                              </td>
                              <td className="p-4 text-center whitespace-nowrap">
                                <span className={cn(
                                  "px-2 py-1 text-[9px] font-black rounded-lg uppercase tracking-tighter border",
                                  statusColors[att.status as keyof typeof statusColors]
                                )}>
                                  {att.status === 'H' ? 'Hadir' : att.status === 'S' ? 'Sakit' : att.status === 'I' ? 'Izin' : att.status === 'D' ? 'Dispen' : 'Alpa'}
                                </span>
                              </td>
                              <td className="p-4">
                                <input 
                                  type="text"
                                  defaultValue={att.notes}
                                  onBlur={(e) => handleUpdateHistoryNotes(att.id, e.target.value)}
                                  className="w-full bg-transparent border-0 border-b border-dashed border-gray-200 focus:border-blue-500 outline-none text-[11px] text-gray-600 italic font-medium"
                                  placeholder="Tanpa catatan..."
                                />
                              </td>
                              <td className="p-4 text-center">
                                <button 
                                  onClick={() => handleDeleteAttendance(att.id)}
                                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                       {paginatedHistory.length === 0 && (
                         <div className="py-24 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200 m-4">
                           <History size={48} className="mx-auto text-gray-300 mb-4" />
                           <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em]">Tidak ada riwayat presensi ditemukan</p>
                         </div>
                       )}
                    </div>

                    {totalHistoryPages > 1 && (
                      <div className="flex items-center justify-between pt-6 border-t border-gray-100 mt-6">
                         <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                           Halaman {historyPage} dari {totalHistoryPages}
                         </p>
                         <div className="flex gap-2">
                           <button 
                             disabled={historyPage === 1}
                             onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                             className="px-4 py-2 rounded-xl bg-gray-100 text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-gray-200 transition-all font-mono"
                           >
                             PREV
                           </button>
                           <button 
                             disabled={historyPage === totalHistoryPages}
                             onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                             className="px-4 py-2 rounded-xl bg-gray-100 text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-gray-200 transition-all font-mono"
                           >
                             NEXT
                           </button>
                         </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
            case 'tasks': return (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-50 flex flex-wrap items-center justify-between gap-4 bg-gray-50/30">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-green-600 text-white rounded-xl shadow-lg shadow-green-100">
                        <FileText size={20} />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900 uppercase">Manajemen Tugas Siswa</h2>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Kelola tugas yang diberikan kepada siswa.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowTaskModal(true)}
                      className="bg-green-600 text-white px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-green-700 transition-all shadow-lg shadow-green-100 flex items-center gap-2"
                    >
                      <Plus size={18} /> Tambah Tugas Baru
                    </button>
                  </div>
                  
                  <div className="p-6">
                    <div className="overflow-x-auto rounded-3xl border border-gray-100">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-green-50">
                            <th className="p-4 text-[10px] font-black text-green-600 uppercase tracking-widest">Judul Tugas</th>
                            <th className="p-4 text-[10px] font-black text-green-600 uppercase tracking-widest">Kelas</th>
                            <th className="p-4 text-[10px] font-black text-green-600 uppercase tracking-widest">Mapel</th>
                            <th className="p-4 text-[10px] font-black text-green-600 uppercase tracking-widest text-center">Tenggat</th>
                            <th className="p-4 text-[10px] font-black text-green-600 uppercase tracking-widest text-center">Status</th>
                            <th className="p-4 text-[10px] font-black text-green-600 uppercase tracking-widest text-center">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {tasks.map((task, idx) => (
                            <tr key={`${task.id || 'task'}-${idx}`} className="hover:bg-green-50/30 transition-colors">
                              <td className="p-4 text-sm font-bold text-gray-900">{task.title}</td>
                              <td className="p-4 text-xs font-bold text-gray-500 uppercase">{task.className}</td>
                              <td className="p-4 text-xs font-bold text-green-600 uppercase">{task.subjectName}</td>
                              <td className="p-4 text-center text-xs font-bold text-orange-600">{formatDate(task.dueDate)}</td>
                              <td className="p-4 text-center">
                                <span className={cn(
                                  "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter border",
                                  task.status === 'Aktif' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-gray-50 text-gray-500 border-gray-100'
                                )}>
                                  {task.status}
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <button 
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {tasks.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-12 text-center text-sm font-bold text-gray-400 uppercase tracking-[0.2em]">
                                Belum ada tugas yang dibuat
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
            case 'monthly': return (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-50 flex flex-wrap items-center justify-between gap-4 bg-gray-50/30">
                     <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100">
                           <FileText size={20} />
                        </div>
                        <div>
                           <h2 className="text-lg font-bold text-gray-900 uppercase">Rekap Bulanan Mapel</h2>
                           <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Rekapitulasi absensi per bulan dalam format tabel.</p>
                        </div>
                     </div>
                  </div>
                  
                  <div className="p-6">
                     <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 flex flex-wrap items-center gap-6 mb-8">
                        <div className="flex-1 min-w-[200px] space-y-2">
                           <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-1">Pilih Kelas</label>
                           <select 
                             value={selectedClass}
                             onChange={(e) => setSelectedClass(e.target.value)}
                             className="w-full p-3 bg-white border border-blue-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
                           >
                             <option value="">-- PILIH KELAS --</option>
                             {classes.map((cl, idx) => <option key={`monthly-cl-${cl.id || 'c'}-${idx}`} value={cl.name}>{cl.name}</option>)}
                           </select>
                        </div>
                        <div className="flex-1 min-w-[200px] space-y-2">
                           <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-1">Nama Mata Pelajaran</label>
                           <input 
                             type="text"
                             placeholder="Isi Nama Mapel..."
                             value={subjectName}
                             onChange={e => setSubjectName(e.target.value)}
                             className="w-full p-3 bg-white border border-blue-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all shadow-sm"
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
                       <div className="py-24 text-center bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl">
                          <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                          <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em]">Pilih Kelas dan isi Nama Mapel untuk melihat laporan</p>
                       </div>
                     )}
                  </div>
                </div>
              </div>
            );
            case 'semester': return (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                   <div className="p-6 border-b border-gray-50 flex flex-wrap items-center justify-between gap-4 bg-gray-50/30">
                      <div className="flex items-center gap-3">
                         <div className="p-2.5 bg-green-600 text-white rounded-xl shadow-lg shadow-green-100">
                            <BookOpen size={20} />
                         </div>
                         <div>
                            <h2 className="text-lg font-bold text-gray-900 uppercase">Rekap Semester Mapel</h2>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Rekapitulasi absensi kumulatif selama satu semester.</p>
                         </div>
                      </div>
                   </div>
                   
                   <div className="p-6">
                      <div className="bg-green-50/50 p-6 rounded-3xl border border-green-100 flex flex-wrap items-center gap-6 mb-8">
                        <div className="flex-1 min-w-[200px] space-y-2">
                           <label className="text-[10px] font-black text-green-600 uppercase tracking-widest ml-1">Pilih Kelas</label>
                           <select 
                             value={selectedClass}
                             onChange={(e) => setSelectedClass(e.target.value)}
                             className="w-full p-3 bg-white border border-green-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-green-100 transition-all shadow-sm"
                           >
                             <option value="">-- PILIH KELAS --</option>
                             {classes.map((cl, idx) => <option key={`semester-cl-${cl.id || 'c'}-${idx}`} value={cl.name}>{cl.name}</option>)}
                           </select>
                        </div>
                        <div className="flex-1 min-w-[200px] space-y-2">
                           <label className="text-[10px] font-black text-green-600 uppercase tracking-widest ml-1">Nama Mata Pelajaran</label>
                           <input 
                             type="text"
                             placeholder="Isi Nama Mapel..."
                             value={subjectName}
                             onChange={e => setSubjectName(e.target.value)}
                             className="w-full p-3 bg-white border border-green-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-green-100 transition-all shadow-sm"
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
                        <div className="py-24 text-center bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl">
                           <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
                           <p className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em]">Pilih Kelas dan isi Nama Mapel untuk melihat rekap semester</p>
                        </div>
                      )}
                   </div>
                </div>
              </div>
            );
            default: return null;
          }
        })()}
      </div>
      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 h-full flex flex-col">
          <div className="p-6 border-b border-gray-50 flex items-center gap-3">
            <div className="p-2 bg-orange-600 text-white rounded-lg">
               <Clock size={20} />
            </div>
            <h2 className="text-lg font-bold text-gray-900 uppercase">TANYA WALI KELAS TERBARU</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Inquiry/History content here... */}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {toastNotif && (
          <div className="fixed top-24 right-6 z-[110] max-w-sm">
            <SimpleNotification 
              title={toastNotif.title}
              message={toastNotif.message}
              onClose={() => setToastNotif(null)}
            />
          </div>
        )}
      </AnimatePresence>
      {(unreadInquiries.length > 0 || unreadNotifications.length > 0) && (
        <div className="bg-orange-50 border border-orange-200 p-4 rounded-2xl flex items-center justify-between text-orange-800 text-sm font-bold">
           <div className="flex items-center gap-2">
             <AlertCircle size={20} />
             <span>
               {unreadInquiries.length > 0 && <span>Anda memiliki {unreadInquiries.length} pesan TANYA WALI KELAS baru.</span>}
               {unreadInquiries.length > 0 && unreadNotifications.length > 0 && <span> dan </span>}
               {unreadNotifications.length > 0 && <span>ada {unreadNotifications.length} balasan baru dari Wali Kelas.</span>}
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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 p-1 bg-gray-50 border border-gray-100 rounded-2xl">
            <button 
              onClick={() => setActiveTab('notifications')}
              className={cn(
                "relative p-2.5 rounded-xl transition-all",
                activeTab === 'notifications' ? "bg-red-600 text-white shadow-lg shadow-red-200" : "bg-white text-gray-400 hover:text-red-500 border border-gray-100"
              )}
            >
              <Bell size={20} />
              {unreadNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white animate-bounce">
                  {unreadNotifications.length}
                </span>
              )}
            </button>
          </div>
          <RoleSwitcher />
        </div>
      </div>

      {renderView()}

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
                <X size={20} />
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

      {/* General Inquiry Modal */}
      {showGeneralInquiryModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
          >
            <div className="p-6 bg-orange-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <MessageSquare size={20} />
                </div>
                <h3 className="font-bold text-lg uppercase tracking-tight">Ajukan Pertanyaan</h3>
              </div>
              <button 
                onClick={() => setShowGeneralInquiryModal(false)}
                className="hover:bg-white/20 p-2 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Pilih Kelas</label>
                  <select 
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-orange-100 transition-all cursor-pointer"
                    value={generalInqForm.className}
                    onChange={(e) => {
                      setGeneralInqForm({...generalInqForm, className: e.target.value, studentId: ''});
                      setSelectedClass(e.target.value); // Triggering student fetch
                    }}
                  >
                    <option value="">-- PILIH KELAS --</option>
                    {classes.map((cl, idx) => (
                      <option key={`gen-inq-class-${cl.id || 'c'}-${idx}`} value={cl.name}>{cl.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Pilih Siswa</label>
                  <select 
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-orange-100 transition-all cursor-pointer disabled:opacity-50"
                    value={generalInqForm.studentId}
                    disabled={!generalInqForm.className}
                    onChange={(e) => setGeneralInqForm({...generalInqForm, studentId: e.target.value})}
                  >
                    <option value="">-- PILIH SISWA --</option>
                    {students.map((s, idx) => (
                      <option key={`gen-inq-stud-${s.id || 's'}-${idx}`} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Mata Pelajaran</label>
                <input 
                  type="text"
                  readOnly
                  className="w-full p-3 bg-gray-100 border border-gray-200 rounded-2xl text-sm font-bold text-gray-500 outline-none"
                  value={subjectName}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Pesan Pertanyaan</label>
                <textarea 
                  rows={4}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium outline-none focus:ring-4 focus:ring-orange-100 transition-all"
                  placeholder="Tuliskan pertanyaan atau informasi Anda untuk Wali Kelas..."
                  value={generalInqForm.message}
                  onChange={(e) => setGeneralInqForm({...generalInqForm, message: e.target.value})}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowGeneralInquiryModal(false)}
                  className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  BATAL
                </button>
                <button
                  disabled={submitting || !generalInqForm.message || !generalInqForm.studentId}
                  onClick={handleSubmitGeneralInquiry}
                  className="flex-[2] py-4 bg-orange-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-orange-700 disabled:opacity-50 shadow-xl shadow-orange-100 flex items-center justify-center gap-2 transition-all transform active:scale-95"
                >
                  {submitting ? 'SEDANG MENGIRIM...' : 'KIRIM PERTANYAAN'}
                  <Send size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
          >
            <div className="p-6 bg-purple-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Plus size={20} />
                </div>
                <h3 className="font-bold text-lg uppercase tracking-tight">Tambah Tugas Baru</h3>
              </div>
              <button 
                onClick={() => setShowTaskModal(false)}
                className="hover:bg-white/20 p-2 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Pilih Kelas</label>
                  <select 
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-purple-100 transition-all cursor-pointer"
                    value={taskForm.className}
                    onChange={(e) => setTaskForm({...taskForm, className: e.target.value})}
                  >
                    <option value="">-- PILIH KELAS --</option>
                    {classes.map((cl, idx) => (
                      <option key={`task-class-option-${cl.id || 'c'}-${idx}`} value={cl.name}>{cl.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tenggat Waktu</label>
                  <input 
                    type="date"
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-purple-100 transition-all"
                    value={taskForm.dueDate}
                    onChange={(e) => setTaskForm({...taskForm, dueDate: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Mata Pelajaran</label>
                <input 
                  type="text"
                  placeholder="Contoh: Matematika"
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-purple-100 transition-all"
                  value={taskForm.subject}
                  onChange={(e) => setTaskForm({...taskForm, subject: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Judul Tugas</label>
                <input 
                  type="text"
                  placeholder="Contoh: PR Aljabar Halaman 45"
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 focus:ring-purple-100 transition-all"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({...taskForm, title: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Deskripsi Tugas</label>
                <textarea 
                  rows={4}
                  placeholder="Berikan instruksi detail tugas di sini..."
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-purple-100 outline-none text-sm font-medium"
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({...taskForm, description: e.target.value})}
                />
              </div>

              <div className="flex items-center gap-4 pt-4">
                <button
                  onClick={() => setShowTaskModal(false)}
                  className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Batal
                </button>
                <button
                  disabled={submitting || !taskForm.title || !taskForm.dueDate || !taskForm.className}
                  onClick={handleSubmitTask}
                  className="flex-2 py-4 bg-purple-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-purple-800 disabled:opacity-50 shadow-xl shadow-purple-100"
                >
                  {submitting ? 'MEMPROSES...' : 'PUBLIKASIKAN TUGAS'}
                  <Save size={18} />
                </button>
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

const Placeholder = ({ title }: { title: string }) => (
  <div className="p-8 bg-gray-50 rounded-3xl border border-dashed border-gray-200 text-center">
    <AlertCircle className="mx-auto text-gray-300 mb-2" size={32} />
    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">{title} - Dalam Pengembangan</p>
  </div>
);

