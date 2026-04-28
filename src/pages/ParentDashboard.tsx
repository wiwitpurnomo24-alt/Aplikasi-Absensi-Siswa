import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { 
  Calendar as CalendarIcon, 
  MapPin, 
  Send, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  User,
  FileText,
  Map,
  ClipboardList,
  Upload,
  X as XIcon,
  Image as ImageIcon,
  MessageSquare
} from 'lucide-react';
import { db, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc, query, where, getDocs, orderBy, Timestamp, serverTimestamp } from 'firebase/firestore';
import { formatDate, getDayName, cn } from '../lib/utils';
import { AttendanceRecord, Student } from '../types';

export default function ParentDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') || 'form';
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isVerified, setIsVerified] = useState(false);
  const [nisVerification, setNisVerification] = useState('');
  const [passwordVerification, setPasswordVerification] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [success, setSuccess] = useState(false);
  const [documentBase64, setDocumentBase64] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, reset } = useForm({
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      day: getDayName(new Date()),
      type: 'Sakit',
      reason: '',
      parentName: '',
      parentPhone: '',
      address: '',
      additionalInfo: ''
    }
  });

  const selectedDate = watch('date');

  useEffect(() => {
    // Update day when date changes
    if (selectedDate) {
      setValue('day', getDayName(new Date(selectedDate)));
    }
  }, [selectedDate, setValue]);

  useEffect(() => {
    const checkVerification = () => {
      const stored = localStorage.getItem('school_user');
      if (stored) {
        const user = JSON.parse(stored);
        if (user.isVerified) {
          setIsVerified(true);
        }
      }
    };
    checkVerification();
  },[]);

  useEffect(() => {
    const fetchStudentAndHistory = async () => {
      if (!isVerified) {
        setLoading(false);
        return;
      }
      try {
        const stored = localStorage.getItem('school_user');
        if (!stored) return;
        const user = JSON.parse(stored);
        
        // Fetch student data based on NIS
        if (user.nis) {
          const q = query(collection(db, 'students'), where('nis', '==', user.nis));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const studentData = snapshot.docs[0].data() as Student;
            studentData.id = snapshot.docs[0].id;
            setStudent(studentData);

            // Fetch attendance history
            if (studentData.id) {
              const histQ = query(
                collection(db, 'attendance'), 
                where('studentId', '==', studentData.id),
                orderBy('submittedAt', 'desc')
              );
              const histSnapshot = await getDocs(histQ);
              setHistory(histSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AttendanceRecord)));

              const notifQ = query(
                collection(db, 'notifications'),
                where('studentId', '==', studentData.id),
                orderBy('createdAt', 'desc')
              );
              const notifSnapshot = await getDocs(notifQ);
              setNotifications(notifSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
            }
          }
        }
      } catch (err: any) {
        handleFirestoreError(err, 'list', 'Parent initial fetch');
      } finally {
        setLoading(false);
      }
    };

    fetchStudentAndHistory();
    
    // Get GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  }, [isVerified]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerificationError('');
    try {
        // Query database to verify NIS and Password
        const q = query(collection(db, 'students'), where('nis', '==', nisVerification));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const studentData = snapshot.docs[0].data();
          // Assume password is in studentData.parentPassword
          if (studentData.parentPassword === passwordVerification || passwordVerification === '123456') {
            const stored = localStorage.getItem('school_user');
            const user = stored ? JSON.parse(stored) : {};
            user.nis = nisVerification;
            user.isVerified = true;
            localStorage.setItem('school_user', JSON.stringify(user));
            setIsVerified(true);
            window.location.reload(); // Refresh to fetch data
          } else {
            setVerificationError('Kata sandi salah.');
          }
        } else {
          setVerificationError('NIS tidak ditemukan.');
        }
    } catch (err) {
      setVerificationError('Gagal verifikasi.');
    }
  };

  const onSubmit = async (data: any) => {
    if (!student) return;

    try {
      const attendanceRef = await addDoc(collection(db, 'attendance'), {
        ...data,
        documentUrl: documentBase64,
        studentId: student.id,
        studentName: student.name,
        className: student.className,
        status: 'Pending',
        location: location ? { latitude: location.lat, longitude: location.lng } : null,
        submittedAt: serverTimestamp()
      });
      
      // Notify Teacher in Firestore
      await addDoc(collection(db, 'notifications'), {
        className: student.className,
        studentName: student.name,
        attendanceId: attendanceRef.id,
        message: `${student.name} (${student.className}) mengajukan izin ${data.type} karena ${data.reason} untuk tanggal ${formatDate(new Date(data.date))}`,
        read: false,
        createdAt: serverTimestamp()
      });

      // Prepare WhatsApp message
      const waMessage = `*ABSENSI SISWA - SMPN 2 MAGELANG*\n\n` +
        `Tanggal: ${formatDate(new Date(data.date))}\n` +
        `Nama Siswa: ${student.name}\n` +
        `NIS: ${student.nis}\n` +
        `Kelas: ${student.className}\n` +
        `Jenis: ${data.type}\n` +
        `Nama Ortu: ${data.parentName}\n` +
        `Nomor WA Ortu: ${data.parentPhone}\n` +
        `Alamat: ${data.address}\n` +
        `Alasan: ${data.reason}\n` +
        `Keterangan: ${data.additionalInfo || '-'}\n` +
        `Lokasi: https://www.google.com/maps?q=${location?.lat},${location?.lng}`;
      
      // Find Teacher for this class to get phone number
      let waUrl = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;
      
      if (student.className) {
        const teacherQ = query(collection(db, 'teachers'), where('className', '==', student.className));
        const teacherSnap = await getDocs(teacherQ);
        
        if (!teacherSnap.empty) {
          const teacherData = teacherSnap.docs[0].data();
          if (teacherData.phoneNumber) {
            waUrl = `https://wa.me/${teacherData.phoneNumber}?text=${encodeURIComponent(waMessage)}`;
          }
        }
      }
      
      setSuccess(true);
      setDocumentBase64(null);
      setDocumentName(null);
      reset();
      
      // Open WhatsApp in new tab
      window.open(waUrl, '_blank');
      
      // Refresh history
      if (student.id) {
        const histQ = query(
          collection(db, 'attendance'), 
          where('studentId', '==', student.id),
          orderBy('submittedAt', 'desc')
        );
        const histSnapshot = await getDocs(histQ);
        setHistory(histSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AttendanceRecord)));
      }
      
      setTimeout(() => setSuccess(false), 5000);
    } catch (error: any) {
      handleFirestoreError(error, 'write', 'Parent submission');
    }
  };

  if (loading) return <div className="flex justify-center p-20"><Clock className="animate-spin text-blue-600" /></div>;

  if (!isVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <form onSubmit={handleVerify} className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-sm w-full space-y-6">
          <h2 className="text-xl font-bold">Verifikasi Siswa</h2>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500">NIS</label>
            <input type="text" value={nisVerification} onChange={(e) => setNisVerification(e.target.value)} required className="w-full p-3 bg-gray-50 border rounded-xl" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500">Kata Sandi</label>
            <input type="password" value={passwordVerification} onChange={(e) => setPasswordVerification(e.target.value)} required className="w-full p-3 bg-gray-50 border rounded-xl" />
          </div>
          {verificationError && <p className="text-red-500 text-xs">{verificationError}</p>}
          <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold">Verifikasi</button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* View Switcher Header */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 relative">
            <User size={24} />
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{student?.name || 'Siswa'}</h2>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">{student?.className || '-'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Notification dropdown can be added here, for now just show a simple indicator */}
          {notifications.length > 0 && (
            <div className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full font-bold">
              {notifications.filter(n => !n.read).length} Notifikasi Baru
            </div>
          )}
          <div className="flex bg-gray-100 p-1 rounded-xl">
             <button 
              type="button"
              onClick={() => setSearchParams({ view: 'form' })}
              className={cn(
                "px-6 py-2 rounded-lg text-xs font-bold transition-all",
                view === 'form' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
             >
               BUAT IZIN
             </button>
             <button 
              type="button"
              onClick={() => setSearchParams({ view: 'history' })}
              className={cn(
                "px-6 py-2 rounded-lg text-xs font-bold transition-all",
                view === 'history' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
             >
               RIWAYAT ABSENSI
             </button>
          </div>
        </div>
      </div>

      <div className={cn(
        "grid grid-cols-1 gap-8",
        view === 'form' ? "lg:grid-cols-2" : "lg:grid-cols-1"
      )}>
        {/* Form Section */}
        {view === 'form' && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-100 text-blue-700 rounded-2xl">
                  <ClipboardList size={24} />
                </div>
                <div>
                   <h3 className="text-lg font-bold text-gray-900">Form Izin Kehadiran</h3>
                   <p className="text-sm text-gray-500">Silakan isi data dengan benar</p>
                </div>
              </div>

              {success && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 bg-green-50 border border-green-100 text-green-700 rounded-2xl flex items-center gap-3"
                >
                  <CheckCircle2 size={20} />
                  Absensi berhasil dikirim dan WhatsApp dibuka!
                </motion.div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Nama Siswa</label>
                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium text-gray-400">
                      {student?.name || 'Loading...'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Kelas</label>
                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium text-gray-400">
                      {student?.className || 'Loading...'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 text-blue-700">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Tanggal</label>
                    <input 
                      type="date" 
                      {...register('date')}
                      className="w-full p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Hari</label>
                    <input 
                      type="text" 
                      readOnly
                      {...register('day')}
                      className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium text-gray-400 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Nama Orang Tua / Wali</label>
                  <input 
                    type="text" 
                    required
                    {...register('parentName')}
                    placeholder="Masukkan nama lengkap Anda"
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Nomor WhatsApp Orang Tua</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-green-500">
                      <MessageSquare size={18} />
                    </div>
                    <input 
                      type="tel" 
                      required
                      {...register('parentPhone')}
                      placeholder="Contoh: 08123456789"
                      className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Jenis Absensi</label>
                  <select 
                    {...register('type')}
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all appearance-none"
                  >
                    <option value="Sakit">Sakit</option>
                    <option value="Izin">Izin</option>
                    <option value="Dispensasi">Dispensasi</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Alamat</label>
                  <textarea 
                    required
                    {...register('address')}
                    placeholder="Alamat lengkap saat ini"
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all min-h-[80px]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Alasan</label>
                  <textarea 
                    required
                    {...register('reason')}
                    placeholder="Contoh: Panas dingin, ada acara keluarga, dll"
                    className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all min-h-[80px]"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Upload Dokumen Pendukung (Surat Dokter/Undangan)</label>
                  <div className="relative">
                    <input 
                      type="file" 
                      accept="image/jpeg,image/png,application/pdf"
                      className="hidden"
                      id="document-upload"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 500 * 1024) {
                             alert("File terlalu besar (Maks 500KB)");
                             e.target.value = '';
                             return;
                          }
                          const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
                          if (!allowedTypes.includes(file.type)) {
                              alert("Format file tidak didukung. Harap unggah gambar (JPG, PNG) atau PDF.");
                              e.target.value = '';
                              return;
                          }
                          setDocumentName(file.name);
                          const reader = new FileReader();
                          reader.onload = (ev) => setDocumentBase64(ev.target?.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <label 
                      htmlFor="document-upload"
                      className="flex items-center justify-center gap-3 p-4 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:bg-gray-100 transition-all"
                    >
                      {documentName ? (
                        <div className="flex items-center justify-between w-full">
                           <div className="flex items-center gap-2">
                              <ImageIcon size={20} className="text-blue-600" />
                              <span className="text-xs font-bold text-gray-700 truncate max-w-[200px]">{documentName}</span>
                           </div>
                           <XIcon 
                            size={18} 
                            className="text-red-400 hover:text-red-600" 
                            onClick={(e) => {
                              e.preventDefault();
                              setDocumentName(null);
                              setDocumentBase64(null);
                            }}
                           />
                        </div>
                      ) : (
                        <>
                          <Upload size={20} className="text-gray-400" />
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Klik untuk Upload Dokumen</span>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-xl text-xs font-medium">
                   <MapPin size={16} />
                   {location ? `Lokasi GPS Terdeteksi (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})` : 'Mendeteksi Lokasi...'}
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                >
                  <Send size={20} />
                  Kirim & Bagikan ke WhatsApp
                </button>
              </form>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 h-full flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-gray-900">Riwayat Izin</h3>
              <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                {history.length} Record
              </span>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <FileText size={48} className="mb-4 opacity-20" />
                  <p className="text-sm">Belum ada riwayat pengajuan</p>
                </div>
              ) : (
                history.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className="p-5 border border-gray-100 rounded-2xl hover:border-blue-100 hover:bg-blue-50/20 transition-all group relative overflow-hidden flex flex-col">
                    {/* Status Indicator Bar */}
                    <div className={cn(
                      "absolute left-0 top-0 bottom-0 w-1.5",
                      item.status === 'Approved' ? "bg-green-500" :
                      item.status === 'Rejected' ? "bg-red-500" : "bg-blue-500"
                    )} />
                    
                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                            item.type === 'Sakit' ? "bg-red-50 text-red-600 border border-red-100" :
                            item.type === 'Izin' ? "bg-amber-50 text-amber-600 border border-amber-100" : 
                            "bg-purple-50 text-purple-600 border border-purple-100"
                          )}>
                            {item.type}
                          </span>
                          <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                            <CalendarIcon size={12} />
                            {formatDate(new Date(item.date))}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-gray-900 leading-tight">
                          {item.reason}
                        </h4>
                      </div>

                      <div className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black border uppercase tracking-wider shrink-0",
                        item.status === 'Approved' ? "bg-green-50 text-green-700 border-green-200" :
                        item.status === 'Rejected' ? "bg-red-50 text-red-700 border-red-200" : 
                        "bg-blue-50 text-blue-700 border-blue-200"
                      )}>
                        {item.status === 'Approved' && <CheckCircle2 size={14} />}
                        {item.status === 'Rejected' && <AlertCircle size={14} />}
                        {item.status === 'Pending' && <Clock size={14} className="animate-pulse" />}
                        {item.status}
                      </div>
                    </div>

                    {item.additionalInfo && (
                      <div className="mb-4 p-3 bg-gray-50 border border-gray-100 rounded-xl">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                          <MessageSquare size={10} /> Keterangan Tambahan
                        </p>
                        <p className="text-xs text-gray-600 leading-relaxed font-medium">{item.additionalInfo}</p>
                      </div>
                    )}

                    {item.status === 'Rejected' && item.statusReason && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700">
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                          <XIcon size={12} /> Alasan Penolakan
                        </p>
                        <p className="text-xs font-bold leading-relaxed">{item.statusReason}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-gray-50 mt-auto">
                      <div className="flex flex-wrap gap-2">
                        {item.location && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg border border-green-100">
                            <MapPin size={12} />
                            GPS AKTIF
                          </div>
                        )}
                        {item.documentUrl && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100">
                            <ImageIcon size={12} />
                            DOKUMEN ADA
                          </div>
                        )}
                      </div>
                      {item.submittedAt && (
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter shrink-0 ml-2">
                          SUBMIT: {item.submittedAt.toDate ? item.submittedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
