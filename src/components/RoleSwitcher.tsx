import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronsDown } from 'lucide-react';
import { useAuthStore } from '../lib/auth-store';
import { cn } from '../lib/utils';
import { ROLE_LABELS } from '../constants';

export default function RoleSwitcher() {
  const { user, switchRole } = useAuthStore();
  const navigate = useNavigate();
  const [showRolesDropdown, setShowRolesDropdown] = useState(false);

  const getRolePath = (role: string) => {
    switch(role) {
      case 'ADMIN': return '/admin';
      case 'TEACHER': return '/teacher';
      case 'SUBJECT_TEACHER': return '/subject-teacher';
      case 'PARENT': return '/parent';
      default: return '/login';
    }
  };

  if (!user?.roles || user.roles.length <= 1) return null;

  return (
    <div className="relative">
      <button 
        onClick={() => setShowRolesDropdown(!showRolesDropdown)}
        className="text-xs bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-md"
      >
        Peran Saat Ini: {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS]} <ChevronsDown size={14} />
      </button>
      {showRolesDropdown && (
        <div className="absolute left-0 mt-2 bg-white p-2 rounded-xl shadow-xl border border-gray-100 z-50 w-48 animate-in fade-in zoom-in-95 duration-200">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 py-1">Pilih Peran Lain</p>
          {Array.from(new Set(user.roles || [])).map((r: any, i) => (
            <button 
              key={`role-switch-${r}-${i}`} 
              onClick={() => { switchRole(r as any); navigate(getRolePath(r as any)); setShowRolesDropdown(false); }}
              className={cn(
                "block w-full text-left p-3 text-sm font-bold hover:bg-indigo-50 rounded-lg transition-colors", 
                user.role === r ? "bg-indigo-100 text-indigo-700" : "text-gray-700"
              )}
            >
              {ROLE_LABELS[r as keyof typeof ROLE_LABELS]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
