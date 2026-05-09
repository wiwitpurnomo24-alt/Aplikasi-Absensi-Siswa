import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  RefreshCw,
  LayoutGrid,
  Filter,
  FileText,
  ShieldCheck,
  Key,
  IdCard,
  MessageCircle,
  MessageSquare,
  Download,
  AlertCircle,
  Printer,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Clock,
  MapPin,
  Smartphone,
  CloudUpload,
  Activity,
  UserCheck,
  QrCode,
  Bell,
  BellRing,
  HardDrive,
  BookOpen, Library, School, Award, Trophy, Medal, Star, Bookmark, Calculator, Palette, Music, Languages, Cpu, Atom, FlaskConical, Globe, History, Briefcase, Zap, Target, Anchor, Compass, Feather, PenTool
} from 'lucide-react';

import { db, auth, handleFirestoreError } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, getDocs, getDoc, deleteDoc, doc, updateDoc, query, where, orderBy, onSnapshot, Timestamp, serverTimestamp, writeBatch, setDoc } from 'firebase/firestore';
import { cn, formatDate, getTimeSafe } from '../lib/utils';
import { Student, Teacher, AcademicYear, AttendanceRecord } from '../types';
import { useAuthStore } from '../lib/auth-store';
import * as XLSX from 'xlsx';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip,
  Legend
} from 'recharts';
import { parseWhatsAppMessage } from '../lib/whatsapp-parser';
import { ROLE_LABELS, CLASS_COLORS } from '../constants';
import { useSearchParams } from 'react-router-dom';
import AttendanceRecapTable from '../components/AttendanceRecapTable';
import SemesterAttendanceRecapTable from '../components/SemesterAttendanceRecapTable';
import WeeklyAttendanceRecap from '../components/WeeklyAttendanceRecap';
import IndividualAttendance from '../components/IndividualAttendance';
import AttendanceChart from '../components/AttendanceChart';
import AttendanceTrendChart from '../components/AttendanceTrendChart';
import AttendanceAlertsDisplay from '../components/AttendanceAlertsDisplay';
import { AIPredictiveAnalytics } from '../components/AIPredictiveAnalytics';
import ActiveAcademicYearDisplay from '../components/ActiveAcademicYearDisplay';
import { checkAttendanceAlert } from '../services/attendanceNotificationService';
import ThemeSettings from '../components/ThemeSettings';
import SchoolDataSettings from '../components/SchoolDataSettings';
import LogoSettings from '../components/LogoSettings';
import { AttendanceConfig } from '../components/AttendanceConfig';
import { WhatsAppSettings } from '../components/WhatsAppSettings';
import { ScannerStatus } from '../components/ScannerStatus';
import { exportAttendanceToPDF, generateQRCodeDataUrl, printStudentCard } from '../services/pdfService';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getTenantCollection, getTenantDoc, getSchoolCode } from '../lib/tenant';

const getLucideIcon = (iconName: string) => {
  const icons: Record<string, any> = {
    BookOpen, GraduationCap, Users, Library, School, Award, Trophy, Medal,
    Star, Bookmark, Calculator, Palette, Music, Languages, Cpu, Atom,
    FlaskConical, Globe, History, Briefcase, Zap, Target, Anchor, Compass,
    Activity, Feather, PenTool, Search, Database, LayoutGrid
  };
  return icons[iconName] || GraduationCap;
};

