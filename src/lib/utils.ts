import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normaliserer et telefonnummer til E.164 med dansk landekode som standard.
 * Returnerer null hvis nummeret ikke kan tolkes som et gyldigt nummer.
 */
export function normalizePhone(input: string | null | undefined, defaultCountry = '45'): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Behold et ledende plus, smid alt andet der ikke er cifre væk
  // (mellemrum, bindestreger, parenteser, "tlf." osv.).
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');

  if (!digits) return null;

  if (hasPlus) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  // 00 som international præfiks
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  // Otte cifre uden landekode tolkes som dansk
  if (digits.length === 8) {
    return `+${defaultCountry}${digits}`;
  }

  // Allerede med dansk landekode, bare uden plus
  if (digits.length === 10 && digits.startsWith(defaultCountry)) {
    return `+${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

/** Viser et E.164-nummer i dansk læsevenligt format: +45 12 34 56 78 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const match = /^\+45(\d{8})$/.exec(phone);
  if (!match) return phone;
  return `+45 ${match[1].replace(/(\d{2})(?=\d)/g, '$1 ')}`;
}

/** Renser og validerer et dansk CVR-nummer (8 cifre). */
export function normalizeCvr(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '–';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '–';
  return new Intl.DateTimeFormat('da-DK', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '–';
  return new Intl.DateTimeFormat('da-DK', { dateStyle: 'medium' }).format(new Date(value));
}

export function initials(name: string | null | undefined, fallback = '?'): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || fallback;
}
