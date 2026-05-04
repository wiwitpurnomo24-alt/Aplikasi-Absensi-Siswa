import React, { useState, useEffect } from 'react';
import { Scan, ShieldCheck, AlertCircle, HardDrive } from 'lucide-react';
import { cn } from '../lib/utils';

export const ScannerStatus: React.FC = () => {
  const [hidScanner, setHidScanner] = useState<boolean>(false);
  const [hidSupported, setHidSupported] = useState<boolean>(true);
  const [cameraScanner, setCameraScanner] = useState<boolean>(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  useEffect(() => {
    // Check Camera
    const checkCamera = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(device => device.kind === 'videoinput');
        setCameraScanner(hasCamera);
      } catch (err) {
        console.error("Camera check failed", err);
      }
    };
    
    checkCamera();

    // WebHID (might not be supported in all browsers)
    const checkHid = async () => {
      if ('hid' in navigator) {
        try {
          const devices = await (navigator as any).hid.getDevices();
          setHidScanner(devices.length > 0);
          setHidSupported(true);
          
          const handleConnect = (event: any) => {
            setHidScanner(true);
            showNotification(`Scanner ${event.device.productName || 'Terdeteksi'} Connected`, 'success');
          };
          
          const handleDisconnect = () => {
             (navigator as any).hid.getDevices().then((devs: any[]) => {
                setHidScanner(devs.length > 0);
                if (devs.length === 0) {
                    showNotification("Scanner Terputus", 'error');
                }
             });
          };

          (navigator as any).hid.addEventListener('connect', handleConnect);
          (navigator as any).hid.addEventListener('disconnect', handleDisconnect);

          return () => {
            (navigator as any).hid.removeEventListener('connect', handleConnect);
            (navigator as any).hid.removeEventListener('disconnect', handleDisconnect);
          };
        } catch (err: any) {
          // Silent catch for permissions policy errors
          if (err.name === 'SecurityError' || err.message?.includes('permissions policy')) {
            setHidSupported(false);
          } else {
            console.error("HID check failed", err);
          }
        }
      } else {
        setHidSupported(false);
      }
    };

    const cleanupHid = checkHid();

    // Simulated HID Listener (Detect rapid typing common for scanners)
    let buffer = "";
    let lastKeyTimeCount = Date.now();
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const diff = now - lastKeyTimeCount;
      lastKeyTimeCount = now;

      // Scanners usually type very fast, often < 30ms between keys
      if (diff < 50) {
        if (e.key === 'Enter') {
          if (buffer.length > 3) {
            setLastScan(buffer);
            showNotification(`Scan Berhasil: ${buffer}`, 'success');
          }
          buffer = "";
        } else if (e.key.length === 1) {
          buffer += e.key;
        }
      } else {
        buffer = "";
        if (e.key.length === 1) buffer = e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (cleanupHid && typeof cleanupHid === 'function') (cleanupHid as any)();
    };
  }, []);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const requestHidAccess = async () => {
    if ('hid' in navigator) {
      try {
        const devices = await (navigator as any).hid.requestDevice({ filters: [] });
        if (devices && devices.length > 0) {
          setHidScanner(true);
          showNotification(`Scanner ${devices[0].productName} Terhubung`, 'success');
        }
      } catch (err) {
        console.error("HID Request failed", err);
      }
    } else {
      alert("Browser Anda tidak mendukung WebHID untuk koneksi scanner fisik.");
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {notification && (
        <div className={cn(
          "fixed top-4 right-4 z-[100] p-4 rounded-xl shadow-2xl border animate-in slide-in-from-right-full duration-300 flex items-center gap-3",
          notification.type === 'success' ? "bg-green-600 text-white border-green-500" : "bg-red-600 text-white border-red-500"
        )}>
          {notification.type === 'success' ? <ShieldCheck size={20} /> : <AlertCircle size={20} />}
          <p className="text-sm font-bold">{notification.message}</p>
        </div>
      )}

      <div className="bg-blue-50 p-1.5 rounded-lg border border-blue-100">
        <p className="text-[6px] font-black uppercase tracking-widest text-blue-400 mb-0.5">Physical Scanner (HID)</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
             <div className={cn("w-1 h-1 rounded-full", (hidScanner || !hidSupported) ? "bg-green-500 animate-pulse" : "bg-gray-300")}></div>
             <p className="font-bold text-[7px] text-blue-900 leading-none">
               {!hidSupported ? "Keyboard Mode Active" : hidScanner ? "Device Connected" : "Standby"}
             </p>
          </div>
          {hidSupported && (
            <button 
              onClick={requestHidAccess}
              className="text-[6px] font-black uppercase bg-blue-600 text-white px-1.5 py-0.5 rounded hover:bg-blue-700 transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      <div className="bg-sky-50 p-1.5 rounded-lg border border-sky-100">
        <p className="text-[6px] font-black uppercase tracking-widest text-sky-400 mb-0.5">Scanner Kamera</p>
        <div className="flex items-center gap-1">
           <div className={cn("w-1 h-1 rounded-full", cameraScanner ? "bg-green-500" : "bg-red-400")}></div>
           <p className="font-bold text-[7px] text-sky-900 leading-none">
             {cameraScanner ? "Kamera Terdeteksi" : "Kamera Tidak Temukan"}
           </p>
        </div>
      </div>

      {lastScan && (
        <div className="bg-green-50 p-1 rounded border border-green-100 animate-in fade-in duration-300">
          <p className="text-[6px] font-black uppercase tracking-widest text-green-600">Scan Terakhir</p>
          <p className="font-mono text-[7px] text-green-900">{lastScan}</p>
        </div>
      )}
    </div>
  );
};
