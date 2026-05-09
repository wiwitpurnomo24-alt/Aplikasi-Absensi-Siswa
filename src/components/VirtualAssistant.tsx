import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Send, X, User, Bot, Loader2, Sparkles } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function VirtualAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ id: string, role: 'user' | 'assistant', content: string }[]>([
    { id: 'init-msg', role: 'assistant', content: 'Halo! Saya Duta, asisten virtual SIAGA. Ada yang bisa saya bantu terkait penggunaan aplikasi absensi sekolah ini?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    const newUserMessage = { id: crypto.randomUUID(), role: 'user' as const, content: userMessage };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: "Nama: Duta. Identitas: Maskot asisten virtual SIAGA (Sistem Informasi Administrasi Giat Absensi) SMPN 2 Magelang. Karakter: Bersemangat, tegas, profesional, namun tetap ramah dan membantu. Tugas: Membantu Bapak/Ibu Guru, Orang Tua, dan Siswa dalam mengoperasikan fitur-fitur aplikasi seperti presensi harian, laporan kehadiran, manajemen data sekolah, dan notifikasi. Bahasa: Indonesia yang santun. Hindari jawaban yang terlalu teknis jika tidak ditanya. Jadilah asisten yang solutif."
        },
        contents: [
          ...messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user' as any,
            parts: [{ text: m.content }],
          })),
          { role: 'user', parts: [{ text: userMessage }] }
        ],
      });

      const assistantMessage = response.text || "Maaf, saya sedang tidak dapat berpikir dengan jernih. Bisa diulangi?";
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: assistantMessage }]);
    } catch (error) {
      console.error("Gemini Error:", error);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: "Maaf, terjadi gangguan koneksi dengan sistem AI Duta. Silakan coba lagi nanti." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Trigger Button */}
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-2 z-50">
        <AnimatePresence>
          {!isOpen && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white px-3 py-1.5 rounded-xl shadow-lg border border-blue-100 text-[10px] font-black text-blue-700 uppercase tracking-widest pointer-events-none"
            >
              Tanya Duta 👋
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          whileHover={{ scale: 1.05, rotate: 5 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 bg-gradient-to-tr from-blue-700 to-blue-500 text-white rounded-full flex items-center justify-center shadow-xl hover:shadow-blue-200 transition-all border-2 border-white"
        >
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center p-1 shadow-inner overflow-hidden">
             <img 
               src="https://api.dicebear.com/7.x/avataaars/svg?seed=Duta&backgroundColor=b6e3f4&skinColor=ffdbb4&clothing=suitAndTie&clothingColor=3c91e6&topType=shortHair&hairColor=2c1b18" 
               alt="Duta" 
               className="w-full h-full object-contain"
               referrerPolicy="no-referrer"
             />
          </div>
        </motion.button>
      </div>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-3rem)] h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-100 z-50"
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-blue-700 to-blue-600 text-white flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center p-1 shadow-inner overflow-hidden">
                  <img 
                    src="https://api.dicebear.com/7.x/avataaars/svg?seed=Duta&backgroundColor=b6e3f4&skinColor=ffdbb4&clothing=suitAndTie&clothingColor=3c91e6&topType=shortHair&hairColor=2c1b18" 
                    alt="Duta" 
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-black tracking-tight">DUTA AI</h3>
                    <Sparkles size={12} className="text-yellow-300" />
                  </div>
                  <p className="text-[10px] text-blue-100 font-medium">Asisten Virtual SIAGA</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)} 
                className="hover:bg-white/10 p-1.5 rounded-lg transition-colors"
                title="Tutup Chat"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none shadow-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                    <Loader2 size={16} className="animate-spin text-blue-600" />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 bg-white border-t border-gray-100 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Tanyakan sesuatu..."
                className="flex-1 bg-gray-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-600 transition-all"
              />
              <button
                onClick={handleSend}
                disabled={isLoading}
                className="bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Send size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
