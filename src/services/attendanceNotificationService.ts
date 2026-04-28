import { addDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AttendanceRecord, AttendanceAlert } from '../types';

export const checkAttendanceAlert = async (studentId: string, studentName: string, className: string, allAttendance: AttendanceRecord[], xDays: number, yDays: number) => {
  const studentAttendance = allAttendance
    .filter(a => a.studentId === studentId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Consecutive absence (Type 'Alpa' - assuming 'Alpa' is what the user meant by "tidak hadir")
  let consecutiveCount = 0;
  for (const record of studentAttendance) {
    if (record.type === 'Alpa') {
        consecutiveCount++;
    } else {
        consecutiveCount = 0;
    }
    if (consecutiveCount >= xDays) {
        // Trigger alert
        await createAlert(studentId, studentName, className, 'consecutive', `Tidak hadir ${consecutiveCount} hari berturut-turut`);
        consecutiveCount = 0; // Reset after alerting
    }
  }

  // Total absence in semester (Alpa)
  const totalAlpa = studentAttendance.filter(a => a.type === 'Alpa').length;
  if(totalAlpa >= yDays) {
      await createAlert(studentId, studentName, className, 'total', `Total ketidakhadiran mencapai ${totalAlpa} hari dalam satu semester`);
  }
};

const createAlert = async (studentId: string, studentName: string, className: string, type: 'consecutive' | 'total', details: string) => {
    // Prevent duplicate active alerts
    const alertsRef = collection(db, 'attendance_alerts');
    const q = query(alertsRef, where('studentId', '==', studentId), where('status', '==', 'active'));
    const snapshot = await getDocs(q);
    
    if (snapshot.size > 0) return; // Already alerted for this

    await addDoc(alertsRef, {
        studentId,
        studentName,
        className,
        alertType: type,
        details,
        createdAt: Timestamp.now(),
        status: 'active'
    });
};
