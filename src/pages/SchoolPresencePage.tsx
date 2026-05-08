import React, { useState } from 'react';
import { SchoolPresenceDashboard } from '../components/SchoolPresenceDashboard';
import { ScannerStatus } from '../components/ScannerStatus';
import { Book, X, ChevronRight, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function SchoolPresencePage() {
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-black text-gray-800">Kehadiran / Kepulangan Siswa</h2>
          <p className="text-sm text-gray-500 font-medium">Monitoring & Scan Kehadiran Harian</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors rounded-xl font-bold text-xs uppercase tracking-widest border border-blue-200"
          >
            <Book size={16} />
            Panduan Fitur Ini
          </button>
          <div className="w-48">
            <ScannerStatus />
          </div>
        </div>
      </div>
      <SchoolPresenceDashboard />

      {/* Guide Modal */}
      <AnimatePresence>
        {showGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                    <Book size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">PANDUAN KEHADIRAN / KEPULANGAN SISWA</h2>
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">Tata Cara Penggunaan Fitur</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowGuide(false)}
                  className="p-2 text-gray-400 hover:bg-gray-200 hover:text-gray-700 rounded-xl transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Content */}
              <div className="p-8 overflow-y-auto space-y-8">
                {/* Intro */}
                <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100">
                  <p className="text-sm font-medium text-blue-900 leading-relaxed">
                    Fitur <strong>Kehadiran / Kepulangan Siswa</strong> digunakan untuk mendata log kehadiran dan kepulangan siswa secara harian. Mode input mendukung pemindaian mandiri maupun input manual.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  {/* Step 1 */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-black flex items-center justify-center text-sm">1</div>
                      <h3 className="text-base font-bold text-gray-900">Scan QR Code Mandiri</h3>
                    </div>
                    <div className="pl-11 space-y-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-gray-600">Pastikan kamera pemindai (scanner) aktif. Perhatikan status &apos;Siap Scan&apos; di pojok kanan atas.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-gray-600">Arahkan ID Card Siswa ke kamera, maka sistem akan secara otomatis mencatat <strong>Kehadiran</strong> atau <strong>Kepulangan</strong> berdasarkan jam.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-gray-600">Notifikasi suara akan muncul sebagai penanda bahwa pemindaian berhasil.</p>
                      </div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-sm">2</div>
                      <h3 className="text-base font-bold text-gray-900">Input Manual per Siswa</h3>
                    </div>
                    <div className="pl-11 space-y-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-gray-600">Berada di tab <strong>Data Harian</strong>, Anda dapat memilih Kelas secara spesifik menggunakan filter dropdown.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-gray-600">Temukan nama siswa di kolom pencarian atau di dalam daftar, lalu klik ikon <strong>Hadir</strong> (Tepat Waktu) atau <strong>Scan Ulang</strong> pada kolom jam Datang/Pulang.</p>
                      </div>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-black flex items-center justify-center text-sm">3</div>
                      <h3 className="text-base font-bold text-gray-900">Mengelola Status</h3>
                    </div>
                    <div className="pl-11 space-y-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="text-purple-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-gray-600">Gunakan tab <strong>Hadir</strong>, <strong>Sakit/Izin</strong>, <strong>Terlambat</strong> untuk mengkategorikan data.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="text-purple-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-gray-600">Klik ikon tempat sampah berwarna merah untuk membatalkan atau mereset status presensi apabila ada kesalahan input.</p>
                      </div>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-black flex items-center justify-center text-sm">4</div>
                      <h3 className="text-base font-bold text-gray-900">Laporan Rekapitulasi</h3>
                    </div>
                    <div className="pl-11 space-y-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-gray-600">Beralih ke tab <strong>Rekap Bulanan</strong> atau <strong>Rekap Semester</strong> untuk melihat total kehadiran siswa.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-gray-600">Tersedia tombol <strong>Download PDF</strong> atau <strong>Excel</strong> untuk mencetak kumpulan data absensi tersebut.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-5 border-t border-gray-100 bg-gray-50 flex justify-end">
                <button
                  onClick={() => setShowGuide(false)}
                  className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm tracking-wide hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200"
                >
                  Tutup Panduan
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
