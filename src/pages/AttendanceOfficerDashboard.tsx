import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { checkAttendanceAlert } from '../services/attendanceNotificationService';
import { AttendanceRecord, Student, SchoolClass } from '../types';
import AttendanceRecapTable from '../components/AttendanceRecapTable';
import { ClipboardList, FileText, Edit, Trash2, X, Users, AlertCircle, Plus, Calendar, User, BookOpen, MessageSquare, Download } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import { useAuthStore } from '../lib/auth-store';
import { generateQRCodeDataUrl } from '../services/pdfService';
import { jsPDF } from 'jspdf';

export default function AttendanceOfficerDashboard() {
  const { user } = useAuthStore();
  const pageWidth = 85.6;
  const pageHeight = 54;
  const [authReady, setAuthReady] = useState(false);
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'history';
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [statusMessage, setStatusMessage] = useState('');
  const itemsPerPage = 12;
  const [officerPage, setOfficerPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAttendance, setNewAttendance] = useState({
    date: new Date().toISOString().split('T')[0],
    className: '',
    studentId: '',
    type: 'Alpa' as const,
    reason: ''
  });

  const selectedDay = useMemo(() => {
    if (!newAttendance.date) return '';
    return new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(new Date(newAttendance.date));
  }, [newAttendance.date]);

  const filteredStudents = useMemo(() => {
    if (!newAttendance.className) return [];
    return students.filter(s => s.className === newAttendance.className)
      .sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [students, newAttendance.className]);

  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, onConfirm: () => void}>({isOpen: false, message: '', onConfirm: () => {}});
  const showConfirm = (message: string, onConfirm: () => void) => setConfirmDialog({isOpen: true, message, onConfirm});

  const QRThumbnail = ({ value }: { value: string }) => {
    const [dataUrl, setDataUrl] = useState<string>('');

    useEffect(() => {
      if (!value) return;
      generateQRCodeDataUrl(value)
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

  const generateQRCode = async (text: string) => {
    return await generateQRCodeDataUrl(text);
  };

  const printLoginCard = async (entity: any) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [54, 85.6] // ID-1 Card size portrait
    });

    const name = entity.name || 'PETUGAS ABSENSI';
    const subTitle = "PETUGAS ABSENSI KELAS";
    const qrCodeValue = `${entity.className}${String(entity.absensiNo || '').padStart(2, '0')}`;
    const cardWidth = 54;
    const cardHeight = 85.6;
    
    // Card Background Header
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, cardWidth, 15, 'F');
    
    // Header text
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text("KARTU LOGIN PETUGAS", cardWidth / 2, 7, { align: 'center' });
    doc.setFontSize(6);
    doc.text(subTitle, cardWidth / 2, 11, { align: 'center' });

    // QR Code Section
    if (qrCodeValue) {
        const qrCodeDataUrl = await generateQRCode(qrCodeValue);
        if (qrCodeDataUrl) {
            const qrSize = 40; 
            const xPos = (cardWidth - qrSize) / 2;
            doc.addImage(qrCodeDataUrl, 'PNG', xPos, 18, qrSize, qrSize);
        }
    }

    // Branding (Small)
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(5);
    doc.text("SCAN QR UNTUK LOGIN", cardWidth / 2, 62, { align: 'center' });

    // Student Info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text("NAMA SISWA:", cardWidth / 2, 68, { align: 'center' });
    doc.setFontSize(9);
    doc.text(name.toUpperCase(), cardWidth / 2, 73, { align: 'center', maxWidth: cardWidth - 6 });
    
    doc.setFontSize(6);
    doc.text("KELAS:", cardWidth / 2, 79, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(30, 64, 175);
    doc.text(entity.className || '-', cardWidth / 2, 83, { align: 'center' });

    doc.save(`KARTU_LOGIN_${name.replace(/\s+/g, '_')}.pdf`);
  };

  const printBulkOfficerCards = async () => {
    if (officers.length === 0) return;
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'legal'
    });

    const docWidth = 215.9;
    const docHeight = 355.6;
    const cardsPerRow = 4;
    const cardsPerCol = 4;
    const cardsPerPage = cardsPerRow * cardsPerCol;
    
    const marginX = 10;
    const marginY = 10;
    const cardWidth = (docWidth - (marginX * 2)) / cardsPerRow;
    const cardHeight = (docHeight - (marginY * 2)) / cardsPerCol;

    for (let i = 0; i < officers.length; i++) {
        if (i > 0 && i % cardsPerPage === 0) {
            doc.addPage();
        }

        const officer = officers[i];
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

        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.roundedRect(innerX, innerY, innerW, innerH, 2, 2, 'S');

        doc.setFillColor(30, 64, 175);
        doc.roundedRect(innerX, innerY, innerW, 8, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text("KARTU PETUGAS", innerX + (innerW / 2), innerY + 5, { align: 'center' });

        const qrCodeValue = `${officer.className}${String(officer.absensiNo || '').padStart(2, '0')}`;
        const qrCodeDataUrl = await generateQRCode(qrCodeValue);
        if (qrCodeDataUrl) {
            const qrSize = Math.min(innerW * 0.8, innerH * 0.45);
            const qrX = innerX + (innerW - qrSize) / 2;
            doc.addImage(qrCodeDataUrl, 'PNG', qrX, innerY + 12, qrSize, qrSize);
        }

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
  };

  const officers = useMemo(() => {
    return students.filter(s => (s as any).role === 'PETUGAS_ABSEN_KELAS')
      .sort((a,b) => (a.className || '').localeCompare(b.className || '', undefined, {numeric: true}) || (a.name || '').localeCompare(b.name || ''));
  }, [students]);

  const paginatedOfficers = useMemo(() => {
    const startIndex = (officerPage - 1) * itemsPerPage;
    return officers.slice(startIndex, startIndex + itemsPerPage);
  }, [officers, officerPage, itemsPerPage]);

  const totalOfficerPages = Math.ceil(officers.length / itemsPerPage);

  const sortedAttendance = useMemo(() => {
    return [...attendance].sort((a,b) => {
        const timeA = a.submittedAt?.seconds || 0;
        const timeB = b.submittedAt?.seconds || 0;
        if (timeA !== timeB) return timeB - timeA;
        
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
    });
  }, [attendance]);

  const paginatedHistory = useMemo(() => {
    const startIndex = (historyPage - 1) * itemsPerPage;
    return sortedAttendance.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedAttendance, historyPage, itemsPerPage]);

  const totalHistoryPages = Math.ceil(attendance.length / itemsPerPage);

  const handleRemoveOfficer = (id: string) => {
    showConfirm('Hapus peran petugas dari siswa ini?', async () => {
      try {
        await updateDoc(doc(db, 'students', id), { role: null });
        setStatusMessage('Petugas berhasil dihapus');
        setTimeout(() => setStatusMessage(''), 3000);
      } catch (err: any) {
        handleFirestoreError(err, 'update' as any, 'students-role');
      }
    });
  };

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
        setAuthReady(!!u);
    });
  }, []);

  useEffect(() => {
    if (!user || !authReady) return;
    const q = query(collection(db, 'attendance'), orderBy('submittedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAttendance(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord)));
    }, (err) => {
      handleFirestoreError(err, 'list', 'Attendance Officer Fetch');
    });
    
    const sQ = query(collection(db, 'students'));
    const unsubscribeStudents = onSnapshot(sQ, (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    }, (err) => {
      handleFirestoreError(err, 'list', 'Attendance Officer Fetch Students');
    });

    const cQ = query(collection(db, 'classes'));
    const unsubscribeClasses = onSnapshot(cQ, (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SchoolClass)));
    }, (err) => {
      handleFirestoreError(err, 'list', 'Attendance Officer Fetch Classes');
    });
    
    return () => { unsubscribe(); unsubscribeStudents(); unsubscribeClasses(); };
  }, [user, authReady]);

  const handleAddAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const student = students.find(s => s.id === newAttendance.studentId);
      if (!student) return;

      await addDoc(collection(db, 'attendance'), {
        studentId: student.id,
        studentName: student.name,
        className: student.className,
        date: newAttendance.date,
        day: selectedDay,
        type: newAttendance.type,
        reason: newAttendance.reason,
        submittedAt: serverTimestamp(),
        status: 'Approved',
        parentName: '-',
        parentPhone: '-',
        address: '-',
        source: 'App',
        processedBy: user?.name || 'Petugas'
      });

      // Early Warning Check
      checkAttendanceAlert(student.id, student.name, student.className).catch(console.error);

      // Notify ADMIN
      await addDoc(collection(db, 'notifications'), {
        targetRole: 'ADMIN',
        title: 'Input Absensi Petugas',
        message: `${student.name} (${student.className}) ditambahkan absensi ${newAttendance.type} oleh ${user?.name || 'Petugas'}.`,
        studentId: student.id,
        studentName: student.name,
        className: student.className,
        type: newAttendance.type,
        read: false,
        createdAt: serverTimestamp()
      });

      setStatusMessage('Absensi berhasil ditambahkan');
      setNewAttendance({
        ...newAttendance,
        studentId: '',
        reason: ''
      });
      setShowAddForm(false);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err) {
      handleFirestoreError(err, 'create' as any, 'attendance');
    }
  };

  const handleDelete = (id: string) => {
    showConfirm('Apakah Anda yakin ingin menghapus data absensi ini?', async () => {
      try {
        await deleteDoc(doc(db, 'attendance', id));
      } catch (err) {
        handleFirestoreError(err, 'delete' as any, 'attendance');
      }
    });
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { id, ...data } = formData;
      await updateDoc(doc(db, 'attendance', id), data);
      setShowEditModal(false);
      setFormData({});
    } catch (err) {
      handleFirestoreError(err, 'update' as any, 'attendance');
    }
  };

  const isManagement = user?.role === 'ADMIN' || user?.role === 'TEACHER' || user?.role === 'COUNSELOR';

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-black text-gray-900">Dashboard Petugas Absensi</h1>
      
      {statusMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl font-bold text-sm text-center"
        >
          {statusMessage}
        </motion.div>
      )}

      <div className="flex flex-wrap gap-4">
        <a href="?tab=officers" className={cn("px-6 py-3 rounded-xl flex items-center gap-2 font-bold transition-all", activeTab === 'officers' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          <Users size={20} /> Daftar Petugas
        </a>
        <a href="?tab=history" className={cn("px-6 py-3 rounded-xl flex items-center gap-2 font-bold transition-all", activeTab === 'history' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          <ClipboardList size={20} /> Absensi Petugas Kelas
        </a>
        <a href="?tab=rekap" className={cn("px-6 py-3 rounded-xl flex items-center gap-2 font-bold transition-all", activeTab === 'rekap' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          <FileText size={20} /> Rekap Petugas Kelas
        </a>
      </div>
      
      {activeTab === 'officers' && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 bg-gray-800 text-white flex justify-between items-center">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Users size={24} /> Daftar Petugas Absensi Kelas
            </h2>
            <div className="flex items-center gap-4">
              {isManagement && officers.length > 0 && (
                <button
                  onClick={printBulkOfficerCards}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center gap-1 shadow-sm"
                >
                  <Download size={14} /> UNDUH KARTU MASAL ({officers.length})
                </button>
              )}
              <span className="px-3 py-1 bg-blue-600/20 text-blue-400 text-xs font-bold rounded-full border border-blue-600/30">
                {officers.length} Petugas Aktif
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="bg-gray-50/50">
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">No</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">Kelas</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">Nomor Absen</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">Nama Siswa</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">USER ID</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">SANDI</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase text-center">UNDUH KARTU</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase text-center">QR CODE</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {officers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400 italic text-sm">Belum ada petugas kelas yang ditunjuk.</td>
                  </tr>
                ) : (
                  paginatedOfficers.map((o, idx) => (
                    <tr key={`officer-${o.id}-${idx}`} className="hover:bg-blue-50/10 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-400 font-medium">{(officerPage - 1) * itemsPerPage + idx + 1}</td>
                      <td className="px-6 py-4 text-sm font-black text-blue-600 uppercase">{o.className}</td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{o.absensiNo || '-'}</td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{o.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-mono italic">{`${o.className}${String(o.absensiNo || '').padStart(2, '0')}`}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-mono italic">{o.nis || '-'}</td>
                      <td className="px-6 py-4 text-center">
                        <button 
                             onClick={() => printLoginCard(o)}
                             className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 border border-indigo-100 mx-auto"
                             title="Download Kartu Login"
                           >
                             <Download size={14} />
                             <span className="text-[10px] font-black uppercase">UNDUH</span>
                        </button>
                      </td>
                      <td className="px-6 py-4 text-center">
                         <QRThumbnail value={`${o.className}${String(o.absensiNo || '').padStart(2, '0')}`} />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                           {isManagement ? (
                             <>
                               <button
                                 onClick={() => alert('Fitur Edit sedang dalam pengembangan')}
                                 className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                                 title="Edit"
                               >
                                 <Edit size={14} />
                               </button>
                               <button 
                                onClick={() => handleRemoveOfficer(o.id!)}
                                className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                title="Hapus Peran Petugas"
                              >
                                 <Trash2 size={14} />
                              </button>
                             </>
                           ) : (
                             <span className="text-[10px] text-gray-300 italic">No Aksi</span>
                           )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalOfficerPages > 1 && (
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Menampilkan {((officerPage - 1) * itemsPerPage) + 1} - {Math.min(officerPage * itemsPerPage, officers.length)} dari {officers.length} Petugas
              </p>
              <div className="flex items-center gap-2">
                <button 
                  disabled={officerPage === 1}
                  onClick={() => setOfficerPage(officerPage - 1)}
                  className="p-2 border border-gray-200 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                >
                  Sebelumnya
                </button>
                {[...Array(totalOfficerPages)].map((_, i) => (
                  <button 
                    key={`pag-officer-${i}`}
                    onClick={() => setOfficerPage(i + 1)}
                    className={cn(
                      "w-8 h-8 rounded text-xs font-bold transition-all",
                      officerPage === i + 1 ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "hover:bg-gray-200 bg-white border border-gray-200"
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
                <button 
                  disabled={officerPage === totalOfficerPages}
                  onClick={() => setOfficerPage(officerPage + 1)}
                  className="p-2 border border-gray-200 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold">Absensi Petugas Kelas</h2>
              <button 
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all text-sm"
              >
                <Plus size={18} /> {showAddForm ? 'Batal' : 'Tambah Absensi'}
              </button>
            </div>

            {showAddForm && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-8 p-6 bg-gray-50 rounded-2xl border border-gray-100"
              >
                <form onSubmit={handleAddAttendance} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Tanggal</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input 
                        type="date"
                        className="w-full pl-10 pr-3 py-2.5 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                        value={newAttendance.date}
                        onChange={e => setNewAttendance({ ...newAttendance, date: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Hari</label>
                    <div className="w-full px-3 py-2.5 bg-gray-100 border border-transparent rounded-xl font-bold text-gray-600">
                      {selectedDay || '-'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Kelas</label>
                    <div className="relative">
                      <BookOpen className="absolute left-3 top-3 text-gray-400" size={18} />
                      <select 
                        className="w-full pl-10 pr-3 py-2.5 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 appearance-none font-medium"
                        value={newAttendance.className}
                        onChange={e => setNewAttendance({ ...newAttendance, className: e.target.value, studentId: '' })}
                        required
                      >
                        <option value="">Pilih Kelas</option>
                        {classes.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true})).map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nama Siswa</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 text-gray-400" size={18} />
                      <select 
                        className="w-full pl-10 pr-3 py-2.5 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 appearance-none font-medium"
                        value={newAttendance.studentId}
                        onChange={e => setNewAttendance({ ...newAttendance, studentId: e.target.value })}
                        required
                        disabled={!newAttendance.className}
                      >
                        <option value="">Pilih Siswa</option>
                        {filteredStudents.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Jenis Absensi</label>
                    <select 
                      className="w-full px-3 py-2.5 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      value={newAttendance.type}
                      onChange={e => setNewAttendance({ ...newAttendance, type: e.target.value as any })}
                      required
                    >
                      <option value="Sakit">Sakit</option>
                      <option value="Izin">Izin</option>
                      <option value="Dispensasi">Dispensasi</option>
                      <option value="Alpa">Alpa</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Petugas</label>
                    <div className="w-full px-3 py-2.5 bg-gray-100 border border-transparent rounded-xl font-bold text-gray-600 truncate">
                      {user?.name || 'Sistem'}
                    </div>
                  </div>
                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Catatan / Keterangan</label>
                    <div className="relative">
                      <MessageSquare className="absolute left-3 top-3 text-gray-400" size={18} />
                      <textarea 
                        className="w-full pl-10 pr-3 py-2.5 bg-white border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] font-medium"
                        value={newAttendance.reason}
                        onChange={e => setNewAttendance({ ...newAttendance, reason: e.target.value })}
                        placeholder="Berikan alasan atau keterangan tambahan..."
                        required
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2 lg:col-span-3 flex justify-end">
                    <button 
                      type="submit"
                      className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                    >
                      Simpan Absensi
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Siswa</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Kelas</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Hari/Tanggal</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Jenis</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Petugas</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginatedHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic text-sm">Belum ada riwayat absensi petugas.</td>
                    </tr>
                  ) : (
                    paginatedHistory.map((item, idx) => (
                      <tr key={`attendance-${item.id}-${idx}`} className="hover:bg-blue-50/10 transition-colors">
                        <td className="px-6 py-4">
                            <p className="font-bold text-sm text-gray-900">{item.studentName}</p>
                            <p className="text-[10px] text-gray-400 font-medium">#{item.studentId?.slice(-5)}</p>
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-blue-600 uppercase">{item.className}</td>
                         <td className="px-6 py-4">
                            <p className="text-sm font-bold text-gray-900">{item.day || '-'}</p>
                            <p className="text-[10px] text-gray-400">{item.date ? formatDate(new Date(item.date)) : '-'}</p>
                        </td>
                        <td className="px-6 py-4">
                            <span className={cn(
                              "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase",
                              item.type === 'Sakit' ? "bg-amber-100 text-amber-600" :
                              item.type === 'Izin' ? "bg-blue-100 text-blue-600" :
                              item.type === 'Dispensasi' ? "bg-purple-100 text-purple-600" : "bg-red-100 text-red-600"
                            )}>
                              {item.type}
                            </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-gray-500">{item.processedBy || '-'}</td>
                        <td className="px-6 py-4 text-sm">
                          <div className="flex justify-center gap-2">
                            {isManagement && (
                              <>
                                <button 
                                  onClick={() => { setFormData(item); setShowEditModal(true); }}
                                  className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                                  title="Edit"
                                >
                                  <Edit size={14} />
                                </button>
                                <button 
                                  onClick={() => handleDelete(item.id!)}
                                  className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                  title="Hapus"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalHistoryPages > 1 && (
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between mt-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Menampilkan {((historyPage - 1) * itemsPerPage) + 1} - {Math.min(historyPage * itemsPerPage, attendance.length)} dari {attendance.length} Baris
              </p>
              <div className="flex items-center gap-2">
                <button 
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage(historyPage - 1)}
                  className="p-2 border border-gray-200 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                >
                  Sebelumnya
                </button>
                {[...Array(totalHistoryPages)].map((_, i) => (
                  <button 
                    key={`pag-hist-${i}`}
                    onClick={() => setHistoryPage(i + 1)}
                    className={cn(
                      "w-8 h-8 rounded text-xs font-bold transition-all",
                      historyPage === i + 1 ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "hover:bg-gray-200 bg-white border border-gray-200"
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
                <button 
                  disabled={historyPage === totalHistoryPages}
                  onClick={() => setHistoryPage(historyPage + 1)}
                  className="p-2 border border-gray-200 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      )}
      
      {activeTab === 'rekap' && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold mb-6">Rekap Petugas Kelas</h2>
          <AttendanceRecapTable 
            attendance={attendance} 
            students={students} 
            showClassFilter={true}
            classes={Array.from(new Set(students.map(s => s.className))).map((name, i) => ({ id: `${i}`, name: String(name) }))}
          />
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-blue-600 text-white">
              <h3 className="font-bold">Edit Presensi: {formData.studentName}</h3>
              <button onClick={() => setShowEditModal(false)} className="hover:bg-white/20 p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Jenis Absensi</label>
                <select 
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.type || ''}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                  required
                >
                  <option value="Sakit">Sakit</option>
                  <option value="Izin">Izin</option>
                  <option value="Dispensasi">Dispensasi</option>
                  <option value="Alpa">Alpa</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Alasan / Keterangan</label>
                <textarea 
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                  value={formData.reason || ''}
                  onChange={e => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Berikan alasan sakit atau keterangan izin..."
                  required
                />
              </div>
              <button 
                type="submit"
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 mt-4 uppercase tracking-widest text-sm"
              >
                Simpan Perubahan
              </button>
            </form>
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

    </div>
  );
}
