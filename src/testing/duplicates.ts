import { DuplicateTripDto, PossibleDuplicateDto } from '../app/infrastructure/dto/duplicates.dto';
import { ORG_ENVIA } from './builders';

/** URL base de los posibles duplicados de la empresa de pruebas (sin query). */
export const DUPLICATES_URL = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}/emissions/trips/duplicates`;

/** El viaje nuevo (A) de un par: llega con decimales como texto y lugares en mayúsculas, como en el servidor. */
export const duplicateTripDto = (overrides: Partial<DuplicateTripDto> = {}): DuplicateTripDto => ({
  id: 'trip-a1',
  trip_id: 'V-1001',
  trip_date: '2026-10-14',
  plate: 'ABC123',
  origin: { code: '11001', label: 'BOGOTÁ, D.C.' },
  destination: { code: '05001', label: 'MEDELLÍN' },
  fuel_type: 'DIESEL',
  consumption: { quantity: '300.0000', unit: 'gal' },
  distance_km: '415.5000',
  kg_co2: '3030.0000',
  import_file_id: 'imp-2',
  file_name: 'operaciones-octubre.xlsx',
  row_number: 14,
  ...overrides,
});

/** El original (B) del mismo par: otro archivo y otra distancia. */
export const originalTripDto = (overrides: Partial<DuplicateTripDto> = {}): DuplicateTripDto =>
  duplicateTripDto({ id: 'trip-b1', distance_km: '400.0000', kg_co2: '3030.0000', import_file_id: 'imp-1', file_name: 'operaciones-septiembre.xlsx', row_number: 9, ...overrides });

/** Un posible duplicado R2 (corrección: cambió la distancia). */
export const possibleDuplicateDto = (overrides: Partial<PossibleDuplicateDto> = {}): PossibleDuplicateDto => ({
  id: 'trip-a1',
  rule: 'R2',
  rule_label: 'Mismo identificador con valores distintos',
  status: 'POSSIBLE_DUPLICATE',
  a: duplicateTripDto(),
  b: originalTripDto(),
  differences: ['distance_km'],
  evidence: { identical: false, matches: ['trip_id', 'plate', 'trip_date'], differs: ['distance_km'] },
  ...overrides,
});

/** N pares distintos (ids `trip-a<i>`), para llenar páginas. */
export const duplicateDtos = (count: number): PossibleDuplicateDto[] =>
  Array.from({ length: count }, (_, i) => possibleDuplicateDto({ id: `trip-a${i + 1}`, a: duplicateTripDto({ id: `trip-a${i + 1}`, trip_id: `V-${1001 + i}` }), b: originalTripDto({ id: `trip-b${i + 1}`, trip_id: `V-${1001 + i}` }) }));

/** Respuesta paginada del servidor (`meta.pagination`). */
export const duplicatesBody = (items: readonly PossibleDuplicateDto[], total = items.length, pageSize = 5, page = 1): object => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { data: items, meta: { pagination: { page, page_size: pageSize, total, total_pages: totalPages, has_next: page < totalPages, has_previous: page > 1 } } };
};
