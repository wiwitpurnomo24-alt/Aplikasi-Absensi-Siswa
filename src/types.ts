/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Student {
  id: string;
  nis: string;
  nisn: string;
  name: string;
  className: string;
  absensiNo?: string;
  gender: 'L' | 'P';
  parentPassword?: string;
  userId?: string;
  password?: string;
}

export interface StudentPII {
  studentId: string;
  dateOfBirth: string; // ISO date string
  address: string;
}

export interface Teacher {
  id: string;
  name: string;
  nip: string;
  className: string;
  phoneNumber?: string;
  password?: string;
  status?: string[];
  subjects?: string[];
  taughtClasses?: string[];
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  date: string;
  day: string;
  parentName: string;
  parentPhone: string;
  address: string;
  type: 'Sakit' | 'Izin' | 'Dispensasi' | 'Alpa';
  reason: string;
  documentUrl?: string; // New field for uploaded document (base64 or URL)
  documentName?: string;
  additionalInfo?: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  source?: 'App' | 'WhatsApp';
  submittedAt: any;
  status: 'Pending' | 'Approved' | 'Rejected';
  statusReason?: string;
  processedAt?: any;
  processedBy?: string;
}

export interface SchoolData {
  id?: string;
  pemda: string;
  dinas: string;
  sekolah: string;
  alamat: string;
  kota: string;
  kepalaSekolah: string;
  nipKepalaSekolah: string;
  logoUrl?: string; // App Logo (Dutatama)
  schoolLogoUrl?: string; // School Logo (SMPN)
}

export interface SchoolClass {
  id: string;
  name: string;
  color?: string;
  icon?: string;
}

export interface AcademicYear {
  id: string;
  year: string; // e.g., "2023/2024"
  active: boolean;
}

export type UserRole = 'PARENT' | 'TEACHER' | 'ADMIN' | 'COUNSELOR' | 'SUBJECT_TEACHER' | 'STUDENT' | 'KEPALA_SEKOLAH' | 'WAKIL_KEPALA_SEKOLAH' | 'PETUGAS_ABSEN_KELAS';

export interface SubjectAttendance {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  subjectName: string;
  teacherName: string;
  date: string;
  period: string;
  status: 'S' | 'I' | 'D' | 'A' | 'H';
  notes?: string;
  createdAt: any;
}

export interface SubjectTeacherInquiry {
  id: string;
  subjectTeacherName: string;
  subjectTeacherId?: string;
  subjectName: string;
  className: string;
  studentId: string;
  studentName: string;
  date: string;
  day: string;
  time: string;
  period?: string;
  status: 'Menunggu' | 'Sudah di Jawab' | 'Dijawab';
  message: string;
  response?: string;
  respondedBy?: string;
  respondedAt?: any;
  replies?: {
    message: string;
    sender: string;
    createdAt: any;
  }[];
  createdAt: any;
  category?: 'Pertanyaan' | 'Konfirmasi';
}

export interface AttendanceAlert {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  alertType: 'consecutive' | 'total';
  details: string; // "Tidak hadir 3 hari berturut-turut"
  createdAt: any;
  status: 'active' | 'resolved'; // 'active' means alert is unread/unaddressed
  resolvedAt?: any;
  resolvedBy?: string;
}

export interface UserProfile {
  uid: string;
  role: UserRole; // Currently active role
  roles: UserRole[]; // All available roles
  nis?: string;
  nip?: string;
  email?: string;
  name: string;
  className?: string; // For parents and teachers
  managedClasses?: string[]; // For counselors
  subject?: string; // For subject teachers
}
