/** Formato de importes y fechas localizado por tenant (es-ES / es-DO, EUR / DOP). */

export function formatMoney(amount: string | number, currency: string, locale = 'es-ES'): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    Number.isFinite(value) ? value : 0,
  );
}

export function formatDate(date: string | Date, locale = 'es-ES'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
}

export function formatDateTime(date: string | Date, locale = 'es-ES'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
