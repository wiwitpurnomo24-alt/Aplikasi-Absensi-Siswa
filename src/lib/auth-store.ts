import { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { UserRole } from '../types';

// Simple global state for auth
let globalUser: UserProfile | null = null;
const listeners = new Set<(user: UserProfile | null) => void>();

const setGlobalUser = (user: UserProfile | null) => {
  globalUser = user;
  listeners.forEach(l => l(user));
};

// Initialize from localStorage immediately
const stored = typeof window !== 'undefined' ? localStorage.getItem('school_user') : null;
if (stored) {
  try {
    globalUser = JSON.parse(stored);
  } catch (e) {
    console.error('Failed to parse stored user', e);
  }
}

export function useAuthStore() {
  const [user, setUser] = useState<UserProfile | null>(globalUser);

  useEffect(() => {
    const listener = (newUser: UserProfile | null) => setUser(newUser);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const login = (userData: UserProfile) => {
    localStorage.setItem('school_user', JSON.stringify(userData));
    setGlobalUser(userData);
  };

  const switchRole = (newRole: UserRole) => {
      if (globalUser && globalUser.roles.includes(newRole)) {
          const newUser = { ...globalUser, role: newRole };
          localStorage.setItem('school_user', JSON.stringify(newUser));
          setGlobalUser(newUser);
      }
  };

  const logout = () => {
    localStorage.removeItem('school_user');
    setGlobalUser(null);
  };

  return { user, login, logout, switchRole, isLoading: false };
}
