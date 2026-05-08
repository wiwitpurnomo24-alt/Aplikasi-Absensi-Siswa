import React, { useState, useMemo, useEffect } from 'react';
import { Student, AttendanceRecord, SchoolData, AcademicYear } from '../types';
import { collection, query, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FileDown, FileText, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDate } from '../lib/utils';
import { getTenantCollection, getTenantDoc } from '../lib/tenant';

interface SemesterAttendanceRecapTableProps {
  students: Student[];
  attendance: AttendanceRecord[];
  classes?: {id: string, name: string}[];
  showClassFilter?: boolean;
}

export default function SemesterAttendanceRecapTable({ students, attendance, classes, showClassFilter = false }: SemesterAttendanceRecapTableProps) {
  const [selectedSemester, setSelectedSemester] = useState('Gasal');
  const [selectedClass, setSelectedClass] = useState('All');
  const [schoolData, setSchoolData] = useState<SchoolData | null>(null);
  const [academicYear, setAcademicYear] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const schoolQ = query(getTenantCollection('schoolData'), limit(1));
        const schoolSnap = await getDocs(schoolQ);
        if (!schoolSnap.empty) {
          setSchoolData(schoolSnap.docs[0].data() as SchoolData);
        }

        const yearQ = query(getTenantCollection('academicYears'), limit(1));
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

  const gasalMonths = ['7', '8', '9', '10', '11', '12'];
  const genapMonths = ['1', '2', '3', '4', '5', '6'];

  const currentMonths = selectedSemester === 'Gasal' ? gasalMonths : genapMonths;

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
        const dateObj = new Date(a.date);
        return a.studentId === student.id && 
               currentMonths.includes((dateObj.getMonth() + 1).toString());
      });

      let s = 0, i = 0, a = 0, d = 0;

      studentAtt.forEach(att => {
        if (att.type === 'Sakit') s++;
        else if (att.type === 'Izin') i++;
        else if (att.type === 'Dispensasi') d++;
        else if (att.type === 'Alpa' || att.type === 'Alpha' as any) a++;
      });

      return {
        ...student,
        totals: { s, i, a, d },
        totalAbsen: s + i + a + d
      };
    }).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [filteredStudents, attendance, selectedSemester]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSemester, selectedClass]);
  
  const totalPages = Math.ceil(recapData.length / itemsPerPage);
  const currentData = recapData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const exportToExcel = () => {
    const worksheetData = recapData.map((student, index) => ({
        'No': index + 1,
        'NIS': student.nis,
        'Nama Siswa': student.name,
        'L/P': student.gender,
        'Sakit': student.totals.s,
        'Izin': student.totals.i,
        'Alpa': student.totals.a,
        'Dispensasi': student.totals.d,
        'Total': student.totalAbsen
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Semester');
    
    XLSX.writeFile(workbook, `Rekap_Absensi_Semester_${selectedSemester}_${selectedClass}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');

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
    doc.text(`LAPORAN ABSENSI SEMESTER ${selectedSemester.toUpperCase()}`, doc.internal.pageSize.width / 2, 55, { align: 'center' });
    doc.text(`TAHUN AJARAN ${academicYear || '-'}`, doc.internal.pageSize.width / 2, 62, { align: 'center' });
    
    doc.setFontSize(11);
    doc.text(`KELAS : ${selectedClass === 'All' ? 'SEMUA KELAS' : selectedClass}`, 20, 75);

    autoTable(doc, {
      head: [['No', 'NIS', 'Nama Siswa', 'L/P', 'S', 'I', 'A', 'D', 'Total']],
      body: recapData.map((student, index) => [
        index + 1,
        student.nis,
        student.name,
        student.gender,
        student.totals.s,
        student.totals.i,
        student.totals.a,
        student.totals.d,
        student.totalAbsen
      ]),
      startY: 90,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185], halign: 'center' },
      styles: { fontSize: 10, cellPadding: 2, halign: 'center' },
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

    doc.save(`Rekap_Absensi_Semester_${selectedSemester}_${selectedClass}.pdf`);
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      <div className="p-6 md:p-8 border-b border-gray-100">
        <h3 className="text-xl font-bold text-gray-900">Rekapitulasi Absensi Semester</h3>
        <p className="text-sm text-gray-500">Laporan kehadiran siswa per semester</p>
        
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
            onChange={e => setSelectedSemester(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg text-sm outline-none font-medium"
          >
            <option value="Gasal">Semester Gasal</option>
            <option value="Genap">Semester Genap</option>
          </select>

          <div className="flex items-center gap-2 ml-auto">
            <button
               // The user wants PREVIEW LAPORAN. I'll just use the Print Preview of the browser for simplicity
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
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead>
            <tr>
              <th className="p-3 border border-gray-200 text-xs font-bold text-gray-700 bg-gray-50 text-center w-12">No</th>
              <th className="p-3 border border-gray-200 text-xs font-bold text-gray-700 bg-gray-50 w-24">NIS</th>
              <th className="p-3 border border-gray-200 text-xs font-bold text-gray-700 bg-gray-50 min-w-[180px]">Nama Siswa</th>
              <th className="p-3 border border-gray-200 text-xs font-bold text-gray-700 bg-gray-50 text-center w-16">L/P</th>
              <th className="p-3 border border-gray-200 text-xs font-bold text-gray-700 bg-orange-50 text-center w-10">S</th>
              <th className="p-3 border border-gray-200 text-xs font-bold text-gray-700 bg-orange-50 text-center w-10">I</th>
              <th className="p-3 border border-gray-200 text-xs font-bold text-gray-700 bg-orange-50 text-center w-10">A</th>
              <th className="p-3 border border-gray-200 text-xs font-bold text-gray-700 bg-orange-50 text-center w-10">D</th>
              <th className="p-3 border border-gray-200 text-xs font-bold text-gray-700 bg-blue-50 text-center w-16">Total</th>
            </tr>
          </thead>
          <tbody>
            {currentData.length > 0 ? (
              currentData.map((student, index) => (
                <tr key={student.id ? `${student.id}-${index}` : `stud-${index}`} className="hover:bg-gray-50">
                  <td className="p-2 border border-gray-200 text-xs text-center">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                  <td className="p-2 border border-gray-200 text-xs">{student.nis}</td>
                  <td className="p-2 border border-gray-200 text-xs font-medium text-gray-900">{student.name}</td>
                  <td className="p-2 border border-gray-200 text-xs text-center">{student.gender}</td>
                  <td className="p-2 border border-gray-200 text-xs text-center font-bold text-orange-600">{student.totals.s}</td>
                  <td className="p-2 border border-gray-200 text-xs text-center font-bold text-yellow-600">{student.totals.i}</td>
                  <td className="p-2 border border-gray-200 text-xs text-center font-bold text-red-600">{student.totals.a}</td>
                  <td className="p-2 border border-gray-200 text-xs text-center font-bold text-purple-600">{student.totals.d}</td>
                  <td className="p-2 border border-gray-200 text-xs text-center font-bold text-blue-600">{student.totalAbsen}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="p-8 text-center text-sm text-gray-500">
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
