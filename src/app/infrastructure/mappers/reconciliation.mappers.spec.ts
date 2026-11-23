import { activeLinkDto, conflictCandidateDto, operationDto, ownDeclarationDto, reconciliationLinkDto, sharedCandidateDto, visibleCandidateDto } from '../../../testing/reconciliation';
import { toDecisionResult, toReconciliationLink, toRescanResult, toSelectionResult, toSharedCandidate, toSharedOperation } from './reconciliation.mappers';

describe('reconciliation.mappers', () => {
  it('el vínculo conserva las dos autorizaciones: las propias completas y de la otra empresa solo los dos booleanos', () => {
    const link = toReconciliationLink(activeLinkDto(false, { counterpart_consent: { matching_enabled: true, share_results: false } }));

    expect(link.myConsent).toEqual({ matchingEnabled: true, shareResults: false, updatedAt: '2026-11-20T15:30:00Z' });
    expect(link.counterpartConsent).toEqual({ matchingEnabled: true, shareResults: false });
    expect(Object.keys(link.counterpartConsent).sort()).toEqual(['matchingEnabled', 'shareResults']);
    expect([link.status, link.matchingActive, link.resultsShared, link.canScan, link.counterpart.name]).toEqual(['ACTIVE', true, false, true, 'Transportadora B']);
  });

  it('un vínculo nuevo parte sin permisos, sin fecha de cambio y sin recomendar la búsqueda; ENDED se reconoce', () => {
    const link = toReconciliationLink(reconciliationLinkDto({ my_consent: { matching_enabled: false, share_results: false } }));

    expect(link.myConsent.updatedAt).toBeNull();
    expect(link.rescanRecommended).toBeFalse();
    expect(toReconciliationLink(reconciliationLinkDto({ status: 'ENDED', rescan_recommended: true })).status).toBe('ENDED');
    expect(toReconciliationLink(reconciliationLinkDto({ rescan_recommended: true })).rescanRecommended).toBeTrue();
  });

  it('con la contraparte oculta (`counterpart: null`) el candidato no trae ningún valor de la otra empresa', () => {
    const item = toSharedCandidate(sharedCandidateDto());

    expect(item.counterpart).toBeNull();
    expect(item.counterpartName).toBe('Transportadora B');
    expect(item.matches).toEqual(['origin', 'destination']);
    expect(item.operation).toBeNull();
  });

  it('con la contraparte visible convierte los decimales y deja la placa enmascarada tal como llega', () => {
    const item = toSharedCandidate(visibleCandidateDto());

    expect(item.counterpart).toEqual(jasmine.objectContaining({ plateMasked: '***123', kgCo2: 3100.5, distanceKm: 415.5, tripDate: '2026-10-14' }));
    expect(item.counterpart?.consumption).toEqual({ quantity: 310, unit: 'gal' });
    expect(item.counterpart?.origin).toEqual({ code: '11001', label: 'BOGOTÁ, D.C.' });
    expect(Object.keys(item.counterpart!)).not.toContain('plate');
    expect(Object.keys(item.counterpart!)).not.toContain('tripId');
  });

  it('la declaración propia llega completa; un dato ausente o vacío es null, nunca 0', () => {
    const own = toSharedCandidate(sharedCandidateDto({ own: ownDeclarationDto({ service_id: 'SRV-9', cargo_ton: '12.5000' }) })).own;

    expect([own.serviceId, own.cargoTon, own.kgCo2, own.distanceKm, own.plate, own.rowNumber]).toEqual(['SRV-9', 12.5, 3030, 415.5, 'ABC123', 14]);

    const empty = toSharedCandidate(sharedCandidateDto({ own: ownDeclarationDto({ distance_km: null, kg_co2: '', cargo_ton: null, consumption: { quantity: null, unit: null } }) })).own;

    expect([empty.distanceKm, empty.kgCo2, empty.cargoTon, empty.consumption.quantity]).toEqual([null, null, null, null]);
  });

  it('un estado o una decisión desconocidos no afirman nada resuelto: el estado es posible coincidencia y la decisión, ninguna', () => {
    const item = toSharedCandidate(sharedCandidateDto({ status: 'RARO', my_decision: 'RARO', counterpart_decision: null }));

    expect(item.status).toBe('POSSIBLE_MATCH');
    expect(item.myDecision).toBeNull();
    expect(toSharedCandidate(sharedCandidateDto({ status: 'DISTINCT', my_decision: 'DISTINCT' })).myDecision).toBe('DISTINCT');
  });

  it('la operación en conflicto conserva el lado (A/B) elegido por cada empresa y el vigente', () => {
    const item = toSharedCandidate(conflictCandidateDto({ my_side: 'B', operation: operationDto({ my_selection: 'B', counterpart_selection: 'A', effective_selection: null }) }));

    expect(item.mySide).toBe('B');
    expect(item.conflictFields).toEqual(['consumption', 'co2_kg']);
    expect(item.operation).toEqual(jasmine.objectContaining({ mySelection: 'B', counterpartSelection: 'A', effectiveSelection: null, state: 'PENDING' }));
    expect(toSharedOperation(operationDto({ my_selection: 'X', state: 'EFFECTIVE' }))).toEqual(jasmine.objectContaining({ mySelection: null, state: 'EFFECTIVE' }));
  });

  it('los resultados de decidir, elegir y buscar usan los nombres de dominio', () => {
    expect(toDecisionResult({ updated: 2, unchanged: 1, confirmed: 1, conflicting: 1, items: [{ id: 'c', status: 'CONFLICTING_DATA', my_decision: 'SAME', disagreement: false, conflict_fields: ['fuel_type'] }] })).toEqual({
      updated: 2,
      unchanged: 1,
      confirmed: 1,
      conflicting: 1,
      items: [{ id: 'c', status: 'CONFLICTING_DATA', myDecision: 'SAME', disagreement: false, conflictFields: ['fuel_type'] }],
    });
    expect(toSelectionResult({ updated: 1, unchanged: 0, effective: 1 })).toEqual({ updated: 1, unchanged: 0, effective: 1 });
    expect(toRescanResult({ candidates_created: 3, completed: false })).toEqual({ candidatesCreated: 3, completed: false });
  });

  it('data_comparison y superseded se conservan; un valor desconocido o ausente es «sin dato», nunca coincide ni difiere', () => {
    expect(toSharedCandidate(sharedCandidateDto({ data_comparison: 'not_shared', superseded: true }))).toEqual(jasmine.objectContaining({ dataComparison: 'not_shared', superseded: true }));
    expect(toSharedCandidate(sharedCandidateDto({ data_comparison: 'identical' })).dataComparison).toBe('identical');
    expect(toSharedCandidate(sharedCandidateDto({ data_comparison: 'raro' })).dataComparison).toBeNull();

    const bare = sharedCandidateDto();

    delete (bare as { data_comparison?: unknown }).data_comparison;
    delete (bare as { superseded?: unknown }).superseded;
    expect(toSharedCandidate(bare)).toEqual(jasmine.objectContaining({ dataComparison: null, superseded: false }));
  });
});
