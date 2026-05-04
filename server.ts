import express from "express";
import { createServer as createViteServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Timestamp, doc, getDoc, getDocs, query, where } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json());

  // Initialize Firebase (using JSON file via fs)
  const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
  const appFirebase = initializeApp(firebaseConfig);
  const db = getFirestore(appFirebase, firebaseConfig.firestoreDatabaseId);

  // Absence Notification Webhook
  app.post("/api/webhook/whatsapp-absence", async (req, res) => {
    try {
      const { studentName, className, studentId, message, type, date } = req.body;
      
      if (!studentName || !className || !message) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Create Notification for Wali Kelas
      await addDoc(collection(db, 'notifications'), {
        className: className,
        studentName: studentName,
        studentId: studentId,
        message: message,
        title: 'Izin Absensi WhatsApp',
        read: false,
        type: type || 'INQUIRY',
        createdAt: Timestamp.now()
      });

      // Create Notification for Admin
      await addDoc(collection(db, 'notifications'), {
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

  // Attendance Scan Webhook
  app.post("/api/webhook/attendance-scan", async (req, res) => {
    try {
      const { studentId, type } = req.body;
      if (!studentId || !type) return res.status(400).json({ error: "Missing fields" });

      let student;
      let studentIdToUse = studentId;

      const studentDoc = await getDoc(doc(db, 'students', studentId));
      if (!studentDoc.exists()) {
          // Try lookup by NIS
          const q = query(collection(db, 'students'), where('nis', '==', studentId));
          const snap = await getDocs(q);
          if (snap.empty) return res.status(404).json({ error: "Student not found" });
          student = snap.docs[0].data();
          studentIdToUse = snap.docs[0].id;
      } else {
          student = studentDoc.data();
      }

      // Get Config
      const configDoc = await getDoc(doc(db, 'schoolConfig', 'main'));
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
          status = timeStr < config.departureTime ? 'PULANG CEPAT' : 'PULANG TEPAT WAKTU';
      }

      // Save Presence
      await addDoc(collection(db, 'schoolPresence'), {
          studentId: studentIdToUse,
          studentName: student.name,
          className: student.className,
          type,
          timestamp: Timestamp.now(),
          status,
          ...(lateTime && { lateTime })
      });

      // Notify Parents & Homeroom Teacher if Late
      if (status === 'TERLAMBAT') {
          // Notify Homeroom Teacher
          const teacherQuery = query(collection(db, 'teachers'), where('className', '==', student.className));
          const teacherSnap = await getDocs(teacherQuery);
          if (!teacherSnap.empty) {
             const homeroomTeacher = teacherSnap.docs[0].data();
             await addDoc(collection(db, 'notifications'), {
                targetUserId: homeroomTeacher.uid,
                message: `Perhatian: Siswa ${student.name} (Kelas ${student.className}) terlambat datang.`,
                title: 'Siswa Terlambat',
                read: false,
                type: 'ATTENDANCE_LATE',
                createdAt: Timestamp.now()
             });
          }
      }

      // Notify via WhatsApp (using saved whatsapp settings)
      const waConfigDoc = await getDoc(doc(db, 'systemSettings', 'whatsappConfig'));
      if (waConfigDoc.exists()) {
          const waSettings = waConfigDoc.data();
          const message = status === 'TERLAMBAT' 
              ? `Perhatian: ${student.name} dari kelas ${student.className} terlambat masuk sekolah. Jam scan: ${timeStr}`
              : `Halo, ${student.name} dari kelas ${student.className} telah melakukan scan ${type}. Status: ${status}. Jam: ${timeStr}`;
          
          await fetch(waSettings.apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${waSettings.apiKey}` },
              body: JSON.stringify({
                  to: student.parentPhone,
                  message: message,
                  sender: waSettings.senderNumber
              })
          }).catch(e => console.error("WhatsApp failed", e));
      }
      
      // Notify via Dashboard (notifications collection)
       await addDoc(collection(db, 'notifications'), {
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
      await addDoc(collection(db, 'notifications'), {
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
