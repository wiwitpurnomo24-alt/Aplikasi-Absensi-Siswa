import React, { useMemo } from 'react';
import { AttendanceRecord, Student } from '../types';
import { startOfWeek, endOfWeek, isWithinInterval, subDays, format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { FileText, Users, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

interface WeeklyAttendanceRecapProps {
  attendance: AttendanceRecord[];
  students: Student[];
  selectedClass?: string;
}

export default function WeeklyAttendanceRecap({ attendance, students, selectedClass }: WeeklyAttendanceRecapProps) {
  const weeklyStats = useMemo(() => {
    const now = new Date();
    const startOfCurrentWeek = startOfWeek(now, { weekStartsOn: 1 }); // Monday
    const endOfCurrentWeek = endOfWeek(now, { weekStartsOn: 1 });
    
    // We'll calculate for the "Last 7 Days" instead of just current calendar week for better utility
    const sevenDaysAgo = subDays(now, 7);
    
    const filteredAttendance = attendance.filter(record => {
      let recordDate: Date;
      if (typeof record.date === 'string') {
        recordDate = parseISO(record.date);
      } else if ((record.date as any)?.toDate) {
        recordDate = (record.date as any).toDate();
      } else {
        recordDate = record.date as any;
      }
      
      return isWithinInterval(recordDate, { start: sevenDaysAgo, end: now }) && 
             (!selectedClass || record.className === selectedClass);
    });

    const relevantStudents = selectedClass 
      ? students.filter(s => s.className === selectedClass)
      : students;

    const statsByClass: Record<string, { sakit: number; izin: number; dispensasi: number; alpa: number; totalSiswa: number; absentList: string[] }> = {};

    // Initialize stats
    const schoolClasses = selectedClass ? [selectedClass] : Array.from(new Set(students.map(s => s.className)));
    schoolClasses.forEach(cls => {
      const clsStudents = students.filter(s => s.className === cls);
      statsByClass[cls] = { 
        sakit: 0, 
        izin: 0, 
        dispensasi: 0, 
        alpa: 0, 
        totalSiswa: clsStudents.length,
        absentList: [] 
      };
    });

    filteredAttendance.forEach(record => {
      if (!statsByClass[record.className]) return;
      
      const type = record.type.toLowerCase();
      if (type === 'sakit') statsByClass[record.className].sakit++;
      else if (type === 'izin') statsByClass[record.className].izin++;
      else if (type === 'dispensasi') statsByClass[record.className].dispensasi++;
      else if (type === 'alpa' || type === 'alpha') statsByClass[record.className].alpa++;
      
      if (['sakit', 'izin', 'dispensasi', 'alpa', 'alpha'].includes(type)) {
        const studentName = record.studentName || students.find(s => s.id === record.studentId)?.name || 'Unknown';
        const displayType = type === 'alpha' ? 'Alpa' : record.type;
        const entry = `${studentName} (${displayType})`;
        if (!statsByClass[record.className].absentList.includes(entry)) {
          statsByClass[record.className].absentList.push(entry);
        }
      }
    });

    return statsByClass;
  }, [attendance, students, selectedClass]);

  const classes = Object.keys(weeklyStats).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Rekapitulasi Mingguan</h3>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Data 7 Hari Terakhir</p>
        </div>
        <div className="text-right flex flex-col items-center sm:items-end">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Periode</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="p-1 bg-blue-50 text-blue-600 rounded-md">
              <Clock size={12} />
            </div>
            <p className="text-xs font-bold text-gray-700">
              {format(subDays(new Date(), 7), 'dd MMM', { locale: id })} - {format(new Date(), 'dd MMM yyyy', { locale: id })}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100 uppercase text-[10px] font-black tracking-widest text-gray-500">
                <th className="px-6 py-4">Kategori Kelas</th>
                <th className="px-6 py-4 text-center">Ttl Siswa</th>
                <th className="px-6 py-4 text-center text-red-700">Sakit</th>
                <th className="px-6 py-4 text-center text-yellow-700">Izin</th>
                <th className="px-6 py-4 text-center text-purple-700">Dispen</th>
                <th className="px-6 py-4 text-center text-gray-700">Alpa</th>
                <th className="px-6 py-4">Daftar Ketidakhadiran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {classes.map(cls => (
                <tr key={`weekly-cls-${cls}`} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-black uppercase tracking-wider border border-blue-100/50">
                      Kelas {cls}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-gray-600 tabular-nums">
                    {weeklyStats[cls].totalSiswa}
                  </td>
                  <td className="px-6 py-4 text-center font-black text-red-600 tabular-nums">
                    {weeklyStats[cls].sakit}
                  </td>
                  <td className="px-6 py-4 text-center font-black text-yellow-600 tabular-nums">
                    {weeklyStats[cls].izin}
                  </td>
                  <td className="px-6 py-4 text-center font-black text-purple-600 tabular-nums">
                    {weeklyStats[cls].dispensasi}
                  </td>
                  <td className="px-6 py-4 text-center font-black text-gray-500 tabular-nums">
                    {weeklyStats[cls].alpa}
                  </td>
                  <td className="px-6 py-4">
                    <div className="max-w-[250px]">
                      {weeklyStats[cls].absentList.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {weeklyStats[cls].absentList.slice(0, 3).map((entry, idx) => (
                            <span key={`${cls}-abs-${idx}`} className="text-[9px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                              {entry}
                            </span>
                          ))}
                          {weeklyStats[cls].absentList.length > 3 && (
                            <span className="text-[9px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                              +{weeklyStats[cls].absentList.length - 3} lainnya
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">Nihil</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
