import { collection } from 'firebase/firestore';
import { db } from './src/lib/firebase';
import { getTenantCollection } from './src/lib/tenant';

// Mock localStorage
globalThis.localStorage = {
  getItem: () => JSON.stringify({ schoolId: 'demo1' })
} as any;
globalThis.window = {} as any;

console.log(getTenantCollection('academicYears').path);
