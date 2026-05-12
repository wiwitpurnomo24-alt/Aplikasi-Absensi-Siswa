import React, { useState, useMemo } from 'react';
import { Student, AttendanceRecord } from '../types';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FileDown, Download, Edit, Trash2, Save, X, Calendar } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDate } from '../lib/utils';
import { startOfWeek, endOfWeek, format, isWithinInterval, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { getTenantCollection, getTenantDoc } from '../lib/tenant';
import { useAuthStore } from '../lib/auth-store';

interface IndividualAttendanceProps {
  students: Student[];
  attendance: AttendanceRecord[];
  classes?: {id: string, name: string}[];
  onAttendanceChange: () => void;
}

export default function IndividualAttendance({ students, attendance, classes, onAttendanceChange }: IndividualAttendanceProps) {
  const { user } = useAuthStore();
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [period, setPeriod] = useState<'mingguan' | 'bulanan' | 'semester'>('bulanan');
  
  // Weekly
  const [selectedWeek, setSelectedWeek] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  // Monthly
  const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString());
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  
  // Semester
  const [selectedSemester, setSelectedSemester] = useState<'Gasal' | 'Genap'>('Gasal');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<string>('');
  const [editType, setEditType] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');

  const classStudents = useMemo(() => {
    if (!selectedClass) return [];
    return students.filter(s => s.className === selectedClass).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [students, selectedClass]);

  const studentInfo = useMemo(() => {
    return students.find(s => s.id === selectedStudent);
  }, [students, selectedStudent]);

  const filteredAttendance = useMemo(() => {
    if (!selectedStudent) return [];
    
    let filtered = attendance.filter(a => a.studentId === selectedStudent);
    
    if (period === 'mingguan') {
      const date = parseISO(selectedWeek);
      const start = startOfWeek(date, { weekStartsOn: 1 });
      const end = endOfWeek(date, { weekStartsOn: 1 });
      filtered = filtered.filter(a => {
        const aDate = parseISO(a.date);
        return isWithinInterval(aDate, { start, end });
      });
    } else if (period === 'bulanan') {
      filtered = filtered.filter(a => {
        const aDate = parseISO(a.date);
        return (aDate.getMonth() + 1).toString() === selectedMonth && aDate.getFullYear().toString() === selectedYear;
      });
    } else if (period === 'semester') {
      const ganjilMonths = [7, 8, 9, 10, 11, 12];
      const genapMonths = [1, 2, 3, 4, 5, 6];
      filtered = filtered.filter(a => {
        const aDate = parseISO(a.date);
        const month = aDate.getMonth() + 1;
        if (selectedSemester === 'Gasal') {
          return ganjilMonths.includes(month);
        } else {
          return genapMonths.includes(month);
        }
      });
    }

    return filtered.sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance, selectedStudent, period, selectedWeek, selectedMonth, selectedYear, selectedSemester]);

  const handleDelete = async (id: string) => {
    if (window.confirm("Apakah Anda yakin ingin menghapus data ini?")) {
      try {
        await deleteDoc(getTenantDoc('attendance', id));
        onAttendanceChange();
      } catch (err: any) {
        alert("Gagal menghapus data: " + err.message);
      }
    }
  };

  const handleEdit = (record: AttendanceRecord) => {
    setEditingId(record.id!);
    setEditStatus(record.status);
    setEditType(record.type);
    setEditReason(record.reason || '');
    setEditNotes(record.notes || '');
  };

  const handleSave = async (id: string) => {
    try {
      const record = filteredAttendance.find(a => a.id === id);
      if (!record) return;

      const response = await fetch('/api/attendance/approve-leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendanceId: id,
          status: editStatus,
          statusReason: editReason,
          notes: editNotes,
          studentId: record.studentId,
          studentName: record.studentName,
          className: record.className,
          parentPhone: record.parentPhone,
          type: editType,
          schoolId: user?.schoolId || 'default',
          processedBy: user?.name,
          processedById: user?.uid
        })
      });
      
      if (!response.ok) throw new Error("Gagal mengupdate status via API");

      setEditingId(null);
      onAttendanceChange();
    } catch (err: any) {
      alert("Gagal mengupdate data: " + err.message);
    }
  };

  const exportPDF = () => {
    if (!studentInfo) return;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text(`LAPORAN KETIDAKHADIRAN: ${studentInfo.name}`, 14, 15);
    doc.setFontSize(11);
    doc.text(`Kelas: ${studentInfo.className} | NIS/NISN: ${studentInfo.nis || '-'}/${studentInfo.nisn || '-'}`, 14, 22);
    
    let periodText = '';
    if (period === 'mingguan') {
      const date = parseISO(selectedWeek);
      periodText = `Periode Mingguan: ${format(startOfWeek(date, {weekStartsOn: 1}), 'dd MMM', {locale: id})} - ${format(endOfWeek(date, {weekStartsOn: 1}), 'dd MMM yyyy', {locale: id})}`;
    } else if (period === 'bulanan') {
       const monthName = format(parseISO(`2000-${selectedMonth.padStart(2, '0')}-01`), 'MMMM', {locale: id});
       periodText = `Periode Bulanan: ${monthName} ${selectedYear}`;
    } else {
       periodText = `Periode Semester: ${selectedSemester}`;
    }
    
    doc.text(periodText, 14, 28);
    
    const body = filteredAttendance.map((a, i) => [
      a.date,
      a.type.toUpperCase(),
      a.status === 'Approved' ? 'Diterima' : a.status === 'Rejected' ? 'Ditolak' : 'Diterima',
      a.reason || '-',
      a.notes || '-',
      a.teacherName || '-'
    ]);

    autoTable(doc, {
      startY: 35,
      head: [['Tanggal', 'Jenis', 'Status Validasi', 'Alasan', 'Catatan', 'Pencatat']],
      body: body,
      headStyles: { fillColor: [41, 128, 185] },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 40;
    
    const countSakit = filteredAttendance.filter(a => a.type === 'Sakit').length;
    const countIzin = filteredAttendance.filter(a => a.type === 'Izin').length;
    const countDispensasi = filteredAttendance.filter(a => a.type === 'Dispensasi').length;
    const countAlpha = filteredAttendance.filter(a => a.type === 'Alpa' || (a.type as any) === 'Alpha').length;

    doc.setFontSize(10);
    doc.text(`Rekapitulasi:`, 14, finalY + 10);
    doc.text(`- Sakit: ${countSakit}`, 14, finalY + 16);
    doc.text(`- Izin: ${countIzin}`, 14, finalY + 22);
    doc.text(`- Dispensasi: ${countDispensasi}`, 14, finalY + 28);
    doc.text(`- Alpha: ${countAlpha}`, 45, finalY + 16);

    doc.save(`Absensi_${studentInfo.name}_${periodText.replace(/ /g, '_')}.pdf`);
  };

  const exportExcel = () => {
    if (!studentInfo) return;
    
    const data = filteredAttendance.map(a => ({
      'Tanggal': a.date,
      'Jenis': a.type.toUpperCase(),
      'Status Validasi': a.status === 'Approved' ? 'Diterima' : a.status === 'Rejected' ? 'Ditolak' : 'Diterima',
      'Alasan': a.reason || '-',
      'Pencatat': a.teacherName || '-',
      'Catatan': a.notes || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absensi Individual");
    XLSX.writeFile(wb, `Absensi_${studentInfo.name.replace(/\\s/g, '_')}.xlsx`);
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
          <Calendar size={18} className="text-blue-600" />
          Absensi Individual
        </h2>
        {filteredAttendance.length > 0 && selectedStudent && (
          <div className="flex gap-1.5">
            <button 
              onClick={exportExcel}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-[10px] font-bold hover:bg-green-700 transition-all flex items-center gap-1.5"
            >
              <Download size={14} /> EXCEL
            </button>
            <button 
              onClick={exportPDF}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-bold hover:bg-red-700 transition-all flex items-center gap-1.5"
            >
              <FileDown size={14} /> PDF
            </button>
          </div>
        )}
      </div>

      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[150px]">
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Pilih Kelas</label>
          <select
            className="w-full p-1.5 border border-gray-200 rounded-lg text-[11px] font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={selectedClass}
            onChange={(e) => {
               setSelectedClass(e.target.value);
               setSelectedStudent('');
            }}
          >
            <option value="">-- Pilih Kelas --</option>
            {classes?.map(cls => (
              <option key={`cls-opt-${cls.id}`} value={cls.name}>{cls.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[150px]">
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Pilih Siswa</label>
          <select
            className="w-full p-1.5 border border-gray-200 rounded-lg text-[11px] font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100"
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
            disabled={!selectedClass}
          >
            <option value="">-- {selectedClass ? 'Pilih Siswa' : 'Pilih Kelas Dulu'} --</option>
            {classStudents.map(student => (
              <option key={`stud-opt-${student.id}`} value={student.id}>{student.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[150px]">
          <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Periode Laporan</label>
          <select
            className="w-full p-1.5 border border-gray-200 rounded-lg text-[11px] font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
          >
            <option value="mingguan">Mingguan</option>
            <option value="bulanan">Bulanan</option>
            <option value="semester">Semester</option>
          </select>
        </div>

        {period === 'mingguan' && (
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Pilih Tanggal</label>
            <input 
              type="date"
              className="w-full p-1.5 border border-gray-200 rounded-lg text-[11px] font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
            />
          </div>
        )}

        {period === 'bulanan' && (
          <>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Bulan</label>
              <select
                className="w-full p-1.5 border border-gray-200 rounded-lg text-[11px] font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {[...Array(12)].map((_, i) => (
                  <option key={`month-opt-${i+1}`} value={(i+1).toString()}>{format(parseISO(`2000-${(i+1).toString().padStart(2, '0')}-01`), 'MMMM', {locale: id})}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[80px]">
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Tahun</label>
              <select
                 className="w-full p-1.5 border border-gray-200 rounded-lg text-[11px] font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                 value={selectedYear}
                 onChange={(e) => setSelectedYear(e.target.value)}
              >
                 <option value={new Date().getFullYear().toString()}>{new Date().getFullYear()}</option>
                 <option value={(new Date().getFullYear() - 1).toString()}>{new Date().getFullYear() - 1}</option>
              </select>
            </div>
          </>
        )}

        {period === 'semester' && (
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Semester</label>
            <select
              className="w-full p-1.5 border border-gray-200 rounded-lg text-[11px] font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value as any)}
            >
              <option value="Gasal">Gasal (Juli - Desember)</option>
              <option value="Genap">Genap (Januari - Juni)</option>
            </select>
          </div>
        )}
      </div>

      {!selectedStudent ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
          <Calendar className="mx-auto h-8 w-8 text-gray-300 mb-2" />
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Silakan pilih kelas dan siswa terlebih dahulu</p>
        </div>
      ) : Object.keys(filteredAttendance).length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Tidak ada riwayat ketidakhadiran</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Tanggal</th>
                <th className="px-4 py-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Jenis</th>
                <th className="px-4 py-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                <th className="px-4 py-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Alasan</th>
                <th className="px-4 py-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Catatan</th>
                <th className="px-4 py-2 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Pencatat</th>
                <th className="px-4 py-2 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Aksi</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {filteredAttendance.map((record) => (
                <tr key={`att-row-${record.id}`} className="hover:bg-gray-50/50 transition-colors">
                  {editingId === record.id ? (
                     <>
                        <td className="px-4 py-2 whitespace-nowrap text-xs font-bold text-gray-700">{formatDate(record.date)}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs">
                           <select className="border border-gray-200 p-1 rounded-md text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={editType} onChange={e => setEditType(e.target.value)}>
                              <option value="sakit">Sakit</option>
                              <option value="izin">Izin</option>
                              <option value="dispensasi">Dispensasi</option>
                              <option value="alpha">Alpha</option>
                           </select>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs">
                           <select className="border border-gray-200 p-1 rounded-md text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                              <option value="Approved">Diterima</option>
                              <option value="Rejected">Ditolak</option>
                           </select>
                        </td>
                        <td className="px-4 py-2 text-xs">
                           <input type="text" className="border border-gray-200 p-1 rounded-md w-full text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={editReason} onChange={e => setEditReason(e.target.value)} />
                        </td>
                        <td className="px-4 py-2 text-xs">
                           <input type="text" className="border border-gray-200 p-1 rounded-md w-full text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs font-bold text-gray-400">{record.teacherName || '-'}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-center space-x-1.5">
                           <button onClick={() => handleSave(record.id!)} className="text-green-600 hover:text-green-900 bg-green-50 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest">SIMPAN</button>
                           <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-900 bg-gray-100 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest">BATAL</button>
                        </td>
                     </>
                  ) : (
                     <>
                        <td className="px-4 py-2 whitespace-nowrap text-xs font-bold text-gray-800">
                           {formatDate(record.date)}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-[10px] font-black text-gray-500 uppercase tracking-widest">
                           {record.type}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                           {record.status === 'Approved' ? (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[9px] font-black uppercase tracking-widest">Diterima</span>
                           ) : record.status === 'Rejected' ? (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[9px] font-black uppercase tracking-widest">Ditolak</span>
                           ) : (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[9px] font-black uppercase tracking-widest">Diterima</span>
                           )}
                        </td>
                        <td className="px-4 py-2 text-[11px] font-bold text-gray-500">
                           {record.reason || '-'}
                        </td>
                        <td className="px-4 py-2 text-[11px] font-bold text-gray-400 italic">
                           {record.notes || '-'}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-[10px] font-bold text-gray-400">
                           {record.teacherName || '-'}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-center space-x-1">
                           <button 
                             onClick={() => handleEdit(record)} 
                             className="text-blue-600 hover:text-blue-900 transition-colors bg-blue-50 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest"
                             title="Edit"
                           >
                             EDIT
                           </button>
                           <button 
                             onClick={() => handleDelete(record.id!)} 
                             className="text-red-500 hover:text-red-700 transition-colors bg-red-50 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest"
                             title="Hapus"
                           >
                             HAPUS
                           </button>
                        </td>
                     </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

  );
}
