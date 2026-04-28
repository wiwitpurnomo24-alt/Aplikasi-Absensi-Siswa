import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { AlertTriangle } from 'lucide-react';
import { handleFirestoreError } from '../lib/firebase';
import { useAuthStore } from '../lib/auth-store';

export default function AttendanceAlertsDisplay() {
    const [alerts, setAlerts] = useState<any[]>([]);
    const { user } = useAuthStore();

    useEffect(() => {
        if (!user || !auth.currentUser) return;

        const q = query(collection(db, 'attendance_alerts'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setAlerts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (err) => {
            handleFirestoreError(err, 'list', 'attendance_alerts');
        });
        return () => unsubscribe();
    }, [user, auth.currentUser]);

    if (alerts.length === 0) return null;

    if (alerts.length === 0) return null;

    return (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl shadow-sm mb-6">
            <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="text-red-600" size={20} />
                <h3 className="text-sm font-bold text-red-800">Peringatan Kehadiran Siswa</h3>
            </div>
            <div className="space-y-2">
                {alerts.map(alert => (
                    <div key={alert.id} className="bg-white p-3 rounded-lg border border-red-100 text-xs text-red-900">
                        <p className="font-semibold">{alert.studentName} ({alert.className})</p>
                        <p>{alert.message}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
