// Trivial comment to force rebuild
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Timestamp, doc, getDoc, getDocs, query, where, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json());

  // Initialize Firebase (using JSON file via fs)
  const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
  const appFirebase = initializeApp(firebaseConfig);
  const db = getFirestore(appFirebase, firebaseConfig.firestoreDatabaseId);

  // Path helper to support root fallback for 'default' schoolId (restores legacy data)
  const getCollectionPath = (schoolId: string, col: string) => {
    if (schoolId === 'default') return col;
    return `schools/${schoolId}/${col}`;
  };

  const getDocPath = (schoolId: string, col: string, docId: string) => {
    if (schoolId === 'default') return `${col}/${docId}`;
    return `schools/${schoolId}/${col}/${docId}`;
  };

  // Absence Notification Webhook
  app.post("/api/webhook/whatsapp-absence", async (req, res) => {
    try {
      const { studentName, className, studentId, message, type, date, schoolId } = req.body;
      if (!schoolId) return res.status(400).json({ error: 'Missing schoolId' });
      if (!studentName || !className || !message) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Create Notification for Wali Kelas
      const teacherQuery = query(collection(db, getCollectionPath(schoolId, 'teachers')), where('className', '==', className));
      const teacherSnap = await getDocs(teacherQuery);
      let targetUserId = null;
      if (!teacherSnap.empty) {
        targetUserId = teacherSnap.docs[0].data().uid;
      }

      await addDoc(collection(db, getCollectionPath(schoolId, 'notifications')), {
        className: className,
        studentName: studentName,
        studentId: studentId,
        message: message,
        title: 'Izin Absensi WhatsApp',
        read: false,
        type: type || 'INQUIRY',
        createdAt: Timestamp.now(),
        ...(targetUserId && { targetUserId })
      });

      // Create Notification for Admin
      await addDoc(collection(db, getCollectionPath(schoolId, 'notifications')), {
        targetRole: 'ADMIN',
        studentName: studentName,
        studentId: studentId,
        className: className,
        message: `Wali: ${studentName} (${className}) - ${message}`,
        title: 'Pemberitahuan Izin Absensi',
        read: false,
        type: type || 'INQUIRY',
        createdAt: Timestamp.now()
      });

      res.status(200).json({ status: "success" });
    } catch (error) {
      console.error('Error creating notification:', error);
      res.status(500).json({ error: "Failed to create notification" });
    }
  });

  // Attendance Leave Request Status Update
  app.post("/api/attendance/approve-leave", async (req, res) => {
    try {
      const { attendanceId, status, statusReason, notes, studentId, studentName, className, parentPhone, type, schoolId, processedBy, processedById } = req.body;
      if (!schoolId) return res.status(400).json({ error: 'Missing schoolId' });
      
      if (!attendanceId || !status || !studentId || !parentPhone) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Update Attendance Status in Firestore
      await updateDoc(doc(db, getDocPath(schoolId, 'attendance', attendanceId)), {
        status,
        statusReason: statusReason || '',
        notes: notes || '',
        processedAt: Timestamp.now(),
        processedBy: processedBy || 'Admin/Teacher',
        processedById: processedById || null
      });

      // Notify via WhatsApp
      const waConfigDoc = await getDoc(doc(db, getDocPath(schoolId, 'systemSettings', 'whatsappConfig')));
      if (waConfigDoc.exists()) {
          const waSettings = waConfigDoc.data();
          const message = status === 'Approved'
              ? `Halo, permohonan izin ${type} untuk ${studentName} dari kelas ${className} telah DISETUJUI.`
              : `Halo, permohonan izin ${type} untuk ${studentName} dari kelas ${className} DITOLAK. Alasan: ${statusReason || 'Tidak ada alasan'}`;
          
          await fetch(waSettings.apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${waSettings.apiKey}` },
              body: JSON.stringify({
                  to: parentPhone,
                  message: message,
                  sender: waSettings.senderNumber
              })
          }).catch(e => console.error("WhatsApp failed", e));
      }
      
      // Notify via Dashboard (notifications collection) for the parent (or just notify teacher/admin)
       await addDoc(collection(db, getCollectionPath(schoolId, 'notifications')), {
        targetRole: 'PARENT',
        studentId: studentId,
        studentName: studentName,
        message: `Izin ${type} Anda telah ${status === 'Approved' ? 'DISETUJUI' : 'DITOLAK'}.`,
        title: 'Status Izin Absensi',
        read: false,
        type: 'ATTENDANCE_STATUS',
        createdAt: Timestamp.now()
      });

      res.status(200).json({ status: "success" });
    } catch (error) {
      console.error('Error updating leave status:', error);
      res.status(500).json({ error: "Failed to update leave status" });
    }
  });

  // Submit Attendance Leave Request from Parent
  app.post("/api/attendance/submit", async (req, res) => {
    try {
      const { 
        schoolId, 
        studentId, 
        studentName, 
        className, 
        dates, 
        type, 
        reason, 
        parentName, 
        parentPhone, 
        address, 
        additionalInfo, 
        documentUrl, 
        location 
      } = req.body;

      if (!schoolId || !studentId || !dates || !type) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      let lastRefId = '';
      const dateString = dates.length > 1 
        ? `${dates[0]} s/d ${dates[dates.length - 1]}`
        : dates[0];

      // 1. Save to Firestore
      for (const dateItem of dates) {
        const attendanceRef = await addDoc(collection(db, getCollectionPath(schoolId, 'attendance')), {
          date: dateItem,
          type,
          reason,
          parentName,
          parentPhone,
          address,
          additionalInfo,
          documentUrl: documentUrl || null,
          studentId,
          studentName,
          className,
          status: 'Pending',
          statusReason: '',
          location: location || null,
          submittedAt: Timestamp.now(),
          processedBy: parentName || 'Orang Tua',
          processedById: 'parent'
        });
        lastRefId = attendanceRef.id;
      }

      // 2. Dashboard Notifications
      await addDoc(collection(db, getCollectionPath(schoolId, 'notifications')), {
        targetRole: 'TEACHER',
        className: className,
        studentName: studentName,
        attendanceId: lastRefId,
        title: 'Pengajuan Izin Baru',
        message: `${studentName} (${className}) mengajukan izin ${type} karena ${reason} untuk tanggal ${dateString}`,
        read: false,
        createdAt: Timestamp.now()
      });

      await addDoc(collection(db, getCollectionPath(schoolId, 'notifications')), {
        targetRole: 'PARENT',
        studentId: studentId,
        studentName: studentName,
        title: 'Pengajuan Izin Terkirim',
        message: `Pengajuan izin ${type} untuk ${studentName} pada tanggal ${dateString} telah terkirim dan sedang menunggu verifikasi Wali Kelas.`,
        read: false,
        createdAt: Timestamp.now()
      });

      await addDoc(collection(db, getCollectionPath(schoolId, 'notifications')), {
        targetRole: 'ADMIN',
        studentName: studentName,
        className: className,
        title: 'Pengajuan Izin Baru (Admin)',
        message: `${studentName} (${className}) mengajukan izin ${type} untuk ${dates.length} hari (${dateString}).`,
        read: false,
        createdAt: Timestamp.now()
      });

      // 3. Automatic WhatsApp Notification to Homeroom Teacher (Wali Kelas)
      const waConfigDoc = await getDoc(doc(db, getDocPath(schoolId, 'systemSettings', 'whatsappConfig')));
      
      if (waConfigDoc.exists()) {
        const waSettings = waConfigDoc.data();
        
        // Find Teacher for this class to get phone number
        const teacherQuery = query(collection(db, getCollectionPath(schoolId, 'teachers')), where('className', '==', className));
        const teacherSnap = await getDocs(teacherQuery);
        
        if (!teacherSnap.empty) {
          const teacherData = teacherSnap.docs[0].data();
          const teacherPhone = teacherData.phoneNumber;

          if (teacherPhone) {
            let formattedPhone = String(teacherPhone).replace(/\D/g, '');
            if (formattedPhone.startsWith('0')) {
              formattedPhone = '62' + formattedPhone.substring(1);
            } else if (formattedPhone.startsWith('8')) {
              formattedPhone = '62' + formattedPhone;
            }

            const waMessage = `*NOTIFIKASI IZIN SISWA BARU*\n\n` +
              `Halo Bapak/Ibu Wali Kelas ${className},\n\n` +
              `Telah masuk pengajuan izin baru melalui aplikasi:\n\n` +
              `Nama: ${studentName}\n` +
              `Kelas: ${className}\n` +
              `Jenis: ${type}\n` +
              `Alasan: ${reason}\n` +
              `Tanggal: ${dateString}\n\n` +
              `Mohon segera cek dashboard aplikasi untuk memberikan persetujuan.\n` +
              `Terima kasih.`;

            await fetch(waSettings.apiUrl, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${waSettings.apiKey}` 
              },
              body: JSON.stringify({
                to: formattedPhone,
                message: waMessage,
                sender: waSettings.senderNumber
              })
            }).catch(e => console.error("Automatic WhatsApp notification failed", e));
          }
        }
      }

      res.status(200).json({ status: "success", attendanceId: lastRefId });
    } catch (error) {
      console.error('Error submitting attendance:', error);
      res.status(500).json({ error: "Failed to submit attendance" });
    }
  });

  // Send Attendance Status Update Notification to Parent
  app.post("/api/attendance/notify-status", async (req, res) => {
    try {
      const { 
        schoolId, 
        studentName, 
        type, 
        date, 
        status, 
        statusReason, 
        parentPhone 
      } = req.body;

      if (!schoolId || !parentPhone || !status) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Get WhatsApp Configuration
      const waConfigDoc = await getDoc(doc(db, getDocPath(schoolId, 'systemSettings', 'whatsappConfig')));
      
      if (!waConfigDoc.exists()) {
        return res.status(404).json({ error: "WhatsApp configuration not found" });
      }

      const waSettings = waConfigDoc.data();
      
      let formattedPhone = String(parentPhone).replace(/\D/g, '');
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '62' + formattedPhone.substring(1);
      } else if (formattedPhone.startsWith('8')) {
        formattedPhone = '62' + formattedPhone;
      }

      const statusEmoji = status === 'Approved' ? '✅' : '❌';
      const statusLabel = status === 'Approved' ? 'DISETUJUI' : 'DITOLAK';

      const waMessage = `*UPDATE STATUS ABSENSI*\n\n` +
        `Halo Bapak/Ibu,\n\n` +
        `Pengajuan izin ${type} untuk ${studentName} pada tanggal ${date} telah ${statusLabel} ${statusEmoji}\n\n` +
        (statusReason ? `Catatan: ${statusReason}\n\n` : '') +
        `Terima kasih.`;

      const waResponse = await fetch(waSettings.apiUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${waSettings.apiKey}` 
        },
        body: JSON.stringify({
          to: formattedPhone,
          message: waMessage,
          sender: waSettings.senderNumber
        })
      });

      if (!waResponse.ok) {
        const errorText = await waResponse.text();
        console.error("WhatsApp gateway error:", errorText);
        return res.status(500).json({ error: "Failed to send WhatsApp message via gateway" });
      }

      res.status(200).json({ status: "success" });
    } catch (error) {
      console.error('Error sending status notification:', error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  // Attendance Scan Webhook
  app.post("/api/webhook/attendance-scan", async (req, res) => {
    try {
      const { studentId, type, schoolId, processedBy, processedById } = req.body;
      if (!studentId || !schoolId || !type) return res.status(400).json({ error: "Missing fields" });

      let student;
      let studentIdToUse = studentId;

      const studentDoc = await getDoc(doc(db, getDocPath(schoolId, 'students', studentId)));
      if (!studentDoc.exists()) {
          // Try lookup by NIS
          const q = query(collection(db, getCollectionPath(schoolId, 'students')), where('nis', '==', studentId));
          const snap = await getDocs(q);
          if (snap.empty) return res.status(404).json({ error: "Student not found" });
          student = snap.docs[0].data();
          studentIdToUse = snap.docs[0].id;
      } else {
          student = studentDoc.data();
      }

      // Get Config
      const configDoc = await getDoc(doc(db, getDocPath(schoolId, 'schoolConfig', 'main')));
      const config = configDoc.exists() ? configDoc.data() : { entryTime: '06:30', departureTime: '13:40' };

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      let status = '';
      let lateTime = '';

      if (type === 'arrival') {
          if (timeStr > config.entryTime) {
              const [h1, m1] = timeStr.split(':').map(Number);
              const [h2, m2] = config.entryTime.split(':').map(Number);
              const diffMins = (h1 * 60 + m1) - (h2 * 60 + m2);
              const diffH = Math.floor(diffMins / 60);
              const diffM = diffMins % 60;
              lateTime = `${diffH.toString().padStart(2, '0')}:${diffM.toString().padStart(2, '0')}`;
              status = `TERLAMBAT (${lateTime})`;
          } else {
              status = 'TEPAT WAKTU';
          }
      } else if (type === 'departure') {
          status = timeStr < config.departureTime ? 'PULANG AWAL' : 'PULANG TEPAT WAKTU';
      }

      // Save Presence
      await addDoc(collection(db, getCollectionPath(schoolId, 'schoolPresence')), {
          studentId: studentIdToUse,
          studentName: student.name,
          className: student.className,
          type,
          timestamp: Timestamp.now(),
          status,
          processedBy: processedBy || 'System Scanner',
          processedById: processedById || null,
          ...(lateTime && { lateTime })
      });

      // Create targeted notifications
      const isLate = status.startsWith('TERLAMBAT');
      const isEarly = status === 'PULANG AWAL';

      if (isLate || isEarly) {
          const notifTitle = isLate ? 'Siswa Terlambat' : 'Siswa Pulang Awal';
          const notifType = isLate ? 'ATTENDANCE_LATE' : 'ATTENDANCE_EARLY';
          const notifMessage = isLate 
              ? `Siswa ${student.name} (${student.className}) TERLAMBAT datang. Scan masuk: ${timeStr}`
              : `Siswa ${student.name} (${student.className}) PULANG AWAL. Scan keluar: ${timeStr} (Jadwal: ${config.departureTime})`;

          // 1. Notify Admin
          await addDoc(collection(db, getCollectionPath(schoolId, 'notifications')), {
            targetRole: 'ADMIN',
            className: student.className,
            studentName: student.name,
            studentId: studentIdToUse,
            message: notifMessage,
            title: notifTitle,
            read: false,
            type: notifType,
            createdAt: Timestamp.now()
          });

          // 2. Notify Homeroom Teacher
          const teacherQuery = query(collection(db, getCollectionPath(schoolId, 'teachers')), where('className', '==', student.className));
          const teacherSnap = await getDocs(teacherQuery);
          if (!teacherSnap.empty) {
             const homeroomTeacher = teacherSnap.docs[0].data();
             if (homeroomTeacher.uid) {
               await addDoc(collection(db, getCollectionPath(schoolId, 'notifications')), {
                  targetUserId: homeroomTeacher.uid,
                  message: notifMessage,
                  title: notifTitle,
                  read: false,
                  type: notifType,
                  createdAt: Timestamp.now()
               });
             }
          }

          // 3. Notify Parent (App Internal)
          await addDoc(collection(db, getCollectionPath(schoolId, 'notifications')), {
            targetRole: 'PARENT',
            studentId: studentIdToUse,
            message: `Anak Anda, ${student.name}, tercatat ${isLate ? 'TERLAMBAT' : 'PULANG AWAL'} pada jam ${timeStr}.`,
            title: notifTitle,
            read: false,
            type: notifType,
            createdAt: Timestamp.now()
          });
      }

      // Notify via WhatsApp
      const waConfigDoc = await getDoc(doc(db, getDocPath(schoolId, 'systemSettings', 'whatsappConfig')));
      if (waConfigDoc.exists() && student.parentPhone && student.parentPhone !== '-') {
          const waSettings = waConfigDoc.data();
          
          let formattedPhone = String(student.parentPhone).replace(/\D/g, '');
          if (formattedPhone.startsWith('0')) {
              formattedPhone = '62' + formattedPhone.substring(1);
          } else if (formattedPhone.startsWith('8')) {
              formattedPhone = '62' + formattedPhone;
          }

          const message = status.startsWith('TERLAMBAT') 
              ? `*NOTIFIKASI KEHADIRAN SISWA (TERLAMBAT)*\n\n` +
                `Perhatian: ${student.name} (Kelas ${student.className}) terlambat datang ke sekolah.\n` +
                `Jam Scan: ${timeStr}\n` +
                `Status: ${status}\n\n` +
                `_*Pesan otomatis dari Sistem SIAP Sekolah._`
              : status === 'PULANG AWAL'
              ? `*NOTIFIKASI KEHADIRAN SISWA (PULANG AWAL)*\n\n` +
                `Perhatian: ${student.name} (Kelas ${student.className}) pulang sebelum waktu yang ditentukan.\n` +
                `Jam Scan: ${timeStr}\n` +
                `Jadwal Pulang: ${config.departureTime}\n\n` +
                `_*Pesan otomatis dari Sistem SIAP Sekolah._`
              : `*NOTIFIKASI KEHADIRAN SISWA*\n\n` +
                `Halo, ${student.name} (Kelas ${student.className}) baru saja melakukan scan ${type === 'arrival' ? 'MASUK' : 'PULANG'}.\n` +
                `Jam Scan: ${timeStr}\n` +
                `Status: ${status}\n\n` +
                `_*Pesan otomatis dari Sistem SIAP Sekolah._`;
          
          await fetch(waSettings.apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${waSettings.apiKey}` },
              body: JSON.stringify({
                  to: formattedPhone,
                  message: message,
                  sender: waSettings.senderNumber
              })
          }).catch(e => console.error("WhatsApp failed", e));
      }
      
      // Notify via Dashboard (notifications collection)
       await addDoc(collection(db, getCollectionPath(schoolId, 'notifications')), {
        className: student.className,
        studentName: student.name,
        studentId: studentIdToUse,
        message: `${student.name} telah scan ${type}. Status: ${status}`,
        title: 'Pemberitahuan Kehadiran',
        read: false,
        type: 'ATTENDANCE',
        createdAt: Timestamp.now()
      });

      // Special notification for ADMIN as requested
      await addDoc(collection(db, getCollectionPath(schoolId, 'notifications')), {
        targetRole: 'ADMIN',
        className: student.className,
        studentName: student.name,
        studentId: studentIdToUse,
        message: `${student.name} (${student.className}) telah melakukan scan ${type}. Status: ${status}`,
        title: 'Monitor Kehadiran Siswa',
        read: false,
        type: 'ATTENDANCE',
        createdAt: Timestamp.now()
      });

      res.status(200).json({ status: "success", info: { status } });
    } catch (error) {
      console.error('Error scanning attendance:', error);
      res.status(500).json({ error: "Failed to scan" });
    }
  });

  // API login for NIP/NIS
  app.post("/api/login", async (req, res) => {
    try {
      const { id, password, schoolId } = req.body;
      if (!id || !password || !schoolId) return res.status(400).json({ error: "Missing fields" });

      const normalizedId = id.trim();
      const normalizedPassword = password.trim();

      // 1. Check Teachers
      const teacherQ = query(collection(db, getCollectionPath(schoolId, 'teachers')), where('nip', '==', normalizedId));
      const teacherSnap = await getDocs(teacherQ);

      if (!teacherSnap.empty) {
        const doc = teacherSnap.docs[0];
        const data = doc.data();
        const pwd = data.password || data['SANDI'] || '12345';
        if (String(pwd) === String(normalizedPassword)) {
          return res.json({ success: true, type: 'teacher', data: { ...data, id: doc.id } });
        }
      }

      // 2. Check Students (Parents)
      const studentQ = query(collection(db, getCollectionPath(schoolId, 'students')), where('nis', '==', normalizedId));
      const studentSnap = await getDocs(studentQ);

      if (!studentSnap.empty) {
        const doc = studentSnap.docs[0];
        const data = doc.data();
        const pwd = data.parentPassword || data['SANDI ORTU'] || '12345';
        if (String(pwd) === String(normalizedPassword)) {
          return res.json({ success: true, type: 'student', data: { ...data, id: doc.id } });
        }
      }

      // 3. Check Officer (Special Format)
      const officerQ = query(collection(db, getCollectionPath(schoolId, 'students')), where('role', '==', 'PETUGAS_ABSEN_KELAS'));
      const officerSnap = await getDocs(officerQ);
      
      const foundOfficer = officerSnap.docs.find(doc => {
          const d = doc.data();
          if (d.userId && d.userId === normalizedId) return true;
          
          const cleanClassName = (d.className || '').replace(/\s+/g, '').toUpperCase();
          const paddedNo = String(d.absensiNo || '').padStart(2, '0');
          const officerId = `${cleanClassName}${paddedNo}`;
          return officerId.toLowerCase() === normalizedId.toLowerCase();
      });

      if (foundOfficer) {
        const data = foundOfficer.data();
        const pwd = data.password || data.parentPassword || data.nis || data['SANDI ORTU'] || '12345';
        if (String(pwd) === String(normalizedPassword)) {
          return res.json({ success: true, type: 'officer', data: { ...data, id: foundOfficer.id } });
        }
      }

      res.status(401).json({ success: false, error: "Username atau Password salah" });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, error: "Terjadi kesalahan pada server" });
    }
  });

  // API health
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
