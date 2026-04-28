import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Edit, 
  Search, 
  Database, 
  Users, 
  GraduationCap, 
  Calendar,
  Save,
  CheckCircle2,
  X,
  XCircle,
  FilePlus,
  RefreshCw,
  LayoutGrid,
  Filter,
  FileText,
  Download,
  Clock,
  AlertCircle,
  Calendar as CalendarIcon,
  MapPin,
  Smartphone,
  MessageCircle,
  CloudUpload,
  IdCard
} from 'lucide-react';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, orderBy, onSnapshot, Timestamp, serverTimestamp } from 'firebase/firestore';
import { cn, formatDate } from '../lib/utils';
import { Student, Teacher, AcademicYear, AttendanceRecord } from '../types';
import { useAuthStore } from '../lib/auth-store';
import * as XLSX from 'xlsx';
import { parseWhatsAppMessage } from '../lib/whatsapp-parser';
import {ROLE_LABELS} from '../constants';
import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

import { useSearchParams } from 'react-router-dom';
import AttendanceRecapTable from '../components/AttendanceRecapTable';
import SemesterAttendanceRecapTable from '../components/SemesterAttendanceRecapTable';
import IndividualAttendance from '../components/IndividualAttendance';
import AttendanceChart from '../components/AttendanceChart';
import AttendanceTrendChart from '../components/AttendanceTrendChart';
import AttendanceAlertsDisplay from '../components/AttendanceAlertsDisplay';
import ActiveAcademicYearDisplay from '../components/ActiveAcademicYearDisplay';
import { checkAttendanceAlert } from '../services/attendanceNotificationService';
import SchoolDataSettings from '../components/SchoolDataSettings';
import LogoSettings from '../components/LogoSettings';
import StudentPIITab from '../components/StudentPIITab';

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const [authReady, setAuthReady] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as any;

  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'student-pii' | 'teachers' | 'teachers-list' | 'subject-teachers' | 'classes' | 'counselors' | 'attendance' | 'attendance-summary' | 'attendance-detail' | 'attendance-individual' | 'settings' | 'rekap' | 'rekapSemester' | 'school' | 'attendance-officer-history' | 'attendance-officer-rekap' | 'role-management-guru' | 'role-management-petugas' | 'subject-attendance-report'>(tabParam === 'role-management' ? 'role-management-guru' : (tabParam || 'overview'));

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
        setAuthReady(!!u);
    });
  }, []);

  useEffect(() => {
    if (tabParam === 'attendance') {
      setActiveTab('attendance-summary');
    } else if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    } else if (!tabParam) {
      setActiveTab('overview');
    }
  }, [tabParam]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [roleManagementPage, setRoleManagementPage] = useState(1);
  const [showAddOfficerForm, setShowAddOfficerForm] = useState(false);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [subjectAttendances, setSubjectAttendances] = useState<any[]>([]);
  const [subjectInquiries, setSubjectInquiries] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, onConfirm: () => void}>({isOpen: false, message: '', onConfirm: () => {}});
  
  const showConfirm = (message: string, onConfirm: () => void) => {
    setConfirmDialog({isOpen: true, message, onConfirm});
  };
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [newAttendanceNotification, setNewAttendanceNotification] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady) return;

    const q = query(
      collection(db, 'attendance'),
      orderBy('submittedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const newItem = { id: change.doc.id, ...change.doc.data() } as AttendanceRecord;
          // Only show if it's actual new data (check submittedAt if possible, or just skip first bulk load)
          // Since it's a real-time app, we want the toast for truly new items
          const submittedAt = newItem.submittedAt?.toDate ? newItem.submittedAt.toDate() : new Date();
          const now = new Date();
          if (now.getTime() - submittedAt.getTime() < 10000) { // within 10 seconds
            setNewAttendanceNotification(`Pengajuan Baru: ${newItem.studentName} (${newItem.className}) - ${newItem.type}: ${newItem.reason}`);
            fetchData();
          }
        }
      });
    });

    return () => unsubscribe();
  }, [authReady]);

  // Pagination & Multi-select
  const [studentPage, setStudentPage] = useState(1);
  const [teacherListPage, setTeacherListPage] = useState(1);
  const [waliKelasPage, setWaliKelasPage] = useState(1);
  const [subjectTeacherPage, setSubjectTeacherPage] = useState(1);
  const [counselorPage, setCounselorPage] = useState(1);
  const [classPage, setClassPage] = useState(1);
  const [officerListPage, setOfficerListPage] = useState(1);
  const [subjectInquiryPage, setSubjectInquiryPage] = useState(1);
  const [summaryPage, setSummaryPage] = useState(1);
  const [attendanceDetailPage, setAttendanceDetailPage] = useState(1);
  const [selectedClassOfficers, setSelectedClassOfficers] = useState<string[]>([]);

  const handleSaveOfficers = async () => {
    if (!formData.tempClassForOfficer) return;
    setLoading(true);
    try {
      const classStudents = students.filter(s => s.className === formData.tempClassForOfficer);
      const promises = classStudents.map(s => {
        const isNowOfficer = selectedClassOfficers.includes(s.id!);
        const wasOfficer = (s as any).role === 'STUDENT';
        if (isNowOfficer !== wasOfficer) {
          return updateDoc(doc(db, 'students', s.id!), {
            role: isNowOfficer ? 'STUDENT' : null
          });
        }
        return null;
      }).filter(p => p !== null);

      await Promise.all(promises);
      setStatusMessage('Petugas kelas berhasil disimpan!');
      setTimeout(() => setStatusMessage(''), 3000);
      fetchData();
    } catch (err: any) {
      handleFirestoreError(err, 'update' as any, 'students-role');
    } finally {
      setLoading(false);
    }
  };

  const allOfficers = useMemo(() => {
    return students.filter(s => (s as any).role === 'STUDENT')
      .sort((a,b) => (a.className || '').localeCompare(b.className || '', undefined, {numeric: true}) || (a.name || '').localeCompare(b.name || ''));
  }, [students]);

  const handleRemoveOfficer = (id: string) => {
    showConfirm('Hapus peran petugas dari siswa ini?', async () => {
      try {
        await updateDoc(doc(db, 'students', id), { role: null });
        fetchData();
        setStatusMessage('Petugas berhasil dihapus');
        setTimeout(() => setStatusMessage(''), 3000);
      } catch (err: any) {
        handleFirestoreError(err, 'update' as any, 'students-role');
      }
    });
  };
  const itemsPerPage = 12;
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  
  // Counselor specific filtering
  const [filterMode, setFilterMode] = useState<'all' | 'managed'>(user?.role === 'COUNSELOR' ? 'managed' : 'all');
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState<any>({});

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printClass, setPrintClass] = useState('');

  const downloadStudentsPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Data Siswa ' + (classFilter || 'Semua Kelas'), 14, 20);
    
    let filteredStudents = students;
    if (classFilter) {
      filteredStudents = filteredStudents.filter(s => s.className === classFilter);
    } else if (searchTerm) {
      filteredStudents = filteredStudents.filter(s => 
        (s.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (s.nis?.includes(searchTerm)) ||
        (s.nisn?.includes(searchTerm))
      );
    }

    const sortedStudents = [...filteredStudents].sort((a, b) => {
      if (a.className !== b.className) return (a.className || '').localeCompare(b.className || '', undefined, {numeric: true});
      return (a.absensiNo || '').localeCompare(b.absensiNo || '', undefined, {numeric: true});
    });

    const body = sortedStudents.map((s, idx) => [
      (idx + 1).toString(),
      s.absensiNo || '-',
      s.name,
      s.nis || '-',
      s.nisn || '-',
      s.parentPassword || '-',
      s.className || '-',
      s.gender || '-'
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['No', 'No. Absen', 'Nama Lengkap', 'NIS', 'NISN', 'SANDI', 'Kelas', 'L/P']],
      body: body,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`Data_Siswa${classFilter ? `_${classFilter}` : ''}.pdf`);
  };

  const downloadTeachersPDF = (type: 'Wali Kelas' | 'Semua Guru' | 'Guru Mapel') => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Data ${type}`, 14, 20);
    
    let currentTeachers = teachers;
    if (type === 'Wali Kelas') {
      currentTeachers = teachers.filter(t => t.status?.includes('Wali Kelas'));
    } else if (type === 'Guru Mapel') {
      currentTeachers = teachers.filter(t => t.status?.includes('Guru Mata Pelajaran'));
    }

    if (searchTerm) {
      currentTeachers = currentTeachers.filter(t => 
        (t.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.nip?.includes(searchTerm)) ||
        (t.email?.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    const sortedTeachers = [...currentTeachers].sort((a,b) => (a.name || '').localeCompare(b.name || ''));

    const body = sortedTeachers.map((t, idx) => {
      if (type === 'Wali Kelas') {
        return [
          (idx + 1).toString(),
          t.name,
          t.nip || '-',
          t.password || '-',
          (t.taughtClasses || []).join(', ') || '-'
        ];
      } else if (type === 'Guru Mapel') {
        return [
          (idx + 1).toString(),
          t.name,
          t.nip || '-',
          t.password || '-',
          (t.subjects || []).join(', ') || '-',
          (t.taughtClasses || []).join(', ') || '-'
        ];
      } else {
        return [
          (idx + 1).toString(),
          t.name,
          t.nip || '-',
          t.password || '-',
          (t.status || []).join(', ') || '-'
        ];
      }
    });

    let head = [];
    if (type === 'Wali Kelas') head = [['No', 'Nama Guru', 'NIP', 'SANDI', 'Kelas Ampuan']];
    else if (type === 'Guru Mapel') head = [['No', 'Nama Guru', 'NIP', 'SANDI', 'Mata Pelajaran', 'Kelas yang Diajar']];
    else head = [['No', 'Nama Guru', 'NIP', 'SANDI', 'Status/Tugas']];

    autoTable(doc, {
      startY: 30,
      head: head,
      body: body,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`Data_${type.replace(' ', '_')}.pdf`);
  };

  const handleGenerateAutoPasswords = () => {
    showConfirm("Apakah Anda yakin ingin mengganti semua sandi orang tua sesuai aturan (Kelas + No Absen)?", async () => {
      setLoading(true);
      try {
        const dbClasses = Array.from(new Set(students.map(s => s.className)));
        const promises = [];
        for (const cl of dbClasses) {
          if (!cl) continue;
          const classStudents = students.filter(s => s.className === cl).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
          classStudents.forEach((s, idx) => {
            const noUrut = s.absensiNo ? s.absensiNo.padStart(2, '0') : (idx + 1).toString().padStart(2, '0');
            const cleanClass = (cl as string).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            const prefix = cleanClass.length >= 2 ? cleanClass.substring(0, 2) : cleanClass.padEnd(2, 'A');
            let pass = (prefix + noUrut).substring(0, 4);

            promises.push(updateDoc(doc(db, 'students', s.id!), { parentPassword: pass }));
          });
        }
        await Promise.all(promises);
        alert('Sandi orang tua berhasil diperbarui secara otomatis!');
        fetchData();
      } catch (e: any) {
         console.error(e);
         handleFirestoreError(e, 'write', 'students');
      } finally {
        setLoading(false);
      }
    });
  };

  const printLoginCards = (selectedClass: string) => {
    const classSds = students.filter(s => s.className === selectedClass);
    if (classSds.length === 0) {
      alert('Tidak ada siswa di kelas ini.');
      return;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const cardWidth = 90;
    const cardHeight = 55;
    const margin = 10;
    const cardsPerRow = 2;
    const cardsPerCol = 5;
    const xSpacing = (210 - (cardWidth * cardsPerRow) - (margin * 2)) / (cardsPerRow - 1 || 1);
    const ySpacing = (297 - (cardHeight * cardsPerCol) - (margin * 2)) / (cardsPerCol - 1 || 1);

    classSds.forEach((s, index) => {
      const pageIndex = index % (cardsPerRow * cardsPerCol);
      if (index > 0 && pageIndex === 0) doc.addPage();

      const row = Math.floor(pageIndex / cardsPerRow);
      const col = pageIndex % cardsPerRow;

      const x = margin + col * (cardWidth + xSpacing);
      const y = margin + row * (cardHeight + ySpacing);

      // Card border
      doc.setDrawColor(200);
      doc.rect(x, y, cardWidth, cardHeight);

      // Header
      doc.setFillColor(30, 64, 175);
      doc.rect(x, y, cardWidth, 12, 'F');
      doc.setTextColor(255);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("KARTU LOGIN SISWA", x + cardWidth / 2, y + 5, { align: "center" });
      doc.setFontSize(7);
      doc.text("SMP NEGERI 2 MAGELANG", x + cardWidth / 2, y + 9, { align: "center" });

      // Content
      doc.setTextColor(0);
      doc.setFontSize(9);
      doc.text(`Nama : ${s.name}`, x + 5, y + 20);
      doc.text(`Kelas : ${s.className}`, x + 5, y + 25);
      
      doc.setDrawColor(230);
      doc.line(x + 5, y + 28, x + cardWidth - 5, y + 28);

      doc.setFontSize(8);
      doc.text("Kredensial Login:", x + 5, y + 33);
      doc.setFontSize(10);
      doc.text(`Username (NIS): ${s.nis}`, x + 5, y + 39);
      doc.text(`SANDI: ${s.parentPassword || '-'}`, x + 5, y + 45);
      
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text("Situs: absensi-smpn2magelang.web.app", x + 5, y + 51);
    });

    doc.save(`Kartu_Login_Kelas_${selectedClass}.pdf`);
  };

  const fetchData = async () => {
    if (!auth.currentUser) {
      console.warn("Attempted to fetch data but not authenticated");
      return;
    }
    setLoading(true);
    try {
      const [stdSnap, teaSnap, attSnap, yearSnap, counsSnap, classSnap, subAttSnap, inqSnap, schoolSnap] = await Promise.all([
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'teachers')),
        getDocs(query(collection(db, 'attendance'), orderBy('submittedAt', 'desc'))),
        getDocs(collection(db, 'academicYears')),
        getDocs(collection(db, 'counselors')),
        getDocs(collection(db, 'classes')),
        getDocs(query(collection(db, 'subjectAttendance'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'subjectInquiries')),
        getDocs(collection(db, 'schoolData'))
      ]);

      setStudents(stdSnap.docs.map(d => ({ ...d.data(), id: d.id } as Student)));
      setTeachers(teaSnap.docs.map(d => ({ ...d.data(), id: d.id } as Teacher)));
      const newAttendance = attSnap.docs.map(d => {
        const data = d.data();
        return { ...data, id: d.id } as AttendanceRecord;
      });
      setAttendance(newAttendance);

      // Check alerts
      const studentsData = stdSnap.docs.map(d => ({...d.data(), id: d.id} as Student));
      for (const s of studentsData) {
        await checkAttendanceAlert(s.id, s.name, s.className, newAttendance, 3, 10);
      }
      setSubjectAttendances(subAttSnap.docs.map(d => ({ ...d.data(), id: d.id })));
      setSubjectInquiries(inqSnap.docs.map(d => ({ ...d.data(), id: d.id })));
      setAcademicYears(yearSnap.docs.map(d => ({ ...d.data(), id: d.id } as AcademicYear)));
      if (!schoolSnap.empty) {
        setSchoolInfo(schoolSnap.docs[0].data());
      }
      setCounselors(counsSnap.docs.map(d => ({ ...d.data(), id: d.id })));
      setClasses(classSnap.docs.map(d => ({ ...d.data(), id: d.id })));
    } catch (err: any) {
      handleFirestoreError(err, 'list', 'Admin initial data fetch');
    } finally {
      setLoading(false);
    }
  };

  const studentSummaryByClass = useMemo(() => {
    const summary: { [key: string]: { l: number; p: number; total: number } } = {};
    students.forEach(s => {
      const cls = s.className || 'Unknown';
      if (!summary[cls]) summary[cls] = { l: 0, p: 0, total: 0 };
      const gender = (s.gender || '').trim().toLowerCase();
      if (gender === 'l' || gender.startsWith('laki')) summary[cls].l++;
      else if (gender === 'p' || gender.startsWith('perem')) summary[cls].p++;
      summary[cls].total++;
    });
    return Object.entries(summary)
      .sort(([a], [b]) => (a || '').localeCompare(b || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [students]);

  const totalStudentStats = useMemo(() => {
    return students.reduce((acc, s) => {
      const gender = (s.gender || '').trim().toLowerCase();
      if (gender === 'l' || gender.startsWith('laki')) acc.l++;
      else if (gender === 'p' || gender.startsWith('perem')) acc.p++;
      acc.total++;
      return acc;
    }, { l: 0, p: 0, total: 0 });
  }, [students]);

  useEffect(() => {
    if (user && authReady) {
      fetchData();
    }
  }, [user, authReady]);


  const generatePasswordsForClass = async (className: string) => {
    try {
      const q = query(collection(db, 'students'), where('className', '==', className));
      const snap = await getDocs(q);
      const classStudents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
      const promises = [];
      classStudents.forEach((s, idx) => {
        const noUrut = s.absensiNo ? s.absensiNo.padStart(2, '0') : (idx + 1).toString().padStart(2, '0');
        const cleanClass = className.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const prefix = cleanClass.length >= 2 ? cleanClass.substring(0, 2) : cleanClass.padEnd(2, 'A');
        const pass = (prefix + noUrut).substring(0, 4);
        if (s.parentPassword !== pass) {
          promises.push(updateDoc(doc(db, 'students', s.id!), { parentPassword: pass }));
        }
      });
      await Promise.all(promises);
    } catch (e) {
      console.error('Failed to auto-generate password:', e);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      alert("Sesi keamanan Firebase belum siap. Silakan tunggu sebentar atau muat ulang halaman.");
      return;
    }
    setLoading(true);
    try {
      const colName = 
          activeTab === 'students' ? 'students' : 
          activeTab === 'teachers' ? 'teachers' : 
          activeTab === 'teachers-list' ? 'teachers' :
          activeTab === 'subject-teachers' ? 'teachers' :
          activeTab === 'classes' ? 'classes' : 
          activeTab === 'counselors' ? 'counselors' : 
          activeTab === 'role-management-guru' || activeTab === 'role-management-petugas' ? 'users' :
          activeTab === 'settings' ? 'academicYears' : '';

      if (!colName) {
        setLoading(false);
        return;
      }

      let payload = { ...formData };
      
      // Special logic for counselors
      if (activeTab === 'counselors') {
        payload = {
          ...payload,
          managedClasses: formData.managedClasses ? (Array.isArray(formData.managedClasses) ? formData.managedClasses : formData.managedClasses.split(',').map((s: string) => s.trim())) : []
        };
      }
      if (activeTab === 'teachers' || activeTab === 'teachers-list' || activeTab === 'subject-teachers') {
        payload = {
          ...payload,
          status: Array.isArray(formData.status) ? formData.status : (formData.status ? [formData.status] : [])
        };
        // Auto password: first 8 digits of NIP
        if (payload.nip && payload.nip.length >= 8) {
          payload.password = payload.nip.substring(0, 8);
        }
      }
      if (activeTab === 'subject-teachers') {
        payload = {
          ...payload,
          subjects: formData.subjects ? (Array.isArray(formData.subjects) ? formData.subjects : formData.subjects.split(',').map((s: string) => s.trim())) : [],
          taughtClasses: formData.taughtClasses ? (Array.isArray(formData.taughtClasses) ? formData.taughtClasses : formData.taughtClasses.split(',').map((s: string) => s.trim())) : [],
          status: Array.isArray(formData.status) ? (formData.status.includes('Guru Mata Pelajaran') ? formData.status : [...formData.status, 'Guru Mata Pelajaran']) : ['Guru Mata Pelajaran']
        };
      }
      if (activeTab === 'role-management-guru' || activeTab === 'role-management-petugas') {
        payload = {
          ...payload
        };
        if (formData.role !== undefined) {
          payload.role = formData.role;
        }
        
        // Ensure arrays for teacher roles if we are in management mode
        if (formData.isChangingRole) {
          payload.subjects = formData.subjects ? (typeof formData.subjects === 'string' ? formData.subjects.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0) : formData.subjects) : [];
          payload.taughtClasses = formData.taughtClasses ? (typeof formData.taughtClasses === 'string' ? formData.taughtClasses.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0) : formData.taughtClasses) : [];
          payload.managedClasses = formData.managedClasses ? (typeof formData.managedClasses === 'string' ? formData.managedClasses.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0) : formData.managedClasses) : [];
        }
      }

      if (formData.isChangingRole) {
        // We are updating a teacher's specific roles (Wali Kelas, etc)
        const { id, isChangingRole, ...dataToUpdate } = payload;
        Object.keys(dataToUpdate).forEach(key => dataToUpdate[key] === undefined && delete dataToUpdate[key]);
        await updateDoc(doc(db, 'teachers', id), dataToUpdate);
      } else if (formData.id) {
        // Update existing
        const { id, ...dataToUpdate } = payload;
        Object.keys(dataToUpdate).forEach(key => dataToUpdate[key] === undefined && delete dataToUpdate[key]);
        await updateDoc(doc(db, colName, id), dataToUpdate);
      } else {
        // Add new
        if (activeTab === 'settings') {
           payload = { ...payload, active: false };
        }
        await addDoc(collection(db, colName), payload);
      }

      if (activeTab === 'students' && payload.className) {
         await generatePasswordsForClass(payload.className);
      }

      setShowAddModal(false);
      setFormData({});
      fetchData();
    } catch (err: any) {
      handleFirestoreError(err, 'write', `Admin action in ${activeTab}`);
    } finally {
      setLoading(false);
    }
  };

  const [filterType, setFilterType] = useState('All');
  const [showImportModal, setShowImportModal] = useState(false);
  const [waText, setWaText] = useState('');
  const [parsedWAData, setParsedWAData] = useState<any>(null);
  const [filterDate, setFilterDate] = useState('');

  const filteredAttendance = useMemo(() => {
    return attendance.filter(a => {
      const matchSearch = a.studentName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchDate = !filterDate || a.date === filterDate;
      const matchClass = !classFilter || a.className === classFilter;
      const matchType = filterType === 'All' || a.type === filterType;
      
      let matchCounselor = true;
      if (user?.role === 'COUNSELOR' && filterMode === 'managed') {
        matchCounselor = user.managedClasses?.includes(a.className) || false;
      }

      return matchSearch && matchDate && matchClass && matchType && matchCounselor;
    });
  }, [attendance, searchTerm, filterDate, classFilter, filterType, user, filterMode]);

  useEffect(() => {
    if (waText.trim()) {
      const parsed = parseWhatsAppMessage(waText);
      if (parsed) {
        const student = students.find(s => 
          (parsed.studentName && s.name.toLowerCase().includes(parsed.studentName.toLowerCase())) || 
          (parsed.nis && s.nis === parsed.nis)
        );
        setParsedWAData({ ...parsed, matchedStudent: student });
      } else {
        setParsedWAData(null);
      }
    } else {
      setParsedWAData(null);
    }
  }, [waText, students]);

  const handleImportWA = async () => {
    if (!parsedWAData || !parsedWAData.studentName) {
      alert('Format pesan tidak dikenali atau nama siswa tidak ditemukan.');
      return;
    }

    try {
      const payload = {
        studentId: parsedWAData.matchedStudent?.id || 'unknown',
        studentName: parsedWAData.matchedStudent?.name || parsedWAData.studentName,
        nis: parsedWAData.matchedStudent?.nis || parsedWAData.nis || '-',
        className: parsedWAData.matchedStudent?.className || parsedWAData.className || '-',
        date: parsedWAData.date,
        day: parsedWAData.day,
        type: parsedWAData.type || 'Sakit',
        reason: parsedWAData.reason || 'Tanpa alasan (Impor WA)',
        parentName: parsedWAData.parentName || 'Orang Tua (WA)',
        parentPhone: parsedWAData.parentPhone || '-',
        address: parsedWAData.address || '-',
        status: 'Approved',
        source: 'WhatsApp',
        submittedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'attendance'), payload);
      setShowImportModal(false);
      setWaText('');
      setParsedWAData(null);
      fetchData();
      alert(`Berhasil mengimpor data absensi untuk ${payload.studentName}!`);
    } catch (err: any) {
      handleFirestoreError(err, 'create', 'WhatsApp Import');
    }
  };

  // Calculate Stats
  const today = new Date().toISOString().split('T')[0];
  const stats = {
    totalStudents: students.length,
    activeAttendance: attendance.filter(a => a.status === 'Pending').length,
    sakit: attendance.filter(a => a.type === 'Sakit').length,
    izin: attendance.filter(a => a.type === 'Izin').length,
    dispensasi: attendance.filter(a => a.type === 'Dispensasi').length,
    todaySakit: attendance.filter(a => a.type === 'Sakit' && a.date === today).length,
    todayIzin: attendance.filter(a => a.type === 'Izin' && a.date === today).length,
    todayDispensasi: attendance.filter(a => a.type === 'Dispensasi' && a.date === today).length,
    todayAlpa: attendance.filter(a => a.type === 'Alpa' && a.date === today).length + subjectAttendances.filter(a => (a.type === 'Alpa' || a.status === 'A') && a.date === today).length,
  };

  const todayAttendanceByClass = useMemo(() => {
    const summary: { [key: string]: { sakit: number, izin: number, dispensasi: number, alpa: number, total: number } } = {};
    attendance
      .filter(a => a.date === today)
      .forEach(a => {
        if (!summary[a.className]) {
          summary[a.className] = { sakit: 0, izin: 0, dispensasi: 0, alpa: 0, total: 0 };
        }
        if (a.type === 'Sakit') summary[a.className].sakit++;
        else if (a.type === 'Izin') summary[a.className].izin++;
        else if (a.type === 'Dispensasi') summary[a.className].dispensasi++;
        else if (a.type === 'Alpa') summary[a.className].alpa++;
        summary[a.className].total++;
      });
    
    // Also include alpa from subjectAttendances
    subjectAttendances
      .filter(a => a.date === today && (a.type === 'Alpa' || a.status === 'A'))
      .forEach(a => {
        if (!summary[a.className]) {
          summary[a.className] = { sakit: 0, izin: 0, dispensasi: 0, alpa: 0, total: 0 };
        }
        summary[a.className].alpa++;
        summary[a.className].total++;
      });

    return Object.entries(summary).sort((a, b) => (a[0] || '').localeCompare(b[0] || '', undefined, { numeric: true }));
  }, [attendance, subjectAttendances, today]);

  const handleStatusUpdate = async (id: string, newStatus: 'Approved' | 'Rejected') => {
    let reason = '';
    if (newStatus === 'Rejected') {
      reason = prompt('Masukkan alasan penolakan:') || '';
      if (!reason) return;
    }

    try {
      await updateDoc(doc(db, 'attendance', id), { 
        status: newStatus,
        statusReason: reason,
        processedAt: serverTimestamp(),
        processedBy: user?.name || 'Admin'
      });
      fetchData();
    } catch (error) {
      console.error(error);
      alert('Gagal mengupdate status.');
    }
  };

  const handleDelete = (id: string, coll: string) => {
    if (!id) {
      alert('Error: ID tidak ditemukan.');
      return;
    }
    showConfirm('Apakah Anda yakin ingin menghapus data ini?', async () => {
      setLoading(true);
      try {
        await deleteDoc(doc(db, coll, id));
        await fetchData();
        setStatusMessage('Data berhasil dihapus!');
        setTimeout(() => setStatusMessage(''), 3000);
      } catch (err: any) {
        console.error('Delete error:', err);
        const errorMessage = err.message || 'Izin ditolak oleh sistem.';
        alert(`Gagal menghapus: ${errorMessage}\nPastikan Anda memiliki izin yang cukup.`);
        try {
          handleFirestoreError(err, 'delete' as any, coll);
        } catch (e) {}
      } finally {
        setLoading(false);
      }
    });
  };

  const handleDeleteAllStudents = () => {
    showConfirm('PERINGATAN: Hapus SELURUH data siswa? Tindakan ini tidak dapat dibatalkan.', async () => {
      setLoading(true);
      try {
        const promises = students.map(s => deleteDoc(doc(db, 'students', s.id)));
        await Promise.all(promises);
        setSelectedStudents([]);
        fetchData();
      } catch (err) {
        console.error(err);
        alert('Gagal menghapus data.');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleDeleteSelectedStudents = () => {
    showConfirm(`Hapus ${selectedStudents.length} siswa yang terpilih?`, async () => {
      setLoading(true);
      try {
        const promises = selectedStudents.map(id => deleteDoc(doc(db, 'students', id)));
        await Promise.all(promises);
        setSelectedStudents([]);
        fetchData();
      } catch (err) {
        console.error(err);
        alert('Gagal menghapus data.');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleDeleteAllTeachers = () => {
    showConfirm('PERINGATAN: Hapus SELURUH data guru? Tindakan ini tidak dapat dibatalkan.', async () => {
      setLoading(true);
      try {
        const promises = teachers.map(t => deleteDoc(doc(db, 'teachers', t.id!)));
        await Promise.all(promises);
        setSelectedTeachers([]);
        fetchData();
      } catch (err) {
        console.error(err);
        alert('Gagal menghapus data.');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleDeleteSelectedTeachers = () => {
    if (selectedTeachers.length === 0) return;
    showConfirm(`Hapus ${selectedTeachers.length} guru yang terpilih?`, async () => {
      setLoading(true);
      try {
        const promises = selectedTeachers.map(id => deleteDoc(doc(db, 'teachers', id)));
        await Promise.all(promises);
        setSelectedTeachers([]);
        fetchData();
      } catch (err) {
        console.error(err);
        alert('Gagal menghapus data.');
      } finally {
        setLoading(false);
      }
    });
  };

  const toggleTeacherSelection = (id: string) => {
    setSelectedTeachers(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const toggleAllTeachers = (listToSelect?: string[]) => {
    const ids = listToSelect || teachers.map(t => t.id!);
    const allSelected = ids.length > 0 && ids.every(id => selectedTeachers.includes(id));
    
    if (allSelected) {
      setSelectedTeachers(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedTeachers(prev => Array.from(new Set([...prev, ...ids])));
    }
  };

  const exportToExcel = () => {
    const data = filteredAttendance.map(a => ({
      'Nama Siswa': a.studentName,
      'Kelas': a.className,
      'Jenis Izin': a.type,
      'Tanggal': a.date,
      'Status': a.status,
      'Email/No. WA Ortu': a.parentPhone || '-',
      'Alasan': a.reason || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Absensi");
    XLSX.writeFile(wb, `Rekap_Absensi_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const weeklySummary = useMemo(() => {
    const weeks: { [key: string]: { week: number, year: number, sakit: number, izin: number, dispensasi: number } } = {};
    
    attendance.forEach(record => {
      if (classFilter && record.className !== classFilter) return;
      const date = new Date(record.date);
      if (isNaN(date.getTime())) return;
      
      const oneJan = new Date(date.getFullYear(), 0, 1);
      const numberOfDays = Math.floor((date.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
      const weekNum = Math.ceil((date.getDay() + 1 + numberOfDays) / 7);
      const key = `${date.getFullYear()}-W${weekNum}`;
      
      if (!weeks[key]) {
        weeks[key] = { week: weekNum, year: date.getFullYear(), sakit: 0, izin: 0, dispensasi: 0 };
      }
      
      if (record.status === 'SAKIT') weeks[key].sakit++;
      else if (record.status === 'IZIN') weeks[key].izin++;
      else if (record.status === 'DISPENSASI') weeks[key].dispensasi++;
    });
    
    return Object.values(weeks).sort((a, b) => b.year - a.year || b.week - a.week);
  }, [attendance]);

  const exportWeeklyExcel = () => {
    const data = weeklySummary.map(w => ({
      'Tahun': w.year,
      'Minggu Ke': w.week,
      'Sakit': w.sakit,
      'Izin': w.izin,
      'Dispensasi': w.dispensasi,
      'Total': w.sakit + w.izin + w.dispensasi
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Mingguan");
    XLSX.writeFile(wb, `Laporan_Absensi_Mingguan_${new Date().toLocaleDateString()}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.text("Rekap Absensi Siswa SMPN 2 Magelang", 14, 15);
    
    const tableData = filteredAttendance.map(a => [
      a.studentName,
      a.className,
      a.parentPhone || '-',
      a.type,
      a.date,
      a.status
    ]);

    autoTable(doc, {
      head: [['Nama Siswa', 'Kelas', 'No. WA Ortu', 'Jenis', 'Tanggal', 'Status']],
      body: tableData,
      startY: 20,
      theme: 'grid',
      headStyles: { fillColor: [30, 64, 175] } // blue-700
    });

    doc.save(`Rekap_Absensi_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportClassesToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header (Kop)
    if (schoolInfo) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(schoolInfo.pemda?.toUpperCase() || '', pageWidth / 2, 15, { align: 'center' });
      doc.text(schoolInfo.dinas?.toUpperCase() || '', pageWidth / 2, 21, { align: 'center' });
      doc.setFontSize(14);
      doc.text(schoolInfo.sekolah?.toUpperCase() || '', pageWidth / 2, 28, { align: 'center' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(schoolInfo.alamat || '', pageWidth / 2, 34, { align: 'center' });
      doc.setLineWidth(0.5);
      doc.line(15, 37, pageWidth - 15, 37);
      doc.setLineWidth(0.2);
      doc.line(15, 38, pageWidth - 15, 38);
    } else {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text("LAPORAN DATA KELAS", pageWidth / 2, 20, { align: 'center' });
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("REKAPITULASI DATA KELAS", pageWidth / 2, 48, { align: 'center' });

    const tableData = allUniqueClasses.map((cl, idx) => {
      const classStudents = students.filter(s => (s.className || '').toLowerCase() === (cl.name || '').toLowerCase());
      const maleCount = classStudents.filter(s => {
        const g = (s.gender || '').trim().toLowerCase();
        return g === 'l' || g.startsWith('laki') || g === 'laki-laki';
      }).length;
      const femaleCount = classStudents.filter(s => {
        const g = (s.gender || '').trim().toLowerCase();
        return g === 'p' || g.startsWith('perem') || g === 'perempuan';
      }).length;
      const waliKelas = teachers.find(t => (t.className || '').toLowerCase() === (cl.name || '').toLowerCase())?.name || '-';
      const guruBK = teachers.filter(t => t.status?.includes('Guru BK') && t.managedClasses?.some((mc: string) => mc.toLowerCase() === (cl.name || '').toLowerCase())).map(t => t.name).join(', ') || '-';
      
      return [
        idx + 1,
        cl.name,
        classStudents.length,
        maleCount,
        femaleCount,
        waliKelas,
        guruBK
      ];
    });

    autoTable(doc, {
      head: [['No', 'Kelas', 'Siswa', 'L', 'P', 'Wali Kelas', 'Guru BK']],
      body: tableData,
      startY: 55,
      theme: 'grid',
      headStyles: { fillColor: [30, 64, 175], halign: 'center', fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        2: { halign: 'center', cellWidth: 15 },
        3: { halign: 'center', cellWidth: 10 },
        4: { halign: 'center', cellWidth: 10 },
      }
    });

    // Signature
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    if (schoolInfo) {
      const today = new Date();
      const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const dateString = `${schoolInfo.kota || ''}, ${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}`;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(dateString, pageWidth - 80, finalY);
      doc.text("Kepala Sekolah,", pageWidth - 80, finalY + 7);
      doc.setFont('helvetica', 'bold');
      doc.text(schoolInfo.kepalaSekolah || '', pageWidth - 80, finalY + 30);
      doc.setFont('helvetica', 'normal');
      doc.text(`NIP. ${schoolInfo.nipKepalaSekolah || '-'}`, pageWidth - 80, finalY + 34);
    }

    doc.save(`Data_Kelas_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const generateQRCode = async (text: string) => {
    try {
      return await QRCode.toDataURL(text, {
        margin: 1,
        width: 100,
        color: {
          dark: '#1e40af', // blue-800
          light: '#ffffff'
        }
      });
    } catch (err) {
      console.error(err);
      return '';
    }
  };

  const printIDCard = async (student: Student) => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [85.6, 54] // Standard ID Card size
    });

    // Background color
    doc.setFillColor(30, 64, 175); // blue-700
    doc.rect(0, 0, 85.6, 12, 'F');

    // Header
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("KARTU TANDA ANGGOTA", 42.8, 5, { align: 'center' });
    doc.setFontSize(6);
    doc.text("SMP NEGERI 2 MAGELANG", 42.8, 8, { align: 'center' });

    // Main Content
    doc.setTextColor(30, 64, 175);
    doc.setFontSize(8);
    doc.text("Nama:", 10, 20);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(student.name || '-', 10, 24);

    doc.setTextColor(30, 64, 175);
    doc.setFontSize(8);
    doc.text("NIS:", 10, 30);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(student.nis || '-', 10, 34);

    doc.setTextColor(30, 64, 175);
    doc.setFontSize(8);
    doc.text("Kelas:", 10, 40);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(student.className || '-', 10, 44);

    // QR Code
    const qrData = `${window.location.host}/login?role=PARENT&nis=${student.nis}`;
    const qrCodeBase64 = await generateQRCode(qrData);
    if (qrCodeBase64) {
      doc.addImage(qrCodeBase64, 'PNG', 55, 18, 25, 25);
      doc.setFontSize(5);
      doc.setTextColor(150, 150, 150);
      doc.text("Scan untuk data", 67.5, 45, { align: 'center' });
    }

    // Footer
    doc.setFillColor(241, 245, 249); // gray-100
    doc.rect(0, 49, 85.6, 5, 'F');
    doc.setFontSize(5);
    doc.setTextColor(100, 116, 139); // gray-500
    doc.text("SIADPV - Sistem Informasi Absensi Peserta Didik", 42.8, 52.5, { align: 'center' });

    doc.save(`KTA_${student.nis}_${student.name}.pdf`);
  };

  const printSelectedIDCards = async () => {
    if (selectedStudents.length === 0) return;
    
    setLoading(true);
    setStatusMessage(`Sedang menyiapkan ${selectedStudents.length} kartu...`);
    
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [85.6, 54]
      });

      for (let i = 0; i < selectedStudents.length; i++) {
        const studentId = selectedStudents[i];
        const student = students.find(s => s.id === studentId);
        if (!student) continue;

        if (i > 0) doc.addPage([85.6, 54], 'landscape');

        // Background color
        doc.setFillColor(30, 64, 175);
        doc.rect(0, 0, 85.6, 12, 'F');

        // Header
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text("KARTU TANDA ANGGOTA", 42.8, 5, { align: 'center' });
        doc.setFontSize(6);
        doc.text("SMP NEGERI 2 MAGELANG", 42.8, 8, { align: 'center' });

        // Main Content
        doc.setTextColor(30, 64, 175);
        doc.setFontSize(8);
        doc.text("Nama:", 10, 20);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.text(student.name || '-', 10, 24);

        doc.setTextColor(30, 64, 175);
        doc.setFontSize(8);
        doc.text("NIS:", 10, 30);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.text(student.nis || '-', 10, 34);

        doc.setTextColor(30, 64, 175);
        doc.setFontSize(8);
        doc.text("Kelas:", 10, 40);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.text(student.className || '-', 10, 44);

        // QR Code
        const qrData = `${window.location.host}/login?role=PARENT&nis=${student.nis}`;
        const qrCodeBase64 = await generateQRCode(qrData);
        if (qrCodeBase64) {
          doc.addImage(qrCodeBase64, 'PNG', 55, 18, 25, 25);
          doc.setFontSize(5);
          doc.setTextColor(150, 150, 150);
          doc.text("Scan untuk data", 67.5, 45, { align: 'center' });
        }

        // Footer
        doc.setFillColor(241, 245, 249);
        doc.rect(0, 49, 85.6, 5, 'F');
        doc.setFontSize(5);
        doc.setTextColor(100, 116, 139);
        doc.text("SIADPV - Sistem Informasi Absensi Peserta Didik", 42.8, 52.5, { align: 'center' });
      }

      doc.save(`Koleksi_KTA_Terpilih_${new Date().getTime()}.pdf`);
      setStatusMessage('Kartu berhasil dicetak!');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err) {
      console.error(err);
      alert('Gagal mencetak kartu.');
    } finally {
      setLoading(false);
    }
  };

  const seedSampleData = async () => {
    setLoading(true);
    setStatusMessage('Sedang memproses populasi data sampel...');
    
    // Sample Teachers
    const sampleTeachers = [
      { name: 'Budi Santoso, S.Pd', nip: '19800101', className: '7A', status: ['Wali Kelas'] },
      { name: 'Siti Aminah, M.Pd', nip: '19850202', className: '8B', status: ['Wali Kelas'] },
      { name: 'Andi Wijaya, S.Kom', nip: '19900303', className: '9C', status: ['Wali Kelas'] },
      { name: 'Hani Fitriani, S.Pd', nip: '19950404', status: ['Guru Mata Pelajaran'], subjects: ['Bahasa Inggris', 'Seni Budaya'], taughtClasses: ['7A', '7B', '8A'] }
    ];

    // Sample Counselors
    const sampleCounselors = [
      { name: 'Dr. Sarah Smith', nip: 'gurubk', managedClasses: ['7A', '7B', '8A', '8B'] }
    ];
    
    // Sample Students
    const sampleStudents = [
      { name: 'Rizky Pratama', nis: '1001', nisn: '0012345678', className: '7A', gender: 'L' },
      { name: 'Alya Putri', nis: '1002', nisn: '0012345679', className: '7A', gender: 'P' },
      { name: 'Dimas Aditya', nis: '2001', nisn: '0022345678', className: '8B', gender: 'L' },
      { name: 'Kirana Larasati', nis: '2002', nisn: '0022345679', className: '8B', gender: 'P' },
      { name: 'Fajar Nugroho', nis: '3001', nisn: '0032345678', className: '9C', gender: 'L' }
    ];

    const sampleYears = [
      { year: '2023/2024', active: true },
      { year: '2024/2025', active: false }
    ];

    const sampleClasses = [
      { name: '7A' }, { name: '7B' }, { name: '8A' }, { name: '8B' }, { name: '9C' }
    ];

    try {
      const promises = [];
      for (const t of sampleTeachers) promises.push(addDoc(collection(db, 'teachers'), t));
      for (const s of sampleStudents) promises.push(addDoc(collection(db, 'students'), s));
      for (const y of sampleYears) promises.push(addDoc(collection(db, 'academicYears'), y));
      for (const c of sampleCounselors) promises.push(addDoc(collection(db, 'counselors'), c));
      for (const cl of sampleClasses) promises.push(addDoc(collection(db, 'classes'), cl));
      
      await Promise.all(promises);
      setStatusMessage('Data sampel berhasil dibuat!');
      fetchData();
      
      // Clear message after 3 seconds
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err: any) {
      console.error(err);
      setStatusMessage(`Gagal: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setLoading(false);
    }
  };

  const allUniqueClasses = useMemo(() => {
    const classMap = new Map<string, { id?: string, name: string }>();
    
    // 1. Base from explicitly defined classes
    classes.forEach(cl => {
      if (cl.name) classMap.set(cl.name.toLowerCase(), { id: cl.id, name: cl.name });
    });
    
    // 2. Add from students
    students.forEach(s => {
      if (s.className && !classMap.has(s.className.toLowerCase())) {
        classMap.set(s.className.toLowerCase(), { name: s.className });
      }
    });

    // 3. Add from teachers
    teachers.forEach(t => {
      if (t.className && !classMap.has(t.className.toLowerCase())) {
        classMap.set(t.className.toLowerCase(), { name: t.className });
      }
      // Add from managed classes (Guru BK)
      if (t.status?.includes('Guru BK')) {
        t.managedClasses?.forEach((mc: string) => {
          if (mc && !classMap.has(mc.toLowerCase())) {
            classMap.set(mc.toLowerCase(), { name: mc });
          }
        });
      }
    });

    // 4. Add from counselors
    counselors.forEach(c => {
      c.managedClasses?.forEach((mc: string) => {
        if (mc && !classMap.has(mc.toLowerCase())) {
          classMap.set(mc.toLowerCase(), { name: mc });
        }
      });
    });

    return Array.from(classMap.values())
      .filter(cl => {
        const matchSearch = cl.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchFilter = !classFilter || cl.name === classFilter;
        return matchSearch && matchFilter;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [classes, students, teachers, counselors, searchTerm, classFilter]);

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.nis.toLowerCase().includes(searchTerm.toLowerCase());
      const matchClass = !classFilter || s.className === classFilter;
      return matchSearch && matchClass;
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [students, searchTerm, classFilter]);

  const paginatedStudents = useMemo(() => {
    const startIndex = (studentPage - 1) * itemsPerPage;
    return filteredStudents.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredStudents, studentPage, itemsPerPage]);

  const totalStudentPages = Math.ceil(filteredStudents.length / itemsPerPage);

  const filteredTeacherList = useMemo(() => {
    return [...teachers].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [teachers]);

  const paginatedTeacherList = useMemo(() => {
    const startIndex = (teacherListPage - 1) * itemsPerPage;
    return filteredTeacherList.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTeacherList, teacherListPage]);

  const totalTeacherListPages = Math.ceil(filteredTeacherList.length / itemsPerPage);

  const filteredWaliKelas = useMemo(() => {
    return teachers.filter(t => t.status?.includes('Wali Kelas')).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [teachers]);

  const paginatedWaliKelas = useMemo(() => {
    const startIndex = (waliKelasPage - 1) * itemsPerPage;
    return filteredWaliKelas.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredWaliKelas, waliKelasPage]);

  const totalWaliKelasPages = Math.ceil(filteredWaliKelas.length / itemsPerPage);

  const filteredSubjectTeachers = useMemo(() => {
    return teachers.filter(t => t.status?.includes('Guru Mata Pelajaran')).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [teachers]);

  const paginatedSubjectTeachers = useMemo(() => {
    const startIndex = (subjectTeacherPage - 1) * itemsPerPage;
    return filteredSubjectTeachers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSubjectTeachers, subjectTeacherPage]);

  const totalSubjectTeacherPages = Math.ceil(filteredSubjectTeachers.length / itemsPerPage);

  const counselorTeachers = useMemo(() => {
     return teachers.filter(t => t.status?.includes('Guru BK'))
       .sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [teachers]);

  const paginatedCounselors = useMemo(() => {
    const startIndex = (counselorPage - 1) * itemsPerPage;
    return counselorTeachers.slice(startIndex, startIndex + itemsPerPage);
  }, [counselorTeachers, counselorPage]);

  const totalCounselorPages = Math.ceil(counselorTeachers.length / itemsPerPage);

  const paginatedClasses = useMemo(() => {
    const startIndex = (classPage - 1) * itemsPerPage;
    return allUniqueClasses.slice(startIndex, startIndex + itemsPerPage);
  }, [allUniqueClasses, classPage, itemsPerPage]);

  const totalClassPages = Math.ceil(allUniqueClasses.length / itemsPerPage);
  
  const filteredInquiries = useMemo(() => {
    return subjectInquiries.filter(inq => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        (inq.studentName || '').toLowerCase().includes(searchLower) ||
        (inq.subjectName || '').toLowerCase().includes(searchLower) ||
        (inq.subjectTeacherName || '').toLowerCase().includes(searchLower);
      const matchesClass = !classFilter || inq.className === classFilter;
      return matchesSearch && matchesClass;
    }).sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return dateB - dateA;
    });
  }, [subjectInquiries, searchTerm, classFilter]);

  const paginatedInquiries = useMemo(() => {
    const startIndex = (subjectInquiryPage - 1) * itemsPerPage;
    return filteredInquiries.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredInquiries, subjectInquiryPage, itemsPerPage]);

  const totalInquiryPages = Math.ceil(filteredInquiries.length / itemsPerPage);

  const summaryTableData = useMemo(() => {
    const targetDate = filterDate || today;

    const classStats: { [key: string]: { total: number, alpa: number, sakit: number, izin: number, dispensasi: number, hadir: number } } = {};
    
    // Initialize with all unique classes
    allUniqueClasses.forEach(cl => {
      classStats[cl.name] = { total: 0, alpa: 0, sakit: 0, izin: 0, dispensasi: 0, hadir: 0 };
    });

    // Add students count
    students.forEach(s => {
      const cls = s.className || 'Unknown';
      if (!classStats[cls]) {
        classStats[cls] = { total: 0, alpa: 0, sakit: 0, izin: 0, dispensasi: 0, hadir: 0 };
      }
      classStats[cls].total++;
    });

    // Count attendance records for targetDate
    attendance.forEach(a => {
      if (a.date !== targetDate) return;
      if (a.status === 'Rejected') return; // Only count Approved or Pending logically
      
      const cls = a.className || 'Unknown';
      if (!classStats[cls]) {
        classStats[cls] = { total: 0, alpa: 0, sakit: 0, izin: 0, dispensasi: 0, hadir: 0 };
      }
      
      if (a.type === 'Sakit') classStats[cls].sakit++;
      else if (a.type === 'Izin') classStats[cls].izin++;
      else if (a.type === 'Dispensasi') classStats[cls].dispensasi++;
      else if (a.type === 'Alpa') classStats[cls].alpa++;
    });

    // Calculate Hadir
    return Object.entries(classStats)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map(([className, data]) => {
        const hadir = data.total - (data.alpa + data.sakit + data.izin + data.dispensasi);
        return {
          className,
          ...data,
          hadir: hadir < 0 ? 0 : hadir
        };
      });
  }, [attendance, students, filterDate, today, allUniqueClasses]);

  const paginatedSummary = useMemo(() => {
    const startIndex = (summaryPage - 1) * itemsPerPage;
    return summaryTableData.slice(startIndex, startIndex + itemsPerPage);
  }, [summaryTableData, summaryPage, itemsPerPage]);

  const totalSummaryPages = Math.ceil(summaryTableData.length / itemsPerPage);

  const paginatedAttendanceDetail = useMemo(() => {
    const startIndex = (attendanceDetailPage - 1) * itemsPerPage;
    return filteredAttendance.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAttendance, attendanceDetailPage, itemsPerPage]);

  const totalAttendanceDetailPages = Math.ceil(filteredAttendance.length / itemsPerPage);

  const paginatedOfficers = useMemo(() => {
    const startIndex = (officerListPage - 1) * itemsPerPage;
    return allOfficers.slice(startIndex, startIndex + itemsPerPage);
  }, [allOfficers, officerListPage, itemsPerPage]);

  const totalOfficerPages = Math.ceil(allOfficers.length / itemsPerPage);

  const toggleStudentSelection = (id: string) => {
    setSelectedStudents(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleAllStudentsOnPage = () => {
    const pageIds = paginatedStudents.map(s => s.id);
    const allOnPageSelected = pageIds.every(id => selectedStudents.includes(id));
    
    if (allOnPageSelected) {
      setSelectedStudents(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedStudents(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  return (
    <div className="space-y-8">
      {/* Header with Refresh */}
      {statusMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-3 rounded-xl text-center text-xs font-bold border",
            statusMessage.includes('Gagal') ? "bg-red-50 border-red-200 text-red-600" : "bg-blue-50 border-blue-200 text-blue-600"
          )}
        >
          {statusMessage}
        </motion.div>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900">
            {user?.role === 'COUNSELOR' ? 'Dashboard Guru BK' : 'Panel Administrasi'}
          </h2>
          <div className="flex items-center gap-2">
            <p className="text-sm text-gray-500">
              {user?.role === 'COUNSELOR' ? `Selamat datang, ${user.name}` : 'Kelola master data dan seluruh aktivitas sistem'}
            </p>
            <ActiveAcademicYearDisplay />
          </div>
        </div>
        <div className="flex gap-3">
           <button 
            onClick={seedSampleData}
            className="px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-amber-100 transition-all"
           >
             <FilePlus size={16} />
             Populasi Sampel
           </button>
           <button 
            onClick={fetchData}
            className="p-2 bg-white border border-gray-100 rounded-xl text-gray-500 hover:text-blue-600 hover:border-blue-100 transition-all"
           >
             <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
           </button>
        </div>
      </div>

      {/* Stats Cards - AdminLTE 스타일 Small Box */}
      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[
              { label: 'Total Siswa', value: stats.totalStudents, icon: GraduationCap, color: 'bg-info', bg: 'bg-blue-500' },
              { label: 'Pending', value: stats.activeAttendance, icon: Clock, color: 'bg-warning', bg: 'bg-yellow-500' },
              { label: 'Total Sakit', value: stats.sakit, icon: AlertCircle, color: 'bg-danger', bg: 'bg-red-500' },
              { label: 'Total Izin', value: stats.izin, icon: CalendarIcon, color: 'bg-success', bg: 'bg-green-500' },
              { label: 'Total Dispensasi', value: stats.dispensasi, icon: CheckCircle2, color: 'bg-purple', bg: 'bg-purple-500' },
            ].map((stat, i) => (
              <div key={stat.label} className={cn("relative overflow-hidden rounded-lg shadow-sm text-white", stat.bg)}>
                <div className="p-4 z-10 relative">
                  <h3 className="text-3xl font-bold mb-1">{stat.value}</h3>
                  <p className="text-sm font-medium opacity-90">{stat.label}</p>
                </div>
                <div className="absolute right-2 top-2 opacity-20 transform scale-150">
                  <stat.icon size={64} />
                </div>
                <div className="bg-black/10 text-center py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-black/20 transition-all">
                   Selengkapnya <Plus size={10} className="inline ml-1" />
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
             <AttendanceChart attendance={attendance} />
             <AttendanceTrendChart attendance={attendance} />
          </div>
          <div className="mb-6">
             <AttendanceAlertsDisplay />
          </div>

          {/* Daily Summary Ringkasan Hari Ini */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 bg-white p-5 rounded-xl shadow-sm border border-gray-200">
               <h3 className="text-xs font-bold text-gray-800 mb-3 flex items-center gap-2">
                 <Calendar size={16} className="text-blue-600" />
                 Ringkasan Hari Ini ({formatDate(new Date(today))})
               </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2.5 bg-amber-50 rounded-lg">
                     <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white">
                           <AlertCircle size={14} />
                        </div>
                        <span className="text-[13px] font-bold text-amber-700">Sakit</span>
                     </div>
                     <span className="text-lg font-black text-amber-700">{stats.todaySakit}</span>
                  </div>
                  
                  <div className="flex items-center justify-between p-2.5 bg-green-50 rounded-lg">
                     <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center text-white">
                           <CalendarIcon size={14} />
                        </div>
                        <span className="text-[13px] font-bold text-green-700">Izin</span>
                     </div>
                     <span className="text-lg font-black text-green-700">{stats.todayIzin}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-blue-50 rounded-lg">
                     <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white">
                           <CheckCircle2 size={14} />
                        </div>
                        <span className="text-[13px] font-bold text-blue-700">Dispensasi</span>
                     </div>
                     <span className="text-lg font-black text-blue-700">{stats.todayDispensasi}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-red-50 rounded-lg">
                     <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center text-white">
                           <AlertCircle size={14} />
                        </div>
                        <span className="text-[13px] font-bold text-red-700">Alpa</span>
                     </div>
                     <span className="text-lg font-black text-red-700">{stats.todayAlpa}</span>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                     <span className="text-[10px] text-gray-500 font-medium">Total Absensi Hari Ini</span>
                     <span className="text-xs font-bold text-gray-900">{stats.todayAlpa + stats.todaySakit + stats.todayIzin + stats.todayDispensasi} Siswa</span>
                  </div>
               </div>
            </div>
            
            {/* Placeholder for Quick Actions or another summary */}
            <div className="md:col-span-2 bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-xl shadow-lg text-white">
               <h3 className="text-base font-bold mb-3">Informasi Sistem</h3>
               <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/10 p-3.5 rounded-lg backdrop-blur-sm border border-white/10">
                     <p className="text-[9px] font-bold uppercase tracking-widest opacity-80 mb-1">Status Database</p>
                     <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                        <p className="font-bold text-sm">Terhubung (Cloud Firestore)</p>
                     </div>
                  </div>
                  <div className="bg-white/10 p-3.5 rounded-lg backdrop-blur-sm border border-white/10">
                     <p className="text-[9px] font-bold uppercase tracking-widest opacity-80 mb-1">Akses WhatsApp</p>
                     <p className="font-bold text-sm flex items-center gap-1.5">
                        <MessageCircle size={12} className="text-green-400" /> Aktif
                     </p>
                  </div>
               </div>
               <div className="mt-6">
                  <p className="text-[11px] opacity-80 leading-relaxed">
                     Panel ini digunakan untuk memantau data master dan riwayat absensi (Sakit, Izin, Dispensasi) siswa SMPN 2 Magelang. 
                     Gunakan fitur ekspor untuk mendownload laporan dalam format Excel atau PDF.
                  </p>
               </div>
            </div>
          </div>

          {/* Infografis Absensi Hari Ini per Kelas */}
          {todayAttendanceByClass.length > 0 && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
               <h3 className="text-sm font-bold text-gray-800 mb-6 flex items-center gap-2 uppercase tracking-widest">
                 <Filter size={18} className="text-blue-600" />
                 Infografis Absensi per Kelas Hari Ini ({formatDate(new Date(today))})
               </h3>
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                 {todayAttendanceByClass.map(([cls, data], idx) => (
                   <div key={`${cls}-${idx}`} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-md transition-all group">
                     <div className="flex items-center justify-between mb-2">
                       <span className="text-lg font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase">{cls}</span>
                       <span className="text-[10px] font-bold px-2 py-1 bg-blue-100 rounded-full text-blue-600">{data.total} Σ</span>
                     </div>
                     <div className="grid grid-cols-4 gap-1 text-center">
                        <div>
                           <p className="text-[8px] font-bold text-red-400 uppercase leading-tight">S</p>
                           <p className="text-xs font-black text-red-600">{data.sakit}</p>
                        </div>
                        <div>
                           <p className="text-[8px] font-bold text-yellow-500 uppercase leading-tight">I</p>
                           <p className="text-xs font-black text-yellow-600">{data.izin}</p>
                        </div>
                        <div>
                           <p className="text-[8px] font-bold text-purple-400 uppercase leading-tight">D</p>
                           <p className="text-xs font-black text-purple-600">{data.dispensasi}</p>
                        </div>
                        <div>
                           <p className="text-[8px] font-bold text-gray-400 uppercase leading-tight">A</p>
                           <p className="text-xs font-black text-gray-600">{data.alpa}</p>
                        </div>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </>
      )}

          {activeTab.startsWith('role-management') && (
            <div className="space-y-8 p-6">
              
              <div className="flex flex-wrap gap-4 mb-4">
                <button 
                  onClick={() => setSearchParams({tab: 'role-management-guru'})} 
                  className={cn("px-6 py-3 rounded-xl flex items-center gap-2 font-bold transition-all border-none outline-none", activeTab === 'role-management-guru' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
                >
                  <Users size={20} /> Manajemen Peran Guru
                </button>
                <button 
                  onClick={() => setSearchParams({tab: 'role-management-petugas'})} 
                  className={cn("px-6 py-3 rounded-xl flex items-center gap-2 font-bold transition-all border-none outline-none", activeTab === 'role-management-petugas' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
                >
                  <GraduationCap size={20} /> Manajemen Petugas Kelas
                </button>
              </div>

              {activeTab === 'role-management-guru' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 bg-indigo-600 text-white flex justify-between items-center">
                  <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                    <Users size={18} /> Daftar Peran Guru
                  </h3>
                  <span className="px-3 py-1 bg-white/20 text-white text-xs font-bold rounded-full">
                    {teachers.length} Guru
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-indigo-50/50 border-b border-indigo-100/50">
                        <th className="px-6 py-3 text-[10px] font-bold text-indigo-700 uppercase">No</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-indigo-700 uppercase">Nama Guru</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-indigo-700 uppercase">Bidang Studi</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-indigo-700 uppercase">Wali Kelas</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-indigo-700 uppercase">Guru BK</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-indigo-700 uppercase text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {teachers.slice((roleManagementPage - 1) * 12, roleManagementPage * 12).map((t, idx) => (
                        <tr key={t.id} className="hover:bg-indigo-50/20 transition-colors">
                          <td className="px-6 py-3 text-sm text-gray-500 font-medium">{(roleManagementPage - 1) * 12 + idx + 1}</td>
                          <td className="px-6 py-3 text-sm font-bold text-gray-900">{t.name}</td>
                          <td className="px-6 py-3">
                            <div className="flex flex-wrap gap-1">
                              {t.status?.includes('Guru Mata Pelajaran') ? (
                                (Array.isArray(t.subjects) ? t.subjects : []).map((s, si) => (
                                  <span key={si} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded border border-blue-100">{s}</span>
                                ))
                              ) : (
                                <span className="text-[10px] text-gray-400 italic">Bukan Guru Mapel</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-sm font-bold text-emerald-600">
                            {t.status?.includes('Wali Kelas') ? (t.className || '-') : '-'}
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex flex-wrap gap-1">
                              {t.status?.includes('Guru BK') ? (
                                (Array.isArray(t.managedClasses) ? t.managedClasses : []).map((mc, mci) => (
                                  <span key={mci} className="px-2 py-0.5 bg-purple-50 text-purple-600 text-[10px] font-bold rounded border border-purple-100">{mc}</span>
                                ))
                              ) : (
                                <span className="text-[10px] text-gray-400 italic">-</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button 
                                onClick={() => {
                                  setFormData({
                                    ...t,
                                    subjects: Array.isArray(t.subjects) ? t.subjects.join(', ') : t.subjects,
                                    taughtClasses: Array.isArray(t.taughtClasses) ? t.taughtClasses.join(', ') : t.taughtClasses,
                                    managedClasses: Array.isArray(t.managedClasses) ? t.managedClasses.join(', ') : t.managedClasses,
                                    isChangingRole: true
                                  });
                                  setShowAddModal(true);
                                }}
                                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition-all shadow-sm"
                              >
                                PILIH PERAN
                              </button>
                              <button onClick={() => { setFormData(t); setShowAddModal(true); }} className="p-1.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"><Edit size={12} /></button>
                              <button onClick={() => t.id && handleDelete(t.id, 'teachers')} className="p-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-all flex items-center gap-1">
                                <Trash2 size={12} /> HAPUS
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {teachers.length > 12 && (
                    <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                      <span className="text-sm text-gray-500 font-medium">
                        Menampilkan {(roleManagementPage - 1) * 12 + 1} - {Math.min(roleManagementPage * 12, teachers.length)} dari {teachers.length} guru
                      </span>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setRoleManagementPage(p => Math.max(1, p - 1))}
                          disabled={roleManagementPage === 1}
                          className="px-3 py-1 bg-white border border-gray-200 rounded text-sm disabled:opacity-50 transition-all font-bold"
                        >
                          Sebelumnya
                        </button>
                        <button 
                          onClick={() => setRoleManagementPage(p => Math.min(Math.ceil(teachers.length / 12), p + 1))}
                          disabled={roleManagementPage === Math.ceil(teachers.length / 12)}
                          className="px-3 py-1 bg-white border border-gray-200 rounded text-sm disabled:opacity-50 transition-all font-bold"
                        >
                          Selanjutnya
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              )}

              {activeTab === 'role-management-petugas' && (
              <>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-black text-gray-900">Petugas Kelas</h2>
                  <p className="text-sm text-gray-500">Kelola siswa yang bertugas mengatur absensi per kelas.</p>
                </div>
                <button 
                  onClick={() => setShowAddOfficerForm(!showAddOfficerForm)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-200 transition-colors flex items-center gap-2"
                >
                  {showAddOfficerForm ? <X size={18} /> : <GraduationCap size={18} />}
                  {showAddOfficerForm ? 'Tutup Form' : 'Tambah Petugas'}
                </button>
              </div>

              {showAddOfficerForm && (
              <div id="management-petugas-section" className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                <div className="p-4 bg-emerald-600 text-white flex justify-between items-center">
                  <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                    <GraduationCap size={18} /> Manajemen Petugas Kelas
                  </h3>
                  <button onClick={() => setShowAddOfficerForm(false)} className="text-emerald-100 hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6">
                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Pilih Kelas</label>
                        <select 
                          className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500"
                          value={formData.tempClassForOfficer || ''}
                          onChange={(e) => {
                            const className = e.target.value;
                            setFormData({ ...formData, tempClassForOfficer: className });
                            const currentOfficers = students
                              .filter(s => s.className === className && (s as any).role === 'STUDENT')
                              .map(s => s.id!);
                            setSelectedClassOfficers(currentOfficers);
                          }}
                        >
                          <option value="">-- Pilih Daftar Kelas --</option>
                          {[...classes].sort((a,b) => (a.name || '').localeCompare(b.name || '', undefined, {numeric: true})).map(cl => <option key={cl.id} value={cl.name}>{cl.name}</option>)}
                        </select>
                      </div>

                      {formData.tempClassForOfficer && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Daftar Siswa (Maks. 2 Petugas)</label>
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                               {selectedClassOfficers.length} / 2 Petugas
                             </span>
                          </div>
                          <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {students
                              .filter(s => s.className === formData.tempClassForOfficer)
                              .sort((a,b) => (a.name || '').localeCompare(b.name || ''))
                              .map(s => {
                                const isSelected = selectedClassOfficers.includes(s.id!);
                                const isDisabled = !isSelected && selectedClassOfficers.length >= 2;

                                return (
                                  <label 
                                    key={s.id} 
                                    className={cn(
                                      "flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:bg-emerald-50 transition-colors",
                                      isSelected ? "ring-2 ring-emerald-500 bg-emerald-50/30" : "",
                                      isDisabled ? "opacity-50 grayscale cursor-not-allowed" : "cursor-pointer"
                                    )}
                                  >
                                    <input 
                                      type="checkbox"
                                      disabled={isDisabled}
                                      checked={isSelected}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedClassOfficers([...selectedClassOfficers, s.id!]);
                                        } else {
                                          setSelectedClassOfficers(selectedClassOfficers.filter(id => id !== s.id));
                                        }
                                      }}
                                      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <div className="flex-1">
                                      <p className="text-sm font-bold text-gray-900">{s.name}</p>
                                      <p className="text-[10px] text-gray-400 font-bold uppercase">{s.nis}</p>
                                    </div>
                                    {isSelected && (
                                      <span className="px-2 py-0.5 bg-emerald-600 text-white text-[8px] font-black uppercase rounded shadow-sm">CALON PETUGAS</span>
                                    )}
                                  </label>
                                );
                              })}
                          </div>
                          <button 
                            type="button"
                            onClick={handleSaveOfficers}
                            disabled={loading}
                            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 mt-2 flex items-center justify-center gap-2"
                          >
                            <Save size={18} />
                            {loading ? 'MENYIMPAN...' : 'SIMPAN PERUBAHAN'}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-white rounded-lg text-emerald-600 shadow-sm">
                          <AlertCircle size={20} />
                        </div>
                        <h4 className="font-bold text-emerald-900">Tentang Petugas Kelas</h4>
                      </div>
                      <div className="text-xs text-emerald-700 leading-relaxed font-medium">
                        Siswa yang dipilih sebagai <strong>Petugas Kelas</strong> akan memiliki akses khusus untuk membantu guru dalam melakukan absensi kelas melalui dashboard siswa. 
                        <br/><br/>
                        Aturan:
                        <ul className="list-disc ml-5 mt-2 space-y-1">
                          <li>Hanya dapat mengelola data absensi siswa di kelas yang sama.</li>
                          <li>Maksimal 2 siswa per kelas dapat ditunjuk sebagai Petugas.</li>
                          <li>Petugas dapat menginput absensi harian jika Wali Kelas berhalangan.</li>
                        </ul>
                      </div>
                      <div className="mt-4 pt-4 border-t border-emerald-200">
                         <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase">
                           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                           Data Berdasarkan Database Siswa
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              )}

              {/* DAFTAR PETUGAS ABSENSI KELAS Table */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 bg-gray-800 text-white flex justify-between items-center">
                  <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                    <Users size={18} /> Daftar Petugas Absensi Kelas
                  </h3>
                  <span className="px-2 py-1 bg-blue-600/20 text-blue-400 text-[10px] font-bold rounded-lg border border-blue-600/30">
                    {allOfficers.length} Petugas Aktif
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">No</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Kelas</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Nama Siswa</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {paginatedOfficers.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic text-sm">Belum ada petugas kelas yang ditunjuk.</td>
                        </tr>
                      ) : (
                        paginatedOfficers.map((o, idx) => (
                          <tr key={o.id} className="hover:bg-blue-50/20 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-400 font-medium">{(officerListPage - 1) * itemsPerPage + idx + 1}</td>
                            <td className="px-6 py-4 text-sm font-black text-blue-600 uppercase">{o.className}</td>
                            <td className="px-6 py-4 text-sm font-bold text-gray-900">{o.name}</td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => {
                                    setFormData({ ...formData, tempClassForOfficer: o.className });
                                    const currentOfficers = students
                                      .filter(s => s.className === o.className && (s as any).role === 'STUDENT')
                                      .map(s => s.id!);
                                    setSelectedClassOfficers(currentOfficers);
                                    setShowAddOfficerForm(true);
                                    // Smooth scroll to the management section
                                    setTimeout(() => {
                                      const element = document.getElementById('management-petugas-section');
                                      if (element) {
                                        element.scrollIntoView({ behavior: 'smooth' });
                                      }
                                    }, 100);
                                  }}
                                  className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                                  title="Edit"
                                >
                                  <Edit size={14} />
                                </button>
                                <button 
                                  onClick={() => handleRemoveOfficer(o.id!)}
                                  className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                  title="Hapus"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls Petugas */}
                {totalOfficerPages > 1 && (
                  <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Menampilkan {((officerListPage - 1) * itemsPerPage) + 1} - {Math.min(officerListPage * itemsPerPage, allOfficers.length)} dari {allOfficers.length} Petugas
                    </p>
                    <div className="flex items-center gap-2">
                       <button 
                        disabled={officerListPage === 1}
                        onClick={() => setOfficerListPage(officerListPage - 1)}
                        className="p-2 border border-gray-200 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                       >
                         Sebelumnya
                       </button>
                       {[...Array(totalOfficerPages)].map((_, i) => (
                         <button 
                          key={i}
                          onClick={() => setOfficerListPage(i + 1)}
                          className={cn(
                            "w-8 h-8 rounded text-xs font-bold transition-all",
                            officerListPage === i + 1 ? "bg-emerald-600 text-white" : "hover:bg-gray-200 bg-white border border-gray-200"
                          )}
                         >
                           {i + 1}
                         </button>
                       ))}
                       <button 
                        disabled={officerListPage === totalOfficerPages}
                        onClick={() => setOfficerListPage(officerListPage + 1)}
                        className="p-2 border border-gray-200 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                       >
                         Selanjutnya
                       </button>
                    </div>
                  </div>
                )}
              </div>
              </>
              )}
            </div>
          )}
          {activeTab === 'students' && (
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <GraduationCap size={24} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase">Total Siswa</p>
                  <h4 className="text-2xl font-black text-gray-900">{totalStudentStats.total}</h4>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <Users size={24} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase">Laki-Laki (L)</p>
                  <h4 className="text-2xl font-black text-indigo-600">{totalStudentStats.l}</h4>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-pink-100 flex items-center justify-center text-pink-600">
                  <Users size={24} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase">Perempuan (P)</p>
                  <h4 className="text-2xl font-black text-pink-600">{totalStudentStats.p}</h4>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                   <Database size={24} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase">Total Kelas</p>
                  <h4 className="text-2xl font-black text-emerald-600">{studentSummaryByClass.length}</h4>
                </div>
              </div>
            </div>
          )}

      {activeTab === 'students' && studentSummaryByClass.length > 0 && (
        <div className="mb-6 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-sm font-bold text-gray-800 mb-6 flex items-center gap-2 uppercase tracking-widest">
            <Filter size={18} className="text-blue-600" />
            Infografis Data Siswa per Kelas
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {studentSummaryByClass.map(([cls, data]: any, idx: number) => (
              <div key={`${cls}-${idx}`} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-md transition-all group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-black text-gray-900 group-hover:text-blue-600 transition-colors">{cls}</span>
                  <span className="text-[10px] font-bold px-2 py-1 bg-gray-200 rounded-full text-gray-600">{data.total} Σ</span>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase leading-tight">L</p>
                    <p className="text-sm font-black text-indigo-500">{data.l}</p>
                  </div>
                  <div className="w-px h-6 bg-gray-200 my-auto"></div>
                  <div className="flex-1 text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase leading-tight">P</p>
                    <p className="text-sm font-black text-pink-500">{data.p}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(activeTab === 'attendance' || activeTab === 'attendance-summary' || activeTab === 'attendance-detail') && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
              <AlertCircle size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase">Total Sakit</p>
              <div className="flex items-baseline gap-2">
                <h4 className="text-2xl font-black text-red-600">{stats.sakit}</h4>
                <span className="text-[10px] text-gray-400 font-bold">Hari ini: {stats.todaySakit}</span>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600">
              <CalendarIcon size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase">Total Izin</p>
              <div className="flex items-baseline gap-2">
                <h4 className="text-2xl font-black text-yellow-600">{stats.izin}</h4>
                <span className="text-[10px] text-gray-400 font-bold">Hari ini: {stats.todayIzin}</span>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase">Total Dispensasi</p>
              <div className="flex items-baseline gap-2">
                <h4 className="text-2xl font-black text-purple-600">{stats.dispensasi}</h4>
                <span className="text-[10px] text-gray-400 font-bold">Hari ini: {stats.todayDispensasi}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Container */}
      {activeTab === 'student-pii' && (
         <div className="p-6">
            <StudentPIITab students={students} />
         </div>
      )}
      {activeTab !== 'overview' && activeTab !== 'student-pii' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Header Content */}
        <div className="p-4 md:p-6 bg-white border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
           <div className="flex flex-wrap items-center gap-4 flex-1">
             <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Cari data..." 
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded text-sm focus:border-blue-500 outline-none transition-all shadow-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
             </div>

             {activeTab === 'students' && (
               <select 
                 className="px-3 py-2 border border-gray-300 rounded text-sm focus:border-blue-500 outline-none transition-all shadow-sm font-bold text-gray-600"
                 value={classFilter}
                 onChange={(e) => setClassFilter(e.target.value)}
               >
                 <option value="">SEMUA KELAS</option>
                 {classes.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, {numeric: true})).map((cl, idx) => (
                   <option key={cl.id || `class-filter-${idx}`} value={cl.name}>{cl.name}</option>
                 ))}
               </select>
             )}
             
             {activeTab === 'students' && (
               <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => setShowPrintModal(true)}
                    className="px-3 py-2 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700 transition-all flex items-center gap-1 shadow-sm"
                  >
                    <FileText size={14} /> CETAK KARTU LOGIN
                  </button>
                  <button 
                    onClick={handleGenerateAutoPasswords}
                    className="px-3 py-2 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition-all flex items-center gap-1 shadow-sm uppercase"
                  >
                    <RefreshCw size={14} /> GENERATE SANDI ORTU
                  </button>
                  <button 
                    onClick={handleDeleteAllStudents}
                    className="px-3 py-2 bg-red-800 text-white rounded text-xs font-bold hover:bg-red-900 transition-all flex items-center gap-1 shadow-sm uppercase"
                  >
                    <Trash2 size={14} /> HAPUS SEMUA DATA
                  </button>
                  {selectedStudents.length > 0 && (
                    <button 
                      onClick={printSelectedIDCards}
                      className="px-3 py-2 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-1 shadow-sm uppercase"
                    >
                      <IdCard size={14} /> CETAK KARTU ({selectedStudents.length})
                    </button>
                  )}
                  {selectedStudents.length > 0 && (
                    <button 
                      onClick={handleDeleteSelectedStudents}
                      className="px-3 py-2 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-1 shadow-sm uppercase animate-pulse"
                    >
                      <Trash2 size={14} /> HAPUS TERPILIH ({selectedStudents.length})
                    </button>
                  )}
                  <button 
                    onClick={downloadStudentsPDF}
                    className="px-3 py-2 bg-red-50 text-red-700 border border-red-100 rounded text-xs font-bold hover:bg-red-100 transition-all flex items-center gap-1 shadow-sm uppercase"
                  >
                    <Download size={14} /> PDF
                  </button>
                  <button 
                    onClick={() => {
                      const templateData = [
                        ['Nomor Absen', 'Nama Lengkap', 'NIS', 'NISN', 'SANDI', 'Kelas', 'Jenis Kelamin (L/P)']
                      ];
                      const ws = XLSX.utils.aoa_to_sheet(templateData);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Template Siswa");
                      XLSX.writeFile(wb, "Template_Data_Siswa.xlsx");
                    }}
                    className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-1 shadow-sm"
                  >
                    <Download size={14} /> TEMPLATE
                  </button>
                  <label className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs font-bold hover:bg-blue-100 transition-all flex items-center gap-1 shadow-sm cursor-pointer">
                    <Plus size={14} /> UPLOAD TEMPLATE
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".xlsx, .xls" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                          const data = new Uint8Array(event.target?.result as ArrayBuffer);
                          const workbook = XLSX.read(data, { type: 'array' });
                          const sheetName = workbook.SheetNames[0];
                          const worksheet = workbook.Sheets[sheetName];
                          const jsonData = XLSX.utils.sheet_to_json(worksheet);
                          
                          if (jsonData.length === 0) {
                            alert('File kosong atau format salah.');
                            return;
                          }

                          setLoading(true);
                          setUploadProgress({ current: 0, total: jsonData.length, label: 'Mengunggah Data Siswa' });
                          try {
                            let count = 0;
                            const affectedClasses = new Set<string>();
                            for (const row of jsonData as any[]) {
                              if (row['Kelas']) affectedClasses.add(String(row['Kelas']));
                              await addDoc(collection(db, 'students'), {
                                name: row['Nama Lengkap'] || row['Nama'] || '',
                                nis: String(row['NIS'] || ''),
                                nisn: String(row['NISN'] || ''),
                                className: String(row['Kelas'] || ''),
                                absensiNo: String(row['Nomor Absen'] || ''),
                                gender: row['Jenis Kelamin (L/P)'] || row['Jenis Kelamin'] || ''
                              });
                              count++;
                              setUploadProgress({ current: count, total: jsonData.length, label: 'Mengunggah Data Siswa' });
                            }
                            
                            setUploadProgress({ current: jsonData.length, total: jsonData.length, label: 'Menghasilkan Sandi...' });
                            // Let the database settle before generating passwords
                            setTimeout(async () => {
                              try {
                                const promises = Array.from(affectedClasses).map(cls => generatePasswordsForClass(cls));
                                await Promise.all(promises);
                                fetchData();
                              } catch (e) {
                                console.error('Failed to update uploaded passwords:', e);
                              }
                            }, 1000);

                            alert(`${jsonData.length} Siswa berhasil diunggah!`);
                            fetchData();
                          } catch (err) {
                            console.error(err);
                            alert('Gagal mengunggah data.');
                          } finally {
                            setLoading(false);
                            setUploadProgress(null);
                          }
                        };
                        reader.readAsArrayBuffer(file);
                      }}
                    />
                  </label>
               </div>
             )}

             {activeTab === 'teachers' && (
               <div className="flex gap-2">
                  <button 
                    onClick={() => downloadTeachersPDF('Wali Kelas')}
                    className="px-3 py-2 bg-red-50 text-red-700 border border-red-100 rounded text-xs font-bold hover:bg-red-100 transition-all flex items-center gap-1 shadow-sm uppercase"
                  >
                    <Download size={14} /> PDF
                  </button>
                  <button 
                    onClick={() => {
                      const templateData = [
                        ['Nama Guru', 'NIP', 'SANDI', 'Kelas Ampuan']
                      ];
                      const ws = XLSX.utils.aoa_to_sheet(templateData);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Template Wali Kelas");
                      XLSX.writeFile(wb, "Template_Data_Wali_Kelas.xlsx");
                    }}
                    className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-1 shadow-sm"
                  >
                    <Download size={14} /> TEMPLATE
                  </button>
                  <label className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs font-bold hover:bg-blue-100 transition-all flex items-center gap-1 shadow-sm cursor-pointer">
                    <Plus size={14} /> UPLOAD TEMPLATE
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".xlsx, .xls" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                          const data = new Uint8Array(event.target?.result as ArrayBuffer);
                          const workbook = XLSX.read(data, { type: 'array' });
                          const sheetName = workbook.SheetNames[0];
                          const worksheet = workbook.Sheets[sheetName];
                          const jsonData = XLSX.utils.sheet_to_json(worksheet);
                          
                          if (jsonData.length === 0) {
                            alert('File kosong atau format salah.');
                            return;
                          }

                          setLoading(true);
                          setUploadProgress({ current: 0, total: jsonData.length, label: 'Mengunggah Data Wali Kelas' });
                          try {
                            let count = 0;
                            for (const row of jsonData as any[]) {
                              const nip = String(row['NIP'] || '');
                              const password = row['SANDI'] || row['Kata Sandi'] || row['Sandi'] || (nip.length >= 8 ? nip.substring(0, 8) : '123456');
                              
                              await addDoc(collection(db, 'teachers'), {
                                name: row['Nama Guru'] || row['Nama'] || '',
                                nip: nip,
                                password: password,
                                className: String(row['Kelas Ampuan'] || ''),
                                status: ['Wali Kelas'],
                                role: 'TEACHER'
                              });
                              count++;
                              setUploadProgress({ current: count, total: jsonData.length, label: 'Mengunggah Data Wali Kelas' });
                            }
                            alert(`${jsonData.length} Wali Kelas berhasil diunggah!`);
                            fetchData();
                          } catch (err) {
                            console.error(err);
                            alert('Gagal mengunggah data.');
                          } finally {
                            setLoading(false);
                            setUploadProgress(null);
                          }
                        };
                        reader.readAsArrayBuffer(file);
                      }}
                    />
                  </label>
               </div>
             )}

             {activeTab === 'teachers-list' && (
               <div className="flex gap-2">
                  <button 
                    onClick={() => downloadTeachersPDF('Semua Guru')}
                    className="px-3 py-2 bg-red-50 text-red-700 border border-red-100 rounded text-xs font-bold hover:bg-red-100 transition-all flex items-center gap-1 shadow-sm uppercase"
                  >
                    <Download size={14} /> PDF
                  </button>
                  <button 
                    onClick={() => {
                      const templateData = [
                        ['Nama Guru', 'NIP', 'SANDI', 'Status/Jabatan']
                      ];
                      const ws = XLSX.utils.aoa_to_sheet(templateData);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Template Data Guru");
                      XLSX.writeFile(wb, "Template_Data_Guru.xlsx");
                    }}
                    className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-1 shadow-sm"
                  >
                    <Download size={14} /> TEMPLATE
                  </button>
                  <label className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs font-bold hover:bg-blue-100 transition-all flex items-center gap-1 shadow-sm cursor-pointer">
                    <Plus size={14} /> UPLOAD TEMPLATE
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".xlsx, .xls" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                          const data = new Uint8Array(event.target?.result as ArrayBuffer);
                          const workbook = XLSX.read(data, { type: 'array' });
                          const sheetName = workbook.SheetNames[0];
                          const worksheet = workbook.Sheets[sheetName];
                          const jsonData = XLSX.utils.sheet_to_json(worksheet);
                          
                          if (jsonData.length === 0) {
                            alert('File kosong atau format salah.');
                            return;
                          }

                          setLoading(true);
                          setUploadProgress({ current: 0, total: jsonData.length, label: 'Mengunggah Data Guru' });
                          try {
                            let count = 0;
                            for (const row of jsonData as any[]) {
                              let statusArr: string[] = [];
                              const rawStatusStr = String(row['Status/Jabatan'] || row['Status'] || row['Jabatan'] || '');
                              if (rawStatusStr && rawStatusStr !== 'undefined') {
                                statusArr = rawStatusStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
                              }

                              const nip = String(row['NIP'] || '');
                              const password = row['Kata Sandi'] || row['Sandi'] || (nip.length >= 8 ? nip.substring(0, 8) : '123456');

                              await addDoc(collection(db, 'teachers'), {
                                name: row['Nama Guru'] || row['Nama'] || '',
                                nip: nip,
                                password: String(password),
                                status: statusArr,
                                role: 'TEACHER'
                              });
                              count++;
                              setUploadProgress({ current: count, total: jsonData.length, label: 'Mengunggah Data Guru' });
                            }
                            fetchData();
                            alert('Data Guru berhasil diunggah!');
                          } catch (error) {
                            console.error('Error uploading:', error);
                            alert('Gagal mengunggah data.');
                          } finally {
                            setLoading(false);
                            setUploadProgress(null);
                            // Reset input
                            e.target.value = '';
                          }
                        };
                        reader.readAsArrayBuffer(file);
                      }}
                    />
                  </label>
               </div>
             )}

             {activeTab === 'subject-teachers' && (
               <div className="flex gap-2">
                  <button 
                    onClick={() => downloadTeachersPDF('Guru Mapel')}
                    className="px-3 py-2 bg-red-50 text-red-700 border border-red-100 rounded text-xs font-bold hover:bg-red-100 transition-all flex items-center gap-1 shadow-sm uppercase"
                  >
                    <Download size={14} /> PDF
                  </button>
                  <button 
                    onClick={() => {
                      const templateData = [
                        ['Nama Guru', 'Bidang Studi (pisahkan koma: MTK, IPA)', 'Kelas Ampuan (pisahkan koma: 7A, 7B)']
                      ];
                      const ws = XLSX.utils.aoa_to_sheet(templateData);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Template Guru Mapel");
                      XLSX.writeFile(wb, "Template_Data_Guru_Mapel.xlsx");
                    }}
                    className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-1 shadow-sm"
                  >
                    <Download size={14} /> TEMPLATE
                  </button>
                  <label className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs font-bold hover:bg-blue-100 transition-all flex items-center gap-1 shadow-sm cursor-pointer">
                    <CloudUpload size={14} /> UPLOAD TEMPLATE
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".xlsx, .xls" 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                          const data = new Uint8Array(event.target?.result as ArrayBuffer);
                          const workbook = XLSX.read(data, { type: 'array' });
                          const sheetName = workbook.SheetNames[0];
                          const worksheet = workbook.Sheets[sheetName];
                          const jsonData = XLSX.utils.sheet_to_json(worksheet);
                          
                          if (jsonData.length === 0) {
                            alert('File kosong atau format salah.');
                            return;
                          }

                          setLoading(true);
                          setUploadProgress({ current: 0, total: jsonData.length, label: 'Mengunggah Data Guru Mapel' });
                          try {
                            let count = 0;
                            for (const row of jsonData as any[]) {
                              const subjectsRaw = String(row['Bidang Studi (pisahkan koma: MTK, IPA)'] || '');
                              const classesRaw = String(row['Kelas Ampuan (pisahkan koma: 7A, 7B)'] || '');
                              
                              const subjects = subjectsRaw ? subjectsRaw.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];
                              const taughtClasses = classesRaw ? classesRaw.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];

                              await addDoc(collection(db, 'teachers'), {
                                name: row['Nama Guru'] || '',
                                status: ['Guru Mata Pelajaran'],
                                subjects: subjects,
                                taughtClasses: taughtClasses,
                                role: 'TEACHER'
                              });
                              count++;
                              setUploadProgress({ current: count, total: jsonData.length, label: 'Mengunggah Data Guru Mapel' });
                            }
                            alert(`${jsonData.length} Guru Mata Pelajaran berhasil diunggah!`);
                            fetchData();
                          } catch (err) {
                            console.error(err);
                            alert('Gagal mengunggah data.');
                          } finally {
                            setLoading(false);
                            setUploadProgress(null);
                            e.target.value = '';
                          }
                        };
                        reader.readAsArrayBuffer(file);
                      }}
                    />
                  </label>
               </div>
             )}
             
             {activeTab === 'attendance-summary' && (
               <div className="flex flex-wrap items-center gap-2">
                 <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">
                    <Calendar size={14} className="text-blue-600" />
                    <span className="text-[10px] font-bold text-blue-700 uppercase">Pilih Tanggal</span>
                 </div>
                 <input 
                  type="date" 
                  className="p-2 border border-blue-300 rounded text-sm outline-none shadow-sm font-bold text-blue-700 focus:ring-2 focus:ring-blue-100"
                  value={filterDate || today}
                  onChange={(e) => setFilterDate(e.target.value)}
                 />
                 <button 
                  onClick={fetchData}
                  className="p-2 bg-white border border-gray-200 rounded text-gray-500 hover:text-blue-600"
                  title="Refresh Data"
                 >
                   <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                 </button>
               </div>
             )}

             {(activeTab === 'attendance' || activeTab === 'attendance-detail') && (
               <div className="flex flex-wrap items-center gap-2">
                 <select 
                  className="p-2 border border-gray-300 rounded text-sm outline-none shadow-sm"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                 >
                   <option value="">Semua Kelas</option>
                   {classes.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, {numeric: true})).map((cl, idx) => (
                     <option key={cl.id || `filter-class-${idx}`} value={cl.name}>{cl.name}</option>
                   ))}
                 </select>
                 <input 
                  type="date" 
                  className="p-2 border border-gray-300 rounded text-sm outline-none shadow-sm"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                 />
                 <select 
                  className="p-2 border border-gray-300 rounded text-sm outline-none shadow-sm"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                 >
                   <option value="All">Semua Jenis</option>
                   <option value="Sakit">Sakit</option>
                   <option value="Izin">Izin</option>
                   <option value="Dispensasi">Dispensasi</option>
                   <option value="Alpa">Alpa</option>
                 </select>
                 
                 <div className="flex gap-2">
                    <button 
                      onClick={() => setShowImportModal(true)}
                      className="px-3 py-2 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition-all flex items-center gap-1 shadow-sm"
                      title="Impor dari WhatsApp"
                    >
                      <MessageCircle size={14} /> IMPOR WA
                    </button>
                    <button 
                      onClick={exportToExcel}
                      className="px-3 py-2 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700 transition-all flex items-center gap-1 shadow-sm"
                    >
                      <Download size={14} /> EXCEL
                    </button>
                    <button 
                      onClick={exportToPDF}
                      className="px-3 py-2 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-1 shadow-sm"
                    >
                      <Download size={14} /> PDF
                    </button>
                 </div>
               </div>
             )}
           </div>

           {(activeTab !== 'attendance' && activeTab !== 'settings') && (
             <div className="flex gap-2">
               {activeTab === 'classes' && (
                 <button 
                   onClick={exportClassesToPDF}
                   className="px-4 py-2 bg-red-600 text-white rounded text-sm font-bold flex items-center gap-2 hover:bg-red-700 transition-all shadow-md"
                 >
                   <Download size={18} />
                   Download PDF
                 </button>
               )}
               <button 
                 onClick={() => { setFormData({}); setShowAddModal(true); }}
                 className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-md"
               >
                 <Plus size={18} />
                 Tambah Data
               </button>
             </div>
           )}
          {activeTab === 'teachers-list' && (
            <div className="flex gap-2">
               <button 
                onClick={handleDeleteSelectedTeachers}
                disabled={selectedTeachers.length === 0}
                className="px-3 py-2 bg-orange-600 text-white rounded text-xs font-bold hover:bg-orange-700 transition-all flex items-center gap-1 shadow-sm disabled:opacity-50"
              >
                <Trash2 size={14} /> HAPUS TERPILIH ({selectedTeachers.length})
              </button>
              <button 
                onClick={handleDeleteAllTeachers}
                className="px-3 py-2 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-1 shadow-sm"
              >
                <AlertCircle size={14} /> HAPUS SEMUA
              </button>
            </div>
          )}
        </div>

        {/* Table Area (AdminLTE Style Tables) */}
        <div className="overflow-x-auto">
          {activeTab === 'students' && (
            <>
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 w-10 border-r border-gray-200">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={paginatedStudents.length > 0 && paginatedStudents.every(s => selectedStudents.includes(s.id))}
                      onChange={toggleAllStudentsOnPage}
                    />
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">No Absen</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Nama Lengkap</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Kelas</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">JK</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">NIS (ID)</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Sandi Ortu</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedStudents.map((s, idx) => (
                  <tr key={s.id} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50", selectedStudents.includes(s.id) && "bg-blue-50/50")}>
                    <td className="px-6 py-3 border-r border-gray-100 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedStudents.includes(s.id)}
                        onChange={() => toggleStudentSelection(s.id)}
                      />
                    </td>
                    <td className="px-6 py-3 border-r border-gray-100 text-center font-bold text-gray-400 text-xs">{s.absensiNo || '-'}</td>
                    <td className="px-6 py-3 border-r border-gray-100 font-medium text-gray-900">{s.name}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm font-bold text-blue-600">{s.className}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm text-center">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold",
                        (s.gender || '').trim().toLowerCase().startsWith('l') ? "bg-blue-100 text-blue-600" : "bg-pink-100 text-pink-600"
                      )}>
                        {(s.gender || '').trim().toLowerCase().startsWith('l') ? 'Laki-Laki' : 'Perempuan'}
                      </span>
                    </td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">{s.nis}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm font-mono text-gray-700">{s.parentPassword || '-'}</td>
                    <td className="px-6 py-3 text-center">
                       <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => { setFormData(s); setShowAddModal(true); }}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold uppercase hover:bg-blue-700 transition-all flex items-center gap-1"
                          >
                            <Edit size={12} /> EDIT
                          </button>
                          <button onClick={() => handleDelete(s.id, 'students')} className="px-3 py-1 bg-red-600 text-white rounded text-[10px] font-bold uppercase hover:bg-red-700 transition-all flex items-center gap-1">
                            <Trash2 size={12} /> HAPUS
                          </button>
                          <button 
                            onClick={() => printIDCard(s)}
                            className="px-3 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold uppercase hover:bg-emerald-700 transition-all flex items-center gap-1"
                          >
                            <IdCard size={12} /> KARTU
                          </button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {totalStudentPages > 1 && (
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  Menampilkan {((studentPage - 1) * itemsPerPage) + 1} - {Math.min(studentPage * itemsPerPage, filteredStudents.length)} dari {filteredStudents.length} Siswa
                </p>
                <div className="flex items-center gap-2">
                   <button 
                    disabled={studentPage === 1}
                    onClick={() => setStudentPage(studentPage - 1)}
                    className="p-2 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-all"
                   >
                     Sebelumnya
                   </button>
                   {[...Array(totalStudentPages)].map((_, i) => (
                     <button 
                      key={i}
                      onClick={() => setStudentPage(i + 1)}
                      className={cn(
                        "w-8 h-8 rounded text-xs font-bold transition-all",
                        studentPage === i + 1 ? "bg-blue-600 text-white" : "hover:bg-gray-200 bg-white border border-gray-300"
                      )}
                     >
                       {i + 1}
                     </button>
                   ))}
                   <button 
                    disabled={studentPage === totalStudentPages}
                    onClick={() => setStudentPage(studentPage + 1)}
                    className="p-2 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-all"
                   >
                     Selanjutnya
                   </button>
                </div>
              </div>
            )}
            </>
          )}

          {activeTab === 'teachers' && (
            <>
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 w-10 border-r border-gray-200">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={teachers.filter(t => t.status?.includes('Wali Kelas')).length > 0 && teachers.filter(t => t.status?.includes('Wali Kelas')).every(t => selectedTeachers.includes(t.id!))}
                      onChange={() => toggleAllTeachers(teachers.filter(t => t.status?.includes('Wali Kelas')).map(t => t.id!))}
                    />
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200 text-center">No</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Nama Guru</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">NIP</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Kelas Ampuan</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedWaliKelas.map((t, idx) => (
                  <tr key={t.id} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50", t.id && selectedTeachers.includes(t.id) && "bg-blue-50")}>
                    <td className="px-6 py-3 border-r border-gray-100 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={t.id ? selectedTeachers.includes(t.id) : false}
                        onChange={() => t.id && toggleTeacherSelection(t.id)}
                      />
                    </td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm font-bold text-gray-400 text-center">{(waliKelasPage - 1) * itemsPerPage + idx + 1}</td>
                    <td className="px-6 py-3 border-r border-gray-100 font-medium text-gray-900">{t.name}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">{t.nip || '-'}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm font-bold text-blue-600">{t.className || '-'}</td>
                    <td className="px-6 py-3 text-center">
                       <div className="flex items-center justify-center gap-2">
                          <button onClick={() => { setFormData(t); setShowAddModal(true); }} className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold uppercase hover:bg-blue-700 transition-all flex items-center gap-1">
                            <Edit size={12} /> EDIT
                          </button>
                          <button onClick={() => t.id && handleDelete(t.id, 'teachers')} className="px-3 py-1 bg-red-600 text-white rounded text-[10px] font-bold uppercase hover:bg-red-700 transition-all flex items-center gap-1">
                            <Trash2 size={12} /> HAPUS
                          </button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls Wali Kelas */}
            {totalWaliKelasPages > 1 && (
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  Menampilkan {((waliKelasPage - 1) * itemsPerPage) + 1} - {Math.min(waliKelasPage * itemsPerPage, filteredWaliKelas.length)} dari {filteredWaliKelas.length} Wali Kelas
                </p>
                <div className="flex items-center gap-2">
                   <button 
                    disabled={waliKelasPage === 1}
                    onClick={() => setWaliKelasPage(waliKelasPage - 1)}
                    className="p-2 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                   >
                     Sebelumnya
                   </button>
                   {[...Array(totalWaliKelasPages)].map((_, i) => (
                     <button 
                      key={i}
                      onClick={() => setWaliKelasPage(i + 1)}
                      className={cn(
                        "w-8 h-8 rounded text-xs font-bold transition-all",
                        waliKelasPage === i + 1 ? "bg-blue-600 text-white" : "hover:bg-gray-200 bg-white border border-gray-300"
                      )}
                     >
                       {i + 1}
                     </button>
                   ))}
                   <button 
                    disabled={waliKelasPage === totalWaliKelasPages}
                    onClick={() => setWaliKelasPage(waliKelasPage + 1)}
                    className="p-2 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                   >
                     Selanjutnya
                   </button>
                </div>
              </div>
            )}
            </>
          )}

          {activeTab === 'teachers-list' && (
            <>
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 w-10 border-r border-gray-200">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={teachers.length > 0 && teachers.every(t => selectedTeachers.includes(t.id!))}
                      onChange={() => toggleAllTeachers()}
                    />
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">No</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Nama Guru</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">NIP</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">SANDI</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">STATUS</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedTeacherList.map((t, idx) => (
                  <tr key={t.id} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50", t.id && selectedTeachers.includes(t.id) && "bg-blue-50")}>
                    <td className="px-6 py-3 border-r border-gray-100 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={t.id ? selectedTeachers.includes(t.id) : false}
                        onChange={() => t.id && toggleTeacherSelection(t.id)}
                      />
                    </td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm font-bold text-gray-400">{(teacherListPage - 1) * itemsPerPage + idx + 1}</td>
                    <td className="px-6 py-3 border-r border-gray-100 font-medium text-gray-900">{t.name}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">{t.nip || '-'}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm font-mono">{t.password || '-'}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(t.status) 
                          ? (t.status as string[]).map(s => s === 'Wali Kelas' && t.className ? `Wali Kelas ${t.className}` : s).join('/') 
                          : (t.status || '-')}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-center">
                       <div className="flex items-center justify-center gap-2">
                          <button onClick={() => { setFormData(t); setShowAddModal(true); }} className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold uppercase hover:bg-blue-700 transition-all flex items-center gap-1">
                            <Edit size={12} /> EDIT
                          </button>
                          <button onClick={() => t.id && handleDelete(t.id, 'teachers')} className="px-3 py-1 bg-red-600 text-white rounded text-[10px] font-bold uppercase hover:bg-red-700 transition-all flex items-center gap-1">
                            <Trash2 size={12} /> HAPUS
                          </button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls Data Guru */}
            {totalTeacherListPages > 1 && (
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  Menampilkan {((teacherListPage - 1) * itemsPerPage) + 1} - {Math.min(teacherListPage * itemsPerPage, filteredTeacherList.length)} dari {filteredTeacherList.length} Guru
                </p>
                <div className="flex items-center gap-2">
                   <button 
                    disabled={teacherListPage === 1}
                    onClick={() => setTeacherListPage(teacherListPage - 1)}
                    className="p-2 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                   >
                     Sebelumnya
                   </button>
                   {[...Array(totalTeacherListPages)].map((_, i) => (
                     <button 
                      key={i}
                      onClick={() => setTeacherListPage(i + 1)}
                      className={cn(
                        "w-8 h-8 rounded text-xs font-bold transition-all",
                        teacherListPage === i + 1 ? "bg-blue-600 text-white" : "hover:bg-gray-200 bg-white border border-gray-300"
                      )}
                     >
                       {i + 1}
                     </button>
                   ))}
                   <button 
                    disabled={teacherListPage === totalTeacherListPages}
                    onClick={() => setTeacherListPage(teacherListPage + 1)}
                    className="p-2 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                   >
                     Selanjutnya
                   </button>
                </div>
              </div>
            )}
            </>
          )}

          {activeTab === 'subject-teachers' && (
            <>
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200 text-center">No</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Nama Guru</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Bidang Studi</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Kelas Ampuan</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedSubjectTeachers.map((t, idx) => (
                  <tr key={t.id} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50")}>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm font-bold text-gray-400 text-center">{(subjectTeacherPage - 1) * itemsPerPage + idx + 1}</td>
                    <td className="px-6 py-3 border-r border-gray-100 font-medium text-gray-900">{t.name}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(t.subjects) ? t.subjects : []).map((s, si) => (
                          <span key={si} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded border border-blue-100">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(t.taughtClasses) ? t.taughtClasses : []).map((c, ci) => (
                          <span key={ci} className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded border border-emerald-100">{c}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-center">
                       <div className="flex items-center justify-center gap-2">
                          <button onClick={() => { 
                            setFormData({
                              ...t,
                              subjects: Array.isArray(t.subjects) ? t.subjects.join(', ') : t.subjects,
                              taughtClasses: Array.isArray(t.taughtClasses) ? t.taughtClasses.join(', ') : t.taughtClasses
                            }); 
                            setShowAddModal(true); 
                          }} className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold uppercase hover:bg-blue-700 transition-all flex items-center gap-1">
                            <Edit size={12} /> EDIT
                          </button>
                          <button onClick={() => t.id && handleDelete(t.id, 'teachers')} className="px-3 py-1 bg-red-600 text-white rounded text-[10px] font-bold uppercase hover:bg-red-700 transition-all flex items-center gap-1">
                            <Trash2 size={12} /> HAPUS
                          </button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls Data Guru Mapel */}
            {totalSubjectTeacherPages > 1 && (
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  Menampilkan {((subjectTeacherPage - 1) * itemsPerPage) + 1} - {Math.min(subjectTeacherPage * itemsPerPage, filteredSubjectTeachers.length)} dari {filteredSubjectTeachers.length} Guru Mapel
                </p>
                <div className="flex items-center gap-2">
                   <button 
                    disabled={subjectTeacherPage === 1}
                    onClick={() => setSubjectTeacherPage(subjectTeacherPage - 1)}
                    className="p-2 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                   >
                     Sebelumnya
                   </button>
                   {[...Array(totalSubjectTeacherPages)].map((_, i) => (
                     <button 
                      key={i}
                      onClick={() => setSubjectTeacherPage(i + 1)}
                      className={cn(
                        "w-8 h-8 rounded text-xs font-bold transition-all",
                        subjectTeacherPage === i + 1 ? "bg-blue-600 text-white" : "hover:bg-gray-200 bg-white border border-gray-300"
                      )}
                     >
                       {i + 1}
                     </button>
                   ))}
                   <button 
                    disabled={subjectTeacherPage === totalSubjectTeacherPages}
                    onClick={() => setSubjectTeacherPage(subjectTeacherPage + 1)}
                    className="p-2 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                   >
                     Selanjutnya
                   </button>
                </div>
              </div>
            )}
            </>
          )}

          {activeTab === 'counselors' && (
            <>
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200 text-center">No</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Nama Guru BK</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">NIP</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Kelas Bimbingan</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedCounselors.map((c, idx) => (
                  <tr key={c.id} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50")}>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm font-bold text-gray-400 text-center">{(counselorPage - 1) * itemsPerPage + idx + 1}</td>
                    <td className="px-6 py-3 border-r border-gray-100 font-medium text-gray-900">{c.name}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">{c.nip}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">
                       <div className="flex flex-wrap gap-1">
                          {c.managedClasses?.map((cl: string, cIdx: number) => (
                            <span key={`${cl}-${cIdx}`} className="px-2 py-0.5 bg-purple-50 text-purple-600 text-[10px] font-bold rounded border border-purple-100">{cl}</span>
                          ))}
                       </div>
                    </td>
                    <td className="px-6 py-3 text-center">
                       <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => {
                              setFormData({
                                ...c,
                                managedClasses: Array.isArray(c.managedClasses) ? c.managedClasses.join(', ') : c.managedClasses,
                                subjects: Array.isArray(c.subjects) ? c.subjects.join(', ') : c.subjects,
                                taughtClasses: Array.isArray(c.taughtClasses) ? c.taughtClasses.join(', ') : c.taughtClasses,
                                isChangingRole: true
                              }); 
                              setShowAddModal(true); 
                            }} 
                            className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold uppercase hover:bg-blue-700 transition-all flex items-center gap-1"
                          >
                            <Edit size={12} /> EDIT
                          </button>
                          <button onClick={() => c.id && handleDelete(c.id, 'teachers')} className="px-3 py-1 bg-red-600 text-white rounded text-[10px] font-bold uppercase hover:bg-red-700 transition-all flex items-center gap-1">
                            <Trash2 size={12} /> HAPUS
                          </button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls Guru BK */}
            {totalCounselorPages > 1 && (
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  Menampilkan {((counselorPage - 1) * itemsPerPage) + 1} - {Math.min(counselorPage * itemsPerPage, counselorTeachers.length)} dari {counselorTeachers.length} Guru BK
                </p>
                <div className="flex items-center gap-2">
                   <button 
                    disabled={counselorPage === 1}
                    onClick={() => setCounselorPage(counselorPage - 1)}
                    className="p-2 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                   >
                     Sebelumnya
                   </button>
                   {[...Array(totalCounselorPages)].map((_, i) => (
                     <button 
                      key={i}
                      onClick={() => setCounselorPage(i + 1)}
                      className={cn(
                        "w-8 h-8 rounded text-xs font-bold transition-all",
                        counselorPage === i + 1 ? "bg-blue-600 text-white" : "hover:bg-gray-200 bg-white border border-gray-300"
                      )}
                     >
                       {i + 1}
                     </button>
                   ))}
                   <button 
                    disabled={counselorPage === totalCounselorPages}
                    onClick={() => setCounselorPage(counselorPage + 1)}
                    className="p-2 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                   >
                     Selanjutnya
                   </button>
                </div>
              </div>
            )}
            </>
          )}

          {activeTab === 'subject-attendance-report' && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="text"
                      placeholder="Cari siswa, guru, atau mapel..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-64"
                    />
                  </div>
                  <select 
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="p-2 border border-gray-200 rounded-lg text-sm outline-none"
                  >
                    <option value="">Semua Kelas</option>
                    {classes.map(cl => (
                      <option key={cl.id} value={cl.name}>{cl.name}</option>
                    ))}
                  </select>
                </div>
                <button 
                  onClick={() => {
                    const ws = XLSX.utils.json_to_sheet(subjectAttendances.map(att => ({
                      Tanggal: att.date,
                      'Jam Ke': att.period,
                      Kelas: att.className,
                      'Mata Pelajaran': att.subjectName,
                      'Guru Mapel': att.teacherName,
                      'Nama Siswa': att.studentName,
                      Status: att.status,
                      Catatan: att.notes || '-'
                    })));
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Laporan Absensi Mapel");
                    XLSX.writeFile(wb, `Laporan_Absensi_Mapel_${formatDate(new Date())}.xlsx`);
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-green-700 transition-all shadow-sm"
                >
                  <Download size={18} /> Ekspor Excel
                </button>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Waktu</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Kelas & Jam</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Mapel & Guru</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Siswa</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Pesan</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Jawaban</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Status</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {paginatedInquiries.map((inq, idx) => (
                      <tr key={inq.id} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50")}>
                        <td className="px-6 py-4 border-r border-gray-100">
                          <p className="text-xs font-bold text-gray-900">{inq.createdAt?.toDate ? formatDate(inq.createdAt.toDate()) : '-'}</p>
                        </td>
                        <td className="px-6 py-4 border-r border-gray-100">
                          <p className="text-xs font-bold text-blue-600">{inq.className}</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Jam Ke {inq.period || '-'}</p>
                        </td>
                        <td className="px-6 py-4 border-r border-gray-100">
                          <p className="text-xs font-bold text-gray-900">{inq.subjectName}</p>
                          <p className="text-[10px] text-gray-500 font-medium italic">{inq.subjectTeacherName}</p>
                        </td>
                        <td className="px-6 py-4 border-r border-gray-100">
                          <p className="text-xs font-bold text-gray-900">{inq.studentName}</p>
                        </td>
                         <td className="px-6 py-4 border-r border-gray-100">
                          <p className="text-xs text-gray-600 italic">"{inq.message}"</p>
                        </td>
                        <td className="px-6 py-4 border-r border-gray-100">
                          <p className="text-xs text-gray-800 font-medium">{inq.response || '-'}</p>
                          {inq.respondedAt && <p className="text-[9px] text-gray-400">Oleh: {inq.respondedBy}</p>}
                        </td>
                        <td className="px-6 py-4 border-r border-gray-100">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-bold border",
                            inq.status === 'Sudah di Jawab' ? 'bg-green-100 text-green-600 border-green-200' : 'bg-orange-100 text-orange-600 border-orange-200'
                          )}>
                             {inq.status?.toUpperCase() || 'MENUNGGU'}
                          </span>
                        </td>
                        <td className="px-6 py-4 border-r border-gray-100">
                          <p className="text-xs text-gray-600 italic">-</p>
                        </td>
                      </tr>
                    ))}
                    {paginatedInquiries.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-gray-500 italic">
                          Belum ada data pertanyaan ketidakhadiran.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalInquiryPages > 1 && (
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Menampilkan {((subjectInquiryPage - 1) * itemsPerPage) + 1} - {Math.min(subjectInquiryPage * itemsPerPage, filteredInquiries.length)} dari {filteredInquiries.length} Laporan
                  </p>
                  <div className="flex items-center gap-2">
                    <button 
                      disabled={subjectInquiryPage === 1}
                      onClick={() => setSubjectInquiryPage(subjectInquiryPage - 1)}
                      className="p-2 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                    >
                      Sebelumnya
                    </button>
                    {[...Array(totalInquiryPages)].map((_, i) => (
                      <button 
                        key={i}
                        onClick={() => setSubjectInquiryPage(i + 1)}
                        className={cn(
                          "w-8 h-8 rounded text-xs font-bold transition-all",
                          subjectInquiryPage === i + 1 ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "hover:bg-gray-200 bg-white border border-gray-300"
                        )}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button 
                      disabled={subjectInquiryPage === totalInquiryPages}
                      onClick={() => setSubjectInquiryPage(subjectInquiryPage + 1)}
                      className="p-2 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                    >
                      Selanjutnya
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'classes' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200 text-center text-gray-500">No</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Nama Kelas</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200 text-center">Jumlah Siswa</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200 text-center text-blue-600">L</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200 text-center text-pink-600">P</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Nama Wali Kelas</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Guru BK</th>
                      <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {paginatedClasses.map((cl, idx) => {
                      const classStudents = students.filter(s => (s.className || '').toLowerCase() === (cl.name || '').toLowerCase());
                      const maleCount = classStudents.filter(s => {
                        const g = (s.gender || '').trim().toLowerCase();
                        return g === 'l' || g.startsWith('laki') || g === 'laki-laki';
                      }).length;
                      const femaleCount = classStudents.filter(s => {
                        const g = (s.gender || '').trim().toLowerCase();
                        return g === 'p' || g.startsWith('perem') || g === 'perempuan';
                      }).length;
                      const waliKelas = teachers.find(t => (t.className || '').toLowerCase() === (cl.name || '').toLowerCase())?.name || '-';
                      const guruBK = teachers.filter(t => t.status?.includes('Guru BK') && t.managedClasses?.some((mc: string) => mc.toLowerCase() === (cl.name || '').toLowerCase())).map(t => t.name).join(', ') || '-';
                      
                      return (
                        <tr key={cl.id || cl.name} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50")}>
                          <td className="px-6 py-3 border-r border-gray-100 text-sm font-bold text-gray-400 text-center">{(classPage - 1) * itemsPerPage + idx + 1}</td>
                          <td className="px-6 py-3 border-r border-gray-100 font-bold text-gray-900">{cl.name}</td>
                          <td className="px-6 py-3 border-r border-gray-100 text-sm text-center font-bold">
                            {classStudents.length}
                          </td>
                          <td className="px-6 py-3 border-r border-gray-100 text-sm text-center font-bold text-blue-600">{maleCount}</td>
                          <td className="px-6 py-3 border-r border-gray-100 text-sm text-center font-bold text-pink-600">{femaleCount}</td>
                          <td className="px-6 py-3 border-r border-gray-100 text-sm font-medium">{waliKelas}</td>
                          <td className="px-6 py-3 border-r border-gray-100 text-sm font-medium">{guruBK}</td>
                          <td className="px-6 py-3 text-center">
                             <div className="flex items-center justify-center gap-2">
                                {cl.id ? (
                                  <>
                                    <button 
                                      onClick={() => { setFormData(cl); setShowAddModal(true); }}
                                      className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold uppercase hover:bg-blue-700 transition-all flex items-center gap-1"
                                    >
                                      <Edit size={12} /> EDIT
                                    </button>
                                    <button 
                                      onClick={() => handleDelete(cl.id!, 'classes')} 
                                      className="px-3 py-1 bg-red-600 text-white rounded text-[10px] font-bold uppercase hover:bg-red-700 transition-all flex items-center gap-1"
                                    >
                                      <Trash2 size={12} /> HAPUS
                                    </button>
                                  </>
                                ) : (
                                  <button 
                                    onClick={async () => {
                                      try {
                                        await addDoc(collection(db, 'classes'), { name: cl.name });
                                        fetchData();
                                      } catch (err) {
                                        alert('Gagal menyimpan kelas.');
                                      }
                                    }}
                                    className="px-3 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold uppercase hover:bg-emerald-700 transition-all flex items-center gap-1"
                                  >
                                    <Save size={12} /> SIMPAN KE MASTER
                                  </button>
                                )}
                             </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalClassPages > 1 && (
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Halaman {classPage} dari {totalClassPages}
                  </p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setClassPage(p => Math.max(1, p - 1))}
                      disabled={classPage === 1}
                      className="px-3 py-1 bg-white border border-gray-200 rounded text-xs font-bold disabled:opacity-50"
                    >
                      Sebelumnya
                    </button>
                    <button 
                      onClick={() => setClassPage(p => Math.min(totalClassPages, p + 1))}
                      disabled={classPage === totalClassPages}
                      className="px-3 py-1 bg-white border border-gray-200 rounded text-xs font-bold disabled:opacity-50"
                    >
                      Selanjutnya
                    </button>
                  </div>
                </div>
              )}
              </div>
            )}
            </div>
          </div>
        )}

          {activeTab === 'settings' && (
            <div className="p-6 space-y-6">
               <div>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Tahun Akademik</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                     {academicYears.map((y, idx) => (
                       <div key={y.id || `academic-year-${idx}`} className={cn("p-4 rounded-xl border flex items-center justify-between group transition-all", y.active ? "bg-blue-50 border-blue-200 shadow-sm" : "bg-white border-gray-100")}>
                          <div>
                             <p className="font-bold text-gray-900">{y.year}</p>
                             <p className="text-[10px] font-bold text-gray-400 uppercase">{y.active ? 'Status: Aktif' : 'Status: Non-Aktif'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {!y.active && (
                              <button 
                                onClick={async () => {
                                  // Confirm removed to prevent blocking in iframe
                                  try {
                                    setStatusMessage(`Sedang mengaktifkan ${y.year}...`);
                                    
                                    console.log('Activating year:', y.year, 'ID:', y.id);
                                    // 1. Deactivate any currently active year
                                    const activeYears = academicYears.filter(ay => ay.active);
                                    console.log('Active years to deactivate:', activeYears);
                                    for (const ay of activeYears) {
                                      await updateDoc(doc(db, 'academicYears', ay.id), { active: false });
                                    }
                                    
                                    // 2. Activate target year
                                    console.log('Updating document:', y.id);
                                    await updateDoc(doc(db, 'academicYears', y.id), { active: true });
                                    console.log('Activation successful');
                                    
                                    await fetchData();
                                    setStatusMessage("Tahun akademik berhasil diaktifkan.");
                                    setTimeout(() => setStatusMessage(''), 3000);
                                  } catch (err: any) {
                                    console.error(err);
                                    if (err.message?.includes('permission-denied')) {
                                      setStatusMessage("Gagal: Izin ditolak. Pastikan Anonymous Auth aktif & aturan Firestore sudah dideploy.");
                                    } else {
                                      setStatusMessage("Gagal mengaktifkan tahun akademik.");
                                    }
                                    setTimeout(() => setStatusMessage(''), 5000);
                                  }
                                }}
                                className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded shadow-sm hover:bg-blue-700 transition-colors"
                              >
                                 AKTIFKAN
                              </button>
                            )}
                            <button 
                              onClick={() => handleDelete(y.id!, 'academicYears')}
                              className={cn(
                                "p-1.5 rounded transition-colors",
                                y.active ? "text-blue-300 cursor-not-allowed" : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                              )}
                              disabled={y.active}
                              title={y.active ? "Tahun aktif tidak bisa dihapus" : "Hapus tahun akademik"}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                       </div>
                     ))}
                     <button 
                      onClick={() => { setFormData({}); setShowAddModal(true); }}
                      className="p-4 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 transition-all border-2 min-h-[82px]"
                     >
                        <Plus size={20} />
                        <span className="text-[10px] font-bold uppercase mt-1">Tambah Tahun</span>
                     </button>
                  </div>
               </div>
               <LogoSettings />
            </div>
          )}



          {activeTab === 'rekap' && (
            <AttendanceRecapTable 
              students={students} 
              attendance={attendance} 
              classes={classes}
              showClassFilter={true}
            />
          )}

          {activeTab === 'rekapSemester' && (
            <SemesterAttendanceRecapTable
              students={students}
              attendance={attendance}
              classes={classes}
              showClassFilter={true}
            />
          )}

          {activeTab === 'attendance-individual' && (
            <IndividualAttendance
              students={students}
              attendance={attendance}
              classes={classes}
              onAttendanceChange={fetchData}
            />
          )}

          {activeTab === 'school' && (
            <SchoolDataSettings />
          )}

          {newAttendanceNotification && (
            <div className="fixed bottom-6 right-6 z-[200] max-w-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-blue-600 text-white p-6 rounded-3xl shadow-2xl flex items-start gap-4 ring-4 ring-white"
              >
                 <div className="p-2 bg-white/20 rounded-xl font-bold">
                    <AlertCircle size={24} />
                 </div>
                 <div className="flex-1">
                    <h4 className="font-bold mb-1">Notifikasi Absensi</h4>
                    <p className="text-sm text-blue-50 leading-relaxed font-medium">{newAttendanceNotification}</p>
                    <button 
                      onClick={() => setNewAttendanceNotification(null)}
                      className="mt-4 px-4 py-2 bg-white text-blue-600 rounded-xl text-xs font-black uppercase hover:bg-blue-50 transition-colors"
                    >
                      MENGERTI
                    </button>
                 </div>
              </motion.div>
            </div>
          )}

          {(activeTab === 'attendance' || activeTab === 'attendance-summary') && (
            <div className="flex flex-col gap-6 p-4">
              {/* Summary Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 bg-blue-600 border-b border-blue-700 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                    <LayoutGrid size={18} />
                    Ringkasan Kehadiran per Kelas ({formatDate(new Date(filterDate || today))})
                  </h3>
                  <div className="text-[10px] font-bold text-blue-100 bg-blue-700/50 px-2 py-1 rounded">
                    Total {summaryTableData.length} Kelas
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Kelas</th>
                        <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200 text-center">Total Siswa</th>
                        <th className="px-6 py-3 text-xs font-bold text-green-700 uppercase border-r border-gray-200 text-center">Hadir</th>
                        <th className="px-6 py-3 text-xs font-bold text-red-700 uppercase border-r border-gray-200 text-center">Sakit</th>
                        <th className="px-6 py-3 text-xs font-bold text-yellow-700 uppercase border-r border-gray-200 text-center">Izin</th>
                        <th className="px-6 py-3 text-xs font-bold text-purple-700 uppercase border-r border-gray-200 text-center">Dispensasi</th>
                        <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase text-center">Alpa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {paginatedSummary.map((data, idx) => (
                        <tr key={`summary-${data.className}-${idx}`} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50")}>
                          <td className="px-6 py-4 border-r border-gray-100 font-black text-gray-900">{data.className}</td>
                          <td className="px-6 py-4 border-r border-gray-100 font-bold text-gray-700 text-center bg-gray-50/30">{data.total}</td>
                          <td className="px-6 py-4 border-r border-gray-100 font-black text-green-600 text-center">{data.hadir}</td>
                          <td className="px-6 py-4 border-r border-gray-100 font-black text-red-600 text-center">{data.sakit}</td>
                          <td className="px-6 py-4 border-r border-gray-100 font-black text-yellow-600 text-center">{data.izin}</td>
                          <td className="px-6 py-4 border-r border-gray-100 font-black text-purple-600 text-center">{data.dispensasi}</td>
                          <td className="px-6 py-4 font-black text-gray-600 text-center bg-gray-50/30">{data.alpa}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalSummaryPages > 1 && (
                  <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Halaman {summaryPage} dari {totalSummaryPages}
                    </p>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSummaryPage(p => Math.max(1, p - 1))}
                        disabled={summaryPage === 1}
                        className="px-3 py-1 bg-white border border-gray-200 rounded text-xs font-bold disabled:opacity-50"
                      >
                        Sebelumnya
                      </button>
                      <button 
                        onClick={() => setSummaryPage(p => Math.min(totalSummaryPages, p + 1))}
                        disabled={summaryPage === totalSummaryPages}
                        className="px-3 py-1 bg-white border border-gray-200 rounded text-xs font-bold disabled:opacity-50"
                      >
                        Selanjutnya
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'attendance-detail' && (
            <div className="flex flex-col gap-6 p-4">
              {/* Detail Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 bg-emerald-600 border-b border-emerald-700 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                    <Filter size={18} />
                    Detail Ketidakhadiran Siswa
                  </h3>
                  <div className="text-[10px] font-bold text-emerald-100 bg-emerald-700/50 px-2 py-1 rounded uppercase">
                    Status Dilaporkan
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Peserta Didik</th>
                        <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Tanggal</th>
                        <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Jam Masuk</th>
                        <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Jenis / Alasan</th>
                        <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Nama Ortu / WA</th>
                        <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200 text-center">Dokumen Pendukung</th>
                        <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200 text-center">Status</th>
                        <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Alasan Status</th>
                        <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase text-center">Aksi</th>
                      </tr>
                    </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedAttendanceDetail.length > 0 ? (
                  paginatedAttendanceDetail.sort((a,b) => (a.studentName || '').localeCompare(b.studentName || '')).map((a, idx) => (
                    <tr key={`${a.id}-${idx}`} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50")}>
                      <td className="px-6 py-3 border-r border-gray-100">
                         <p className="font-bold text-gray-900 text-sm">{a.studentName}</p>
                         <p className="text-[10px] font-bold text-blue-600 uppercase">{a.className}</p>
                      </td>
                      <td className="px-6 py-3 border-r border-gray-100">
                        <p className="text-sm font-medium text-gray-700">
                          {a.date ? formatDate(new Date(a.date)) : '-'}
                        </p>
                      </td>
                      <td className="px-6 py-3 border-r border-gray-100">
                        <p className="text-[10px] text-gray-400 font-bold uppercase">
                          {a.submittedAt ? (a.submittedAt.toDate ? a.submittedAt.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-') : '-'}
                        </p>
                      </td>
                      <td className="px-6 py-3 border-r border-gray-100">
                         <span className={cn(
                           "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                           a.type === 'Sakit' ? "bg-red-100 text-red-600" :
                           a.type === 'Izin' ? "bg-yellow-100 text-yellow-600" : 
                           a.type === 'Alpa' ? "bg-gray-100 text-gray-600" : "bg-purple-100 text-purple-600"
                         )}>
                           {a.type}
                         </span>
                         <p className="text-[11px] text-gray-500 mt-1 italic">"{a.reason || 'Tidak ada alasan'}"</p>
                      </td>
                      <td className="px-6 py-3 border-r border-gray-100">
                         <p className="font-bold text-gray-800 text-xs">{a.parentName}</p>
                         <p className="text-[10px] text-green-600 font-bold">{a.parentPhone}</p>
                      </td>
                      <td className="px-6 py-3 border-r border-gray-100 text-center">
                        {a.documentUrl ? (
                           <button 
                             onClick={() => window.open(a.documentUrl, '_blank')}
                             className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-1 mx-auto"
                           >
                             <FileText size={14} /> LIHAT DOKUMEN
                           </button>
                         ) : (
                           <span className="text-[10px] text-gray-400 italic">Tidak ada dokumen</span>
                         )}
                      </td>
                      <td className="px-6 py-3 border-r border-gray-100 text-center">
                         <span className={cn(
                           "px-2 py-1 rounded text-[10px] font-bold uppercase",
                           a.status === 'Approved' ? "bg-green-100 text-green-700" : 
                           a.status === 'Rejected' ? "bg-red-100 text-red-700" : 
                           "bg-yellow-100 text-yellow-700"
                         )}>
                           {a.status || 'Pending'}
                         </span>
                      </td>
                      <td className="px-6 py-3 border-r border-gray-100">
                         <p className="text-[11px] text-gray-600 italic">
                           {a.statusReason || '-'}
                         </p>
                      </td>
                      <td className="px-6 py-3 text-center">
                         <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center justify-center gap-2">
                              {a.status === 'Pending' && (
                                <>
                                  <button 
                                    onClick={() => handleStatusUpdate(a.id, 'Approved')}
                                    className="p-1.5 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors"
                                    title="Terima"
                                  >
                                    <CheckCircle2 size={16} />
                                  </button>
                                  <button 
                                    onClick={() => handleStatusUpdate(a.id, 'Rejected')}
                                    className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                    title="Tolak"
                                  >
                                    <XCircle size={16} />
                                  </button>
                                </>
                              )}
                              <button 
                                onClick={() => handleDelete(a.id, 'attendance')}
                                className="p-1.5 bg-gray-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                                title="Hapus"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            {a.documentUrl && (
                              <button
                                onClick={() => {
                                  const link = document.createElement('a');
                                  link.href = a.documentUrl!;
                                  link.download = a.documentName || `DOKUMEN_PENDUKUNG_${a.studentName}`;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                }}
                                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 hover:bg-blue-700 transition-all w-full mt-1 uppercase"
                              >
                                <Download size={14} /> Download Dokumen
                              </button>
                            )}
                         </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-20 text-center text-gray-400 italic">
                      Tidak ada data ketidakhadiran yang sesuai filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {totalAttendanceDetailPages > 1 && (
              <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Halaman {attendanceDetailPage} dari {totalAttendanceDetailPages}
                </p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setAttendanceDetailPage(p => Math.max(1, p - 1))}
                    disabled={attendanceDetailPage === 1}
                    className="px-3 py-1 bg-white border border-gray-200 rounded text-xs font-bold disabled:opacity-50"
                  >
                    Sebelumnya
                  </button>
                  <button 
                    onClick={() => setAttendanceDetailPage(p => Math.min(totalAttendanceDetailPages, p + 1))}
                    disabled={attendanceDetailPage === totalAttendanceDetailPages}
                    className="px-3 py-1 bg-white border border-gray-200 rounded text-xs font-bold disabled:opacity-50"
                  >
                    Selanjutnya
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {/* Print Login Cards Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="p-6 bg-amber-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">Cetak Kartu Login</h3>
              <button onClick={() => setShowPrintModal(false)}><X size={24} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Pilih kelas untuk mengunduh PDF kartu login siswa. Kartu ini berisi NIS yang digunakan sebagai username.
              </p>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Pilih Kelas</label>
                <select 
                  className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-amber-500 text-sm"
                  value={printClass}
                  onChange={(e) => setPrintClass(e.target.value)}
                >
                  <option value="">-- Pilih Kelas --</option>
                  {classes.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, {numeric: true})).map((cl, idx) => (
                    <option key={cl.id || `print-class-${idx}`} value={cl.name}>{cl.name}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={() => {
                  if (!printClass) return;
                  printLoginCards(printClass);
                  setShowPrintModal(false);
                }}
                disabled={!printClass}
                className="w-full py-3 bg-amber-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-amber-700 transition-all disabled:opacity-50"
              >
                Unduh PDF Kartu Login
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <motion.div 
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
           >
              <div className="p-6 bg-blue-600 text-white flex items-center justify-between">
                 <h3 className="font-bold text-lg">
                    {formData.id ? 'Edit' : 'Tambah'} {
                      activeTab === 'settings' ? 'Tahun Akademik' : activeTab.slice(0, -1)
                    }
                 </h3>
                 <button onClick={() => setShowAddModal(false)}><X size={24} /></button>
              </div>
              <form onSubmit={handleAdd} className="p-6 space-y-4">
                 {activeTab === 'settings' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Tahun Akademik</label>
                      <input 
                        type="text" 
                        placeholder="Contoh: 2024/2025" 
                        required 
                        className="w-full p-3 border border-gray-200 rounded-xl focus:border-blue-500 outline-none" 
                        value={formData.year || ''}
                        onChange={e => setFormData({...formData, year: e.target.value})} 
                      />
                    </div>
                 )}
                  {activeTab === 'students' && (
                    <>
                      <div className="flex gap-2">
                        <input type="text" placeholder="No Absen" className="w-24 p-3 border border-gray-100 rounded-xl" value={formData.absensiNo || ''} onChange={e => setFormData({...formData, absensiNo: e.target.value})} />
                        <input type="text" placeholder="Nama Siswa" required className="flex-1 p-3 border border-gray-100 rounded-xl" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                      </div>
                      <input type="text" placeholder="NIS" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.nis || ''} onChange={e => setFormData({...formData, nis: e.target.value})} />
                      <input type="text" placeholder="NISN" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.nisn || ''} onChange={e => setFormData({...formData, nisn: e.target.value})} />
                      <input type="text" placeholder="Kelas (contoh: 7A)" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.className || ''} onChange={e => setFormData({...formData, className: e.target.value})} />
                      <select 
                        required 
                        className="w-full p-3 border border-gray-100 rounded-xl outline-none" 
                        value={formData.gender || ''}
                        onChange={e => setFormData({...formData, gender: e.target.value})}
                      >
                         <option value="" disabled>Pilih Jenis Kelamin</option>
                         <option value="L">Laki-Laki (L)</option>
                         <option value="P">Perempuan (P)</option>
                      </select>
                    </>
                 )}
                 {activeTab === 'teachers-list' && (
                    <>
                      <input type="text" placeholder="Nama Guru" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                      <input type="text" placeholder="NIP" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.nip || ''} onChange={e => setFormData({...formData, nip: e.target.value})} />
                      <input type="text" placeholder="Kata Sandi" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.password || ''} onChange={e => setFormData({...formData, password: e.target.value})} />
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Status (Centang semua yang sesuai)</label>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {['Kepala Sekolah', 'Waka', 'Wali Kelas', 'Guru Mata Pelajaran', 'Guru BK', 'Lainnya'].map(s => (
                          <label key={s} className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={!!formData.status?.includes(s)}
                              onChange={(e) => {
                                const current = formData.status || [];
                                const next = e.target.checked ? [...current, s] : current.filter((item: string) => item !== s);
                                setFormData({...formData, status: next});
                              }}
                            />
                            {s}
                          </label>
                        ))}
                      </div>
                    </>
                 )}
                 {activeTab === 'classes' && (
                    <>
                      <input type="text" placeholder="Nama Kelas" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </>
                 )}
                 {activeTab === 'subject-teachers' && (
                    <>
                      <input type="text" placeholder="Nama Guru" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                      <input type="text" placeholder="Bidang Studi (pisahkan koma: MTK, IPA)" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.subjects || ''} onChange={e => setFormData({...formData, subjects: e.target.value})} />
                      <input type="text" placeholder="Kelas Ampuan (pisahkan koma: 7A, 7B, 8C)" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.taughtClasses || ''} onChange={e => setFormData({...formData, taughtClasses: e.target.value})} />
                    </>
                 )}
                 {activeTab === 'counselors' && (
                    <>
                      <input type="text" placeholder="Nama Guru BK" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                      <input type="text" placeholder="NIP" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.nip || ''} onChange={e => setFormData({...formData, nip: e.target.value})} />
                      <input type="text" placeholder="Kelas Asuhan (pisahkan koma: 7A, 7B, 8C)" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.managedClasses || ''} onChange={e => setFormData({...formData, managedClasses: e.target.value})} />
                    </>
                 )}
                 {/* Pengaturan Guru & Siswa */}
                 {activeTab.startsWith('role-management') && formData.isChangingRole ? (
                    <div className="space-y-4">
                      {/* Teacher specific role UI */}
                      <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                         <p className="text-xs font-bold text-gray-400 mb-1 uppercase tracking-widest leading-none">Mengatur Peran: {formData.name}</p>
                      </div>
                      <div className="space-y-2">
                        <div 
                          onClick={() => {
                            const s = formData.status || [];
                            setFormData({...formData, status: s.includes('Wali Kelas') ? s.filter((x:any) => x !== 'Wali Kelas') : [...s, 'Wali Kelas']});
                          }}
                          className={cn("p-4 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-all", formData.status?.includes('Wali Kelas') ? "border-indigo-600 bg-indigo-50" : "border-gray-100 bg-white")}
                        >
                          <span className="text-sm font-bold">Wali Kelas</span>
                          {formData.status?.includes('Wali Kelas') && <CheckCircle2 size={18} className="text-indigo-600" />}
                        </div>
                        {formData.status?.includes('Wali Kelas') && (
                          <div className="px-1">
                            <select 
                              className="w-full p-2.5 bg-white border border-gray-100 rounded-lg text-sm outline-none"
                              value={formData.className || ''}
                              onChange={e => setFormData({...formData, className: e.target.value})}
                            >
                              <option value="">-- Pilih Kelas Wali --</option>
                              {classes.sort((a,b) => (a.name || '').localeCompare(b.name || '', undefined, {numeric: true})).map(cl => <option key={cl.id} value={cl.name}>{cl.name}</option>)}
                            </select>
                          </div>
                        )}
                        <div 
                          onClick={() => {
                            const s = formData.status || [];
                            setFormData({...formData, status: s.includes('Guru Mata Pelajaran') ? s.filter((x:any) => x !== 'Guru Mata Pelajaran') : [...s, 'Guru Mata Pelajaran']});
                          }}
                          className={cn("p-4 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-all", formData.status?.includes('Guru Mata Pelajaran') ? "border-blue-600 bg-blue-50" : "border-gray-100 bg-white")}
                        >
                          <span className="text-sm font-bold">Guru Mata Pelajaran</span>
                          {formData.status?.includes('Guru Mata Pelajaran') && <CheckCircle2 size={18} className="text-blue-600" />}
                        </div>
                        {formData.status?.includes('Guru Mata Pelajaran') && (
                          <div className="px-1 space-y-2">
                            <input placeholder="Bidang Studi (misal: MTK, IPA)" className="w-full p-2.5 border border-gray-100 rounded-lg text-sm outline-none" value={formData.subjects || ''} onChange={e => setFormData({...formData, subjects: e.target.value})} />
                            <input placeholder="Kelas Ampuan (misal: 7A, 7B)" className="w-full p-2.5 border border-gray-100 rounded-lg text-sm outline-none" value={formData.taughtClasses || ''} onChange={e => setFormData({...formData, taughtClasses: e.target.value})} />
                          </div>
                        )}

                        <div 
                          onClick={() => {
                            const s = formData.status || [];
                            setFormData({...formData, status: s.includes('Guru BK') ? s.filter((x:any) => x !== 'Guru BK') : [...s, 'Guru BK']});
                          }}
                          className={cn("p-4 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-all", formData.status?.includes('Guru BK') ? "border-purple-600 bg-purple-50" : "border-gray-100 bg-white")}
                        >
                          <span className="text-sm font-bold">Guru BK</span>
                          {formData.status?.includes('Guru BK') && <CheckCircle2 size={18} className="text-purple-600" />}
                        </div>
                        {formData.status?.includes('Guru BK') && (
                          <div className="px-1">
                            <input placeholder="Kelas Bimbingan (misal: 7A, 7B, 8C)" className="w-full p-2.5 border border-gray-100 rounded-lg text-sm outline-none" value={formData.managedClasses || ''} onChange={e => setFormData({...formData, managedClasses: e.target.value})} />
                          </div>
                        )}
                      </div>
                    </div>
                 ) : activeTab.startsWith('role-management') && (
                    <>
                      <input type="text" placeholder="User ID" required className="w-full p-3 border border-gray-100 rounded-xl" value={formData.uid || ''} onChange={e => setFormData({...formData, uid: e.target.value})} />
                      <select 
                        required 
                        className="w-full p-3 border border-gray-100 rounded-xl outline-none" 
                        value={formData.role || ''}
                        onChange={e => setFormData({...formData, role: e.target.value})}
                      >
                         <option value="" disabled>Pilih Role</option>
                         <option value="PARENT">{ROLE_LABELS.PARENT}</option>
                         <option value="TEACHER">{ROLE_LABELS.TEACHER}</option>
                         <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>
                         <option value="COUNSELOR">{ROLE_LABELS.COUNSELOR}</option>
                         <option value="STUDENT">{ROLE_LABELS.STUDENT}</option>
                      </select>
                    </>
                 )}
                 <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                    <Save size={18} /> Simpan Data
                 </button>
              </form>
           </motion.div>
        </div>
      )}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="p-6 bg-green-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageCircle size={24} />
                <h3 className="font-bold text-lg">Impor Pesan WhatsApp</h3>
              </div>
              <button onClick={() => setShowImportModal(false)}><X size={24} /></button>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                   <p className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Tempel Pesan WhatsApp</p>
                   {waText && (
                     <button onClick={() => setWaText('')} className="text-[10px] font-bold text-red-500 hover:underline px-2 py-0.5 bg-red-50 rounded">HAPUS SEMUA</button>
                   )}
                </div>
                <textarea 
                  className="w-full h-32 p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-green-600 outline-none font-medium text-gray-700"
                  placeholder="Contoh: Tanggal: 25-04-2024, Siswa: Budi, Jenis: Sakit, Alasan: Demam..."
                  value={waText}
                  onChange={(e) => setWaText(e.target.value)}
                />
              </div>

              <AnimatePresence mode="wait">
                {parsedWAData ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-5 bg-blue-50 border border-blue-100 rounded-2xl space-y-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between border-b border-blue-100 pb-3">
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Hasil Analisis Pesan</p>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                        parsedWAData.matchedStudent ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                      )}>
                        {parsedWAData.matchedStudent ? 'Siswa Terdaftar' : 'Siswa Tidak Ditemukan'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-gray-400 uppercase">Nama Siswa</p>
                        <p className="text-sm font-bold text-gray-900">{parsedWAData.matchedStudent?.name || parsedWAData.studentName || '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-gray-400 uppercase">Tanggal</p>
                        <p className="text-sm font-bold text-gray-900">{parsedWAData.date ? formatDate(new Date(parsedWAData.date)) : '-'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-gray-400 uppercase">Jenis</p>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase inline-block",
                          parsedWAData.type === 'Sakit' ? "bg-red-100 text-red-600" :
                          parsedWAData.type === 'Izin' ? "bg-amber-100 text-amber-600" : "bg-purple-100 text-purple-600"
                        )}>
                          {parsedWAData.type || '-'}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-gray-400 uppercase">Alasan</p>
                        <p className="text-xs font-medium text-gray-700 italic">"{parsedWAData.reason || '-'}"</p>
                      </div>
                    </div>

                    {!parsedWAData.matchedStudent && parsedWAData.studentName && (
                      <div className="p-2 bg-red-100/50 rounded-lg flex items-center gap-2">
                        <AlertCircle size={14} className="text-red-600" />
                        <p className="text-[10px] text-red-700 font-bold uppercase">Peringatan: Nama "{parsedWAData.studentName}" tidak ditemukan di database.</p>
                      </div>
                    )}
                  </motion.div>
                ) : waText.trim() ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3"
                  >
                     <AlertCircle className="text-red-500" size={20} />
                     <p className="text-xs text-red-700 font-medium">Format pesan tidak dikenali. Harap sertakan minimal Nama Siswa dan Jenis Absensi.</p>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <button 
                onClick={handleImportWA}
                disabled={!parsedWAData || !parsedWAData.studentName}
                className={cn(
                  "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg",
                  (!parsedWAData || !parsedWAData.studentName) 
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed" 
                    : "bg-green-600 text-white hover:bg-green-700 shadow-green-100"
                )}
              >
                <CheckCircle2 size={20} />
                Simpan ke Database
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {uploadProgress && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                <CloudUpload size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{uploadProgress.label}</h3>
              <p className="text-gray-500 text-sm mb-6">Mohon tunggu, sedang memproses data... <br />Jangan tutup halaman ini.</p>
              
              <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden mb-2">
                <div 
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
              
              <div className="flex justify-between items-center text-xs font-bold text-gray-500">
                <span>{uploadProgress.current} dari {uploadProgress.total}</span>
                <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-center">
              <div className="flex gap-2 items-center text-[10px] text-gray-400 font-medium">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping"></div>
                DATABASE CLOUD SEDANG DIPERBARUI
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirm Dialog */}
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
