import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { School, UserCircle, LogIn, ShieldCheck, ArrowRight, Eye, EyeOff, Scan, X, Camera, CheckCircle2, BarChart3, Clock, Bell } from 'lucide-react';
import { useAuthStore } from '../lib/auth-store';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signInAnonymously, updateProfile } from 'firebase/auth';
import { cn } from '../lib/utils';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { ROLE_LABELS } from '../constants';
import { UserRole } from '../types';

export default function Login() {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, login } = useAuthStore();

  useEffect(() => {
    // Handle query params for auto-fill login
    const nisParam = searchParams.get('nis');
    const nipParam = searchParams.get('nip');
    const idParam = searchParams.get('id');

    if (idParam || nisParam || nipParam) {
      setId(idParam || nisParam || nipParam || '');
    }
  }, [searchParams]);

  useEffect(() => {
    if (showScanner) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        try {
          scannerRef.current = new Html5QrcodeScanner(
            "qr-reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
          );
          
          scannerRef.current.render((decodedText) => {
            try {
              // Check if it's a URL with params
              if (decodedText.includes('?')) {
                const url = new URL(decodedText);
                const nis = url.searchParams.get('nis') || url.searchParams.get('id');
                const nip = url.searchParams.get('nip');
                if (nis || nip) {
                  setId(nis || nip || '');
                  setShowScanner(false);
                }
              } else {
                setId(decodedText);
                setShowScanner(false);
              }
            } catch (e) {
              setId(decodedText);
              setShowScanner(false);
            }
          }, (err) => {
            // Silently ignore scanner errors
          });
        } catch (err) {
          console.error("Scanner init failed", err);
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        if (scannerRef.current) {
          scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
        }
      };
    }
  }, [showScanner]);

  useEffect(() => {
    if (user) {
      const defaultPath = user.role === 'ADMIN' ? '/admin' : user.role === 'TEACHER' ? '/teacher' : user.role === 'COUNSELOR' ? '/admin' : user.role === 'SUBJECT_TEACHER' ? '/subject-teacher' : '/parent';
      navigate(defaultPath);
    }
  }, [user, navigate]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Specifically for Admin Google Login
      if (result.user.email === 'wiwitpurnomo24@guru.smp.belajar.id') {
          try {
            const { setDoc, doc, serverTimestamp } = await import('firebase/firestore');
            await setDoc(doc(db, 'users', result.user.uid), {
              name: result.user.displayName || 'Administrator',
              email: result.user.email,
              role: 'ADMIN',
              updatedAt: serverTimestamp()
            }, { merge: true });
          } catch (e) {
            console.error("Failed to sync admin user profile:", e);
          }

          login({ 
            uid: result.user.uid, 
            role: 'ADMIN',
            roles: ['ADMIN'],
            name: result.user.displayName || 'Administrator',
            email: result.user.email 
          });
          navigate('/admin');
      } else {
          setError('Email ini tidak terdaftar sebagai Administrator.');
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/network-request-failed') {
        setError('Gagal terhubung ke layanan autentikasi. Pastikan koneksi internet stabil.');
      } else {
        setError('Gagal masuk dengan Google: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (role: UserRole, loginId: string) => {
    setLoading(true);
    let name = '';
    let className = '';
    
    if (role === 'ADMIN') {
      name = loginId === 'wiwitpurnomo24@guru.smp.belajar.id' ? 'Administrator (Wiwit Purnomo)' : 'Admin Demo';
    }
    if (role === 'TEACHER') { name = 'Wali Kelas Demo'; className = '7A'; }
    if (role === 'COUNSELOR') { name = 'Guru BK Demo'; }
    if (role === 'SUBJECT_TEACHER') { name = 'Guru Mapel Demo'; }
    if (role === 'PARENT') { name = 'Orang Tua Demo'; className = '7A'; loginId = '12345'; }

    // Demo login: Skip Firebase session for simplicity
    login({ 
      uid: 'demo-user-' + Date.now(),
      role, 
      roles: [role],
      name, 
      nis: role === 'PARENT' ? loginId : undefined, 
      nip: (role === 'TEACHER' || role === 'COUNSELOR' || role === 'SUBJECT_TEACHER') ? loginId : undefined, 
      email: role === 'ADMIN' ? loginId : undefined, 
      className, 
      managedClasses: ['7A', '7B'] 
    });
    navigate(role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : role === 'SUBJECT_TEACHER' ? '/subject-teacher' : role === 'COUNSELOR' ? '/admin' : '/parent');
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const normalizedId = id.trim();
    const normalizedPassword = password.trim();

    try {
        // 1. Check if Teacher/Staff
        const teacherQ = query(collection(db, 'teachers'), where('nip', '==', normalizedId)); // Assuming username is NIP
        const teacherSnap = await getDocs(teacherQ);

        if (!teacherSnap.empty) {
            const teacherDoc = teacherSnap.docs[0];
            const teacherData = teacherDoc.data();
            // Try 'password' first, then 'SANDI'
            const passwordField = teacherData.password || teacherData['SANDI'] || '12345';
            
            if (passwordField === normalizedPassword) {
                // Determine roles based on document fields
                const roles: UserRole[] = [];
                if (teacherData.isWali) roles.push('TEACHER');
                if (teacherData.isSubjectTeacher) roles.push('SUBJECT_TEACHER');
                if (teacherData.isCounselor) roles.push('COUNSELOR');
                if (teacherData.isKepalaSekolah || teacherData.isWakilKepala) roles.push('ADMIN');

                // If no roles, set default
                if (roles.length === 0) {
                   if (Array.isArray(teacherData.status)) {
                      if (teacherData.status.includes('Wali Kelas')) roles.push('TEACHER');
                      if (teacherData.status.includes('Guru Mapel')) roles.push('SUBJECT_TEACHER');
                      if (teacherData.status.includes('Guru BK')) roles.push('COUNSELOR');
                   }
                }
                
                if (roles.length === 0) roles.push('TEACHER');

                const uid = teacherDoc.id; // Use teacher document ID as UID for consistency

                login({
                    uid: uid,
                    role: roles[0],
                    roles: roles,
                    nip: normalizedId,
                    name: teacherData.name,
                    className: teacherData.className,
                    subject: teacherData.subject
                });
                
                // Redirect
                const role = roles[0];
                navigate(role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : role === 'SUBJECT_TEACHER' ? '/subject-teacher' : '/admin');
                return;
            } else {
                setError('Username atau Password salah.');
                setLoading(false);
                return;
            }
        }
        
        // 2. Check if Parent/Student (NIS)
        const studentQ = query(collection(db, 'students'), where('nis', '==', normalizedId));
        const studentSnap = await getDocs(studentQ);
        
        if (!studentSnap.empty) {
            const studentDoc = studentSnap.docs[0];
            const studentData = studentDoc.data();
            // Try 'parentPassword' first, then 'SANDI ORTU'
            const passwordField = studentData.parentPassword || studentData['SANDI ORTU'] || '12345';
            
            if (passwordField === normalizedPassword) {
                 const roles: UserRole[] = ['PARENT'];
                 let activeRole: UserRole = 'PARENT';
                 
                 if (studentData.role === 'PETUGAS_ABSEN_KELAS') {
                   roles.push('PETUGAS_ABSEN_KELAS');
                   activeRole = 'PETUGAS_ABSEN_KELAS';
                 }

                 login({
                     uid: studentDoc.id,
                     role: activeRole,
                     roles: roles,
                     nis: normalizedId,
                     name: studentData.name,
                     className: studentData.className
                 });
                 
                 if (activeRole === 'PETUGAS_ABSEN_KELAS') {
                   navigate('/attendance-officer');
                 } else {
                   navigate('/parent');
                 }
                 return;
            } else {
                setError('Username atau Password salah.');
                setLoading(false);
                return;
            }
        }

        // 3. Check if Class Attendance Officer (Special Format: Class + AbsensiNo)
        // We will fetch ALL students who have the role or have a clean ID match
        const studentRef = collection(db, 'students');
        const allStudentsSnap = await getDocs(studentRef);
        
        const foundOfficerDoc = allStudentsSnap.docs.find(doc => {
            const data = doc.data();
            const cleanClassName = (data.className || '').replace(/\s+/g, '').toUpperCase();
            const paddedNo = String(data.absensiNo || '').padStart(2, '0');
            const officerId = `${cleanClassName}${paddedNo}`;
            
            // Priority 1: Check new explicit userId field
            if (data.userId && data.userId === normalizedId) return true;
            
            // Priority 2: Fallback to old format
            return officerId.toLowerCase() === normalizedId.toLowerCase();
        });

        if (foundOfficerDoc) {
            const studentData = foundOfficerDoc.data();
            // Important: Check if they are actually an officer
            console.log("DEBUG: Officer found, UID:", foundOfficerDoc.id, "Data:", JSON.stringify(studentData));
            if (studentData.role !== 'PETUGAS_ABSEN_KELAS') {
                 console.log("DEBUG: Role mismatched. Expected: PETUGAS_ABSEN_KELAS, Found:", studentData.role);
                 setError('Akun tidak memiliki akses Petugas Absensi Kelas.');
                 setLoading(false);
                 return;
            }

            // For officers, the password is their new password, then parentPassword or NIS or 12345
            const passwordField = studentData.password || studentData.parentPassword || studentData.nis || studentData['SANDI ORTU'] || '12345';
            
            if (passwordField === normalizedPassword) {
                 const roles: UserRole[] = ['PARENT', 'PETUGAS_ABSEN_KELAS'];
                 
                 login({
                     uid: foundOfficerDoc.id,
                     role: 'PETUGAS_ABSEN_KELAS',
                     roles: roles,
                     nis: studentData.nis,
                     name: studentData.name,
                     className: studentData.className
                 });
                 
                 navigate('/attendance-officer');
                 return;
            } else {
                setError('Username atau Password salah.');
                setLoading(false);
                return;
            }
        }

        setError('Username tidak ditemukan.');
    } catch (err: any) {
        handleFirestoreError(err, 'get', 'login');
        setError('Terjadi kesalahan sistem: ' + err.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row font-sans">
      {/* Visual Side */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 p-16 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-4 text-white mb-12">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-xl">
              <School size={40} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">SIAP</h1>
              <p className="text-blue-200 text-sm font-medium">Sistem Informasi Administrasi Presensi</p>
            </div>
          </div>
          
          <h2 className="text-4xl font-extrabold text-white leading-tight mb-10">
            Digitalisasi Absensi <br/> <span className="text-blue-300">Sekolah Anda</span>
          </h2>
          <ul className="space-y-6 text-blue-50 text-lg max-w-md">
            <li className="flex items-start gap-4">
                <CheckCircle2 className="mt-1 text-blue-400 flex-shrink-0" size={20} />
                <span>Monitoring kehadiran siswa dan guru real-time</span>
            </li>
            <li className="flex items-start gap-4">
                <BarChart3 className="mt-1 text-blue-400 flex-shrink-0" size={20} />
                <span>Analisis laporan absensi akurat</span>
            </li>
            <li className="flex items-start gap-4">
                <Clock className="mt-1 text-blue-400 flex-shrink-0" size={20} />
                <span>Manajemen izin dan dispensasi efisien</span>
            </li>
            <li className="flex items-start gap-4">
                <Bell className="mt-1 text-blue-400 flex-shrink-0" size={20} />
                <span>Notifikasi otomatis ke orang tua</span>
            </li>
          </ul>
        </div>

        <div className="relative z-10 text-blue-200/50 text-xs font-bold uppercase tracking-widest">
            © 2026 SIAP | Sistem Informasi Administrasi Presensi
        </div>

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600 rounded-full blur-3xl -mr-48 -mt-48 opacity-20" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-800 rounded-full blur-3xl -ml-40 -mb-40 opacity-20" />
      </div>

      {/* Login Side */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-10">
            <div className="md:hidden flex justify-center mb-6">
               <div className="w-16 h-16 bg-blue-700 text-white rounded-2xl flex items-center justify-center shadow-lg">
                  <School size={32} />
               </div>
            </div>
            <h3 className="text-3xl font-extrabold text-[#343a40] tracking-tight mb-2">SIAP</h3>
            <p className="text-sm font-bold text-blue-600 uppercase tracking-widest">Akses Masuk Sistem</p>
            <div className="h-1 w-12 bg-blue-600 mx-auto mt-4 rounded-full"></div>
          </div>

          <div className="flex flex-wrap gap-1 p-1 bg-gray-100 rounded-2xl mb-8">
            <h2 className="text-sm font-bold text-gray-700 w-full text-center py-2">Silakan Masuk</h2>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                Username (NIP / NIS)
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-600 transition-colors">
                   <LogIn size={20} />
                </div>
                <input
                  type="text"
                  required
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  placeholder="Masukkan Username..."
                  className="w-full pl-12 pr-4 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all font-semibold text-gray-700 placeholder:font-normal"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                KATA SANDI
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-600 transition-colors">
                   <ShieldCheck size={20} />
                </div>
                <input
                  type={passwordVisible ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan Password..."
                  className="w-full pl-12 pr-12 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all font-semibold text-gray-700 placeholder:font-normal"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible(!passwordVisible)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-blue-600 transition-colors"
                >
                  {passwordVisible ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="p-4 bg-red-50 text-red-600 text-sm font-medium rounded-xl border border-red-100 flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
                {error}
              </motion.div>
            )}

            <button
              disabled={loading}
              className="w-full py-4 bg-blue-700 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-800 transition-all shadow-xl shadow-blue-200 disabled:opacity-50"
            >
              {loading ? 'Masuk...' : 'Masuk Ke Dashboard'}
              {!loading && <ArrowRight size={20} />}
            </button>

            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="w-full py-3.5 bg-white text-gray-700 border border-gray-200 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition-all group"
            >
              <Scan size={20} className="text-blue-600 group-hover:scale-110 transition-transform" />
              Scan QR Code Login
            </button>

                        <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-100"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-4 text-gray-400 font-bold tracking-widest">ATAU</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full py-4 bg-white border border-gray-200 text-gray-700 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                Masuk dengan Google (Administrator)
              </button>


          </form>

          <p className="text-center mt-12 text-sm text-gray-400">
            Lupa data akses? Silakan hubungi <span className="text-blue-700 font-medium">Pusat Layanan SIAP</span>
          </p>
        </motion.div>
      </div>
      {/* QR Scanner Modal */}
      <AnimatePresence>
        {showScanner && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-blue-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                    <Camera size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Scan QR Code</h3>
                    <p className="text-xs text-blue-600 font-medium tracking-tight">Posisikan kode di dalam kotak</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowScanner(false)}
                  className="p-2 hover:bg-white rounded-full transition-colors text-gray-400 hover:text-gray-900"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6">
                <div id="qr-reader" className="w-full rounded-2xl overflow-hidden border-2 border-dashed border-blue-200" />
                <div className="mt-6 flex flex-col items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                  <p className="text-sm text-gray-500 font-medium">Buka menu 'Cetak QR' di dashboard admin untuk melihat kode Anda</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
