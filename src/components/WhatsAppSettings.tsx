import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { db, handleFirestoreError } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Save } from 'lucide-react';

export const WhatsAppSettings: React.FC = () => {
  const [settings, setSettings] = useState({
    apiUrl: '',
    apiKey: '',
    senderNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'systemSettings', 'whatsappConfig');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSettings(docSnap.data() as any);
        }
      } catch (error) {
        handleFirestoreError(error, 'get', 'systemSettings/whatsappConfig');
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, 'systemSettings', 'whatsappConfig'), settings);
      setStatus('Konfigurasi berhasil disimpan.');
      setTimeout(() => setStatus(''), 3000);
    } catch (error) {
      handleFirestoreError(error, 'write', 'systemSettings/whatsappConfig');
      setStatus('Gagal menyimpan konfigurasi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-3xl border border-sky-100 shadow-xl shadow-sky-100/50 mt-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-sky-50">
        <div className="p-2.5 bg-sky-100 text-sky-600 rounded-xl">
           <Save size={20} />
        </div>
        <div>
          <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Integrasi WhatsApp Gateway</h3>
          <p className="text-[10px] font-bold text-sky-400 uppercase tracking-widest mt-0.5">Konfigurasi Pengiriman Notifikasi Orang Tua</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="group">
          <label className="block text-[10px] font-black text-sky-600 uppercase tracking-widest mb-1.5 pl-1">API Endpoint URL</label>
          <input
            type="text"
            className="w-full p-4 bg-sky-50/30 border border-sky-100 rounded-2xl text-sm font-bold text-gray-800 placeholder:text-gray-300 focus:ring-4 focus:ring-sky-100 focus:border-sky-500 outline-none transition-all"
            value={settings.apiUrl}
            onChange={(e) => setSettings({ ...settings, apiUrl: e.target.value })}
            placeholder="https://api.whatsapp-gateway.com/..."
          />
        </div>
        <div className="group">
          <label className="block text-[10px] font-black text-sky-600 uppercase tracking-widest mb-1.5 pl-1">API Authorization Key</label>
          <input
            type="password"
            className="w-full p-4 bg-sky-50/30 border border-sky-100 rounded-2xl text-sm font-bold text-gray-800 placeholder:text-gray-300 focus:ring-4 focus:ring-sky-100 focus:border-sky-500 outline-none transition-all"
            value={settings.apiKey}
            onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
            placeholder="Masukkan API Key Anda..."
          />
        </div>
        <div className="group">
          <label className="block text-[10px] font-black text-sky-600 uppercase tracking-widest mb-1.5 pl-1">Nomor Pengirim (Device ID)</label>
          <input
            type="text"
            className="w-full p-4 bg-sky-50/30 border border-sky-100 rounded-2xl text-sm font-bold text-gray-800 placeholder:text-gray-300 focus:ring-4 focus:ring-sky-100 focus:border-sky-500 outline-none transition-all"
            value={settings.senderNumber}
            onChange={(e) => setSettings({ ...settings, senderNumber: e.target.value })}
            placeholder="Contoh: 6281234567890"
          />
        </div>
        
        <div className="flex items-center justify-between pt-4">
           {status && (
             <motion.p 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xs font-black text-sky-600 uppercase"
             >
                {status}
             </motion.p>
           )}
           <div className={!status ? "ml-auto" : ""}>
             <button
               onClick={handleSave}
               disabled={loading}
               className="flex items-center gap-3 px-8 py-4 bg-sky-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-sky-700 active:scale-95 transition-all shadow-xl shadow-sky-100 disabled:opacity-50"
             >
               <Save size={18} /> {loading ? 'MEMPROSES...' : 'SIMPAN KONFIGURASI'}
             </button>
           </div>
        </div>
      </div>
    </div>
  );
};
