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
            if (!classMap[record.className]) {
                classMap[record.className] = { name: record.className, Sakit: 0, Izin: 0, Alpa: 0 };
            }
            if (record.type === 'Sakit') classMap[record.className].Sakit++;
            if (record.type === 'Izin') classMap[record.className].Izin++;
            if (record.type === 'Alpa') classMap[record.className].Alpa++;
        });
        return Object.values(classMap).sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
    }, [attendance]);

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-6">Distribusi Absensi Per Kelas</h3>
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Sakit" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Izin" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Alpa" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
