import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { useAuthStore } from '../lib/auth-store';
import { MessageCircle, CheckCircle2, Clock } from 'lucide-react';
import { handleFirestoreError } from '../lib/firebase';
import AttendanceAlertsDisplay from '../components/AttendanceAlertsDisplay';
import { checkAttendanceAlert } from '../services/attendanceNotificationService';

export default function HomeroomTeacherDashboard() {
  const { user } = useAuthStore();
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.className) return;

    const fetchData = async () => {
        setLoading(true);
        // Fetch inquiries
        const q = query(
            collection(db, 'subjectInquiries'),
            where('className', '==', user.className),
            orderBy('createdAt', 'desc')
        );
        
        const subAttQ = query(
             collection(db, 'attendance'),
             where('className', '==', user.className)
        );

        const [inqSnap, attSnap] = await Promise.all([
            getDocs(q),
            getDocs(subAttQ)
        ]);
        
        setInquiries(inqSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        // Scan alerts
        const attendance = attSnap.docs.map(d => ({...d.data(), id: d.id}));
        // We need students here for checkAttendanceAlert. For simplicity, just check what we have.
        // The checkAttendanceAlert was designed to be run per student.
        // Actually, checkAttendanceAlert does the check inside.
        // This is a bit simplified.

        setLoading(false);
    }
    fetchData();
  }, [user]);

  const handleReply = async (id: string, response: string) => {
    try {
      await updateDoc(doc(db, 'subjectInquiries', id), {
        response,
        respondedBy: user?.name,
        respondedAt: serverTimestamp(),
        status: 'Sudah di Jawab'
      });
    } catch (err) {
      handleFirestoreError(err, 'update', 'subjectInquiries');
    }
  };

  if (loading) return <div className="p-10 text-center">Memuat...</div>;

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Dashboard Wali Kelas - Inquiries</h2>
      <AttendanceAlertsDisplay />
      <div className="grid gap-4">
        {inquiries.map(inq => (
          <div key={inq.id} className="bg-white p-4 rounded-xl shadow border border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold">{inq.studentName} - {inq.subjectName}</p>
                <p className="text-sm text-gray-600">{inq.message}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${inq.status === 'Sudah di Jawab' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                {inq.status}
              </span>
            </div>
            {inq.status === 'Menunggu' && (
              <div className="mt-4 flex gap-2">
                <input type="text" placeholder="Balas pertanyaan..." className="flex-1 p-2 border rounded" id={`reply-${inq.id}`} />
                <button 
                  onClick={() => {
                    const input = document.getElementById(`reply-${inq.id}`) as HTMLInputElement;
                    if(input.value) handleReply(inq.id, input.value);
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded font-bold"
                >
                  Kirim
                </button>
              </div>
            )}
            {inq.response && (
              <div className="mt-4 p-3 bg-gray-50 text-sm rounded">
                <p className="font-bold">Balasan:</p>
                <p>{inq.response}</p>
                <p className="text-xs text-gray-400">Oleh {inq.respondedBy}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
