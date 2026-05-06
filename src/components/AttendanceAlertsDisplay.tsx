import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { AlertTriangle } from 'lucide-react';
import { handleFirestoreError } from '../lib/firebase';
import { useAuthStore } from '../lib/auth-store';

export default function AttendanceAlertsDisplay({ className }: { className?: string }) {
    const [alerts, setAlerts] = useState<any[]>([]);
    const { user } = useAuthStore();

    useEffect(() => {
        if (!user) return;

        const q = query(collection(db, 'attendance_alerts'), orderBy('createdAt', 'desc'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let data = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...(doc.data() as any),
                createdAt: doc.data().createdAt?.toDate()
            }));
            if (className) {
                data = data.filter(a => a.className === className);
            }
            setAlerts(data);
        }, (err) => {
            handleFirestoreError(err, 'list', 'attendance_alerts');
        });
        return () => unsubscribe();
    }, [user, className]);

    if (alerts.length === 0) return null;

    return (
        <div className="bg-white border border-red-100 rounded-2xl shadow-sm overflow-hidden mb-6">
            <div className="flex items-center gap-2 p-4 bg-red-50/50 border-b border-red-100">
                <AlertTriangle className="text-red-500" size={18} />
                <h3 className="text-sm font-black text-red-900 uppercase tracking-widest">Peringatan Kehadiran</h3>
            </div>
            <div className="divide-y divide-gray-100">
                {alerts.map(alert => (
                    <div key={`att-alert-${alert.id}`} className="p-4 flex gap-3 hover:bg-gray-50 transition-colors">
                        <div className="mt-0.5">
                            <div className="w-2 h-2 rounded-full bg-red-400"></div>
                        </div>
                        <div className="space-y-0.5">
                            <p className="font-bold text-gray-900 text-sm">
                                {alert.studentName} <span className="font-normal text-gray-500">• {alert.className}</span>
                            </p>
                            <p className="text-xs text-gray-600">{alert.details || alert.message}</p>
                            {alert.createdAt && (
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                    {alert.createdAt.toLocaleDateString('id-ID')} {alert.createdAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
