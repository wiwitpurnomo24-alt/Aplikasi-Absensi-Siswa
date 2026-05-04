import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, where, limit } from 'firebase/firestore';
import { FileText, Download, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Student, SchoolData, AcademicYear } from '../types';

interface PresenceSemesterReportProps {
    students: Student[];
    presence: any[];
}

export default function PresenceSemesterReport({ students, presence }: PresenceSemesterReportProps) {
    const [selectedSemester, setSelectedSemester] = useState('Gasal');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedClass, setSelectedClass] = useState('All');
    const [schoolData, setSchoolData] = useState<SchoolData | null>(null);
    const [academicYear, setAcademicYear] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ROWS_PER_PAGE = 10;

    useEffect(() => {
        async function fetchData() {
            try {
                const schoolSnap = await getDocs(query(collection(db, 'schoolData'), limit(1)));
                if (!schoolSnap.empty) setSchoolData(schoolSnap.docs[0].data() as SchoolData);

                const yearSnap = await getDocs(collection(db, 'academicYears'));
                const activeYear = yearSnap.docs.find(d => d.data().active)?.data() as AcademicYear;
                if (activeYear) setAcademicYear(activeYear.year);
            } catch (error) {
                console.error('Error fetching generic data:', error);
            }
        }
        fetchData();
    }, []);

    const semesterMonths = useMemo(() => {
        if (selectedSemester === 'Gasal') {
            return [
                { value: 7, label: 'Juli' }, { value: 8, label: 'Agustus' }, { value: 9, label: 'September' },
                { value: 10, label: 'Oktober' }, { value: 11, label: 'November' }, { value: 12, label: 'Desember' }
            ];
        } else {
            return [
                { value: 1, label: 'Januari' }, { value: 2, label: 'Februari' }, { value: 3, label: 'Maret' },
                { value: 4, label: 'April' }, { value: 5, label: 'Mei' }, { value: 6, label: 'Juni' }
            ];
        }
    }, [selectedSemester]);

    const classes = useMemo(() => Array.from(new Set(students.map(s => s.className))).sort(), [students]);

    const filteredStudents = useMemo(() => {
        let result = students;
        if (selectedClass !== 'All') {
            result = result.filter(s => s.className === selectedClass);
        }
        return result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [students, selectedClass]);

    const reportData = useMemo(() => {
        return filteredStudents.map(student => {
            const studentPresence = presence.filter(p => {
                const date = p.timestamp.toDate();
                return p.studentId === student.id && 
                       semesterMonths.some(m => m.value === (date.getMonth() + 1)) &&
                       date.getFullYear() === selectedYear;
            });

            const monthMap: Record<number, any> = {};
            let grandTotalLate = 0;
            let grandTotalEarlyLeave = 0;

            semesterMonths.forEach(m => {
                const monthPres = studentPresence.filter(p => (p.timestamp.toDate().getMonth() + 1) === m.value);
                const late = monthPres.filter(p => p.type === 'arrival' && p.status.toLowerCase().includes('terlambat')).length;
                const early = monthPres.filter(p => p.type === 'departure' && p.status.toLowerCase().includes('awal')).length;
                const totalHadir = monthPres.filter(p => p.type === 'arrival').length;

                monthMap[m.value] = { late, early, totalHadir };
                grandTotalLate += late;
                grandTotalEarlyLeave += early;
            });

            return {
                ...student,
                monthMap,
                summary: { grandTotalLate, grandTotalEarlyLeave }
            };
        });
    }, [filteredStudents, presence, semesterMonths, selectedYear]);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedSemester, selectedYear, selectedClass]);

    const totalPages = Math.ceil(reportData.length / ROWS_PER_PAGE);
    const paginatedData = useMemo(() => {
        return reportData.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);
    }, [reportData, currentPage]);

    const exportToExcel = () => {
        const workbook = XLSX.utils.book_new();
        const headerRow1 = ['NO', 'NAMA SISWA', 'KELAS'];
        const headerRow2 = ['', '', ''];
        
        semesterMonths.forEach(m => {
            headerRow1.push(m.label.toUpperCase(), '', '');
            headerRow2.push('LATE', 'EARLY', 'HADIR');
        });
        
        headerRow1.push('GRAND TOTAL', '');
        headerRow2.push('LATE', 'EARLY');

        const rows = reportData.map((s, idx) => {
            const row = [idx + 1, s.name, s.className];
            semesterMonths.forEach(m => {
                const d = s.monthMap[m.value] || { late: 0, early: 0, totalHadir: 0 };
                row.push(d.late, d.early, d.totalHadir);
            });
            row.push(s.summary.grandTotalLate, s.summary.grandTotalEarlyLeave);
            return row;
        });

        const worksheet = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...rows]);
        
        const merges = [
            { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
            { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
            { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
        ];
        
        let colIdx = 3;
        semesterMonths.forEach(() => {
            merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + 2 } });
            colIdx += 3;
        });
        merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + 1 } });

        worksheet['!merges'] = merges;
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Semester');
        XLSX.writeFile(workbook, `Laporan_Semester_Kehadiran_${selectedSemester}_${selectedYear}.xlsx`);
    };

    const exportToPDF = () => {
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.setFontSize(16);
        doc.text(`REKAP KEHADIRAN SEMESTER ${selectedSemester.toUpperCase()} - ${selectedYear}`, doc.internal.pageSize.width / 2, 20, { align: 'center' });
        
        const head = [
            [
                { content: 'NO', rowSpan: 2 },
                { content: 'NAMA SISWA', rowSpan: 2 },
                { content: 'KELAS', rowSpan: 2 },
                ...semesterMonths.map(m => ({ content: m.label.toUpperCase(), colSpan: 2 })),
                { content: 'TOTAL', colSpan: 2 }
            ],
            [
                ...semesterMonths.flatMap(() => ['LTE', 'ERL']),
                'LTE', 'ERL'
            ]
        ];

        const body = reportData.map((s, idx) => [
            idx + 1,
            s.name,
            s.className,
            ...semesterMonths.flatMap(m => [s.monthMap[m.value].late, s.monthMap[m.value].early]),
            s.summary.grandTotalLate,
            s.summary.grandTotalEarlyLeave
        ]);

        autoTable(doc, {
            head: head as any,
            body: body,
            startY: 30,
            theme: 'grid',
            styles: { fontSize: 8, halign: 'center' },
            columnStyles: { 1: { halign: 'left', cellWidth: 50 } },
            headStyles: { fillColor: [50, 50, 150] }
        });

        doc.save(`Laporan_Semester_Kehadiran_${selectedSemester}_${selectedYear}.pdf`);
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Laporan Semester Kehadiran</h3>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Ringkasan kedatangan & kepulangan per semester</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                    <select 
                        value={selectedClass} 
                        onChange={e => setSelectedClass(e.target.value)}
                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="All">SEMUA KELAS</option>
                        {classes.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <select 
                        value={selectedSemester} 
                        onChange={e => setSelectedSemester(e.target.value)}
                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="Gasal">GASAL (JUL-DES)</option>
                        <option value="Genap">GENAP (JAN-JUN)</option>
                    </select>

                    <select 
                        value={selectedYear} 
                        onChange={e => setSelectedYear(parseInt(e.target.value))}
                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {Array.from({length: 5}, (_, i) => new Date().getFullYear() - i).map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>

                    <div className="h-8 w-px bg-gray-200 mx-1 hidden md:block"></div>

                    <button 
                        onClick={exportToPDF}
                        className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-black hover:bg-red-100 transition-all border border-red-100"
                    >
                        <FileText size={16} /> PDF
                    </button>
                    <button 
                        onClick={exportToExcel}
                        className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-xl text-xs font-black hover:bg-green-100 transition-all border border-green-100"
                    >
                        <Download size={16} /> EXCEL
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th rowSpan={2} className="px-4 py-4 border-r border-gray-200 text-[10px] font-black text-gray-400 uppercase text-center w-12 sticky left-0 bg-gray-50 z-10">NO</th>
                            <th rowSpan={2} className="px-6 py-4 border-r border-gray-200 text-[10px] font-black text-gray-400 uppercase sticky left-12 bg-gray-50 z-10">NAMA SISWA</th>
                            {semesterMonths.map(m => (
                                <th key={`m-head-${m.value}`} colSpan={3} className="px-4 py-2 border-r border-gray-200 text-[10px] font-black text-gray-400 uppercase text-center bg-blue-50/50">
                                    {m.label.toUpperCase()}
                                </th>
                            ))}
                            <th colSpan={2} className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase text-center bg-orange-50/50">GRAND TOTAL</th>
                        </tr>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            {semesterMonths.map(m => (
                                <React.Fragment key={`m-sub-${m.value}`}>
                                    <th className="px-3 py-2 border-r border-gray-200 text-[9px] font-black text-red-600 text-center">LTE</th>
                                    <th className="px-3 py-2 border-r border-gray-200 text-[9px] font-black text-orange-600 text-center">ERL</th>
                                    <th className="px-3 py-2 border-r border-gray-200 text-[9px] font-black text-blue-600 text-center">HDR</th>
                                </React.Fragment>
                            ))}
                            <th className="px-3 py-2 border-r border-gray-200 text-[9px] font-black text-red-600 text-center">LATE</th>
                            <th className="px-3 py-2 text-[9px] font-black text-orange-600 text-center">EARLY</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((student, idx) => (
                            <tr key={student.id ? `sem-row-${student.id}-${idx}` : `sem-row-no-id-${idx}`} className="hover:bg-blue-50/30 transition-all border-b border-gray-100">
                                <td className="px-4 py-4 border-r border-gray-100 text-xs font-bold text-gray-400 text-center sticky left-0 bg-white group-hover:bg-blue-50/30 z-10">{(currentPage - 1) * ROWS_PER_PAGE + idx + 1}</td>
                                <td className="px-6 py-4 border-r border-gray-100 text-sm font-black text-gray-900 sticky left-12 bg-white group-hover:bg-blue-50/30 z-10">{student.name}</td>
                                {semesterMonths.map(m => {
                                    const d = student.monthMap[m.value];
                                    return (
                                        <React.Fragment key={`m-data-${student.id}-${m.value}`}>
                                            <td className="px-3 py-4 border-r border-gray-50 text-xs font-black text-red-600 text-center">{d.late || 0}</td>
                                            <td className="px-3 py-4 border-r border-gray-50 text-xs font-black text-orange-600 text-center">{d.early || 0}</td>
                                            <td className="px-3 py-4 border-r border-gray-200 text-xs font-black text-blue-600 text-center">{d.totalHadir || 0}</td>
                                        </React.Fragment>
                                    );
                                })}
                                <td className="px-3 py-4 border-r border-gray-100 text-xs font-black text-red-600 text-center bg-orange-50/20">{student.summary.grandTotalLate}</td>
                                <td className="px-3 py-4 text-xs font-black text-orange-600 text-center bg-orange-50/20">{student.summary.grandTotalEarlyLeave}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">KETERANGAN:</span>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                            <span className="text-red-600">LTE:</span>
                            <span>TERLAMBAT</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                            <span className="text-orange-600">ERL:</span>
                            <span>PULANG AWAL</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                            <span className="text-blue-600">HDR:</span>
                            <span>TOTAL HADIR</span>
                        </div>
                    </div>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                        <button 
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-50 hover:bg-gray-50 transition-colors"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <div className="flex items-center gap-1 px-3 py-1 bg-white border border-gray-200 rounded-lg">
                            <span className="text-xs font-black text-gray-900">{currentPage}</span>
                            <span className="text-xs font-bold text-gray-400">/</span>
                            <span className="text-xs font-bold text-gray-500">{totalPages}</span>
                        </div>
                        <button 
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-50 hover:bg-gray-50 transition-colors"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
