import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combina clases condicionales y resuelve conflictos de Tailwind. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Validación ligera de email para habilitar/inhabilitar botones en el cliente (el servidor valida
 * de verdad con `@IsEmail`). Usa solo operaciones de string (sin regex con cuantificadores
 * solapados) para evitar ReDoS: un `[^\s@]+\.[^\s@]+` permite backtracking polinómico. Ver SEC3.
 */
export function isEmailish(value: string): boolean {
  const v = value.trim();
  if (v.length === 0 || v.length > 254 || /\s/.test(v)) return false;
  const at = v.indexOf('@');
  if (at <= 0 || at !== v.lastIndexOf('@')) return false;
  const domain = v.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}
