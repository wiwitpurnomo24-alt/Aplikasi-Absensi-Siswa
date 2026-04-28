import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { School, UserCircle, Users, Settings, LogIn, ShieldCheck, ArrowRight, GraduationCap, ClipboardList, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../lib/auth-store';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signInAnonymously, updateProfile } from 'firebase/auth';
import { cn } from '../lib/utils';
import { ROLE_LABELS } from '../constants';
import { UserRole } from '../types';

export default function Login() {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user, login } = useAuthStore();

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
      setError('Gagal masuk dengan Google: ' + err.message);
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

    try {
      let userCred;
      try {
        userCred = await signInAnonymously(auth);
        if (userCred.user) {
          await updateProfile(userCred.user, { displayName: name });
          // Force refresh token to include the new displayName in token.name for firestore rules
          await userCred.user.getIdToken(true);
        }
      } catch (authErr: any) {
        console.error("Firebase Auth Error:", authErr);
        if (authErr.code === 'auth/admin-restricted-operation') {
          if (role === 'ADMIN') {
            console.warn("Continuing as Local Admin without Firebase session.");
          } else {
            setError('Login demo tidak tersedia saat ini. Harap gunakan login Google atau hubungi admin.');
            setLoading(false);
            return;
          }
        } else {
          setError('Gagal inisialisasi sesi keamanan Firebase: ' + authErr.message);
          setLoading(false);
          return;
        }
      }

        const { setDoc, doc, serverTimestamp } = await import('firebase/firestore');
        const uid = userCred?.user?.uid || 'demo-user-' + Date.now();
        const userDoc = doc(db, 'users', uid);
        await setDoc(userDoc, {
          name,
          role,
          updatedAt: serverTimestamp()
        }, { merge: true });

        login({ 
          uid: uid,
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
    } catch (err) {
      console.error(err);
      setError('Gagal inisialisasi sesi demo.');
    } finally {
      setLoading(false);
    }
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
            const passwordField = teacherData.password || '12345';
            
            if (passwordField === normalizedPassword) {
                // Determine roles based on document fields
                const roles: UserRole[] = [];
                if (teacherData.isWali) roles.push('TEACHER');
                if (teacherData.isSubjectTeacher) roles.push('SUBJECT_TEACHER');
                if (teacherData.isCounselor) roles.push('COUNSELOR');
                if (teacherData.isKepalaSekolah || teacherData.isWakilKepala) roles.push('ADMIN');

                // If no roles, set default
                if (roles.length === 0) roles.push('TEACHER');

                let uid = 'user-' + Date.now();
                try {
                  const userCred = await signInAnonymously(auth);
                  await updateProfile(userCred.user, { displayName: teacherData.name });
                  await userCred.user.getIdToken(true);
                  uid = userCred.user.uid;
                } catch (authError: any) {
                   console.warn('Anonymous Auth restricted, using fallback UID for UI session.');
                }

                const { setDoc, doc, serverTimestamp } = await import('firebase/firestore');
                await setDoc(doc(db, 'users', uid), {
                  name: teacherData.name,
                  role: roles[0],
                  roles: roles,
                  updatedAt: serverTimestamp()
                }, { merge: true });

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
                setError('Username atau Password salah (Teacher).');
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
            const passwordField = studentData.parentPassword || '12345';
            
            if (passwordField === normalizedPassword) {
                 let uid = 'user-' + Date.now();
                 try {
                   const userCred = await signInAnonymously(auth);
                   uid = userCred.user.uid;
                 } catch (authError: any) {
                    console.warn('Anonymous Auth restricted, using fallback UID for UI session.');
                 }
                 login({
                     uid: uid,
                     role: 'PARENT',
                     roles: ['PARENT'],
                     nis: normalizedId,
                     name: studentData.name,
                     className: studentData.className
                 });
                 navigate('/parent');
                 return;
            } else {
                setError('Username atau Password salah (Parent).');
                setLoading(false);
                return;
            }
        }

        setError('Username atau Password tidak ditemukan.');
    } catch (err: any) {
        handleFirestoreError(err, 'get', 'login');
        setError('Terjadi kesalahan sistem.' + err.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row font-sans">
      {/* Visual Side */}
      <div className="hidden md:flex md:w-1/2 bg-blue-700 p-16 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-4 text-white mb-12">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-xl">
              <School size={40} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">SMPN 2 MAGELANG</h1>
              <p className="text-blue-100/60 text-sm font-medium">Sistem Absensi Online</p>
            </div>
          </div>
          
          <h2 className="text-5xl font-extrabold text-white leading-tight mb-6">
            Input Absensi <br/> Kini <span className="text-blue-300">Lebih Mudah.</span>
          </h2>
          <p className="text-blue-100 text-lg max-w-md leading-relaxed">
            Terintegrasi langsung dengan WhatsApp untuk kemudahan pelaporan izin siswa oleh orang tua dan wali murid.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-6">
           <div className="flex -space-x-3">
              {[1,2,3,4].map(i => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-blue-700 bg-blue-200" />
              ))}
           </div>
           <p className="text-sm text-blue-100 font-medium">Dipercaya oleh ribuan siswa & guru</p>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600 rounded-full blur-3xl -mr-48 -mt-48 opacity-50" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-800 rounded-full blur-3xl -ml-40 -mb-40 opacity-50" />
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
            <h3 className="text-3xl font-extrabold text-[#343a40] tracking-tight mb-2">SIADPV - SMPN 2</h3>
            <p className="text-sm font-bold text-blue-600 uppercase tracking-widest">Akses Masuk Sistem</p>
            <div className="h-1 w-12 bg-blue-600 mx-auto mt-4 rounded-full"></div>
          </div>

// Role Picker removed
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

            <div className="mt-8 pt-8 border-t border-gray-50">
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center mb-4">Akses Cepat (Mode Demo)</p>
               <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => handleQuickLogin('ADMIN', 'wiwitpurnomo24@guru.smp.belajar.id')} className="p-2 text-[10px] font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors col-span-2">LOGIN ADMIN (WIWIT)</button>
                  <button type="button" onClick={() => handleQuickLogin('ADMIN', 'admin')} className="p-2 text-[10px] font-bold bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors">DEMO ADMIN</button>
                  <button type="button" onClick={() => handleQuickLogin('TEACHER', 'wali-demo')} className="p-2 text-[10px] font-bold bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors">LOGIN WALI KELAS</button>
                  <button type="button" onClick={() => handleQuickLogin('PARENT', '12345')} className="p-2 text-[10px] font-bold bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-100 transition-colors">LOGIN ORANG TUA</button>
                  <button type="button" onClick={() => handleQuickLogin('COUNSELOR', 'bk-demo')} className="p-2 text-[10px] font-bold bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 transition-colors">LOGIN GURU BK</button>
                  <button type="button" onClick={() => handleQuickLogin('SUBJECT_TEACHER', 'mapel')} className="p-2 text-[10px] font-bold bg-cyan-50 text-cyan-600 rounded-xl hover:bg-cyan-100 transition-colors col-span-2">LOGIN GURU MAPEL</button>
               </div>
            </div>
          </form>

          <p className="text-center mt-12 text-sm text-gray-400">
            Lupa data akses? Silakan hubungi <span className="text-blue-700 font-medium">Biro IT SMPN 2</span>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
