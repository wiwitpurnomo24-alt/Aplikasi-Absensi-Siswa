import fs from 'fs';

let content = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf-8');

// Extract settingsSubTab === 'peran_guru' block
const peran_guru_start = content.indexOf("               {settingsSubTab === ('peran_guru' as any) && (");
if (peran_guru_start !== -1) {
    let brace_count = 0;
    let in_block = false;
    let peran_guru_end = -1;
    for (let i = peran_guru_start; i < content.length; i++) {
        if (content[i] === '{') {
            brace_count++;
            in_block = true;
        } else if (content[i] === '}') {
            brace_count--;
        }
        
        if (in_block && brace_count === 0) {
            const next_chars = content.substring(i+1, i+10);
            if (next_chars.startsWith(')')) {
                peran_guru_end = i + 2;
                break;
            }
        }
    }

    if (peran_guru_end !== -1) {
        const peran_guru_block = content.substring(peran_guru_start, peran_guru_end);
        content = content.substring(0, peran_guru_start) + content.substring(peran_guru_end);
        
        const new_peran_guru_block = peran_guru_block.replace("settingsSubTab === ('peran_guru' as any)", "activeTab === 'role-management-guru'");
        
        const petugas_idx = content.indexOf("              {activeTab === 'role-management-petugas' && (");
        if (petugas_idx !== -1) {
            content = content.substring(0, petugas_idx) + new_peran_guru_block + "\n\n" + content.substring(petugas_idx);
        }
    }
}

// Exactly the same logic for akademik
const akademik_start = content.indexOf("               {settingsSubTab === 'akademik' && (");
if (akademik_start !== -1) {
    let brace_count = 0;
    let in_block = false;
    let akademik_end = -1;
    for (let i = akademik_start; i < content.length; i++) {
        if (content[i] === '{') {
            brace_count++;
            in_block = true;
        } else if (content[i] === '}') {
            brace_count--;
        }
        
        if (in_block && brace_count === 0) {
            const next_chars = content.substring(i+1, i+10);
            if (next_chars.startsWith(')')) {
                akademik_end = i + 2;
                break;
            }
        }
    }

    if (akademik_end !== -1) {
        const akademik_block = content.substring(akademik_start, akademik_end);
        content = content.substring(0, akademik_start) + content.substring(akademik_end);
        
        const new_akademik_block = akademik_block.replace("settingsSubTab === 'akademik'", "activeTab === 'academic-years'");
        const school_idx = content.indexOf("          {activeTab === 'school' && (");
        if (school_idx !== -1) {
            content = content.substring(0, school_idx) + "          " + new_akademik_block.trim() + "\n\n" + content.substring(school_idx);
        }
    }
}

fs.writeFileSync('src/pages/AdminDashboard.tsx', content);
console.log("Done");
