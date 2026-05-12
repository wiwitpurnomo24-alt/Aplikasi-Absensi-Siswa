import React, { useState, useMemo, useEffect } from 'react';
import { Student, SubjectAttendance, SchoolData, AcademicYear } from '../types';
import { collection, query, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FileDown, FileText, Download, Calendar as CalendarIcon } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDate, cn } from '../lib/utils';
import { getTenantCollection, getTenantDoc } from '../lib/tenant';

interface SubjectAttendanceRecapTableProps {
  students: Student[];
  attendance: SubjectAttendance[];
  selectedClass: string;
  subjectName: string;
  teacherName: string;
}

export default function SubjectAttendanceRecapTable({ 
  students, 
  attendance, 
  selectedClass,
  subjectName,
  teacherName 
}: SubjectAttendanceRecapTableProps) {
  const [selectedSemester, setSelectedSemester] = useState('Gasal');
  const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString());
  const [schoolData, setSchoolData] = useState<SchoolData | null>(null);
  const [academicYear, setAcademicYear] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const schoolSnap = await getDocs(query(getTenantCollection('schoolData'), limit(1)));
        if (!schoolSnap.empty) setSchoolData(schoolSnap.docs[0].data() as SchoolData);

        const yearSnap = await getDocs(query(getTenantCollection('academicYears'), limit(1)));
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

  const months = [
    { value: '7', label: 'Juli', sem: 'Gasal' },
    { value: '8', label: 'Agustus', sem: 'Gasal' },
    { value: '9', label: 'September', sem: 'Gasal' },
    { value: '10', label: 'Oktober', sem: 'Gasal' },
    { value: '11', label: 'November', sem: 'Gasal' },
    { value: '12', label: 'Desember', sem: 'Gasal' },
    { value: '1', label: 'Januari', sem: 'Genap' },
    { value: '2', label: 'Februari', sem: 'Genap' },
    { value: '3', label: 'Maret', sem: 'Genap' },
    { value: '4', label: 'April', sem: 'Genap' },
    { value: '5', label: 'Mei', sem: 'Genap' },
    { value: '6', label: 'Juni', sem: 'Genap' }
  ];

  const currentMonths = months.filter(m => m.sem === selectedSemester);
  
  const currentYear = new Date().getFullYear();
  const queryYear = (parseInt(selectedMonth) >= 7 && selectedSemester === 'Gasal') || (parseInt(selectedMonth) < 7 && selectedSemester === 'Genap')
    ? currentYear : (parseInt(selectedMonth) >= 7 ? currentYear - 1 : currentYear + 1);

  const daysInMonth = new Date(queryYear, parseInt(selectedMonth), 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const recapData = useMemo(() => {
    return students.map(student => {
      const studentAtt = attendance.filter(a => {
        const dateObj = new Date(a.date);
        return a.studentId === student.id && 
               (dateObj.getMonth() + 1).toString() === selectedMonth;
      });

      const dayMap: Record<number, string> = {};
      let s = 0, i = 0, a = 0, d = 0, h = 0;

      studentAtt.forEach(att => {
        const dateObj = new Date(att.date);
        const day = dateObj.getDate();
        
        let code = att.status; // S, I, D, A, H
        if (code === 'S') s++;
        else if (code === 'I') i++;
        else if (code === 'D') d++;
        else if (code === 'A') a++;
        else if (code === 'H') h++;
        
        // If multiple sessions in a day, we might have multiple statuses.
        // For simple recap, we take the last one or priority (A > S > I > D > H)
        if (!dayMap[day] || (code !== 'H' && dayMap[day] === 'H')) {
           dayMap[day] = code;
        }
      });

      return {
        ...student,
        dayMap,
        totals: { s, i, a, d, h }
      };
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [students, attendance, selectedMonth]);

  const exportToExcel = () => {
    const monthName = months.find(m => m.value === selectedMonth)?.label;
    const worksheetData = recapData.map((student, index) => {
      const data: any = {
        'No': index + 1,
        'NIS': student.nis,
        'Nama Siswa': student.name,
        'L/P': student.gender
      };
      daysArray.forEach(day => {
        data[`Tgl ${day}`] = student.dayMap[day] || '';
      });
      data['Hadir'] = student.totals.h;
      data['Sakit'] = student.totals.s;
      data['Izin'] = student.totals.i;
      data['Alpa'] = student.totals.a;
      data['Dispensasi'] = student.totals.d;
      return data;
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Absensi Mapel');
    XLSX.writeFile(workbook, `Rekap_Absensi_${subjectName}_${monthName}_${selectedClass}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a3');
    const monthName = months.find(m => m.value === selectedMonth)?.label;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`LAPORAN ABSENSI BULAN ${monthName?.toUpperCase()}`, doc.internal.pageSize.width / 2, 20, { align: 'center' });
    doc.text(`MATA PELAJARAN: ${subjectName.toUpperCase()} | KELAS: ${selectedClass}`, doc.internal.pageSize.width / 2, 28, { align: 'center' });
    doc.setFontSize(11);
    doc.text(`GURU PENGAMPU: ${teacherName} | TAHUN AJARAN: ${academicYear || '-'}`, doc.internal.pageSize.width / 2, 35, { align: 'center' });

    const headers = [
      ['No', 'NIS', 'Nama Siswa', 'L/P', ...daysArray.map(String), 'H', 'S', 'I', 'A', 'D']
    ];

    const body = recapData.map((student, index) => [
      index + 1,
      student.nis,
      student.name,
      student.gender,
      ...daysArray.map(day => student.dayMap[day] || '-'),
      student.totals.h,
      student.totals.s,
      student.totals.i,
      student.totals.a,
      student.totals.d
    ]);

    autoTable(doc, {
      head: headers,
      bodyStyles: { fontSize: 7 },
      headStyles: { fillColor: [30, 64, 175], halign: 'center', valign: 'middle' },
      body: body,
      startY: 45,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1, halign: 'center' },
      columnStyles: {
        2: { halign: 'left', cellWidth: 40 },
      }
    });

    doc.save(`Rekap_Absensi_${subjectName}_${monthName}_${selectedClass}.pdf`);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col mt-4">
      <div className="p-4 border-b border-gray-50 bg-gray-50/30 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-2">
           <CalendarIcon size={18} className="text-blue-600" />
           <span className="text-sm font-bold text-gray-700 uppercase tracking-tight">Laporan Bulanan: {subjectName}</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          <select
            value={selectedSemester}
            onChange={(e) => {
               const val = e.target.value;
               setSelectedSemester(val);
               setSelectedMonth(val === 'Gasal' ? '7' : '1');
            }}
            className="flex-1 md:flex-none p-2 border border-gray-200 rounded-lg text-xs outline-none font-bold bg-white"
          >
            <option value="Gasal">Semester Gasal</option>
            <option value="Genap">Semester Genap</option>
          </select>

          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="flex-1 md:flex-none p-2 border border-gray-200 rounded-lg text-xs outline-none font-bold bg-white"
          >
            {currentMonths.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
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

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1200px]">
          <thead>
            <tr className="bg-gray-100">
              <th rowSpan={2} className="p-2 border border-gray-200 text-[10px] font-bold text-gray-700 text-center w-10">No</th>
              <th rowSpan={2} className="p-2 border border-gray-200 text-[10px] font-bold text-gray-700 w-20">NIS</th>
              <th rowSpan={2} className="p-2 border border-gray-200 text-[10px] font-bold text-gray-700 min-w-[150px]">Nama Siswa</th>
              <th rowSpan={2} className="p-2 border border-gray-200 text-[10px] font-bold text-gray-700 text-center w-12">L/P</th>
              <th colSpan={daysInMonth} className="p-1 border border-gray-200 text-[10px] font-black text-blue-700 text-center bg-blue-50">
                {months.find(m => m.value === selectedMonth)?.label}
              </th>
              <th colSpan={5} className="p-1 border border-gray-200 text-[10px] font-black text-orange-700 text-center bg-orange-50">Rekap</th>
            </tr>
            <tr className="bg-gray-50">
              {daysArray.map(day => (
                <th key={`subject-recap-${day}`} className="p-1 border border-gray-200 text-[9px] font-bold text-gray-600 text-center w-7 bg-blue-50/50">
                  {day}
                </th>
              ))}
              <th className="p-1 border border-gray-200 text-[9px] font-bold text-green-700 text-center w-8 bg-orange-50/30">H</th>
              <th className="p-1 border border-gray-200 text-[9px] font-bold text-orange-700 text-center w-8 bg-orange-50/30">S</th>
              <th className="p-1 border border-gray-200 text-[9px] font-bold text-blue-700 text-center w-8 bg-orange-50/30">I</th>
              <th className="p-1 border border-gray-200 text-[9px] font-bold text-red-700 text-center w-8 bg-orange-50/30">A</th>
              <th className="p-1 border border-gray-200 text-[9px] font-bold text-purple-700 text-center w-8 bg-orange-50/30">D</th>
            </tr>
          </thead>
          <tbody>
            {recapData.map((student, idx) => (
              <tr key={student.id ? `${student.id}-${idx}` : `stud-${idx}`} className="hover:bg-blue-50/20 transition-colors">
                <td className="p-2 border border-gray-200 text-[10px] text-center">{idx + 1}</td>
                <td className="p-2 border border-gray-200 text-[10px] font-mono">{student.nis}</td>
                <td className="p-2 border border-gray-200 text-[10px] font-bold text-gray-900">{student.name}</td>
                <td className="p-2 border border-gray-200 text-[10px] text-center">{student.gender}</td>
                {daysArray.map(day => {
                  const status = student.dayMap[day];
                  return (
                    <td key={`subject-recap-${student.id}-${day}`} className={cn(
                      "p-1 border border-gray-200 text-[9px] text-center font-bold",
                      status === 'H' ? 'text-green-600 bg-green-50/30' :
                      status === 'S' ? 'text-orange-600 bg-orange-50/30' :
                      status === 'I' ? 'text-blue-600 bg-blue-50/30' :
                      status === 'A' ? 'text-red-600 bg-red-50/30' :
                      status === 'D' ? 'text-purple-600 bg-purple-50/30' : 'text-gray-300'
                    )}>
                      {status || '-'}
                    </td>
                  );
                })}
                <td className="p-2 border border-gray-200 text-[10px] text-center font-bold text-green-700 bg-green-50/20">{student.totals.h}</td>
                <td className="p-2 border border-gray-200 text-[10px] text-center font-bold text-orange-700 bg-orange-50/20">{student.totals.s}</td>
                <td className="p-2 border border-gray-200 text-[10px] text-center font-bold text-blue-700 bg-blue-50/20">{student.totals.i}</td>
                <td className="p-2 border border-gray-200 text-[10px] text-center font-bold text-red-700 bg-red-50/20">{student.totals.a}</td>
                <td className="p-2 border border-gray-200 text-[10px] text-center font-bold text-purple-700 bg-purple-50/20">{student.totals.d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
