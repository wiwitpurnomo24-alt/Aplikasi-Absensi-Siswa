import React, { useState, useEffect } from 'react';
import { collection, query, limit, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SchoolData } from '../types';
import { Image, Lock, Unlock, Save, Eye, EyeOff } from 'lucide-react';

export default function LogoSettings() {
  const [password, setPassword] = useState('');
  const [isLocked, setIsLocked] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [schoolDataId, setSchoolDataId] = useState('');
  const [loading, setLoading] = useState(true);

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
    } else {
      alert('Password salah!');
    }
  };

  const handleSave = async () => {
    try {
      if (!schoolDataId) { alert('Data sekolah tidak ditemukan'); return; }
      await updateDoc(doc(db, 'schoolData', schoolDataId), { logoUrl });
      setIsLocked(true);
      alert('Logo berhasil diperbarui!');
    } catch (e) {
      console.error(e);
      alert('Gagal menyimpan logo.');
    }
  }

  if (loading) return <div>Memuat...</div>;

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Image size={20} />
            Pengaturan Logo
        </h3>
        <button onClick={() => setIsLocked(!isLocked)} className="text-gray-500 p-2 rounded-lg hover:bg-gray-100">
            {isLocked ? <Lock size={18}/> : <Unlock size={18}/>}
        </button>
      </div>
      
      {isLocked ? (
        <div className="flex gap-2">
           <div className="flex-1 relative">
             <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Masukkan password" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 outline-none" />
             <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-2 text-gray-500">
               {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
             </button>
           </div>
           <button onClick={handleUnlock} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">Buka</button>
        </div>
      ) : (
        <div className="space-y-4">
            <input type="text" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="URL Logo" className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-600 outline-none" />
            <button onClick={handleSave} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold">
                <Save size={18}/> Simpan Logo
            </button>
        </div>
      )}
    </div>
  )
}
