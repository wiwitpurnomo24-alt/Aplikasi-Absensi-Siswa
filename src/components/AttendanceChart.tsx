import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AttendanceRecord } from '../types';

interface AttendanceChartProps {
    attendance: AttendanceRecord[];
}

export default function AttendanceChart({ attendance }: AttendanceChartProps) {
    const data = React.useMemo(() => {
        const classMap: Record<string, any> = {};
        attendance.forEach(record => {
            if (!record.className) return;
            if (!classMap[record.className]) {
                classMap[record.className] = { name: record.className, Sakit: 0, Izin: 0, Alpa: 0, Dispensasi: 0 };
            }
            if (record.type === 'Sakit') classMap[record.className].Sakit++;
            if (record.type === 'Izin') classMap[record.className].Izin++;
            if (record.type === 'Alpa') classMap[record.className].Alpa++;
            if (record.type === 'Dispensasi') classMap[record.className].Dispensasi++;
        });
        return Object.values(classMap).sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
    }, [attendance]);

    return (
        <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-100 h-full">
            <h3 className="text-xs font-bold text-gray-800 mb-2 uppercase tracking-wider">Distribusi Absensi Per Kelas</h3>
            <ResponsiveContainer width="100%" height={150}>
                <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 8 }} />
                    <YAxis tick={{ fontSize: 8 }} />
                    <Tooltip contentStyle={{ fontSize: '10px' }} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} iconSize={8} />
                    <Bar dataKey="Sakit" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Izin" fill="#10b981" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Dispensasi" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Alpa" fill="#ef4444" radius={[2, 2, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
