/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import Layout from './components/Layout';
import Loading from './components/Loading';
import RoleGuard from './components/RoleGuard';

// Lazy loading pages for better performance
const Login = lazy(() => import('./pages/Login'));
const ParentDashboard = lazy(() => import('./pages/ParentDashboard'));
const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AttendanceOfficerDashboard = lazy(() => import('./pages/AttendanceOfficerDashboard'));
const SubjectTeacherDashboard = lazy(() => import('./pages/SubjectTeacherDashboard'));

export default function App() {
  return (
    <Router>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/login" replace />} />
            <Route 
              path="parent" 
              element={
                <RoleGuard allowedRoles={['PARENT', 'ADMIN', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH']}>
                  <ParentDashboard />
                </RoleGuard>
              } 
            />
            <Route 
              path="teacher" 
              element={
                <RoleGuard allowedRoles={['TEACHER', 'ADMIN', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH']}>
                  <TeacherDashboard />
                </RoleGuard>
              } 
            />
            <Route 
              path="subject-teacher" 
              element={
                <RoleGuard allowedRoles={['SUBJECT_TEACHER', 'ADMIN', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH']}>
                  <SubjectTeacherDashboard />
                </RoleGuard>
              } 
            />
            <Route 
              path="admin" 
              element={
                <RoleGuard allowedRoles={['ADMIN', 'COUNSELOR', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH']}>
                  <AdminDashboard />
                </RoleGuard>
              } 
            />
            <Route 
              path="attendance-officer" 
              element={
                <RoleGuard allowedRoles={['ADMIN', 'TEACHER', 'COUNSELOR', 'STUDENT', 'KEPALA_SEKOLAH', 'WAKIL_KEPALA_SEKOLAH']}>
                  <AttendanceOfficerDashboard />
                </RoleGuard>
              } 
            />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}


