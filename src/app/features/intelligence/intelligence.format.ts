const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;

/** Precios en pesos con «$» y sin decimales. */
export function formatMoney(value: number): string {
  return `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(value)}`;
}
export function formatNumber(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value);
}
export function formatPct(value: number | null): string {
  if (value === null) return '—';

  return `${value > 0 ? '↑ +' : value < 0 ? '↓ ' : ''}${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value)}%`;
}
export function formatMonth(date: Date | null): string {
  return date ? date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }) : '—';
}
/** «1 nov 2026» (fecha de vigencia). */
export function shortDate(date: Date | null): string {
  return date ? `${date.getDate()} ${MONTHS[date.getMonth()].toLowerCase()} ${date.getFullYear()}` : '—';
}
/** «Sep 2026». */
export function shortMonth(date: Date | null): string {
  return date ? `${MONTHS[date.getMonth()]} ${date.getFullYear()}` : '—';
}
/** Eje de las gráficas en dos líneas: el mes y, debajo, el año («Sep» / «2026»). */
export function axisMonth(date: Date): string {
  return `${MONTHS[date.getMonth()]}\n${date.getFullYear()}`;
}
/** Series por vigencia (precios CREG): el eje muestra el día y el mes («2 Oct») y, debajo, el año; no hay un punto por mes. */
export function axisDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}\n${date.getFullYear()}`;
}
