import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatDate = (date: any): string => {
  if (!date) return '-';
  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else if (date && typeof date.toDate === 'function') {
    d = date.toDate();
  } else {
    d = new Date(date);
  }
  
  if (isNaN(d.getTime())) return '-';
  
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(d);
};

export const formatDateTime = (date: any): string => {
  if (!date) return '-';
  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else if (date && typeof date.toDate === 'function') {
    d = date.toDate();
  } else {
    d = new Date(date);
  }
  
  if (isNaN(d.getTime())) return '-';
  
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

export const getTimeSafe = (date: any): number => {
  if (!date) return 0;
  if (date instanceof Date) return date.getTime();
  if (date && typeof date.toDate === 'function') return date.toDate().getTime();
  const d = new Date(date);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

export const getDayName = (date: any): string => {
  if (!date) return '-';
  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else if (date && typeof date.toDate === 'function') {
    d = date.toDate();
  } else {
    d = new Date(date);
  }

  if (isNaN(d.getTime())) return '-';
  
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(d);
};
