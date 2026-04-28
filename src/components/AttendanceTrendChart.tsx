import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-6 uppercase tracking-wider">Tren Ketidakhadiran Harian</h3>
            <ResponsiveContainer width="100%" height={350}>
                <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Sakit" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="Izin" stackId="a" fill="#10b981" />
                    <Bar dataKey="Dispensasi" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="Alpa" stackId="a" fill="#ef4444" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
