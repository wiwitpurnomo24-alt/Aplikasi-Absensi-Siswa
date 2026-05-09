import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError } from '../lib/firebase';
import { getDoc, setDoc, doc } from 'firebase/firestore';
import { getTenantDoc } from '../lib/tenant';
import { Save, Palette } from 'lucide-react';

export default function ThemeSettings() {
  const [theme, setTheme] = useState({ primaryColor: '#0284c7', secondaryColor: '#e0f2fe' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTheme();
  }, []);

  const fetchTheme = async () => {
    try {
      const docRef = getTenantDoc('schoolConfig', 'main');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().theme) {
        setTheme(docSnap.data().theme);
      }
    } catch (err) {
      console.error("Error fetching theme:", err);
    }
  };

  const saveTheme = async () => {
    setLoading(true);
    try {
      const docRef = getTenantDoc('schoolConfig', 'main');
      await setDoc(docRef, { theme }, { merge: true });
      alert("Tema berhasil disimpan! Silakan refresh halaman untuk menerapkan perubahan.");
    } catch (err: any) {
      handleFirestoreError(err, 'update' as any, 'theme-config');
      alert("Gagal menyimpan tema.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
          <Palette size={20} />
        </div>
        <h2 className="text-lg font-black text-gray-900">Pengaturan Tema Dasbor</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Warna Utama (Primary)</label>
          <input 
            type="color" 
            value={theme.primaryColor}
            onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })}
            className="w-full h-12 rounded-lg cursor-pointer"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Warna Sekunder (Secondary)</label>
          <input 
            type="color" 
            value={theme.secondaryColor}
            onChange={(e) => setTheme({ ...theme, secondaryColor: e.target.value })}
            className="w-full h-12 rounded-lg cursor-pointer"
          />
        </div>
      </div>
      
      <button
        onClick={saveTheme}
        disabled={loading}
        className="mt-6 flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm hover:bg-blue-700 transition-all shadow-sm"
      >
        {loading ? "Menyimpan..." : <><Save size={16} /> Simpan Tema</>}
      </button>
    </div>
  );
}
