import React, { useState } from 'react';
import { analyzeAttendanceTrends } from '../services/aiService';
import { AttendanceRecord } from '../types';
import { Sparkles, BarChart3, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface AIPredictiveAnalyticsProps {
  attendanceData: AttendanceRecord[];
}

export const AIPredictiveAnalytics: React.FC<AIPredictiveAnalyticsProps> = ({ attendanceData }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    const result = await analyzeAttendanceTrends(attendanceData);
    setAnalysis(result);
    setLoading(false);
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
          <Sparkles size={16} />
        </div>
        <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
            Analitik Prediktif (AI)
        </h3>
      </div>
      
      {!analysis && !loading && (
        <button
          onClick={handleAnalyze}
          className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md"
        >
          <BarChart3 size={12} />
          Analisis
        </button>
      )}

      {loading && (
        <div className="flex items-center justify-center py-4 text-indigo-600">
          <Loader2 size={24} className="animate-spin" />
        </div>
      )}

      {analysis && (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[10px] text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100"
        >
            {analysis}
        </motion.div>
      )}
    </div>
  );
};
