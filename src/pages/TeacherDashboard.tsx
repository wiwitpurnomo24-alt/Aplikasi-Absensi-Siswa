import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users,
  Plus,
  Calendar as CalendarIcon, 
  CheckCircle2, 
  XCircle, 
  FileDown, 
  Filter,
  Search,
  MoreVertical,
  Download,
  AlertCircle,
  MessageCircle,
  X,
  Bell,
  BellRing,
  Clock,
  FileText,
  Share2,
  Copy,
  ExternalLink,
  Trash2,
  MapPin,
  RefreshCw,
  LayoutGrid
} from 'lucide-react';
import { db, auth, handleFirestoreError, storage } from '../lib/firebase';
import { checkAttendanceAlert } from '../services/attendanceNotificationService';
import { collection, query, where, getDocs, getDoc, updateDoc, doc, orderBy, addDoc, Timestamp, onSnapshot, serverTimestamp, deleteDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { cn, formatDate, getTimeSafe } from '../lib/utils';
import { AttendanceRecord, Student } from '../types';
import { useAuthStore } from '../lib/auth-store';
import { useSearchParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { parseWhatsAppMessage } from '../lib/whatsapp-parser';
import AttendanceRecapTable from '../components/AttendanceRecapTable';
import SemesterAttendanceRecapTable from '../components/SemesterAttendanceRecapTable';
import AttendanceWeekCalendar from '../components/AttendanceWeekCalendar';
import ActiveAcademicYearDisplay from '../components/ActiveAcademicYearDisplay';
import SimpleNotification from '../components/SimpleNotification';
import IndividualAttendance from '../components/IndividualAttendance';
import AttendanceAlertsDisplay from '../components/AttendanceAlertsDisplay';
import WeeklyAttendanceRecap from '../components/WeeklyAttendanceRecap';
import { getTenantCollection, getTenantDoc, getSchoolCode } from '../lib/tenant';

export default function TeacherDashboard() {
  const { user, login } = useAuthStore();
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  
  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, onConfirm: () => void}>({isOpen: false, message: '', onConfirm: () => {}});
  const showConfirm = (message: string, onConfirm: () => void) => setConfirmDialog({isOpen: true, message, onConfirm});

  const [filterType, setFilterType] = useState('All');
  const [filterDate, setFilterDate] = useState('');
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterSemester, setFilterSemester] = useState('1');
  const [searchQuery, setSearchQuery] = useState('');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [className, setClassName] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showStudentTemplateModal, setShowStudentTemplateModal] = useState(false);
  const [waText, setWaText] = useState('');
  const [parsedWAData, setParsedWAData] = useState<any>(null);
  const [recentAttendance, setRecentAttendance] = useState<AttendanceRecord[]>([]);
  const [subjectInquiries, setSubjectInquiries] = useState<any[]>([]);
  const [showInquiryModal, setShowInquiryModal] = useState(false);
  const [showSendInquiryModal, setShowSendInquiryModal] = useState(false);
  const [sendInquiryData, setSendInquiryData] = useState({ studentName: '', className: '', message: '', jamKe: '' });
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);
  const [inquiryResponse, setInquiryResponse] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [addFormData, setAddFormData] = useState<any>({ isRange: false });
  const [addStudentFormData, setAddStudentFormData] = useState({ name: '', nis: '', nisn: '', gender: 'L' });
  const [allClasses, setAllClasses] = useState<{id: string, name: string}[]>([]);
  const [addFormClass, setAddFormClass] = useState('');
  const [manualStudents, setManualStudents] = useState<Student[]>([]);
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<Student | null>(null);
  const [studentAttendanceHistory, setStudentAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [showStudentDetailModal, setShowStudentDetailModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addFormStudentSearch, setAddFormStudentSearch] = useState('');

  const compressImage = async (file: File | Blob, fileName: string): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          const maxDimension = 1600;
          if (width > height) {
            if (width > maxDimension) {
              height *= maxDimension / width;
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width *= maxDimension / height;
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          let quality = 0.8;
          const targetSize = 500 * 1024;

          const attemptCompression = (q: number) => {
            canvas.toBlob((blob) => {
              if (blob) {
                if (blob.size > targetSize && q > 0.1) {
                  attemptCompression(q - 0.1);
                } else {
                  resolve(new File([blob], fileName, { type: 'image/jpeg', lastModified: Date.now() }));
                }
              } else {
                reject(new Error('Gagal memproses gambar'));
              }
            }, 'image/jpeg', q);
          };

          attemptCompression(quality);
        };
        img.onerror = () => reject(new Error('Gagal memuat gambar'));
      };
      reader.onerror = () => reject(new Error('Gagal membaca file'));
    });
  };

  const printLoginCards = async () => {
    if (students.length === 0) {
      alert('Tidak ada siswa di kelas ini.');
      return;
    }

    setLoading(true);
    setStatusMessage('Sedang menyiapkan kartu login siswa...');
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const cardWidth = 90;
      const cardHeight = 55;
      const margin = 10;
      const cardsPerRow = 2;
      const cardsPerCol = 5;
      const xSpacing = (210 - (cardWidth * cardsPerRow) - (margin * 2)) / (cardsPerRow - 1 || 1);
      const ySpacing = (297 - (cardHeight * cardsPerCol) - (margin * 2)) / (cardsPerCol - 1 || 1);

      students.forEach((s, index) => {
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

      doc.save(`Kartu_Login_Kelas_${className}.pdf`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      alert('Gagal mencetak kartu login: ' + (err.message || 'Error tidak diketahui'));
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const fetchClassData = async () => {
    if (!user) {
      setLoading(false);
      setStatusMessage('Data pengguna tidak ditemukan.');
      return;
    }
    
    let effectiveClassName = user.className;
    
    setLoading(true);
    setStatusMessage('Memvalidasi data kelas wali...');
    
    try {
      // 1. Prioritize official 'classes' collection explicitly assigned by Admin
      const classQ = query(getTenantCollection('classes'), where('waliKelasId', '==', user.uid));
      const classSnap = await getDocs(classQ);
      if (!classSnap.empty) {
        effectiveClassName = classSnap.docs[0].data().name;
      } else {
        // 2. Fallback to teacher profile
        const teacherDoc = await getDoc(getTenantDoc('teachers', user.uid));
        if (teacherDoc.exists()) {
          const tData = teacherDoc.data();
          if (tData.className && tData.className !== '') {
             effectiveClassName = tData.className;
          }
        }
      }
    } catch(err) {
      console.warn("Failed to refresh teacher class binding", err);
    }

    if (!effectiveClassName) {
      setLoading(false);
      setStatusMessage('Kelas Anda belum diatur di profil Anda. Hubungi Administrator.');
      return;
    }
    
    // Update global user object if class designation changed
    if (user.className !== effectiveClassName) {
       login({ ...user, className: effectiveClassName });
    }

    setLoading(true);
    try {
      setClassName(effectiveClassName);

      // Fetch students first
      let stdSnapshot = await getDocs(query(getTenantCollection('students'), where('className', '==', effectiveClassName)));
      let stdData = stdSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      
      // Fallback: If no students found with exact className, fetch all and try manual matching
      if (stdData.length === 0) {
        const allStudentsSnap = await getDocs(getTenantCollection('students'));
        const allStudents = allStudentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
        const normalizedClassName = effectiveClassName.replace(/\s/g, '').toLowerCase();
        stdData = allStudents.filter(s => (s.className || '').replace(/\s/g, '').toLowerCase() === normalizedClassName);
        
        if (stdData.length > 0 && stdData[0].className) {
          effectiveClassName = stdData[0].className;
          setClassName(effectiveClassName);
        }
      }
      
      setStudents(stdData);

      // Fetch attendance
      let attData: AttendanceRecord[] = [];
      try {
        const attSnapshot = await getDocs(query(
          getTenantCollection('attendance'), 
          where('className', '==', effectiveClassName),
          orderBy('submittedAt', 'desc')
        ));
        attData = attSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      } catch (err) {
        console.warn("Attendance orderBy failed, fetching without orderBy:", err);
        const attSnapshot = await getDocs(query(getTenantCollection('attendance'), where('className', '==', effectiveClassName)));
        attData = attSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord))
          .sort((a, b) => getTimeSafe(b.submittedAt) - getTimeSafe(a.submittedAt));
      }
      setAttendance(attData);
      setRecentAttendance(attData.slice(0, 5));

      // Parallelize alert checks to prevent slow sequential loading
      Promise.all(students.map(s => 
        checkAttendanceAlert(s.id, s.name, effectiveClassName!)
      )).catch(err => console.error("Alert check failed:", err));

    } catch (err: any) {
      console.error("Firestore fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchClassData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const isInitialLoad = useRef(true);
  const [newAttendanceNotification, setNewAttendanceNotification] = useState<string | null>(null);
  const [newInquiryNotification, setNewInquiryNotification] = useState<string | null>(null);
  const [teacherNotifications, setTeacherNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (!className || !user) return;
    const q = query(
      getTenantCollection('notifications'),
      where('targetRole', '==', 'TEACHER'),
      where('className', '==', className),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTeacherNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [className, user]);

  useEffect(() => {
    if (!className || !user) return;

    const q = query(
      getTenantCollection('attendance'),
      where('className', '==', className),
      orderBy('submittedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const newItem = { id: change.doc.id, ...change.doc.data() } as AttendanceRecord;
          setNewAttendanceNotification(`Data absensi baru untuk ${newItem.studentName} (${newItem.className}): ${newItem.type} - ${newItem.reason}`);
          fetchClassData();
        }
      });
    }, (err) => {
      handleFirestoreError(err, 'list', 'attendance snapshots');
    });
    return () => unsubscribe();
  }, [className]);

  useEffect(() => {
    if (!className) return;

    const q = query(
      getTenantCollection('subjectInquiries'),
      where('className', '==', className),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSubjectInquiries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      
      if (isInitialLoad.current) return;

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const newItem = change.doc.data();
          setNewInquiryNotification(`Ada pertanyaan baru dari ${newItem.subjectTeacherName} untuk ${newItem.studentName}: "${newItem.message}"`);
        }
      });
    }, (err) => {
      handleFirestoreError(err, 'list', 'inquiry snapshots');
    });
    return () => unsubscribe();
  }, [className]);

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
  console.log('DEBUG: activeTab is', activeTab);
  
  const [subjectAttendances, setSubjectAttendances] = useState<any[]>([]);

  useEffect(() => {
    if (!className || activeTab !== 'subject-attendance-report') return;
    const q = query(
      getTenantCollection('subjectAttendances'),
      where('className', '==', className)
    );
    getDocs(q).then(snapshot => {
      setSubjectAttendances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }).catch(console.error);
  }, [className, activeTab]);

  useEffect(() => {
    if (searchParams.get('showAddModal') === 'true') {
      setShowAddModal(true);
      if (className && !addFormClass) {
        setAddFormClass(className);
      }
    }
  }, [searchParams, className]);

  useEffect(() => {
    if (showAddModal) {
      const fetchClasses = async () => {
        try {
          const csSnap = await getDocs(getTenantCollection('classes'));
          setAllClasses(csSnap.docs.map(d => ({id: d.id, ...d.data()}) as any));
        } catch(e) {
          console.error(e);
        }
      };
      if (allClasses.length === 0) fetchClasses();
    }
  }, [showAddModal]);

  useEffect(() => {
    if (showAddModal && addFormClass) {
      const fetchStudents = async () => {
        try {
          const stdQ = query(getTenantCollection('students'), where('className', '==', addFormClass));
          const stdSnap = await getDocs(stdQ);
          setManualStudents(stdSnap.docs.map(d => ({id: d.id, ...d.data()}) as Student));
        } catch(e) {
          console.error(e);
        }
      };
      fetchStudents();
    } else {
      setManualStudents([]);
    }
  }, [showAddModal, addFormClass]);

  const today = new Intl.DateTimeFormat('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('/').reverse().join('-');
  const stats = {
    totalStudents: students.length,
    sakit: attendance.filter(a => a.type === 'Sakit').length,
    izin: attendance.filter(a => a.type === 'Izin').length,
    dispensasi: attendance.filter(a => a.type === 'Dispensasi').length,
    todaySakit: attendance.filter(a => a.type === 'Sakit' && a.date === today).length,
    todayIzin: attendance.filter(a => a.type === 'Izin' && a.date === today).length,
    todayDispensasi: attendance.filter(a => a.type === 'Dispensasi' && a.date === today).length,
  };

  const markNotificationAsRead = async (id: string) => {
    await updateDoc(getTenantDoc('notifications', id), { read: true });
  };

  useEffect(() => {
    if (waText.trim()) {
      const parsed = parseWhatsAppMessage(waText);
      if (parsed) {
        // Attempt to find matching student
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

    if (!parsedWAData.matchedStudent) {
      const confirmUnknown = window.confirm(`Siswa "${parsedWAData.studentName}" tidak ditemukan di data kelas. Tetap simpan? (Data tidak akan terhubung ke profil siswa)`);
      if (!confirmUnknown) return;
    }

    try {
      // Check for duplicate
      const studentId = parsedWAData.matchedStudent?.id || 'unknown';
      const q = query(
        getTenantCollection('attendance'), 
        where('studentId', '==', studentId),
        where('date', '==', parsedWAData.date)
      );
      const existing = await getDocs(q);
      
      if (!existing.empty) {
        const confirmDuplicate = window.confirm(`Sudah ada data absensi untuk ${parsedWAData.studentName} pada tanggal ${formatDate(new Date(parsedWAData.date))}. Timpa data?`);
        if (!confirmDuplicate) return;
        
        // Delete existing if overwriting
        for (const d of existing.docs) {
          await deleteDoc(getTenantDoc('attendance', d.id));
        }
      }

      const payload = {
        studentId: studentId,
        studentName: parsedWAData.matchedStudent?.name || parsedWAData.studentName,
        nis: parsedWAData.matchedStudent?.nis || parsedWAData.nis || '-',
        className: className,
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
        processedBy: user?.name || 'Teacher',
        processedById: user?.uid || null
      };

      await addDoc(getTenantCollection('attendance'), payload);
      setShowImportModal(false);
      setWaText('');
      setParsedWAData(null);
      fetchClassData();
      
      // Early Warning Check
      checkAttendanceAlert(payload.studentId, payload.studentName, payload.className).catch(console.error);
      
      alert(`Berhasil mengimpor data absensi untuk ${payload.studentName}!`);
    } catch (err: any) {
      handleFirestoreError(err, 'create', 'WhatsApp Import');
    }
  };

  const filteredManualStudents = useMemo(() => {
    return manualStudents.filter(s => 
      (s.name || '').toLowerCase().includes(addFormStudentSearch.toLowerCase()) ||
      (s.nis || '').includes(addFormStudentSearch)
    ).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [manualStudents, addFormStudentSearch]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    // Client-side validation
    const newErrors: Record<string, string> = {};
    if (!addFormData.date) newErrors.date = "Tanggal mulai harus diisi";
    if (addFormData.isRange && !addFormData.endDate) newErrors.endDate = "Tanggal selesai harus diisi";
    if (addFormData.isRange && addFormData.date && addFormData.endDate && addFormData.endDate < addFormData.date) {
      newErrors.endDate = "Tanggal selesai tidak boleh sebelum tanggal mulai";
    }
    if (!addFormData.studentId) newErrors.studentId = "Siswa harus dipilih";
    if (!addFormData.type) newErrors.type = "Jenis absensi harus dipilih";
    if (!addFormData.reason || addFormData.reason.trim().length < 5) {
      newErrors.reason = "Alasan harus diisi minimal 5 karakter";
    }
    if (!addFormClass) newErrors.className = "Kelas harus dipilih";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      let documentUrl = '';
      if (selectedFile) {
        const storageRef = ref(storage, `attendance/${Date.now()}_${selectedFile.name}`);
        const snapshot = await uploadBytes(storageRef, selectedFile);
        documentUrl = await getDownloadURL(snapshot.ref);
      }

      const dates = [];
      if (addFormData.isRange && addFormData.endDate) {
        let start = new Date(addFormData.date);
        let end = new Date(addFormData.endDate);
        let count = 0;
        const current = new Date(start);
        while (current <= end && count < 31) {
          dates.push(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
          count++;
        }
      } else {
        dates.push(addFormData.date);
      }

      const student = manualStudents.find(s => s.id === addFormData.studentId);
      
      for (const dateItem of dates) {
        const dateObj = new Date(dateItem);
        const dayName = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(dateObj);

        const payload = {
          studentId: addFormData.studentId,
          studentName: student?.name || '',
          nis: student?.nis || '',
          className: student?.className || addFormClass || className,
          date: dateItem,
          day: dayName,
          type: addFormData.type,
          reason: addFormData.reason,
          parentName: user?.name || 'Teacher (Manual Input)',
          parentPhone: '-',
          status: 'Approved',
          statusReason: '',
          documentUrl: documentUrl,
          documentName: selectedFile?.name || '',
          submittedAt: serverTimestamp(),
          processedBy: user?.name || 'Teacher',
          processedById: user?.uid || null
        };

        await addDoc(getTenantCollection('attendance'), payload);
        
        // Early Warning Check
        checkAttendanceAlert(payload.studentId, payload.studentName, payload.className).catch(console.error);
      }

      setShowAddModal(false);
      setSearchParams({tab: 'attendance'});
      setAddFormData({ isRange: false });
      setSelectedFile(null);
      
      fetchClassData();
      alert(`Berhasil menambahkan absensi untuk ${dates.length} hari.`);
    } catch (err: any) {
      handleFirestoreError(err, 'create', 'Manual Attendance');
    }
  };

  const handleSendInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendInquiryData.studentName || !sendInquiryData.message || !sendInquiryData.className || !sendInquiryData.jamKe) {
      alert("Harap lengkapi semua kolom!");
      return;
    }
    
    try {
      await addDoc(getTenantCollection('subjectInquiries'), {
        ...sendInquiryData,
        subjectName: (user as any)?.subject || 'Mata Pelajaran',
        subjectTeacherName: user?.name,
        status: 'Menunggu',
        createdAt: serverTimestamp(),
        replies: []
      });
      setShowSendInquiryModal(false);
      setSendInquiryData({ studentName: '', className: '', message: '', jamKe: '' });
      alert('Pertanyaan berhasil dikirim!');
    } catch (e: any) {
      handleFirestoreError(e, 'create', 'subjectInquiries');
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: 'Approved' | 'Rejected', studentId: string) => {
    let reason = '';
    if (newStatus === 'Rejected') {
      reason = prompt('Masukkan alasan penolakan:') || '';
      if (!reason) return; // Cancel if no reason provided
    }

    // Create notification
    try {
      await addDoc(getTenantCollection('notifications'), {
        studentId: studentId,
        targetRole: 'PARENT',
        title: newStatus === 'Approved' ? '✅ Izin Disetujui' : '❌ Izin Ditolak',
        message: newStatus === 'Approved' 
          ? `Pengajuan izin Anda telah disetujui oleh Wali Kelas.` 
          : `Pengajuan izin Anda ditolak oleh Wali Kelas. Alasan: ${reason}`,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error creating notification:", err);
    }

    try {
      await updateDoc(getTenantDoc('attendance', id), { 
        status: newStatus,
        statusReason: reason,
        processedAt: serverTimestamp(),
        processedBy: user?.name || 'Teacher'
      });

      // Send WhatsApp Notification to Parent
      const record = attendance.find(a => a.id === id);
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
      
      setAttendance(prev => prev.map(item => item.id === id ? { ...item, status: newStatus, statusReason: reason } : item));
      
      // Early Warning Check triggered on Approval
      if (newStatus === 'Approved') {
        const item = attendance.find(a => a.id === id);
        if (item) {
          checkAttendanceAlert(item.studentId, item.studentName, item.className).catch(console.error);
        }
      }
    } catch (error) {
      console.error(error);
      alert('Gagal mengupdate status.');
    }
  };

  const handleDeleteStudent = (id: string) => {
    if (!id) {
      alert('Error: ID tidak ditemukan.');
      return;
    }
    showConfirm('Apakah Anda yakin ingin menghapus data siswa ini?', async () => {
      setLoading(true);
      try {
        await deleteDoc(getTenantDoc('students', id));
        await fetchClassData();
        alert('Data siswa berhasil dihapus.');
      } catch (err) {
        console.error(err);
        handleFirestoreError(err, 'delete' as any, 'students');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleEditStudent = (s: Student) => {
    // Note: Teacher dashboard doesn't seem to have a student edit modal yet, 
    // but the button depends on it. For now, we'll alert or implement if modal exists.
    alert('Fasilitas edit data siswa hanya tersedia di dashboard Admin.');
  };

  const handleDeleteAttendance = (id: string) => {
    showConfirm('Apakah Anda yakin ingin menghapus absensi ini?', async () => {
      try {
        await deleteDoc(getTenantDoc('attendance', id));
        setAttendance(prev => prev.filter(item => item.id !== id));
        alert('Kehadiran berhasil dihapus.');
      } catch (error: any) {
        handleFirestoreError(error, 'delete', 'Attendance Record');
      }
    });
  };

  const filteredAttendance = attendance.filter(item => {
    const matchesFilter = filterType === 'All' || item.type === filterType;
    const matchesSearch = item.studentName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDate = !filterDate || item.date === filterDate;
    return matchesFilter && matchesSearch && matchesDate;
  });

  const getShareMessage = () => {
    const appLink = window.location.origin + '?role=PARENT';
    return `*PENGUMUMAN WALI MURID KELAS ${className}*\n\nAssalamu'alaikum Warahmatullahi Wabarakatuh Ayah/Bunda orang tua/wali murid kelas ${className}.\n\nUntuk mempermudah pelaporan ketidakhadiran putra/putri kita karena *Sakit, Izin, atau Dispensasi*, mohon gunakan aplikasi *SIADPV - SMPN 2 Magelang* melalui link berikut:\n\n🔗 ${appLink}\n\n*Cara Penggunaan:*\n1. Masuk menggunakan NIS siswa di tab Wali Murid (Otomatis terpilih).\n2. Klik tombol Masukkan Izin Baru.\n3. Lengkapi data dan lampirkan foto/file surat.\n\nTerima kasih atas kerjasamanya.\n\n*Hormat kami,*\n*Wali Kelas ${className}*`;
  };

  const copyShareLink = () => {
    const message = getShareMessage();
    navigator.clipboard.writeText(message);
    alert('Pesan dan Link Aplikasi berhasil disalin! Silakan tempel (paste) di grup WhatsApp kelas.');
  };

  const shareToWhatsApp = () => {
    const message = encodeURIComponent(getShareMessage());
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const exportPDF = () => {
    setLoading(true);
    setStatusMessage('Sedang menyiapkan laporan PDF...');
    try {
      const doc = new jsPDF();
      const filterInfo = `Filter: Jenis=${filterType}, Tanggal=${filterDate || 'Semua'}`;
      
      doc.setFontSize(16);
      doc.text(`LAPORAN KETIDAKHADIRAN KELAS ${className}`, 14, 15);
      doc.setFontSize(10);
      doc.text(`Dicetak pada: ${formatDate(new Date())}`, 14, 22);
      doc.text(filterInfo, 14, 28);
      
      autoTable(doc, {
        startY: 35,
        head: [['Nama Siswa', 'Tanggal', 'No. WA Ortu', 'Jenis', 'Status', 'Alasan']],
        body: filteredAttendance.map(a => [a.studentName, a.date, a.parentPhone || '-', a.type, 'DITERIMA', a.reason]),
        headStyles: { fillColor: [30, 64, 175] },
      });
      
      doc.save(`Laporan_Absensi_Kelas_${className}_${filterDate || 'all'}.pdf`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      alert('Gagal mengekspor PDF: ' + (err.message || 'Error tidak diketahui'));
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const exportDailyReport = () => {
    if (!filterDate) {
      alert("Pilih tanggal terlebih dahulu untuk mengunduh Laporan Harian Lengkap.");
      return;
    }

    setLoading(true);
    setStatusMessage('Sedang menyiapkan laporan harian...');
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`LAPORAN KEHADIRAN KELAS ${className}`, 14, 15);
      doc.setFontSize(10);
      doc.text(`Tanggal: ${formatDate(new Date(filterDate))}`, 14, 22);
      doc.text(`SIADPV - SMP NEGERI 2 MAGELANG`, 14, 28);
      
      const todayAttendance = attendance.filter(a => a.date === filterDate && a.status === 'Approved');
      
      const body = students.map((student, index) => {
        const att = todayAttendance.find(a => a.studentId === student.id);
        let status = 'HADIR (H)';
        if (att) {
          status = att.type.toUpperCase();
        }
        return [index + 1, student.nis, student.name, student.gender, status, att?.reason || '-'];
      }).sort((a, b) => (a[2] as string).localeCompare(b[2] as string));

      autoTable(doc, {
        startY: 35,
        head: [['No', 'NIS', 'Nama Siswa', 'L/P', 'Status', 'Keterangan']],
        body: body,
        headStyles: { fillColor: [5, 150, 105] },
        columnStyles: {
          0: { halign: 'center' },
          3: { halign: 'center' },
          4: { fontStyle: 'bold' }
        }
      });

      const summaryY = (doc as any).lastAutoTable.finalY + 10;
      doc.text('Ringkasan:', 14, summaryY);
      doc.text(`Hadir: ${students.length - todayAttendance.length}`, 14, summaryY + 7);
      doc.text(`Sakit: ${todayAttendance.filter(a => a.type === 'Sakit').length}`, 14, summaryY + 14);
      doc.text(`Izin: ${todayAttendance.filter(a => a.type === 'Izin').length}`, 14, summaryY + 21);
      doc.text(`Absen: ${todayAttendance.filter(a => a.type === 'Alpa').length}`, 14, summaryY + 28);

      doc.save(`Laporan_Harian_Kelas_${className}_${filterDate}.pdf`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      alert('Gagal mengekspor laporan harian: ' + (err.message || 'Error tidak diketahui'));
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const exportExcel = () => {
    const dataToExport = filteredAttendance.map(a => ({
      'Nama Siswa': a.studentName,
      'Tanggal': a.date,
      'Hari': a.day,
      'Jenis': a.type,
      'Status': a.status,
      'Alasan': a.reason,
      'Orang Tua': a.parentName,
      'WA Ortu': a.parentPhone || '-',
      'Alamat': a.address
    }));

    if (dataToExport.length === 0) {
      alert("Tidak ada data untuk diekspor dengan filter saat ini.");
      return;
    }

    setLoading(true);
    setStatusMessage('Sedang menyiapkan file Excel...');
    try {
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Absensi Filter");
      XLSX.writeFile(wb, `Absensi_Kelas_${className}_${filterDate || 'all'}.xlsx`);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      alert('Gagal mengekspor Excel: ' + (err.message || 'Error tidak diketahui'));
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addStudentFormData.name || !addStudentFormData.nis) {
      alert("Harap lengkapi Nama dan NIS!");
      return;
    }

    try {
      await addDoc(getTenantCollection('students'), {
        ...addStudentFormData,
        className: className,
        createdAt: serverTimestamp(),
      });
      setShowAddStudentModal(false);
      setAddStudentFormData({ name: '', nis: '', nisn: '', gender: 'L' });
      fetchClassData();
      alert('Siswa berhasil ditambahkan');
    } catch (err: any) {
      handleFirestoreError(err, 'create', 'Student Addition');
    }
  };

  const handleResponseInquiry = async () => {
    if (!selectedInquiry || !inquiryResponse) return;
    try {
      await updateDoc(getTenantDoc('subjectInquiries', selectedInquiry.id), {
        replies: arrayUnion({
          message: inquiryResponse,
          sender: user?.name,
          createdAt: new Date()
        }),
        response: inquiryResponse,
        respondedBy: user?.name,
        respondedAt: serverTimestamp(),
        status: 'Dijawab'
      });

      // Notify Subject Teacher
      if (selectedInquiry.subjectTeacherId || selectedInquiry.subjectTeacherName) {
        await addDoc(getTenantCollection('notifications'), {
          targetUserId: selectedInquiry.subjectTeacherId || '',
          targetTeacherName: selectedInquiry.subjectTeacherName || '',
          title: 'Jawaban Tanya Wali Kelas',
          message: `Wali Kelas ${className} (${user?.name}) telah menjawab pertanyaan Anda tentang ${selectedInquiry.studentName}: "${inquiryResponse}"`,
          read: false,
          type: 'RESPONSE',
          createdAt: serverTimestamp(),
        });
      }

      setShowInquiryModal(false);
      setSelectedInquiry(null);
      setInquiryResponse('');
    } catch (e) {
      console.error(e);
      alert('Gagal membalas inquiry.');
    }
  };

  const handleShowStudentDetail = (student: Student) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const studentHistory = attendance.filter(a => {
      const d = new Date(a.date);
      return a.studentId === student.id && 
             d.getMonth() === currentMonth && 
             d.getFullYear() === currentYear;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setSelectedStudentForDetail(student);
    setStudentAttendanceHistory(studentHistory);
    setShowStudentDetailModal(true);
  };

  if (loading) return <div className="flex justify-center p-20">Memuat data kelas...</div>;

  return (
    <div className="space-y-8">
      <AnimatePresence>
        {statusMessage && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] w-full max-w-md px-4">
            <motion.div 
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className={cn(
                "p-4 rounded-2xl shadow-2xl border flex items-center gap-3",
                statusMessage.includes('Gagal') ? "bg-red-50 border-red-100 text-red-600" : "bg-blue-600 border-blue-500 text-white"
              )}
            >
              <div className={cn("p-2 rounded-xl", statusMessage.includes('Gagal') ? "bg-red-100" : "bg-white/20")}>
                <RefreshCw size={20} className="animate-spin" />
              </div>
              <p className="text-sm font-bold uppercase tracking-tight">{statusMessage}</p>
            </motion.div>
          </div>
        )}

        {success && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] w-full max-w-md px-4">
            <motion.div 
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className="bg-green-600 border border-green-500 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3"
            >
              <div className="p-2 bg-white/20 rounded-xl">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-tight">Berhasil!</p>
                <p className="text-[10px] text-green-100 font-bold uppercase opacity-80">Aksi Anda telah berhasil diproses.</p>
              </div>
            </motion.div>
          </div>
        )}

        {newAttendanceNotification && (
          <div className="fixed top-20 right-6 z-50">
            <SimpleNotification 
              message={newAttendanceNotification} 
              onClose={() => setNewAttendanceNotification(null)}
              title="Data Absensi Baru"
            />
          </div>
        )}
        {newInquiryNotification && (
          <div className="fixed top-20 right-6 z-50 mt-16">
            <SimpleNotification 
              message={newInquiryNotification} 
              onClose={() => setNewInquiryNotification(null)}
              title="Pemberitahuan Baru"
            />
          </div>
        )}
      </AnimatePresence>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <Users size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter leading-none">Selamat Datang, {user?.name}</h1>
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-green-50 px-2 py-0.5 rounded-full border border-green-100 shadow-sm">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[9px] font-black text-green-700 uppercase tracking-widest">Online</span>
                </div>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Wali Kelas {className}</p>
                <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Guru Pengampu</p>
              </div>
              <p className="text-xs text-gray-500 font-medium italic">"Kelola kehadiran dan pantau kemajuan siswa kelas {className} dengan teliti."</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
           <button 
             onClick={() => setSearchParams({ tab: 'notifications' })}
             className={cn(
               "relative p-3 rounded-2xl transition-all border",
               activeTab === 'notifications' ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200" : "bg-gray-50 text-gray-400 border-gray-100 hover:bg-gray-100"
             )}
           >
             <Bell size={24} />
             {teacherNotifications.filter(n => !n.read).length > 0 && (
               <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white animate-bounce">
                 {teacherNotifications.filter(n => !n.read).length}
               </span>
             )}
           </button>
           
           <div className="h-10 w-px bg-gray-100 mx-2 hidden md:block" />

           <div className="flex gap-1 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
               {[
                 { id: 'overview', label: 'OVERVIEW', icon: FileText },
                 { id: 'students', label: 'SISWA', icon: Users },
                 { id: 'attendance', label: 'ABSENSI', icon: CalendarIcon },
                 { id: 'inquiries', label: 'TANYA WALI KELAS', icon: MessageCircle, badge: subjectInquiries.filter(i => i.status !== 'Dijawab').length },
               ].map((tab) => (
                 <button
                   key={tab.id}
                   onClick={() => setSearchParams({ tab: tab.id })}
                   className={cn(
                     "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all relative",
                     activeTab === tab.id ? "bg-white text-blue-600 shadow-sm border border-gray-100" : "text-gray-500 hover:text-gray-700"
                   )}
                 >
                   <tab.icon size={14} />
                   {tab.label}
                   {tab.badge && tab.badge > 0 && (
                     <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black flex items-center justify-center rounded-full border border-white animate-pulse">
                       {tab.badge}
                     </span>
                   )}
                 </button>
               ))}
             </div>
        </div>
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Stats Cards Overview */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Siswa', value: stats.totalStudents, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Sakit', value: stats.sakit, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'Izin', value: stats.izin, icon: CalendarIcon, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Dispensasi', value: stats.dispensasi, icon: CheckCircle2, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'Daftar Hadir', value: stats.totalStudents - Math.min(stats.totalStudents, stats.sakit + stats.izin + stats.dispensasi), icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
            ].map((stat, i) => (
              <div key={`${stat.label}-${i}`} className={cn(
                "bg-white p-3 rounded-lg border border-gray-100 shadow-sm transition-all hover:shadow-md hover:border-blue-100 relative"
              )}>
                <div className={`w-8 h-8 ${stat.bg} ${stat.color} rounded-lg flex items-center justify-center mb-2`}>
                  <stat.icon size={16} />
                </div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{stat.label}</p>
                <h4 className="text-lg font-extrabold text-gray-900">{stat.value}</h4>
              </div>
            ))}
          </div>

          {/* Siswa Terlambat */}
          <div className="mb-6 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
             <h3 className="text-xs font-bold text-gray-800 mb-4 uppercase tracking-wider flex items-center gap-2">
                <Clock size={14} /> DAFTAR SISWA TERLAMBAT ({filterDate || today})
             </h3>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {attendance.filter(a => a.type === 'Terlambat' && a.date === (filterDate || today)).map((a, i) => (
                   <div key={a.id ? `${a.id}-${i}` : `terlambat-${i}`} className="flex justify-between items-center p-3 bg-red-50 rounded-lg text-xs border border-red-100">
                      <span className="font-semibold">{a.studentName}</span>
                      <span className="font-mono text-red-600">{a.reason || 'Terlambat'}</span>
                   </div>
                ))}
                {attendance.filter(a => a.type === 'Terlambat' && a.date === (filterDate || today)).length === 0 && (
                   <p className="text-xs text-gray-400 p-3 italic">Tidak ada siswa terlambat pada tanggal ini.</p>
                )}
             </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
             <button onClick={() => setShowSendInquiryModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-blue-700 shadow-lg transition-all uppercase">
                <MessageCircle size={14} /> KIRIM PERTANYAAN
             </button>
             <button 
              onClick={() => setShowImportModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all font-sans uppercase"
             >
                <MessageCircle size={14} /> IMPOR ABSENSI WA
             </button>
             <button 
              onClick={shareToWhatsApp}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-green-700 shadow-lg shadow-green-200 transition-all uppercase"
             >
                <Share2 size={14} /> BAGIKAN LINK
             </button>
             <button 
              onClick={copyShareLink}
              className="px-4 py-2 bg-white text-blue-600 border border-blue-100 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-blue-50 transition-all uppercase"
             >
                <Copy size={14} /> SALIN PESAN
             </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
               <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wider">RINGKASAN KEHADIRAN PER KELAS</h3>
               <div className="space-y-4">
                 {(() => {
                    const classSummary: any = {};
                    attendance.forEach(a => {
                        if (!classSummary[a.className]) classSummary[a.className] = { Hadir: 0, Sakit: 0, Izin: 0, Dispensasi: 0, Alpa: 0 };
                        classSummary[a.className][a.type === 'Sakit' ? 'Sakit' : (a.type === 'Izin' ? 'Izin' : (a.type === 'Dispensasi' ? 'Dispensasi' : (a.type === 'Alpa' ? 'Alpa' : 'Hadir')))]++;
                    });
                    return Object.entries(classSummary).map(([cls, counts]: any, i) => (
                      <div key={`${cls}-${i}`} className="p-4 bg-gray-50 rounded-2xl">
                          <p className="font-bold text-gray-900 mb-2">{cls}</p>
                          <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-bold text-gray-500 uppercase">
                              <div><p className="text-green-600 text-sm">{counts.Hadir}</p>Hadir</div>
                              <div><p className="text-red-600 text-sm">{counts.Sakit}</p>Sakit</div>
                              <div><p className="text-amber-600 text-sm">{counts.Izin}</p>Izin</div>
                              <div><p className="text-purple-600 text-sm">{counts.Dispensasi}</p>Disp</div>
                              <div><p className="text-gray-600 text-sm">{counts.Alpa}</p>Alpa</div>
                          </div>
                      </div>
                    ));
                 })()}
               </div>
            </div>
          </div>

          <AttendanceWeekCalendar attendance={attendance} setFilterDate={setFilterDate} />

          {/* Share Section - IMPORTANT FOR TEACHER TO SHARE APP */}
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4 scale-150">
               <Share2 size={240} />
            </div>
            
            <div className="relative z-10 grid md:grid-cols-2 gap-8 items-center">
               <div>
                  <div className="flex items-center gap-3 mb-4">
                     <div className="p-2 bg-white/20 rounded-lg">
                        <Share2 size={24} />
                     </div>
                     <h3 className="text-xl font-bold uppercase tracking-wide">Bagikan Ke Wali Murid</h3>
                  </div>
                  <p className="text-blue-100 mb-6 leading-relaxed">
                     Bagikan link aplikasi ini ke Grup WhatsApp Orang Tua/Wali Murid kelas <span className="font-bold underline decoration-blue-400 underline-offset-4">{className}</span> untuk memudahkan pelaporan izin sakit/izin sekolah.
                  </p>
                  <div className="flex flex-wrap gap-3">
                     <button 
                      onClick={copyShareLink}
                      className="px-6 py-3 bg-white text-blue-700 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-50 transition-all shadow-lg"
                     >
                        <Copy size={18} /> Salin Pesan & Link
                     </button>
                     <button 
                      onClick={shareToWhatsApp}
                      className="px-6 py-3 bg-green-500 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-green-600 transition-all shadow-lg"
                     >
                        <MessageCircle size={18} /> Kirim ke Grup WA
                     </button>
                     <button 
                      onClick={() => setSearchParams({ tab: 'attendance' })}
                      className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg border border-blue-400"
                     >
                        <FileDown size={18} /> Unduh Laporan
                     </button>
                  </div>
               </div>
               
               <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
                  <h4 className="text-sm font-bold uppercase mb-4 flex items-center gap-2">
                     <ExternalLink size={16} /> Pratinjau Pesan:
                  </h4>
                  <div className="bg-gray-900/40 p-4 rounded-xl text-[11px] font-mono text-blue-50 leading-relaxed border border-white/10 max-h-40 overflow-y-auto">
                     {getShareMessage().split('\n').map((line, i) => (
                        <p key={`line-${i}`}>{line}</p>
                     ))}
                  </div>
               </div>
            </div>
          </div>

          {/* Subject Inquiry Section */}
          {subjectInquiries.filter(i => i.status !== 'Dijawab').length > 0 && (
            <div className="bg-orange-50 border border-orange-100 rounded-3xl p-6 mb-8 mt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-orange-600 text-white rounded-xl">
                  <MessageCircle size={20} />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-orange-900">Pertanyaan Guru Mapel</h4>
                  <p className="text-xs text-orange-700">Ada {subjectInquiries.filter(i => i.status !== 'Dijawab').length} pertanyaan yang belum Anda jawab.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {subjectInquiries.filter(i => i.status !== 'Dijawab').map((inq, i) => (
                  <div key={inq.id ? `${inq.id}-${i}` : `inq-${i}`} className="bg-white p-4 rounded-2xl shadow-sm border border-orange-100 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">{inq.subjectName}</p>
                        <p className="text-sm font-bold text-gray-900">{inq.studentName}</p>
                      </div>
                      <span className="text-[9px] text-gray-400 font-bold">
                        {inq.createdAt?.toDate ? inq.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Baru'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 italic">"{inq.message}"</p>
                    <button 
                      onClick={() => {
                        setSelectedInquiry(inq);
                        setShowInquiryModal(true);
                      }}
                      className="w-full py-2 bg-orange-600 text-white rounded-xl text-xs font-bold hover:bg-orange-700 transition-colors"
                    >
                      Balas Sekarang
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showSendInquiryModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl">
             <h3 className="text-xl font-bold mb-4 uppercase">Kirim Pertanyaan ke Wali Kelas</h3>
             <form onSubmit={handleSendInquiry} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Kelas Tujuan</label>
                  <input type="text" value={sendInquiryData.className} onChange={e => setSendInquiryData({...sendInquiryData, className: e.target.value})} className="w-full p-2 border rounded-xl" placeholder="Contoh: 7A" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Nama Siswa</label>
                  <input type="text" value={sendInquiryData.studentName} onChange={e => setSendInquiryData({...sendInquiryData, studentName: e.target.value})} className="w-full p-2 border rounded-xl" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Jam Ke</label>
                  <input type="text" value={sendInquiryData.jamKe} onChange={e => setSendInquiryData({...sendInquiryData, jamKe: e.target.value})} className="w-full p-2 border rounded-xl" placeholder="Contoh: 1-2" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Pesan Pertanyaan</label>
                  <textarea value={sendInquiryData.message} onChange={e => setSendInquiryData({...sendInquiryData, message: e.target.value})} className="w-full p-2 border rounded-xl" rows={4} required></textarea>
                </div>
                <div className="flex justify-end gap-3 mt-4">
                  <button type="button" onClick={() => setShowSendInquiryModal(false)} className="px-4 py-2 bg-gray-100 rounded-xl font-bold text-gray-700 hover:bg-gray-200 uppercase text-xs">BATAL</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 rounded-xl font-bold text-white hover:bg-blue-700 uppercase text-xs">KIRIM</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {activeTab === 'students' && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Data Siswa Kelas {className}</h3>
              <p className="text-sm text-gray-500">Daftar siswa dan sandi orang tua</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowAddStudentModal(true)}
                className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-all flex items-center gap-1 shadow-sm"
              >
                <Plus size={14} /> TAMBAH SISWA
              </button>
              <button 
                onClick={() => {
                  const templateData = [
                    ['Nomor Absen', 'Nama Lengkap', 'NIS', 'NISN', 'SANDI', 'Kelas', 'Jenis Kelamin (L/P)']
                  ];
                  const ws = XLSX.utils.aoa_to_sheet(templateData);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "Template Siswa");
                  XLSX.writeFile(wb, `Template_Siswa_Kelas_${className}.xlsx`);
                }}
                className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-1 shadow-sm"
              >
                <Download size={14} /> TEMPLATE
              </button>
              <label className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs font-bold hover:bg-blue-100 transition-all flex items-center gap-1 shadow-sm cursor-pointer">
                <Plus size={14} /> UPLOAD
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
                        for (const row of jsonData as any[]) {
                          // Only allow upload for current class
                          const rowClass = String(row['Kelas'] || '').trim();
                          if (rowClass !== className) continue;

                          await addDoc(getTenantCollection('students'), {
                            name: row['Nama Lengkap'] || row['Nama'] || '',
                            nis: String(row['NIS'] || ''),
                            nisn: String(row['NISN'] || ''),
                            className: className,
                            absensiNo: String(row['Nomor Absen'] || ''),
                            gender: String(row['Jenis Kelamin (L/P)'] || row['Jenis Kelamin'] || '').toUpperCase().startsWith('L') ? 'L' : 'P'
                          });
                          count++;
                          setUploadProgress({ current: count, total: jsonData.length, label: 'Mengunggah Data Siswa' });
                        }
                        
                        alert(`${count} Siswa berhasil diunggah ke kelas ${className}!`);
                        fetchClassData();
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
          </div>
          <div className="p-6 bg-gray-50/50 border-b border-gray-100 flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Cari siswa berdasarkan nama atau NIS..."
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-sm bg-white"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">No</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nama Siswa</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">NIS</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">JK</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sandi Orang Tua</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...students]
                  .filter(s => {
                     const query = studentSearchQuery.toLowerCase();
                     return s.name.toLowerCase().includes(query) || (s.nis || '').toLowerCase().includes(query);
                  })
                  .sort((a,b) => a.name.localeCompare(b.name))
                  .map((s, index) => (
                  <tr key={s.id ? `${s.id}-${index}` : `student-${index}`} className="hover:bg-blue-50/10 transition-colors">
                    <td className="px-6 py-4 text-sm text-center text-gray-500">{index + 1}</td>
                    <td className="px-8 py-4 font-bold text-gray-900 text-sm">
                      <div className="flex items-center gap-2">
                        {s.name}
                        {(s.role === 'PETUGAS_ABSEN_KELAS' || s.isOfficer) && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase rounded shadow-sm flex items-center gap-1">
                            Petugas
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">{s.nis}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold",
                        (s.gender || '').trim().toLowerCase().startsWith('l') ? "bg-blue-100 text-blue-600" : "bg-pink-100 text-pink-600"
                      )}>
                        {(s.gender || '').trim().toLowerCase().startsWith('l') ? 'Laki-Laki' : 'Perempuan'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-gray-700">{s.parentPassword || '-'}</td>
                    <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleShowStudentDetail(s)}
                            className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold border border-blue-100 hover:bg-blue-100"
                          >
                            DETAIL
                          </button>
                          <button 
                            onClick={() => handleEditStudent(s)}
                            className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-bold border border-amber-100 hover:bg-amber-100"
                          >
                            EDIT
                          </button>
                          <button 
                            onClick={() => handleDeleteStudent(s.id!)}
                            className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold border border-red-100 hover:bg-red-100"
                          >
                            HAPUS
                          </button>
                        </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 md:p-8 border-b border-gray-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Data Absensi Kelas {className}</h3>
                <p className="text-sm text-gray-500">Kelola izin ketidakhadiran siswa di kelas Anda</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button 
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-md shadow-blue-100 uppercase"
                >
                  <Plus size={18} />
                  INPUT MANUAL
                </button>
                <button 
                  onClick={() => setShowImportModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-green-700 transition-all shadow-md shadow-green-100 uppercase"
                >
                  <MessageCircle size={18} />
                  IMPOR WA
                </button>
                 <button 
                  onClick={printLoginCards}
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-amber-700 transition-all shadow-md shadow-amber-100 uppercase"
                >
                  <FileText size={18} />
                  KARTU LOGIN
                </button>
                <button 
                  onClick={exportPDF}
                  className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 flex items-center gap-2 hover:bg-gray-100 transition-all uppercase"
                  title="Unduh laporan (Hasil Filter)"
                >
                  <FileDown size={18} />
                  PDF
                </button>
                <button 
                  onClick={exportDailyReport}
                  className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-700 flex items-center gap-2 hover:bg-emerald-100 transition-all uppercase"
                  title="Unduh laporan harian lengkap kelas (Hadir & Izin)"
                >
                  <FileText size={18} />
                  LAPORAN HARIAN
                </button>
                <button 
                  onClick={exportExcel}
                  className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 flex items-center gap-2 hover:bg-gray-100 transition-all uppercase"
                >
                  <Download size={18} />
                  EXCEL
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Cari nama siswa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                 <CalendarIcon className="text-gray-400" size={16} />
                 <input 
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="flex-1 p-2 bg-gray-50 border border-gray-100 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 outline-none"
                 />
              </div>
              <div className="flex items-center gap-2">
                 <Filter className="text-gray-400" size={16} />
                 <select 
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="flex-1 p-2 bg-gray-50 border border-gray-100 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 outline-none appearance-none"
                 >
                   <option value="All">Semua Jenis</option>
                   <option value="Sakit">Sakit</option>
                   <option value="Izin">Izin</option>
                   <option value="Dispensasi">Dispensasi</option>
                   <option value="Alpa">Alpa</option>
                 </select>
              </div>
              <div className="flex items-center gap-2">
                 <CalendarIcon className="text-gray-400" size={16} />
                 <select 
                  className="flex-1 p-2 bg-gray-50 border border-gray-100 rounded-lg text-xs focus:ring-2 focus:ring-blue-600 outline-none appearance-none"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'S1') {
                      setAttendance(prev => prev.filter(a => {
                        const month = new Date(a.date).getMonth();
                        return month >= 6 && month <= 11;
                      }));
                    } else if (val === 'S2') {
                      setAttendance(prev => prev.filter(a => {
                        const month = new Date(a.date).getMonth();
                        return month >= 0 && month <= 5;
                      }));
                    } else {
                      fetchClassData();
                    }
                  }}
                 >
                   <option value="All">Pilih Semester</option>
                   <option value="S1">Semester 1 (Jul-Des)</option>
                   <option value="S2">Semester 2 (Jan-Jun)</option>
                 </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-8 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Siswa</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tanggal</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Jam Masuk</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">WA Ortu</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Jenis</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-8 py-20 text-center text-gray-400 italic">Data absensi tidak ditemukan</td>
                  </tr>
                ) : (
                  filteredAttendance.map((item, i) => (
                    <tr key={`att-v2-${item.id || i}-${i}`} className="hover:bg-blue-50/10 transition-colors">
                      <td className="px-8 py-4">
                        <div>
                          <p className="font-bold text-gray-900">{item.studentName}</p>
                          <p className="text-[10px] text-gray-400">{item.reason}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-700">
                          {item.date ? formatDate(new Date(item.date)) : '-'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[10px] text-gray-400 font-bold">
                          {item.submittedAt ? (item.submittedAt.toDate ? item.submittedAt.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, ':') : '') : '-'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-green-600">{item.parentPhone || '-'}</p>
                        <p className="text-[10px] text-gray-400">{item.parentName}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase",
                          item.type === 'Sakit' ? "bg-red-50 text-red-600" :
                          item.type === 'Izin' ? "bg-amber-50 text-amber-600" : "bg-purple-50 text-purple-600"
                        )}>
                          {item.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
                            item.status === 'Approved' ? "bg-green-100 text-green-700" :
                            item.status === 'Rejected' ? "bg-red-100 text-red-700" :
                            "bg-amber-100 text-amber-700 animate-pulse"
                          )}>
                            {item.status || 'Pending'}
                          </span>
                          {item.status === 'Pending' && (
                            <div className="flex gap-1 mt-1">
                              <button 
                                onClick={() => handleStatusUpdate(item.id, 'Approved', item.studentId)}
                                className="p-1 px-2 bg-green-600 text-white rounded text-[9px] font-bold hover:bg-green-700 transition-all shadow-sm"
                                title="Verifikasi"
                              >
                                TERIMA
                              </button>
                              <button 
                                onClick={() => handleStatusUpdate(item.id, 'Rejected', item.studentId)}
                                className="p-1 px-2 bg-red-600 text-white rounded text-[9px] font-bold hover:bg-red-700 transition-all shadow-sm"
                                title="Tolak"
                              >
                                TOLAK
                              </button>
                            </div>
                          )}
                          {item.status === 'Rejected' && item.statusReason && (
                            <p className="text-[9px] text-red-500 font-bold italic mt-1 max-w-[120px] truncate" title={item.statusReason}>
                              Ket: {item.statusReason}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {item.documentUrl ? (
                          <div className="flex flex-col gap-2">
                             <button 
                              onClick={() => window.open(item.documentUrl, '_blank')}
                              className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-1 mx-auto"
                            >
                              <FileText size={14} /> LIHAT
                            </button>
                            <a 
                              href={item.documentUrl} 
                              download 
                              className="px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-[10px] font-bold border border-green-100 hover:bg-green-100 transition-all flex items-center gap-1 mx-auto"
                            >
                              <FileText size={14} /> UNDUH
                            </a>
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">Tidak ada dokumen</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {item.location ? (
                          <a href={`https://www.google.com/maps?q=${item.location.latitude},${item.location.longitude}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center justify-center gap-1 text-[10px]">
                             <MapPin size={12} /> Peta
                          </a>
                        ) : '-'}
                      </td>
                      <td className="px-8 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => {
                              const std = students.find(s => s.id === item.studentId);
                              if (std) handleShowStudentDetail(std);
                              else alert("Data siswa tidak ditemukan.");
                            }}
                            className="p-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition-colors"
                            title="Detail Bulanan Siswa"
                          >
                            <FileText size={18} />
                          </button>
                          <button 
                            onClick={() => handleDeleteAttendance(item.id)}
                            className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                            title="Hapus"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                        {item.documentUrl && (
                          <button
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = item.documentUrl!;
                              link.download = item.documentName || `DOKUMEN_PENDUKUNG_${item.studentName}`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 hover:bg-blue-700 transition-all w-full mt-2 uppercase shadow-sm shadow-blue-100"
                          >
                            <Download size={14} /> DOWNLOAD DOKUMEN
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'inquiries' && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 animate-in fade-in zoom-in-95 duration-300">
           <div className="flex justify-between items-center mb-6">
             <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Riwayat TANYA WALI KELAS</h2>
             <button 
               onClick={() => setShowSendInquiryModal(true)}
               className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold uppercase text-xs hover:bg-blue-700 flex items-center gap-2"
             >
               <Plus size={16} /> KIRIM PERTANYAAN
             </button>
           </div>
           <div className="space-y-4">
             {subjectInquiries.length === 0 ? (
               <div className="text-center py-10 text-gray-400 font-bold uppercase tracking-widest text-xs">Belum ada data TANYA WALI KELAS.</div>
             ) : (
                subjectInquiries.map((inq, idx) => (
                  <div key={inq.id ? `${inq.id}-${idx}` : `inquiry-hist-${idx}`} className="p-6 rounded-2xl border border-gray-100 bg-gray-50 flex items-start gap-4 hover:border-blue-200 transition-all">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                      <MessageCircle size={24} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-gray-900">{inq.studentName} <span className="text-gray-400 font-normal">({inq.className})</span></h4>
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase",
                          inq.status === 'Dijawab' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        )}>{inq.status}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">{inq.message}</p>
                      <p className="text-[10px] text-gray-400 mt-2 uppercase font-bold">
                        {inq.day && `${inq.day}, `}{inq.date && `${inq.date} `} | Jam ke: {inq.period} {inq.time && `| Waktu: ${inq.time}`} | Mapel: {inq.subjectName}
                      </p>
                      
                      {inq.status !== 'Dijawab' && (
                        <button 
                          onClick={() => {
                            setSelectedInquiry(inq);
                            setShowInquiryModal(true);
                          }}
                          className="mt-3 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 transition-all uppercase tracking-wider shadow-sm flex items-center gap-2 w-fit"
                        >
                          <MessageCircle size={12} /> JAWAB
                        </button>
                      )}
                      
                      {inq.replies && inq.replies.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                           <p className="text-xs font-bold text-gray-700 mb-2 uppercase">Balasan:</p>
                           {inq.replies.map((r: any, rIdx: number) => (
                             <div key={`reply-v2-${inq.id}-${r.id || rIdx}-${rIdx}`} className="bg-white p-3 rounded-lg text-sm text-gray-700 mb-2 border border-gray-100">
                               <p className="text-[10px] text-blue-600 font-bold uppercase">{r.sender}</p>
                               <p>{r.message}</p>
                             </div>
                           ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
             )}
           </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
             <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                   <div className="p-4 bg-blue-100 text-blue-600 rounded-2xl">
                      <BellRing size={28} />
                   </div>
                   <div>
                      <h2 className="text-xl font-black text-gray-900 uppercase">Notifikasi Kelas {className}</h2>
                      <p className="text-xs text-gray-500">Daftar pemberitahuan masuk untuk Wali Kelas</p>
                   </div>
                </div>
                <button 
                  onClick={async () => {
                    for (const n of teacherNotifications.filter(notif => !notif.read)) {
                      await updateDoc(getTenantDoc('notifications', n.id), { read: true });
                    }
                    setTeacherNotifications(prev => prev.map(p => ({...p, read: true})));
                  }}
                  className="px-4 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                >
                  TANDAI SEMUA DIBACA
                </button>
             </div>

             <div className="grid grid-cols-1 gap-4">
                {teacherNotifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-20 text-gray-300">
                     <Bell size={64} className="mb-4 opacity-10" />
                     <p className="text-sm font-bold uppercase tracking-widest italic">Belum Ada Notifikasi</p>
                  </div>
                ) : (
                  teacherNotifications.map((n, i) => (
                    <motion.div 
                      key={`notif-v2-${n.id || i}-${i}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "p-5 rounded-2xl border transition-all cursor-pointer flex items-start gap-4",
                        n.read ? "bg-white border-gray-100 opacity-60" : "bg-blue-50/50 border-blue-100 shadow-sm"
                      )}
                      onClick={async () => {
                        if (!n.read) {
                          await updateDoc(getTenantDoc('notifications', n.id), { read: true });
                          setTeacherNotifications(prev => prev.map(notif => notif.id === n.id ? {...notif, read: true} : notif));
                        }
                      }}
                    >
                      <div className={cn(
                        "p-3 rounded-xl shrink-0 mt-1",
                        n.title?.includes('Izin') ? "bg-amber-100 text-amber-600" : 
                        n.title?.includes('Status') ? "bg-green-100 text-green-600" :
                        n.title?.includes('Pesan') ? "bg-indigo-100 text-indigo-600" :
                        "bg-blue-100 text-blue-600"
                      )}>
                        {n.title?.includes('Izin') ? <CalendarIcon size={20} /> : 
                         n.title?.includes('Status') ? <CheckCircle2 size={20} /> :
                         n.title?.includes('Pesan') ? <MessageCircle size={20} /> :
                         <Bell size={20} />}
                      </div>
                      <div className="flex-1">
                         <div className="flex items-center justify-between mb-2">
                            <h4 className="font-extrabold text-sm text-gray-900 uppercase tracking-tight">{n.title}</h4>
                            <span className="text-[10px] font-bold text-gray-400">
                               {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                            </span>
                         </div>
                         <p className="text-xs text-gray-600 leading-relaxed font-medium">
                            {n.message}
                         </p>
                      </div>
                      {!n.read && (
                        <div className="w-2.5 h-2.5 bg-blue-600 rounded-full shrink-0 shadow-sm shadow-blue-200 mt-2"></div>
                      )}
                    </motion.div>
                  ))
                )}
             </div>
          </div>
        </div>
      )}

      {/* Tanya Wali Kelas Modal */}
      {showInquiryModal && selectedInquiry && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 bg-orange-600 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-lg uppercase">Detail Tanya Wali Kelas</h3>
              <button 
                onClick={() => setShowInquiryModal(false)}
                className="hover:bg-white/20 p-2 rounded-lg transition-colors text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 space-y-2">
                <div className="flex justify-between items-start">
                    <p className="text-xs text-orange-600 font-bold uppercase">Mata Pelajaran: <span className="text-orange-900">{selectedInquiry.subjectName}</span></p>
                    <p className="text-xs text-orange-600 font-bold uppercase">Jam ke: <span className="text-orange-900">{selectedInquiry.jamKe}</span></p>
                </div>
                <p className="text-xs text-orange-600 font-bold uppercase">Guru: {selectedInquiry.subjectTeacherName}</p>
                <p className="text-xs text-orange-600 font-bold uppercase">Siswa: {selectedInquiry.studentName} ({selectedInquiry.className})</p>
                <p className="text-sm text-gray-800 font-medium italic mt-2">"{selectedInquiry.message}"</p>
              </div>

              {selectedInquiry.replies && selectedInquiry.replies.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Riwayat Balasan</p>
                  {selectedInquiry.replies.map((reply: any, idx: number) => (
                    <div key={`modal-reply-v2-${selectedInquiry.id}-${reply.id || idx}-${idx}`} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-xs font-bold text-gray-800">{reply.sender}</p>
                        <p className="text-sm text-gray-600">{reply.message}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Balas</label>
                  <textarea 
                    rows={3}
                    value={inquiryResponse}
                    onChange={(e) => setInquiryResponse(e.target.value)}
                    placeholder="Tulis balasan..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-orange-100 outline-none text-sm font-medium"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleResponseInquiry()}
                    className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 transition-all shadow-lg shadow-orange-100"
                  >
                    Kirim Balasan
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      {activeTab === 'attendance-summary' && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-gray-900 uppercase flex items-center gap-2">
              <LayoutGrid size={18} />
              Ringkasan Kehadiran Kelas {className} ({formatDate(new Date(filterDate || today))})
            </h3>
            <div className="flex items-center gap-2">
               <input 
                 type="date" 
                 value={filterDate || today}
                 onChange={(e) => setFilterDate(e.target.value)}
                 className="p-2 border border-blue-300 rounded text-sm outline-none shadow-sm text-blue-700 font-bold focus:ring-2 focus:ring-blue-100"
               />
            </div>
          </div>
          <div className="p-6">
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
                   <tbody>
                     <tr className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-6 py-4 border-r border-gray-100">
                           <span className="px-3 py-1 bg-blue-50 text-blue-700 font-bold text-xs rounded-lg border border-blue-100">{className}</span>
                        </td>
                        <td className="px-6 py-4 text-center border-r border-gray-100 font-bold">{students.length}</td>
                        <td className="px-6 py-4 text-center border-r border-gray-100 font-black text-green-600">
                           {students.length - attendance.filter(a => a.date === (filterDate || today)).length}
                        </td>
                        <td className="px-6 py-4 text-center border-r border-gray-100 text-red-600 font-bold">
                           {attendance.filter(a => a.date === (filterDate || today) && a.type === 'Sakit').length}
                        </td>
                        <td className="px-6 py-4 text-center border-r border-gray-100 text-yellow-600 font-bold">
                           {attendance.filter(a => a.date === (filterDate || today) && a.type === 'Izin').length}
                        </td>
                        <td className="px-6 py-4 text-center border-r border-gray-100 text-purple-600 font-bold">
                           {attendance.filter(a => a.date === (filterDate || today) && a.type === 'Dispensasi').length}
                        </td>
                        <td className="px-6 py-4 text-center text-gray-400 font-bold">
                           {attendance.filter(a => a.date === (filterDate || today) && a.type === 'Alpa').length}
                        </td>
                     </tr>
                   </tbody>
                </table>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'attendance-detail' && (
        <div className="mb-6">
          <AttendanceAlertsDisplay className={className} />
        </div>
      )}

      {activeTab === 'rekap' && (
        <div className="mb-6">
          <AttendanceRecapTable 
            students={students} 
            attendance={attendance} 
            classes={[{ id: className, name: className }]}
            showClassFilter={false}
          />
        </div>
      )}

      {activeTab === 'rekapSemester' && (
        <div className="mb-6">
          <SemesterAttendanceRecapTable
            students={students}
            attendance={attendance}
            classes={className ? [{ id: className, name: className }] : []}
            showClassFilter={false}
          />
        </div>
      )}

      {activeTab === 'attendance-individual' && (
        <div className="mb-4">
          <IndividualAttendance
            students={students}
            attendance={attendance}
            classes={className ? [{ id: className, name: className }] : []}
            onAttendanceChange={fetchClassData}
          />
        </div>
      )}

      {activeTab === 'weekly-recap' && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6">
           <WeeklyAttendanceRecap 
             attendance={attendance} 
             students={students} 
             selectedClass={className} 
           />
        </div>
      )}

      {activeTab === 'subject-attendance-report' && (
        <div className="space-y-4 mb-6">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text"
                  placeholder="Cari siswa atau mapel..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-64"
                />
              </div>
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
                    doc.text(`Laporan Bulanan Absensi Mapel Kelas ${className} - ${filterMonth}`, 14, 15);
                    autoTable(doc, {
                      startY: 20,
                      head: [['Tanggal', 'Siswa', 'Mapel', 'Jam', 'Status', 'Catatan']],
                      body: filtered.map(a => [a.date, a.studentName, a.subjectName, a.period, a.status, a.notes || '-'])
                    });
                    doc.save(`Laporan_Bulanan_Mapel_${className}_${filterMonth}.pdf`);
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
                  <option value="1">Semester 1</option>
                  <option value="2">Semester 2</option>
                </select>
                <button 
                  onClick={() => {
                    const months = filterSemester === '1' ? ['07','08','09','10','11','12'] : ['01','02','03','04','05','06'];
                    const filtered = subjectAttendances.filter(att => {
                       const m = att.date.split('-')[1];
                       return months.includes(m);
                    });
                    const doc = new jsPDF();
                    doc.text(`Laporan Semester ${filterSemester} Absensi Mapel Kelas ${className}`, 14, 15);
                    autoTable(doc, {
                      startY: 20,
                      head: [['Tanggal', 'Siswa', 'Mapel', 'Jam', 'Status']],
                      body: filtered.map(a => [a.date, a.studentName, a.subjectName, a.period, a.status])
                    });
                    doc.save(`Laporan_Semester_${filterSemester}_Mapel_${className}.pdf`);
                  }}
                  className="p-1.5 bg-indigo-600 text-white rounded text-[10px] font-bold hover:bg-indigo-700"
                >
                  PDF
                </button>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Tanggal</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Siswa</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mata Pelajaran</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Guru</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Jam</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Kehadiran</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {subjectAttendances
                    .filter(a => 
                      !searchQuery || 
                      a.studentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      a.subjectName?.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 100)
                    .map((att, idx) => (
                    <tr key={`subj-att-${att.id}-${idx}`} className="hover:bg-blue-50/20 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{formatDate(new Date(att.date))}</td>
                      <td className="px-4 py-3 text-xs font-bold text-gray-900">{att.studentName}</td>
                      <td className="px-4 py-3 text-xs font-bold text-blue-600">{att.subjectName}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{att.teacherId}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">Jam ke-{att.period}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider inline-block",
                          att.status === 'H' ? "bg-green-100 text-green-700 border border-green-200" :
                          att.status === 'S' ? "bg-blue-100 text-blue-700 border border-blue-200" :
                          att.status === 'I' ? "bg-yellow-100 text-yellow-700 border border-yellow-200" :
                          "bg-red-100 text-red-700 border border-red-200"
                        )}>
                          {att.status === 'H' ? 'HADIR' : att.status === 'S' ? 'SAKIT' : att.status === 'I' ? 'IZIN' : 'ALPA'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 italic">{att.notes || '-'}</td>
                    </tr>
                  ))}
                  {subjectAttendances.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                        Belum ada data absensi guru mapel.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Manual Attendance Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">Input Kehadiran Manual</h3>
              <button onClick={() => { setShowAddModal(false); setSearchParams({tab: 'attendance'}); }} className="hover:bg-white/20 p-2 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Kelas</label>
                  <select 
                    className={cn(
                      "w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all",
                      errors.className ? "border-red-300 ring-1 ring-red-300" : "border-gray-100"
                    )}
                    value={addFormClass}
                    onChange={e => {
                      setAddFormClass(e.target.value);
                      setAddFormData({...addFormData, studentId: ''}); // reset student selection
                      setAddFormStudentSearch('');
                      if (errors.className) setErrors(prev => ({ ...prev, className: '' }));
                    }}
                  >
                    <option value="">Pilih Kelas</option>
                    {[...allClasses].sort((a,b) => (a.name || '').localeCompare(b.name || '', undefined, {numeric:true})).map((c, i) => (
                      <option key={`opt-class-v2-${c.id || i}-${i}`} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  {errors.className && <p className="mt-1 text-[10px] font-bold text-red-500 uppercase tracking-wider">{errors.className}</p>}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Ketik Nama Siswa</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 text-gray-400" size={14} />
                    <input 
                      type="text"
                      placeholder="Cari siswa..."
                      className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                      value={addFormStudentSearch}
                      onChange={e => setAddFormStudentSearch(e.target.value)}
                      disabled={!addFormClass}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Pilih Nama Siswa</label>
                <select 
                  className={cn(
                    "w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all",
                    errors.studentId ? "border-red-300 ring-1 ring-red-300" : "border-gray-100"
                  )}
                  value={addFormData.studentId || ''}
                  onChange={e => {
                    setAddFormData({...addFormData, studentId: e.target.value});
                    if (errors.studentId) setErrors(prev => ({ ...prev, studentId: '' }));
                  }}
                  disabled={!addFormClass}
                >
                  <option value="">Pilih Siswa ({filteredManualStudents.length})</option>
                  {filteredManualStudents.map((s, i) => (
                    <option key={`opt-std-v2-${s.id || i}-${i}`} value={s.id}>{s.name} - {s.nis}</option>
                  ))}
                </select>
                {errors.studentId && <p className="mt-1 text-[10px] font-bold text-red-500 uppercase tracking-wider">{errors.studentId}</p>}
              </div>

              <div className="flex items-center gap-3 bg-blue-50/50 p-3 rounded-2xl border border-blue-100/50 mb-2">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="isRangeManual"
                    checked={addFormData.isRange || false}
                    onChange={e => setAddFormData({...addFormData, isRange: e.target.checked})}
                    className="w-4 h-4 rounded border-blue-200 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="isRangeManual" className="text-xs font-bold text-blue-800 cursor-pointer">Izin lebih dari 1 hari?</label>
                </div>
              </div>

              <div className={cn("grid gap-4", addFormData.isRange ? "grid-cols-2" : "grid-cols-1")}>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">
                    {addFormData.isRange ? 'Mulai Tanggal' : 'Tanggal'}
                  </label>
                  <input 
                    type="date"
                    value={addFormData.date || ''}
                    onChange={e => {
                      setAddFormData({...addFormData, date: e.target.value});
                      if (errors.date) setErrors(prev => ({ ...prev, date: '' }));
                    }}
                    className={cn(
                      "w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all",
                      errors.date ? "border-red-300 ring-1 ring-red-300" : "border-gray-100"
                    )}
                  />
                  {errors.date && <p className="mt-1 text-[10px] font-bold text-red-500 uppercase tracking-wider">{errors.date}</p>}
                </div>
                {addFormData.isRange && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Sampai Tanggal</label>
                    <input 
                      type="date"
                      value={addFormData.endDate || ''}
                      onChange={e => {
                        setAddFormData({...addFormData, endDate: e.target.value});
                        if (errors.endDate) setErrors(prev => ({ ...prev, endDate: '' }));
                      }}
                      className={cn(
                        "w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all",
                        errors.endDate ? "border-red-300 ring-1 ring-red-300" : "border-gray-100"
                      )}
                    />
                    {errors.endDate && <p className="mt-1 text-[10px] font-bold text-red-500 uppercase tracking-wider">{errors.endDate}</p>}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Jenis</label>
                  <select 
                    value={addFormData.type || ''}
                    onChange={e => {
                      setAddFormData({...addFormData, type: e.target.value as any});
                      if (errors.type) setErrors(prev => ({ ...prev, type: '' }));
                    }}
                    className={cn(
                      "w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all",
                      errors.type ? "border-red-300 ring-1 ring-red-300" : "border-gray-100"
                    )}
                  >
                    <option value="">Pilih Jenis</option>
                    <option value="Sakit">Sakit</option>
                    <option value="Izin">Izin</option>
                    <option value="Dispensasi">Dispensasi</option>
                    <option value="Alpa">Alpa</option>
                  </select>
                  {errors.type && <p className="mt-1 text-[10px] font-bold text-red-500 uppercase tracking-wider">{errors.type}</p>}
                </div>
              </div>
              <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block text-center">
                    {isCompressing ? 'Sedang Mengompres...' : 'Dokumen Pendukung (PDF/IMG/Opsional)'}
                  </label>
                  <div className="relative group">
                    <input 
                      type="file" 
                      id="manualAttachment"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) {
                          setSelectedFile(null);
                          return;
                        }

                        if (file.type.startsWith('image/')) {
                          setIsCompressing(true);
                          try {
                            const compressed = await compressImage(file, file.name);
                            setSelectedFile(compressed);
                          } catch (err) {
                            console.error(err);
                            setSelectedFile(file);
                          } finally {
                            setIsCompressing(false);
                          }
                        } else {
                          setSelectedFile(file);
                        }
                      }}
                      className="hidden"
                    />
                    <label 
                      htmlFor="manualAttachment"
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group-hover:scale-[1.01]"
                    >
                      {selectedFile ? (
                        <div className="flex items-center gap-2 text-blue-600 font-bold overflow-hidden">
                          <CheckCircle2 size={18} />
                          <span className="text-xs truncate max-w-[200px]">{selectedFile.name}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-400 group-hover:text-blue-500 font-bold transition-colors">
                          <Plus size={18} />
                          <span className="text-xs">Klik untuk pilih file</span>
                        </div>
                      )}
                    </label>
                  </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Catatan / Keterangan</label>
                <textarea 
                  className={cn(
                    "w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none min-h-[80px] resize-none transition-all",
                    errors.reason ? "border-red-300 ring-1 ring-red-300" : "border-gray-100"
                  )}
                  value={addFormData.reason || ''}
                  onChange={e => {
                    setAddFormData({...addFormData, reason: e.target.value});
                    if (errors.reason) setErrors(prev => ({ ...prev, reason: '' }));
                  }}
                  placeholder="Contoh: Sakit demam dan pusing, sedang berobat..."
                />
                {errors.reason && <p className="mt-1 text-[10px] font-bold text-red-500 uppercase tracking-wider">{errors.reason}</p>}
              </div>
              <button 
                type="submit" 
                disabled={isCompressing}
                className={cn(
                  "w-full py-3 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 mt-2",
                  isCompressing ? "opacity-50 cursor-not-allowed" : "active:scale-95"
                )}
              >
                {isCompressing ? 'MOHON TUNGGU...' : 'SIMPAN KEHADIRAN'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
      {newAttendanceNotification && (
        <SimpleNotification 
           message={newAttendanceNotification} 
           onClose={() => setNewAttendanceNotification(null)}
        />
      )}

      {/* Student Detail Modal */}
      {showStudentDetailModal && selectedStudentForDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
          >
            <div className="p-6 bg-blue-700 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Detail Absensi Bulanan</h3>
                <p className="text-xs text-blue-100">{selectedStudentForDetail.name} ({selectedStudentForDetail.nis})</p>
              </div>
              <button 
                onClick={() => setShowStudentDetailModal(false)}
                className="hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <h4 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <CalendarIcon size={16} className="text-blue-600" />
                Daftar Ketidakhadiran Bulan Ini
              </h4>
              <div className="max-h-[400px] overflow-y-auto space-y-3 pr-2">
                {studentAttendanceHistory.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 italic">
                    Belum ada rekaman ketidakhadiran bulan ini.
                  </div>
                ) : (
                  studentAttendanceHistory.map((att, i) => (
                    <div key={`att-hist-v2-${att.id || i}-${i}`} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                            att.type === 'Sakit' ? "bg-red-100 text-red-600" :
                            att.type === 'Izin' ? "bg-amber-100 text-amber-600" : "bg-purple-100 text-purple-600"
                          )}>
                            {att.type}
                          </span>
                          <span className="text-xs font-bold text-gray-900">{formatDate(new Date(att.date))}</span>
                        </div>
                        <p className="text-xs text-gray-600 italic">"{att.reason}"</p>
                      </div>
                      <div className={cn(
                        "text-[10px] font-bold px-2 py-1 rounded-full",
                        att.status === 'Approved' ? "text-green-600 bg-green-50" :
                        att.status === 'Rejected' ? "text-red-600 bg-red-50" : "text-blue-600 bg-blue-50"
                      )}>
                        {att.status}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button 
                onClick={() => setShowStudentDetailModal(false)}
                className="px-6 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-50"
              >
                Tutup
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Upload Progress Modal */}
      {uploadProgress && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-sm text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">{uploadProgress.label}</h3>
            <div className="w-full bg-gray-100 rounded-full h-4 mb-4 overflow-hidden">
              <motion.div 
                className="bg-blue-600 h-full"
                initial={{ width: 0 }}
                animate={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-sm font-bold text-gray-400">
               <span>{uploadProgress.current} dari {uploadProgress.total}</span>
               <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
            </div>
          </div>
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

      {/* WhatsApp Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="p-6 bg-green-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageCircle size={24} />
                <h3 className="font-bold text-lg text-white uppercase">Impor Pesan WhatsApp</h3>
              </div>
              <button 
                onClick={() => {
                  setShowImportModal(false);
                  setWaText('');
                  setParsedWAData(null);
                }}
                className="hover:bg-white/20 p-2 rounded-lg transition-colors text-white"
              >
                <X size={24} />
              </button>
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
                        <p className="text-[10px] text-red-700 font-bold uppercase">Peringatan: Nama "{parsedWAData.studentName}" tidak ditemukan di database kelas ini.</p>
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
                     <p className="text-xs text-red-700 font-medium font-sans">Format pesan tidak dikenali. Harap sertakan minimal Nama Siswa dan Jenis Absensi.</p>
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

      {showAddStudentModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className="bg-white rounded-3xl p-8 max-w-sm w-full space-y-6">
                <h3 className="text-xl font-black uppercase tracking-tight">TAMBAH SISWA BARU</h3>
                <form onSubmit={handleAddStudentSubmit} className="space-y-4">
                    <input type="text" placeholder="Nama Lengkap" className="w-full p-3 border border-gray-200 rounded-xl text-sm" value={addStudentFormData.name} onChange={e => setAddStudentFormData({...addStudentFormData, name: e.target.value})} required />
                    <input type="text" placeholder="NIS" className="w-full p-3 border border-gray-200 rounded-xl text-sm" value={addStudentFormData.nis} onChange={e => setAddStudentFormData({...addStudentFormData, nis: e.target.value})} required />
                    <input type="text" placeholder="NISN" className="w-full p-3 border border-gray-200 rounded-xl text-sm" value={addStudentFormData.nisn} onChange={e => setAddStudentFormData({...addStudentFormData, nisn: e.target.value})} />
                    <select className="w-full p-3 border border-gray-200 rounded-xl text-sm" value={addStudentFormData.gender} onChange={e => setAddStudentFormData({...addStudentFormData, gender: e.target.value})}>
                        <option value="L">Laki-laki</option>
                        <option value="P">Perempuan</option>
                    </select>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setShowAddStudentModal(false)} className="flex-1 p-3 rounded-xl border border-gray-200 text-xs font-bold uppercase">Batal</button>
                        <button type="submit" className="flex-1 p-3 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase">Simpan</button>
                    </div>
                </form>
            </div>
        </div>
      )}

    </div>
  );
}
