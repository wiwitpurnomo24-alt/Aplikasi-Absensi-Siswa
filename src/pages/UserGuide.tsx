import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  ShieldCheck, 
  Users, 
  BookOpen, 
  UserSquare2, 
  UsersRound, 
  ClipboardCheck,
  ChevronRight,
  Book,
  School,
  CheckCircle2,
  GraduationCap,
  Globe,
  Smartphone
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

type GuideRole = 
  | 'akses_instalasi'
  | 'admin' 
  | 'wali_kelas' 
  | 'guru_mapel' 
  | 'wali_merangkap' 
  | 'orang_tua' 
  | 'petugas_absen'
  | 'guru_bk';

interface GuideData {
  id: GuideRole;
  title: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  sections: {
    title: string;
    content: string[];
  }[];
}

const guides: GuideData[] = [
  {
    id: 'akses_instalasi',
    title: 'Akses & Instalasi',
    icon: <Globe size={24} />,
    color: 'text-sky-600',
    bgColor: 'bg-sky-50',
    sections: [
      {
        title: 'Link Aplikasi',
        content: [
          'Aplikasi dapat diakses melalui link resmi: https://ais-pre-fgjhyr5umdhojhzdasfkzz-16805158668.asia-east1.run.app',
          'Pastikan Anda menggunakan akun yang telah didaftarkan oleh Administrator untuk dapat mengakses fitur penuh.',
          'Bagikan link ini kepada guru, wali murid, dan petugas yang berkepentingan.'
        ]
      },
      {
        title: 'Instalasi di PC / Laptop',
        content: [
          'Buka browser Google Chrome atau Microsoft Edge di komputer Anda.',
          'Kunjungi alamat link aplikasi di atas.',
          'Klik ikon "Install" (tanda + di dalam kotak) yang muncul di pojok kanan Address Bar browser.',
          'Atau pilih menu titik tiga (Chrome) > Save and Share > Install page as app...',
          'Aplikasi akan muncul sebagai pintasan di Desktop dan Taskbar (seperti aplikasi terinstall).'
        ]
      },
      {
        title: 'Instalasi di Smartphone (HP)',
        content: [
          'Buka browser (Chrome/Safari/Samsung Internet) di HP Anda.',
          'Kunjungi alamat link aplikasi di atas.',
          'Android (Chrome): Klik titik tiga di pojok kanan atas, lalu pilih "Instal Aplikasi" atau "Tambah ke Layar Utama".',
          'iOS/iPhone (Safari): Klik tombol "Share" (kotak dengan panah ke atas) di bagian bawah, lalu scroll dan pilih "Add to Home Screen".',
          'Ikon aplikasi akan muncul di layar utama HP Anda dan dapat diakses tanpa perlu mengetik link lagi.'
        ]
      }
    ]
  },
  {
    id: 'admin',
    title: 'Administrator',
    icon: <ShieldCheck size={24} />,
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
    sections: [
      {
        title: 'Manajemen Data Utama',
        content: [
          'Mengelola data siswa, guru, dan admin melalui menu pengelolaan akun.',
          'Import data dalam jumlah banyak menggunakan file Excel (.xlsx).',
          'Mengatur struktur kelas, mata pelajaran, dan penugasan wali kelas serta guru mapel.',
        ]
      },
      {
        title: 'Manajemen Absensi & Notifikasi',
        content: [
          'Melihat dashboard statistik kehadiran seluruh sekolah secara real-time.',
          'Mengelola integrasi WhatsApp Gateway pada menu "Pengaturan" untuk notifikasi wali murid.',
          'Memvalidasi absensi dan catatan ketidakhadiran jika dipusatkan pada Admin.'
        ]
      },
      {
        title: 'Keamanan & Backup',
        content: [
          'Mengoperasikan menu Backup & Restore Data untuk pencadangan rutin.',
          'Memantau ukuran file storage dan foto profil untuk menjaga kuota sistem.',
          'Mencetak ID Card dan QR Code Login untuk pengguna yang membutuhkan.'
        ]
      }
    ]
  },
  {
    id: 'wali_kelas',
    title: 'Wali Kelas',
    icon: <Users size={24} />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    sections: [
      {
        title: 'Tugas Utama',
        content: [
          'Memantau ketidakhadiran (Sakit, Izin, Alpha) siswa di kelas yang diampunya.',
          'Melakukan approval (persetujuan) atas pengajuan absensi yang dikirim oleh orang tua / petugas.',
        ]
      },
      {
        title: 'Pelaporan Kelas',
        content: [
          'Melihat dan mengekspor Laporan Absensi Kelas (Harian, Mingguan, Bulanan).',
          'Mengirim laporan rekap kehadiran ke wali murid secara berkala jika diperlukan.',
        ]
      }
    ]
  },
  {
    id: 'guru_mapel',
    title: 'Guru Mata Pelajaran',
    icon: <BookOpen size={24} />,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    sections: [
      {
        title: 'Melakukan Presensi',
        content: [
          'Mendata kehadiran siswa pada jam pelajaran berlangsung berdasarkan kelas yang diajar.',
          'Menggunakan fitur Scan QR Code untuk konfirmasi kehadiran secara cepat.',
        ]
      },
      {
        title: 'Rekap Pembelajaran',
        content: [
          'Melihat hasil kehadiran siswa per mata pelajaran sebagai bahan evaluasi kedisiplinan dan partisipasi kelas.',
          'Mencetak laporan per semester sesuai format yang disediakan sekolah.'
        ]
      }
    ]
  },
  {
    id: 'wali_merangkap',
    title: 'Wali Kelas & Guru Mapel',
    icon: <UserSquare2 size={24} />,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    sections: [
      {
        title: 'Dual-Role Dashboard',
        content: [
          'Akses berbagai fitur dari satu dashboard: Anda dapat melihat tab "Absensi Mapel" sekaligus tab "Tugas Wali Kelas".',
          'Gunakan Switcher peran (jika ada) untuk beralih mode dengan cepat.',
        ]
      },
      {
        title: 'Pengelolaan Efektif',
        content: [
          'Lakukan presensi jam pelajaran seperti biasa untuk kelas manapun yang sedang diajar.',
          'Pada waktu khusus, periksa pengajuan izin absen untuk kelas perwalian Anda dan lakukan konfirmasi.',
        ]
      }
    ]
  },
  {
    id: 'orang_tua',
    title: 'Orang Tua / Wali',
    icon: <UsersRound size={24} />,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    sections: [
      {
        title: 'Mengirim Pengajuan Izin',
        content: [
          'Login menggunakan Nomor Induk Siswa (NIS) atau akun yang diberikan.',
          'Masuk ke menu Absensi, pilih alasan (Sakit, Izin), dan lampirkan dokumen (surat dokter/foto bukti).',
        ]
      },
      {
        title: 'Pemantauan Kehadiran',
        content: [
          'Melihat statistik kehadiran anak untuk setiap bulan dan semester.',
          'Menerima notifikasi otomatis (jika aktif) setiap pengajuan absen disetujui, atau jika anak tidak hadir saat mata pelajaran.',
        ]
      }
    ]
  },
  {
    id: 'petugas_absen',
    title: 'Petugas Absensi Kelas',
    icon: <ClipboardCheck size={24} />,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    sections: [
      {
        title: 'Akses Sistem',
        content: [
          'Login menggunakan akun yang diberikan oleh Wali Kelas atau Administrator.',
          'Fitur terbatas hanya untuk kelas Anda sendiri.',
        ]
      },
      {
        title: 'Tugas Rutin',
        content: [
          'Mencatat siswa yang tidak hadir pada sesi awal kelas apabila guru berhalangan mengisi.',
          'Mendaftarkan pengajuan sakit/izin berdasarkan info sementara, yang nantinya tetap membutuhkan validasi dari Wali Kelas.',
        ]
      }
    ]
  },
  {
    id: 'guru_bk',
    title: 'Guru BK / Konselor',
    icon: <GraduationCap size={24} />,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    sections: [
      {
        title: 'Pemantauan Absensi',
        content: [
          'Melihat dashboard statistik kehadiran seluruh siswa untuk memantau tren kedisiplinan.',
          'Mengidentifikasi siswa dengan frekuensi ketidakhadiran (Alpha) yang tinggi secara otomatis.',
          'Mengakses riwayat absensi individual siswa secara mendalam sebagai bahan pembinaan.'
        ]
      },
      {
        title: 'Tindak Lanjut & Konseling',
        content: [
          'Memberikan catatan atau rekomendasi tindak lanjut pada sistem berdasarkan data absensi.',
          'Bekerja sama dengan Wali Kelas dalam menangani kasus ketidakhadiran siswa yang kronis.',
          'Mengevaluasi efektivitas pembinaan terhadap perubahan perilaku kehadiran siswa.'
        ]
      }
    ]
  }
];

