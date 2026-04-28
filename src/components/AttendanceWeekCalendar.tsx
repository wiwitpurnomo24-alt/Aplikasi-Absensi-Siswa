import React, { useMemo } from 'react';
import { AttendanceRecord } from '../types';
import { getDayName } from '../lib/utils';
import { Calendar } from 'lucide-react';

interface Props {
  attendance: AttendanceRecord[];
  setFilterDate: (date: string) => void;
  currentDate?: Date;
}

export default function AttendanceWeekCalendar({ attendance, setFilterDate, currentDate = new Date() }: Props) {
  const weekDays = useMemo(() => {
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    startOfWeek.setDate(diff);

    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateString = d.toISOString().split('T')[0];
      
      const dayAttendance = attendance.filter(a => a.date === dateString);
      
      return {
        date: d,
        dateString,
        dayName: getDayName(d),
        stats: {
          sakit: dayAttendance.filter(a => a.type === 'Sakit').length,
          izin: dayAttendance.filter(a => a.type === 'Izin').length,
          dispensasi: dayAttendance.filter(a => a.type === 'Dispensasi').length,
        }
      };
    });
  }, [attendance, currentDate]);

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
      <h3 className="text-sm font-bold text-gray-800 mb-6 flex items-center gap-2">
        <Calendar size={18} className="text-blue-600" />
        Absensi Minggu Ini
      </h3>
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((wd) => (
          <button 
            key={wd.dateString}
            onClick={() => setFilterDate(wd.dateString)}
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-gray-50 hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100"
          >
            <span className="text-[10px] uppercase font-bold text-gray-400">{wd.dayName.substring(0, 3)}</span>
            <span className="text-lg font-extrabold text-gray-900">{wd.date.getDate()}</span>
            <div className="flex flex-col gap-1 mt-2 w-full">
              {wd.stats.sakit > 0 && <div className="h-1 bg-red-500 rounded-full" title={`Sakit: ${wd.stats.sakit}`}></div>}
              {wd.stats.izin > 0 && <div className="h-1 bg-amber-500 rounded-full" title={`Izin: ${wd.stats.izin}`}></div>}
              {wd.stats.dispensasi > 0 && <div className="h-1 bg-purple-500 rounded-full" title={`Disp: ${wd.stats.dispensasi}`}></div>}
            </div>
            {(wd.stats.sakit + wd.stats.izin + wd.stats.dispensasi) === 0 && (
                <span className="text-[8px] text-gray-300 mt-2">Nihil</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
