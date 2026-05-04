import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../lib/auth-store';
import { UserRole } from '../types';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export default function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const { user } = useAuthStore();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    // Redirect to their own dashboard if they don't have access
    const defaultPath = user.role === 'ADMIN' || user.role === 'KEPALA_SEKOLAH' || user.role === 'WAKIL_KEPALA_SEKOLAH' || user.role === 'COUNSELOR' ? '/admin' : user.role === 'TEACHER' ? '/teacher' : user.role === 'PETUGAS_ABSEN_KELAS' ? '/attendance-officer' : user.role === 'SUBJECT_TEACHER' ? '/subject-teacher' : '/parent';
    return <Navigate to={defaultPath} replace />;
  }

  return <>{children}</>;
}
