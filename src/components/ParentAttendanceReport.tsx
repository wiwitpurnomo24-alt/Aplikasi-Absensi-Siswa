import React, { useMemo } from 'react';
import { AttendanceRecord, Student } from '../types';
import { FileText, Download, Calendar } from 'lucide-react';
import { formatDate } from '../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ParentAttendanceReportProps {
  student: Student;
  history: AttendanceRecord[];
}

export const ParentAttendanceReport: React.FC<ParentAttendanceReportProps> = ({ student, history }) => {
  const downloadReportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Laporan Absensi: ${student.name}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Kelas: ${student.className} | NIS: ${student.nis}`, 14, 26);
    
    const body = history.map((h, idx) => [
      idx + 1,
      formatDate(new Date(h.date)),
      h.type,
      h.status === 'Approved' ? 'Diterima' : h.status === 'Rejected' ? 'Ditolak' : 'Pending',
      h.reason
    ]);

    autoTable(doc, {
      startY: 35,
      head: [['No', 'Tanggal', 'Jenis', 'Status', 'Alasan']],
      body: body,
      theme: 'grid',
    });

    doc.save(`Laporan_Absensi_${student.name.replace(/\s+/g, '_')}.pdf`);
  };

  const stats = useMemo(() => {
    return history.reduce((acc, h) => {
      acc[h.type] = (acc[h.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [history]);

  return (
    <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 text-blue-700 rounded-2xl">
            <FileText size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Laporan Absensi Anak</h3>
            <p className="text-sm text-gray-500">Ringkasan riwayat dan statistik</p>
          </div>
        </div>
        <button 
          onClick={downloadReportPDF}
          className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg"
        >
          <Download size={16} /> Unduh PDF
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(stats).map(([type, count]) => (
          <div key={type} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <p className="text-[10px] font-black text-gray-400 uppercase">{type}</p>
            <p className="text-2xl font-black text-gray-900">{count}</p>
          </div>
        ))}
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-black text-gray-400 uppercase">
              <th className="p-3">Tanggal</th>
              <th className="p-3">Jenis</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {history.map(item => (
              <tr key={item.id} className="text-sm">
                <td className="p-3 font-bold">{formatDate(new Date(item.date))}</td>
                <td className="p-3">{item.type}</td>
                <td className="p-3 font-bold">{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