const CalendarIcon = Calendar;

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const [authReady, setAuthReady] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as any;

  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'teachers' | 'teachers-list' | 'subject-teachers' | 'classes' | 'counselors' | 'attendance' | 'academic-years' | 'attendance-summary' | 'attendance-detail' | 'attendance-individual' | 'settings' | 'rekap' | 'rekapSemester' | 'weekly-recap' | 'school' | 'attendance-officer-history' | 'attendance-officer-rekap' | 'role-management-guru' | 'role-management-petugas' | 'subject-attendance-report'>(tabParam === 'role-management' ? 'role-management-guru' : (tabParam || 'overview'));
  const [filterMonth, setFilterMonth] = useState('');
  const [filterSemester, setFilterSemester] = useState('');

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

  useEffect(() => {
    // Otomatis hapus dokumen absen akhir bulan Juni (semester 2) dan Desember (semester 1)
    const autoCleanupStorage = async () => {
       const today = new Date();
       const month = today.getMonth(); // 0 = Jan, 5 = Jun, 11 = Dec
       const date = today.getDate();
       
       // Hanya jalankan di akhir bulan Juni atau Desember (misal tanggal >= 25)
       if ((month === 5 && date >= 25) || (month === 11 && date >= 25)) {
           try {
              const currentPeriod = `${today.getFullYear()}-${month}`;
              const docRef = getTenantDoc('schoolConfig', 'systemMaintenance');
              const configDoc = await getDoc(docRef);
              const data = configDoc.data();
              
              if (data && data.lastAutoCleanup === currentPeriod) {
                  return; // Sudah dijalankan periode ini
              }

              const { listAll, deleteObject, ref } = await import('firebase/storage');
              const { storage } = await import('../lib/firebase');
              
              const baseRef = ref(storage, 'attendance_docs/');
              const res = await listAll(baseRef);
              
              for (const folderRef of res.prefixes) {
                 const folderRes = await listAll(folderRef);
                 for (const itemRef of folderRes.items) {
                    await deleteObject(itemRef).catch(console.error);
                 }
              }
              
              await setDoc(docRef, {
                  lastAutoCleanup: currentPeriod,
                  updatedAt: new Date().toISOString()
              }, { merge: true });

              console.log("Auto-cleanup dokumen selesai dikerjakan.");
           } catch (err) {
              console.error("Error auto-cleanup storage:", err);
           }
       }
    };

    if (authReady && activeTab === 'overview') {
        autoCleanupStorage();
    }
  }, [authReady, activeTab]);

  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [roleManagementPage, setRoleManagementPage] = useState(1);
  const [showAddOfficerForm, setShowAddOfficerForm] = useState(false);
  const [counselors, setCounselors] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [subjectAttendances, setSubjectAttendances] = useState<any[]>([]);
  const [subjectInquiries, setSubjectInquiries] = useState<any[]>([]);
  const [presenceRecords, setPresenceRecords] = useState<any[]>([]);
  const [presenceConfig, setPresenceConfig] = useState({ entryTime: '06:30' });
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [adminNotifications, setAdminNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [migrationStatus, setMigrationStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, onConfirm: () => void}>({isOpen: false, message: '', onConfirm: () => {}});
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<Student | null>(null);
  const [studentAttendanceHistory, setStudentAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [showStudentDetailModal, setShowStudentDetailModal] = useState(false);
  const [registeredSchools, setRegisteredSchools] = useState<any[]>([]);
  const isSuperAdmin = user?.email === 'wiwitpurnomo24@guru.smp.belajar.id';

  const fetchRegisteredSchools = async () => {
    if (!isSuperAdmin) return;
    try {
      const q = query(collection(db, 'schools'));
      const snap = await getDocs(q);
      setRegisteredSchools(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error fetching schools:", err);
    }
  };

  const handleShowStudentDetail = async (student: Student) => {
    setSelectedStudentForDetail(student);
    try {
      const q = query(getTenantCollection('attendance'), where('studentId', '==', student.id), orderBy('date', 'desc'));
      const attSnapshot = await getDocs(q);
      setStudentAttendanceHistory(attSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord)));
      setShowStudentDetailModal(true);
    } catch (err: any) {
      console.warn("handleShowStudentDetail orderBy failed, using fallback:", err);
      try {
        const fallbackQ = query(getTenantCollection('attendance'), where('studentId', '==', student.id));
        const attSnapshot = await getDocs(fallbackQ);
        const data = attSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord))
          .sort((a,b) => (a.date === b.date ? 0 : (a.date < b.date ? 1 : -1)));
        setStudentAttendanceHistory(data);
        setShowStudentDetailModal(true);
      } catch (err2) {
        handleFirestoreError(err, 'list', 'attendance_history');
      }
    }
  };
  
  const downloadDocument = (url: string, studentName: string, date: string, type: string) => {
    const link = document.createElement('a');
    link.href = url;
    // Extract extension from base64 or url
    let ext = 'jpg';
    if (url.includes('pdf')) ext = 'pdf';
    else if (url.includes('png')) ext = 'png';
    else if (url.includes('jpeg')) ext = 'jpg';
    
    const fileName = `DOKUMEN_${type.toUpperCase()}_${studentName.replace(/\s+/g, '_')}_${date}.${ext}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const showConfirm = (message: string, onConfirm: () => void) => {
    setConfirmDialog({isOpen: true, message, onConfirm});
  };
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [newAttendanceNotification, setNewAttendanceNotification] = useState<string | null>(null);
  const [storageUsage, setStorageUsage] = useState({ used: 0, total: 5 * 1024 * 1024 * 1024, fileCount: 0 }); // Default 5GB
  const [isUpdatingStorageStats, setIsUpdatingStorageStats] = useState(false);

  const calculateStorageStats = async () => {
    setIsUpdatingStorageStats(true);
    try {
      const { listAll, getMetadata, ref } = await import('firebase/storage');
      const { storage } = await import('../lib/firebase');
      const baseRef = ref(storage, 'attendance_docs/');
      
      let totalSize = 0;
      let totalFiles = 0;

      const listAllFiles = async (folderRef: any) => {
        const res = await listAll(folderRef);
        for (const itemRef of res.items) {
          const metadata = await getMetadata(itemRef);
          totalSize += metadata.size;
          totalFiles += 1;
        }
        for (const subFolderRef of res.prefixes) {
          await listAllFiles(subFolderRef);
        }
      };

      await listAllFiles(baseRef);
      setStorageUsage(prev => ({ ...prev, used: totalSize, fileCount: totalFiles }));
    } catch (err) {
      console.error("Error calculating storage stats:", err);
    } finally {
      setIsUpdatingStorageStats(false);
    }
  };

  const handleManualCleanup = () => {
    showConfirm("Apakah Anda yakin ingin menghapus SEMUA dokumen pendukung absensi (PDF/Foto) sekarang? Tindakan ini tidak dapat dibatalkan.", async () => {
       setLoading(true);
       setStatusMessage("Sedang menghapus dokumen...");
       try {
          const { listAll, deleteObject, ref } = await import('firebase/storage');
          const { storage } = await import('../lib/firebase');
          
          const baseRef = ref(storage, 'attendance_docs/');
          const res = await listAll(baseRef);
          
          let deletedCount = 0;
          for (const folderRef of res.prefixes) {
             const folderRes = await listAll(folderRef);
             for (const itemRef of folderRes.items) {
                await deleteObject(itemRef);
                deletedCount++;
             }
          }
          
          await calculateStorageStats();
          alert(`Berhasil menghapus ${deletedCount} dokumen.`);
       } catch (err: any) {
          console.error(err);
          alert("Gagal menghapus dokumen: " + err.message);
       } finally {
          setLoading(false);
          setStatusMessage("");
       }
    });
  };

  useEffect(() => {
    if (!authReady) return;

    const qAtt = query(
      getTenantCollection('attendance'),
      orderBy('submittedAt', 'desc')
    );

    const unsubscribeAtt = onSnapshot(qAtt, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const newItem = { id: change.doc.id, ...change.doc.data() } as AttendanceRecord;
          const submittedAt = newItem.submittedAt?.toDate ? newItem.submittedAt.toDate() : new Date();
          const now = new Date();
          if (now.getTime() - submittedAt.getTime() < 10000) { // within 10 seconds
            setNewAttendanceNotification(`Pengajuan Baru: ${newItem.studentName} (${newItem.className}) - ${newItem.type}: ${newItem.reason}`);
            fetchData();
          }
        }
      });
    });

    const qNotif = query(
      getTenantCollection('notifications'),
      where('targetRole', '==', 'ADMIN'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeNotif = onSnapshot(qNotif, (snapshot) => {
      setAdminNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeAtt();
      unsubscribeNotif();
    };
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
        const wasOfficer = (s as any).role === 'PETUGAS_ABSEN_KELAS';
        if (isNowOfficer !== wasOfficer) {
          return updateDoc(getTenantDoc('students', s.id!), {
            role: isNowOfficer ? 'PETUGAS_ABSEN_KELAS' : null
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
    return students.filter(s => (s as any).role === 'PETUGAS_ABSEN_KELAS')
      .sort((a,b) => (a.className || '').localeCompare(b.className || '', undefined, {numeric: true}) || (a.name || '').localeCompare(b.name || ''));
  }, [students]);

  const duplicateNises = useMemo(() => {
    const nisCount: { [key: string]: number } = {};
    students.forEach(s => {
      if (s.nis) nisCount[s.nis] = (nisCount[s.nis] || 0) + 1;
    });
    return Object.keys(nisCount).filter(nis => nisCount[nis] > 1);
  }, [students]);

  const duplicateNips = useMemo(() => {
    const nipCount: { [key: string]: number } = {};
    teachers.forEach(t => {
      if (t.nip) nipCount[t.nip] = (nipCount[t.nip] || 0) + 1;
    });
    return Object.keys(nipCount).filter(nip => nipCount[nip] > 1);
  }, [teachers]);

  const handleDeleteDuplicateStudents = () => {
    const toDelete: string[] = [];
    const seen = new Set();
    // Keep the first one, delete subsequent ones
    students.forEach(s => {
      if (s.nis && duplicateNises.includes(s.nis)) {
        if (seen.has(s.nis)) {
          toDelete.push(s.id!);
        } else {
          seen.add(s.nis);
        }
      }
    });

    if (toDelete.length === 0) {
      alert('Tidak ada data ganda yang ditemukan.');
      return;
    }

    showConfirm(`Hapus ${toDelete.length} data ganda siswa (keep first)?`, async () => {
      setLoading(true);
      try {
        const promises = toDelete.map(id => deleteDoc(getTenantDoc('students', id)));
        await Promise.all(promises);
        fetchData();
        setStatusMessage(`${toDelete.length} data ganda berhasil dihapus`);
        setTimeout(() => setStatusMessage(''), 3000);
      } catch (err) {
        console.error(err);
        alert('Gagal menghapus data ganda.');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleDeleteDuplicateTeachers = () => {
    const toDelete: string[] = [];
    const seen = new Set();
    teachers.forEach(t => {
      if (t.nip && duplicateNips.includes(t.nip)) {
        if (seen.has(t.nip)) {
          toDelete.push(t.id!);
        } else {
          seen.add(t.nip);
        }
      }
    });

    if (toDelete.length === 0) {
      alert('Tidak ada data ganda yang ditemukan.');
      return;
    }

    showConfirm(`Hapus ${toDelete.length} data ganda guru (keep first)?`, async () => {
      setLoading(true);
      try {
        const promises = toDelete.map(id => deleteDoc(getTenantDoc('teachers', id)));
        await Promise.all(promises);
        fetchData();
        setStatusMessage(`${toDelete.length} data ganda berhasil dihapus`);
        setTimeout(() => setStatusMessage(''), 3000);
      } catch (err) {
        console.error(err);
        alert('Gagal menghapus data ganda.');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleRemoveOfficer = (id: string) => {
    showConfirm('Hapus peran petugas dari siswa ini?', async () => {
      try {
        await updateDoc(getTenantDoc('students', id), { role: null });
        fetchData();
        setStatusMessage('Petugas berhasil dihapus');
        setTimeout(() => setStatusMessage(''), 3000);
      } catch (err: any) {
        handleFirestoreError(err, 'update' as any, 'students-role');
      }
    });
  };

  const markNotificationAsRead = async (id: string) => {
    try {
      await updateDoc(getTenantDoc('notifications', id), { read: true });
    } catch (err) {
      console.error(err);
    }
  };

  const markAllNotificationsAsRead = async () => {
    const unread = adminNotifications.filter(n => !n.read);
    if (unread.length === 0) return;
    try {
      setLoading(true);
      const promises = unread.map(n => updateDoc(getTenantDoc('notifications', n.id), { read: true }));
      await Promise.all(promises);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(getTenantDoc('notifications', id));
    } catch (err) {
      console.error(err);
    }
  };
  const itemsPerPage = 12;
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);
  
  // Counselor specific filtering
  const [filterMode, setFilterMode] = useState<'all' | 'managed'>(user?.role === 'COUNSELOR' ? 'managed' : 'all');
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attendanceFormStudentSearch, setAttendanceFormStudentSearch] = useState('');
  const [settingsSubTab, setSettingsSubTab] = useState<'akademik' | 'umum' | 'data' | 'schools' | 'peran_guru' | 'tema'>('umum');

  useEffect(() => {
    if (activeTab === 'settings' && settingsSubTab === 'data') {
      calculateStorageStats();
    }
  }, [activeTab, settingsSubTab]);

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printClass, setPrintClass] = useState('');
  const [showParentPrintModal, setShowParentPrintModal] = useState(false);
  const [parentPrintClass, setParentPrintClass] = useState('');

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
      currentTeachers = teachers.filter(t => {
        const isWaliKelasExplicit = t.status?.includes('Wali Kelas');
        const isWaliKelasLinked = classes.some(c => c.waliKelasId === t.id || (t.className && c.name.toLowerCase().replace(/\s/g, '') === t.className.toLowerCase().replace(/\s/g, '')));
        return isWaliKelasExplicit || isWaliKelasLinked;
      }).map(t => {
        if (!t.className) {
          const assignedClass = classes.find(c => c.waliKelasId === t.id);
          if (assignedClass) return { ...t, className: assignedClass.name };
        }
        return t;
      });
    } else if (type === 'Guru Mapel') {
      currentTeachers = teachers.filter(t => t.status?.includes('Guru Mapel'));
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
          t.phoneNumber || '-',
          (t.taughtClasses || []).join(', ') || '-'
        ];
      } else if (type === 'Guru Mapel') {
        return [
          (idx + 1).toString(),
          t.name,
          t.nip || '-',
          t.password || '-',
          t.phoneNumber || '-',
          (t.subjects || []).join(', ') || '-',
          (t.taughtClasses || []).join(', ') || '-'
        ];
      } else {
        return [
          (idx + 1).toString(),
          t.name,
          t.nip || '-',
          t.password || '-',
          t.phoneNumber || '-',
          (t.status || []).join(', ') || '-'
        ];
      }
    });

    let head = [];
    if (type === 'Wali Kelas') head = [['No', 'Nama Guru', 'NIP', 'SANDI', 'Nomor WA', 'Kelas Ampuan']];
    else if (type === 'Guru Mapel') head = [['No', 'Nama Guru', 'NIP', 'SANDI', 'Nomor WA', 'Mata Pelajaran', 'Kelas yang Diajar']];
    else head = [['No', 'Nama Guru', 'NIP', 'SANDI', 'Nomor WA', 'Status/Tugas']];

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

            promises.push(updateDoc(getTenantDoc('students', s.id!), { parentPassword: pass }));
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

  const printLoginCards = async (selectedClass: string, printType: 'SISWA' | 'ORTU' = 'SISWA') => {
    const classSds = students.filter(s => s.className === selectedClass);
    if (classSds.length === 0) {
      alert('Tidak ada siswa di kelas ini.');
      return;
    }

    setLoading(true);
    setStatusMessage(`Sedang menyiapkan kartu login ${printType === 'ORTU' ? 'orang tua' : 'siswa'} kelas ${selectedClass}...`);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'legal'
      });

      const pageWidth = 215.9;
      const pageHeight = 355.6;
      const cardsPerRow = 4;
      const cardsPerCol = 4;
      const cardsPerPage = 16;
      
      const marginX = 10;
      const marginY = 10;
      const cardWidth = (pageWidth - (marginX * 2)) / cardsPerRow;
      const cardHeight = (pageHeight - (marginY * 2)) / cardsPerCol;

      for (let i = 0; i < classSds.length; i++) {
        if (i > 0 && i % cardsPerPage === 0) {
          doc.addPage();
        }
        
        const student = classSds[i];
        const pageIdx = i % cardsPerPage;
        const col = pageIdx % cardsPerRow;
        const row = Math.floor(pageIdx / cardsPerRow);
        
        const x = marginX + (col * cardWidth);
        const y = marginY + (row * cardHeight);

        const padding = 2;
        const innerX = x + padding;
        const innerY = y + padding;
        const innerW = cardWidth - (padding * 2);
        const innerH = cardHeight - (padding * 2);

        // Card Border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.roundedRect(innerX, innerY, innerW, innerH, 2, 2, 'S');

        // Header
        const headerColor = printType === 'ORTU' ? [251, 146, 60] : [30, 64, 175]; // orange-400 vs blue-700
        doc.setFillColor(headerColor[0], headerColor[1], headerColor[2]);
        doc.roundedRect(innerX, innerY, innerW, 8, 2, 2, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text(printType === 'ORTU' ? "KARTU ORANG TUA" : "KARTU LOGIN SISWA", innerX + (innerW / 2), innerY + 5, { align: 'center' });

        const qrCodeValue = student.nis || '';
        const qrCodeDataUrl = await generateQRCode(qrCodeValue);
        if (qrCodeDataUrl) {
            const qrSize = Math.min(innerW * 0.75, innerH * 0.45);
            const qrX = innerX + (innerW - qrSize) / 2;
            doc.addImage(qrCodeDataUrl, 'PNG', qrX, innerY + 12, qrSize, qrSize);
        }

        doc.setTextColor(150, 150, 150);
        doc.setFontSize(5);
        doc.text("NAMA SISWA", innerX + (innerW / 2), innerY + innerH - 12, { align: 'center' });
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(7);
        doc.text((student.name || '').toUpperCase(), innerX + (innerW / 2), innerY + innerH - 8, { align: 'center', maxWidth: innerW - 4 });

        doc.setTextColor(150, 150, 150);
        doc.setFontSize(5);
        doc.text("KELAS", innerX + (innerW / 2), innerY + innerH - 4, { align: 'center' });
        
        doc.setTextColor(headerColor[0], headerColor[1], headerColor[2]);
        doc.setFontSize(7);
        doc.text(student.className || '-', innerX + (innerW / 2), innerY + innerH - 1, { align: 'center' });
      }

      doc.save(`KARTU_${printType}_KELAS_${selectedClass}.pdf`);
    } catch (err: any) {
      console.error(err);
      alert('Gagal membuat PDF: ' + err.message);
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [stdSnap, teaSnap, attSnap, yearSnap, counsSnap, classSnap, subAttSnap, inqSnap, schoolSnap, presenceSnap, configSnap] = await Promise.all([
        getDocs(getTenantCollection('students')).catch(err => { console.error("Students fetch failed", err); return { docs: [] } as any; }),
        getDocs(getTenantCollection('teachers')).catch(err => { console.error("Teachers fetch failed", err); return { docs: [] } as any; }),
        getDocs(query(getTenantCollection('attendance'), orderBy('submittedAt', 'desc'))).catch(async err => {
          console.warn("Attendance orderBy failed, falling back to simple fetch:", err);
          return getDocs(getTenantCollection('attendance'));
        }),
        getDocs(getTenantCollection('academicYears')).catch(err => { console.error("Years fetch failed", err); return { docs: [] } as any; }),
        getDocs(getTenantCollection('counselors')).catch(err => { console.error("Counselors fetch failed", err); return { docs: [] } as any; }),
        getDocs(getTenantCollection('classes')).catch(err => { console.error("Classes fetch failed", err); return { docs: [] } as any; }),
        getDocs(query(getTenantCollection('subjectAttendance'), orderBy('createdAt', 'desc'))).catch(async err => {
          console.warn("SubAtt orderBy failed, falling back:", err);
          return getDocs(getTenantCollection('subjectAttendance'));
        }),
        getDocs(query(getTenantCollection('subjectInquiries'), orderBy('createdAt', 'desc'))).catch(async err => {
          console.warn("Inquiries orderBy failed:", err);
          return getDocs(getTenantCollection('subjectInquiries'));
        }),
        getDocs(getTenantCollection('schoolData')).catch(err => { console.error("SchoolData fetch failed", err); return { docs: [] } as any; }),
        getDocs(query(getTenantCollection('schoolPresence'), where('timestamp', '>=', Timestamp.fromDate(new Date(new Date().setHours(0,0,0,0)))))).catch(async err => {
          console.warn("Presence query failed:", err);
          return { docs: [] } as any;
        }),
        getDoc(getTenantDoc('schoolConfig', 'main')).catch(err => { console.error("Config fetch failed", err); return { exists: () => false } as any; })
      ]);

      setPresenceRecords(presenceSnap.docs.map(d => ({ ...d.data(), id: d.id })));
      if (configSnap.exists()) {
        setPresenceConfig(configSnap.data() as any);
      }

      setStudents(stdSnap.docs.map(d => ({ ...d.data(), id: d.id } as Student)));
      setTeachers(teaSnap.docs.map(d => {
        const data = d.data() as any;
        if (typeof data.status === 'string') {
          data.status = [data.status];
        }
        return { ...data, id: d.id } as Teacher;
      }));
      const newAttendance = attSnap.docs.map(d => {
        const data = d.data();
        return { ...data, id: d.id } as AttendanceRecord;
      });
      setAttendance(newAttendance);

      // We remove the slow serial alert checking loop from the initial load. 
      // Alerts are already calculated when attendance status changes.
      
      setSubjectAttendances(subAttSnap.docs.map(d => ({ ...d.data(), id: d.id })));
      setSubjectInquiries(inqSnap.docs.map(d => ({ ...d.data(), id: d.id })));
      setAcademicYears(yearSnap.docs.map(d => ({ ...d.data(), id: d.id } as AcademicYear)));
      if (!schoolSnap.empty) {
        setSchoolInfo(schoolSnap.docs[0].data());
      }
      setCounselors(counsSnap.docs.map(d => ({ ...d.data(), id: d.id })));
      setClasses(classSnap.docs.map(d => ({ ...d.data(), id: d.id })));
      
      if (isSuperAdmin) {
        await fetchRegisteredSchools();
      }
    } catch (err: any) {
      console.error("Firestore fetch error:", err);
      handleFirestoreError(err, 'list', 'Admin initial data fetch');
    } finally {
      setLoading(false);
    }
  };

  const displayStudents = useMemo(() => {
    if (user?.role === 'COUNSELOR' && filterMode === 'managed') {
      const managed = user.managedClasses || [];
      return students.filter(s => managed.includes(s.className));
    }
    return students;
  }, [students, user, filterMode]);

  const displayAttendance = useMemo(() => {
    if (user?.role === 'COUNSELOR' && filterMode === 'managed') {
      const managed = user.managedClasses || [];
      return attendance.filter(a => managed.includes(a.className));
    }
    return attendance;
  }, [attendance, user, filterMode]);

  const displayClasses = useMemo(() => {
     if (user?.role === 'COUNSELOR' && filterMode === 'managed') {
       const managed = user.managedClasses || [];
       return classes.filter(c => managed.includes(c.name));
     }
     return classes;
  }, [classes, user, filterMode]);

  const studentSummaryByClass = useMemo(() => {
    const summary: { [key: string]: { l: number; p: number; total: number } } = {};
    displayStudents.forEach(s => {
      const cls = s.className || 'Unknown';
      if (!summary[cls]) summary[cls] = { l: 0, p: 0, total: 0 };
      const gender = (s.gender || '').trim().toLowerCase();
      if (gender === 'l' || gender.startsWith('laki')) summary[cls].l++;
      else if (gender === 'p' || gender.startsWith('perem')) summary[cls].p++;
      summary[cls].total++;
    });
    return Object.entries(summary)
      .sort(([a], [b]) => (a || '').localeCompare(b || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [displayStudents]);

  const totalStudentStats = useMemo(() => {
    return displayStudents.reduce((acc, s) => {
      const gender = (s.gender || '').trim().toLowerCase();
      if (gender === 'l' || gender.startsWith('laki')) acc.l++;
      else if (gender === 'p' || gender.startsWith('perem')) acc.p++;
      acc.total++;
      return acc;
    }, { l: 0, p: 0, total: 0 });
  }, [displayStudents]);

  useEffect(() => {
    if (user && authReady) {
      fetchData();
    }
  }, [user, authReady]);


  const generatePasswordsForClass = async (className: string) => {
    try {
      const q = query(getTenantCollection('students'), where('className', '==', className));
      const snap = await getDocs(q);
      const classStudents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
      const promises = [];
      classStudents.forEach((s, idx) => {
        const noUrut = s.absensiNo ? s.absensiNo.padStart(2, '0') : (idx + 1).toString().padStart(2, '0');
        const cleanClass = className.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const prefix = cleanClass.length >= 2 ? cleanClass.substring(0, 2) : cleanClass.padEnd(2, 'A');
        const pass = (prefix + noUrut).substring(0, 4);
        if (s.parentPassword !== pass) {
          promises.push(updateDoc(getTenantDoc('students', s.id!), { parentPassword: pass }));
        }
      });
      await Promise.all(promises);
    } catch (e) {
      console.error('Failed to auto-generate password:', e);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    if (activeTab === 'attendance-detail') {
      const newErrors: Record<string, string> = {};
      if (!formData.studentId) newErrors.studentId = "Siswa harus dipilih";
      if (!formData.date) newErrors.date = "Tanggal harus diisi";
      if (!formData.type) newErrors.type = "Jenis harus dipilih";
      if (!formData.reason || formData.reason.trim().length < 5) {
        newErrors.reason = "Alasan harus diisi minimal 5 karakter";
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }

      setLoading(true);
      try {
        const student = students.find(s => s.id === formData.studentId);
        const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const dateObj = new Date(formData.date);
        const dayName = dayNames[dateObj.getDay()];

        const payload = {
          studentId: formData.studentId,
          studentName: student?.name || '',
          nis: student?.nis || '',
          className: student?.className || '-',
          date: formData.date,
          day: dayName,
          type: formData.type,
          reason: formData.reason,
          parentName: 'Admin Input',
          parentPhone: '-',
          status: 'Approved',
          source: 'Admin',
          submittedAt: serverTimestamp(),
          processedBy: user?.name || 'Admin',
          processedById: user?.uid || null
        };

        await addDoc(getTenantCollection('attendance'), payload);
        
        // Early Warning Check
        checkAttendanceAlert(payload.studentId, payload.studentName, payload.className).catch(console.error);

        setShowAddModal(false);
        fetchData();
        alert('Berhasil menambahkan data absensi!');
      } catch (err: any) {
        handleFirestoreError(err, 'create', 'Manual Attendance Admin');
      } finally {
        setLoading(false);
      }
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
          activeTab === 'counselors' ? 'teachers' : 
          activeTab === 'role-management-guru' || activeTab === 'role-management-petugas' ? 'users' :
          activeTab === 'academic-years' ? 'academicYears' :
          activeTab === 'settings' ? (settingsSubTab === ( 'schools' as any) ? 'schools' : 'academicYears') : '';

      if (!colName) {
        setLoading(false);
        return;
      }

      let payload = { ...formData };
      
      // Special logic for counselors
      if (activeTab === 'counselors') {
        payload = {
          ...payload,
          managedClasses: formData.managedClasses ? (Array.isArray(formData.managedClasses) ? formData.managedClasses : formData.managedClasses.split(',').map((s: string) => s.trim())) : [],
          status: ['Guru BK']
        };
        // Auto password: first 8 digits of NIP
        if (payload.nip && payload.nip.length >= 8) {
          payload.password = payload.nip.substring(0, 8);
        }
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
          status: Array.isArray(formData.status) ? (formData.status.includes('Guru Mapel') ? formData.status : [...formData.status, 'Guru Mapel']) : ['Guru Mapel']
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
        await updateDoc(getTenantDoc('teachers', id), dataToUpdate);

        // SYNC: If Wali Kelas, update the classes collection
        if (dataToUpdate.status?.includes('Wali Kelas') && dataToUpdate.className) {
          const targetClass = classes.find(c => c.name === dataToUpdate.className);
          if (targetClass) {
            await updateDoc(getTenantDoc('classes', targetClass.id), { waliKelasId: id });
          }
          // Optional: Clear other classes that might have this teacher as wali
          const otherClasses = classes.filter(c => c.waliKelasId === id && c.name !== dataToUpdate.className);
          for (const oc of otherClasses) {
            await updateDoc(getTenantDoc('classes', oc.id), { waliKelasId: null });
          }
        } else if (!dataToUpdate.status?.includes('Wali Kelas')) {
           // If no longer wali kelas, clear from classes collection
           const myClasses = classes.filter(c => c.waliKelasId === id);
           for (const mc of myClasses) {
             await updateDoc(getTenantDoc('classes', mc.id), { waliKelasId: null });
           }
        }
      } else if (formData.id) {
        // Update existing
        const { id, type, ...dataToUpdate } = payload;
        Object.keys(dataToUpdate).forEach(key => dataToUpdate[key] === undefined && delete dataToUpdate[key]);
        if (colName === 'schools') {
          const { setDoc } = await import('firebase/firestore');
          await setDoc(doc(db, 'schools', id), dataToUpdate, { merge: true });
          await fetchRegisteredSchools();
        } else {
          await updateDoc(getTenantDoc(colName, id), dataToUpdate);
        }
      } else {
        // Add new
        if ((activeTab === 'settings' || activeTab === 'academic-years') && colName === 'academicYears') {
           payload = { ...payload, active: false };
        }
        
        if (colName === 'schools') {
          const { id: schoolIdToSet, type, ...schoolData } = formData;
          if (!schoolIdToSet) {
            alert('Kode Sekolah harus diisi!');
            setLoading(false);
            return;
          }
          const { setDoc } = await import('firebase/firestore');
          await setDoc(doc(db, 'schools', schoolIdToSet), schoolData);
          await fetchRegisteredSchools();
        } else {
          await addDoc(getTenantCollection(colName), payload);
        }
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
        const managed = user.managedClasses || [];
        matchCounselor = managed.includes(a.className);
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
        processedBy: user?.name || 'Admin',
        processedById: user?.uid || null
      };

      await addDoc(getTenantCollection('attendance'), payload);
      setShowImportModal(false);
      setWaText('');
      setParsedWAData(null);
      fetchData();
      
      // Early Warning Check
      checkAttendanceAlert(payload.studentId, payload.studentName, payload.className).catch(console.error);
      
      alert(`Berhasil mengimpor data absensi untuk ${payload.studentName}!`);
    } catch (err: any) {
      handleFirestoreError(err, 'create', 'WhatsApp Import');
    }
  };

  // Calculate Stats
  const today = new Date().toISOString().split('T')[0];
  const stats = useMemo(() => {
    let baseStudents = students;
    let baseAttendance = attendance;
    let baseSubjectAttendance = subjectAttendances;
    let basePresence = presenceRecords;

    if (user?.role === 'COUNSELOR' && filterMode === 'managed') {
      const managed = user.managedClasses || [];
      baseStudents = students.filter(s => managed.includes(s.className));
      baseAttendance = attendance.filter(a => managed.includes(a.className));
      baseSubjectAttendance = subjectAttendances.filter(a => managed.includes(a.className));
      basePresence = presenceRecords.filter(p => {
        const student = students.find(s => s.id === p.studentId);
        return student && managed.includes(student.className);
      });
    }

    return {
      totalStudents: baseStudents.length,
      sakit: baseAttendance.filter(a => a.type === 'Sakit').length,
      izin: baseAttendance.filter(a => a.type === 'Izin').length,
      dispensasi: baseAttendance.filter(a => a.type === 'Dispensasi').length,
      todaySakit: baseAttendance.filter(a => a.type === 'Sakit' && a.date === today).length,
      todayIzin: baseAttendance.filter(a => a.type === 'Izin' && a.date === today).length,
      todayDispensasi: baseAttendance.filter(a => a.type === 'Dispensasi' && a.date === today).length,
      todayAlpa: baseAttendance.filter(a => a.type === 'Alpa' && a.date === today).length + baseSubjectAttendance.filter(a => (a.type === 'Alpa' || a.status === 'A') && a.date === today).length,
      todayOnTime: basePresence.filter(p => p.type === 'arrival' && (p.status === 'Tepat Waktu' || p.status === 'Hadir')).length,
      todayLate: basePresence.filter(p => p.type === 'arrival' && p.status === 'Terlambat').length,
    };
  }, [students, attendance, subjectAttendances, presenceRecords, user, filterMode, today]);

  const todayAttendanceByClass = useMemo(() => {
    const summary: { [key: string]: { sakit: number, izin: number, dispensasi: number, alpa: number, total: number } } = {};
    
    let baseAttendance = attendance;
    let baseSubjectAttendance = subjectAttendances;

    if (user?.role === 'COUNSELOR' && filterMode === 'managed') {
      const managed = user.managedClasses || [];
      baseAttendance = attendance.filter(a => managed.includes(a.className));
      baseSubjectAttendance = subjectAttendances.filter(a => managed.includes(a.className));
    }

    baseAttendance
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
    baseSubjectAttendance
      .filter(a => a.date === today && (a.type === 'Alpa' || a.status === 'A'))
      .forEach(a => {
        if (!summary[a.className]) {
          summary[a.className] = { sakit: 0, izin: 0, dispensasi: 0, alpa: 0, total: 0 };
        }
        summary[a.className].alpa++;
        summary[a.className].total++;
      });

    return Object.entries(summary).sort((a, b) => (a[0] || '').localeCompare(b[0] || '', undefined, { numeric: true }));
  }, [attendance, subjectAttendances, today, user, filterMode]);

  const handleStatusUpdate = async (id: string, newStatus: 'Approved' | 'Rejected') => {
    let reason = '';
    if (newStatus === 'Rejected') {
      reason = prompt('Masukkan alasan penolakan:') || '';
      if (!reason) return;
    }

    try {
      // Find the attendance record to get studentId
      const record = attendance.find(a => a.id === id);
      if (record) {
        await addDoc(getTenantCollection('notifications'), {
          studentId: record.studentId,
          targetRole: 'PARENT',
          title: newStatus === 'Approved' ? '✅ Izin Disetujui (Admin)' : '❌ Izin Ditolak (Admin)',
          message: newStatus === 'Approved' 
            ? 'Pengajuan izin Anda telah disetujui dan diverifikasi oleh Admin.' 
            : `Pengajuan izin Anda ditolak oleh Admin. Alasan: ${reason}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      await updateDoc(getTenantDoc('attendance', id), { 
        status: newStatus,
        statusReason: reason,
        processedAt: serverTimestamp(),
        processedBy: user?.name || 'Admin'
      });

      // Send WhatsApp Notification to Parent
      if (record && record.parentPhone) {
        fetch('/api/attendance/notify-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schoolId: getSchoolCode(),
            studentName: record.studentName,
            type: record.type,
            date: record.date,
            status: newStatus,
            statusReason: reason,
            parentPhone: record.parentPhone
          })
        }).catch(err => console.error("WA Status Notification failed", err));
      }
      
      // Early Warning Check on Approval
      if (newStatus === 'Approved' && record) {
        checkAttendanceAlert(record.studentId, record.studentName, record.className).catch(console.error);
      }
      
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
        if (coll === 'schools') {
          await deleteDoc(doc(db, 'schools', id));
          if (isSuperAdmin) await fetchRegisteredSchools();
        } else {
          await deleteDoc(getTenantDoc(coll, id));
        }
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
        const promises = students.map(s => deleteDoc(getTenantDoc('students', s.id)));
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
        const promises = selectedStudents.map(id => deleteDoc(getTenantDoc('students', id)));
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
        const promises = teachers.map(t => deleteDoc(getTenantDoc('teachers', t.id!)));
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
        const promises = selectedTeachers.map(id => deleteDoc(getTenantDoc('teachers', id)));
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

  const toggleOfficerSelection = (id: string) => {
    setSelectedOfficers(prev => 
      prev.includes(id) ? prev.filter(o => o !== id) : [...prev, id]
    );
  };

  const toggleAllOfficers = (listToSelect?: string[]) => {
    const ids = listToSelect || students.filter(s => s.role === 'STUDENT').map(s => s.id!);
    const allSelected = ids.length > 0 && ids.every(id => selectedOfficers.includes(id));
    
    if (allSelected) {
      setSelectedOfficers(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedOfficers(prev => Array.from(new Set([...prev, ...ids])));
    }
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
      'Status': 'DITERIMA',
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
      
      if (record.type === 'Sakit') weeks[key].sakit++;
      else if (record.type === 'Izin') weeks[key].izin++;
      else if (record.type === 'Dispensasi') weeks[key].dispensasi++;
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
      'DITERIMA'
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
        width: 256,
        color: {
          dark: '#000000',
          light: '#ffffff',
        }
      });
    } catch (err) {
      console.error(err);
      return '';
    }
  };

  const QRThumbnail = ({ value }: { value: string }) => {
    const [dataUrl, setDataUrl] = useState<string>('');

    useEffect(() => {
      if (!value) return;
      QRCode.toDataURL(value, { margin: 1, width: 64 })
        .then(url => setDataUrl(url))
        .catch(err => console.error(err));
    }, [value]);

    if (!dataUrl) return <span className="text-[10px] text-gray-300 italic">No Data</span>;

    return (
      <img 
        src={dataUrl} 
        alt="QR Code" 
        className="h-8 w-8 object-contain border border-gray-100 rounded bg-white p-0.5 mx-auto" 
        title={value}
      />
    );
  };

  const printTeacherIDCard = async (teacher: any) => {
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
    doc.text("KARTU TANDA ANGGOTA GURU", 42.8, 5, { align: 'center' });
    doc.setFontSize(6);
    doc.text("SMP NEGERI 2 MAGELANG", 42.8, 8, { align: 'center' });

    // Main Content
    doc.setTextColor(30, 64, 175);
    doc.setFontSize(8);
    doc.text("Nama:", 10, 20);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(teacher.name || '-', 10, 24);

    doc.setTextColor(30, 64, 175);
    doc.setFontSize(8);
    doc.text("NIP:", 10, 30);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(teacher.nip || '-', 10, 34);

    doc.setTextColor(30, 64, 175);
    doc.setFontSize(8);
    doc.text("Status:", 10, 40);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(Array.isArray(teacher.status) ? teacher.status.join('/') : (teacher.status || '-'), 10, 44);

    // QR Code
    const qrData = `${window.location.host}/login?role=TEACHER&nip=${teacher.nip}`;
    const qrCodeBase64 = await generateQRCode(qrData);
    if (qrCodeBase64) {
      doc.addImage(qrCodeBase64, 'PNG', 55, 18, 25, 25);
      doc.setFontSize(5);
      doc.setTextColor(150, 150, 150);
      doc.text("Scan untuk Login", 67.5, 45, { align: 'center' });
    }

    // Footer
    doc.setFillColor(241, 245, 249); // gray-100
    doc.rect(0, 49, 85.6, 5, 'F');
    doc.setFontSize(5);
    doc.setTextColor(100, 116, 139); // gray-500
    doc.text("SIAGA - Sistem Informasi Administrasi Giat Absensi", 42.8, 52.5, { align: 'center' });

    doc.save(`KTA_GURU_${teacher.nip}_${teacher.name}.pdf`);
  };

  const printLoginCard = async (entity: any, type: 'GURU' | 'ORTU' | 'PETUGAS') => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [54, 85.6]
    });

    const pageWidth = 54;
    const pageHeight = 85.6;
    
    let qrCodeValue = '';
    let title = '';
    let name = entity.name || '-';
    let subInfo = '';
    let subTitle = '';

    if (type === 'GURU') {
      title = 'KARTU LOGIN GURU';
      qrCodeValue = entity.nip || '';
      subInfo = `NIP: ${qrCodeValue}`;
    } else if (type === 'ORTU') {
      title = 'KARTU LOGIN (ORTU)';
      qrCodeValue = entity.nis || '';
      subInfo = `NIS: ${qrCodeValue} | Kelas: ${entity.className}`;
    } else {
      title = 'PETUGAS ABSENSI KELAS';
      subTitle = 'KARTU LOGIN ANGGOTA';
      // For officers, USER ID is className + padded absensiNo
      qrCodeValue = `${entity.className}${String(entity.absensiNo || '').padStart(2, '0')}`;
      subInfo = `KELAS: ${entity.className}`;
    }

    if (type === 'PETUGAS') {
        // Professional Design for Officer Name Tag
        // Border Blue
        doc.setDrawColor(30, 64, 175);
        doc.setLineWidth(0.5);
        doc.rect(1, 1, pageWidth - 2, pageHeight - 2);

        // Header Section
        doc.setFillColor(30, 64, 175);
        doc.rect(1, 1, pageWidth - 2, 18, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(title, pageWidth / 2, 8, { align: 'center' });
        doc.setFontSize(6);
        doc.text(subTitle, pageWidth / 2, 13, { align: 'center' });

        // QR Code Section (50% area)
        if (qrCodeValue) {
            const qrCodeDataUrl = await generateQRCode(qrCodeValue);
            if (qrCodeDataUrl) {
                const qrSize = 48; // Large QR (approx 50% area of 54x85.6)
                const xPos = (pageWidth - qrSize) / 2;
                doc.addImage(qrCodeDataUrl, 'PNG', xPos, 19, qrSize, qrSize);
            }
        }

        // Student Info
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text("NAMA SISWA:", pageWidth / 2, 69, { align: 'center' });
        doc.setFontSize(9);
        doc.text(name.toUpperCase(), pageWidth / 2, 73, { align: 'center', maxWidth: pageWidth - 10 });
        
        doc.setFontSize(6);
        doc.text("KELAS:", pageWidth / 2, 78, { align: 'center' });
        doc.setFontSize(8);
        doc.setTextColor(30, 64, 175);
        doc.text(entity.className || '-', pageWidth / 2, 82, { align: 'center' });

        // Branding (Small)
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(4);
        doc.text("SCAN QR UNTUK LOGIN", pageWidth / 2, 66, { align: 'center' });
    } else {
        // Default design for others
        doc.setDrawColor(30, 64, 175);
        doc.setLineWidth(0.5);
        doc.rect(1, 1, pageWidth - 2, pageHeight - 2);

        doc.setFillColor(30, 64, 175);
        doc.rect(1, 1, pageWidth - 2, 10, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(title, pageWidth / 2, 7, { align: 'center' });

        if (qrCodeValue) {
          const qrCodeDataUrl = await generateQRCode(qrCodeValue);
          if (qrCodeDataUrl) {
             const qrSize = 34;
             const xPos = (pageWidth - qrSize) / 2;
             doc.addImage(qrCodeDataUrl, 'PNG', xPos, 16, qrSize, qrSize);
          }
        }

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text("PENGGUNA:", pageWidth / 2, 55, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(name, pageWidth / 2, 62, { align: 'center', maxWidth: pageWidth - 8 });

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 64, 175);
        doc.text(subInfo, pageWidth / 2, 70, { align: 'center' });

        doc.setFillColor(241, 245, 249);
        doc.rect(1, pageHeight - 9, pageWidth - 2, 8, 'F');
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(5);
        doc.text("SIAGA - SISTEM ABSENSI DIGITAL", pageWidth / 2, pageHeight - 5.5, { align: 'center' });
        doc.setFontSize(4);
        doc.text("SMP NEGERI 2 MAGELANG", pageWidth / 2, pageHeight - 3.5, { align: 'center' });
    }

    doc.save(`KARTU_LOGIN_${type}_${qrCodeValue}.pdf`);
  };

  const printSelectedTeacherLoginCards = async () => {
    if (selectedTeachers.length === 0) {
      alert('Pilih guru terlebih dahulu.');
      return;
    }
    setLoading(true);
    setStatusMessage('Sedang menyiapkan kartu login guru (Legal Paper)...');
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'legal'
      });

      const pageWidth = 215.9;
      const pageHeight = 355.6;
      const teachersToPrint = teachers.filter(t => selectedTeachers.includes(t.id || ''));
      
      const cardsPerRow = 4;
      const cardsPerCol = 4;
      const cardsPerPage = 16;
      
      const marginX = 10;
      const marginY = 10;
      const cardWidth = (pageWidth - (marginX * 2)) / cardsPerRow;
      const cardHeight = (pageHeight - (marginY * 2)) / cardsPerCol;

      for (let i = 0; i < teachersToPrint.length; i++) {
        if (i > 0 && i % cardsPerPage === 0) {
          doc.addPage();
        }

        const teacher = teachersToPrint[i];
        const pageIdx = i % cardsPerPage;
        const col = pageIdx % cardsPerRow;
        const row = Math.floor(pageIdx / cardsPerRow);
        
        const x = marginX + (col * cardWidth);
        const y = marginY + (row * cardHeight);

        const padding = 2;
        const innerX = x + padding;
        const innerY = y + padding;
        const innerW = cardWidth - (padding * 2);
        const innerH = cardHeight - (padding * 2);

        // Card Border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.roundedRect(innerX, innerY, innerW, innerH, 2, 2, 'S');

        // Header Blue
        doc.setFillColor(30, 64, 175);
        doc.roundedRect(innerX, innerY, innerW, 8, 2, 2, 'F');
        
        // Header Text
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text("KARTU LOGIN GURU", innerX + (innerW / 2), innerY + 5, { align: 'center' });

        const qrCodeValue = teacher.nip || '';
        const qrCodeDataUrl = await generateQRCode(qrCodeValue);
        if (qrCodeDataUrl) {
            const qrSize = Math.min(innerW * 0.75, innerH * 0.45);
            const qrX = innerX + (innerW - qrSize) / 2;
            doc.addImage(qrCodeDataUrl, 'PNG', qrX, innerY + 12, qrSize, qrSize);
        }

        // Info Section
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(5);
        doc.text("NAMA GURU", innerX + (innerW / 2), innerY + innerH - 12, { align: 'center' });
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(7);
        doc.text((teacher.name || '').toUpperCase(), innerX + (innerW / 2), innerY + innerH - 8, { align: 'center', maxWidth: innerW - 4 });

        doc.setTextColor(150, 150, 150);
        doc.setFontSize(5);
        doc.text("IDENTITAS (NIP)", innerX + (innerW / 2), innerY + innerH - 4, { align: 'center' });
        
        doc.setTextColor(30, 64, 175);
        doc.setFontSize(7);
        doc.text(teacher.nip || '-', innerX + (innerW / 2), innerY + innerH - 1, { align: 'center' });
      }

      doc.save(`KARTU_MASAL_GURU_${new Date().getTime()}.pdf`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      alert('Gagal membuat PDF: ' + err.message);
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const printSelectedOfficerLoginCards = async () => {
    if (selectedOfficers.length === 0) {
      alert('Pilih petugas terlebih dahulu.');
      return;
    }
    setLoading(true);
    setStatusMessage('Sedang menyiapkan kartu login masal (Legal Paper)...');
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'legal'
      });

      const pageWidth = 215.9;
      const pageHeight = 355.6;
      const officersToPrint = students.filter(s => selectedOfficers.includes(s.id || ''));
      
      const cardsPerRow = 4;
      const cardsPerCol = 4;
      const cardsPerPage = cardsPerRow * cardsPerCol;
      
      const marginX = 10;
      const marginY = 10;
      const cardWidth = (pageWidth - (marginX * 2)) / cardsPerRow;
      const cardHeight = (pageHeight - (marginY * 2)) / cardsPerCol;

      for (let i = 0; i < officersToPrint.length; i++) {
        if (i > 0 && i % cardsPerPage === 0) {
          doc.addPage();
        }

        const officer = officersToPrint[i];
        const pageIdx = i % cardsPerPage;
        const col = pageIdx % cardsPerRow;
        const row = Math.floor(pageIdx / cardsPerRow);
        
        const x = marginX + (col * cardWidth);
        const y = marginY + (row * cardHeight);

        // Padding inside grid cell
        const padding = 2;
        const innerX = x + padding;
        const innerY = y + padding;
        const innerW = cardWidth - (padding * 2);
        const innerH = cardHeight - (padding * 2);

        // Card Border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.roundedRect(innerX, innerY, innerW, innerH, 2, 2, 'S');

        // Header Blue
        doc.setFillColor(30, 64, 175);
        doc.roundedRect(innerX, innerY, innerW, 8, 2, 2, 'F');
        
        // Header Text
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text("KARTU PETUGAS", innerX + (innerW / 2), innerY + 5, { align: 'center' });

        // QR Code Section (approx 50% height)
        const qrCodeValue = `${officer.className}${String(officer.absensiNo || '').padStart(2, '0')}`;
        const qrCodeDataUrl = await generateQRCode(qrCodeValue);
        if (qrCodeDataUrl) {
            const qrSize = Math.min(innerW * 0.8, innerH * 0.45);
            const qrX = innerX + (innerW - qrSize) / 2;
            doc.addImage(qrCodeDataUrl, 'PNG', qrX, innerY + 12, qrSize, qrSize);
        }

        // Info Section
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(5);
        doc.text("NAMA SISWA", innerX + (innerW / 2), innerY + innerH - 12, { align: 'center' });
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(7);
        doc.text((officer.name || '').toUpperCase(), innerX + (innerW / 2), innerY + innerH - 8, { align: 'center', maxWidth: innerW - 4 });

        doc.setTextColor(150, 150, 150);
        doc.setFontSize(5);
        doc.text("KELAS", innerX + (innerW / 2), innerY + innerH - 4, { align: 'center' });
        
        doc.setTextColor(30, 64, 175);
        doc.setFontSize(7);
        doc.text(officer.className || '-', innerX + (innerW / 2), innerY + innerH - 1, { align: 'center' });
      }

      doc.save(`KARTU_MASAL_PETUGAS_${new Date().getTime()}.pdf`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      alert('Gagal membuat PDF: ' + err.message);
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const printBulkCards = async (type: 'SISWA' | 'ORTU' | 'GURU' | 'PETUGAS' | 'APPLINK') => {
    setLoading(true);
    setStatusMessage(`Sedang menyiapkan pencetakan kartu ${type.replace('_', ' ')}...`);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'legal'
      });

      const pageWidth = 215.9;
      const pageHeight = 355.6;
      const cardsPerRow = 4;
      const cardsPerCol = 4;
      const cardsPerPage = 16;
      
      const marginX = 10;
      const marginY = 10;
      const cardWidth = (pageWidth - (marginX * 2)) / cardsPerRow;
      const cardHeight = (pageHeight - (marginY * 2)) / cardsPerCol;

      let items: any[] = [];
      let title = "";
      let appUrl = window.location.origin;

      if (type === 'SISWA' || type === 'ORTU') {
        items = [...students].sort((a,b) => (a.className || '').localeCompare(b.className || '', undefined, {numeric: true}) || (a.name || '').localeCompare(b.name || ''));
        title = type === 'SISWA' ? "KARTU LOGIN SISWA" : "KARTU LOGIN ORANG TUA";
      } else if (type === 'GURU') {
        items = [...teachers].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        title = "KARTU LOGIN GURU";
      } else if (type === 'PETUGAS') {
        items = allOfficers;
        title = "KARTU LOGIN PETUGAS";
      } else if (type === 'APPLINK') {
        items = Array(16).fill({ isLink: true });
        title = "AKSES APLIKASI";
      }

      const qrCodeAppLink = await generateQRCode(appUrl);

      for (let i = 0; i < items.length; i++) {
        if (i > 0 && i % cardsPerPage === 0) doc.addPage();
        
        const item = items[i];
        const pageIdx = i % cardsPerPage;
        const col = pageIdx % cardsPerRow;
        const row = Math.floor(pageIdx / cardsPerRow);
        
        const x = marginX + (col * cardWidth);
        const y = marginY + (row * cardHeight);

        const padding = 2;
        const innerX = x + padding;
        const innerY = y + padding;
        const innerW = cardWidth - (padding * 2);
        const innerH = cardHeight - (padding * 2);

        // Card Border
        let borderColor = [200, 200, 200];
        let headerColor = [30, 64, 175]; // Blue 700

        if (type === 'ORTU') headerColor = [249, 115, 22]; // Orange 500
        if (type === 'GURU') headerColor = [37, 99, 235]; // Blue 600
        if (type === 'PETUGAS') headerColor = [16, 185, 129]; // Emerald 500
        if (type === 'APPLINK') {
          headerColor = [220, 38, 38]; // Red 600
          borderColor = [220, 38, 38];
        }

        doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
        doc.setLineWidth(0.1);
        doc.roundedRect(innerX, innerY, innerW, innerH, 2, 2, 'S');

        // Header
        doc.setFillColor(headerColor[0], headerColor[1], headerColor[2]);
        doc.roundedRect(innerX, innerY, innerW, 8, 2, 2, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text(title, innerX + (innerW / 2), innerY + 5.5, { align: 'center' });

        // Content
        if (type === 'APPLINK') {
          if (qrCodeAppLink) {
            const qrSize = Math.min(innerW * 0.75, innerH * 0.5);
            const qrX = innerX + (innerW - qrSize) / 2;
            doc.addImage(qrCodeAppLink, 'PNG', qrX, innerY + 14, qrSize, qrSize);
          }
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(6);
          doc.text("PINDAI UNTUK AKSES", innerX + (innerW / 2), innerY + innerH - 12, { align: 'center' });
          doc.setTextColor(100, 100, 100);
          doc.setFontSize(4);
          doc.text(appUrl.replace(/https?:\/\//, ''), innerX + (innerW / 2), innerY + innerH - 8, { align: 'center' });
          doc.setTextColor(headerColor[0], headerColor[1], headerColor[2]);
          doc.setFontSize(6);
          doc.text(schoolInfo?.schoolName || "SMPN 2 MAGELANG", innerX + (innerW / 2), innerY + innerH - 3, { align: 'center' });
        } else {
          const qrCodeValue = type === 'GURU' ? item.email : item.nis;
          const qrCodeDataUrl = await generateQRCode(qrCodeValue);
          if (qrCodeDataUrl) {
            const qrSize = Math.min(innerW * 0.7, innerH * 0.4);
            const qrX = innerX + (innerW - qrSize) / 2;
            doc.addImage(qrCodeDataUrl, 'PNG', qrX, innerY + 12, qrSize, qrSize);
          }
          
          doc.setTextColor(150, 150, 150);
          doc.setFontSize(4);
          doc.text("NAMA " + (type === 'GURU' ? 'GURU' : 'SISWA'), innerX + (innerW / 2), innerY + innerH - 12, { align: 'center' });
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(6);
          doc.setFont('helvetica', 'bold');
          doc.text((item.name || '').toUpperCase(), innerX + (innerW / 2), innerY + innerH - 8, { align: 'center', maxWidth: innerW - 4 });

          doc.setTextColor(150, 150, 150);
          doc.setFontSize(4);
          doc.setFont('helvetica', 'normal');
          doc.text(type === 'GURU' ? "USER (NIP/EMAIL)" : "USER (NIS/NIK)", innerX + (innerW / 2), innerY + innerH - 4, { align: 'center' });
          doc.setTextColor(headerColor[0], headerColor[1], headerColor[2]);
          doc.setFontSize(6);
          doc.text(String(type === 'GURU' ? (item.nip || item.email) : item.nis), innerX + (innerW / 2), innerY + innerH - 1, { align: 'center' });
        }
      }

      doc.save(`KARTU_MASAL_${type}_${formatDate(new Date()).replace(/ /g, '_')}.pdf`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      alert('Gagal membuat PDF: ' + err.message);
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const backupData = async () => {
    setLoading(true);
    setStatusMessage('Sedang menyiapkan pencadangan data sistem...');
    try {
      const collections = [
        'students', 
        'teachers', 
        'classes', 
        'academic_years', 
        'attendance', 
        'subject_attendance', 
        'presence', 
        'counselors', 
        'attendance_officers', 
        'school_info',
        'notifications',
        'subject_inquiries',
        'grades'
      ];

      const backup: any = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        schoolName: schoolInfo?.schoolName || 'SIAGA',
        data: {}
      };

      for (const collName of collections) {
        const snapshot = await getDocs(getTenantCollection(collName));
        backup.data[collName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `BACKUP_DATA_${backup.schoolName.replace(/ /g, '_').toUpperCase()}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      alert('Pencadangan data berhasil! File telah diunduh ke penyimpanan lokal Anda.');
    } catch (err: any) {
      console.error('Backup error:', err);
      alert('Gagal melakukan pencadangan data: ' + err.message);
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!window.confirm('PERINGATAN: Restorasi akan menimpa data yang ada saat ini dengan data dari file backup. Apakah Anda yakin ingin melanjutkan?')) {
      return;
    }

    setLoading(true);
    setStatusMessage('Sedang memproses restorasi data...');
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const backup = JSON.parse(content);
          
          if (!backup.data) throw new Error('Format file tidak valid.');

          let batch = writeBatch(db);
          let ops = 0;

          for (const [collName, items] of Object.entries(backup.data)) {
            for (const item of (items as any[])) {
              batch.set(getTenantDoc(collName, item.id), item);
              ops++;
              
              if (ops === 450) { 
                await batch.commit();
                batch = writeBatch(db);
                ops = 0;
              }
            }
          }
          if (ops > 0) await batch.commit();

          setSuccess(true);
          setTimeout(() => setSuccess(false), 3000);
          alert('Restorasi data berhasil! Aplikasi akan memuat ulang.');
          window.location.reload();
        } catch (err: any) {
            console.error('Restore error:', err);
            alert('Gagal melakukan restorasi data: ' + err.message);
            setLoading(false);
            setStatusMessage('');
        }
      }
      reader.readAsText(file);
    } catch (err: any) {
        console.error('File read error:', err);
        setLoading(false);
        setStatusMessage('');
        alert('Gagal membaca file: ' + err.message);
    }
  };

  const printSelectedLoginCards = async (printType: 'SISWA' | 'ORTU' = 'SISWA') => {
    const listToPrint = students.filter(s => selectedStudents.includes(s.id));
    if (listToPrint.length === 0) {
      alert('Pilih siswa terlebih dahulu.');
      return;
    }
    setLoading(true);
    setStatusMessage(`Sedang menyiapkan kartu login ${printType === 'ORTU' ? 'orang tua' : 'siswa'} (Legal Paper)...`);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'legal'
      });

      const pageWidth = 215.9;
      const pageHeight = 355.6;
      const cardsPerRow = 4;
      const cardsPerCol = 4;
      const cardsPerPage = 16;
      
      const marginX = 10;
      const marginY = 10;
      const cardWidth = (pageWidth - (marginX * 2)) / cardsPerRow;
      const cardHeight = (pageHeight - (marginY * 2)) / cardsPerCol;

      for (let i = 0; i < listToPrint.length; i++) {
        if (i > 0 && i % cardsPerPage === 0) {
          doc.addPage();
        }

        const student = listToPrint[i];
        const pageIdx = i % cardsPerPage;
        const col = pageIdx % cardsPerRow;
        const row = Math.floor(pageIdx / cardsPerRow);
        
        const x = marginX + (col * cardWidth);
        const y = marginY + (row * cardHeight);

        const padding = 2;
        const innerX = x + padding;
        const innerY = y + padding;
        const innerW = cardWidth - (padding * 2);
        const innerH = cardHeight - (padding * 2);

        // Card Border
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.roundedRect(innerX, innerY, innerW, innerH, 2, 2, 'S');

        // Header
        const headerColor = printType === 'ORTU' ? [251, 146, 60] : [30, 64, 175];
        doc.setFillColor(headerColor[0], headerColor[1], headerColor[2]);
        doc.roundedRect(innerX, innerY, innerW, 8, 2, 2, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text(printType === 'ORTU' ? "KARTU LOGIN ORTU" : "KARTU LOGIN SISWA", innerX + (innerW / 2), innerY + 5, { align: 'center' });

        const qrCodeValue = student.nis || '';
        const qrCodeDataUrl = await generateQRCode(qrCodeValue);
        if (qrCodeDataUrl) {
            const qrSize = Math.min(innerW * 0.75, innerH * 0.45);
            const qrX = innerX + (innerW - qrSize) / 2;
            doc.addImage(qrCodeDataUrl, 'PNG', qrX, innerY + 12, qrSize, qrSize);
        }

        doc.setTextColor(150, 150, 150);
        doc.setFontSize(5);
        doc.text("NAMA SISWA", innerX + (innerW / 2), innerY + innerH - 12, { align: 'center' });
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(7);
        doc.text((student.name || '').toUpperCase(), innerX + (innerW / 2), innerY + innerH - 8, { align: 'center', maxWidth: innerW - 4 });

        doc.setTextColor(150, 150, 150);
        doc.setFontSize(5);
        doc.text("KELAS", innerX + (innerW / 2), innerY + innerH - 4, { align: 'center' });
        
        doc.setTextColor(headerColor[0], headerColor[1], headerColor[2]);
        doc.setFontSize(7);
        doc.text(student.className || '-', innerX + (innerW / 2), innerY + innerH - 1, { align: 'center' });
      }

      doc.save(`KARTU_MASAL_${printType}_${new Date().getTime()}.pdf`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      alert('Gagal membuat PDF: ' + err.message);
    } finally {
      setLoading(false);
      setStatusMessage('');
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
    doc.text("SIAGA - Sistem Informasi Administrasi Giat Absensi", 42.8, 52.5, { align: 'center' });

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
        doc.text("SIAGA - Sistem Informasi Administrasi Giat Absensi", 42.8, 52.5, { align: 'center' });
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

    let result = Array.from(classMap.values());
    
    if (user?.role === 'COUNSELOR' && filterMode === 'managed') {
      const managed = user.managedClasses || [];
      result = result.filter(cl => managed.includes(cl.name));
    }

    return result
      .filter(cl => {
        const matchSearch = cl.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchFilter = !classFilter || cl.name === classFilter;
        return matchSearch && matchFilter;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [classes, students, teachers, counselors, searchTerm, classFilter, user, filterMode]);

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.nis.toLowerCase().includes(searchTerm.toLowerCase());
      const matchClass = !classFilter || s.className === classFilter;
      
      let matchCounselor = true;
      if (user?.role === 'COUNSELOR' && filterMode === 'managed') {
        const managed = user.managedClasses || [];
        matchCounselor = managed.includes(s.className);
      }
      
      return matchSearch && matchClass && matchCounselor;
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [students, searchTerm, classFilter, user, filterMode]);

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
    return teachers.filter(t => {
      const isWaliKelasExplicit = t.status?.includes('Wali Kelas');
      const isWaliKelasLinked = classes.some(c => c.waliKelasId === t.id || (t.className && c.name.toLowerCase().replace(/\s/g, '') === t.className.toLowerCase().replace(/\s/g, '')));
      return isWaliKelasExplicit || isWaliKelasLinked;
    }).map(t => {
      if (!t.className) {
        const assignedClass = classes.find(c => c.waliKelasId === t.id);
        if (assignedClass) return { ...t, className: assignedClass.name };
      }
      return t;
    }).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [teachers, classes]);

  const paginatedWaliKelas = useMemo(() => {
    const startIndex = (waliKelasPage - 1) * itemsPerPage;
    return filteredWaliKelas.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredWaliKelas, waliKelasPage]);

  const totalWaliKelasPages = Math.ceil(filteredWaliKelas.length / itemsPerPage);

  const filteredSubjectTeachers = useMemo(() => {
    return teachers.filter(t => t.status?.includes('Guru Mapel')).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [teachers]);

  const paginatedSubjectTeachers = useMemo(() => {
    const startIndex = (subjectTeacherPage - 1) * itemsPerPage;
    return filteredSubjectTeachers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSubjectTeachers, subjectTeacherPage]);

  const totalSubjectTeacherPages = Math.ceil(filteredSubjectTeachers.length / itemsPerPage);

  const counselorTeachers = useMemo(() => {
      const fromTeachers = teachers.filter(t => t.status?.includes('Guru BK'));
      // Merge with counselors collection to avoid data loss during migration
      const fromCounselors = counselors.filter(c => !teachers.some(t => t.nip === c.nip));
      return [...fromTeachers, ...fromCounselors].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [teachers, counselors]);

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
        return getTimeSafe(b.createdAt) - getTimeSafe(a.createdAt);
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

  const pendingAttendance = useMemo(() => {
    return (attendance as AttendanceRecord[]).filter(a => a.status === 'Pending').sort((a, b) => {
        return getTimeSafe(b.submittedAt) - getTimeSafe(a.submittedAt);
    });
  }, [attendance]);

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
      <AnimatePresence>
        {showNotifications && (
          <>
            <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px]" onClick={() => setShowNotifications(false)} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed top-24 right-6 z-50 w-80 bg-white border border-gray-100 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-tighter">Pemberitahuan Admin</h3>
                <button 
                  onClick={markAllNotificationsAsRead}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-700 uppercase"
                >
                  Baca Semua
                </button>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {adminNotifications.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">
                    <Bell className="mx-auto mb-2 opacity-20" size={32} />
                    <p className="text-[10px] font-bold uppercase tracking-widest">Tidak ada pemberitahuan</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {adminNotifications.map((notif, i) => (
                      <div 
                        key={notif.id ? `admin-notif-${notif.id}-${i}` : `admin-notif-idx-${i}`} 
                        className={cn(
                          "p-4 transition-all hover:bg-gray-50 group",
                          !notif.read ? "bg-blue-50/30" : ""
                        )}
                      >
                        <div className="flex gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                            !notif.read 
                              ? (notif.title?.includes('Terlambat') ? "bg-red-500 text-white shadow-sm" :
                                 notif.title?.includes('Pulang') ? "bg-amber-500 text-white shadow-sm" :
                                 notif.title?.includes('Izin') ? "bg-amber-500 text-white shadow-sm" : 
                                 notif.title?.includes('Status') ? "bg-green-500 text-white shadow-sm" :
                                 "bg-blue-500 text-white shadow-sm")
                              : "bg-gray-100 text-gray-400"
                          )}>
                            {notif.title?.includes('Terlambat') ? <Clock size={14} /> : 
                             notif.title?.includes('Pulang') ? <Clock size={14} /> :
                             notif.title?.includes('Izin') ? <Calendar size={14} /> : 
                             notif.title?.includes('Status') ? <CheckCircle2 size={14} /> :
                             notif.title?.includes('Pesan') ? <MessageSquare size={14} /> :
                             <Bell size={14} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="text-[11px] font-black text-gray-900 leading-none truncate uppercase">{notif.title || 'Informasi'}</h4>
                              <span className="text-[8px] font-bold text-gray-400 whitespace-nowrap ml-2">
                                {notif.createdAt ? formatDate(notif.createdAt) : '-'}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-600 font-medium leading-tight mb-2">{notif.message}</p>
                            <div className="flex items-center gap-2">
                               {!notif.read && (
                                 <button 
                                   onClick={() => markNotificationAsRead(notif.id)}
                                   className="text-[9px] font-bold text-blue-600 hover:underline uppercase"
                                 >
                                   Tandai Dibaca
                                 </button>
                               )}
                               <button 
                                 onClick={() => deleteNotification(notif.id)}
                                 className="text-[9px] font-bold text-red-400 hover:text-red-600 uppercase"
                               >
                                 Hapus
                               </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Selamat Datang, {user?.name}
          </h2>
          <div className="flex flex-col gap-2 mt-1">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full border border-green-100 shadow-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] font-black text-green-700 uppercase tracking-widest">Online</span>
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                {'Administrator Sistem'}
              </p>
              <ActiveAcademicYearDisplay />
            </div>
            <p className="text-sm text-gray-500 font-medium">
               {'Kelola data sekolah, guru, siswa, dan konfigurasi administrasi presensi.'}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
           {user?.role === 'COUNSELOR' && (
             <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
               <button 
                 onClick={() => setFilterMode('all')}
                 className={cn(
                   "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                   filterMode === 'all' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                 )}
               >
                 Semua Data
               </button>
               <button 
                 onClick={() => setFilterMode('managed')}
                 className={cn(
                   "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                   filterMode === 'managed' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                 )}
               >
                 Bimbingan Saya
               </button>
             </div>
           )}
           <button 
             onClick={() => setShowNotifications(!showNotifications)}
             className={cn(
               "relative p-2 rounded-xl transition-all border",
               showNotifications ? "bg-blue-600 text-white border-blue-600 shadow-lg" : "bg-white text-gray-400 border-gray-100 hover:bg-gray-50"
             )}
           >
             {adminNotifications.filter(n => !n.read).length > 0 ? <BellRing size={20} className="animate-pulse" /> : <Bell size={20} />}
             {adminNotifications.filter(n => !n.read).length > 0 && (
               <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white shadow-sm">
                 {adminNotifications.filter(n => !n.read).length}
               </span>
             )}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Siswa', value: stats.totalStudents, icon: GraduationCap, color: 'bg-info', bg: 'bg-blue-500' },
              { label: 'Total Sakit', value: stats.sakit, icon: AlertCircle, color: 'bg-danger', bg: 'bg-red-500' },
              { label: 'Total Izin', value: stats.izin, icon: CalendarIcon, color: 'bg-success', bg: 'bg-green-500' },
              { label: 'Total Dispensasi', value: stats.dispensasi, icon: CheckCircle2, color: 'bg-purple', bg: 'bg-purple-500' },
            ].map((stat, i) => (
              <div key={`${stat.label}-${i}`} className={cn("relative overflow-hidden rounded-lg shadow-sm text-white", stat.bg)}>
                <div className="p-2 z-10 relative">
                  <h3 className="text-xl font-bold mb-0.5">{stat.value}</h3>
                  <p className="text-xs font-medium opacity-90">{stat.label}</p>
                </div>
                <div className="absolute right-1 top-1 opacity-20 transform scale-125">
                  <stat.icon size={32} />
                </div>
                <div className="bg-black/10 text-center py-0.5 text-[8px] font-bold uppercase tracking-wider cursor-pointer hover:bg-black/20 transition-all">
                   Selengkapnya <Plus size={8} className="inline ml-1" />
                </div>
              </div>
            ))}
          </div>

          <AIPredictiveAnalytics attendanceData={displayAttendance} />

          {/* Daily Summary Ringkasan Hari Ini & Quick Access */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            {/* Kehadiran & Informasi Sistem Column */}
            <div className="lg:col-span-1 flex flex-col gap-3 h-full">
               {/* Kehadiran Siswa Hari Ini */}
               <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                     <div className="flex items-center gap-1.5">
                        <div className="p-1 bg-sky-50 text-green-600 rounded-md">
                           <UserCheck size={14} />
                        </div>
                        <div>
                           <h3 className="text-[9px] font-black text-gray-900 uppercase tracking-tight leading-none">Kehadiran Siswa</h3>
                           <p className="text-[7px] font-bold text-sky-400 uppercase tracking-widest leading-none mt-0.5">
                              {formatDate(new Date(today))}
                           </p>
                        </div>
                     </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 flex-1 items-center">
                     <div className="bg-green-50/40 p-2 rounded-lg border border-green-100 flex flex-col items-center justify-center">
                        <p className="text-[6px] font-black text-green-600 uppercase tracking-widest mb-1 leading-none text-center">Tepat Waktu</p>
                        <span className="text-xl font-black text-green-700 leading-none">{stats.todayOnTime}</span>
                     </div>
                     <div className="bg-orange-50/40 p-2 rounded-lg border border-orange-100 flex flex-col items-center justify-center">
                        <p className="text-[6px] font-black text-orange-600 uppercase tracking-widest mb-1 leading-none text-center">Terlambat</p>
                        <span className="text-xl font-black text-orange-700 leading-none">{stats.todayLate}</span>
                     </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between">
                     <span className="text-[7px] text-gray-400 font-bold uppercase tracking-widest leading-none">Total Hadir Sekarang</span>
                     <span className="text-[9px] font-black text-gray-900 leading-none">{stats.todayOnTime + stats.todayLate} Siswa</span>
                  </div>
               </div>

               {/* Informasi Sistem */}
               <div className="bg-white p-2.5 rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col">
                  <h3 className="text-[10px] font-bold text-gray-800 mb-1.5 flex items-center gap-1">
                     <Activity size={12} className="text-sky-600" />
                     Informasi Sistem
                  </h3>
                  <div className="flex flex-col gap-1.5 flex-1">
                     <div className="bg-sky-50 p-1.5 rounded-lg border border-sky-100">
                        <p className="text-[6px] font-black uppercase tracking-widest text-sky-400 mb-0.5">Status Database</p>
                        <div className="flex items-center gap-1">
                           <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse"></div>
                           <p className="font-bold text-[7px] text-sky-900 leading-none">Terhubung (Cloud Firestore)</p>
                        </div>
                     </div>
                     <div className="bg-sky-50 p-1.5 rounded-lg border border-sky-100">
                        <p className="text-[6px] font-black uppercase tracking-widest text-sky-400 mb-0.5">Akses WhatsApp</p>
                        <p className="font-bold text-[7px] text-sky-900 flex items-center gap-1 leading-none">
                           <MessageCircle size={7} className="text-green-500" /> Aktif Gateway
                        </p>
                     </div>
                     <ScannerStatus />
                  </div>
                  <div className="mt-2">
                     <p className="text-[7px] text-gray-400 font-medium leading-relaxed italic">
                        Sinkronisasi data master, gateway & scanner.
                     </p>
                  </div>
               </div>
            </div>

            <div className="lg:col-span-1 bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col h-full">
               <h3 className="text-xs font-black text-gray-800 mb-3 flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-600" />
                  Ringkasan Hari Ini ({formatDate(new Date(today))})
               </h3>
                <div className="space-y-3 flex-1 flex flex-col justify-between">
                  <div className="flex items-center justify-between p-2.5 bg-amber-50 rounded-lg">
                     <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-white">
                           <AlertCircle size={12} />
                        </div>
                        <span className="text-[10px] font-black text-amber-700 uppercase tracking-tight">Sakit</span>
                     </div>
                     <span className="text-lg font-black text-amber-700">{stats.todaySakit}</span>
                  </div>
                  
                  <div className="flex items-center justify-between p-2.5 bg-green-50 rounded-lg">
                     <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white">
                           <CalendarIcon size={12} />
                        </div>
                        <span className="text-[10px] font-black text-green-700 uppercase tracking-tight">Izin</span>
                     </div>
                     <span className="text-lg font-black text-green-700">{stats.todayIzin}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-blue-50 rounded-lg">
                     <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white">
                           <CheckCircle2 size={12} />
                        </div>
                        <span className="text-[10px] font-black text-blue-700 uppercase tracking-tight">Dispensasi</span>
                     </div>
                     <span className="text-lg font-black text-blue-700">{stats.todayDispensasi}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-red-50 rounded-lg">
                     <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white">
                           <AlertCircle size={12} />
                        </div>
                        <span className="text-[10px] font-black text-red-700 uppercase tracking-tight">Alpa</span>
                     </div>
                     <span className="text-lg font-black text-red-700">{stats.todayAlpa}</span>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between mt-auto">
                     <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Total Absensi</span>
                     <span className="text-sm font-black text-gray-900">{stats.todayAlpa + stats.todaySakit + stats.todayIzin + stats.todayDispensasi} Siswa</span>
                  </div>
               </div>
            </div>

            {/* Quick Features Access */}
            <div className="lg:col-span-1 flex flex-col gap-2 h-full">
              <div 
                onClick={() => printBulkCards('APPLINK')}
                className="bg-white p-2 rounded-xl shadow-sm border border-red-200 hover:border-red-500 cursor-pointer transition-all flex items-center gap-2 group flex-1"
              >
                <div className="w-6 h-6 rounded-md bg-red-50 flex items-center justify-center text-red-600 group-hover:bg-red-600 group-hover:text-white transition-all">
                  <QrCode size={12} />
                </div>
                <div>
                  <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Akses</p>
                  <h4 className="text-[10px] font-bold text-gray-800">Cetak Link Aplikasi</h4>
                </div>
              </div>
              <div 
                onClick={() => printBulkCards('SISWA')}
                className="bg-white p-2 rounded-xl shadow-sm border border-gray-200 hover:border-indigo-500 cursor-pointer transition-all flex items-center gap-2 group flex-1"
              >
                <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <IdCard size={12} />
                </div>
                <div>
                  <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Absensi</p>
                  <h4 className="text-[10px] font-bold text-gray-800">Cetak Login Siswa</h4>
                </div>
              </div>
              <div 
                onClick={() => printBulkCards('GURU')}
                className="bg-white p-2 rounded-xl shadow-sm border border-gray-200 hover:border-blue-500 cursor-pointer transition-all flex items-center gap-2 group flex-1"
              >
                <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <Users size={12} />
                </div>
                <div>
                  <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Manajemen</p>
                  <h4 className="text-[10px] font-bold text-gray-800">Cetak Login Guru</h4>
                </div>
              </div>
              <div 
                onClick={() => printBulkCards('PETUGAS')}
                className="bg-white p-2 rounded-xl shadow-sm border border-gray-200 hover:border-emerald-500 cursor-pointer transition-all flex items-center gap-2 group flex-1"
              >
                <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                  <GraduationCap size={12} />
                </div>
                <div>
                  <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Petugas</p>
                  <h4 className="text-[10px] font-bold text-gray-800">Cetak Login Petugas</h4>
                </div>
              </div>
              <div 
                onClick={() => printBulkCards('ORTU')}
                className="bg-white p-2 rounded-xl shadow-sm border border-gray-200 hover:border-orange-500 cursor-pointer transition-all flex items-center gap-2 group flex-1"
              >
                <div className="w-6 h-6 rounded-md bg-orange-50 flex items-center justify-center text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-all">
                  <IdCard size={12} />
                </div>
                <div>
                  <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Akses Wali</p>
                  <h4 className="text-[10px] font-bold text-gray-800">Cetak Login Orang Tua</h4>
                </div>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
             <div className="lg:col-span-1">
               <AttendanceChart attendance={displayAttendance} />
             </div>
             <div className="lg:col-span-1">
               <AttendanceTrendChart attendance={displayAttendance} />
             </div>
          </div>
          <div className="mb-6">
             <AttendanceAlertsDisplay />
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
                   <div key={`overview-cls-stat-v2-${cls}-${idx}`} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-md transition-all group">
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

          {/* Pending Attendance Requests Section */}
          {pendingAttendance.length > 0 && (
            <div className="mt-8 bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
               <div className="p-4 bg-gradient-to-r from-amber-500 to-amber-600 border-b border-amber-600 flex justify-between items-center">
                  <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Clock size={18} />
                    Permohonan Menunggu Persetujuan ({pendingAttendance.length})
                  </h3>
                  <button 
                    onClick={() => setActiveTab('attendance-detail')}
                    className="text-[10px] font-bold text-amber-50 bg-amber-700/50 px-3 py-1.5 rounded-xl uppercase hover:bg-amber-700 transition-all border border-amber-400/30 shadow-sm"
                  >
                    Kelola Semua
                  </button>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                   <thead>
                     <tr className="bg-amber-50/50 border-b border-amber-100">
                       <th className="px-6 py-4 text-[10px] font-black text-amber-700 uppercase tracking-widest border-r border-amber-100">Informasi Siswa</th>
                       <th className="px-6 py-4 text-[10px] font-black text-amber-700 uppercase tracking-widest border-r border-amber-100">Alasan & Tanggal</th>
                       <th className="px-6 py-4 text-[10px] font-black text-amber-700 uppercase tracking-widest border-r border-amber-100 text-center">Berkas Lampiran</th>
                       <th className="px-6 py-4 text-[10px] font-black text-amber-700 uppercase tracking-widest text-center">Persetujuan Cepat</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-amber-50">
                     {pendingAttendance.slice(0, 5).map((a, idx) => (
                       <tr key={`pending-ov-row-${a.id || idx}-${idx}`} className="hover:bg-amber-50/30 transition-colors">
                         <td className="px-6 py-4 border-r border-amber-50">
                            <p className="font-black text-gray-900 text-sm leading-none">{a.studentName}</p>
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter mt-1.5">{a.className}</p>
                         </td>
                         <td className="px-6 py-4 border-r border-amber-50">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                                a.type === 'Sakit' ? "bg-red-100 text-red-600 border border-red-200" : "bg-yellow-100 text-yellow-600 border border-yellow-200"
                              )}>
                                {a.type}
                              </span>
                              <span className="text-[10px] font-bold text-gray-400">{a.date ? formatDate(new Date(a.date)) : '-'}</span>
                            </div>
                            <p className="text-[11px] text-gray-600 font-medium italic line-clamp-1 leading-none">"{a.reason || 'Keterangan tidak disertai'}"</p>
                         </td>
                         <td className="px-6 py-4 border-r border-amber-50 text-center">
                            {a.documentUrl ? (
                              <div className="flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => window.open(a.documentUrl, '_blank')}
                                  className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all border border-blue-100 shadow-sm"
                                  title="Lihat Berkas"
                                >
                                  <FileText size={14} />
                                </button>
                                <button 
                                  onClick={() => downloadDocument(a.documentUrl!, a.studentName!, a.date!, a.type!)}
                                  className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all border border-emerald-100 shadow-sm"
                                  title="Unduh Berkas ke Lokal"
                                >
                                  <Download size={14} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center opacity-30">
                                <HardDrive size={16} className="text-gray-400" />
                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-1">Tanpa Berkas</span>
                              </div>
                            )}
                         </td>
                         <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-3">
                               <button 
                                  onClick={() => handleStatusUpdate(a.id!, 'Approved')}
                                  className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600 shadow-md shadow-green-100 hover:scale-110 active:scale-95 transition-all"
                                  title="Terima Permohonan"
                               >
                                  <CheckCircle2 size={16} />
                                </button>
                                <button 
                                  onClick={() => handleStatusUpdate(a.id!, 'Rejected')}
                                  className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 shadow-md shadow-red-100 hover:scale-110 active:scale-95 transition-all"
                                  title="Tolak Permohonan"
                               >
                                  <XCircle size={16} />
                               </button>
                            </div>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
               {pendingAttendance.length > 5 && (
                 <div className="p-4 bg-amber-50/50 border-t border-amber-100 text-center">
                    <button 
                      onClick={() => setActiveTab('attendance-detail')}
                      className="text-[10px] font-black text-amber-700 uppercase tracking-[0.3em] hover:tracking-[0.4em] transition-all flex items-center justify-center gap-2 mx-auto"
                    >
                      LIHAT {pendingAttendance.length - 5} PERMOHONAN LAINNYA <ChevronRight size={14} />
                    </button>
                 </div>
               )}
            </div>
          )}
        </>
      )}

          {activeTab.startsWith('role-management') && (
            <div className="space-y-8 p-6">
               {activeTab === 'role-management-guru' && (
                 <div className="pt-6 border-t border-gray-100 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
                          <ShieldCheck size={24} />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Manajemen Peran Guru</h3>
                          <p className="text-[10px] font-bold text-indigo-400 font-medium uppercase tracking-widest mt-0.5">Atur peran Wali Kelas, Guru Mapel, dan Guru BK serta kelas ampuhannya.</p>
                        </div>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                          type="text" 
                          placeholder="Cari nama atau NIP guru..." 
                          className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                      <div className="p-4 bg-indigo-600 text-white flex justify-between items-center">
                        <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                          <Users size={18} /> Daftar Otoritas Guru
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 bg-white/20 text-white text-[10px] font-black rounded-full uppercase">
                            {teachers.length} Total Guru
                          </span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[1000px]">
                          <thead>
                            <tr className="bg-indigo-50/50 border-b border-indigo-100/50">
                              <th className="px-6 py-4 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">No</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Informasi Guru</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Guru Mapel (Bidang Studi)</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Wali Kelas</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Guru BK (Kelas Bimbingan)</th>
                              <th className="px-6 py-4 text-[10px] font-bold text-indigo-700 uppercase tracking-wider text-center">Opsi Izin</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {teachers
                              .filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.nip?.includes(searchTerm))
                              .slice((roleManagementPage - 1) * 12, roleManagementPage * 12)
                              .map((t, idx) => (
                              <tr key={t.id ? `role-manage-row-${t.id}-${idx}` : `role-manage-row-idx-${idx}`} className="hover:bg-indigo-50/10 transition-colors">
                                <td className="px-6 py-4 text-xs text-gray-400 font-bold">{(roleManagementPage - 1) * 12 + idx + 1}</td>
                                <td className="px-6 py-4">
                                  <p className="text-sm font-bold text-gray-900 leading-none">{t.name}</p>
                                  <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-tighter">NIP: {t.nip || '-'}</p>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-wrap gap-1">
                                    {t.status?.includes('Guru Mapel') ? (
                                      <>
                                        <div className="w-full mb-1">
                                          {(Array.isArray(t.subjects) ? t.subjects : []).length > 0 ? (
                                            (Array.isArray(t.subjects) ? t.subjects : []).map((s, si) => (
                                              <span key={`role-sub-${t.id || 't'}-${si}`} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-black rounded border border-blue-100 mr-1 uppercase">{s}</span>
                                            ))
                                          ) : <span className="text-[9px] text-amber-500 font-bold uppercase italic">Subjek Kosong</span>}
                                        </div>
                                        <p className="text-[9px] text-gray-400 font-medium">Kelas: {(Array.isArray(t.taughtClasses) ? t.taughtClasses : []).join(', ') || '-'}</p>
                                      </>
                                    ) : (
                                      <span className="text-[10px] text-gray-300 italic">-</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  {t.status?.includes('Wali Kelas') ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                                      <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">{t.className || 'Error'}</span>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-gray-300 italic">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-wrap gap-1">
                                    {t.status?.includes('Guru BK') ? (
                                      <>
                                        {(Array.isArray(t.managedClasses) ? t.managedClasses : []).length > 0 ? (
                                          (Array.isArray(t.managedClasses) ? t.managedClasses : []).map((mc, mci) => (
                                            <span key={`bk-${t.id}-${mci}`} className="px-2 py-0.5 bg-purple-50 text-purple-600 text-[9px] font-black rounded border border-purple-100 uppercase">{mc}</span>
                                          ))
                                        ) : <span className="text-[9px] text-amber-500 font-bold uppercase italic">Kelas Kosong</span>}
                                      </>
                                    ) : (
                                      <span className="text-[10px] text-gray-300 italic">-</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <button 
                                    onClick={() => {
                                      setFormData({
                                        ...t,
                                        subjects: Array.isArray(t.subjects) ? t.subjects.join(', ') : (t.subjects || ''),
                                        taughtClasses: Array.isArray(t.taughtClasses) ? t.taughtClasses.join(', ') : (t.taughtClasses || ''),
                                        managedClasses: Array.isArray(t.managedClasses) ? t.managedClasses.join(', ') : (t.managedClasses || ''),
                                        isChangingRole: true
                                      });
                                      setShowAddModal(true);
                                    }}
                                    className="px-4 py-2 bg-white border-2 border-indigo-600 text-indigo-600 rounded-xl text-[10px] font-black hover:bg-indigo-600 hover:text-white transition-all shadow-sm flex items-center gap-1.5 mx-auto uppercase tracking-wider"
                                  >
                                    <Key size={12} />
                                    Kelola Otoritas
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        
                        {(teachers.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.nip?.includes(searchTerm)).length > 12) && (
                          <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              Hal {roleManagementPage} / {Math.ceil(teachers.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.nip?.includes(searchTerm)).length / 12)}
                            </span>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => setRoleManagementPage(p => Math.max(1, p - 1))}
                                disabled={roleManagementPage === 1}
                                className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs disabled:opacity-50 transition-all font-black uppercase text-gray-600 hover:bg-gray-50"
                              >
                                Prev
                              </button>
                              <button 
                                onClick={() => setRoleManagementPage(p => Math.min(Math.ceil(teachers.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.nip?.includes(searchTerm)).length / 12), p + 1))}
                                disabled={roleManagementPage === Math.ceil(teachers.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.nip?.includes(searchTerm)).length / 12)}
                                className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs disabled:opacity-50 transition-all font-black uppercase text-gray-600 hover:bg-gray-50"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
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
                              .filter(s => s.className === className && (s as any).role === 'PETUGAS_ABSEN_KELAS')
                              .map(s => s.id!);
                            setSelectedClassOfficers(currentOfficers);
                          }}
                        >
                          <option value="">-- Pilih Daftar Kelas --</option>
                          {[...classes].sort((a,b) => (a.name || '').localeCompare(b.name || '', undefined, {numeric: true})).map((cl, i) => <option key={`cl-sel-opt-${cl.id || i}`} value={cl.name}>{cl.name}</option>)}
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
                              .map((s, idx) => {
                                const isSelected = selectedClassOfficers.includes(s.id!);
                                const isDisabled = !isSelected && selectedClassOfficers.length >= 2;

                                return (
                                  <label 
                                    key={s.id ? `off-cand-${s.id}-${idx}` : `off-cand-${s.nis || s.name}-${idx}`} 
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
                           <div className="w-1 h-1 rounded-full bg-emerald-500"></div>
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
                  <div className="flex items-center gap-4">
                    {selectedOfficers.length > 0 && (
                      <button 
                        onClick={printSelectedOfficerLoginCards}
                        className="px-3 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold hover:bg-indigo-700 transition-all flex items-center gap-1 shadow-sm uppercase"
                      >
                        <Download size={12} /> UNDUH KARTU MASAL ({selectedOfficers.length})
                      </button>
                    )}
                    <button 
                      onClick={() => setShowAddOfficerForm(true)}
                      className="px-3 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700 transition-all flex items-center gap-1 shadow-sm uppercase"
                    >
                      <Plus size={12} /> TAMBAH PETUGAS
                    </button>
                    <span className="px-2 py-1 bg-blue-600/20 text-blue-400 text-[10px] font-bold rounded-lg border border-blue-600/30">
                      {allOfficers.length} Petugas Aktif
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-3 w-10 border-r border-gray-100">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={allOfficers.length > 0 && allOfficers.every(o => selectedOfficers.includes(o.id!))}
                            onChange={() => toggleAllOfficers(allOfficers.map(o => o.id!))}
                          />
                        </th>
                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">No</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Kelas</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Nama Siswa</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">USER ID</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">SANDI</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase text-center">QR CODE</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase text-center">UNDUH KARTU</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase text-center">AKSI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {paginatedOfficers.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-6 py-12 text-center text-gray-400 italic text-sm">Belum ada petugas kelas yang ditunjuk.</td>
                        </tr>
                      ) : (
                        paginatedOfficers.map((o, idx) => (
                          <tr key={o.id ? `officer-${o.id}-${idx}` : `officer-${idx}`} className={cn("hover:bg-blue-50/20 transition-colors", selectedOfficers.includes(o.id!) && "bg-blue-50")}>
                            <td className="px-6 py-4 border-r border-gray-50 text-center">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                checked={selectedOfficers.includes(o.id!)}
                                onChange={() => toggleOfficerSelection(o.id!)}
                              />
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-400 font-medium">{(officerListPage - 1) * itemsPerPage + idx + 1}</td>
                            <td className="px-6 py-4 text-sm font-black text-blue-600 uppercase">{o.className}</td>
                            <td className="px-6 py-4 text-sm font-bold text-gray-900">{o.name}</td>
                            <td className="px-6 py-4 text-sm text-gray-900 font-mono italic">{`${o.className}${String((o as any).absensiNo || '').padStart(2, '0')}`}</td>
                            <td className="px-6 py-4 text-sm text-gray-900 font-mono italic">{(o as any).nis || '-'}</td>
                            <td className="px-6 py-4 text-center">
                               <QRThumbnail value={`${o.className}${String((o as any).absensiNo || '').padStart(2, '0')}`} />
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button 
                                onClick={() => printLoginCard(o, 'PETUGAS')}
                                className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 border border-indigo-100 mx-auto"
                                title="Download Kartu Login"
                              >
                                <Download size={14} />
                                <span className="text-[10px] font-black">UNDUH</span>
                              </button>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => {
                                    setFormData({ ...formData, tempClassForOfficer: o.className });
                                    const currentOfficers = students
                                      .filter(s => s.className === o.className && ((s as any).role === 'PETUGAS_ABSEN_KELAS' || (s as any).role === 'STUDENT'))
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
                          key={'pag-officer-' + i}
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
            <>
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

            {studentSummaryByClass.length > 0 && (
              <div className="mb-6 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-sm font-bold text-gray-800 mb-6 flex items-center gap-2 uppercase tracking-widest">
                  <Filter size={18} className="text-blue-600" />
                  Infografis Data Siswa per Kelas
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {studentSummaryByClass.map(([cls, data]: any, idx: number) => (
                    <div key={`std-sum-cls-maintab-${cls}-${idx}`} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-md transition-all group">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-black text-gray-900 group-hover:text-blue-600 transition-colors uppercase">{cls}</span>
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
            </>
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
      {activeTab !== 'overview' && (
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
                   <option key={`class-filter-opt-${cl.id || 'idx-'+idx}`} value={cl.name}>{cl.name}</option>
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
                    onClick={handleDeleteDuplicateStudents}
                    className="px-3 py-2 bg-pink-600 text-white rounded text-xs font-bold hover:bg-pink-700 transition-all flex items-center gap-1 shadow-sm uppercase"
                  >
                    <AlertCircle size={14} /> HAPUS GANDA ({duplicateNises.length})
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
                      onClick={printSelectedLoginCards}
                      className="px-3 py-2 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 transition-all flex items-center gap-1 shadow-sm uppercase"
                    >
                      <IdCard size={14} /> KARTU LOGIN ({selectedStudents.length})
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
                          setUploadProgress({ current: 0, total: jsonData.length, label: 'Memvalidasi Data Siswa' });
                          try {
                            const snapshot = await getDocs(getTenantCollection('students'));
                            const existingStudents = snapshot.docs.map(doc => doc.data());
                            const existingNis = new Set(existingStudents.map(s => s.nis));

                            for (const row of jsonData as any[]) {
                              const nis = String(row['NIS'] || '');
                              const nisn = String(row['NISN'] || '');
                              if (!nis || !nisn) throw new Error('NIS dan NISN harus diisi.');
                              if (existingNis.has(nis)) throw new Error(`NIS ${nis} sudah terdaftar.`);
                              if (!/^\d{10}$/.test(nisn)) throw new Error(`NISN ${nisn} tidak valid (harus 10 angka).`);
                              existingNis.add(nis);
                            }

                            setUploadProgress({ current: 0, total: jsonData.length, label: 'Mengunggah Data Siswa' });
                            let count = 0;
                            const affectedClasses = new Set<string>();
                            for (const row of jsonData as any[]) {
                              if (row['Kelas']) affectedClasses.add(String(row['Kelas']));
                              await addDoc(getTenantCollection('students'), {
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
                            alert(`Gagal mengunggah data: ${err instanceof Error ? err.message : 'Kesalahan tidak diketahui.'}`);
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
                        ['Nama Guru', 'NIP', 'SANDI', 'Nomor WA', 'Kelas Ampuan']
                      ];
                      const ws = XLSX.utils.aoa_to_sheet(templateData);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Template Wali Kelas");
                      XLSX.writeFile(wb, "Template_Data_Wali_Kelas.xlsx");
                    }}
                    className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-1 shadow-sm"
                  >
                    <Download size={14} /> TEMPLAT EXCEL
                  </button>
                  <label className="px-3 py-2 bg-blue-600 text-white border border-blue-700 rounded text-xs font-bold hover:bg-blue-700 transition-all flex items-center gap-1 shadow-md cursor-pointer">
                    <CloudUpload size={14} /> IMPOR EXCEL
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
                          setUploadProgress({ current: 0, total: jsonData.length, label: 'Memvalidasi Data Wali Kelas' });
                          try {
                            const existingNips = new Set(teachers.map(t => t.nip).filter(Boolean));
                            
                            // Validation first
                            for (const row of jsonData as any[]) {
                              const nip = String(row['NIP'] || '');
                              if (nip && existingNips.has(nip)) {
                                throw new Error(`NIP ${nip} sudah terdaftar atau duplikat dalam list.`);
                              }
                              if (nip) existingNips.add(nip);
                            }

                            setUploadProgress({ current: 0, total: jsonData.length, label: 'Mengunggah Data Wali Kelas' });
                            let count = 0;
                            for (const row of jsonData as any[]) {
                              const nip = String(row['NIP'] || '');
                              const password = row['SANDI'] || row['Kata Sandi'] || row['Sandi'] || (nip.length >= 8 ? nip.substring(0, 8) : '123456');
                              const phoneNumber = String(row['Nomor WA'] || '');
                              
                              await addDoc(getTenantCollection('teachers'), {
                                name: row['Nama Guru'] || row['Nama'] || '',
                                nip: nip,
                                password: password,
                                phoneNumber: phoneNumber,
                                className: String(row['Kelas Ampuan'] || ''),
                                status: ['Wali Kelas'],
                                role: 'TEACHER'
                              });
                              count++;
                              setUploadProgress({ current: count, total: jsonData.length, label: 'Mengunggah Data Wali Kelas' });
                            }
                            fetchData();
                            alert(`${jsonData.length} Wali Kelas berhasil diunggah!`);
                          } catch (err: any) {
                            console.error(err);
                            alert(`Gagal mengunggah data: ${err.message}`);
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
                        ['Nama Guru', 'NIP', 'SANDI', 'Nomor WA', 'Status/Jabatan']
                      ];
                      const ws = XLSX.utils.aoa_to_sheet(templateData);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Template Data Guru");
                      XLSX.writeFile(wb, "Template_Data_Guru.xlsx");
                    }}
                    className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-1 shadow-sm"
                  >
                    <Download size={14} /> TEMPLAT EXCEL
                  </button>
                  <label className="px-3 py-2 bg-blue-600 text-white border border-blue-700 rounded text-xs font-bold hover:bg-blue-700 transition-all flex items-center gap-1 shadow-md cursor-pointer">
                    <CloudUpload size={14} /> IMPOR EXCEL
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
                          setUploadProgress({ current: 0, total: jsonData.length, label: 'Memvalidasi Data Guru' });
                          try {
                            const existingNips = new Set(teachers.map(t => t.nip).filter(Boolean));
                            
                            for (const row of jsonData as any[]) {
                              const nip = String(row['NIP'] || '');
                              if (nip && existingNips.has(nip)) {
                                throw new Error(`NIP ${nip} sudah terdaftar atau duplikat dalam list.`);
                              }
                              if (nip) existingNips.add(nip);
                            }

                            setUploadProgress({ current: 0, total: jsonData.length, label: 'Mengunggah Data Guru' });
                            let count = 0;
                            for (const row of jsonData as any[]) {
                              let statusArr: string[] = [];
                              const rawStatusStr = String(row['Status/Jabatan'] || row['Status'] || row['Jabatan'] || '');
                              if (rawStatusStr && rawStatusStr !== 'undefined') {
                                statusArr = rawStatusStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
                              }

                              const nip = String(row['NIP'] || '');
                              const password = row['SANDI'] || row['Kata Sandi'] || row['Sandi'] || (nip.length >= 8 ? nip.substring(0, 8) : '123456');
                              const phoneNumber = String(row['Nomor WA'] || '');

                              await addDoc(getTenantCollection('teachers'), {
                                name: row['Nama Guru'] || row['Nama'] || '',
                                nip: nip,
                                password: String(password),
                                phoneNumber: phoneNumber,
                                status: statusArr,
                                role: 'TEACHER'
                              });
                              count++;
                              setUploadProgress({ current: count, total: jsonData.length, label: 'Mengunggah Data Guru' });
                            }
                            fetchData();
                            alert(`${jsonData.length} Data Guru berhasil diunggah!`);
                          } catch (error: any) {
                            console.error('Error uploading:', error);
                            alert(`Gagal mengunggah data: ${error.message}`);
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
                        ['Nama Guru', 'NIP', 'SANDI', 'Nomor WA', 'Bidang Studi (pisahkan koma: MTK, IPA)', 'Kelas Ampuan (pisahkan koma: 7A, 7B)']
                      ];
                      const ws = XLSX.utils.aoa_to_sheet(templateData);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Template Guru Mapel");
                      XLSX.writeFile(wb, "Template_Data_Guru_Mapel.xlsx");
                    }}
                    className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-1 shadow-sm"
                  >
                    <Download size={14} /> TEMPLAT EXCEL
                  </button>
                  <label className="px-3 py-2 bg-blue-600 text-white border border-blue-700 rounded text-xs font-bold hover:bg-blue-700 transition-all flex items-center gap-1 shadow-md cursor-pointer">
                    <CloudUpload size={14} /> IMPOR EXCEL
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
                          setUploadProgress({ current: 0, total: jsonData.length, label: 'Memvalidasi Data Guru Mapel' });
                          try {
                            const existingNips = new Set(teachers.map(t => t.nip).filter(Boolean));
                            
                            for (const row of jsonData as any[]) {
                              const nip = String(row['NIP'] || '');
                              if (nip && existingNips.has(nip)) {
                                throw new Error(`NIP ${nip} sudah terdaftar atau duplikat dalam list.`);
                              }
                              if (nip) existingNips.add(nip);
                            }

                            setUploadProgress({ current: 0, total: jsonData.length, label: 'Mengunggah Data Guru Mapel' });
                            let count = 0;
                            for (const row of jsonData as any[]) {
                              const subjectsRaw = String(row['Bidang Studi (pisahkan koma: MTK, IPA)'] || '');
                              const classesRaw = String(row['Kelas Ampuan (pisahkan koma: 7A, 7B)'] || '');
                              const nip = String(row['NIP'] || '');
                              const password = row['SANDI'] || row['Kata Sandi'] || row['Sandi'] || (nip.length >= 8 ? nip.substring(0, 8) : '123456');
                              const phoneNumber = String(row['Nomor WA'] || '');
                              
                              const subjects = subjectsRaw ? subjectsRaw.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];
                              const taughtClasses = classesRaw ? classesRaw.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];

                              await addDoc(getTenantCollection('teachers'), {
                                name: row['Nama Guru'] || '',
                                nip: nip,
                                password: password,
                                phoneNumber: phoneNumber,
                                status: ['Guru Mapel'],
                                subjects: subjects,
                                taughtClasses: taughtClasses,
                                role: 'TEACHER'
                              });
                              count++;
                              setUploadProgress({ current: count, total: jsonData.length, label: 'Mengunggah Data Guru Mapel' });
                            }
                            fetchData();
                            alert(`${jsonData.length} Guru Mapel berhasil diunggah!`);
                          } catch (err: any) {
                            console.error(err);
                            alert(`Gagal mengunggah data: ${err.message}`);
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

             {activeTab === 'counselors' && (
               <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const templateData = [
                        ['Nama Guru BK', 'NIP', 'SANDI', 'Nomor WA', 'Kelas Bimbingan (pisahkan koma: 7A, 7B)']
                      ];
                      const ws = XLSX.utils.aoa_to_sheet(templateData);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Template Guru BK");
                      XLSX.writeFile(wb, "Template_Data_Guru_BK.xlsx");
                    }}
                    className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-1 shadow-sm"
                  >
                    <Download size={14} /> TEMPLAT EXCEL
                  </button>
                  <label className="px-3 py-2 bg-blue-600 text-white border border-blue-700 rounded text-xs font-bold hover:bg-blue-700 transition-all flex items-center gap-1 shadow-md cursor-pointer">
                    <CloudUpload size={14} /> IMPOR EXCEL
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
                          setUploadProgress({ current: 0, total: jsonData.length, label: 'Memvalidasi Data Guru BK' });
                          try {
                            const existingNips = new Set(teachers.map(t => t.nip).filter(Boolean));
                            
                            for (const row of jsonData as any[]) {
                              const nip = String(row['NIP'] || '');
                              if (nip && existingNips.has(nip)) {
                                throw new Error(`NIP ${nip} sudah terdaftar atau duplikat dalam list.`);
                              }
                              if (nip) existingNips.add(nip);
                            }

                            setUploadProgress({ current: 0, total: jsonData.length, label: 'Mengunggah Data Guru BK' });
                            let count = 0;
                            for (const row of jsonData as any[]) {
                              const classesRaw = String(row['Kelas Bimbingan (pisahkan koma: 7A, 7B)'] || '');
                              const nip = String(row['NIP'] || '');
                              const password = row['SANDI'] || row['Kata Sandi'] || row['Sandi'] || (nip.length >= 8 ? nip.substring(0, 8) : '123456');
                              const phoneNumber = String(row['Nomor WA'] || '');
                              
                              const managedClasses = classesRaw ? classesRaw.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];

                              await addDoc(getTenantCollection('teachers'), {
                                name: row['Nama Guru BK'] || '',
                                nip: nip,
                                password: password,
                                phoneNumber: phoneNumber,
                                status: ['Guru BK'],
                                managedClasses: managedClasses,
                                role: 'COUNSELOR'
                              });
                              count++;
                              setUploadProgress({ current: count, total: jsonData.length, label: 'Mengunggah Data Guru BK' });
                            }
                            fetchData();
                            alert(`${jsonData.length} Guru BK berhasil diunggah!`);
                          } catch (err: any) {
                            console.error(err);
                            alert(`Gagal mengunggah data: ${err.message}`);
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
                    <option key={`${cl.id || `filter-class-${cl.name}`}-${idx}`} value={cl.name}>{cl.name}</option>
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

           {(activeTab === 'attendance-detail' || (activeTab !== 'attendance' && activeTab !== 'settings' && activeTab !== 'academic-years')) && (
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
                 onClick={() => { 
                   if (activeTab === 'attendance-detail') {
                     setFormData({ 
                       date: new Date().toISOString().split('T')[0],
                       type: 'Sakit',
                       status: 'Approved'
                     });
                     setErrors({});
                     setAttendanceFormStudentSearch('');
                   } else {
                     setFormData({});
                   }
                   setShowAddModal(true); 
                 }}
                 className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-md"
               >
                 <Plus size={18} />
                 {activeTab === 'classes' ? 'Atur Tampilan Kelas' : 
                  activeTab === 'attendance-detail' ? 'Input Manual' : 'Tambah Data'}
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
                onClick={handleDeleteDuplicateTeachers}
                className="px-3 py-2 bg-pink-600 text-white rounded text-xs font-bold hover:bg-pink-700 transition-all flex items-center gap-1 shadow-sm uppercase"
              >
                <AlertCircle size={14} /> HAPUS GANDA ({duplicateNips.length})
              </button>
              <button 
                onClick={handleDeleteAllTeachers}
                className="px-3 py-2 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-1 shadow-sm"
              >
                <AlertCircle size={14} /> HAPUS SEMUA
              </button>
              {selectedTeachers.length > 0 && (
                <button 
                  onClick={printSelectedTeacherLoginCards}
                  className="px-3 py-2 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 transition-all flex items-center gap-1 shadow-sm uppercase"
                >
                  <IdCard size={14} /> KARTU LOGIN ({selectedTeachers.length})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Table Area (AdminLTE Style Tables) */}
        <div className="overflow-x-auto">
          {activeTab === 'students' && (
            <div className="flex gap-2 mb-4">
              {selectedStudents.length > 0 && (
                <>
                  <button 
                    onClick={() => printSelectedLoginCards('SISWA')}
                    className="px-3 py-2 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 transition-all flex items-center gap-1 shadow-sm uppercase"
                  >
                    <IdCard size={14} /> LOGIN SISWA ({selectedStudents.length})
                  </button>
                  <button 
                    onClick={() => printSelectedLoginCards('ORTU')}
                    className="px-3 py-2 bg-orange-600 text-white rounded text-xs font-bold hover:bg-orange-700 transition-all flex items-center gap-1 shadow-sm uppercase"
                  >
                    <Users size={14} /> LOGIN ORTU ({selectedStudents.length})
                  </button>
                  <button 
                    onClick={printSelectedIDCards}
                    className="px-3 py-2 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-1 shadow-sm uppercase"
                  >
                    <IdCard size={14} /> KARTU ID ({selectedStudents.length})
                  </button>
                </>
              )}
              <button 
                onClick={handleDeleteSelectedStudents}
                disabled={selectedStudents.length === 0}
                className="px-3 py-2 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-1 shadow-sm disabled:opacity-50"
              >
                <Trash2 size={14} /> HAPUS TERPILIH
              </button>
            </div>
          )}
          {activeTab === 'students' && (
            <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
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
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">QR Code</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedStudents.map((s, idx) => (
                  <tr key={`student-${s.id}-${idx}`} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50", selectedStudents.includes(s.id) && "bg-blue-50/50", s.nis && duplicateNises.includes(s.nis) && "bg-red-50 border-l-4 border-l-red-500")}>
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
                    <td className="px-6 py-3 border-r border-gray-100 text-center"><QRThumbnail value={s.nis} /></td>
                    <td className="px-6 py-3 text-center">
                       <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => { setFormData(s); setShowAddModal(true); }}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold uppercase hover:bg-blue-700 transition-all flex items-center gap-1"
                          >
                            <Edit size={12} /> EDIT
                          </button>
                          <button 
                            onClick={() => handleShowStudentDetail(s)}
                            className="px-3 py-1 bg-amber-600 text-white rounded text-[10px] font-bold uppercase hover:bg-amber-700 transition-all flex items-center gap-1"
                          >
                            <FileText size={12} /> DETAIL
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
                          <button 
                            onClick={() => printLoginCard(s, 'ORTU')}
                            className="px-3 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold uppercase hover:bg-indigo-700 transition-all flex items-center gap-1"
                          >
                            <IdCard size={12} /> KARTU LOGIN (ORTU)
                          </button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

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
                      key={'pag-student-ui-' + i}
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
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 w-10 border-r border-gray-200">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={filteredWaliKelas.length > 0 && paginatedWaliKelas.every(t => selectedTeachers.includes(t.id!))}
                      onChange={() => toggleAllTeachers(paginatedWaliKelas.map(t => t.id!))}
                    />
                  </th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200 text-center">No</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Nama Guru</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">NIP</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200 text-center">QR CODE</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Kelas Ampuan</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Nomor WA</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedWaliKelas.map((t, idx) => (
                  <tr key={`wali-kelas-${t.id || idx}-${idx}`} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50", t.id && selectedTeachers.includes(t.id) && "bg-blue-50", t.nip && duplicateNips.includes(t.nip) && "bg-red-50 border-l-4 border-l-red-500")}>
                    <td className="px-6 py-3 border-r border-gray-100 text-center">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={t.id ? selectedTeachers.includes(t.id) : false}
                        onChange={() => t.id && toggleTeacherSelection(t.id)}
                      />
                    </td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm font-bold text-gray-400 text-center">{(waliKelasPage - 1) * itemsPerPage + idx + 1}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm font-medium text-gray-900">{t.name}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">{t.nip || '-'}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-center"><QRThumbnail value={t.nip || ''} /></td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm font-bold text-blue-600">{t.className || '-'}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">{t.phoneNumber || '-'}</td>
                    <td className="px-6 py-3 text-center">
                       <div className="flex items-center justify-center gap-2">
                          <button onClick={() => { setFormData(t); setShowAddModal(true); }} className="px-3 py-1 bg-blue-600 text-white rounded text-[10px] font-bold uppercase hover:bg-blue-700 transition-all flex items-center gap-1">
                            <Edit size={12} /> EDIT
                          </button>
                          <button 
                            onClick={() => printTeacherIDCard(t)}
                            className="px-3 py-1 bg-amber-600 text-white rounded text-[10px] font-bold uppercase hover:bg-amber-700 transition-all flex items-center gap-1"
                          >
                            <IdCard size={12} /> KTA
                          </button>
                          <button 
                            onClick={() => printLoginCard(t, 'GURU')}
                            className="px-3 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold uppercase hover:bg-indigo-700 transition-all flex items-center gap-1"
                          >
                            <IdCard size={12} /> LOGIN
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
            </div>

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
                      key={'pag-walikelas-ui-' + i}
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
            <div className="overflow-x-auto">
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
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">QR CODE</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">Nomor WA</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase border-r border-gray-200">STATUS</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-700 uppercase text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedTeacherList.map((t, idx) => (
                  <tr key={`teacher-list-${t.id || idx}-${idx}`} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50", t.id && selectedTeachers.includes(t.id) && "bg-blue-50", t.nip && duplicateNips.includes(t.nip) && "bg-red-50 border-l-4 border-l-red-500")}>
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
                    <td className="px-6 py-3 border-r border-gray-100 text-center"><QRThumbnail value={t.nip} /></td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">{t.phoneNumber || '-'}</td>
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
                          <button 
                            onClick={() => printTeacherIDCard(t)}
                            className="px-3 py-1 bg-amber-600 text-white rounded text-[10px] font-bold uppercase hover:bg-amber-700 transition-all flex items-center gap-1"
                          >
                            <IdCard size={12} /> KTA
                          </button>
                          <button 
                            onClick={() => printLoginCard(t, 'GURU')}
                            className="px-3 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold uppercase hover:bg-indigo-700 transition-all flex items-center gap-1"
                          >
                            <IdCard size={12} /> LOGIN
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
            </div>

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
                      key={'pag-teacher-list-' + i}
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
            <div className="overflow-x-auto">
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
                  <tr key={`subject-teacher-${t.id}-${idx}`} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50", t.nip && duplicateNips.includes(t.nip) && "bg-red-50 border-l-4 border-l-red-500")}>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm font-bold text-gray-400 text-center">{(subjectTeacherPage - 1) * itemsPerPage + idx + 1}</td>
                    <td className="px-6 py-3 border-r border-gray-100 font-medium text-gray-900">{t.name}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(t.subjects) ? t.subjects : []).map((s, si) => (
                          <span key={`${t.id}-subj-${si}`} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded border border-blue-100">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(t.taughtClasses) ? t.taughtClasses : []).map((c, ci) => (
                          <span key={`${t.id}-class-${ci}`} className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded border border-emerald-100">{c}</span>
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
            </div>

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
                      key={'pag-kelas-' + i}
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
            <div className="overflow-x-auto">
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
                  <tr key={`counselor-${c.id}-${idx}`} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50")}>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm font-bold text-gray-400 text-center">{(counselorPage - 1) * itemsPerPage + idx + 1}</td>
                    <td className="px-6 py-3 border-r border-gray-100 font-medium text-gray-900">{c.name}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">{c.nip}</td>
                    <td className="px-6 py-3 border-r border-gray-100 text-sm">
                       <div className="flex flex-wrap gap-1">
                          {c.managedClasses?.map((cl: string, cIdx: number) => (
                            <span key={`counselor-class-${c.id}-${cIdx}`} className="px-2 py-0.5 bg-purple-50 text-purple-600 text-[10px] font-bold rounded border border-purple-100">{cl}</span>
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
            </div>

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
                      key={'pag-counselor-ui-' + i}
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
                    {classes.map((cl, idx) => (
                      <option key={`cl-opt-v2-${cl.id || idx}`} value={cl.name}>{cl.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
                    <input 
                      type="month" 
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(e.target.value)}
                      className="p-1.5 border border-gray-200 rounded text-[10px] outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button 
                      onClick={() => {
                        if (!filterMonth) return alert('Pilih bulan!');
                        const filtered = subjectAttendances.filter(att => att.date.startsWith(filterMonth));
                        const doc = new jsPDF();
                        doc.text(`Laporan Bulanan Absensi Mapel - ${filterMonth}`, 14, 15);
                        autoTable(doc, {
                          startY: 20,
                          head: [['Tanggal', 'Siswa', 'Kelas', 'Mapel', 'Jam', 'Status', 'Catatan']],
                          body: filtered.map(a => [a.date, a.studentName, a.className, a.subjectName, a.period, a.status, a.notes || '-'])
                        });
                        doc.save(`Laporan_Bulanan_Mapel_${filterMonth}.pdf`);
                      }}
                      className="p-1.5 bg-red-600 text-white rounded text-[10px] font-bold hover:bg-red-700"
                    >
                      PDF
                    </button>
                  </div>

                  <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
                    <select 
                      value={filterSemester}
                      onChange={(e) => setFilterSemester(e.target.value)}
                      className="p-1.5 border border-gray-200 rounded text-[10px] outline-none"
                    >
                      <option value="">Semester</option>
                      <option value="1">Ganjil (1)</option>
                      <option value="2">Genap (2)</option>
                    </select>
                    <button 
                      onClick={() => {
                        if (!filterSemester) return alert('Pilih semester!');
                        const filtered = subjectAttendances.filter(att => {
                          const month = new Date(att.date).getMonth() + 1;
                          return filterSemester === '1' ? (month >= 7 && month <= 12) : (month >= 1 && month <= 6);
                        });
                        const doc = new jsPDF();
                        doc.text(`Laporan Semester Absensi Mapel - ${filterSemester === '1' ? 'Ganjil' : 'Genap'}`, 14, 15);
                        autoTable(doc, {
                          startY: 20,
                          head: [['Tanggal', 'Siswa', 'Kelas', 'Mapel', 'Jam', 'Status', 'Catatan']],
                          body: filtered.map(a => [a.date, a.studentName, a.className, a.subjectName, a.period, a.status, a.notes || '-'])
                        });
                        doc.save(`Laporan_Semester_Mapel_${filterSemester}.pdf`);
                      }}
                      className="p-1.5 bg-red-600 text-white rounded text-[10px] font-bold hover:bg-red-700"
                    >
                      PDF
                    </button>
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
                    <Download size={18} /> Excel
                  </button>
                </div>
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
                      <tr key={`inq-row-v2-${inq.id || idx}`} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50")}>
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
                          Belum ada data TANYA WALI KELAS.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalInquiryPages > 1 && (
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Menampilkan {((subjectInquiryPage - 1) * itemsPerPage) + 1} - {Math.min(subjectInquiryPage * itemsPerPage, filteredInquiries.length)} dari {filteredInquiries.length} TANYA WALI KELAS
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
                        key={'pag-inq-' + i}
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
                      const waliKelas = teachers.find(t => t.id === cl.waliKelasId)?.name || 
                                         teachers.find(t => (t.className || '').toLowerCase().replace(/\s/g, '') === (cl.name || '').toLowerCase().replace(/\s/g, ''))?.name || '-';
                      const guruBK = teachers.filter(t => t.status?.includes('Guru BK') && t.managedClasses?.some((mc: string) => mc.toLowerCase().replace(/\s/g, '') === (cl.name || '').toLowerCase().replace(/\s/g, ''))).map(t => t.name).join(', ') || '-';
                      
                      return (
                        <tr key={`class-row-${cl.id || cl.name}-${idx}`} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-gray-50/50")}>
                          <td className="px-6 py-3 border-r border-gray-100 text-sm font-bold text-gray-400 text-center">{(classPage - 1) * itemsPerPage + idx + 1}</td>
                          <td className="px-6 py-3 border-r border-gray-100 font-bold text-gray-900 flex items-center gap-2">
                            {cl.icon && React.createElement(getLucideIcon(cl.icon), { size: 16, className: cl.color || "text-gray-500" })}
                            {cl.name}
                          </td>
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
                                        await addDoc(getTenantCollection('classes'), { name: cl.name });
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
            <div className="p-8 space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
               {/* Navigation Bar */}
               <div className="flex p-1 bg-gray-100 rounded-2xl w-fit">
                 {[
                   { id: 'umum', label: 'Umum & Konfigurasi' },
                   { id: 'data', label: 'Data & Keamanan' },
                   { id: 'tema', label: 'Tema Dasbor' },
                   ...(isSuperAdmin ? [{ id: 'schools', label: 'Sekolah' }] : [])
                 ].map(tab => (
                   <button
                     key={tab.id}
                     onClick={() => setSettingsSubTab(tab.id as any)}
                     className={cn(
                       "px-6 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all",
                       settingsSubTab === tab.id 
                         ? "bg-white text-gray-900 shadow-sm" 
                         : "text-gray-500 hover:text-gray-900"
                     )}
                   >
                     {tab.label}
                   </button>
                 ))}
               </div>

               {/* Content */}
               


               {settingsSubTab === 'umum' && (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                       <AttendanceConfig classes={classes} />
                    </div>
                    <LogoSettings />
                    <WhatsAppSettings />
                  </div>
               )}

               {settingsSubTab === 'data' && (
                 <div className="pt-6 border-t border-gray-100 space-y-8">
                    {/* Storage Management Section */}
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl shadow-gray-100/50">
                       <div className="flex items-center gap-3 mb-6">
                          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                             <HardDrive size={24} />
                          </div>
                          <div>
                             <h4 className="text-base font-black text-gray-900 uppercase tracking-tight">Manajemen Penyimpanan & Kapasitas</h4>
                             <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mt-0.5">Pantau dan kelola penggunaan ruang Firebase Storage</p>
                          </div>
                          <div className="ml-auto">
                             <button 
                               onClick={calculateStorageStats}
                               disabled={isUpdatingStorageStats}
                               className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                               title="Segarkan data penyimpanan"
                             >
                                <RefreshCw className={cn(isUpdatingStorageStats && "animate-spin")} size={18} />
                             </button>
                          </div>
                       </div>

                       <div className="grid lg:grid-cols-2 gap-8 items-center">
                          {/* Visualization */}
                          <div className="relative aspect-square max-w-[220px] mx-auto lg:mx-0">
                             <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                   <Pie
                                      data={[
                                        { name: 'Digunakan', value: storageUsage.used },
                                        { name: 'Tersedia', value: Math.max(0, storageUsage.total - storageUsage.used) }
                                      ]}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius="70%"
                                      outerRadius="100%"
                                      paddingAngle={0}
                                      dataKey="value"
                                      stroke="none"
                                   >
                                      <Cell fill="#3b82f6" />
                                      <Cell fill="#f1f5f9" />
                                   </Pie>
                                   <Tooltip 
                                      formatter={(value: number) => [`${(value / (1024 * 1024)).toFixed(2)} MB`, '']}
                                   />
                                </PieChart>
                             </ResponsiveContainer>
                             <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-2xl font-black text-gray-900">
                                   {((storageUsage.used / storageUsage.total) * 100).toFixed(1)}%
                                </span>
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Terpakai</span>
                             </div>
                          </div>

                          {/* Stats & Controls */}
                          <div className="space-y-4">
                             <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                   <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Digunakan</p>
                                   <p className="text-xl font-black text-blue-600">
                                      {(storageUsage.used / (1024 * 1024)).toFixed(2)} <span className="text-[10px] uppercase">MB</span>
                                   </p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                   <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Jumlah File</p>
                                   <p className="text-xl font-black text-gray-900">
                                      {storageUsage.fileCount.toLocaleString()} <span className="text-[10px] uppercase">File</span>
                                   </p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 col-span-2">
                                   <div className="flex justify-between items-center mb-1.5">
                                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Kapasitas Estimasi (Soft Limit)</p>
                                      <p className="text-[9px] font-black text-gray-900 uppercase tracking-widest">5.00 GB</p>
                                   </div>
                                   <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                      <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(100, (storageUsage.used / storageUsage.total) * 100)}%` }}
                                        className="h-full bg-blue-600 rounded-full"
                                      />
                                   </div>
                                </div>
                             </div>

                             <div className="p-5 bg-rose-50 border border-rose-100 rounded-3xl space-y-3">
                                <div className="flex items-start gap-2.5">
                                   <div className="p-1 bg-rose-100 text-rose-600 rounded-md shrink-0 mt-0.5">
                                      <AlertCircle size={14} />
                                   </div>
                                   <div>
                                      <p className="text-[11px] font-bold text-rose-900 uppercase tracking-tight">Pembersihan Dokumen Lama</p>
                                      <p className="text-[9px] text-rose-500 font-medium mt-0.5 leading-relaxed">
                                         Hapus semua foto/PDF lampiran absensi untuk membebaskan ruang penyimpanan.
                                      </p>
                                   </div>
                                </div>
                                <button 
                                  onClick={handleManualCleanup}
                                  className="w-full py-3 bg-rose-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 active:scale-[0.98]"
                                >
                                   <Trash2 size={14} />
                                   KOSONGKAN PENYIMPANAN SEKARANG
                                </button>
                             </div>
                          </div>
                       </div>
                    </div>

                    <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-rose-50">
                       <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                          <Database size={20} />
                       </div>
                       <div>
                         <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Pencadangan Database</h3>
                         <p className="text-[9px] font-bold text-rose-400 uppercase tracking-widest mt-0.5">Cadangkan seluruh data Firestore ke format JSON</p>
                       </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-5 mb-5">
                      <div className="bg-white p-5 rounded-3xl border border-gray-100 hover:border-indigo-200 transition-all group md:col-span-2">
                         <div className="flex items-start gap-3 mb-3">
                            <div className="p-2 bg-indigo-50 text-indigo-500 rounded-xl group-hover:bg-indigo-100 transition-colors">
                               <RefreshCw size={24} />
                            </div>
                            <div>
                               <h4 className="text-sm font-extrabold text-gray-900 uppercase tracking-tight">Migrasi Data Lama ke SMPN2</h4>
                               <p className="text-[9px] font-bold text-gray-400 leading-relaxed uppercase mt-0.5">Gunakan tombol ini jika Anda adalah pengguna lama dan ingin memindahkan data Anda (siswa, guru, absen, dll) ke dalam tenant SMPN2 agar bisa dilihat kembali.</p>
                            </div>
                         </div>
                         <button 
                           onClick={async () => {
                             if (!window.confirm("Yakin ingin memigrasi data dari root ke SMPN2? Proses ini bisa memakan waktu beberapa menit.")) return;
                             setLoading(true);
                             setMigrationStatus('Memulai migrasi...');
                             try {
                               const collectionsToMigrate = ['students', 'teachers', 'classes', 'attendance', 'notifications', 'schoolData', 'schoolPresence', 'academicYears', 'schoolConfig', 'subjectAttendance', 'subjectInquiries', 'counselors'];
                               const { collection, getDocs, doc, setDoc } = await import('firebase/firestore');
                               
                               // Pastikan dokumen sekolah SMPN2 ada
                               setMigrationStatus('Menyiapkan profil sekolah SMPN2...');
                               await setDoc(doc(db, 'schools', 'SMPN2'), {
                                 id: 'SMPN2',
                                 name: 'SMP Negeri 2',
                                 type: 'SCHOOL_CODE',
                                 description: 'Hasil Migrasi Data Lama'
                               }, { merge: true });

                               for (const coll of collectionsToMigrate) {
                                  setMigrationStatus(`Memigrasi data ${coll}...`);
                                  const oldSnap = await getDocs(collection(db, coll)).catch(e => { console.error(e); return {docs:[]}; });
                                  for (const d of oldSnap.docs) {
                                     await setDoc(doc(db, 'schools', 'SMPN2', coll, d.id), d.data(), { merge: true });
                                  }
                               }
                               setMigrationStatus('Selesai!');
                               alert('Migrasi data ke SMPN2 berhasil! Silahkan refresh halaman.');
                             } catch (e: any) {
                               alert('Error migrasi: ' + e.message);
                             } finally {
                               setLoading(false);
                               setMigrationStatus('');
                             }
                           }}
                           disabled={loading}
                           className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-75 disabled:cursor-wait"
                         >
                           {migrationStatus ? (
                             <>
                               <RefreshCw className="animate-spin" size={16} />
                               {migrationStatus}
                             </>
                           ) : (
                             'MULAI MIGRASI DATA'
                           )}
                         </button>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-5">
                      <div className="bg-white p-5 rounded-3xl border border-gray-100 hover:border-rose-200 transition-all group">
                         <div className="flex items-start gap-3 mb-3">
                            <div className="p-2 bg-rose-50 text-rose-500 rounded-xl group-hover:bg-rose-100 transition-colors">
                               <Database size={24} />
                            </div>
                            <div>
                               <h4 className="text-sm font-extrabold text-gray-900 uppercase tracking-tight">Backup Data Keseluruhan</h4>
                               <p className="text-[9px] font-bold text-gray-400 leading-relaxed uppercase mt-0.5">Unduh database (Siswa, Guru, Absensi, dll) dalam format JSON untuk cadangan lokal.</p>
                            </div>
                         </div>
                         <button 
                           onClick={backupData}
                           className="w-full py-3 bg-rose-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-xl shadow-rose-100 hover:bg-rose-700 transition-all active:scale-[0.98]"
                         >
                           <Download size={16} />
                           BACK UP DATA SEKARANG
                         </button>
                         <p className="text-[8px] font-black text-center text-gray-300 uppercase tracking-[0.2em] mt-3 italic">Disarankan backup mingguan</p>
                      </div>

                      <div className="bg-gray-50/50 p-5 rounded-3xl border border-dashed border-gray-200 flex flex-col items-center justify-center text-center">
                         <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-rose-500 mb-2.5 border border-rose-100 shadow-sm hover:bg-rose-50 transition-all cursor-pointer">
                            <CloudUpload size={20} />
                         </button>
                         <input type="file" ref={fileInputRef} onChange={restoreData} accept=".json" className="hidden" />
                         <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Restorasi Data</h4>
                         <p className="text-[8px] font-bold text-gray-300 uppercase tracking-tighter mt-1 px-4 leading-relaxed">Klik untuk memilih file backup JSON.</p>
                      </div>
                    </div>
                 </div>
               )}

               {settingsSubTab === ('schools' as any) && isSuperAdmin && (
                  <div className="pt-6 border-t border-gray-100">
                     <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-indigo-50">
                       <div className="flex items-center gap-3">
                         <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
                            <School size={24} />
                         </div>
                         <div>
                           <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Manajemen Kode Sekolah</h3>
                           <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5">Kelola Akses dan Kode Unik Sekolah</p>
                         </div>
                       </div>
                       <button 
                         onClick={() => { setFormData({ type: 'SCHOOL_CODE', isNew: true }); setShowAddModal(true); }}
                         className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 text-[11px] font-black uppercase tracking-widest"
                       >
                         <Plus size={18} />
                         Tambah Sekolah
                       </button>
                     </div>
                     
                     <div className="overflow-x-auto rounded-3xl border border-gray-100 bg-white">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-gray-50 text-gray-500 uppercase font-black tracking-widest">
                            <tr>
                              <th className="px-6 py-4">Kode Sekolah</th>
                              <th className="px-6 py-4">Nama Sekolah</th>
                              <th className="px-6 py-4">Admin Email</th>
                              <th className="px-6 py-4">Keterangan</th>
                              <th className="px-6 py-4 text-center">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                              {registeredSchools.map((s, idx) => (
                                <tr key={s.id || `school-${idx}`} className="hover:bg-gray-50 transition-all">
                                  <td className="px-6 py-4 font-mono font-bold text-indigo-600">{s.id}</td>
                                  <td className="px-6 py-4 font-black uppercase text-gray-900">{s.name}</td>
                                  <td className="px-6 py-4 font-mono text-gray-600">{s.adminEmail || '-'}</td>
                                  <td className="px-6 py-4 font-mono text-gray-600">{s.description || '-'}</td>
                                  <td className="px-6 py-4 flex items-center justify-center gap-2">
                                     <button 
                                      onClick={() => { setFormData({ ...s, type: 'SCHOOL_CODE', isNew: false }); setShowAddModal(true); }}
                                      className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                    >
                                      <Edit size={16} />
                                    </button>
                                    <button 
                                      onClick={() => handleDelete(s.id, 'schools')}
                                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                  </div>
               )}
            </div>
          )}

          {activeTab === 'rekap' && (
            <AttendanceRecapTable 
              students={displayStudents} 
              attendance={displayAttendance} 
              classes={displayClasses}
              showClassFilter={true}
            />
          )}

          {activeTab === 'rekapSemester' && (
            <SemesterAttendanceRecapTable
              students={displayStudents}
              attendance={displayAttendance}
              classes={displayClasses}
              showClassFilter={true}
            />
          )}

          {activeTab === 'attendance-individual' && (
            <IndividualAttendance
              students={displayStudents}
              attendance={displayAttendance}
              classes={displayClasses}
              onAttendanceChange={fetchData}
            />
          )}

          {activeTab === 'weekly-recap' && (
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
               <WeeklyAttendanceRecap 
                 attendance={displayAttendance} 
                 students={displayStudents} 
               />
            </div>
          )}

          {activeTab === 'academic-years' && (
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-sky-50">
                      <div className="p-2.5 bg-sky-100 text-sky-600 rounded-xl">
                         <CalendarIcon size={24} />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Tahun Akademik</h3>
                        <p className="text-[10px] font-bold text-sky-400 uppercase tracking-widest mt-0.5">Kelola Periode Pembelajaran Aktif</p>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                       {academicYears.map((y, idx) => (
                         <div key={y.id || `academic-year-${idx}`} className={cn("p-4 rounded-xl border transition-all duration-300 flex flex-col gap-3 relative overflow-hidden", y.active ? "bg-white border-sky-200 shadow-lg shadow-sky-100/50 ring-1 ring-sky-500/10" : "bg-white border-gray-100 hover:border-sky-200 hover:shadow-md hover:shadow-sky-100/30")}>
                            {y.active && (
                              <div className="absolute top-0 right-0 p-1 bg-sky-600 text-white rounded-bl-xl">
                                <CheckCircle2 size={12} />
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <div>
                                 <p className={cn("text-base font-black uppercase tracking-tight", y.active ? "text-sky-900 font-black" : "text-gray-700")}>{y.year}</p>
                                 <div className="flex items-center gap-1.5 mt-1">
                                    <div className={cn("w-1 h-1 rounded-full", y.active ? "bg-green-500 animate-pulse" : "bg-gray-300")} />
                                    <p className={cn("text-[8px] font-black uppercase tracking-widest", y.active ? "text-green-600" : "text-gray-400")}>
                                      {y.active ? 'AKTIF' : 'NON-AKTIF'}
                                    </p>
                                 </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {!y.active && (
                                  <button 
                                    onClick={async () => {
                                      try {
                                        setStatusMessage(`Sedang mengaktifkan ${y.year}...`);
                                        const activeYears = academicYears.filter(ay => ay.active);
                                        for (const ay of activeYears) {
                                          await updateDoc(getTenantDoc('academicYears', ay.id), { active: false });
                                        }
                                        await updateDoc(getTenantDoc('academicYears', y.id), { active: true });
                                        await fetchData();
                                        setStatusMessage("Tahun akademik berhasil diaktifkan.");
                                        setTimeout(() => setStatusMessage(''), 3000);
                                      } catch (err: any) {
                                        console.error(err);
                                        setStatusMessage("Gagal mengaktifkan tahun akademik.");
                                        setTimeout(() => setStatusMessage(''), 5000);
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-sky-600 text-white text-[9px] font-black rounded-lg shadow-lg shadow-sky-100 hover:bg-sky-700 transition-all active:scale-95 uppercase tracking-widest"
                                  >
                                     AKTIFKAN
                                  </button>
                                )}
                                <button 
                                  onClick={() => handleDelete(y.id!, 'academicYears')}
                                  className={cn(
                                    "p-1.5 rounded-lg transition-all",
                                    y.active ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:text-red-600 hover:bg-red-50 hover:shadow-inner"
                                  )}
                                  disabled={y.active}
                                  title={y.active ? "Tahun aktif tidak bisa dihapus" : "Hapus tahun akademik"}
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                         </div>
                       ))}
                       <button 
                        onClick={() => { 
                    if (activeTab === 'attendance-detail') {
                      setFormData({ 
                        date: new Date().toISOString().split('T')[0],
                        type: 'Sakit',
                        status: 'Approved'
                      });
                      setErrors({});
                      setAttendanceFormStudentSearch('');
                    } else {
                      setFormData({});
                    }
                    setShowAddModal(true); 
                  }}
                        className="p-6 rounded-3xl border-2 border-dashed border-sky-100 flex flex-col items-center justify-center text-sky-300 hover:bg-sky-50/50 hover:border-sky-300 hover:text-sky-400 transition-all min-h-[70px] group"
                       >
                          <Plus size={24} className="group-hover:scale-110 transition-transform" />
                          <span className="text-[10px] font-black uppercase tracking-widest mt-2">Tambah Periode</span>
                       </button>
                    </div>
                 </div>
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
                  <table className="w-full text-left border-collapse min-w-[800px] border border-gray-100 shadow-sm">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-100 uppercase text-[10px] sm:text-xs font-black tracking-widest text-gray-500">
                        <th className="px-6 py-4">Kategori Kelas</th>
                        <th className="px-6 py-4 text-center">Total Siswa</th>
                        <th className="px-6 py-4 text-center text-emerald-700">Hadir</th>
                        <th className="px-6 py-4 text-center text-red-700">Sakit</th>
                        <th className="px-6 py-4 text-center text-yellow-700">Izin</th>
                        <th className="px-6 py-4 text-center text-purple-700">Dispensasi</th>
                        <th className="px-6 py-4 text-center text-gray-700">Alpa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/80">
                      {paginatedSummary.map((data, idx) => (
                        <tr key={`summary-${data.className}-${idx}`} className="group hover:bg-gray-50/80 bg-white transition-all duration-200 text-sm">
                          <td className="px-6 py-4">
                              <span className="px-2.5 py-1 bg-gray-100/80 text-gray-700 rounded-lg text-xs font-bold uppercase tracking-wider border border-gray-200/50">
                                  {data.className}
                              </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-gray-600 text-center tabular-nums">{data.total}</td>
                          <td className="px-6 py-4 font-black text-emerald-600 text-center tabular-nums">{data.hadir}</td>
                          <td className="px-6 py-4 font-black text-red-600 text-center tabular-nums">{data.sakit}</td>
                          <td className="px-6 py-4 font-black text-yellow-600 text-center tabular-nums">{data.izin}</td>
                          <td className="px-6 py-4 font-black text-purple-600 text-center tabular-nums">{data.dispensasi}</td>
                          <td className="px-6 py-4 font-black text-gray-500 text-center tabular-nums">{data.alpa}</td>
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
                  <table className="w-full text-left border-collapse min-w-[1000px] border border-gray-100 shadow-sm">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-100 uppercase text-[10px] sm:text-xs font-black tracking-widest text-gray-500">
                        <th className="px-6 py-4">Peserta Didik</th>
                        <th className="px-6 py-4">Tanggal & Masuk</th>
                        <th className="px-6 py-4 text-center">Jenis & Alasan</th>
                        <th className="px-6 py-4">Informasi Orang Tua</th>
                        <th className="px-6 py-4 text-center">Dokumen</th>
                        <th className="px-6 py-4 text-center">Koordinat</th>
                        <th className="px-6 py-4 text-center">Status</th>
                        <th className="px-6 py-4 text-center">Aksi</th>
                      </tr>
                    </thead>
              <tbody className="divide-y divide-gray-100/80">
                {paginatedAttendanceDetail.length > 0 ? (
                  paginatedAttendanceDetail.map((a, idx) => (
                    <tr key={`attendance-row-${a.id}-${idx}`} className="group hover:bg-gray-50/80 bg-white transition-all duration-200">
                      <td className="px-6 py-4">
                         <p className="font-bold text-gray-900 text-sm group-hover:text-indigo-600 transition-colors">{a.studentName}</p>
                         <p className="text-[10px] font-black text-blue-600 uppercase mt-0.5 tracking-widest">{a.className}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-gray-700">
                          {a.date ? formatDate(new Date(a.date)) : '-'}
                        </p>
                        <p className="text-[10px] text-gray-500 font-bold mt-0.5">
                          {a.submittedAt ? (a.submittedAt.toDate ? a.submittedAt.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-') : '-'} PST
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className={cn(
                            "px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ring-1 shadow-sm w-fit",
                            a.type === 'Sakit' ? "bg-red-50 text-red-600 ring-red-400/20" :
                            a.type === 'Izin' ? "bg-yellow-50 text-yellow-600 ring-yellow-400/20" : 
                            a.type === 'Alpa' ? "bg-gray-50 text-gray-600 ring-gray-400/20" : "bg-purple-50 text-purple-600 ring-purple-400/20"
                          )}>
                            {a.type}
                          </span>
                          <p className="text-[10px] text-gray-400 italic max-w-[150px] truncate text-center" title={a.reason}>"{a.reason || 'Tidak ada alasan'}"</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                         <p className="font-bold text-gray-800 text-xs">{a.parentName}</p>
                         <p className="text-[10px] text-emerald-600 font-black mt-0.5">{a.parentPhone}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {a.documentUrl ? (
                           <div className="flex flex-col gap-1 items-center justify-center">
                             <button 
                               onClick={() => window.open(a.documentUrl, '_blank')}
                               className="w-full px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-bold ring-1 ring-blue-500/20 hover:bg-blue-100 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap"
                             >
                               <FileText size={12} strokeWidth={2.5} /> LIHAT
                             </button>
                           </div>
                         ) : (
                           <span className="text-[10px] text-gray-300 font-bold italic tracking-widest">KOSONG</span>
                         )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {a.location ? (
                          <div className="flex justify-center">
                            <a href={`https://www.google.com/maps?q=${a.location.latitude},${a.location.longitude}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] font-bold bg-amber-50 text-amber-600 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 transition-all ring-1 ring-amber-500/20 whitespace-nowrap">
                               <MapPin size={12} strokeWidth={2.5} /> BUKA PETA
                            </a>
                          </div>
                        ) : <span className="text-[10px] text-gray-300 font-bold italic tracking-widest text-center block">KOSONG</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className={cn(
                            "px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm ring-1",
                            a.status === 'Approved' ? "bg-emerald-50 text-emerald-600 ring-emerald-500/20" : 
                            a.status === 'Rejected' ? "bg-red-50 text-red-600 ring-red-500/20" : 
                            "bg-amber-50 text-amber-600 ring-amber-500/20 animate-pulse"
                          )}>
                            {a.status === 'Approved' ? 'DITERIMA' : a.status === 'Rejected' ? 'DITOLAK' : 'PENDING'}
                          </span>
                          {a.statusReason && (
                             <p className="text-[10px] text-gray-400 italic max-w-[100px] truncate text-center" title={a.statusReason}>{a.statusReason}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                         <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center justify-center gap-2">
                              {a.status === 'Pending' && (
                                <>
                                  <button 
                                    onClick={() => handleStatusUpdate(a.id, 'Approved')}
                                    className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 ring-1 ring-emerald-500/20 transition-all"
                                    title="Terima"
                                  >
                                    <CheckCircle2 size={16} strokeWidth={2.5} />
                                  </button>
                                  <button 
                                    onClick={() => handleStatusUpdate(a.id, 'Rejected')}
                                    className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 ring-1 ring-red-500/20 transition-all"
                                    title="Tolak"
                                  >
                                    <XCircle size={16} strokeWidth={2.5} />
                                  </button>
                                </>
                              )}
                              <button 
                                onClick={() => handleDelete(a.id, 'attendance')}
                                className="p-1.5 bg-gray-50 text-red-500 rounded-lg hover:bg-red-50 ring-1 ring-gray-200 hover:ring-red-500/30 hover:text-red-600 transition-all"
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
                                className="px-3 py-1 bg-indigo-600 text-white rounded text-[9px] font-bold flex items-center justify-center gap-1.5 hover:bg-indigo-700 transition-all w-full leading-none tracking-widest whitespace-nowrap"
                              >
                                <Download size={10} strokeWidth={3} /> UNDUH DOKUMEN
                              </button>
                            )}
                         </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400 font-medium italic bg-gray-50/50">
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
                    <option key={`${cl.id || `print-class-${cl.name}`}-${idx}`} value={cl.name}>{cl.name}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={() => {
                  if (!printClass) return;
                  printLoginCards(printClass, 'SISWA');
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

      {/* Print Parent Login Cards Modal */}
      {showParentPrintModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="p-6 bg-orange-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">Cetak Kartu Login Wali</h3>
              <button onClick={() => setShowParentPrintModal(false)}><X size={24} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Pilih kelas untuk mengunduh PDF kartu login orang tua/wali. Kartu ini berisi NIS yang digunakan sebagai username untuk memantau absensi siswa.
              </p>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Pilih Kelas</label>
                <select 
                  className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:border-orange-500 text-sm"
                  value={parentPrintClass}
                  onChange={(e) => setParentPrintClass(e.target.value)}
                >
                  <option value="">-- Pilih Kelas --</option>
                  {classes.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, {numeric: true})).map((cl, idx) => (
                    <option key={`${cl.id || `parent-print-class-${cl.name}`}-${idx}`} value={cl.name}>{cl.name}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={() => {
                  if (!parentPrintClass) return;
                  printLoginCards(parentPrintClass, 'ORTU');
                  setShowParentPrintModal(false);
                }}
                disabled={!parentPrintClass}
                className="w-full py-3 bg-orange-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-orange-700 transition-all disabled:opacity-50"
              >
                Unduh PDF Kartu Login Wali
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
                    {formData.id ? 'Edit' : 'Atur Tampilan'} {
                      activeTab === 'academic-years' ? 'Tahun Akademik' :
                      activeTab === 'settings' ? (settingsSubTab === 'schools' ? 'Sekolah' : 'Pengaturan') :
                      activeTab === 'classes' ? 'Kelas' :
                      activeTab.slice(0, -1)
                    }
                 </h3>
                 <button onClick={() => setShowAddModal(false)}><X size={24} /></button>
              </div>
              <form onSubmit={handleAdd} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                 {activeTab === 'attendance-detail' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Cari Siswa</label>
                          <div className="relative">
                            <Search className="absolute left-3 top-3 text-gray-400" size={14} />
                            <input 
                              type="text"
                              placeholder="Ketik nama atau NIS..."
                              className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                              value={attendanceFormStudentSearch}
                              onChange={e => setAttendanceFormStudentSearch(e.target.value)}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Pilih Siswa</label>
                          <select 
                            className={cn(
                              "w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all",
                              errors.studentId ? "border-red-300 ring-1 ring-red-300" : "border-gray-100"
                            )}
                            value={formData.studentId || ''}
                            onChange={e => {
                              setFormData({...formData, studentId: e.target.value});
                              if (errors.studentId) setErrors(prev => ({ ...prev, studentId: '' }));
                            }}
                          >
                            <option value="">Pilih Siswa</option>
                            {students
                              .filter(s => 
                                (s.name || '').toLowerCase().includes(attendanceFormStudentSearch.toLowerCase()) || 
                                (s.nis || '').includes(attendanceFormStudentSearch)
                              )
                              .sort((a,b) => (a.name || '').localeCompare(b.name || ''))
                              .map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.className})</option>
                              ))
                            }
                          </select>
                          {errors.studentId && <p className="mt-1 text-[10px] font-bold text-red-500 uppercase tracking-wider">{errors.studentId}</p>}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Tanggal</label>
                          <input 
                            type="date"
                            value={formData.date || ''}
                            onChange={e => {
                              setFormData({...formData, date: e.target.value});
                              if (errors.date) setErrors(prev => ({ ...prev, date: '' }));
                            }}
                            className={cn(
                              "w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all",
                              errors.date ? "border-red-300 ring-1 ring-red-300" : "border-gray-100"
                            )}
                          />
                          {errors.date && <p className="mt-1 text-[10px] font-bold text-red-500 uppercase tracking-wider">{errors.date}</p>}
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Jenis</label>
                          <select 
                            value={formData.type || ''}
                            onChange={e => {
                              setFormData({...formData, type: e.target.value});
                              if (errors.type) setErrors(prev => ({ ...prev, type: '' }));
                            }}
                            className={cn(
                              "w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all",
                              errors.type ? "border-red-300 ring-1 ring-red-300" : "border-gray-100"
                            )}
                          >
                            <option value="Sakit">Sakit</option>
                            <option value="Izin">Izin</option>
                            <option value="Dispensasi">Dispensasi</option>
                            <option value="Alpa">Alpa</option>
                          </select>
                          {errors.type && <p className="mt-1 text-[10px] font-bold text-red-500 uppercase tracking-wider">{errors.type}</p>}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Alasan / Keterangan</label>
                        <textarea 
                          rows={3}
                          placeholder="Contoh: Mengikuti lomba musik tingkat nasional..."
                          className={cn(
                            "w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none resize-none transition-all",
                            errors.reason ? "border-red-300 ring-1 ring-red-300" : "border-gray-100"
                          )}
                          value={formData.reason || ''}
                          onChange={e => {
                            setFormData({...formData, reason: e.target.value});
                            if (errors.reason) setErrors(prev => ({ ...prev, reason: '' }));
                          }}
                        />
                        {errors.reason && <p className="mt-1 text-[10px] font-bold text-red-500 uppercase tracking-wider">{errors.reason}</p>}
                      </div>
                    </div>
                 )}
                 {activeTab !== 'attendance-detail' && (
                  <>
                 {(activeTab === 'academic-years' || (activeTab === 'settings' && settingsSubTab !== 'schools')) && (
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
                 {activeTab === 'settings' && settingsSubTab === 'schools' && (
                    <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Nama Sekolah</label>
                          <input 
                            type="text" 
                            placeholder="Contoh: SMP Negeri 1" 
                            required 
                            className="w-full p-3 border border-gray-200 rounded-xl focus:border-blue-500 outline-none" 
                            value={formData.name || ''}
                            onChange={e => setFormData({...formData, name: e.target.value})} 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Kode Sekolah</label>
                          <input 
                            type="text" 
                            placeholder="Contoh: SMPN1" 
                            required 
                            disabled={!formData.isNew && !!formData.id}
                            className="w-full p-3 border border-gray-200 rounded-xl focus:border-blue-500 outline-none" 
                            value={formData.id || ''}
                            onChange={e => setFormData({...formData, id: e.target.value})}
                            maxLength={20}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Admin Email</label>
                          <input 
                            type="email" 
                            placeholder="Contoh: admin@sekolah.sch.id" 
                            className="w-full p-3 border border-gray-200 rounded-xl focus:border-blue-500 outline-none" 
                            value={formData.adminEmail || ''}
                            onChange={e => setFormData({...formData, adminEmail: e.target.value})} 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Keterangan</label>
                          <input 
                            type="text" 
                            placeholder="Contoh: Sekolah unggulan" 
                            className="w-full p-3 border border-gray-200 rounded-xl focus:border-blue-500 outline-none" 
                            value={formData.description || ''}
                            onChange={e => setFormData({...formData, description: e.target.value})} 
                          />
                        </div>
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
                      <input type="text" placeholder="Nomor WhatsApp" className="w-full p-3 border border-gray-100 rounded-xl" value={formData.phoneNumber || ''} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} />
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Status (Centang semua yang sesuai)</label>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {['Kepala Sekolah', 'Waka', 'Wali Kelas', 'Guru Mapel', 'Guru BK', 'Lainnya'].map(s => (
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
                      <select 
                        required
                        className="w-full p-3 border border-gray-100 rounded-xl outline-none"
                        value={formData.name || ''}
                        onChange={e => {
                          const selectedClassNameInput = e.target.value;
                          const selectedClass = classes.find(c => c.name === selectedClassNameInput);
                          console.log("Class Selected:", selectedClassNameInput, "Found Class:", selectedClass);

                          setFormData({
                            ...formData, 
                            name: selectedClassNameInput,
                            waliKelasId: selectedClass?.waliKelasId || '',
                            color: selectedClass?.color || '',
                            icon: selectedClass?.icon || '',
                            id: selectedClass?.id || formData.id
                          });
                        }}
                      >
                         <option value="">-- Pilih Kelas --</option>
                         {classes.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, {numeric: true})).map((cl, idx) => <option key={`class-select-${cl.id || idx}`} value={cl.name}>{cl.name}</option>)}
                      </select>
                      <select 
                        className="w-full p-3 border border-gray-100 rounded-xl outline-none"
                        value={formData.waliKelasId || ''}
                        onChange={e => setFormData({...formData, waliKelasId: e.target.value})}
                      >
                         <option value="">-- Pilih Wali Kelas --</option>
                         {teachers.map((t, idx) => <option key={`teacher-${t.id || ''}-${idx}`} value={t.id}>{t.name}</option>)}
                      </select>
                      {formData.waliKelasId && (
                        <div className="text-xs font-bold text-blue-600 mt-1 pl-2">
                            Wali Kelas Terpilih: {teachers.find(t => t.id === formData.waliKelasId)?.name || 'Tidak Ditemukan'}
                        </div>
                      )}
                      <select 
                        className="w-full p-3 border border-gray-100 rounded-xl outline-none"
                        value={formData.color || ''}
                        onChange={e => setFormData({...formData, color: e.target.value})}
                      >
                         <option value="">-- Pilih Warna --</option>
                         {CLASS_COLORS.map(c => <option key={c} value={c}>{c.replace('text-', '')}</option>)}
                      </select>
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
                              {classes.sort((a,b) => (a.name || '').localeCompare(b.name || '', undefined, {numeric: true})).map((cl, i) => <option key={`${cl.id || 'class'}-${i}`} value={cl.name}>{cl.name}</option>)}
                            </select>
                          </div>
                        )}
                        <div 
                          onClick={() => {
                            const s = formData.status || [];
                            setFormData({...formData, status: s.includes('Guru Mapel') ? s.filter((x:any) => x !== 'Guru Mapel') : [...s, 'Guru Mapel']});
                          }}
                          className={cn("p-4 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-all", formData.status?.includes('Guru Mapel') ? "border-blue-600 bg-blue-50" : "border-gray-100 bg-white")}
                        >
                          <span className="text-sm font-bold">Guru Mapel</span>
                          {formData.status?.includes('Guru Mapel') && <CheckCircle2 size={18} className="text-blue-600" />}
                        </div>
                        {formData.status?.includes('Guru Mapel') && (
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
                    {loading ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : (
                      <Save size={18} />
                    )}
                    {formData.id ? 'Simpan Perubahan' : (activeTab === 'attendance-detail' ? 'Simpan Kehadiran' : 'Tambah Data')}
                 </button>
                </>
              )}
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
                <div className="w-1 h-1 bg-blue-500 rounded-full animate-ping"></div>
                DATABASE CLOUD SEDANG DIPERBARUI
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirm Dialog */}
      {/* Student Detail Modal */}
      {showStudentDetailModal && selectedStudentForDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
          >
            <div className="p-6 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">Riwayat Absensi: {selectedStudentForDetail.name}</h3>
              <button onClick={() => setShowStudentDetailModal(false)} className="hover:bg-white/20 p-2 rounded-lg transition-colors text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="space-y-4">
                {studentAttendanceHistory.length > 0 ? (
                  studentAttendanceHistory.map((att, idx) => (
                    <div key={`std-detail-att-${att.id || idx}-${idx}`} className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-gray-900">{formatDate(new Date(att.date))}</p>
                        <p className="text-sm text-gray-500">{att.reason}</p>
                      </div>
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold uppercase",
                        att.type === 'Sakit' ? "bg-amber-100 text-amber-600" :
                        att.type === 'Izin' ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"
                      )}>
                        {att.type}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-gray-500 py-10">Belum ada riwayat absensi.</p>
                )}
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
