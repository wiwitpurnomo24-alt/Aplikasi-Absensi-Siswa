import React, { useState, useMemo, useEffect } from 'react';
import { Student, AttendanceRecord, SchoolData, AcademicYear } from '../types';
import { collection, query, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FileDown, FileText, Download, Calendar } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDate } from '../lib/utils';

interface AttendanceRecapTableProps {
  students: Student[];
  attendance: AttendanceRecord[];
  classes?: {id: string, name: string}[];
  showClassFilter?: boolean;
}

export default function AttendanceRecapTable({ students, attendance, classes, showClassFilter = false }: AttendanceRecapTableProps) {
  const [selectedSemester, setSelectedSemester] = useState('Gasal');
  const [selectedMonth, setSelectedMonth] = useState('7'); // Juli
  const [selectedClass, setSelectedClass] = useState('All');
  const [schoolData, setSchoolData] = useState<SchoolData | null>(null);
  const [academicYear, setAcademicYear] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const schoolQ = query(collection(db, 'schoolData'), limit(1));
        const schoolSnap = await getDocs(schoolQ);
        if (!schoolSnap.empty) {
          setSchoolData(schoolSnap.docs[0].data() as SchoolData);
        }

        const yearQ = query(collection(db, 'academicYears'), limit(1));
        const yearSnap = await getDocs(yearQ);
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

  const gasalMonths = [
    { value: '7', label: 'Juli' },
    { value: '8', label: 'Agustus' },
    { value: '9', label: 'September' },
    { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' },
    { value: '12', label: 'Desember' }
  ];

  const genapMonths = [
    { value: '1', label: 'Januari' },
    { value: '2', label: 'Februari' },
    { value: '3', label: 'Maret' },
    { value: '4', label: 'April' },
    { value: '5', label: 'Mei' },
    { value: '6', label: 'Juni' }
  ];

  const currentMonths = selectedSemester === 'Gasal' ? gasalMonths : genapMonths;
  const currentYear = new Date().getFullYear();
  // If gasal (Jul-Dec), the year is usually the start of academic year. 
  // We'll just use current year. To be exact we'd need academic year, but let's assume current year.
  // Actually, we can just use the year from the latest attendance or current date.
  const queryYear = selectedSemester === 'Gasal' && parseInt(selectedMonth) < 7 
    ? currentYear - 1 
    : (selectedSemester === 'Genap' && parseInt(selectedMonth) >= 7 ? currentYear + 1 : currentYear);

  const daysInMonth = new Date(queryYear, parseInt(selectedMonth), 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const filteredStudents = useMemo(() => {
    let result = students;
    if (showClassFilter && selectedClass !== 'All') {
      result = result.filter(s => s.className === selectedClass);
    }
    return result;
  }, [students, showClassFilter, selectedClass]);

  const recapData = useMemo(() => {
    return filteredStudents.map(student => {
      const studentAtt = attendance.filter(a => {
        if (a.status === 'Pending') return false; // Maybe only count approved/handled? Wait, if it exists we count unless we have a specific rule. Let's count all or just Approved. Since previous logic didn't filter by status, we won't here, except maybe Pending.
        const dateObj = new Date(a.date);
        return a.studentId === student.id && 
               (dateObj.getMonth() + 1).toString() === selectedMonth;
      });

      const dayMap: Record<number, string> = {};
      let s = 0, i = 0, a = 0, d = 0;

      studentAtt.forEach(att => {
        const dateObj = new Date(att.date);
        const day = dateObj.getDate();
        
        let code = '';
        if (att.type === 'Sakit') { code = 'S'; s++; }
        else if (att.type === 'Izin') { code = 'I'; i++; }
        else if (att.type === 'Dispensasi') { code = 'D'; d++; }
        else if (att.type === 'Alpa' || att.type === 'Alpha' as any) { code = 'A'; a++; }
        
        if (code) {
          dayMap[day] = code;
        }
      });

      return {
        ...student,
        dayMap,
        totals: { s, i, a, d }
      };
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [filteredStudents, attendance, selectedMonth]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedMonth, selectedSemester, selectedClass]);
  
  const totalPages = Math.ceil(recapData.length / itemsPerPage);
  const currentData = recapData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSemesterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedSemester(val);
    setSelectedMonth(val === 'Gasal' ? '7' : '1');
  };

  const exportToExcel = () => {
    const monthName = currentMonths.find(m => m.value === selectedMonth)?.label;
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
      
      data['Sakit'] = student.totals.s;
      data['Izin'] = student.totals.i;
      data['Alpa'] = student.totals.a;
      data['Dispensasi'] = student.totals.d;
      
      return data;
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Absensi');
    
    XLSX.writeFile(workbook, `Rekap_Absensi_${monthName}_${selectedClass}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a3');
    const monthName = currentMonths.find(m => m.value === selectedMonth)?.label;

    if (schoolData) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(schoolData.pemda.toUpperCase(), doc.internal.pageSize.width / 2, 15, { align: 'center' });
      doc.text(schoolData.dinas.toUpperCase(), doc.internal.pageSize.width / 2, 22, { align: 'center' });
      doc.setFontSize(18);
      doc.text(schoolData.sekolah.toUpperCase(), doc.internal.pageSize.width / 2, 30, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(schoolData.alamat, doc.internal.pageSize.width / 2, 37, { align: 'center' });
      doc.setLineWidth(1);
      doc.line(20, 42, doc.internal.pageSize.width - 20, 42);
      doc.setLineWidth(0.5);
      doc.line(20, 43, doc.internal.pageSize.width - 20, 43);
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`LAPORAN ABSENSI BULAN ${monthName?.toUpperCase()}`, doc.internal.pageSize.width / 2, 55, { align: 'center' });
    doc.text(`TAHUN AJARAN ${academicYear || '-'}`, doc.internal.pageSize.width / 2, 62, { align: 'center' });
    
    doc.setFontSize(11);
    doc.text(`KELAS : ${selectedClass === 'All' ? 'SEMUA KELAS' : selectedClass}`, 20, 75);

    const headers = [
      ['No', 'NIS', 'Nama Siswa', 'L/P', ...daysArray.map(String), 'S', 'I', 'A', 'D']
    ];

    const body = recapData.map((student, index) => [
      index + 1,
      student.nis,
      student.name,
      student.gender,
      ...daysArray.map(day => student.dayMap[day] || '-'),
      student.totals.s,
      student.totals.i,
      student.totals.a,
      student.totals.d
    ]);

    autoTable(doc, {
      head: headers,
      bodyStyles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185], halign: 'center', valign: 'middle' },
      body: body,
      startY: 90,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', halign: 'center' },
      columnStyles: {
        2: { halign: 'left', cellWidth: 50 },
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    const pageWidth = doc.internal.pageSize.width;

    doc.setFontSize(10);
    // Kiri: Mengetahui / Kepala Sekolah
    doc.text('Mengetahui,', 40, finalY);
    doc.text('Kepala Sekolah', 40, finalY + 7);
    doc.text(schoolData?.kepalaSekolah || '................................', 40, finalY + 35);
    doc.text(`NIP. ${schoolData?.nipKepalaSekolah || '................................'}`, 40, finalY + 42);

    // Kanan: Wali Kelas
    doc.text(`${schoolData?.kota || 'Kota'}, ${formatDate(new Date())}`, pageWidth - 60, finalY);
    doc.text('Wali Kelas', pageWidth - 60, finalY + 7);
    doc.text('................................', pageWidth - 60, finalY + 35);
    doc.text('NIP. ................................', pageWidth - 60, finalY + 42);

    doc.save(`Rekap_Absensi_${monthName}_${selectedClass}.pdf`);
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      <div className="p-6 md:p-8 border-b border-gray-100">
        <h3 className="text-xl font-bold text-gray-900">Rekapitulasi Absensi Siswa</h3>
        <p className="text-sm text-gray-500">Laporan kehadiran siswa per bulan dan semester</p>
        
        <div className="flex flex-wrap items-center gap-4 mt-6">
          {showClassFilter && (
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="p-2 border border-gray-300 rounded-lg text-sm outline-none font-medium"
            >
              <option value="All">Semua Kelas</option>
              {classes?.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}

          <select
            value={selectedSemester}
            onChange={handleSemesterChange}
            className="p-2 border border-gray-300 rounded-lg text-sm outline-none font-medium"
          >
            <option value="Gasal">Semester Gasal</option>
            <option value="Genap">Semester Genap</option>
          </select>

          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg text-sm outline-none font-medium"
          >
            {currentMonths.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <div className="flex items-center gap-2 ml-auto">
            <button
               onClick={() => window.print()}
               className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-all flex items-center gap-2 border border-blue-100"
            >
              <FileDown size={18} />
              <span className="hidden sm:inline">PREVIEW LAPORAN</span>
            </button>
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-green-50 text-green-700 rounded-xl text-sm font-bold hover:bg-green-100 transition-all flex items-center gap-2 border border-green-100"
              title="Download Excel"
            >
              <Download size={18} />
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button
              onClick={exportToPDF}
              className="px-4 py-2 bg-red-50 text-red-700 rounded-xl text-sm font-bold hover:bg-red-100 transition-all flex items-center gap-2 border border-red-100"
              title="Download PDF"
            >
              <FileText size={18} />
              <span className="hidden sm:inline">PDF</span>
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr>
              <th rowSpan={2} className="p-3 border border-gray-200 text-xs font-bold text-gray-700 bg-gray-50 text-center w-12">No</th>
              <th rowSpan={2} className="p-3 border border-gray-200 text-xs font-bold text-gray-700 bg-gray-50 w-24">NIS</th>
              <th rowSpan={2} className="p-3 border border-gray-200 text-xs font-bold text-gray-700 bg-gray-50 min-w-[180px]">Nama Siswa</th>
              <th rowSpan={2} className="p-3 border border-gray-200 text-xs font-bold text-gray-700 bg-gray-50 text-center w-16">L/P</th>
              <th colSpan={daysInMonth} className="p-2 border border-gray-200 text-xs font-bold text-gray-700 bg-blue-50 text-center">
                {currentMonths.find(m => m.value === selectedMonth)?.label}
              </th>
              <th colSpan={4} className="p-2 border border-gray-200 text-xs font-bold text-gray-700 bg-orange-50 text-center">Jumlah Absensi</th>
            </tr>
            <tr>
              {daysArray.map(day => (
                <th key={day} className="p-2 border border-gray-200 text-[10px] font-bold text-gray-600 bg-blue-50/50 text-center w-8">
                  {day}
                </th>
              ))}
              <th className="p-2 border border-gray-200 text-xs font-bold text-gray-700 bg-orange-50/50 text-center w-10">S</th>
              <th className="p-2 border border-gray-200 text-xs font-bold text-gray-700 bg-orange-50/50 text-center w-10">I</th>
              <th className="p-2 border border-gray-200 text-xs font-bold text-gray-700 bg-orange-50/50 text-center w-10">A</th>
              <th className="p-2 border border-gray-200 text-xs font-bold text-gray-700 bg-orange-50/50 text-center w-10">D</th>
            </tr>
          </thead>
          <tbody>
            {currentData.length > 0 ? (
              currentData.map((student, index) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="p-2 border border-gray-200 text-xs text-center">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                  <td className="p-2 border border-gray-200 text-xs">{student.nis}</td>
                  <td className="p-2 border border-gray-200 text-xs font-medium text-gray-900">{student.name}</td>
                  <td className="p-2 border border-gray-200 text-xs text-center">{student.gender}</td>
                  {daysArray.map(day => {
                    const code = student.dayMap[day];
                    return (
                      <td key={day} className={`p-1 border border-gray-200 text-[10px] text-center font-bold
                        ${code === 'S' ? 'bg-orange-100 text-orange-700' : ''}
                        ${code === 'I' ? 'bg-yellow-100 text-yellow-700' : ''}
                        ${code === 'A' ? 'bg-red-100 text-red-700' : ''}
                        ${code === 'D' ? 'bg-purple-100 text-purple-700' : ''}
                      `}>
                        {code || '-'}
                      </td>
                    );
                  })}
                  <td className="p-2 border border-gray-200 text-xs text-center font-bold text-orange-600">{student.totals.s}</td>
                  <td className="p-2 border border-gray-200 text-xs text-center font-bold text-yellow-600">{student.totals.i}</td>
                  <td className="p-2 border border-gray-200 text-xs text-center font-bold text-red-600">{student.totals.a}</td>
                  <td className="p-2 border border-gray-200 text-xs text-center font-bold text-purple-600">{student.totals.d}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={daysInMonth + 8} className="p-8 text-center text-sm text-gray-500">
                  Tidak ada data siswa.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">Halaman {currentPage} dari {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sebelumnya
            </button>
            <div className="flex items-center gap-1">
              {Array.from({length: totalPages}, (_, i) => i + 1).map(pageNum => (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                    pageNum === currentPage
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
            </div>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
