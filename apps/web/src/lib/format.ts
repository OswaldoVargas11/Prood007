/** Formato de importes y fechas en español (locale único `es`); la moneda (EUR/USD/DOP) viene del tenant. */

export function formatMoney(amount: string | number, currency: string, locale = 'es'): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    Number.isFinite(value) ? value : 0,
  );
}

export function formatDate(date: string | Date, locale = 'es'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
}

export function formatDateTime(date: string | Date, locale = 'es'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
