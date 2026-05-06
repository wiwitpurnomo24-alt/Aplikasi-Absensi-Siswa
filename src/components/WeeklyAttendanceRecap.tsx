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

    const statsByClass: Record<string, { sakit: number; izin: number; dispensasi: number; absentList: string[] }> = {};

    // Initialize stats
    const schoolClasses = selectedClass ? [selectedClass] : Array.from(new Set(students.map(s => s.className)));
    schoolClasses.forEach(cls => {
      statsByClass[cls] = { sakit: 0, izin: 0, dispensasi: 0, absentList: [] };
    });

    filteredAttendance.forEach(record => {
      if (!statsByClass[record.className]) return;
      
      const type = record.type.toLowerCase();
      if (type === 'sakit') statsByClass[record.className].sakit++;
      else if (type === 'izin') statsByClass[record.className].izin++;
      else if (type === 'dispensasi') statsByClass[record.className].dispensasi++;
      
      if (['sakit', 'izin', 'dispensasi', 'alpa'].includes(type)) {
        const studentName = record.studentName || students.find(s => s.id === record.studentId)?.name || 'Unknown';
        const entry = `${studentName} (${record.type})`;
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Rekapitulasi Mingguan</h3>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Data 7 Hari Terakhir</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Periode</p>
          <p className="text-xs font-bold text-gray-700">
            {format(subDays(new Date(), 7), 'dd MMM', { locale: id })} - {format(new Date(), 'dd MMM yyyy', { locale: id })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map(cls => (
          <div key={`weekly-cls-${cls}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
              <h4 className="font-black text-gray-900 uppercase tracking-tighter">Kelas {cls}</h4>
              <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                <Users size={14} />
              </div>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-orange-50 p-2 rounded-xl border border-orange-100 text-center">
                  <p className="text-[8px] font-black text-orange-400 uppercase">Sakit</p>
                  <p className="text-lg font-black text-orange-700">{weeklyStats[cls].sakit}</p>
                </div>
                <div className="bg-blue-50 p-2 rounded-xl border border-blue-100 text-center">
                  <p className="text-[8px] font-black text-blue-400 uppercase">Izin</p>
                  <p className="text-lg font-black text-blue-700">{weeklyStats[cls].izin}</p>
                </div>
                <div className="bg-purple-50 p-2 rounded-xl border border-purple-100 text-center">
                  <p className="text-[8px] font-black text-purple-400 uppercase">Disp.</p>
                  <p className="text-lg font-black text-purple-700">{weeklyStats[cls].dispensasi}</p>
                </div>
              </div>

              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <AlertCircle size={10} /> Daftar Ketidakhadiran
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {weeklyStats[cls].absentList.length > 0 ? (
                    weeklyStats[cls].absentList.map((entry, idx) => (
                      <div key={`${cls}-abs-${idx}`} className="text-[10px] font-medium text-gray-600 py-1 border-b border-gray-50 last:border-0">
                        {entry}
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] font-medium text-gray-400 italic py-2 text-center bg-gray-50 rounded-lg">
                      Nihil ketidakhadiran
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
