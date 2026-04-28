import { useState, useEffect } from 'react';
import { db, handleFirestoreError } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Calendar } from 'lucide-react';
import { useAuthStore } from '../lib/auth-store';

export default function ActiveAcademicYearDisplay() {
  const { user } = useAuthStore();
  const [activeYear, setActiveYear] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'academicYears'), where('active', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setActiveYear(snapshot.docs[0].data());
      } else {
        setActiveYear(null);
      }
    }, (err) => {
      handleFirestoreError(err, 'list', 'academicYears');
    });
    return unsubscribe;
  }, [user]);

  if (!activeYear) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full shadow-sm">
      <Calendar size={12} className="text-blue-600" />
      <span className="text-[10px] font-extrabold whitespace-nowrap">
        TA: {activeYear.year}
      </span>
    </div>
  );
}
