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
  Calendar,
  Clock,
  User,
  FileText,
  Map,
  ClipboardList,
  Upload,
  X as XIcon,
  Image as ImageIcon,
  Camera,
  MessageSquare,
  Bell,
  BellRing,
  Trash2,
  RefreshCw,
  ArrowUpDown
} from 'lucide-react';
import { db, auth, handleFirestoreError, storage } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  Timestamp, 
  serverTimestamp,
  updateDoc,
  doc,
  onSnapshot
} from 'firebase/firestore';
import { formatDate, getDayName, cn } from '../lib/utils';
import { ParentAttendanceReport } from '../components/ParentAttendanceReport';
import { AttendanceRecord, Student } from '../types';
import SimpleNotification from '../components/SimpleNotification';
import { getTenantCollection, getTenantDoc, getSchoolCode } from '../lib/tenant';

export default function ParentDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') || 'form';
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: 'date' | 'type' | 'status'; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

  const sortedHistory = React.useMemo(() => {
    return [...history].sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      
      if (key === 'date') {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return (dateA - dateB) * direction;
      }
      
      const valA = String(a[key] || '').toLowerCase();
      const valB = String(b[key] || '').toLowerCase();
      return valA.localeCompare(valB) * direction;
    });
  }, [history, sortConfig]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [toastNotif, setToastNotif] = useState<{title: string, message: string} | null>(null);
  const isInitialNotif = React.useRef(true);
  const [success, setSuccess] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentBase64, setDocumentBase64] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState<string>('');
  const [teacherPhone, setTeacherPhone] = useState<string>('');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<AttendanceRecord | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);

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

          // Limit dimensions while maintaining aspect ratio
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
          const targetSize = 500 * 1024; // 500 KB

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

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      day: getDayName(new Date()),
      isRange: false,
      endDate: new Date().toISOString().split('T')[0],
      type: 'Sakit',
      reason: '',
      parentName: '',
      parentPhone: '',
      address: '',
      additionalInfo: ''
    }
  });

  const selectedDate = watch('date');
  const isRange = watch('isRange');

  useEffect(() => {
    // Update day when date changes
    if (selectedDate) {
      setValue('day', getDayName(new Date(selectedDate)));
    }
  }, [selectedDate, setValue]);

  useEffect(() => {
    // Wait for auth to be initialized
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        // We can now proceed with data fetching if authenticated (even anonymously)
        fetchStudentAndHistory();
    });

    const fetchStudentAndHistory = async () => {
      try {
        const stored = localStorage.getItem('school_user');
        if (!stored) return;
        const user = JSON.parse(stored);
        
        // Fetch student data based on NIS
        if (user.nis) {
          const q = query(getTenantCollection('students'), where('nis', '==', user.nis));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const studentData = snapshot.docs[0].data() as Student;
            studentData.id = snapshot.docs[0].id;
            setStudent(studentData);

            if (studentData.className) {
                const teacherQ = query(getTenantCollection('teachers'), where('className', '==', studentData.className));
                const teacherSnap = await getDocs(teacherQ);
                if (!teacherSnap.empty) {
                    const tData = teacherSnap.docs[0].data();
                    setTeacherName(tData.name || '');
                    setTeacherPhone(tData.phoneNumber || '');
                }
            }

            // Fetch attendance history in real-time
            if (studentData.id) {
              const histQ = query(
                getTenantCollection('attendance'), 
                where('studentId', '==', studentData.id),
                orderBy('submittedAt', 'desc')
              );
              
              const unsubHist = onSnapshot(histQ, (snapshot) => {
                setHistory(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AttendanceRecord)));
              }, (error) => handleFirestoreError(error, 'list', 'attendance_history'));

              const notifQ = query(
                getTenantCollection('notifications'),
                where('studentId', '==', studentData.id),
                orderBy('createdAt', 'desc')
              );

              const unsubNotif = onSnapshot(notifQ, (snapshot) => {
                const newNotifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setNotifications(newNotifs);

                if (isInitialNotif.current) {
                  isInitialNotif.current = false;
                  return;
                }

                snapshot.docChanges().forEach(change => {
                  if (change.type === 'added') {
                    const data = change.doc.data();
                    if (!data.read) {
                      setToastNotif({ 
                        title: data.title || 'Informasi Baru', 
                        message: data.message || 'Ada pembaruan status absensi' 
                      });
                      setTimeout(() => setToastNotif(null), 5000);
                    }
                  }
                });
              }, (error) => handleFirestoreError(error, 'list', 'notifications'));

              // Fetch tasks for the class
              const tasksQ = query(
                getTenantCollection('tasks'),
                where('className', '==', studentData.className),
                where('status', '==', 'Aktif'),
                orderBy('dueDate', 'asc')
              );
              const unsubTasks = onSnapshot(tasksQ, (snapshot) => {
                setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
              }, (error) => handleFirestoreError(error, 'list', 'tasks'));

              return () => {
                unsubHist();
                unsubNotif();
                unsubTasks();
              };
            }
          }
        }
      } catch (err: any) {
        handleFirestoreError(err, 'list', 'Parent initial fetch');
      } finally {
        setLoading(false);
      }
    };
    
    // Cleanup auth subscription
    return () => unsubscribeAuth();
    
    // Get GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  }, []);

  const onSubmit = async (data: any) => {
    if (!student) return;

    try {
      const dates = [];
      if (data.isRange && data.endDate) {
        let start = new Date(data.date);
        let end = new Date(data.endDate);
        
        // Safety break for extremely large ranges
        let count = 0;
        const current = new Date(start);
        while (current <= end && count < 31) {
          dates.push(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
          count++;
        }
      } else {
        dates.push(data.date);
      }

      if (dates.length === 0) {
        alert("Pilih rentang tanggal yang valid!");
        return;
      }

      let uploadedUrl = documentBase64;
      if (documentFile) {
         try {
            const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
            const { storage } = await import('../lib/firebase');
            
            const fileExtension = documentFile.name.split('.').pop();
            const fileName = `attendance_docs/${student.id}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExtension}`;
            const storageRef = ref(storage, fileName);
            
            await uploadBytes(storageRef, documentFile);
            uploadedUrl = await getDownloadURL(storageRef);
         } catch (err) {
            console.error("Error uploading file:", err);
            alert("Gagal mengunggah dokumen. Silahkan coba lagi.");
            return;
         }
      }

      // Submit through Automatic API (handles Firestore + WA Notifications)
      const response = await fetch('/api/attendance/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: getSchoolCode(),
          studentId: student.id,
          studentName: student.name,
          className: student.className,
          dates,
          type: data.type,
          reason: data.reason,
          parentName: data.parentName,
          parentPhone: data.parentPhone,
          address: data.address,
          additionalInfo: data.additionalInfo,
          documentUrl: uploadedUrl,
          location: location ? { latitude: location.lat, longitude: location.lng } : null
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Gagal mengirim pengajuan absensi");
      }
      
      const dateString = dates.length > 1 
        ? `${formatDate(new Date(dates[0]))} s/d ${formatDate(new Date(dates[dates.length - 1]))}`
        : formatDate(new Date(dates[0]));

      // Prepare WhatsApp manual message as secondary action
      const waMessage = `*ABSENSI SISWA - SMPN 2 MAGELANG*\n\n` +
        `Tanggal: ${dateString}\n` +
        `Nama Siswa: ${student.name}\n` +
        `NIS: ${student.nis}\n` +
        `Kelas: ${student.className}\n` +
        `Wali Kelas: ${teacherName}\n` +
        `Nomor WA Wali Kelas: ${teacherPhone}\n` +
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
        const teacherQ = query(getTenantCollection('teachers'), where('className', '==', student.className));
        const teacherSnap = await getDocs(teacherQ);
        
        if (!teacherSnap.empty) {
          const teacherData = teacherSnap.docs[0].data();
          if (teacherData.phoneNumber) {
            let formattedPhone = String(teacherData.phoneNumber).replace(/\D/g, '');
            if (formattedPhone.startsWith('0')) {
              formattedPhone = '62' + formattedPhone.substring(1);
            } else if (formattedPhone.startsWith('8')) {
              formattedPhone = '62' + formattedPhone;
            }
            waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(waMessage)}`;
          }
        }
      }
      
      setSuccess(true);
      setDocumentBase64(null);
      setDocumentName(null);
      reset();
      
      // Open WhatsApp in new tab
      window.open(waUrl, '_blank');
      alert('Berhasil! Pesan WhatsApp telah terkirim.');
      
      // Refresh history
      if (student.id) {
        const histQ = query(
          getTenantCollection('attendance'), 
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

  return (
    <div className="space-y-6">
      {toastNotif && (
        <div className="fixed top-24 right-6 z-[100] max-w-sm">
            <SimpleNotification 
                title={toastNotif.title}
                message={toastNotif.message}
                onClose={() => setToastNotif(null)}
            />
        </div>
      )}
      {/* View Switcher Header */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white relative shadow-xl shadow-blue-100">
            <User size={32} />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-4 border-white"></div>
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Selamat Datang, Orang Tua {student?.name}</h2>
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-green-50 px-2.5 py-1 rounded-full border border-green-100 shadow-sm">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] font-black text-green-700 uppercase tracking-widest">Online</span>
                </div>
                <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{student?.className || '-'}</p>
              </div>
              <p className="text-xs text-gray-500 font-medium">Akses informasi kehadiran dan perkembangan administrasi presensi anak Anda.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Notification dropdown can be added here, for now just show a simple indicator */}
          {notifications.filter(n => !n.read).length > 0 && (
            <div className="text-[10px] bg-red-100 text-red-700 px-3 py-1 rounded-full font-black uppercase tracking-widest animate-pulse">
              {notifications.filter(n => !n.read).length} Notifikasi Baru
            </div>
          )}
          <div className="flex bg-gray-100 p-1.5 rounded-2xl border border-gray-100">
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
             <button 
              type="button"
              onClick={() => setSearchParams({ view: 'report' })}
              className={cn(
                "px-6 py-2 rounded-lg text-xs font-bold transition-all",
                view === 'report' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
             >
               LAPORAN
             </button>
             <button 
              type="button"
              onClick={() => setSearchParams({ view: 'tasks' })}
              className={cn(
                "px-6 py-2 rounded-lg text-xs font-bold transition-all",
                view === 'tasks' ? "bg-white text-green-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
             >
               TUGAS SISWA
             </button>
             <button 
              type="button"
              onClick={() => setSearchParams({ view: 'notifications' })}
              className={cn(
                "px-6 py-2 rounded-lg text-xs font-bold transition-all relative",
                view === 'notifications' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
             >
               NOTIFIKASI
               {notifications.filter(n => !n.read).length > 0 && (
                 <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full animate-bounce">
                   {notifications.filter(n => !n.read).length}
                 </span>
               )}
             </button>
          </div>
        </div>
      </div>

      <div className={cn(
        "grid grid-cols-1 gap-8",
        view === 'form' ? "lg:grid-cols-2" : "lg:grid-cols-1"
      )}>
        {view === 'report' && student && (
          <div className="w-full">
            <ParentAttendanceReport student={student} history={history} />
          </div>
        )}

        {view === 'tasks' && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
               <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 bg-green-100 text-green-600 rounded-2xl shadow-lg shadow-green-50">
                    <FileText size={24} />
                  </div>
                  <div>
                     <h3 className="text-lg font-bold text-gray-900">Tugas Siswa</h3>
                     <p className="text-sm text-gray-500">Daftar tugas yang diberikan oleh Bapak/Ibu Guru Mata Pelajaran</p>
                  </div>
               </div>

                {tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-20 text-gray-300">
                      <FileText size={64} className="mb-4 opacity-10 text-green-500" />
                      <p className="text-sm font-bold uppercase tracking-widest">Belum ada tugas untuk kelas ini</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] uppercase font-black text-green-600 bg-green-50/50 border-b border-green-100">
                        <tr>
                          <th className="px-6 py-4">Mata Pelajaran</th>
                          <th className="px-6 py-4">Judul Tugas</th>
                          <th className="px-6 py-4">Deskripsi</th>
                          <th className="px-6 py-4">Tenggat</th>
                          <th className="px-6 py-4">Guru</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {tasks.map((task, idx) => (
                          <tr key={`parent-task-${task.id || 't'}-${idx}`} className="hover:bg-green-50/20 transition-colors group">
                            <td className="px-6 py-4">
                              <span className="px-3 py-1 bg-green-50 text-green-700 text-[10px] font-black uppercase tracking-widest rounded-full border border-green-100 shadow-sm">
                                {task.subjectName}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-bold text-gray-900 group-hover:text-green-600 transition-colors">{task.title}</td>
                            <td className="px-6 py-4 text-xs text-gray-600 max-w-[200px] truncate">{task.description || '-'}</td>
                            <td className="px-6 py-4 font-bold text-orange-600 whitespace-nowrap">{formatDate(task.dueDate)}</td>
                            <td className="px-6 py-4 text-xs font-semibold text-gray-500">{task.teacherName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </div>
          </div>
        )}
        
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

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Student Info Group */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nama Siswa</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-hover:text-blue-500 transition-colors">
                        <User size={16} />
                      </div>
                      <div className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-gray-500">
                        {student?.name || 'Loading...'}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Kelas</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-hover:text-blue-500 transition-colors">
                        <ClipboardList size={16} />
                      </div>
                      <div className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-gray-500">
                        {student?.className || 'Loading...'}
                      </div>
                    </div>
                  </div>

                  {/* Teacher Info Group */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Wali Kelas</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-hover:text-blue-500 transition-colors">
                        <User size={16} />
                      </div>
                      <div className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-gray-500">
                        {teacherName || '-'}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp Wali Kelas</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-hover:text-blue-500 transition-colors">
                        <MessageSquare size={16} />
                      </div>
                      <div className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-gray-400">
                        {teacherPhone || '-'}
                      </div>
                    </div>
                  </div>

                  {/* Date Group */}
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-3 bg-blue-50/50 p-3 rounded-2xl border border-blue-100/50">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          id="isRange"
                          {...register('isRange')}
                          className="w-4 h-4 rounded border-blue-200 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="isRange" className="text-xs font-bold text-blue-800 cursor-pointer">Izin lebih dari 1 hari?</label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                          {isRange ? 'Mulai Tanggal' : 'Tanggal Izin'}
                        </label>
                        <div className="relative group">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-blue-500">
                            <CalendarIcon size={16} />
                          </div>
                          <input 
                            type="date" 
                            {...register('date')}
                            className="w-full pl-10 pr-3 py-3 bg-blue-50/30 border border-blue-100 rounded-2xl text-sm font-bold text-blue-900 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                          />
                        </div>
                      </div>

                      {isRange && (
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="space-y-2"
                        >
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Sampai Tanggal</label>
                          <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-blue-500">
                              <CalendarIcon size={16} />
                            </div>
                            <input 
                              type="date" 
                              {...register('endDate')}
                              min={selectedDate}
                              className="w-full pl-10 pr-3 py-3 bg-blue-50/30 border border-blue-100 rounded-2xl text-sm font-bold text-blue-900 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                            />
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Hari</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <Clock size={16} />
                      </div>
                      <input 
                        type="text" 
                        readOnly
                        {...register('day')}
                        className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-gray-400 outline-none"
                      />
                    </div>
                  </div>

                  {/* Parent Info Group */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nama Orang Tua / Wali</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-hover:text-blue-500 transition-colors">
                        <User size={16} />
                      </div>
                      <input 
                        type="text" 
                        required
                        {...register('parentName')}
                        placeholder="Contoh: Budi Santoso"
                        className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all placeholder:text-gray-300"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp Orang Tua</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-green-500">
                        <MessageSquare size={16} />
                      </div>
                      <input 
                        type="tel" 
                        required
                        {...register('parentPhone')}
                        placeholder="Contoh: 08123456789"
                        className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all placeholder:text-gray-300"
                      />
                    </div>
                  </div>

                  {/* Type Group */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Jenis Absensi</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-blue-500">
                        <AlertCircle size={16} />
                      </div>
                      <select 
                        {...register('type')}
                        className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all appearance-none cursor-pointer"
                      >
                        <option value="Sakit">Sakit</option>
                        <option value="Izin">Izin</option>
                        <option value="Dispensasi">Dispensasi</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                        <ClipboardList size={14} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Lokasi Presensi</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-blue-500">
                        <MapPin size={16} />
                      </div>
                      <div className="w-full pl-10 pr-3 py-3 bg-blue-50/50 border border-blue-100 rounded-2xl text-[11px] font-bold text-blue-700 truncate">
                        {location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : 'Mendeteksi GPS...'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Alamat Lengkap</label>
                  <div className="relative group">
                    <div className="absolute top-3 left-3 text-gray-400 group-hover:text-blue-500 transition-colors">
                      <Map size={16} />
                    </div>
                    <textarea 
                      required
                      {...register('address')}
                      placeholder="Masukkan alamat lengkap saat pengajuan izin ini..."
                      className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all min-h-[100px] placeholder:text-gray-300 resize-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Alasan Detail</label>
                  <div className="relative group">
                    <div className="absolute top-3 left-3 text-gray-400 group-hover:text-blue-500 transition-colors">
                      <FileText size={16} />
                    </div>
                    <textarea 
                      required
                      {...register('reason')}
                      placeholder="Jelaskan alasan secara detail (Contoh: Mengalami demam tinggi sejak pagi)..."
                      className="w-full pl-10 pr-3 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all min-h-[100px] placeholder:text-gray-300 resize-none"
                    />
                  </div>
                </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Wajib melampirkan Dokumen (Surat Izin/ Surat Dokter/Surat DISPENSASI) - Maks 500 KB</label>
                    <p className="text-[9px] text-orange-500 font-bold ml-1 mb-2 italic">* Dokumen bukti akan dihapus secara otomatis dari sistem pada akhir semester (akhir bulan Juni & Desember) untuk menghemat ruang penyimpanan.</p>
                    
                    {documentName || documentBase64 ? (
                      <div className="flex items-center justify-between w-full p-4 bg-blue-50 border border-blue-200 rounded-3xl">
                         <div className="flex items-center gap-3">
                            <div className="p-2 bg-white rounded-xl shadow-sm">
                              {documentBase64?.startsWith('data:application/pdf') ? <FileText size={20} className="text-blue-600" /> : <ImageIcon size={20} className="text-blue-600" />}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-gray-700 truncate max-w-[150px] uppercase tracking-tighter">
                                {documentName || 'Foto Kamera'}
                              </span>
                              <span className="text-[8px] font-bold text-blue-400 uppercase tracking-widest">Siap dikirim</span>
                            </div>
                         </div>
                         <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setDocumentName(null);
                            setDocumentBase64(null);
                            setDocumentFile(null);
                          }}
                          className="p-3 bg-white text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm border border-red-100"
                         >
                          <Trash2 size={18} />
                         </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                      {isCompressing ? (
                        <div className="col-span-2 py-8 flex flex-col items-center justify-center bg-blue-50 border border-blue-100 rounded-3xl animate-pulse">
                           <RefreshCw className="animate-spin text-blue-600 mb-2" size={24} />
                           <span className="text-[10px] font-black text-blue-700 uppercase tracking-[0.2em]">Mengompres File...</span>
                        </div>
                      ) : (
                        <>
                          <label 
                            htmlFor="document-upload"
                          className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group"
                        >
                          <input 
                            type="file" 
                            accept="image/jpeg,image/png,application/pdf"
                            className="hidden"
                            id="document-upload"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
                                if (!allowedTypes.includes(file.type)) {
                                    alert("Format file tidak didukung. Harap unggah gambar (JPG, PNG) atau PDF.");
                                    e.target.value = '';
                                    return;
                                }

                                if (file.type.startsWith('image/')) {
                                  setIsCompressing(true);
                                  try {
                                    const compressed = await compressImage(file, file.name);
                                    setDocumentName(compressed.name);
                                    setDocumentFile(compressed);
                                    const reader = new FileReader();
                                    reader.onload = (ev) => setDocumentBase64(ev.target?.result as string);
                                    reader.readAsDataURL(compressed);
                                  } catch (err) {
                                    console.error(err);
                                    alert("Gagal memproses gambar");
                                  } finally {
                                    setIsCompressing(false);
                                  }
                                } else {
                                  // PDF processing - only limit size as browser can't easily compress PDF
                                  if (file.size > 500 * 1024) {
                                    alert("File PDF terlalu besar (Maks 500 KB)");
                                    e.target.value = '';
                                    return;
                                  }
                                  setDocumentName(file.name);
                                  setDocumentFile(file);
                                  const reader = new FileReader();
                                  reader.onload = (ev) => setDocumentBase64(ev.target?.result as string);
                                  reader.readAsDataURL(file);
                                }
                              }
                            }}
                          />
                          <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-gray-400 group-hover:text-blue-600 shadow-sm transition-all">
                             <Upload size={20} />
                          </div>
                          <div className="text-center">
                            <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest group-hover:text-blue-600">Upload File</span>
                          </div>
                        </label>

                        <button 
                          type="button"
                          onClick={async () => {
                            try {
                              const stream = await navigator.mediaDevices.getUserMedia({ 
                                video: { facingMode: 'environment' } 
                              });
                              setCameraStream(stream);
                              setIsCameraOpen(true);
                            } catch (err) {
                              alert('Gagal mengakses kamera. Pastikan izin kamera telah diberikan.');
                            }
                          }}
                          className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group"
                        >
                          <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-gray-400 group-hover:text-blue-600 shadow-sm transition-all">
                             <Camera size={20} />
                          </div>
                          <div className="text-center">
                            <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest group-hover:text-blue-600">Ambil Foto</span>
                          </div>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

                <div className="pt-2">
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 active:scale-[0.98] disabled:opacity-70 disabled:cursor-wait"
                  >
                    {isSubmitting ? (
                       <>
                         <RefreshCw className="animate-spin" size={20} />
                         Mengirim Data...
                       </>
                    ) : (
                       <>
                         <Send size={20} />
                         Kirim Pengajuan Absensi
                       </>
                    )}
                  </button>
                  <p className="mt-3 text-center text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
                    * Notifikasi otomatis akan dikirim ke WhatsApp wali kelas.<br/>
                    * Aplikasi WhatsApp akan terbuka sebagai cadangan verifikasi.
                  </p>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 h-full flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="flex flex-col">
                <h3 className="text-lg font-bold text-gray-900">Riwayat Absensi</h3>
                <div className="flex gap-2 mt-2">
                  <select 
                    value={sortConfig.key}
                    onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value as any })}
                    className="text-[9px] font-black uppercase tracking-wider bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="date">TANGGAL</option>
                    <option value="type">JENIS</option>
                    <option value="status">STATUS</option>
                  </select>
                  <button 
                    onClick={() => setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                    className="p-1 bg-gray-50 border border-gray-100 rounded-lg hover:bg-gray-100 transition-all"
                    title="Ubah Arah Urutan"
                  >
                    <ArrowUpDown size={14} className="text-blue-600" />
                  </button>
                </div>
              </div>
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
                sortedHistory.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className="p-5 border border-gray-100 rounded-2xl hover:border-blue-100 hover:bg-blue-50/20 transition-all group relative overflow-hidden flex flex-col">
                    {/* Status Indicator Bar */}
                    <div className={cn(
                      "absolute left-0 top-0 bottom-0 w-1.5",
                      item.status === 'Approved' ? "bg-green-500" :
                      item.status === 'Rejected' ? "bg-red-500" : "bg-amber-500"
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
                        "bg-amber-50 text-amber-700 border-amber-200"
                      )}>
                        {item.status === 'Approved' ? <CheckCircle2 size={14} /> : 
                         item.status === 'Rejected' ? <XIcon size={14} /> : <Clock size={14} />}
                        {item.status === 'Approved' ? 'TERVERIFIKASI' :
                         item.status === 'Rejected' ? 'DITOLAK' : 'PENDING'}
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
                        <button 
                          onClick={() => { setSelectedHistoryItem(item); setShowDetailModal(true); }}
                          className="flex items-center gap-1.5 text-[10px] font-bold text-white bg-blue-600 px-2 py-1 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <FileText size={12} />
                          DETAIL LAPORAN
                        </button>
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

        {/* Notifications Section */}
        {view === 'notifications' && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
               <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
                      <Bell size={24} />
                    </div>
                    <div>
                       <h3 className="text-lg font-bold text-gray-900">Notifikasi Peninjauan</h3>
                       <p className="text-sm text-gray-500">Informasi terbaru mengenai status permohonan izin Anda</p>
                    </div>
                  </div>
                  <button 
                    onClick={async () => {
                      // Mark all as read
                      for (const n of notifications.filter(notif => !notif.read)) {
                        await updateDoc(getTenantDoc('notifications', n.id), { read: true });
                      }
                      setNotifications(prev => prev.map(p => ({...p, read: true})));
                    }}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    Tandai Semua Dibaca
                  </button>
               </div>

               <div className="space-y-4">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 text-gray-300">
                       <BellRing size={64} className="mb-4 opacity-10" />
                       <p className="text-sm font-bold uppercase tracking-widest">Belum ada notifikasi</p>
                    </div>
                  ) : (
                    notifications.map((n, i) => (
                      <div 
                        key={`parent-notif-${n.id || i}-${i}`} 
                        className={cn(
                          "p-4 rounded-2xl border transition-all flex items-start gap-4",
                          n.read ? "bg-white border-gray-100 opacity-60" : "bg-blue-50/50 border-blue-100 shadow-sm"
                        )}
                        onClick={async () => {
                          if (!n.read) {
                            await updateDoc(getTenantDoc('notifications', n.id), { read: true });
                            setNotifications(prev => prev.map(notif => notif.id === n.id ? {...notif, read: true} : notif));
                          }
                        }}
                      >
                        <div className={cn(
                          "p-2 rounded-xl shrink-0 mt-1",
                          n.title?.includes('Disetujui') ? "bg-green-100 text-green-600 border border-green-200" :
                          n.title?.includes('Ditolak') ? "bg-red-100 text-red-700 border border-red-200" : 
                          n.title?.includes('Baru') ? "bg-amber-100 text-amber-600 border border-amber-200" :
                          "bg-blue-100 text-blue-600 border border-blue-200"
                        )}>
                          {n.title?.includes('Disetujui') ? <CheckCircle2 size={18} /> :
                           n.title?.includes('Ditolak') ? <AlertCircle size={18} /> : 
                           n.title?.includes('Baru') ? <Calendar size={18} /> :
                           <Bell size={18} />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-tighter">
                              {n.title || 'Pemberitahuan'}
                            </h4>
                            <span className="text-[9px] font-bold text-gray-400">
                               {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : ''}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed font-medium">
                            {n.message}
                          </p>
                        </div>
                        {!n.read && (
                          <div className="w-2 h-2 bg-blue-600 rounded-full shrink-0 mt-2"></div>
                        )}
                      </div>
                    ))
                  )}
               </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Detail Laporan */}
      {showDetailModal && selectedHistoryItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-blue-600 text-white">
              <h3 className="font-bold flex items-center gap-2">
                <FileText size={20} />
                Detail Laporan
              </h3>
              <button 
                onClick={() => { setShowDetailModal(false); setSelectedHistoryItem(null); }}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
              >
                <XIcon size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-700">
                *ABSENSI SISWA - SMPN 2 MAGELANG*{'\n\n'}
                Tanggal: {formatDate(new Date(selectedHistoryItem.date))}{'\n'}
                Nama Siswa: {selectedHistoryItem.studentName}{'\n'}
                NIS: {student?.nis}{'\n'}
                Kelas: {selectedHistoryItem.className}{'\n'}
                Jenis: {selectedHistoryItem.type}{'\n'}
                Nama Ortu: {selectedHistoryItem.parentName}{'\n'}
                Nomor WA Ortu: {selectedHistoryItem.parentPhone}{'\n'}
                Alamat: {selectedHistoryItem.address}{'\n'}
                Alasan: {selectedHistoryItem.reason}{'\n'}
                Keterangan: {selectedHistoryItem.additionalInfo || '-'}{'\n\n'}
                Mohon kebijaksanaannya. Terima kasih.
              </div>
              
              {selectedHistoryItem.documentUrl && (
                <div className="mt-6 space-y-2">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Lampiran Dokumen</p>
                   {selectedHistoryItem.documentUrl.startsWith('data:application/pdf') ? (
                     <a 
                      href={selectedHistoryItem.documentUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center gap-3 p-4 bg-blue-50 text-blue-700 rounded-2xl border border-blue-100 font-bold text-sm hover:bg-blue-100 transition-all"
                     >
                        <FileText size={24} />
                        LIHAT DOKUMEN PDF
                     </a>
                   ) : (
                     <div className="rounded-2xl overflow-hidden border border-gray-100">
                        <img src={selectedHistoryItem.documentUrl} alt="Lampiran" className="w-full h-auto" />
                     </div>
                   )}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button 
                onClick={() => { setShowDetailModal(false); setSelectedHistoryItem(null); }}
                className="px-6 py-2.5 bg-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-300 transition-colors"
              >
                Tutup
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Camera Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col">
          <div className="relative flex-1 flex items-center justify-center bg-black">
            <video 
              ref={videoRef}
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
              onCanPlay={(e) => e.currentTarget.play()}
            />
            
            {/* Camera Overlay UI */}
            <div className="absolute inset-0 flex flex-col justify-between p-6">
              <div className="flex justify-between items-start">
                <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
                  <span className="text-white text-[10px] font-black uppercase tracking-[0.2em]">Mode Kamera Dokumen</span>
                </div>
                <button 
                  onClick={() => {
                    cameraStream?.getTracks().forEach(track => track.stop());
                    setCameraStream(null);
                    setIsCameraOpen(false);
                  }}
                  className="w-10 h-10 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all"
                >
                  <XIcon size={24} />
                </button>
              </div>

              <div className="flex flex-col items-center gap-8 mb-4">
                <div className="text-white/60 text-center space-y-1">
                   <p className="text-[10px] font-bold uppercase tracking-widest">Pastikan dokumen terlihat jelas dan terang</p>
                   {/* Capture Frame visual indicator */}
                   <div className="w-64 h-80 border-2 border-white/40 border-dashed rounded-3xl mx-auto"></div>
                </div>

                <div className="flex items-center gap-12">
                   <button 
                    onClick={async () => {
                      if (videoRef.current) {
                        const canvas = document.createElement('canvas');
                        canvas.width = videoRef.current.videoWidth;
                        canvas.height = videoRef.current.videoHeight;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                          ctx.drawImage(videoRef.current, 0, 0);
                          
                          // Convert to local blob for compression
                          canvas.toBlob(async (blob) => {
                             if (blob) {
                               const filename = `Foto_${new Date().getTime()}.jpg`;
                               setIsCompressing(true);
                               try {
                                 const compressed = await compressImage(blob, filename);
                                 setDocumentFile(compressed);
                                 setDocumentName(compressed.name);
                                 const reader = new FileReader();
                                 reader.onload = (ev) => setDocumentBase64(ev.target?.result as string);
                                 reader.readAsDataURL(compressed);
                               } catch (err) {
                                 console.error(err);
                                 alert("Gagal memproses foto");
                               } finally {
                                 setIsCompressing(false);
                               }
                             }
                          }, 'image/jpeg', 0.9);
                          
                          // Close camera
                          cameraStream?.getTracks().forEach(track => track.stop());
                          setCameraStream(null);
                          setIsCameraOpen(false);
                        }
                      }
                    }}
                    className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
                   >
                     <div className="w-16 h-16 border-4 border-blue-600 rounded-full flex items-center justify-center">
                        <Camera size={32} className="text-blue-600" />
                     </div>
                   </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
