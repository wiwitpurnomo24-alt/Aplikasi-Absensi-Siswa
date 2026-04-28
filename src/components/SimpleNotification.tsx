import React, { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';

export default function SimpleNotification({ message, title = "Notifikasi", onClose }: { message: string, title?: string, onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="bg-white border border-blue-200 p-4 rounded-3xl shadow-xl flex items-center gap-4 animate-in fade-in slide-in-from-right-4">
      <div className="bg-blue-100 text-blue-600 p-2 rounded-full">
        <AlertCircle size={20} />
      </div>
      <div>
        <p className="font-bold text-gray-900 text-sm">{title}</p>
        <p className="text-gray-600 text-xs">{message}</p>
      </div>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
        <X size={16} />
      </button>
    </div>
  );
}
