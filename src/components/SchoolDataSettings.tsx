import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { collection, query, limit, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SchoolData } from '../types';
import { Save, Building2, MapPin, User, FileText, CheckCircle2, Image as ImageIcon, RefreshCw } from 'lucide-react';

export default function SchoolDataSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [schoolData, setSchoolData] = useState<SchoolData>({
    pemda: '',
    dinas: '',
    sekolah: '',
    alamat: '',
    kota: '',
    kepalaSekolah: '',
    nipKepalaSekolah: '',
    logoUrl: '',
    schoolLogoUrl: ''
  });
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    async function fetchSchoolData() {
      try {
        const q = query(collection(db, 'schoolData'), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const docData = snapshot.docs[0].data() as SchoolData;
          setSchoolData({ ...docData, id: snapshot.docs[0].id });
        }
      } catch (error) {
        console.error('Error fetching school data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchSchoolData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setErrorMessage('');
    try {
      if (schoolData.id) {
        await updateDoc(doc(db, 'schoolData', schoolData.id), { ...schoolData });
      } else {
        const newRef = doc(collection(db, 'schoolData'));
        await setDoc(newRef, { ...schoolData });
        setSchoolData(prev => ({ ...prev, id: newRef.id }));
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving school data:', error);
      setErrorMessage('Gagal menyimpan data sekolah.');
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-2xl shadow-lg shadow-sky-100/50 border border-sky-100 overflow-hidden mb-4 border-t-4 border-t-sky-600">
        <div className="p-3 border-b border-sky-50 bg-white">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-sky-50 text-sky-600 rounded-lg border border-sky-100">
              <Building2 size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Identitas Sekolah</h3>
              <p className="text-gray-400 text-[8px] font-bold uppercase tracking-widest leading-none">Konfigurasi Kop Laporan Resmi</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
            <div className="group space-y-1">
              <label className="text-[9px] font-black text-sky-600 uppercase tracking-widest flex items-center gap-1.5 mb-0.5 pl-1">
                <Building2 size={10} />
                Pemerintah Daerah
              </label>
              <input
                type="text"
                required
                placeholder="PEMERINTAH KOTA / KABUPATEN..."
                className="w-full p-2 bg-sky-50/20 border border-sky-100 rounded-lg text-xs font-bold text-gray-800 placeholder:text-gray-300 focus:ring-2 focus:ring-sky-100 focus:border-sky-500 outline-none transition-all"
                value={schoolData.pemda}
                onChange={e => setSchoolData({ ...schoolData, pemda: e.target.value })}
              />
            </div>

            <div className="group space-y-1">
              <label className="text-[9px] font-black text-sky-600 uppercase tracking-widest flex items-center gap-1.5 mb-0.5 pl-1">
                <FileText size={10} />
                Instansi / Dinas
              </label>
              <input
                type="text"
                required
                placeholder="DINAS PENDIDIKAN DAN KEBUDAYAAN..."
                className="w-full p-2 bg-sky-50/20 border border-sky-100 rounded-lg text-xs font-bold text-gray-800 placeholder:text-gray-300 focus:ring-2 focus:ring-sky-100 focus:border-sky-500 outline-none transition-all"
                value={schoolData.dinas}
                onChange={e => setSchoolData({ ...schoolData, dinas: e.target.value })}
              />
            </div>

            <div className="group space-y-1 md:col-span-2">
              <label className="text-[9px] font-black text-sky-600 uppercase tracking-widest flex items-center gap-1.5 mb-0.5 pl-1">
                <Building2 size={10} />
                Nama Sekolah
              </label>
              <input
                type="text"
                required
                placeholder="NAMA SEKOLAH ANDA..."
                className="w-full p-2 bg-sky-50/20 border border-sky-100 rounded-lg text-xs font-black text-sky-900 placeholder:text-sky-200 focus:ring-2 focus:ring-sky-100 focus:border-sky-500 outline-none transition-all"
                value={schoolData.sekolah}
                onChange={e => setSchoolData({ ...schoolData, sekolah: e.target.value })}
              />
            </div>

            <div className="group space-y-1">
              <label className="text-[9px] font-black text-sky-600 uppercase tracking-widest flex items-center gap-1.5 mb-0.5 pl-1">
                <MapPin size={10} />
                Kota / Kabupaten
              </label>
              <input
                type="text"
                required
                placeholder="KOTA LOKASI SEKOLAH..."
                className="w-full p-2 bg-sky-50/20 border border-sky-100 rounded-lg text-xs font-bold text-gray-800 placeholder:text-gray-300 focus:ring-2 focus:ring-sky-100 focus:border-sky-500 outline-none transition-all"
                value={schoolData.kota}
                onChange={e => setSchoolData({ ...schoolData, kota: e.target.value })}
              />
            </div>

            <div className="group space-y-1">
              <label className="text-[9px] font-black text-sky-600 uppercase tracking-widest flex items-center gap-1.5 mb-0.5 pl-1">
                <MapPin size={10} />
                Alamat Lengkap
              </label>
              <textarea
                required
                rows={1}
                placeholder="Jl. Pendidikan No. 01..."
                className="w-full p-2 bg-sky-50/20 border border-sky-100 rounded-lg text-xs font-medium text-gray-800 placeholder:text-gray-300 focus:ring-2 focus:ring-sky-100 focus:border-sky-500 outline-none transition-all resize-none"
                value={schoolData.alamat}
                onChange={e => setSchoolData({ ...schoolData, alamat: e.target.value })}
              />
            </div>
          </div>

          <div className="p-3 bg-sky-50/30 border border-sky-100 rounded-xl group hover:border-sky-300 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg border-2 border-dashed border-sky-200 flex items-center justify-center overflow-hidden bg-white shrink-0 group-hover:border-sky-400 transition-all">
                {schoolData.schoolLogoUrl ? (
                  <img src={schoolData.schoolLogoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <ImageIcon size={16} className="text-sky-200" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <label className="block truncate text-[9px] font-bold text-sky-500 hover:text-sky-700 cursor-pointer">
                  Klik untuk ubah Logo Unit
                  <input
                    type="file"
                    accept="image/png, image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                         if (file.size > 500000) return alert('Max 500KB');
                         const reader = new FileReader();
                         reader.onloadend = () => setSchoolData({ ...schoolData, schoolLogoUrl: reader.result as string });
                         reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
                <p className="text-[7px] text-sky-400 font-bold uppercase tracking-wider">Format PNG/JPG (Maks 500KB)</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-sky-50">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-sky-600 uppercase tracking-widest flex items-center gap-1.5 pl-1">
                <User size={10} />
                Kepala Sekolah
              </label>
              <input
                type="text"
                required
                placeholder="NAMA LENGKAP..."
                className="w-full p-2 bg-sky-50/20 border border-sky-100 rounded-lg text-xs font-bold text-gray-800 focus:ring-2 focus:ring-sky-100 outline-none transition-all"
                value={schoolData.kepalaSekolah}
                onChange={e => setSchoolData({ ...schoolData, kepalaSekolah: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-sky-600 uppercase tracking-widest flex items-center gap-1.5 pl-1">
                <FileText size={10} />
                NIP
              </label>
              <input
                type="text"
                required
                placeholder="19XXXXXXXX..."
                className="w-full p-2 bg-sky-50/20 border border-sky-100 rounded-lg text-xs font-bold text-gray-800 focus:ring-2 focus:ring-sky-100 outline-none transition-all"
                value={schoolData.nipKepalaSekolah}
                onChange={e => setSchoolData({ ...schoolData, nipKepalaSekolah: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex flex-col gap-1">
              <div className="text-[8px] font-bold text-sky-300 uppercase tracking-widest leading-none">
                * Pastikan data sesuai SK terakhir
              </div>
              {success && (
                <motion.span 
                  initial={{ opacity: 0, y: 5 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="text-[9px] font-black text-green-600 uppercase tracking-widest"
                >
                  Konfigurasi berhasil disimpan.
                </motion.span>
              )}
              {errorMessage && (
                <motion.span 
                  initial={{ opacity: 0, y: 5 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="text-[9px] font-black text-red-500 uppercase tracking-widest"
                >
                  {errorMessage}
                </motion.span>
              )}
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-sky-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-sky-700 transition-all flex items-center gap-2 shadow-lg shadow-sky-100 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
              {saving ? 'PROSES' : 'SIMPAN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
