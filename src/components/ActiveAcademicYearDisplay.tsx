import { useState, useEffect } from 'react';
import { db, handleFirestoreError } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Calendar } from 'lucide-react';
import { useAuthStore } from '../lib/auth-store';
import { getTenantCollection, getTenantDoc } from '../lib/tenant';

export default function ActiveAcademicYearDisplay() {
  const { user } = useAuthStore();
  const [activeYear, setActiveYear] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(getTenantCollection('academicYears'), where('active', '==', true));
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
    <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-blue-50 to-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl shadow-sm">
      <Calendar size={14} className="text-indigo-400" />
      <span className="text-xs font-black whitespace-nowrap uppercase tracking-widest">
        TA: {activeYear.year}
      </span>
    </div>
  );
}
