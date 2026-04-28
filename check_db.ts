import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { readFileSync } from 'fs';

const firebaseConfig = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function check() {
  const collections = ['students', 'attendance', 'classes', 'teachers', 'schoolData'];
  for (const c of collections) {
    const snap = await getDocs(collection(db, c));
    console.log(`${c} count: ${snap.size}`);
  }
}
check();
