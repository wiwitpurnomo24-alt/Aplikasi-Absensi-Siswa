import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AttendanceRecord } from '../types';

interface AttendanceTrendChartProps {
    attendance: AttendanceRecord[];
}

export default function AttendanceTrendChart({ attendance }: AttendanceTrendChartProps) {
    const data = useMemo(() => {
        const dailyMap: Record<string, any> = {};
        attendance.forEach(record => {
            if (!record.date) return;
            if (!dailyMap[record.date]) {
                dailyMap[record.date] = { date: record.date, Sakit: 0, Izin: 0, Dispensasi: 0, Alpa: 0 };
            }
            if (record.type === 'Sakit') dailyMap[record.date].Sakit++;
            if (record.type === 'Izin') dailyMap[record.date].Izin++;
            if (record.type === 'Dispensasi') dailyMap[record.date].Dispensasi++;
            if (record.type === 'Alpa') dailyMap[record.date].Alpa++;
        });
        return Object.values(dailyMap).sort((a,b) => a.date.localeCompare(b.date));
    }, [attendance]);

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-lg h-full">
            <h3 className="text-xs font-bold text-gray-800 mb-2 uppercase tracking-wider">Tren Ketidakhadiran Harian</h3>
            <ResponsiveContainer width="100%" height={150}>
                <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                    <YAxis tick={{ fontSize: 8 }} />
                    <Tooltip contentStyle={{ fontSize: '10px' }} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} iconSize={8} />
                    <Line type="monotone" dataKey="Sakit" stroke="#3b82f6" strokeWidth={2} dot={{r: 2}} />
                    <Line type="monotone" dataKey="Izin" stroke="#10b981" strokeWidth={2} dot={{r: 2}} />
                    <Line type="monotone" dataKey="Dispensasi" stroke="#f59e0b" strokeWidth={2} dot={{r: 2}} />
                    <Line type="monotone" dataKey="Alpa" stroke="#ef4444" strokeWidth={2} dot={{r: 2}} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
