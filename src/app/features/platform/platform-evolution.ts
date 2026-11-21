import { PlatformTrends, TrendMetrics } from '../../domain/models/platform-admin';

/** Altas de un mes calendario (`month`: 0 = enero). */
export interface MonthlyCreated {
  readonly month: number;
  readonly organizations: number;
  readonly users: number;
}

/** Lo que aporta una consulta anual al backend: altas por mes y el resumen del año. */
export interface YearData {
  readonly year: number;
  readonly months: readonly MonthlyCreated[];
  readonly summary: TrendMetrics;
}

export type EvolutionMetric = 'organizations' | 'users';

export interface MonthlyEvolution {
  readonly year: number;
  readonly metric: EvolutionMetric;
  /** Un punto por mes transcurrido del año (todo el año si ya terminó). */
  readonly labels: readonly string[];
  /** Altas de cada mes. */
  readonly created: readonly number[];
  /** Total registrado al cierre de cada mes; `null` si no se puede reconstruir con los datos recibidos. */
  readonly cumulative: readonly number[] | null;
  readonly summary: TrendMetrics;
}

export const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;
export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;

/**
 * Agrupa por mes los puntos del backend. El backend entrega días en rangos cortos y meses en los largos;
 * en ambos casos el mes sale de los primeros 7 caracteres del `bucket` (`YYYY-MM-DD`).
 */
export function toYearData(year: number, trends: PlatformTrends): YearData {
  const months = Array.from({ length: 12 }, (_, month): { month: number; organizations: number; users: number } => ({ month, organizations: 0, users: 0 }));

  for (const point of trends.points) {
    if (Number(point.bucket.slice(0, 4)) !== year) continue;

    const slot = months[Number(point.bucket.slice(5, 7)) - 1];
    slot.organizations += point.organizationsCreated;
    slot.users += point.usersRegistered;
  }

  return { year, months, summary: trends.summary };
}

/** Rango que se pide al backend para un año: del 1 de enero al 31 de diciembre, o hasta hoy si es el año en curso. */
export function yearRange(year: number, today: string): { from: string; to: string } {
  return { from: `${year}-01-01`, to: year === Number(today.slice(0, 4)) ? today : `${year}-12-31` };
}

/**
 * Construye la serie del año `year`. El total acumulado se reconstruye hacia atrás desde el total actual
 * (las empresas y los usuarios no se eliminan): total antes de enero = total actual − todas las altas
 * desde enero de `year` hasta hoy. Por eso hacen falta los datos de `year` y de todos los años posteriores.
 */
export function buildEvolution(
  year: number,
  metric: EvolutionMetric,
  years: ReadonlyMap<number, YearData>,
  currentTotal: number | null,
  today: string,
): MonthlyEvolution {
  const current = years.get(year);
  const todayYear = Number(today.slice(0, 4));
  const shown = year === todayYear ? Number(today.slice(5, 7)) : 12;
  const created = (current?.months ?? []).slice(0, shown).map((m) => m[metric]);

  let cumulative: number[] | null = null;

  if (currentTotal !== null) {
    let sinceJanuary = 0;
    let complete = true;

    for (let y = year; y <= todayYear; y++) {
      const data = years.get(y);
      if (!data) complete = false;
      else sinceJanuary += data.months.reduce((sum, m) => sum + m[metric], 0);
    }

    const baseline = currentTotal - sinceJanuary;

    if (complete && baseline >= 0) {
      let running = baseline;
      cumulative = created.map((n) => (running += n));
    }
  }

  return { year, metric, labels: MONTH_LABELS.slice(0, shown), created, cumulative, summary: current?.summary ?? EMPTY_SUMMARY };
}

const EMPTY_SUMMARY: TrendMetrics = { organizationsCreated: 0, usersRegistered: 0, invitationsCreated: 0, adminsOnboarded: 0, membershipsApproved: 0, superAdminsGranted: 0 };
