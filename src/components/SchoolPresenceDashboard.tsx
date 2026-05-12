import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, handleFirestoreError } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, getDocs, where, doc, deleteDoc, updateDoc, Timestamp, addDoc } from 'firebase/firestore';
import { Download, Filter, FileText, UserCheck, Edit, Trash2, Eye, Scan, Camera, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { cn, formatDate, getTimeSafe } from '../lib/utils';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AttendanceConfig } from './AttendanceConfig';
import { QRCameraScanner } from './QRCameraScanner';
import PresenceMonthlyReport from './PresenceMonthlyReport';
import PresenceSemesterReport from './PresenceSemesterReport';
import { getTenantCollection, getTenantDoc } from '../lib/tenant';
import { useAuthStore } from '../lib/auth-store';

export const SchoolPresenceDashboard: React.FC = () => {
    const { user } = useAuthStore();
    const [presence, setPresence] = useState<any[]>([]);
    const [students, setStudents] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'main' | 'monthly' | 'semester'>('main');
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [filterClass, setFilterClass] = useState('');
    const [filterStudent, setFilterStudent] = useState('');
    const [filterType, setFilterType] = useState('daily'); 
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [showCameraScanner, setShowCameraScanner] = useState(false);
    
    // Clear selections when filters change
    useEffect(() => {
        setSelectedIds([]);
    }, [filterClass, filterStudent, filterType, filterDate]);

    const studentHistory = useMemo(() => {
        if (!selectedStudent) return [];
        return presence.filter(p => p.studentId === selectedStudent.studentId).sort((a,b) => getTimeSafe(b.timestamp) - getTimeSafe(a.timestamp));
    }, [presence, selectedStudent]);

    useEffect(() => {
        const qPresence = query(getTenantCollection('schoolPresence'), orderBy('timestamp', 'desc'));
        const unsubscribePresence = onSnapshot(qPresence, (snapshot) => {
            setPresence(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (err) => {
            handleFirestoreError(err, 'get', 'schoolPresence');
            setLoading(false);
        });

        const qStudents = query(getTenantCollection('students'));
        const unsubscribeStudents = onSnapshot(qStudents, (snapshot) => {
            setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => { unsubscribePresence(); unsubscribeStudents(); };
    }, []);

    const classes = useMemo(() => Array.from(new Set(students.map(s => s.className))).map(name => ({ id: name, name })), [students]);
    const studentList = useMemo(() => students.filter(s => filterClass === '' || s.className === filterClass), [students, filterClass]);

    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'timestamp', direction: 'desc' });
    
    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const groupedPresence = useMemo(() => {
        const groups: Record<string, any> = {};
        presence.forEach(p => {
            const date = p.timestamp.toDate();
            // Need the local date (YYYY-MM-DD)
            const dateStr = [
                date.getFullYear(),
                (date.getMonth() + 1).toString().padStart(2, '0'),
                date.getDate().toString().padStart(2, '0')
            ].join('-');
            
            const key = `${p.studentId}_${dateStr}`;
            if (!groups[key]) {
                groups[key] = {
                    id: key,
                    studentId: p.studentId,
                    studentName: p.studentName,
                    className: p.className,
                    dateStr: dateStr,
                    date: date,
                    arrivalTimestamp: null,
                    arrivalStatus: '-',
                    arrivalId: null,
                    departureTimestamp: null,
                    departureStatus: '-',
                    departureId: null,
                };
            }
            if (p.type === 'arrival') {
                groups[key].arrivalTimestamp = date;
                groups[key].arrivalStatus = p.status;
                groups[key].arrivalId = p.id;
            } else if (p.type === 'departure') {
                groups[key].departureTimestamp = date;
                groups[key].departureStatus = p.status;
                groups[key].departureId = p.id;
            }
        });
        return Object.values(groups);
    }, [presence]);

    const filteredData = useMemo(() => {
        let result: any[] = [];
        
        if (filterType === 'daily') {
            // Get students for the selected class (or all students if no class selected)
            const matchedStudents = students.filter(s => (filterClass === '' || s.className === filterClass) && (filterStudent === '' || s.id === filterStudent));
            
            result = matchedStudents.map(student => {
                const key = `${student.id}_${filterDate}`;
                // Find if this student has presence data for this day
                const presenceData = groupedPresence.find(g => g.id === key);
                
                if (presenceData) {
                    return presenceData;
                }
                
                // If no presence data, create an empty record
                const emptyDate = new Date(filterDate);
                return {
                    id: key,
                    studentId: student.id,
                    studentName: student.name,
                    className: student.className,
                    dateStr: filterDate,
                    date: emptyDate,
                    arrivalTimestamp: null,
                    arrivalStatus: '-',
                    arrivalId: null,
                    departureTimestamp: null,
                    departureStatus: '-',
                    departureId: null,
                };
            });
        } else {
            result = groupedPresence.filter(g => {
                let dateMatch = false;
                if (filterType === 'weekly') {
                    const d = new Date(filterDate);
                    const day = d.getDay(); // 0 is Sunday
                    const diffToMonday = d.getDate() - (day === 0 ? 6 : day - 1);
                    const monday = new Date(d);
                    monday.setDate(diffToMonday);
                    monday.setHours(0,0,0,0);
                    
                    const sunday = new Date(monday);
                    sunday.setDate(monday.getDate() + 6);
                    sunday.setHours(23,59,59,999);
                    
                    dateMatch = g.date >= monday && g.date <= sunday;
                }
                else if (filterType === 'monthly') {
                    dateMatch = g.dateStr.startsWith(filterDate.substring(0, 7));
                }
                else if (filterType === 'semester') {
                    // Simple logic: assume semester is 6 months from filterDate
                    const d = new Date(filterDate);
                    dateMatch = g.date >= new Date(d.getFullYear(), d.getMonth() - 6, 1) && g.date <= d;
                }
                else dateMatch = true;

                return (filterClass === '' || g.className === filterClass) && 
                       (filterStudent === '' || g.studentId === filterStudent) &&
                       dateMatch;
            });
        }

        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal = sortConfig.key === 'timestamp' ? getTimeSafe(a.date) : a[sortConfig.key];
                let bVal = sortConfig.key === 'timestamp' ? getTimeSafe(b.date) : b[sortConfig.key];
                
                if (sortConfig.direction === 'asc') return aVal > bVal ? 1 : -1;
                return aVal < bVal ? 1 : -1;
            });
        }
        return result;
    }, [groupedPresence, filterClass, filterStudent, filterType, filterDate, sortConfig, students]);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        setCurrentPage(1);
    }, [filterClass, filterStudent, filterType, filterDate, sortConfig]);

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);

    const handleTopScroll = () => {
        if (tableScrollRef.current && topScrollRef.current) {
            tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
        }
    };

    const handleTableScroll = () => {
        if (tableScrollRef.current && topScrollRef.current) {
            topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
        }
    };

    const [editMode, setEditMode] = useState<any>(null);
    const [editForm, setEditForm] = useState({
        arrivalTime: '',
        arrivalStatus: '',
        departureTime: '',
        departureStatus: ''
    });

    const openEdit = (item: any) => {
        setEditMode(item);
        setEditForm({
            arrivalTime: item.arrivalTimestamp ? item.arrivalTimestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
            arrivalStatus: item.arrivalStatus !== '-' ? item.arrivalStatus : 'Hadir',
            departureTime: item.departureTimestamp ? item.departureTimestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
            departureStatus: item.departureStatus !== '-' ? item.departureStatus : 'Valid'
        });
    };

    const handleSaveEdit = async () => {
        try {
            const datePrefix = editMode.dateStr; // YYYY-MM-DD
            
            // Handle Arrival
            if (editForm.arrivalTime) {
                const arrDate = new Date(`${datePrefix}T${editForm.arrivalTime}:00`);
                const arrData = {
                    studentId: editMode.studentId,
                    studentName: editMode.studentName,
                    className: editMode.className,
                    type: 'arrival',
                    timestamp: Timestamp.fromDate(arrDate),
                    status: editForm.arrivalStatus || 'Hadir',
                    processedBy: user?.name || 'Admin',
                    processedById: user?.uid || null
                };
                if (editMode.arrivalId) {
                    await updateDoc(getTenantDoc('schoolPresence', editMode.arrivalId), arrData);
                } else {
                    await addDoc(getTenantCollection('schoolPresence'), arrData);
                }
            } else if (editMode.arrivalId) {
                await deleteDoc(getTenantDoc('schoolPresence', editMode.arrivalId));
            }

            // Handle Departure
            if (editForm.departureTime) {
                const depDate = new Date(`${datePrefix}T${editForm.departureTime}:00`);
                const depData = {
                    studentId: editMode.studentId,
                    studentName: editMode.studentName,
                    className: editMode.className,
                    type: 'departure',
                    timestamp: Timestamp.fromDate(depDate),
                    status: editForm.departureStatus || 'Valid',
                    processedBy: user?.name || 'Admin',
                    processedById: user?.uid || null
                };
                if (editMode.departureId) {
                    await updateDoc(getTenantDoc('schoolPresence', editMode.departureId), depData);
                } else {
                    await addDoc(getTenantCollection('schoolPresence'), depData);
                }
            } else if (editMode.departureId) {
                await deleteDoc(getTenantDoc('schoolPresence', editMode.departureId));
            }
            
            setEditMode(null);
        } catch (e) {
            handleFirestoreError(e, 'update', 'schoolPresence');
        }
    };

    const handleDelete = async (item: any) => {
        if (window.confirm(`Hapus data kehadiran ${item.studentName} pada ${item.dateStr}?`)) {
            try {
                if (item.arrivalId) await deleteDoc(getTenantDoc('schoolPresence', item.arrivalId));
                if (item.departureId) await deleteDoc(getTenantDoc('schoolPresence', item.departureId));
            } catch (e) {
                handleFirestoreError(e, 'delete', 'schoolPresence');
            }
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0) return;
        if (window.confirm(`Hapus ${selectedIds.length} data kehadiran terpilih?`)) {
            try {
                const deletePromises: any[] = [];
                for (const id of selectedIds) {
                    const item = filteredData.find(d => d.id === id);
                    if (item) {
                        if (item.arrivalId) deletePromises.push(deleteDoc(getTenantDoc('schoolPresence', item.arrivalId)));
                        if (item.departureId) deletePromises.push(deleteDoc(getTenantDoc('schoolPresence', item.departureId)));
                    }
                }
                await Promise.all(deletePromises);
                setSelectedIds([]);
            } catch (e) {
                handleFirestoreError(e, 'delete', 'schoolPresence multi');
            }
        }
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.text('Laporan Kehadiran Siswa', 14, 15);
        autoTable(doc, {
            head: [['No', 'Nama Siswa', 'Kelas', 'Waktu', 'Jam Kehadiran', 'Status Kehadiran', 'Kepulangan', 'Status Kepulangan']],
            body: filteredData.map((p, index) => [
                index + 1,
                p.studentName,
                p.className,
                p.dateStr.split('-').reverse().join('-'),
                p.arrivalTimestamp ? p.arrivalTimestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
                p.arrivalStatus,
                p.departureTimestamp ? p.departureTimestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
                p.departureStatus
            ])
        });
        doc.save('Laporan_Kehadiran.pdf');
    };

    const exportToExcel = () => {
        const worksheet = XLSX.utils.json_to_sheet(filteredData.map((p, index) => ({
            'Nomor': index + 1,
            'Nama Siswa': p.studentName,
            'Kelas': p.className,
            'Waktu': p.dateStr.split('-').reverse().join('-'),
            'Jam Kehadiran': p.arrivalTimestamp ? p.arrivalTimestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
            'Status Kehadiran': p.arrivalStatus,
            'Kepulangan': p.departureTimestamp ? p.departureTimestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
            'Status Kepulangan': p.departureStatus
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Kehadiran');
        XLSX.writeFile(workbook, 'Laporan_Kehadiran.xlsx');
    };

    const [scanAnimation, setScanAnimation] = useState<any>(null);
    const [scannerInput, setScannerInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Global Scanner Listener
    useEffect(() => {
        let buffer = "";
        let lastTime = Date.now();

        const handleGlobalKeyDown = async (e: KeyboardEvent) => {
            // Ignore if we are typing in an input (except our scanner input)
            if (document.activeElement?.tagName === 'INPUT' && document.activeElement !== inputRef.current) return;
            if (document.activeElement?.tagName === 'TEXTAREA') return;

            const now = Date.now();
            const diff = now - lastTime;
            lastTime = now;

            if (diff < 50) {
                if (e.key === 'Enter') {
                    if (buffer.length > 3) {
                        handleProcessScan(buffer);
                    }
                    buffer = "";
                } else if (e.key.length === 1) {
                    buffer += e.key;
                }
            } else {
                buffer = "";
                if (e.key.length === 1) buffer = e.key;
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [students]);

    const handleProcessScan = async (studentId: string) => {
        setScannerInput('');
        setLoading(true);
        try {
            const res = await fetch('/api/webhook/attendance-scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    studentId, 
                    type: new Date().getHours() < 11 ? 'arrival' : 'departure', 
                    schoolId: user?.schoolId || 'default',
                    processedBy: user?.name || 'Scanner',
                    processedById: user?.uid || null
                })
            });
            const data = await res.json();
            
            if (res.ok) {
                const student = students.find(s => s.id === studentId || s.nis === studentId);
                const typeLabel = new Date().getHours() < 11 ? 'KEHADIRAN' : 'KEPULANGAN';
                setScanAnimation({
                    name: student?.name || 'Siswa',
                    status: data.info.status,
                    type: typeLabel,
                    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                });
                setTimeout(() => setScanAnimation(null), 4000);
            } else {
                alert('Gagal memproses scan: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            console.error("Scan error", e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <AnimatePresence>
                {showCameraScanner && (
                    <QRCameraScanner 
                        onScan={(code) => {
                            handleProcessScan(code);
                            setShowCameraScanner(false);
                        }}
                        onClose={() => setShowCameraScanner(false)}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {scanAnimation && (
                    <motion.div 
                        initial={{ opacity: 0, y: -50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm"
                    >
                        <div className="bg-white rounded-2xl shadow-2xl border-2 border-blue-500 p-6 flex flex-col items-center text-center overflow-hidden relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 overflow-hidden">
                                <motion.div 
                                    initial={{ x: '-100%' }}
                                    animate={{ x: '100%' }}
                                    transition={{ duration: 4, ease: 'linear' }}
                                    className="w-full h-full bg-blue-300"
                                />
                            </div>
                            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
                                <UserCheck size={32} />
                            </div>
                            <h4 className="text-xl font-black text-gray-900 mb-1">{scanAnimation.name}</h4>
                            <div className="flex items-center gap-2 mb-2">
                                <span className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase",
                                    scanAnimation.type === 'KEHADIRAN' ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                                )}>
                                    {scanAnimation.type}
                                </span>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Scan Berhasil</p>
                            </div>
                            <div className={cn(
                                "px-4 py-2 rounded-xl text-lg font-black uppercase mb-2",
                                scanAnimation.status.includes('TERLAMBAT') ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                            )}>
                                {scanAnimation.status}
                            </div>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-tight">Waktu: {scanAnimation.time}</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="bg-indigo-600 p-4 rounded-2xl shadow-lg shadow-indigo-100 flex flex-col md:flex-row items-center justify-between gap-4 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                <div className="z-10">
                    <h3 className="text-lg font-black text-white mb-0.5 uppercase tracking-tight">Scanner Aktif</h3>
                    <p className="text-indigo-100 text-xs font-medium">Aplikasi sedang mendengarkan input dari hardware scanner.</p>
                </div>
                <div className="z-10 flex items-center gap-2 w-full md:w-auto">
                    <button 
                        onClick={() => setShowCameraScanner(true)}
                        className="px-3 py-2 bg-white text-indigo-600 rounded-lg font-black text-[10px] flex items-center gap-2 hover:bg-indigo-50 transition-all shadow-sm shrink-0 whitespace-nowrap"
                    >
                        <Camera size={14} /> SCAN KAMERA
                    </button>
                    <div className="relative flex-1 md:w-48">
                        <Scan className="absolute left-3 top-2.5 text-indigo-400" size={14} />
                        <input 
                            ref={inputRef}
                            type="text" 
                            className="w-full pl-9 pr-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder:text-white/40 focus:bg-white/20 focus:outline-none transition-all font-bold text-[10px]"
                            placeholder="Input ID / Scan..."
                            value={scannerInput}
                            onChange={(e) => setScannerInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && scannerInput) {
                                    handleProcessScan(scannerInput);
                                }
                            }}
                        />
                    </div>
                </div>
            </div>

            <AttendanceConfig classes={classes} />
            
            <div className="flex items-center gap-1 bg-gray-100/50 p-1 rounded-2xl w-fit">
                <button 
                    onClick={() => setActiveTab('main')}
                    className={cn(
                        "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border-2",
                        activeTab === 'main' ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100" : "border-blue-600 text-blue-600 hover:bg-blue-50"
                    )}
                >
                    Monitoring Harian
                </button>
                <button 
                    onClick={() => setActiveTab('monthly')}
                    className={cn(
                        "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border-2",
                        activeTab === 'monthly' ? "bg-green-600 border-green-600 text-white shadow-md shadow-green-100" : "border-green-600 text-green-600 hover:bg-green-50"
                    )}
                >
                    Laporan Bulanan
                </button>
                <button 
                    onClick={() => setActiveTab('semester')}
                    className={cn(
                        "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border-2",
                        activeTab === 'semester' ? "bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-100" : "border-purple-600 text-purple-600 hover:bg-purple-50"
                    )}
                >
                    Laporan Semester
                </button>
            </div>

            {activeTab === 'monthly' ? (
                <PresenceMonthlyReport students={students} presence={presence} />
            ) : activeTab === 'semester' ? (
                <PresenceSemesterReport students={students} presence={presence} />
            ) : (
                <div className="bg-white p-6 rounded-xl border border-gray-200">
                <div className="grid grid-cols-4 gap-2 mb-4">
                    {(() => {
                        const dailyStats = paginatedData.length > 0 ? filteredData.filter(d => d.dateStr === filterDate) : filteredData;
                        const totalStudents = students.length;
                        const present = dailyStats.filter(d => d.arrivalStatus !== '-').length;
                        const late = dailyStats.filter(d => d.arrivalStatus === 'Terlambat').length;
                        const absent = totalStudents - present;
                        return (
                            <>
                                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100"><p className="text-[9px] uppercase font-bold text-blue-400">Total Siswa</p><p className="text-xl font-black text-blue-900">{totalStudents}</p></div>
                                <div className="bg-green-50 p-3 rounded-xl border border-green-100"><p className="text-[9px] uppercase font-bold text-green-400">Hadir</p><p className="text-xl font-black text-green-900">{present}</p></div>
                                <div className="bg-orange-50 p-3 rounded-xl border border-orange-100"><p className="text-[9px] uppercase font-bold text-orange-400">Terlambat</p><p className="text-xl font-black text-orange-900">{late}</p></div>
                                <div className="bg-red-50 p-3 rounded-xl border border-red-100"><p className="text-[9px] uppercase font-bold text-red-400">Belum Datang</p><p className="text-xl font-black text-red-900">{absent}</p></div>
                            </>
                        );
                    })()}
                </div>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-800">Laporan Kehadiran</h3>
                    <div className="flex gap-2">
                        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="p-1.5 border rounded text-[10px]">
                            <option value="daily">Harian</option>
                            <option value="weekly">Mingguan</option>
                            <option value="monthly">Bulanan</option>
                            <option value="semester">Semester</option>
                        </select>
                        <select value={filterClass} onChange={(e) => { setFilterClass(e.target.value); setFilterStudent(''); }} className="p-1.5 border rounded text-[10px]">
                            <option value="">Semua Kelas</option>
                            {classes.map(c => <option key={`class-filter-${c.id}`} value={c.name}>{c.name}</option>)}
                        </select>
                        <select value={filterStudent} onChange={(e) => setFilterStudent(e.target.value)} className="p-1.5 border rounded text-[10px]">
                            <option value="">Semua Siswa</option>
                            {studentList.map(s => <option key={`student-filter-${s.id}`} value={s.id}>{s.name}</option>)}
                        </select>
                        <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="p-1.5 border rounded text-[10px]" />
                        <button onClick={exportToPDF} className="flex items-center gap-1 px-2 py-1.5 bg-red-600 text-white rounded text-[10px] font-bold"><FileText size={12}/> PDF</button>
                        <button onClick={exportToExcel} className="flex items-center gap-1 px-2 py-1.5 bg-green-600 text-white rounded text-[10px] font-bold"><Download size={12}/> Excel</button>
                        {selectedIds.length > 0 && (
                            <button onClick={handleDeleteSelected} className="flex items-center gap-1 px-2 py-1.5 bg-red-500 text-white rounded text-[10px] font-bold hover:bg-red-600 transition-colors">
                                <Trash2 size={12}/> Hapus ({selectedIds.length})
                            </button>
                        )}
                    </div>
                </div>

                {totalPages > 1 && (
                    <div className="flex justify-between items-center py-2 px-4 bg-gray-50 border-b rounded-t-lg">
                        <span className="text-xs text-gray-500">
                            Menampilkan {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredData.length)} dari {filteredData.length} data
                        </span>
                        <div className="flex items-center gap-1">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} className="px-2 py-1 bg-white border rounded text-xs disabled:opacity-50">Sebelumnya</button>
                            <span className="text-xs font-bold px-2">{currentPage} / {totalPages}</span>
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} className="px-2 py-1 bg-white border rounded text-xs disabled:opacity-50">Berikutnya</button>
                        </div>
                    </div>
                )}
                
                {/* Top Scrollbar container */}
                <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto custom-scrollbar border-b border-gray-100">
                    <div style={{ width: '1000px', height: '1px' }}></div>
                </div>

                <div ref={tableScrollRef} onScroll={handleTableScroll} className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left bg-white rounded-2xl overflow-hidden min-w-[1000px] border border-gray-100 shadow-sm">
                        <thead>
                            <tr className="border-b border-gray-100 uppercase text-[10px] sm:text-xs font-black tracking-widest text-gray-500 bg-gray-50/80">
                            <th className="px-4 py-4 text-center w-12">
                                <input 
                                    type="checkbox" 
                                    className="cursor-pointer w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 transition-all"
                                    checked={paginatedData.length > 0 && paginatedData.every(p => selectedIds.includes(p.id))}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            const currentIds = paginatedData.map(p => p.id);
                                            setSelectedIds(prev => Array.from(new Set([...prev, ...currentIds])));
                                        } else {
                                            const currentIds = paginatedData.map(p => p.id);
                                            setSelectedIds(prev => prev.filter(id => !currentIds.includes(id)));
                                        }
                                    }}
                                />
                            </th>
                            <th className="px-4 py-4 text-center">NO</th>
                            <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => requestSort('studentName')}>
                                <div className="flex items-center gap-2">NAMA SISWA</div>
                            </th>
                            <th className="px-6 py-4">KELAS</th>
                            <th className="px-6 py-4 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => requestSort('timestamp')}>WAKTU</th>
                            <th className="px-6 py-4 text-center text-emerald-700">JAM KEHADIRAN</th>
                            <th className="px-6 py-4 text-center text-emerald-700">STATUS KEHADIRAN</th>
                            <th className="px-6 py-4 text-center text-blue-700">KEPULANGAN</th>
                            <th className="px-6 py-4 text-center text-blue-700">STATUS KEPULANGAN</th>
                            <th className="px-6 py-4 text-center">AKSI</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/80">
                        {paginatedData.map((p, idx) => (
                            <tr key={`table-presence-${p.id}-${idx}`} className={cn(
                                "group text-sm transition-all duration-200", 
                                selectedIds.includes(p.id) ? "bg-indigo-50/50" : "hover:bg-gray-50/80 bg-white"
                            )}>
                                <td className="px-4 py-4 text-center">
                                    <input 
                                        type="checkbox" 
                                        className="cursor-pointer w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 transition-all"
                                        checked={selectedIds.includes(p.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedIds(prev => [...prev, p.id]);
                                            } else {
                                                setSelectedIds(prev => prev.filter(id => id !== p.id));
                                            }
                                        }}
                                    />
                                </td>
                                <td className="px-4 py-4 text-center font-bold text-gray-400 text-xs">{((currentPage - 1) * itemsPerPage) + idx + 1}</td>
                                <td className="px-6 py-4 font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{p.studentName}</td>
                                <td className="px-6 py-4">
                                    <span className="px-2.5 py-1 bg-gray-100/80 text-gray-600 rounded-lg text-xs font-bold uppercase tracking-wider border border-gray-200/50">
                                        {p.className}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-medium text-gray-600 tabular-nums text-xs whitespace-nowrap">{p.dateStr.split('-').reverse().join('-')}</td>
                                <td className="px-6 py-4 font-bold text-center tabular-nums text-gray-900">{p.arrivalTimestamp ? p.arrivalTimestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                <td className="px-6 py-4 text-center">
                                    {p.arrivalStatus !== '-' ? (
                                        <div className="flex justify-center">
                                            <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 w-fit", 
                                                p.arrivalStatus.toLowerCase() === 'terlambat' ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-400/20 shadow-sm' : 
                                                p.arrivalStatus.toLowerCase() === 'hadir' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400/20 shadow-sm' : 'bg-gray-100 text-gray-700 ring-1 ring-gray-400/20 shadow-sm'
                                            )}>
                                                {p.arrivalStatus.toLowerCase() === 'terlambat' ? <Clock size={12} strokeWidth={3} /> : p.arrivalStatus.toLowerCase() === 'hadir' ? <CheckCircle size={12} strokeWidth={3} /> : <AlertCircle size={12} strokeWidth={3} />}
                                                {p.arrivalStatus}
                                            </span>
                                        </div>
                                    ) : <span className="text-gray-300">-</span>}
                                </td>
                                <td className="px-6 py-4 font-bold text-center tabular-nums text-gray-900">{p.departureTimestamp ? p.departureTimestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                                <td className="px-6 py-4 text-center">
                                    {p.departureStatus !== '-' ? (
                                       <div className="flex justify-center">
                                           <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 ring-1 ring-blue-400/20 shadow-sm">
                                               {p.departureStatus}
                                           </span>
                                       </div>
                                    ) : <span className="text-gray-300">-</span>}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center justify-center gap-2">
                                        <button onClick={() => setSelectedStudent(p)} className="p-2 text-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-all" title="Detail"><Eye size={16}/></button>
                                        <button onClick={() => openEdit(p)} className="p-2 text-amber-500 hover:bg-amber-50 hover:text-amber-600 rounded-lg transition-all" title="Edit"><Edit size={16}/></button>
                                        <button onClick={() => handleDelete(p)} className="p-2 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all" title="Hapus"><Trash2 size={16}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {paginatedData.length === 0 && (
                            <tr>
                                <td colSpan={10} className="p-12 text-center text-gray-400 font-medium italic bg-gray-50/50">
                                    Tidak ada data kehadiran yang sesuai filter.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                </div>

                {totalPages > 1 && (
                    <div className="flex justify-between items-center py-2 px-4 bg-gray-50 border-t rounded-b-lg">
                        <span className="text-xs text-gray-500">
                            Menampilkan {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredData.length)} dari {filteredData.length} data
                        </span>
                        <div className="flex items-center gap-1">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} className="px-2 py-1 bg-white border rounded text-xs disabled:opacity-50">Sebelumnya</button>
                            <span className="text-xs font-bold px-2">{currentPage} / {totalPages}</span>
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} className="px-2 py-1 bg-white border rounded text-xs disabled:opacity-50">Berikutnya</button>
                        </div>
                    </div>
                )}

                {editMode && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-xl">
                            <div className="flex justify-between items-center mb-6">
                                <h4 className="font-bold text-lg text-gray-800">Edit Data Kehadiran</h4>
                                <button onClick={() => setEditMode(null)} className="text-gray-400 hover:text-gray-600 transition-colors">Tutup</button>
                            </div>
                            
                            <div className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <p className="text-sm font-bold text-gray-800">{editMode.studentName}</p>
                                <p className="text-xs text-gray-500">Kelas: {editMode.className} | Tanggal: {editMode.dateStr.split('-').reverse().join('-')}</p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <h5 className="text-xs font-bold uppercase tracking-wider text-green-700 mb-2 border-b border-green-100 pb-1">Data Kedatangan</h5>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Jam Datang</label>
                                            <input type="time" value={editForm.arrivalTime} onChange={e => setEditForm({...editForm, arrivalTime: e.target.value})} className="w-full text-sm p-2 border border-gray-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Status Kedatangan</label>
                                            <select value={editForm.arrivalStatus} onChange={e => setEditForm({...editForm, arrivalStatus: e.target.value})} className="w-full text-sm p-2 border border-gray-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                                <option value="Hadir">Hadir</option>
                                                <option value="Terlambat">Terlambat</option>
                                                <option value="">Kosong</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-2">
                                    <h5 className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-2 border-b border-blue-100 pb-1">Data Kepulangan</h5>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Jam Pulang</label>
                                            <input type="time" value={editForm.departureTime} onChange={e => setEditForm({...editForm, departureTime: e.target.value})} className="w-full text-sm p-2 border border-gray-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Status Kepulangan</label>
                                            <select value={editForm.departureStatus} onChange={e => setEditForm({...editForm, departureStatus: e.target.value})} className="w-full text-sm p-2 border border-gray-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                                <option value="Valid">Valid</option>
                                                <option value="Pulang Lebih Awal">Pulang Lebih Awal</option>
                                                <option value="">Kosong</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-6 flex justify-end gap-2">
                                <button onClick={() => setEditMode(null)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors">Batal</button>
                                <button onClick={handleSaveEdit} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors">Simpan Perubahan</button>
                            </div>
                        </div>
                    </div>
                )}

                {selectedStudent && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                        <div className="bg-white p-6 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="font-bold">Riwayat Absensi: {selectedStudent.studentName}</h4>
                                <button onClick={() => setSelectedStudent(null)} className="text-gray-500 font-bold">Tutup</button>
                            </div>
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b uppercase text-gray-500">
                                        <th className="p-2">Tipe</th>
                                        <th className="p-2">Waktu</th>
                                        <th className="p-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {studentHistory.map((h, hIdx) => (
                                        <tr key={`modal-history-${h.id || ''}-${hIdx}`} className="border-b">
                                            <td className="p-2">{h.type.toUpperCase()}</td>
                                            <td className="p-2">{formatDate(h.timestamp.toDate())}</td>
                                            <td className="p-2">{h.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            )}
        </div>
    );
};
