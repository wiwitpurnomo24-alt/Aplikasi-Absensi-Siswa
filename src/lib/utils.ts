import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date): string {
  if (!date || isNaN(date.getTime())) return '-';
  const dayName = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(date);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString();
  
  return `${dayName}, ${day}-${month}-${year}`;
}

export function getDayName(date: Date): string {
  if (!date || isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(date);
}
