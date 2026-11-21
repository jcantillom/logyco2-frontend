/** Modelos de LoGyCO₂ Intelligence (indicadores logísticos, energéticos y ambientales). */

export type IndicatorStatus = 'AVAILABLE' | 'NO_DATA';

export interface SourceRef {
  readonly code: string;
  readonly name: string;
  readonly publisher: string;
  readonly url: string;
  readonly license: string | null;
}

/** Variaciones CALCULADAS por el backend a partir de los valores guardados (no son cifras publicadas por la fuente). */
export interface Variation {
  readonly monthlyPct: number | null;
  readonly annualPct: number | null;
  readonly yearToDatePct: number | null;
  /** Solo indicadores con vigencias irregulares (p. ej. precios CREG): variación frente a la publicación anterior y su fecha. */
  readonly previousPct: number | null;
  readonly previousDate: Date | null;
}

export interface IndicatorCard {
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly unit: string;
  readonly status: IndicatorStatus;
  readonly value: number | null;
  readonly areaCode: string | null;
  readonly areaName: string | null;
  readonly referencePeriod: Date | null;
  readonly publishedAt: Date | null;
  readonly acquiredAt: Date | null;
  readonly validFrom: Date | null;
  readonly validTo: Date | null;
  readonly kind: string | null;
  /** Documento oficial de la observación (p. ej. la circular CREG) y su rótulo. */
  readonly sourceUrl: string | null;
  readonly sourceReference: string | null;
  readonly source: SourceRef;
  readonly variation: Variation | null;
  readonly lastSuccessAt: Date | null;
  readonly lastErrorCode: string | null;
}

export interface IntelligenceSummary {
  readonly featured: readonly IndicatorCard[];
  readonly generatedAt: Date;
}

export interface HistoryPoint {
  readonly referencePeriod: Date;
  readonly value: number;
  readonly publishedAt: Date | null;
  readonly acquiredAt: Date;
  readonly version: number;
  readonly sourceUrl: string | null;
  readonly sourceReference: string | null;
  readonly monthlyPct: number | null;
  readonly annualPct: number | null;
  readonly previousPct: number | null;
}

export interface AreaOption {
  readonly code: string;
  readonly name: string;
}

export interface IndicatorHistory {
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  readonly areaCode: string;
  readonly areaName: string | null;
  readonly source: SourceRef;
  readonly points: readonly HistoryPoint[];
  readonly areas: readonly AreaOption[];
}

export interface AreaComparisonRow {
  readonly areaCode: string;
  readonly areaName: string;
  readonly value: number;
  readonly monthlyPct: number | null;
  readonly previousPct: number | null;
}

export interface AreaComparison {
  readonly code: string;
  readonly name: string;
  readonly unit: string;
  readonly referencePeriod: Date | null;
  readonly sourceUrl: string | null;
  readonly sourceReference: string | null;
  readonly source: SourceRef;
  readonly rows: readonly AreaComparisonRow[];
}

export interface GroupVariation {
  readonly code: string;
  readonly name: string;
  readonly value: number;
  readonly monthlyPct: number | null;
  readonly annualPct: number | null;
}

/** Total y grupos de costos del ICTC en su último período. */
export interface GroupBreakdown {
  readonly referencePeriod: Date | null;
  readonly source: SourceRef;
  readonly items: readonly GroupVariation[];
}

export interface SourceStatus {
  readonly code: string;
  readonly name: string;
  readonly publisher: string;
  readonly url: string;
  readonly acquisition: 'AUTOMATIC';
  /** `false`: fuente identificada sin proveedor automático todavía (no hay publicación oficial legible por máquina). */
  readonly providerAvailable: boolean;
  readonly frequency: string;
  readonly license: string | null;
  readonly notes: string | null;
  readonly lastAttemptAt: Date | null;
  readonly lastSuccessAt: Date | null;
  readonly lastErrorCode: string | null;
  readonly lastRunStatus: string | null;
}

export interface IngestionResult {
  readonly sourceCode: string;
  readonly status: 'SUCCESS' | 'FAILED';
  readonly recordsSeen: number;
  readonly inserted: number;
  readonly revised: number;
  readonly unchanged: number;
  readonly errorCode: string | null;
}

export interface HistoryQuery {
  readonly areaCode?: string | null;
  readonly dateFrom?: string | null;
}
