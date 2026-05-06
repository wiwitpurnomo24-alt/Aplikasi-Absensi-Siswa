import React, { useState, useEffect } from 'react';
import { collection, query, limit, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SchoolData } from '../types';
import { Image, Lock, Unlock, Save, Eye, EyeOff } from 'lucide-react';
import { cn } from '../lib/utils';

export default function LogoSettings() {
  const [password, setPassword] = useState('');
  const [isLocked, setIsLocked] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [schoolDataId, setSchoolDataId] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    async function fetchSchoolData() {
      try {
        const q = query(collection(db, 'schoolData'), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const docData = snapshot.docs[0].data() as SchoolData;
          setLogoUrl(docData.logoUrl || '');
          setSchoolDataId(snapshot.docs[0].id);
        }
      } catch (error) {
        console.error('Error fetching school data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchSchoolData();
  }, []);

  const handleUnlock = () => {
    if (password === '@Dutatama123') {
      setIsLocked(false);
      setPassword('');
      // Pre-fill with the requested logo URL
      setLogoUrl('https://i.ibb.co.com/C5SL3dTB/logo-dutatama.png');
    } else {
      alert('Password salah!');
    }
  };

  const setDutatamaLogo = () => {
    setLogoUrl('https://i.ibb.co.com/C5SL3dTB/logo-dutatama.png');
  };

  const handleSave = async () => {
    try {
      if (!schoolDataId) { 
        setStatus('Data sekolah tidak ditemukan.');
        setIsError(true);
        setTimeout(() => setStatus(''), 3000);
        return; 
      }
      await updateDoc(doc(db, 'schoolData', schoolDataId), { logoUrl });
      setIsLocked(true);
      setStatus('Konfigurasi berhasil disimpan.');
      setIsError(false);
      setTimeout(() => setStatus(''), 3000);
    } catch (e) {
      console.error(e);
      setStatus('Gagal menyimpan konfigurasi.');
      setIsError(true);
      setTimeout(() => setStatus(''), 3000);
    }
  }

  if (loading) return (
    <div className="bg-white p-8 rounded-3xl border border-sky-100 shadow-sm flex items-center justify-center">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600"></div>
    </div>
  );

  return (
    <div className="bg-white p-8 rounded-3xl border border-sky-100 shadow-xl shadow-sky-100/50 space-y-6">
      <div className="flex items-center justify-between border-b border-sky-50 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-100 text-sky-600 rounded-xl">
            <Image size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Logo Dashboard</h3>
            <p className="text-[10px] font-bold text-sky-400 uppercase tracking-widest mt-0.5">Identitas Visual Utama</p>
          </div>
        </div>
        <button 
          onClick={() => setIsLocked(!isLocked)} 
          className={cn(
            "p-2.5 rounded-xl transition-all duration-300",
            isLocked ? "bg-gray-50 text-gray-400" : "bg-sky-100 text-sky-600 ring-2 ring-sky-200"
          )}
        >
            {isLocked ? <Lock size={20}/> : <Unlock size={20}/>}
        </button>
      </div>
      
      {isLocked ? (
        <div className="flex gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
           <div className="flex-1 relative">
             <input 
              type={showPassword ? 'text' : 'password'} 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="Masukkan password modul..." 
              className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-gray-800 placeholder:text-gray-300 focus:ring-4 focus:ring-sky-100 focus:border-sky-500 outline-none transition-all" 
             />
             <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-sky-600 transition-colors"
              >
               {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
             </button>
           </div>
           <button 
            onClick={handleUnlock} 
            className="bg-sky-600 text-white px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-sky-700 active:scale-95 transition-all shadow-lg shadow-sky-100"
           >
            BUKA
           </button>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-sky-500/[0.03] p-6 rounded-2xl border-2 border-sky-50 space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-sky-600 uppercase tracking-widest flex items-center gap-2 pl-1">
                  URL Image / Source Logo
                </label>
                <input 
                  type="text" 
                  value={logoUrl} 
                  onChange={e => setLogoUrl(e.target.value)} 
                  placeholder="Paste URL Logo Disini..." 
                  className="w-full p-4 bg-white border border-sky-100 rounded-2xl text-sm font-bold text-gray-800 focus:ring-4 focus:ring-sky-100 focus:border-sky-500 outline-none transition-all" 
                />
                <button 
                  onClick={setDutatamaLogo} 
                  className="text-left text-[10px] text-sky-600 font-black uppercase tracking-widest hover:text-sky-800 transition-colors pl-1 inline-flex items-center gap-1.5"
                >
                  <span className="text-sm">+</span> Gunakan Standar Logo Dutatama
                </button>
              </div>

              {logoUrl && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Pratinjau:</span>
                  <div className="h-20 w-auto p-4 bg-white rounded-2xl border border-sky-100 shadow-inner">
                    <img src={logoUrl} alt="Preview" className="h-full object-contain" />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <button 
                onClick={handleSave} 
                className="w-full flex items-center justify-center gap-3 bg-green-600 text-white p-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-green-700 active:scale-[0.98] transition-all shadow-xl shadow-green-100"
              >
                  <Save size={18}/> SIMPAN PERUBAHAN LOGO
              </button>
              
              {status && (
                <div className="flex justify-center h-4">
                   <span className={cn("text-[9px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-1", isError ? "text-red-500" : "text-green-600")}>
                    {status}
                   </span>
                </div>
              )}
            </div>
        </div>
      )}
    </div>
  )
}
