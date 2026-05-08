import { addDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AttendanceRecord, AttendanceAlert } from '../types';
import { getTenantCollection, getTenantDoc } from '../lib/tenant';

const createAlert = async (studentId: string, studentName: string, className: string, type: 'consecutive' | 'total', details: string) => {
    // Prevent duplicate active alerts
    const alertsRef = getTenantCollection('attendance_alerts');
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

    // Notify Wali Kelas via the Layout Bell system
    await addDoc(getTenantCollection('notifications'), {
        className: className,
        studentName: studentName,
        studentId: studentId,
        message: `${studentName}: ${details}`,
        title: 'Peringatan Kehadiran Siswa',
        read: false,
        type: 'WARNING',
        createdAt: Timestamp.now()
    });

    // Notify ADMIN via the Layout Bell system
    await addDoc(getTenantCollection('notifications'), {
        targetRole: 'ADMIN',
        studentName: studentName,
        studentId: studentId,
        className: className,
        message: `${studentName} (${className}): ${details}`,
        title: 'Peringatan Sistem: Kehadiran Siswa',
        read: false,
        type: 'WARNING',
        createdAt: Timestamp.now()
    });
};

export const checkAttendanceAlert = async (studentId: string, studentName: string, className: string) => {
  // Fetch only approved attendance for this student
  const q = query(
    getTenantCollection('attendance'), 
    where('studentId', '==', studentId),
    where('status', '==', 'Approved')
  );
  
  const snapshot = await getDocs(q);
  const studentAttendance = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // 1. Consecutive Sakit ( > 3 days)
  let consecutiveSakit = 0;
  for (const record of studentAttendance) {
    if (record.type === 'Sakit') {
      consecutiveSakit++;
    } else {
      consecutiveSakit = 0;
    }
    if (consecutiveSakit > 3) {
      await createAlert(studentId, studentName, className, 'consecutive', `Sakit lebih dari 3 hari berturut-turut (${consecutiveSakit} hari)`);
    }
  }

  // 2. Total Alpa ( > 10 days)
  const totalAlpa = studentAttendance.filter(a => a.type === 'Alpa').length;
  if (totalAlpa > 10) {
    await createAlert(studentId, studentName, className, 'total', `Total ketidakhadiran (Alpa) melebihi 10 hari (${totalAlpa} hari)`);
  }
};
