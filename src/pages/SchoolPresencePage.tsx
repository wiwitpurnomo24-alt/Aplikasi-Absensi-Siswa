// Force rebuild again
import React from 'react';
import { SchoolPresenceDashboard } from '../components/SchoolPresenceDashboard';
import { ScannerStatus } from '../components/ScannerStatus';

export default function SchoolPresencePage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-black text-gray-800">Kehadiran Siswa</h2>
          <p className="text-sm text-gray-500 font-medium">Monitoring & Scan Kehadiran Harian</p>
        </div>
        <div className="w-48">
          <ScannerStatus />
        </div>
      </div>
      <SchoolPresenceDashboard />
    </div>
  );
}
