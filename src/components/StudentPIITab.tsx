import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, query, where } from 'firebase/firestore';
import { Student } from '../types';
import { Save, AlertCircle } from 'lucide-react';

export default function StudentPIITab({ students }: { students: Student[] }) {
  const [studentPII, setStudentPII] = useState<any>({});
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPII();
  }, []);

  const fetchPII = async () => {
    try {
      const snap = await getDocs(collection(db, 'student_pii'));
      const pii: any = {};
      snap.docs.forEach(doc => {
        pii[doc.data().studentId] = doc.data();
      });
      setStudentPII(pii);
    } catch (err) {
      handleFirestoreError(err, 'list', 'student_pii');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    setLoading(true);
    try {
      await setDoc(doc(db, 'student_pii', selectedStudent), {
        studentId: selectedStudent,
        dateOfBirth: dob,
        address: address
      });
      alert('Data PII berhasil disimpan!');
      fetchPII();
    } catch (err) {
      handleFirestoreError(err, 'write', 'student_pii');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <AlertCircle className="text-red-500" /> Manajemen PII Siswa (Data Sensitif)
        </h2>
        <form onSubmit={handleSave} className="space-y-4">
          <select 
            value={selectedStudent} 
            onChange={(e) => {
              setSelectedStudent(e.target.value);
              setDob(studentPII[e.target.value]?.dateOfBirth || '');
              setAddress(studentPII[e.target.value]?.address || '');
            }}
            className="w-full p-3 border border-gray-200 rounded-xl"
            required
          >
            <option value="">Pilih Siswa...</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.className})</option>)}
          </select>
          <input type="date" value={dob} onChange={e => setDob(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl" placeholder="Tanggal Lahir" required />
          <textarea value={address} onChange={e => setAddress(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl" placeholder="Alamat" required />
          <button type="submit" disabled={loading} className="w-full flex justify-center items-center gap-2 bg-blue-600 text-white p-3 rounded-xl font-bold hover:bg-blue-700">
            <Save size={18} /> Simpan PII
          </button>
        </form>
      </div>
    </div>
  );
}
