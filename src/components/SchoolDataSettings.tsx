import React, { useState, useEffect } from 'react';
import { collection, query, limit, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { SchoolData } from '../types';
import { Save, Building2, MapPin, User, FileText, CheckCircle2 } from 'lucide-react';

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
    logoUrl: ''
  });

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
      alert('Gagal menyimpan data sekolah');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Building2 size={20} />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Data Sekolah</h3>
          </div>
          <p className="text-sm text-gray-500">Konfigurasi informasi sekolah untuk kop surat dan laporan resmi</p>
        </div>

        <form onSubmit={handleSave} className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Building2 size={16} className="text-gray-400" />
                Nama Pemerintah Daerah
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: PEMERINTAH PROVINSI JAWA TENGAH"
                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                value={schoolData.pemda}
                onChange={e => setSchoolData({ ...schoolData, pemda: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileText size={16} className="text-gray-400" />
                Nama Dinas
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: DINAS PENDIDIKAN DAN KEBUDAYAAN"
                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                value={schoolData.dinas}
                onChange={e => setSchoolData({ ...schoolData, dinas: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Building2 size={16} className="text-gray-400" />
                Nama Sekolah
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: SMA NEGERI 1 KOTA"
                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all font-bold"
                value={schoolData.sekolah}
                onChange={e => setSchoolData({ ...schoolData, sekolah: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <MapPin size={16} className="text-gray-400" />
                Kota / Kabupaten
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: SEMARANG"
                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                value={schoolData.kota}
                onChange={e => setSchoolData({ ...schoolData, kota: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <MapPin size={16} className="text-gray-400" />
              Alamat Lengkap
            </label>
            <textarea
              required
              rows={2}
              placeholder="Jl. Pendidikan No. 123, Kelurahan, Kecamatan, Kode Pos"
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all resize-none"
              value={schoolData.alamat}
              onChange={e => setSchoolData({ ...schoolData, alamat: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <User size={16} className="text-gray-400" />
                Nama Kepala Sekolah
              </label>
              <input
                type="text"
                required
                placeholder="Nama Lengkap Beserta Gelar"
                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                value={schoolData.kepalaSekolah}
                onChange={e => setSchoolData({ ...schoolData, kepalaSekolah: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileText size={16} className="text-gray-400" />
                NIP Kepala Sekolah
              </label>
              <input
                type="text"
                required
                placeholder="19xxxxxxxxxxxxxxx"
                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                value={schoolData.nipKepalaSekolah}
                onChange={e => setSchoolData({ ...schoolData, nipKepalaSekolah: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-6">
            {success && (
              <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                <CheckCircle2 size={16} />
                Berhasil disimpan
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-200 disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
