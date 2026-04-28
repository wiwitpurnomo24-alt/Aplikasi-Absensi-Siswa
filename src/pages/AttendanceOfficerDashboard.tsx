import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { db, auth, handleFirestoreError } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, where } from 'firebase/firestore';
import { AttendanceRecord, Student } from '../types';
import AttendanceRecapTable from '../components/AttendanceRecapTable';
import { ClipboardList, FileText, Edit, Trash2, X, Users, AlertCircle } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import { useAuthStore } from '../lib/auth-store';

export default function AttendanceOfficerDashboard() {
  const { user } = useAuthStore();
  const [authReady, setAuthReady] = useState(false);
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'history';
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [statusMessage, setStatusMessage] = useState('');
  const itemsPerPage = 12;
  const [officerPage, setOfficerPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, onConfirm: () => void}>({isOpen: false, message: '', onConfirm: () => {}});
  const showConfirm = (message: string, onConfirm: () => void) => setConfirmDialog({isOpen: true, message, onConfirm});

  const officers = useMemo(() => {
    return students.filter(s => (s as any).role === 'STUDENT')
      .sort((a,b) => (a.className || '').localeCompare(b.className || '', undefined, {numeric: true}) || (a.name || '').localeCompare(b.name || ''));
  }, [students]);

  const paginatedOfficers = useMemo(() => {
    const startIndex = (officerPage - 1) * itemsPerPage;
    return officers.slice(startIndex, startIndex + itemsPerPage);
  }, [officers, officerPage, itemsPerPage]);

  const totalOfficerPages = Math.ceil(officers.length / itemsPerPage);

  const sortedAttendance = useMemo(() => {
    return [...attendance].sort((a,b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
    });
  }, [attendance]);

  const paginatedHistory = useMemo(() => {
    const startIndex = (historyPage - 1) * itemsPerPage;
    return sortedAttendance.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedAttendance, historyPage, itemsPerPage]);

  const totalHistoryPages = Math.ceil(attendance.length / itemsPerPage);

  const handleRemoveOfficer = (id: string) => {
    showConfirm('Hapus peran petugas dari siswa ini?', async () => {
      try {
        await updateDoc(doc(db, 'students', id), { role: null });
        setStatusMessage('Petugas berhasil dihapus');
        setTimeout(() => setStatusMessage(''), 3000);
      } catch (err: any) {
        handleFirestoreError(err, 'update' as any, 'students-role');
      }
    });
  };

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
        setAuthReady(!!u);
    });
  }, []);

  useEffect(() => {
    if (!user || !authReady) return;
    const q = query(collection(db, 'attendance'), orderBy('submittedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAttendance(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord)));
    }, (err) => {
      handleFirestoreError(err, 'list', 'Attendance Officer Fetch');
    });
    
    const sQ = query(collection(db, 'students'));
    const unsubscribeStudents = onSnapshot(sQ, (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    }, (err) => {
      handleFirestoreError(err, 'list', 'Attendance Officer Fetch Students');
    });
    
    return () => { unsubscribe(); unsubscribeStudents(); };
  }, [user, authReady]);

  const handleDelete = (id: string) => {
    showConfirm('Apakah Anda yakin ingin menghapus data absensi ini?', async () => {
      try {
        await deleteDoc(doc(db, 'attendance', id));
      } catch (err) {
        handleFirestoreError(err, 'delete' as any, 'attendance');
      }
    });
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { id, ...data } = formData;
      await updateDoc(doc(db, 'attendance', id), data);
      setShowEditModal(false);
      setFormData({});
    } catch (err) {
      handleFirestoreError(err, 'update' as any, 'attendance');
    }
  };

  const isManagement = user?.role === 'ADMIN' || user?.role === 'TEACHER' || user?.role === 'COUNSELOR';

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-black text-gray-900">Dashboard Petugas Absensi</h1>
      
      {statusMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl font-bold text-sm text-center"
        >
          {statusMessage}
        </motion.div>
      )}

      <div className="flex flex-wrap gap-4">
        <a href="?tab=officers" className={cn("px-6 py-3 rounded-xl flex items-center gap-2 font-bold transition-all", activeTab === 'officers' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          <Users size={20} /> Daftar Petugas
        </a>
        <a href="?tab=history" className={cn("px-6 py-3 rounded-xl flex items-center gap-2 font-bold transition-all", activeTab === 'history' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          <ClipboardList size={20} /> Absensi Manual
        </a>
        <a href="?tab=rekap" className={cn("px-6 py-3 rounded-xl flex items-center gap-2 font-bold transition-all", activeTab === 'rekap' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
          <FileText size={20} /> Rekap Absensi
        </a>
      </div>
      
      {activeTab === 'officers' && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 bg-gray-800 text-white flex justify-between items-center">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Users size={24} /> Daftar Petugas Absensi Kelas
            </h2>
            <span className="px-3 py-1 bg-blue-600/20 text-blue-400 text-xs font-bold rounded-full border border-blue-600/30">
              {officers.length} Petugas Aktif
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="bg-gray-50/50">
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">No</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">Kelas</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">Nomor Absen</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">Nama Siswa</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">USER ID</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase">SANDI</th>
                  {isManagement && (
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase text-center">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {officers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-400 italic text-sm">Belum ada petugas kelas yang ditunjuk.</td>
                  </tr>
                ) : (
                  paginatedOfficers.map((o, idx) => (
                    <tr key={o.id} className="hover:bg-blue-50/10 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-400 font-medium">{(officerPage - 1) * itemsPerPage + idx + 1}</td>
                      <td className="px-6 py-4 text-sm font-black text-blue-600 uppercase">{o.className}</td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{o.absensiNo || '-'}</td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{o.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-mono">{`${o.className}${String(o.absensiNo || '').padStart(2, '0')}`}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-mono">{o.nis || '-'}</td>
                      {isManagement && (
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                             {/* Note: Edit in this context is mainly done in Admin Dashboard roles, but we provide Hapus for management roles */}
                             <button
                                 onClick={() => alert('Fitur Edit sedang dalam pengembangan')}
                                 className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                                 title="Edit"
                               >
                                 <Edit size={14} />
                               </button>
                             <button 
                              onClick={() => handleRemoveOfficer(o.id!)}
                              className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                              title="Hapus Peran Petugas"
                            >
                               <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalOfficerPages > 1 && (
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Menampilkan {((officerPage - 1) * itemsPerPage) + 1} - {Math.min(officerPage * itemsPerPage, officers.length)} dari {officers.length} Petugas
              </p>
              <div className="flex items-center gap-2">
                <button 
                  disabled={officerPage === 1}
                  onClick={() => setOfficerPage(officerPage - 1)}
                  className="p-2 border border-gray-200 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                >
                  Sebelumnya
                </button>
                {[...Array(totalOfficerPages)].map((_, i) => (
                  <button 
                    key={i}
                    onClick={() => setOfficerPage(i + 1)}
                    className={cn(
                      "w-8 h-8 rounded text-xs font-bold transition-all",
                      officerPage === i + 1 ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "hover:bg-gray-200 bg-white border border-gray-200"
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
                <button 
                  disabled={officerPage === totalOfficerPages}
                  onClick={() => setOfficerPage(officerPage + 1)}
                  className="p-2 border border-gray-200 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {activeTab === 'history' && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold mb-6">Absensi Manual (Riwayat)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Siswa</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Kelas</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Jenis</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Tanggal</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Status</th>
                  {isManagement && (
                    <th className="px-6 py-3 text-[10px] font-bold text-gray-400 uppercase">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginatedHistory.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-blue-50/10">
                    <td className="px-6 py-4 font-bold text-sm text-gray-900">{item.studentName}</td>
                    <td className="px-6 py-4 text-sm">{item.className}</td>
                    <td className="px-6 py-4 text-sm">{item.type}</td>
                    <td className="px-6 py-4 text-sm">{item.date ? formatDate(new Date(item.date)) : '-'}</td>
                    <td className="px-6 py-4 text-sm">
                        <span className={cn(
                          "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase",
                          item.status === 'Approved' ? "bg-green-100 text-green-600" :
                          item.status === 'Rejected' ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                        )}>
                          {item.status}
                        </span>
                    </td>
                    {isManagement && (
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => { setFormData(item); setShowEditModal(true); }}
                            className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                            title="Edit"
                          >
                            <Edit size={14} />
                          </button>
                          <button 
                            onClick={() => handleDelete(item.id!)}
                            className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                            title="Hapus"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalHistoryPages > 1 && (
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between mt-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Menampilkan {((historyPage - 1) * itemsPerPage) + 1} - {Math.min(historyPage * itemsPerPage, attendance.length)} dari {attendance.length} Baris
              </p>
              <div className="flex items-center gap-2">
                <button 
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage(historyPage - 1)}
                  className="p-2 border border-gray-200 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                >
                  Sebelumnya
                </button>
                {[...Array(totalHistoryPages)].map((_, i) => (
                  <button 
                    key={i}
                    onClick={() => setHistoryPage(i + 1)}
                    className={cn(
                      "w-8 h-8 rounded text-xs font-bold transition-all",
                      historyPage === i + 1 ? "bg-blue-600 text-white shadow-md shadow-blue-200" : "hover:bg-gray-200 bg-white border border-gray-200"
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
                <button 
                  disabled={historyPage === totalHistoryPages}
                  onClick={() => setHistoryPage(historyPage + 1)}
                  className="p-2 border border-gray-200 rounded hover:bg-white disabled:opacity-50 transition-all font-bold text-xs"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {activeTab === 'rekap' && (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold mb-6">Rekap Absensi</h2>
          <AttendanceRecapTable 
            attendance={attendance} 
            students={students} 
            showClassFilter={true}
            classes={Array.from(new Set(students.map(s => s.className))).map((name, i) => ({ id: `${i}`, name: String(name) }))}
          />
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-blue-600 text-white">
              <h3 className="font-bold">Edit Presensi: {formData.studentName}</h3>
              <button onClick={() => setShowEditModal(false)} className="hover:bg-white/20 p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Jenis Absensi</label>
                <select 
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.type || ''}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                  required
                >
                  <option value="Sakit">Sakit</option>
                  <option value="Izin">Izin</option>
                  <option value="Dispensasi">Dispensasi</option>
                  <option value="Alpa">Alpa</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Status</label>
                <select 
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.status || ''}
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                  required
                >
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Keterangan / Alasan</label>
                <textarea 
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                  value={formData.reason || ''}
                  onChange={e => setFormData({ ...formData, reason: e.target.value })}
                  required
                />
              </div>
              <button 
                type="submit"
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 mt-4 uppercase tracking-widest text-sm"
              >
                Simpan Perubahan
              </button>
            </form>
          </div>
        </div>
      )}

      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full mx-auto text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Konfirmasi</h3>
            <p className="text-gray-600 mb-8">{confirmDialog.message}</p>
            <div className="flex gap-4 mb-2">
              <button
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold transition-all"
                onClick={() => setConfirmDialog({isOpen: false, message: '', onConfirm: () => {}})}
              >
                Batal
              </button>
              <button
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-200"
                onClick={() => {
                  setConfirmDialog({isOpen: false, message: '', onConfirm: () => {}});
                  confirmDialog.onConfirm();
                }}
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
