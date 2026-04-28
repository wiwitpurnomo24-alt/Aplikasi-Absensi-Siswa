/**
 * Parses a standard WhatsApp message format into attendance data
 */
export function parseWhatsAppMessage(message: string) {
  try {
    const lines = message.split('\n');
    const data: any = {};
    
    // Normalize text for easier matching
    const normalizedMessage = message.toLowerCase();

    lines.forEach(line => {
      const lowerLine = line.toLowerCase();
      
      if (lowerLine.includes('tanggal:')) data.dateString = line.split(/tanggal:/i)[1].trim();
      else if (lowerLine.includes('tgl:')) data.dateString = line.split(/tgl:/i)[1].trim();
      
      if (lowerLine.includes('nama siswa:')) data.studentName = line.split(/nama siswa:/i)[1].trim();
      else if (lowerLine.includes('nama:')) data.studentName = line.split(/nama:/i)[1].trim();
      
      if (lowerLine.includes('nis:')) data.nis = line.split(/nis:/i)[1].trim();
      if (lowerLine.includes('kelas:')) data.className = line.split(/kelas:/i)[1].trim();
      
      if (lowerLine.includes('jenis:')) data.type = line.split(/jenis:/i)[1].trim();
      else if (lowerLine.includes('keterangan absen:')) data.type = line.split(/keterangan absen:/i)[1].trim();
      else if (lowerLine.includes('status:')) data.type = line.split(/status:/i)[1].trim();
      
      if (lowerLine.includes('nama ortu:')) data.parentName = line.split(/nama ortu:/i)[1].trim();
      else if (lowerLine.includes('orang tua:')) data.parentName = line.split(/orang tua:/i)[1].trim();
      
      if (lowerLine.includes('alamat:')) data.address = line.split(/alamat:/i)[1].trim();
      if (lowerLine.includes('alasan:')) data.reason = line.split(/alasan:/i)[1].trim();
      if (lowerLine.includes('keterangan:')) data.additionalInfo = line.split(/keterangan:/i)[1].trim();
      
      if (lowerLine.includes('lokasi:')) {
        const url = line.split(/lokasi:/i)[1].trim();
        const coords = url.split('q=')[1]?.split(',');
        if (coords) {
          data.location = {
            latitude: parseFloat(coords[0]),
            longitude: parseFloat(coords[1])
          };
        }
      }
    });

    // Smart detection for Type if not explicitly found in a "Field: Value" format
    if (!data.type) {
      if (normalizedMessage.includes('sakit')) data.type = 'Sakit';
      else if (normalizedMessage.includes('izin')) data.type = 'Izin';
      else if (normalizedMessage.includes('dispensasi')) data.type = 'Dispensasi';
      else if (normalizedMessage.includes('alpa')) data.type = 'Alpa';
    } else {
      // Normalize type value
      const typeLower = data.type.toLowerCase();
      if (typeLower.includes('sakit')) data.type = 'Sakit';
      else if (typeLower.includes('izin')) data.type = 'Izin';
      else if (typeLower.includes('dispen')) data.type = 'Dispensasi';
      else if (typeLower.includes('alpa')) data.type = 'Alpa';
    }

    // Try to parse date from dateString or content
    let parsedDate = new Date();
    if (data.dateString) {
      // Handle common Indonesian formats
      const dateStr = data.dateString.toLowerCase();
      
      // dd-mm-yyyy or dd/mm/yyyy
      const dmyMatch = dateStr.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
      if (dmyMatch) {
        const day = parseInt(dmyMatch[1]);
        const month = parseInt(dmyMatch[2]) - 1;
        let year = parseInt(dmyMatch[3]);
        if (year < 100) year += 2000;
        parsedDate = new Date(year, month, day);
      } else {
        // Look for Indonesian month names
        const months = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
        for (let i = 0; i < months.length; i++) {
          if (dateStr.includes(months[i])) {
            const dayMatch = dateStr.match(/(\d{1,2})/);
            const yearMatch = dateStr.match(/(\d{4})/);
            if (dayMatch) {
              parsedDate = new Date(yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear(), i, parseInt(dayMatch[0]));
            }
            break;
          }
        }
      }
    }
    
    // Ensure date is valid, fallback to today
    if (isNaN(parsedDate.getTime())) {
      parsedDate = new Date();
    }
    
    data.date = parsedDate.toISOString().split('T')[0];
    const indonesianDays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    data.day = indonesianDays[parsedDate.getDay()];
    
    return data;
  } catch (error) {
    console.error("Parsing Error:", error);
    return null;
  }
}
