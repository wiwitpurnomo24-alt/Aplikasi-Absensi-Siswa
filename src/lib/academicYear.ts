import { db } from './firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getTenantCollection, getTenantDoc } from './tenant';

export async function getActiveAcademicYear() {
  const q = query(getTenantCollection('academicYears'), where('active', '==', true));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}
