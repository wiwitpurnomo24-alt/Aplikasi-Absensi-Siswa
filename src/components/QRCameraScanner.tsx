import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { X, Camera, RefreshCw } from 'lucide-react';

interface QRCameraScannerProps {
    onScan: (decodedText: string) => void;
    onClose: () => void;
}

export const QRCameraScanner: React.FC<QRCameraScannerProps> = ({ onScan, onClose }) => {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [cameraList, setCameraList] = useState<any[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string>("");

    useEffect(() => {
        const scannerId = "qr-reader";
        let isStopped = false;
        let html5QrCode: Html5Qrcode | null = null;
        
        const initScanner = async () => {
            // Give extra time for DOM and camera hardware to stabilize
            await new Promise(resolve => setTimeout(resolve, 1500));
            if (isStopped) return;

            try {
                // Ensure any previous instance is stopped if it somehow survived
                if (html5QrCode) {
                   try { await html5QrCode.stop(); } catch(e) {}
                }

                const cameras = await Html5Qrcode.getCameras();
                setCameraList(cameras);
                
                if (cameras && cameras.length > 0) {
                    html5QrCode = new Html5Qrcode(scannerId);
                    scannerRef.current = html5QrCode;
                    
                    const qrConfig = { 
                        fps: 15, 
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0,
                        disableFlip: false
                    };
                    
                    // Priority: Environment facing mode (most robust for mobile)
                    try {
                        await html5QrCode.start(
                            { facingMode: "environment" }, 
                            qrConfig,
                            (decodedText) => {
                                onScan(decodedText);
                                if (navigator.vibrate) navigator.vibrate(100);
                            },
                            undefined
                        );
                        if (!isStopped) {
                            setIsScanning(true);
                            // Identify which camera we actually used
                            const activeCamera = cameras.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear'));
                            setSelectedCameraId(activeCamera ? activeCamera.id : cameras[0].id);
                        }
                    } catch (envErr) {
                        console.warn("Environment camera failed, trying by deviceId", envErr);
                        
                        // Fallback: Try by deviceId
                        const backCamera = cameras.find(c => 
                            c.label.toLowerCase().includes('back') || 
                            c.label.toLowerCase().includes('rear') ||
                            c.label.toLowerCase().includes('environment')
                        );
                        
                        const cameraId = backCamera ? backCamera.id : cameras[0].id;
                        setSelectedCameraId(cameraId);

                        await html5QrCode.start(
                            cameraId, 
                            qrConfig,
                            (decodedText) => {
                                onScan(decodedText);
                                if (navigator.vibrate) navigator.vibrate(100);
                            },
                            undefined
                        );
                        if (!isStopped) setIsScanning(true);
                    }
                } else {
                    setError("Tidak ada kamera yang ditemukan. Jika Anda menggunakan ponsel, pastikan izin kamera diaktifkan.");
                }
            } catch (err: any) {
                console.error("Scanner setup error", err);
                setError(`Terjadi kesalahan akses kamera: ${err.message || 'Izin ditolak atau sedang digunakan aplikasi lain'}`);
            }
        };

        initScanner();

        return () => {
            isStopped = true;
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().catch(e => console.error("Cleanup stop failed", e));
            }
        };
    }, []);

    const switchCamera = async (newId: string) => {
        if (scannerRef.current) {
            try {
                if (scannerRef.current.isScanning) {
                    await scannerRef.current.stop();
                    setIsScanning(false);
                }
                setSelectedCameraId(newId);
                const qrConfig = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
                await scannerRef.current.start(
                    newId, 
                    qrConfig, 
                    onScan, 
                    undefined
                );
                setIsScanning(true);
                setError(null);
            } catch (err: any) {
                setError(`Gagal pindah kamera: ${err.message}`);
            }
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-300">
                <div className="p-6 bg-blue-600 text-white flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                            <Camera size={20} />
                        </div>
                        <div>
                            <h3 className="font-black text-lg">QR Scanner Kamera</h3>
                            <p className="text-white/70 text-xs font-bold uppercase tracking-wider">Arahkan kamera ke QR Code</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-8">
                    <div className="relative aspect-square bg-black rounded-2xl overflow-hidden shadow-inner border-4 border-gray-100">
                        <div id="qr-reader" className="w-full h-full"></div>
                        
                        {!isScanning && !error && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50">
                                <RefreshCw className="animate-spin mb-2" size={32} />
                                <p className="text-sm font-bold">Menyiapkan Kamera...</p>
                            </div>
                        )}
                        
                        {error && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-red-500/10">
                                <X className="text-red-500 mb-2" size={48} />
                                <p className="text-red-500 font-black text-lg mb-2">Error Kamera</p>
                                <p className="text-gray-600 text-[10px] font-medium mb-4">{error}</p>
                                <button 
                                    onClick={() => window.location.reload()}
                                    className="px-6 py-2 bg-red-600 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-red-200"
                                >
                                    Muat Ulang Halaman
                                </button>
                            </div>
                        )}
                    </div>

                    {cameraList.length > 1 && (
                        <div className="mt-4">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Pilih Kamera</label>
                            <select 
                                value={selectedCameraId}
                                onChange={(e) => switchCamera(e.target.value)}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                            >
                                {cameraList.map((cam) => (
                                    <option key={cam.id} value={cam.id}>
                                        {cam.label || `Kamera ${cam.id.substring(0, 5)}`}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    
                    <div className="mt-8 grid grid-cols-2 gap-4">
                        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-3">
                           <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                               <span className="text-xs font-bold">1</span>
                           </div>
                           <p className="text-[10px] text-blue-900 font-bold leading-tight">Pastikan cahaya mencukupi di sekitar area scan.</p>
                        </div>
                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3">
                           <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                               <span className="text-xs font-bold">2</span>
                           </div>
                           <p className="text-[10px] text-emerald-900 font-bold leading-tight">QR Code akan terbaca secara otomatis oleh sistem.</p>
                        </div>
                    </div>
                </div>
                
                <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                       Powered by HTML5-QRCode Scanner
                    </p>
                </div>
            </div>
        </div>
    );
};
