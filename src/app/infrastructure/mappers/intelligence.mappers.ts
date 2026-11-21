import {
  AreaComparison,
  GroupBreakdown,
  HistoryPoint,
  IndicatorCard,
  IndicatorHistory,
  IngestionResult,
  IntelligenceSummary,
  SourceRef,
  SourceStatus,
  Variation,
} from '../../domain/models/intelligence';

export interface SourceRefDto { code: string; name: string; publisher: string; url: string; license: string | null }
export interface VariationDto { monthly_pct: number | null; annual_pct: number | null; year_to_date_pct: number | null; previous_pct?: number | null; previous_date?: string | null }
export interface IndicatorCardDto {
  code: string; name: string; category: string; unit: string; status: 'AVAILABLE' | 'NO_DATA'; value: number | null;
  area_code: string | null; area_name: string | null; reference_period: string | null; published_at: string | null;
  acquired_at: string | null; valid_from: string | null; valid_to: string | null; kind: string | null; source_url?: string | null; source_reference?: string | null; source: SourceRefDto;
  variation: VariationDto | null; last_success_at: string | null; last_error_code: string | null;
}
export interface SummaryDto { featured: IndicatorCardDto[]; generated_at: string }
export interface HistoryDto {
  code: string; name: string; unit: string; area_code: string; area_name: string | null; source: SourceRefDto;
  points: { reference_period: string; value: number; published_at: string | null; acquired_at: string; version: number; source_url?: string | null; source_reference?: string | null; monthly_pct: number | null; annual_pct: number | null; previous_pct?: number | null }[];
  areas: { code: string; name: string }[];
}
export interface AreasDto {
  code: string; name: string; unit: string; reference_period: string | null; source_url?: string | null; source_reference?: string | null; source: SourceRefDto;
  rows: { area_code: string; area_name: string; value: number; monthly_pct: number | null; previous_pct?: number | null }[];
}
export interface GroupsDto {
  reference_period: string | null; source: SourceRefDto;
  items: { code: string; name: string; value: number; monthly_pct: number | null; annual_pct: number | null }[];
}
export interface SourceStatusDto {
  code: string; name: string; publisher: string; url: string; acquisition: 'AUTOMATIC'; provider_available: boolean; frequency: string;
  license: string | null; notes: string | null; last_attempt_at: string | null; last_success_at: string | null;
  last_error_code: string | null; last_run_status: string | null;
}
export interface IngestionDto {
  source_code: string; status: 'SUCCESS' | 'FAILED'; records_seen: number; inserted: number; revised: number;
  unchanged: number; error_code: string | null;
}

/** `YYYY-MM-DD` → fecha LOCAL (evita el desfase de zona horaria de `new Date('YYYY-MM-DD')`). */
export function toLocalDate(value: string | null): Date | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? null : date;
}
const toMoment = (value: string | null): Date | null => (value ? new Date(value) : null);

const toSource = (dto: SourceRefDto): SourceRef => ({ code: dto.code, name: dto.name, publisher: dto.publisher, url: dto.url, license: dto.license });
const toVariation = (dto: VariationDto | null): Variation | null =>
  dto
    ? { monthlyPct: dto.monthly_pct, annualPct: dto.annual_pct, yearToDatePct: dto.year_to_date_pct, previousPct: dto.previous_pct ?? null, previousDate: toLocalDate(dto.previous_date ?? null) }
    : null;

export function toCard(dto: IndicatorCardDto): IndicatorCard {
  return {
    code: dto.code, name: dto.name, category: dto.category, unit: dto.unit, status: dto.status, value: dto.value,
    areaCode: dto.area_code, areaName: dto.area_name, referencePeriod: toLocalDate(dto.reference_period),
    publishedAt: toLocalDate(dto.published_at), acquiredAt: toMoment(dto.acquired_at), validFrom: toLocalDate(dto.valid_from),
    validTo: toLocalDate(dto.valid_to), kind: dto.kind, sourceUrl: dto.source_url ?? null, sourceReference: dto.source_reference ?? null, source: toSource(dto.source), variation: toVariation(dto.variation),
    lastSuccessAt: toMoment(dto.last_success_at), lastErrorCode: dto.last_error_code,
  };
}

export const toSummary = (dto: SummaryDto): IntelligenceSummary => ({ featured: dto.featured.map(toCard), generatedAt: new Date(dto.generated_at) });

export function toHistory(dto: HistoryDto): IndicatorHistory {
  const points: HistoryPoint[] = dto.points.flatMap((p) => {
    const period = toLocalDate(p.reference_period);

    return period
      ? [{ referencePeriod: period, value: p.value, publishedAt: toLocalDate(p.published_at), acquiredAt: new Date(p.acquired_at), version: p.version, sourceUrl: p.source_url ?? null, sourceReference: p.source_reference ?? null, monthlyPct: p.monthly_pct, annualPct: p.annual_pct, previousPct: p.previous_pct ?? null }]
      : [];
  });

  return { code: dto.code, name: dto.name, unit: dto.unit, areaCode: dto.area_code, areaName: dto.area_name, source: toSource(dto.source), points, areas: dto.areas };
}

export const toAreas = (dto: AreasDto): AreaComparison => ({
  code: dto.code, name: dto.name, unit: dto.unit, referencePeriod: toLocalDate(dto.reference_period), source: toSource(dto.source),
  sourceUrl: dto.source_url ?? null, sourceReference: dto.source_reference ?? null,
  rows: dto.rows.map((r) => ({ areaCode: r.area_code, areaName: r.area_name, value: r.value, monthlyPct: r.monthly_pct, previousPct: r.previous_pct ?? null })),
});

export const toGroups = (dto: GroupsDto): GroupBreakdown => ({
  referencePeriod: toLocalDate(dto.reference_period), source: toSource(dto.source),
  items: dto.items.map((i) => ({ code: i.code, name: i.name, value: i.value, monthlyPct: i.monthly_pct, annualPct: i.annual_pct })),
});

export const toSourceStatus = (dto: SourceStatusDto): SourceStatus => ({
  code: dto.code, name: dto.name, publisher: dto.publisher, url: dto.url, acquisition: dto.acquisition, providerAvailable: dto.provider_available, frequency: dto.frequency,
  license: dto.license, notes: dto.notes, lastAttemptAt: toMoment(dto.last_attempt_at), lastSuccessAt: toMoment(dto.last_success_at),
  lastErrorCode: dto.last_error_code, lastRunStatus: dto.last_run_status,
});

export const toIngestion = (dto: IngestionDto): IngestionResult => ({
  sourceCode: dto.source_code, status: dto.status, recordsSeen: dto.records_seen, inserted: dto.inserted, revised: dto.revised,
  unchanged: dto.unchanged, errorCode: dto.error_code,
});
