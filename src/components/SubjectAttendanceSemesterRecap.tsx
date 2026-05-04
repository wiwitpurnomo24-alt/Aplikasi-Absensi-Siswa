import React, { useState, useMemo, useEffect } from 'react';
import { Student, SubjectAttendance, SchoolData, AcademicYear } from '../types';
import { collection, query, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FileDown, FileText, Download, TrendingUp } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDate } from '../lib/utils';

interface SubjectAttendanceSemesterRecapProps {
  students: Student[];
  attendance: SubjectAttendance[];
  selectedClass: string;
  subjectName: string;
  teacherName: string;
}

export default function SubjectAttendanceSemesterRecap({ 
  students, 
  attendance, 
  selectedClass,
  subjectName,
  teacherName 
}: SubjectAttendanceSemesterRecapProps) {
  const [selectedSemester, setSelectedSemester] = useState('1'); // 1 or 2
  const [schoolData, setSchoolData] = useState<SchoolData | null>(null);
  const [academicYear, setAcademicYear] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const schoolSnap = await getDocs(query(collection(db, 'schoolData'), limit(1)));
        if (!schoolSnap.empty) setSchoolData(schoolSnap.docs[0].data() as SchoolData);

        const yearSnap = await getDocs(query(collection(db, 'academicYears'), limit(1)));
        if (!yearSnap.empty) {
          const activeYear = yearSnap.docs.find(d => d.data().active)?.data() as AcademicYear;
          if (activeYear) setAcademicYear(activeYear.year);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    }
    fetchData();
  }, []);

  const recapData = useMemo(() => {
    return students.map((student, index) => {
      const studentAtt = attendance.filter(a => {
        const month = new Date(a.date).getMonth() + 1;
        const inSemester = selectedSemester === '1' ? (month >= 7 && month <= 12) : (month >= 1 && month <= 6);
        return a.studentId === student.id && inSemester;
      });

      let s = 0, i = 0, a = 0, d = 0, h = 0;
      studentAtt.forEach(att => {
        if (att.status === 'S') s++;
        else if (att.status === 'I') i++;
        else if (att.status === 'D') d++;
        else if (att.status === 'A') a++;
        else if (att.status === 'H') h++;
      });

      return {
        ...student,
        no: index + 1,
        totals: { s, i, a, d, h },
        totalAbsen: s + i + a + d,
        totalHadir: h
      };
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [students, attendance, selectedSemester]);

  const exportToExcel = () => {
    const wsData = recapData.map(s => ({
      'No': s.no,
      'NIS': s.nis,
      'Nama Siswa': s.name,
      'L/P': s.gender,
      'Hadir': s.totals.h,
      'Sakit': s.totals.s,
      'Izin': s.totals.i,
      'Alpa': s.totals.a,
      'Dispensasi': s.totals.d,
      'Total Absen': s.totalAbsen
    }));

    const worksheet = XLSX.utils.json_to_sheet(wsData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Semester Mapel');
    XLSX.writeFile(workbook, `Rekap_Semester_${subjectName}_Sms${selectedSemester}_${selectedClass}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`LAPORAN ABSENSI SEMESTER ${selectedSemester === '1' ? 'GANJIL' : 'GENAP'}`, doc.internal.pageSize.width / 2, 20, { align: 'center' });
    doc.text(`MATA PELAJARAN: ${subjectName.toUpperCase()} | KELAS: ${selectedClass}`, doc.internal.pageSize.width / 2, 28, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`GURU PENGAMPU: ${teacherName} | TAHUN AJARAN: ${academicYear || '-'}`, doc.internal.pageSize.width / 2, 35, { align: 'center' });

    autoTable(doc, {
      startY: 45,
      head: [['No', 'NIS', 'Nama Siswa', 'L/P', 'H', 'S', 'I', 'A', 'D', 'Total']],
      body: recapData.map((s, idx) => [
        idx + 1, 
        s.nis, 
        s.name, 
        s.gender, 
        s.totals.h, 
        s.totals.s, 
        s.totals.i, 
        s.totals.a, 
        s.totals.d, 
        s.totalAbsen
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 64, 175], halign: 'center' },
      styles: { fontSize: 9, halign: 'center', cellPadding: 2 }
    });

    doc.save(`Rekap_Semester_${subjectName}_Sms${selectedSemester}_${selectedClass}.pdf`);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col mt-4">
      <div className="p-4 border-b border-gray-50 bg-indigo-50/20 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-2">
           <TrendingUp size={18} className="text-indigo-600" />
           <span className="text-sm font-bold text-gray-700 uppercase tracking-tight">Laporan Semester: {subjectName}</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          <select
            value={selectedSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="flex-1 md:flex-none p-2 border border-gray-200 rounded-lg text-xs outline-none font-bold bg-white"
          >
            <option value="1">Semester 1 (Ganjil)</option>
            <option value="2">Semester 2 (Genap)</option>
          </select>

          <div className="flex w-full md:w-auto gap-2">
            <button
              onClick={exportToExcel}
              className="flex-1 md:flex-none px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-[10px] font-bold hover:bg-green-100 transition-all flex items-center justify-center gap-1 border border-green-100 uppercase"
            >
              <Download size={14} /> Excel
            </button>
            <button
              onClick={exportToPDF}
              className="flex-1 md:flex-none px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-[10px] font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-1 border border-red-100 uppercase"
            >
              <FileText size={14} /> PDF
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-3 border border-gray-200 text-[10px] font-bold text-gray-700 text-center w-10 uppercase">No</th>
              <th className="p-3 border border-gray-200 text-[10px] font-bold text-gray-700 w-24 uppercase">NIS</th>
              <th className="p-3 border border-gray-200 text-[10px] font-bold text-gray-700 uppercase">Nama Siswa</th>
              <th className="p-3 border border-gray-200 text-[10px] font-bold text-gray-700 text-center w-16 uppercase">L/P</th>
              <th className="p-3 border border-gray-200 text-[10px] font-black text-green-700 text-center w-12 bg-green-50/50 uppercase">H</th>
              <th className="p-3 border border-gray-200 text-[10px] font-black text-orange-700 text-center w-12 bg-orange-50/50 uppercase">S</th>
              <th className="p-3 border border-gray-200 text-[10px] font-black text-blue-700 text-center w-12 bg-blue-50/50 uppercase">I</th>
              <th className="p-3 border border-gray-200 text-[10px] font-black text-red-700 text-center w-12 bg-red-50/50 uppercase">A</th>
              <th className="p-3 border border-gray-200 text-[10px] font-black text-purple-700 text-center w-12 bg-purple-50/50 uppercase">D</th>
              <th className="p-3 border border-gray-200 text-[10px] font-black text-gray-900 text-center w-20 bg-gray-100/50 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recapData.length > 0 ? (
              recapData.map((s, idx) => (
                <tr key={s.id ? `${s.id}-${idx}` : `stud-${idx}`} className="hover:bg-indigo-50/30 transition-colors">
                  <td className="p-3 border border-gray-100 text-[10px] text-center font-bold text-gray-400">{idx + 1}</td>
                  <td className="p-3 border border-gray-100 text-[10px] font-mono text-gray-600">{s.nis}</td>
                  <td className="p-3 border border-gray-100 text-[11px] font-bold text-gray-900">{s.name}</td>
                  <td className="p-3 border border-gray-100 text-[11px] text-center font-bold text-gray-500">{s.gender}</td>
                  <td className="p-3 border border-gray-100 text-[11px] text-center font-bold text-green-600 bg-green-50/20">{s.totals.h}</td>
                  <td className="p-3 border border-gray-100 text-[11px] text-center font-bold text-orange-600 bg-orange-50/20">{s.totals.s}</td>
                  <td className="p-3 border border-gray-100 text-[11px] text-center font-bold text-blue-600 bg-blue-50/20">{s.totals.i}</td>
                  <td className="p-3 border border-gray-100 text-[11px] text-center font-bold text-red-600 bg-red-50/20">{s.totals.a}</td>
                  <td className="p-3 border border-gray-100 text-[11px] text-center font-bold text-purple-600 bg-purple-50/20">{s.totals.d}</td>
                  <td className="p-3 border border-gray-100 text-[11px] text-center font-black text-gray-900 bg-gray-50/50">{s.totalAbsen}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="p-8 text-center text-xs text-gray-400 uppercase font-bold tracking-widest italic">
                  Data tidak ditemukan untuk semester ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
