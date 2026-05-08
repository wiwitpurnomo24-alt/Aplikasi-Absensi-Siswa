import { collection, doc } from 'firebase/firestore';
import { db } from './firebase';

export const getSchoolCode = () => {
    // Only works on client
    if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('school_user');
        if (stored) {
            try {
                const user = JSON.parse(stored);
                if (user.schoolId) return user.schoolId;
            } catch(e) {}
        }
    }
    return 'default'; // fallback
};

export const getTenantCollection = (collectionName: string) => {
    const schoolId = getSchoolCode();
    // For collections that remain global:
    if (collectionName === 'users' || collectionName === 'admins' || collectionName === 'test') {
        return collection(db, collectionName);
    }
    
    // If schoolId is 'default', use root collection (LEGACY/RESTORE)
    if (schoolId === 'default') {
        return collection(db, collectionName);
    }
    
    return collection(db, 'schools', schoolId, collectionName);
};

export const getTenantDoc = (collectionName: string, docId?: string) => {
    const schoolId = getSchoolCode();
    
    if (collectionName === 'users' || collectionName === 'admins' || collectionName === 'test') {
        if (docId) return doc(db, collectionName, docId);
        return doc(collection(db, collectionName));
    }

    // If schoolId is 'default', use root document (LEGACY/RESTORE)
    if (schoolId === 'default') {
        if (docId) return doc(db, collectionName, docId);
        return doc(collection(db, collectionName));
    }

    if (docId) {
        return doc(db, 'schools', schoolId, collectionName, docId);
    } else {
        return doc(collection(db, 'schools', schoolId, collectionName));
    }
};
