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
  Trash2
} from 'lucide-react';
import { db, auth, handleFirestoreError, storage } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, orderBy, addDoc, Timestamp, onSnapshot, serverTimestamp, deleteDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { cn, formatDate } from '../lib/utils';
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

export default function TeacherDashboard() {
  const { user } = useAuthStore();
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, onConfirm: () => void}>({isOpen: false, message: '', onConfirm: () => {}});
  const showConfirm = (message: string, onConfirm: () => void) => setConfirmDialog({isOpen: true, message, onConfirm});

  const [filterType, setFilterType] = useState('All');
  const [filterDate, setFilterDate] = useState('');
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
  const [addFormData, setAddFormData] = useState<Partial<AttendanceRecord>>({});
  const [allClasses, setAllClasses] = useState<{id: string, name: string}[]>([]);
  const [addFormClass, setAddFormClass] = useState('');
  const [manualStudents, setManualStudents] = useState<Student[]>([]);
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<Student | null>(null);
  const [studentAttendanceHistory, setStudentAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [showStudentDetailModal, setShowStudentDetailModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const printLoginCards = () => {
    if (students.length === 0) {
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
  };

  const fetchClassData = async () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem('school_user');
      if (!stored) return;
      const user = JSON.parse(stored);
      
      if (user.className) {
        setClassName(user.className);

        // Fetch students in class
        const stdQ = query(collection(db, 'students'), where('className', '==', user.className));
        const stdSnapshot = await getDocs(stdQ);
        const stdData = stdSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
        setStudents(stdData);

        // Fetch attendance in class
        const attQ = query(
          collection(db, 'attendance'), 
          where('className', '==', user.className),
          orderBy('submittedAt', 'desc')
        );
        const attSnapshot = await getDocs(attQ);
        const attData = attSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
        setAttendance(attData);
        setRecentAttendance(attData.slice(0, 5));
        
        return;
      }
    } catch (err: any) {
      handleFirestoreError(err, 'list', 'Teacher class data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let unsubscribe: any;
    if (user && auth.currentUser) {
      fetchClassData().then(unsub => {
        unsubscribe = unsub;
      });
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, auth.currentUser]);

  const isInitialLoad = useRef(true);
  const [newAttendanceNotification, setNewAttendanceNotification] = useState<string | null>(null);
  const [newInquiryNotification, setNewInquiryNotification] = useState<string | null>(null);

  useEffect(() => {
    if (!className || !user || !auth.currentUser) return;

    const q = query(
      collection(db, 'attendance'),
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
      collection(db, 'subjectInquiries'),
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
          const csSnap = await getDocs(collection(db, 'classes'));
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
          const stdQ = query(collection(db, 'students'), where('className', '==', addFormClass));
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
    await updateDoc(doc(db, 'notifications', id), { read: true });
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
        collection(db, 'attendance'), 
        where('studentId', '==', studentId),
        where('date', '==', parsedWAData.date)
      );
      const existing = await getDocs(q);
      
      if (!existing.empty) {
        const confirmDuplicate = window.confirm(`Sudah ada data absensi untuk ${parsedWAData.studentName} pada tanggal ${formatDate(new Date(parsedWAData.date))}. Timpa data?`);
        if (!confirmDuplicate) return;
        
        // Delete existing if overwriting
        for (const d of existing.docs) {
          await deleteDoc(doc(db, 'attendance', d.id));
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
      };

      await addDoc(collection(db, 'attendance'), payload);
      setShowImportModal(false);
      setWaText('');
      setParsedWAData(null);
      fetchClassData();
      alert(`Berhasil mengimpor data absensi untuk ${payload.studentName}!`);
    } catch (err: any) {
      handleFirestoreError(err, 'create', 'WhatsApp Import');
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFormData.studentId || !addFormData.type || !addFormData.date || !addFormData.reason) {
      alert("Harap lengkapi semua kolom wajib!");
      return;
    }

    try {
      let documentUrl = '';
      if (selectedFile) {
        const storageRef = ref(storage, `attendance/${Date.now()}_${selectedFile.name}`);
        const snapshot = await uploadBytes(storageRef, selectedFile);
        documentUrl = await getDownloadURL(snapshot.ref);
      }

      const student = manualStudents.find(s => s.id === addFormData.studentId);
      const dateObj = new Date(addFormData.date);
      const dayName = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(dateObj);

      const payload = {
        studentId: addFormData.studentId,
        studentName: student?.name || '',
        nis: student?.nis || '',
        className: student?.className || addFormClass || className,
        date: addFormData.date,
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
      };

      await addDoc(collection(db, 'attendance'), payload);
      setShowAddModal(false);
      setSearchParams({tab: 'attendance'});
      setAddFormData({});
      setSelectedFile(null);
      fetchClassData();
      alert('Berhasil menambahkan absensi');
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
      await addDoc(collection(db, 'subjectInquiries'), {
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

      // Create notification
      try {
        await addDoc(collection(db, 'notifications'), {
          studentId: studentId,
          title: 'Izin Ditolak',
          message: `Pengajuan izin Anda ditolak. Alasan: ${reason}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("Error creating notification:", err);
      }
    }

    try {
      await updateDoc(doc(db, 'attendance', id), { 
        status: newStatus,
        statusReason: reason,
        processedAt: serverTimestamp(),
        processedBy: user?.name || 'Teacher'
      });
      setAttendance(prev => prev.map(item => item.id === id ? { ...item, status: newStatus, statusReason: reason } : item));
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
        await deleteDoc(doc(db, 'students', id));
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
        await deleteDoc(doc(db, 'attendance', id));
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
  }).sort((a, b) => a.studentName.localeCompare(b.studentName));

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
      body: filteredAttendance.map(a => [a.studentName, a.date, a.parentPhone || '-', a.type, a.status, a.reason]),
      headStyles: { fillColor: [30, 64, 175] },
    });
    
    doc.save(`Laporan_Absensi_Kelas_${className}_${filterDate || 'all'}.pdf`);
  };

  const exportDailyReport = () => {
    if (!filterDate) {
      alert("Pilih tanggal terlebih dahulu untuk mengunduh Laporan Harian Lengkap.");
      return;
    }

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

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absensi Filter");
    XLSX.writeFile(wb, `Absensi_Kelas_${className}_${filterDate || 'all'}.xlsx`);
  };

  const handleResponseInquiry = async () => {
    if (!selectedInquiry || !inquiryResponse) return;
    try {
      await updateDoc(doc(db, 'subjectInquiries', selectedInquiry.id), {
        replies: arrayUnion({
          message: inquiryResponse,
          sender: user?.name,
          createdAt: new Date()
        }),
        status: 'Dijawab'
      });
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
              title="Inquiry Baru"
            />
          </div>
        )}
      </AnimatePresence>

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
              <div key={stat.label} className={cn(
                "bg-white p-6 rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-md hover:border-blue-100 relative"
              )}>
                <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center mb-4`}>
                  <stat.icon size={24} />
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
                <h4 className="text-2xl font-extrabold text-gray-900">{stat.value}</h4>
              </div>
            ))}
          </div>

          {/* Siswa Terlambat */}
          <div className="mb-8 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
             <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wider flex items-center gap-2">
                <Clock size={16} /> Daftar Siswa Terlambat ({filterDate || today})
             </h3>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {attendance.filter(a => a.type === 'Terlambat' && a.date === (filterDate || today)).map(a => (
                   <div key={a.id} className="flex justify-between items-center p-3 bg-red-50 rounded-lg text-xs border border-red-100">
                      <span className="font-semibold">{a.studentName}</span>
                      <span className="font-mono text-red-600">{a.reason || 'Terlambat'}</span>
                   </div>
                ))}
                {attendance.filter(a => a.type === 'Terlambat' && a.date === (filterDate || today)).length === 0 && (
                   <p className="text-xs text-gray-400 p-3 italic">Tidak ada siswa terlambat pada tanggal ini.</p>
                )}
             </div>
          </div>

          <div className="flex flex-wrap gap-4 mb-8">
             <button onClick={() => setShowSendInquiryModal(true)} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 shadow-lg transition-all">
                <MessageCircle size={18} /> Kirim Pertanyaan ke Wali Kelas
             </button>
             <button 
              onClick={() => setShowImportModal(true)}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all font-sans"
             >
                <MessageCircle size={18} /> Impor Absensi WA
             </button>
             <button 
              onClick={shareToWhatsApp}
              className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-green-700 shadow-lg shadow-green-200 transition-all"
             >
                <Share2 size={18} /> Bagikan Link Aplikasi
             </button>
             <button 
              onClick={copyShareLink}
              className="px-6 py-3 bg-white text-blue-600 border border-blue-100 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-50 transition-all"
             >
                <Copy size={18} /> Salin Pesan
             </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
               <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wider">Ringkasan Kehadiran per Kelas</h3>
               <div className="space-y-4">
                 {(() => {
                    const classSummary: any = {};
                    attendance.forEach(a => {
                        if (!classSummary[a.className]) classSummary[a.className] = { Hadir: 0, Sakit: 0, Izin: 0, Alpa: 0 };
                        classSummary[a.className][a.type === 'Hadir' ? 'Hadir' : (a.type === 'Sakit' ? 'Sakit' : (a.type === 'Izin' ? 'Izin' : 'Alpa'))]++;
                    });
                    return Object.entries(classSummary).map(([cls, counts]: any) => (
                      <div key={cls} className="p-4 bg-gray-50 rounded-2xl">
                          <p className="font-bold text-gray-900 mb-2">{cls}</p>
                          <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold text-gray-500 uppercase">
                              <div><p className="text-green-600 text-sm">{counts.Hadir}</p>Hadir</div>
                              <div><p className="text-red-600 text-sm">{counts.Sakit}</p>Sakit</div>
                              <div><p className="text-amber-600 text-sm">{counts.Izin}</p>Izin</div>
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
                        <p key={i}>{line}</p>
                     ))}
                  </div>
               </div>
            </div>
          </div>

          {/* Subject Inquiry Section */}
          {subjectInquiries.filter(i => i.status === 'Unconfirmed' || i.status === 'Unanswered').length > 0 && (
            <div className="bg-orange-50 border border-orange-100 rounded-3xl p-6 mb-8 mt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-orange-600 text-white rounded-xl">
                  <MessageCircle size={20} />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-orange-900">Pertanyaan Guru Mapel</h4>
                  <p className="text-xs text-orange-700">Ada {subjectInquiries.filter(i => i.status === 'Unconfirmed' || i.status === 'Unanswered').length} pertanyaan yang belum Anda jawab.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {subjectInquiries.filter(i => i.status === 'Unconfirmed' || i.status === 'Unanswered').map(inq => (
                  <div key={inq.id} className="bg-white p-4 rounded-2xl shadow-sm border border-orange-100 space-y-3">
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
                  <button type="button" onClick={() => setShowSendInquiryModal(false)} className="px-4 py-2 bg-gray-100 rounded-xl font-bold text-gray-700 hover:bg-gray-200">Batal</button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 rounded-xl font-bold text-white hover:bg-blue-700">Kirim</button>
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

                          await addDoc(collection(db, 'students'), {
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
                  <tr key={s.id} className="hover:bg-blue-50/10 transition-colors">
                    <td className="px-6 py-4 text-sm text-center text-gray-500">{index + 1}</td>
                    <td className="px-8 py-4 font-bold text-gray-900 text-sm">{s.name}</td>
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                >
                  <Plus size={18} />
                  Input Manual
                </button>
                <button 
                  onClick={() => setShowImportModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-green-700 transition-all shadow-md shadow-green-100"
                >
                  <MessageCircle size={18} />
                  Impor WA
                </button>
                 <button 
                  onClick={printLoginCards}
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-amber-700 transition-all shadow-md shadow-amber-100"
                >
                  <FileText size={18} />
                  Kartu Login
                </button>
                <button 
                  onClick={exportPDF}
                  className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 flex items-center gap-2 hover:bg-gray-100 transition-all"
                  title="Unduh laporan (Hasil Filter)"
                >
                  <FileDown size={18} />
                  PDF
                </button>
                <button 
                  onClick={exportDailyReport}
                  className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-bold text-emerald-700 flex items-center gap-2 hover:bg-emerald-100 transition-all"
                  title="Unduh laporan harian lengkap kelas (Hadir & Izin)"
                >
                  <FileText size={18} />
                  Laporan Harian
                </button>
                <button 
                  onClick={exportExcel}
                  className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 flex items-center gap-2 hover:bg-gray-100 transition-all"
                >
                  <Download size={18} />
                  Excel
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
                 <CalendarIcon className="text-gray-400" size={18} />
                 <input 
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="flex-1 p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                 />
              </div>
              <div className="flex items-center gap-2">
                 <Filter className="text-gray-400" size={18} />
                 <select 
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="flex-1 p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none appearance-none"
                 >
                   <option value="All">Semua Jenis</option>
                   <option value="Sakit">Sakit</option>
                   <option value="Izin">Izin</option>
                   <option value="Dispensasi">Dispensasi</option>
                   <option value="Alpa">Alpa</option>
                 </select>
              </div>
              <div className="flex items-center gap-2">
                 <CalendarIcon className="text-gray-400" size={18} />
                 <select 
                  className="flex-1 p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none appearance-none"
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
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Dokumen Pendukung</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-8 py-20 text-center text-gray-400 italic">Data absensi tidak ditemukan</td>
                  </tr>
                ) : (
                  filteredAttendance.map((item) => (
                    <tr key={item.id} className="hover:bg-blue-50/10 transition-colors">
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
                        <div>
                          <div className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold",
                            item.status === 'Approved' ? "bg-green-100 text-green-600" :
                            item.status === 'Rejected' ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                          )}>
                            {item.status}
                          </div>
                          {item.status === 'Rejected' && item.statusReason && (
                            <p className="text-[9px] text-red-500 mt-1 font-medium max-w-[150px] truncate" title={item.statusReason}>
                              Alasan: {item.statusReason}
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
                      <td className="px-8 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {item.status === 'Pending' && (
                            <>
                              <button 
                                onClick={() => handleStatusUpdate(item.id, 'Approved', item.studentId)}
                                className="p-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors"
                                title="Terima"
                              >
                                <CheckCircle2 size={18} />
                              </button>
                              <button 
                                onClick={() => handleStatusUpdate(item.id, 'Rejected', item.studentId)}
                                className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                                title="Tolak"
                              >
                                <XCircle size={18} />
                              </button>
                            </>
                          )}
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
                            <Download size={14} /> Download Dokumen
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

      {activeTab === 'rekap' && (
        <AttendanceRecapTable 
          students={students} 
          attendance={attendance} 
          showClassFilter={false}
        />
      )}
      
      {activeTab === 'rekapSemester' && (
        <SemesterAttendanceRecapTable 
          students={students} 
          attendance={attendance} 
          showClassFilter={false}
        />
      )}

      {/* Inquiry Response Modal */}
      {showInquiryModal && selectedInquiry && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 bg-orange-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">Detail Inquiry</h3>
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
                    <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
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
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Kelas</label>
                <select 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                  value={addFormClass}
                  onChange={e => {
                    setAddFormClass(e.target.value);
                    setAddFormData({...addFormData, studentId: ''}); // reset student selection
                  }}
                  required
                >
                  <option value="">Pilih Kelas</option>
                  {[...allClasses].sort((a,b) => (a.name || '').localeCompare(b.name || '', undefined, {numeric:true})).map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Siswa</label>
                <select 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                  value={addFormData.studentId || ''}
                  onChange={e => setAddFormData({...addFormData, studentId: e.target.value})}
                  required
                  disabled={!addFormClass}
                >
                  <option value="">Pilih Siswa</option>
                  {manualStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.name} - {s.nis}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Tanggal</label>
                  <input 
                    type="date"
                    required
                    value={addFormData.date || ''}
                    onChange={e => setAddFormData({...addFormData, date: e.target.value})}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Jenis</label>
                  <select 
                    required
                    value={addFormData.type || ''}
                    onChange={e => setAddFormData({...addFormData, type: e.target.value as any})}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                  >
                    <option value="">Pilih Jenis</option>
                    <option value="Sakit">Sakit</option>
                    <option value="Izin">Izin</option>
                    <option value="Dispensasi">Dispensasi</option>
                    <option value="Alpa">Alpa</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Alasan</label>
                <textarea 
                  required
                  rows={3}
                  value={addFormData.reason || ''}
                  onChange={e => setAddFormData({...addFormData, reason: e.target.value})}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 mb-1 block">Dokumen Pendukung (PDF/PNG/JPG) - Opsional</label>
                <input 
                  type="file" 
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>
              <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors mt-4">
                Simpan Kehadiran
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
                  studentAttendanceHistory.map(att => (
                    <div key={att.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
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
                <h3 className="font-bold text-lg text-white">Impor Pesan WhatsApp</h3>
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

    </div>
  );
}
