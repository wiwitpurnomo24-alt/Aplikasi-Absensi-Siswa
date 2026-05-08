import { GoogleGenAI } from "@google/genai";
import { AttendanceRecord } from '../types'; 

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function analyzeAttendanceTrends(attendanceData: AttendanceRecord[]) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const prompt = `
    Analisis data absensi berikut dan berikan wawasan tentang tren kehadiran siswa. 
    Identifikasi siswa yang sering absen, pola hari absen, dan berikan saran untuk perbaikan.
    Data: ${JSON.stringify(attendanceData)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        systemInstruction: "Anda adalah asisten AI yang ahli dalam analisis data pendidikan dan kehadiran siswa. Berikan analisis yang ringkas, informatif, dan bersifat korektif.",
      },
    });
    return response.text;
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return "Maaf, gagal menganalisis data saat ini.";
  }
}
