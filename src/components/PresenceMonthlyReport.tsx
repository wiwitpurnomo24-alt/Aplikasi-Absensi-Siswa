import React, { useState, useMemo, useEffect } from 'react';
import { db, handleFirestoreError } from '../lib/firebase';
import { collection, query, getDocs, where, limit } from 'firebase/firestore';
import { FileText, Download, Calendar, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, formatDate } from '../lib/utils';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Student, SchoolData, AcademicYear } from '../types';
import { getTenantCollection, getTenantDoc } from '../lib/tenant';

interface PresenceMonthlyReportProps {
    students: Student[];
    presence: any[];
}

export default function PresenceMonthlyReport({ students, presence }: PresenceMonthlyReportProps) {
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedClass, setSelectedClass] = useState('All');
    const [schoolData, setSchoolData] = useState<SchoolData | null>(null);
    const [academicYear, setAcademicYear] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ROWS_PER_PAGE = 10;

    useEffect(() => {
        async function fetchData() {
            try {
                const schoolSnap = await getDocs(query(getTenantCollection('schoolData'), limit(1)));
                if (!schoolSnap.empty) setSchoolData(schoolSnap.docs[0].data() as SchoolData);

                const yearSnap = await getDocs(getTenantCollection('academicYears'));
                const activeYear = yearSnap.docs.find(d => d.data().active)?.data() as AcademicYear;
                if (activeYear) setAcademicYear(activeYear.year);
            } catch (error) {
                console.error('Error fetching generic data:', error);
            }
        }
        fetchData();
    }, []);

    const months = [
        { value: 1, label: 'Januari' }, { value: 2, label: 'Februari' }, { value: 3, label: 'Maret' },
        { value: 4, label: 'April' }, { value: 5, label: 'Mei' }, { value: 6, label: 'Juni' },
        { value: 7, label: 'Juli' }, { value: 8, label: 'Agustus' }, { value: 9, label: 'September' },
        { value: 10, label: 'Oktober' }, { value: 11, label: 'November' }, { value: 12, label: 'Desember' }
    ];

    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

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
                       (date.getMonth() + 1) === selectedMonth && 
                       date.getFullYear() === selectedYear;
            });

            const dayMap: Record<number, any> = {};
            let totalLate = 0;
            let totalEarlyLeave = 0;

            studentPresence.forEach(p => {
                const date = p.timestamp.toDate();
                const day = date.getDate();
                if (!dayMap[day]) dayMap[day] = { arrival: null, arrivalStatus: '-', departure: null, departureStatus: '-' };
                
                if (p.type === 'arrival') {
                    dayMap[day].arrival = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    dayMap[day].arrivalStatus = p.status;
                    if (p.status.toLowerCase().includes('terlambat')) totalLate++;
                } else if (p.type === 'departure') {
                    dayMap[day].departure = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    dayMap[day].departureStatus = p.status;
                    if (p.status.toLowerCase().includes('awal')) totalEarlyLeave++;
                }
            });

            return {
                ...student,
                dayMap,
                summary: { totalLate, totalEarlyLeave }
            };
        });
    }, [filteredStudents, presence, selectedMonth, selectedYear]);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedMonth, selectedYear, selectedClass]);

    const totalPages = Math.ceil(reportData.length / ROWS_PER_PAGE);
    const paginatedData = useMemo(() => {
        return reportData.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);
    }, [reportData, currentPage]);

    const exportToExcel = () => {
        const monthName = months.find(m => m.value === selectedMonth)?.label;
        const workbook = XLSX.utils.book_new();
        
        // Multi-line header setup for Excel is tricky with json_to_sheet
        // We'll use aoa_to_sheet for full control
        const headerRow1 = ['NO', 'NAMA SISWA', 'KELAS'];
        const headerRow2 = ['', '', ''];
        
        daysArray.forEach(day => {
            headerRow1.push(`TANGGAL ${day}`, '', '', '');
            headerRow2.push('KEHADIRAN', 'STATUS', 'KEPULANGAN', 'STATUS');
        });
        
        headerRow1.push('REKAP KETERLAMBATAN & PULANG AWAL', '');
        headerRow2.push('KETERLAMBATAN', 'PULANG AWAL');

        const rows = reportData.map((s, idx) => {
            const row = [idx + 1, s.name, s.className];
            daysArray.forEach(day => {
                const d = s.dayMap[day] || {};
                row.push(d.arrival || '-', d.arrivalStatus || '-', d.departure || '-', d.departureStatus || '-');
            });
            row.push(s.summary.totalLate, s.summary.totalEarlyLeave);
            return row;
        });

        const worksheet = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...rows]);
        
        // Add merging for headers
        const merges = [
            { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // NO
            { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // NAMA SISWA
            { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, // KELAS
        ];
        
        let colIdx = 3;
        daysArray.forEach(() => {
            merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + 3 } });
            colIdx += 4;
        });
        
        merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + 1 } }); // REKAP

        worksheet['!merges'] = merges;

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan Bulanan');
        XLSX.writeFile(workbook, `Laporan_Bulanan_Kehadiran_${monthName}_${selectedYear}.xlsx`);
    };

    const exportToPDF = () => {
        const doc = new jsPDF('l', 'mm', 'a2'); // Using A2 for extreme width
        const monthName = months.find(m => m.value === selectedMonth)?.label;

        doc.setFontSize(18);
        doc.text(`LAPORAN BULANAN KEHADIRAN SISWA - ${monthName?.toUpperCase()} ${selectedYear}`, doc.internal.pageSize.width / 2, 20, { align: 'center' });
        doc.setFontSize(12);
        doc.text(`Kelas: ${selectedClass === 'All' ? 'Semua Kelas' : selectedClass} | Tahun Ajaran: ${academicYear}`, doc.internal.pageSize.width / 2, 28, { align: 'center' });

        const head = [
            [
                { content: 'NO', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                { content: 'NAMA SISWA', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                { content: 'KELAS', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
                ...daysArray.map(day => ({ content: day.toString(), colSpan: 4, styles: { halign: 'center' } })),
                { content: 'REKAP', colSpan: 2, styles: { halign: 'center' } }
            ],
            [
                ...daysArray.flatMap(() => [
                    { content: 'H', styles: { fontSize: 6 } },
                    { content: 'SH', styles: { fontSize: 6 } },
                    { content: 'P', styles: { fontSize: 6 } },
                    { content: 'SP', styles: { fontSize: 6 } }
                ]),
                { content: 'LATE', styles: { fontSize: 6 } },
                { content: 'EARLY', styles: { fontSize: 6 } }
            ]
        ];

        const body = reportData.map((s, idx) => [
            idx + 1,
            s.name,
            s.className,
            ...daysArray.flatMap(day => {
                const d = s.dayMap[day] || {};
                return [d.arrival || '-', d.arrivalStatus || '-', d.departure || '-', d.departureStatus || '-'];
            }),
            s.summary.totalLate,
            s.summary.totalEarlyLeave
        ]);

        autoTable(doc, {
            head: head as any,
            body: body,
            startY: 35,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1, halign: 'center' },
            columnStyles: {
                1: { halign: 'left', cellWidth: 40 }
            },
            headStyles: { fillColor: [50, 50, 200] }
        });

        doc.save(`Laporan_Bulanan_Kehadiran_${monthName}_${selectedYear}.pdf`);
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Laporan Bulanan Kehadiran</h3>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Detail harian kehadiran & kepulangan siswa</p>
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
                        value={selectedMonth} 
                        onChange={e => setSelectedMonth(parseInt(e.target.value))}
                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {months.map(m => <option key={m.value} value={m.value}>{m.label.toUpperCase()}</option>)}
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

            <div className="overflow-x-auto relative custom-scrollbar">
                <table className="w-full text-left border-collapse border-spacing-0">
                    <thead className="sticky top-0 z-20">
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th rowSpan={2} className="px-3 py-4 border-r border-gray-200 text-[10px] font-black text-gray-400 uppercase text-center sticky left-0 bg-gray-50 z-30 min-w-[50px]">NO</th>
                            <th rowSpan={2} className="px-4 py-4 border-r border-gray-200 text-[10px] font-black text-gray-400 uppercase sticky left-[50px] bg-gray-50 z-30 min-w-[200px]">NAMA SISWA</th>
                            <th rowSpan={2} className="px-4 py-4 border-r border-gray-200 text-[10px] font-black text-gray-400 uppercase sticky left-[250px] bg-gray-50 z-30 min-w-[100px]">KELAS</th>
                            
                            <th colSpan={daysInMonth * 4} className="px-4 py-2 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase text-center bg-blue-50/50">TANGGAL</th>
                            
                            <th colSpan={2} className="px-4 py-2 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase text-center bg-orange-50/50">REKAP</th>
                        </tr>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            {daysArray.map(day => (
                                <th key={`day-header-${day}`} colSpan={4} className="px-2 py-2 border-r border-gray-200 text-[10px] font-black text-gray-500 text-center min-w-[160px]">
                                    {day}
                                </th>
                            ))}
                            <th className="px-3 py-2 border-r border-gray-200 text-[9px] font-black text-orange-600 uppercase text-center min-w-[80px]">LATE</th>
                            <th className="px-3 py-2 text-[9px] font-black text-orange-600 uppercase text-center min-w-[80px]">EARLY</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((student, idx) => (
                            <tr key={student.id ? `report-row-${student.id}-${idx}` : `report-row-no-id-${idx}`} className="hover:bg-blue-50/30 transition-all border-b border-gray-100">
                                <td className="px-3 py-3 border-r border-gray-100 text-xs font-bold text-gray-400 text-center sticky left-0 bg-white group-hover:bg-blue-50/30 z-10">{(currentPage - 1) * ROWS_PER_PAGE + idx + 1}</td>
                                <td className="px-4 py-3 border-r border-gray-100 text-sm font-black text-gray-900 sticky left-[50px] bg-white group-hover:bg-blue-50/30 z-10">{student.name}</td>
                                <td className="px-4 py-3 border-r border-gray-100 text-xs font-bold text-gray-500 sticky left-[250px] bg-white group-hover:bg-blue-50/30 z-10">{student.className}</td>
                                
                                {daysArray.map(day => {
                                    const d = student.dayMap[day] || {};
                                    const isWeekend = new Date(selectedYear, selectedMonth - 1, day).getDay() === 0 || new Date(selectedYear, selectedMonth - 1, day).getDay() === 6;
                                    
                                    return (
                                        <React.Fragment key={`cell-${student.id}-${day}`}>
                                            <td className={cn("px-2 py-3 border-r border-gray-50 text-[10px] font-bold text-center", isWeekend && "bg-gray-50/50")}>
                                                {d.arrival || '-'}
                                            </td>
                                            <td className={cn("px-2 py-3 border-r border-gray-50 text-[9px] font-black text-center", isWeekend && "bg-gray-50/50")}>
                                                {d.arrivalStatus && d.arrivalStatus !== '-' ? (
                                                    <span className={cn(
                                                        "px-1.5 py-0.5 rounded",
                                                        d.arrivalStatus.toLowerCase().includes('terlambat') ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                                                    )}>
                                                        {d.arrivalStatus.substring(0, 1).toUpperCase()}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className={cn("px-2 py-3 border-r border-gray-50 text-[10px] font-bold text-center", isWeekend && "bg-gray-50/50")}>
                                                {d.departure || '-'}
                                            </td>
                                            <td className={cn("px-2 py-3 border-r border-gray-200 text-[9px] font-black text-center", isWeekend && "bg-gray-50/50")}>
                                                {d.departureStatus && d.departureStatus !== '-' ? (
                                                    <span className={cn(
                                                        "px-1.5 py-0.5 rounded",
                                                        d.departureStatus.toLowerCase().includes('awal') ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"
                                                    )}>
                                                        {d.departureStatus.substring(0, 1).toUpperCase()}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                        </React.Fragment>
                                    );
                                })}
                                
                                <td className="px-3 py-3 border-r border-gray-100 text-xs font-black text-red-600 text-center bg-orange-50/20">{student.summary.totalLate}</td>
                                <td className="px-3 py-3 text-xs font-black text-orange-600 text-center bg-orange-50/20">{student.summary.totalEarlyLeave}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">KETERANGAN STATUS:</span>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                            <div className="w-2.5 h-2.5 bg-green-500 rounded-sm"></div>
                            <span>H/V: HADIR / VALID</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                            <div className="w-2.5 h-2.5 bg-red-500 rounded-sm"></div>
                            <span>T: TERLAMBAT</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
                            <div className="w-2.5 h-2.5 bg-orange-500 rounded-sm"></div>
                            <span>A: PULANG AWAL</span>
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
