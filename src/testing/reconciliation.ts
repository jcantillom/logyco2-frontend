import { OwnDeclarationDto, ReconciliationLinkDto, SharedCandidateDto, SharedOperationDto } from '../app/infrastructure/dto/reconciliation.dto';
import { ORG_ENVIA } from './builders';

/** URL base de la conciliación de la empresa de pruebas (sin ruta ni query). */
export const RECONCILIATION_URL = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}/reconciliation`;

export const REL_ID = 'rel-0001';

/** Un vínculo vigente con las autorizaciones de ambas empresas apagadas (el estado de partida: vincularse no comparte nada). */
export const reconciliationLinkDto = (overrides: Partial<ReconciliationLinkDto> = {}): ReconciliationLinkDto => ({
  relationship_id: REL_ID,
  status: 'ACTIVE',
  relationship_type: 'TRANSPORT_SERVICE',
  our_role: 'CONTRACTOR',
  counterpart: { id: 'org-b', name: 'Transportadora B' },
  my_consent: { matching_enabled: false, share_results: false, updated_at: null },
  counterpart_consent: { matching_enabled: false, share_results: false },
  matching_active: false,
  results_shared: false,
  can_scan: false,
  rescan_recommended: false,
  ...overrides,
});

/** Un vínculo con la conciliación activa: ambas empresas permitieron buscar; `shared` agrega compartir resultados de ambas. */
export const activeLinkDto = (shared = false, overrides: Partial<ReconciliationLinkDto> = {}): ReconciliationLinkDto =>
  reconciliationLinkDto({
    my_consent: { matching_enabled: true, share_results: shared, updated_at: '2026-11-20T15:30:00Z' },
    counterpart_consent: { matching_enabled: true, share_results: shared },
    matching_active: true,
    results_shared: shared,
    can_scan: true,
    ...overrides,
  });

export const ownDeclarationDto = (overrides: Partial<OwnDeclarationDto> = {}): OwnDeclarationDto => ({
  trip_id: 'trip-own-1',
  import_file_id: 'imp-1',
  row_number: 14,
  service_id: null,
  cargo_ton: null,
  trip_date: '2026-10-14',
  plate: 'ABC123',
  origin: { code: '11001', label: 'BOGOTÁ, D.C.' },
  destination: { code: '05001', label: 'MEDELLÍN' },
  fuel_type: 'DIESEL',
  consumption: { quantity: '300.0000', unit: 'gal' },
  distance_km: '415.5000',
  kg_co2: '3030.0000',
  ...overrides,
});

/** Un candidato sin consentimiento de ambas empresas para compartir: `counterpart` es `null`. */
export const sharedCandidateDto = (overrides: Partial<SharedCandidateDto> = {}): SharedCandidateDto => ({
  id: 'cand-1',
  relationship_id: REL_ID,
  status: 'POSSIBLE_MATCH',
  rule: 'M2',
  strength: 'WEAK',
  disagreement: false,
  my_side: 'A',
  counterpart_name: 'Transportadora B',
  evidence: { matches: ['origin', 'destination'], differs: [] },
  conflict_fields: [],
  my_decision: null,
  counterpart_decision: null,
  own: ownDeclarationDto(),
  counterpart: null,
  operation: null,
  data_comparison: null,
  superseded: false,
  created_at: '2026-11-20T15:30:00Z',
  updated_at: '2026-11-20T15:30:00Z',
  ...overrides,
});

/** Un candidato con la contraparte visible (ambas empresas comparten resultados): placa enmascarada, sin ids ni archivo. */
export const visibleCandidateDto = (overrides: Partial<SharedCandidateDto> = {}): SharedCandidateDto =>
  sharedCandidateDto({
    counterpart: {
      trip_date: '2026-10-14',
      origin: { code: '11001', label: 'BOGOTÁ, D.C.' },
      destination: { code: '05001', label: 'MEDELLÍN' },
      fuel_type: 'DIESEL',
      consumption: { quantity: '310.0000', unit: 'gal' },
      distance_km: '415.5000',
      kg_co2: '3100.5000',
      plate_masked: '***123',
    },
    evidence: { matches: ['origin', 'destination', 'distance'], differs: ['consumption', 'kg_co2'] },
    ...overrides,
  });

export const operationDto = (overrides: Partial<SharedOperationDto> = {}): SharedOperationDto => ({
  id: 'op-1',
  policy: 'UNA_CONTRIBUCION_POR_OPERACION_FISICA',
  my_selection: null,
  counterpart_selection: null,
  effective_selection: null,
  state: 'PENDING',
  ...overrides,
});

/** Un conflicto: ambas empresas confirmaron el mismo viaje pero declararon valores distintos. */
export const conflictCandidateDto = (overrides: Partial<SharedCandidateDto> = {}): SharedCandidateDto =>
  visibleCandidateDto({ status: 'CONFLICTING_DATA', my_decision: 'SAME', counterpart_decision: 'SAME', conflict_fields: ['consumption', 'co2_kg'], operation: operationDto(), data_comparison: 'conflict', ...overrides });

/** N candidatos distintos (ids `cand-<i>`), para llenar páginas. */
export const sharedCandidateDtos = (count: number): SharedCandidateDto[] => Array.from({ length: count }, (_, i) => sharedCandidateDto({ id: `cand-${i + 1}`, own: ownDeclarationDto({ trip_id: `trip-own-${i + 1}`, row_number: 14 + i }) }));

/** Respuesta paginada del servidor (`meta.pagination`). */
export const candidatesBody = (items: readonly SharedCandidateDto[], total = items.length, pageSize = 5, page = 1): object => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return { data: items, meta: { pagination: { page, page_size: pageSize, total, total_pages: totalPages, has_next: page < totalPages, has_previous: page > 1 } } };
};