export default function UserGuide() {
  const navigate = useNavigate();
  const [activeGuide, setActiveGuide] = useState<GuideRole>('akses_instalasi');

  const currentGuideData = guides.find(g => g.id === activeGuide)!;

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                <Book size={18} />
              </div>
              <div>
                <h1 className="font-bold text-gray-900 leading-tight">Panduan Penggunaan</h1>
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Sistem Administrasi Absensi</p>
              </div>
            </div>
          </div>
          
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors rounded-xl font-bold text-xs uppercase tracking-widest"
          >
            Halaman Login
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex flex-col lg:flex-row gap-8">
        
        {/* Sidebar Nav */}
        <aside className="w-full lg:w-72 shrink-0">
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 sticky top-28">
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest px-4 mb-4">Pilih Peran Pengguna</h2>
            <nav className="space-y-2">
              {guides.map((guide) => {
                const isActive = activeGuide === guide.id;
                return (
                  <button
                    key={guide.id}
                    onClick={() => setActiveGuide(guide.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-200",
                      isActive 
                        ? cn(guide.bgColor, guide.color, "font-bold shadow-sm ring-1 ring-inset ring-current/10") 
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-1.5 rounded-xl", 
                        isActive ? "bg-white shadow-sm" : "bg-gray-100"
                      )}>
                        {React.cloneElement(guide.icon as any, { size: 18 })}
                      </div>
                      <span className="text-sm">{guide.title}</span>
                    </div>
                    {isActive && <ChevronRight size={16} />}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeGuide}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100"
            >
              {/* Header Role */}
              <div className={cn("px-8 py-10", currentGuideData.bgColor)}>
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                  <div className={cn("w-20 h-20 rounded-2xl bg-white shadow-lg flex items-center justify-center shrink-0", currentGuideData.color)}>
                    {React.cloneElement(currentGuideData.icon as any, { size: 40 })}
                  </div>
                  <div>
                    <h2 className={cn("text-3xl font-extrabold tracking-tight mb-2", currentGuideData.color)}>
                      {currentGuideData.title}
                    </h2>
                    <p className="text-sm font-medium text-gray-600">
                      Panduan operasional dan fitur lengkap untuk peran {currentGuideData.title.bold()} dalam sistem aplikasi kehadiran sekolah terpadu ini.
                    </p>
                  </div>
                </div>
              </div>

              {/* Detail Content */}
              <div className="p-8 space-y-10">
                {currentGuideData.sections.map((section, idx) => (
                  <div key={idx} className="relative">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-3">
                      <span className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-full text-sm font-black",
                        currentGuideData.bgColor, currentGuideData.color
                      )}>
                        {idx + 1}
                      </span>
                      {section.title}
                    </h3>
                    
                    <div className="ml-11 space-y-4">
                      {section.content.map((item, itemIdx) => (
                        <div key={itemIdx} className="flex items-start gap-3">
                          <CheckCircle2 size={18} className={cn("shrink-0 mt-0.5", currentGuideData.color)} />
                          <p className="text-gray-600 leading-relaxed text-sm">
                            {item}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

            </motion.div>
          </AnimatePresence>
          
          <div className="mt-8 text-center">
             <p className="text-sm text-gray-400">
                Membutuhkan informasi lebih lanjut? Silakan hubungi koordinator IT.
             </p>
          </div>
        </div>

      </main>
    </div>
  );
}
