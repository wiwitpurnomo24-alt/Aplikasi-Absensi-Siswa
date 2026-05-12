import { useState, useEffect } from 'react';
import { Clock, Calendar } from 'lucide-react';
import { motion } from 'motion/react';

export default function DigitalClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="notranslate flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1 bg-white/60 backdrop-blur-md border border-white/50 rounded-xl shadow-[0_2px_10px_-3px_rgba(0,0,0,0.07)]"
    >
      <div className="flex items-center gap-1.5 sm:gap-2 text-gray-500">
        <Calendar size={12} className="text-blue-500/70" />
        <span className="text-[10px] sm:text-xs font-black whitespace-nowrap text-gray-700 uppercase tracking-tight">
          {formatDate(time)}
        </span>
      </div>
      
      <div className="w-px h-3 sm:h-4 bg-gray-200"></div>
      
      <div className="flex items-center gap-1 sm:gap-1.5 text-gray-800">
        <Clock size={12} className="text-blue-600/70" />
        <span className="text-[11px] sm:text-xs font-black tracking-widest text-blue-700 font-mono">
          {formatTime(time)}
        </span>
      </div>
    </motion.div>
  );
}
