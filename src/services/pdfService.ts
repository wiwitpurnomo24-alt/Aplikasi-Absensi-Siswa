import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import QRCode from 'qrcode';
import { formatDate } from '../lib/utils';
import { SchoolData, AcademicYear } from '../types';

export const generateQRCodeDataUrl = async (text: string) => {
  try {
    return await QRCode.toDataURL(text, { margin: 1, scale: 10 });
  } catch (err) {
    console.error(err);
    return '';
  }
};

export const exportAttendanceToPDF = (
  recapData: any[], 
  daysArray: number[], 
  monthName: string, 
  selectedClass: string, 
  schoolData: SchoolData | null, 
  academicYear: string
) => {
  const doc = new jsPDF('l', 'mm', 'a3');

  if (schoolData) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(schoolData.pemda.toUpperCase(), doc.internal.pageSize.width / 2, 15, { align: 'center' });
    doc.text(schoolData.dinas.toUpperCase(), doc.internal.pageSize.width / 2, 22, { align: 'center' });
    doc.setFontSize(18);
    doc.text(schoolData.sekolah.toUpperCase(), doc.internal.pageSize.width / 2, 30, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(schoolData.alamat, doc.internal.pageSize.width / 2, 37, { align: 'center' });
    doc.setLineWidth(1);
    doc.line(20, 42, doc.internal.pageSize.width - 20, 42);
    doc.setLineWidth(0.5);
    doc.line(20, 43, doc.internal.pageSize.width - 20, 43);
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`LAPORAN ABSENSI BULAN ${monthName?.toUpperCase()}`, doc.internal.pageSize.width / 2, 55, { align: 'center' });
  doc.text(`TAHUN AJARAN ${academicYear || '-'}`, doc.internal.pageSize.width / 2, 62, { align: 'center' });
  
  doc.setFontSize(11);
  doc.text(`KELAS : ${selectedClass === 'All' ? 'SEMUA KELAS' : selectedClass}`, 20, 75);

  const headers = [
    ['No', 'NIS', 'Nama Siswa', 'L/P', ...daysArray.map(String), 'S', 'I', 'A', 'D']
  ];

  const body = recapData.map((student, index) => [
    index + 1,
    student.nis,
    student.name,
    student.gender,
    ...daysArray.map(day => student.dayMap[day] || '-'),
    student.totals.s,
    student.totals.i,
    student.totals.a,
    student.totals.d
  ]);

  (doc as any).autoTable({
    head: headers,
    bodyStyles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185], halign: 'center', valign: 'middle' },
    body: body,
    startY: 90,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', halign: 'center' },
    columnStyles: {
      2: { halign: 'left', cellWidth: 50 },
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY + 15;
  const pageWidth = doc.internal.pageSize.width;

  doc.setFontSize(10);
  doc.text('Mengetahui,', 40, finalY);
  doc.text('Kepala Sekolah', 40, finalY + 7);
  doc.text(schoolData?.kepalaSekolah || '................................', 40, finalY + 35);
  doc.text(`NIP. ${schoolData?.nipKepalaSekolah || '................................'}`, 40, finalY + 42);

  doc.text(`${schoolData?.kota || 'Kota'}, ${formatDate(new Date())}`, pageWidth - 60, finalY);
  doc.text('Wali Kelas', pageWidth - 60, finalY + 7);
  doc.text('................................', pageWidth - 60, finalY + 35);
  doc.text('NIP. ................................', pageWidth - 60, finalY + 42);

  doc.save(`Rekap_Absensi_${monthName}_${selectedClass}.pdf`);
};

export const printStudentCard = async (student: any, schoolInfo: any) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [54, 85.6]
    });
    
    const qrCodeDataUrl = await generateQRCodeDataUrl(student.id || student.nis);
    
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, 54, 15, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("KARTU ABSENSI SISWA", 27, 7, { align: 'center' });
    doc.setFontSize(6);
    doc.text(schoolInfo?.sekolah || 'SMP NASIONAL', 27, 11, { align: 'center' });

    if (qrCodeDataUrl) {
      doc.addImage(qrCodeDataUrl, 'PNG', 7, 18, 40, 40);
    }

    doc.setTextColor(150, 150, 150);
    doc.setFontSize(5);
    doc.text("SCAN UNTUK ABSENSI", 27, 62, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text("NAMA SISWA:", 27, 68, { align: 'center' });
    doc.setFontSize(9);
    doc.text((student.name || '').toUpperCase(), 27, 73, { align: 'center', maxWidth: 48 });
    
    doc.setFontSize(6);
    doc.text("KELAS:", 27, 79, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(30, 64, 175);
    doc.text(student.className || '-', 27, 83, { align: 'center' });

    doc.save(`Kartu_Absen_${student.name}.pdf`);
};
