import { duplicateTripDto, originalTripDto, possibleDuplicateDto } from '../../../testing/duplicates';
import { toDuplicateTrip, toPossibleDuplicate, toResolutionBody, toResolutionResult } from './duplicates.mappers';

describe('duplicates.mappers', () => {
  it('convierte los decimales que llegan como texto en números y conserva el resto tal cual', () => {
    const trip = toDuplicateTrip(duplicateTripDto());

    expect(trip.consumption).toEqual({ quantity: 300, unit: 'gal' });
    expect(trip.distanceKm).toBe(415.5);
    expect(trip.kgCo2).toBe(3030);
    expect(trip).toEqual(jasmine.objectContaining({ id: 'trip-a1', tripId: 'V-1001', tripDate: '2026-10-14', plate: 'ABC123', fuelType: 'DIESEL', importFileId: 'imp-2', fileName: 'operaciones-octubre.xlsx', rowNumber: 14 }));
    expect(trip.origin).toEqual({ code: '11001', label: 'BOGOTÁ, D.C.' });
  });

  it('un dato ausente o vacío es «sin dato» (null), nunca 0', () => {
    const trip = toDuplicateTrip(duplicateTripDto({ trip_id: null, distance_km: null, kg_co2: '', consumption: { quantity: null, unit: 'gal' }, row_number: null }));

    expect([trip.tripId, trip.distanceKm, trip.kgCo2, trip.consumption?.quantity, trip.rowNumber]).toEqual([null, null, null, null, null]);
    expect(toDuplicateTrip(duplicateTripDto({ consumption: null })).consumption).toBeNull();
  });

  it('el par conserva A, B, la regla del servidor, las diferencias conocidas y la evidencia; un original que ya no existe llega como null', () => {
    const pair = toPossibleDuplicate(possibleDuplicateDto({ differences: ['distance_km', 'raro'] }));

    expect(pair.id).toBe('trip-a1');
    expect(pair.rule).toBe('R2');
    expect(pair.ruleLabel).toBe('Mismo identificador con valores distintos');
    expect(pair.a.id).toBe('trip-a1');
    expect(pair.b?.id).toBe('trip-b1');
    expect(pair.b?.distanceKm).toBe(400);
    expect(pair.differences).toEqual(['distance_km']);
    expect(pair.evidence).toEqual({ identical: false, matches: ['trip_id', 'plate', 'trip_date'], differs: ['distance_km'], kind: null, lineage: null, group: null, idMismatch: false });
    expect(toPossibleDuplicate(possibleDuplicateDto({ b: null, evidence: null })).b).toBeNull();
    expect(toPossibleDuplicate(possibleDuplicateDto({ b: null, evidence: null })).evidence).toBeNull();
    expect(toDuplicateTrip(originalTripDto()).fileName).toBe('operaciones-septiembre.xlsx');
  });

  it('R4 a R6: lee la clase de caso, el linaje y el grupo de la evidencia', () => {
    const pair = toPossibleDuplicate(possibleDuplicateDto({ rule: 'R6', evidence: { identical: false, matches: [], differs: [], kind: 'extra_row', lineage: { established: true, mutual: false, rows: 27, new_pct: 90, previous_pct: 100 }, group: { existing: 3, new: 4 } } }));

    expect(pair.evidence).toEqual({ identical: false, matches: [], differs: [], kind: 'extra_row', lineage: { established: true, mutual: false, rows: 27, newPct: 90, previousPct: 100 }, group: { existing: 3, new: 4 }, idMismatch: false });
  });

  it('`id_mismatch` es un booleano opcional: solo `true` cuenta; ausente o de otra forma es false', () => {
    const read = (value: unknown) => toPossibleDuplicate(possibleDuplicateDto({ rule: 'R5', evidence: { identical: false, matches: [], differs: [], kind: 'correction', id_mismatch: value as boolean } })).evidence!.idMismatch;

    expect(read(true)).toBeTrue();
    expect([read(false), read(undefined), read('true'), read(1), read(null)]).toEqual([false, false, false, false, false]);
  });

  it('una evidencia incompleta o de una clase desconocida no inventa nada: clase, linaje y grupo quedan en null y las reglas nuevas se conservan', () => {
    const odd = toPossibleDuplicate(possibleDuplicateDto({ rule: 'R9', evidence: { identical: true, matches: [], differs: [], kind: 'futuro', lineage: { established: true, mutual: true, rows: 3 } as never, group: { existing: 2 } as never } }));

    expect(odd.rule).toBe('R9');
    expect(odd.evidence).toEqual({ identical: true, matches: [], differs: [], kind: null, lineage: null, group: null, idMismatch: false });
    expect(toPossibleDuplicate(possibleDuplicateDto({ evidence: { identical: true } as never })).evidence).toEqual({ identical: true, matches: [], differs: [], kind: null, lineage: null, group: null, idMismatch: false });
  });

  it('el cuerpo de la resolución usa los nombres del servidor y solo lleva `keep` cuando se elige', () => {
    expect(toResolutionBody({ tripIds: ['a', 7], decision: 'SAME_TRIP', keep: 'NEW' })).toEqual({ trip_ids: ['a', 7], decision: 'SAME_TRIP', keep: 'NEW' });
    expect(toResolutionBody({ tripIds: ['a'], decision: 'DIFFERENT_TRIPS' })).toEqual({ trip_ids: ['a'], decision: 'DIFFERENT_TRIPS' });
    expect('keep' in toResolutionBody({ tripIds: ['a'], decision: 'KEEP_PENDING' })).toBeFalse();
    expect(toResolutionResult({ resolved: 3, skipped: 1, without_result: 2 })).toEqual({ resolved: 3, skipped: 1, withoutResult: 2 });
    expect(toResolutionResult({ resolved: 3, skipped: 1 })).toEqual({ resolved: 3, skipped: 1, withoutResult: 0 });
  });
});
