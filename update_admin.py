import re

with open('src/pages/AdminDashboard.tsx', 'r') as f:
    content = f.read()

# Remove 'akademik' and 'peran_guru' from settings sub tabs
content = content.replace(" { id: 'akademik', label: 'Akademik' },\n", "")
content = content.replace(" { id: 'peran_guru', label: 'Manajemen Peran Guru' },\n", "")

# Extract settingsSubTab === 'peran_guru' block
peran_guru_start = content.find("               {settingsSubTab === ('peran_guru' as any) && (")
if peran_guru_start != -1:
    # Find matching closing brace for this block
    brace_count = 0
    in_block = False
    peran_guru_end = -1
    for i in range(peran_guru_start, len(content)):
        if content[i] == '{':
            brace_count += 1
            in_block = True
        elif content[i] == '}':
            brace_count -= 1
        
        if in_block and brace_count == 0:
            peran_guru_end = i + 1 # wait, the block is {settings... && ( <div>...</div> )}
            # so the parenthesized conditional ends at next } )
            next_chars = content[i+1:i+10]
            if next_chars.startswith(')'):
                peran_guru_end = i + 1 + 1 # include the parenthesis
                break

    if peran_guru_end != -1:
        peran_guru_block = content[peran_guru_start:peran_guru_end]
        content = content[:peran_guru_start] + content[peran_guru_end:]
        
        # Replace the condition to activeTab === 'role-management-guru'
        new_peran_guru_block = peran_guru_block.replace("settingsSubTab === ('peran_guru' as any)", "activeTab === 'role-management-guru'")
        
        # Insert it before {activeTab === 'role-management-petugas' && (
        petugas_idx = content.find("              {activeTab === 'role-management-petugas' && (")
        if petugas_idx != -1:
            content = content[:petugas_idx] + new_peran_guru_block + "\n\n" + content[petugas_idx:]
        else:
            print("Could not find petugas block")

# Same for akademik -> academic-years
akademik_start = content.find("               {settingsSubTab === 'akademik' && (")
if akademik_start != -1:
    # The block ends around here:
    # 5458:                  </div>
    # 5459:                )}
    brace_count = 0
    in_block = False
    akademik_end = -1
    for i in range(akademik_start, len(content)):
        if content[i] == '{':
            if in_block == False:
                # {settingsSubTab
                pass
            brace_count += 1
            in_block = True
        elif content[i] == '}':
            brace_count -= 1
            
        if in_block and brace_count == 0:
            next_chars = content[i+1:i+10]
            if next_chars.startswith(')'):
                akademik_end = i + 2
                break

    if akademik_end != -1:
        akademik_block = content[akademik_start:akademik_end]
        content = content[:akademik_start] + content[akademik_end:]
        
        new_akademik_block = akademik_block.replace("settingsSubTab === 'akademik'", "activeTab === 'academic-years'")
        # Outdent and put it at root of active tabs logic
        
        # We can put it alongside {activeTab === 'school' && (
        school_idx = content.find("          {activeTab === 'school' && (")
        if school_idx != -1:
            content = content[:school_idx] + "          " + new_akademik_block.strip() + "\n\n" + content[school_idx:]
        else:
            print("Could not find school block")

with open('src/pages/AdminDashboard.tsx', 'w') as f:
    f.write(content)

print("Done")
