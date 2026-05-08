import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { db, handleFirestoreError } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Save, Clock, Calendar, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { getTenantCollection, getTenantDoc } from '../lib/tenant';

interface SpecialSchedule {
  id: string;
  date: string;
  day: string;
  entryTime: string;
  departureTime: string;
  note: string;
  isHoliday?: boolean;
  targetClasses?: string[];
}

export const AttendanceConfig: React.FC<{ classes: any[] }> = ({ classes }) => {
  const [config, setConfig] = useState({
    entryTime: '06:30',
    departureTime: '13:40',
    specialSchedules: [] as SpecialSchedule[]
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [showSpecial, setShowSpecial] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = getTenantDoc('schoolConfig', 'main');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const fetchedSchedules = (data.specialSchedules || []).map((s: any) => ({
            ...s,
            id: s.id || Math.random().toString(36).substring(2, 9),
            isHoliday: s.isHoliday || false
          }));
          
          setConfig({
            entryTime: data.entryTime || '06:30',
            departureTime: data.departureTime || '13:40',
            specialSchedules: fetchedSchedules
          });
        }
      } catch (error) {
        handleFirestoreError(error, 'get', 'schoolConfig/main');
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    // Validasi input utama
    if (!config.entryTime || !config.departureTime) {
      setStatus('Gagal: Waktu operasional utama harus diisi.');
      setTimeout(() => setStatus(''), 5000);
      return;
    }

    // Validasi jadwal khusus
    const hasIncompleteSchedules = config.specialSchedules.some(s => 
      !s.isHoliday && (s.date && (!s.date || !s.entryTime || !s.departureTime))
    );

    if (hasIncompleteSchedules) {
      setStatus('Gagal: Pastikan Tanggal, Jam Masuk, dan Jam Pulang diisi pada jadwal khusus.');
      setTimeout(() => setStatus(''), 5000);
      return;
    }

    setLoading(true);
    try {
      // Bersihkan jadwal yang benar-benar kosong jika ada
      const cleanSchedules = config.specialSchedules.filter(s => s.date && (s.isHoliday || (s.entryTime && s.departureTime)));
      
      const configToSave = {
        ...config,
        specialSchedules: cleanSchedules
      };

      await setDoc(getTenantDoc('schoolConfig', 'main'), configToSave);
      
      // Update state lokal dengan data yang sudah dibersihkan
      setConfig(configToSave);
      setStatus('Konfigurasi berhasil disimpan.');
      setTimeout(() => setStatus(''), 3000);
    } catch (error) {
      handleFirestoreError(error, 'write', 'schoolConfig/main');
      setStatus('Gagal menyimpan konfigurasi.');
      setTimeout(() => setStatus(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const addSpecialSchedule = () => {
    setConfig(prev => ({
      ...prev,
      specialSchedules: [
        ...prev.specialSchedules,
        {
          id: Math.random().toString(36).substring(2, 9),
          date: '',
          day: '',
          entryTime: '',
          departureTime: '',
          note: '',
          isHoliday: false
        }
      ]
    }));
  };

  const removeSpecialSchedule = (id: string, index: number) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus jadwal khusus ini?')) {
      setConfig(prev => ({
        ...prev,
        specialSchedules: prev.specialSchedules.filter((s, idx) => {
          if (id && s.id) return s.id !== id;
          return idx !== index;
        })
      }));
    }
  };

  const updateSpecialSchedule = (id: string, field: keyof SpecialSchedule, value: any) => {
    setConfig(prev => ({
      ...prev,
      specialSchedules: prev.specialSchedules.map(s => {
        if (s.id === id) {
          const updated = { ...s, [field]: value };
          if (field === 'date' && value) {
            const [year, month, day] = value.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day);
            const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
            updated.day = days[dateObj.getDay()];
          }
          if (field === 'isHoliday' && value) {
            updated.entryTime = '00:00';
            updated.departureTime = '00:00';
          }
          return updated;
        }
        return s;
      })
    }));
  };

  return (
    <div className="bg-white p-4 rounded-2xl border border-sky-100 shadow-xl shadow-sky-100/50 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2 pb-2 border-b border-sky-50">
        <div className="p-1.5 bg-sky-100 text-sky-600 rounded-lg">
           <Clock size={16} />
        </div>
        <div>
          <h3 className="text-xs font-black text-gray-900 uppercase tracking-tight">Waktu Operasional Sekolah</h3>
          <p className="text-[9px] font-bold text-sky-400 uppercase tracking-widest">Atur Jam Masuk & Pulang Harian</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="group">
          <label className="block text-[9px] font-black text-sky-600 uppercase tracking-widest mb-1.5 pl-1">Waktu Masuk Operasional</label>
          <div className="relative">
            <input
              type="time"
              className="w-full p-2.5 bg-sky-50/30 border border-sky-100 rounded-xl text-sm font-black text-sky-900 focus:ring-4 focus:ring-sky-100 focus:border-sky-500 outline-none transition-all"
              value={config.entryTime}
              onChange={(e) => setConfig({ ...config, entryTime: e.target.value })}
            />
          </div>
        </div>
        <div className="group">
          <label className="block text-[9px] font-black text-sky-600 uppercase tracking-widest mb-1.5 pl-1">Waktu Pulang Operasional</label>
          <div className="relative">
            <input
              type="time"
              className="w-full p-2.5 bg-sky-50/30 border border-sky-100 rounded-xl text-sm font-black text-sky-900 focus:ring-4 focus:ring-sky-100 focus:border-sky-500 outline-none transition-all"
              value={config.departureTime}
              onChange={(e) => setConfig({ ...config, departureTime: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="bg-sky-500/[0.02] border border-sky-100 rounded-2xl overflow-hidden ring-1 ring-sky-50">
        <button 
          onClick={() => setShowSpecial(!showSpecial)}
          className="w-full flex items-center justify-between p-3.5 hover:bg-sky-50/50 transition-all group"
        >
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-lg transition-colors", showSpecial ? "bg-sky-600 text-white" : "bg-sky-100 text-sky-600")}>
              <Calendar size={16} />
            </div>
            <div className="text-left">
              <span className="block text-xs font-black text-gray-900 uppercase tracking-tight">Jadwal Waktu Istimewa</span>
              <span className="block text-[8px] font-bold text-sky-400 uppercase tracking-widest leading-none mt-0.5">Konfigurasi Hari Libur / Acara Khusus</span>
            </div>
          </div>
          <div className={cn("transition-transform duration-300", showSpecial ? "rotate-180" : "")}>
            <ChevronDown size={16} className="text-sky-400" />
          </div>
        </button>

        {showSpecial && (
          <div className="p-4 bg-white border-t border-sky-100 space-y-4 animate-in slide-in-from-top-4 duration-300">
            {config.specialSchedules.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {config.specialSchedules.map((schedule, idx) => (
                  <div key={schedule.id || `schedule-${idx}`} className="relative p-4 border border-sky-100 bg-sky-50/30 rounded-2xl group/item hover:border-sky-300 transition-all">
                    <button 
                      onClick={() => removeSpecialSchedule(schedule.id, idx)}
                      className="absolute top-3 right-3 p-1.5 bg-white text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all shadow-sm border border-gray-100"
                      title="Hapus"
                    >
                      <Trash2 size={14} />
                    </button>
                    
                    <h4 className="text-[8px] font-black text-sky-600 mb-3 uppercase tracking-widest pl-1">Jadwal Khusus #{idx + 1}</h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                      <div className="col-span-1 flex flex-col gap-2 p-2 mb-2 lg:mb-0">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input 
                                type="checkbox"
                                checked={schedule.isHoliday || false}
                                onChange={(e) => updateSpecialSchedule(schedule.id, 'isHoliday', e.target.checked)}
                                className="accent-red-500 w-3 h-3"
                            />
                            <span className="text-[9px] font-black text-red-500 uppercase">Libur</span>
                        </label>
                        <div className="space-y-1">
                          <label className="block text-[8px] text-sky-400 font-black uppercase tracking-widest pl-1">Target Kelas</label>
                          <div className="max-h-20 overflow-y-auto border border-sky-100 rounded p-1">
                            {classes.map(cl => (
                              <label key={cl.id} className="flex items-center gap-1.5 text-[9px]">
                                <input 
                                  type="checkbox"
                                  checked={schedule.targetClasses?.includes(cl.name)}
                                  onChange={(e) => {
                                    const current = schedule.targetClasses || [];
                                    const updated = e.target.checked
                                      ? [...current, cl.name]
                                      : current.filter(c => c !== cl.name);
                                    updateSpecialSchedule(schedule.id, 'targetClasses', updated);
                                  }}
                                  className="accent-sky-500"
                                />
                                {cl.name}
                              </label>
                            ))}
                          </div>
                          <span className="text-[8px] text-gray-400 italic">Kosong = Semua</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[8px] text-sky-400 font-black uppercase tracking-widest pl-1">Tanggal</label>
                        <input 
                          type="date" 
                          value={schedule.date}
                          onChange={(e) => updateSpecialSchedule(schedule.id, 'date', e.target.value)}
                          className="w-full text-[10px] font-bold p-2 bg-white border border-sky-100 rounded-lg focus:ring-4 focus:ring-sky-100 focus:border-sky-500 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[8px] text-sky-400 font-black uppercase tracking-widest pl-1">Hari</label>
                        <input 
                          type="text" 
                          value={schedule.day}
                          disabled
                          className="w-full text-[10px] font-bold p-2 bg-gray-50 border border-gray-100 rounded-lg text-gray-500 cursor-not-allowed"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[8px] text-sky-400 font-black uppercase tracking-widest pl-1">Masuk</label>
                        <input 
                          type="time" 
                          value={schedule.entryTime}
                          disabled={schedule.isHoliday}
                          onChange={(e) => updateSpecialSchedule(schedule.id, 'entryTime', e.target.value)}
                          className={cn("w-full text-[10px] font-bold p-2 bg-white border border-sky-100 rounded-lg focus:ring-4 focus:ring-sky-100 focus:border-sky-500 outline-none", schedule.isHoliday && "opacity-50 cursor-not-allowed")}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[8px] text-sky-400 font-black uppercase tracking-widest pl-1">Pulang</label>
                        <input 
                          type="time" 
                          value={schedule.departureTime}
                          disabled={schedule.isHoliday}
                          onChange={(e) => updateSpecialSchedule(schedule.id, 'departureTime', e.target.value)}
                          className={cn("w-full text-[10px] font-bold p-2 bg-white border border-sky-100 rounded-lg focus:ring-4 focus:ring-sky-100 focus:border-sky-500 outline-none", schedule.isHoliday && "opacity-50 cursor-not-allowed")}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-[8px] text-sky-400 font-black uppercase tracking-widest pl-1">Keterangan</label>
                        <input 
                          type="text" 
                          value={schedule.note}
                          onChange={(e) => updateSpecialSchedule(schedule.id, 'note', e.target.value)}
                          className="w-full text-[10px] font-bold p-2 bg-white border border-sky-100 rounded-lg focus:ring-4 focus:ring-sky-100 focus:border-sky-500 outline-none"
                          placeholder="Event..."
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center text-sky-200 border-2 border-dashed border-sky-100 rounded-2xl">
                 <Calendar size={32} className="mb-2 opacity-20" />
                 <p className="text-[9px] font-black uppercase tracking-widest">Belum Ada Pengaturan Khusus</p>
              </div>
            )}

            <button
              onClick={addSpecialSchedule}
              className="w-full py-2.5 border-2 border-dashed border-sky-200 text-sky-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-sky-50 hover:border-sky-300 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={14} /> Tambah Jadwal Baru
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-sky-50">
        <div className="text-[8px] font-bold text-sky-300 uppercase tracking-widest">
           * Parameter kalkulasi sistem
        </div>
        <div className="flex items-center gap-3">
           {status && (
             <p className={cn("text-[9px] font-black uppercase animate-in fade-in slide-in-from-right-2", status.includes('Gagal') ? "text-red-500" : "text-green-600")}>
               {status}
             </p>
           )}
           <button
             onClick={handleSave}
             disabled={loading}
             className="px-5 py-3 bg-sky-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-sky-700 active:scale-95 transition-all shadow-xl shadow-sky-100 disabled:opacity-50 flex items-center gap-2"
           >
             <Save size={16} /> {loading ? 'PROSES...' : 'SIMPAN DATA'}
           </button>
        </div>
      </div>
    </div>
  );
};

