import { candidateDto, choiceDto, choiceResultDto, counterpartDto, pendingPlaceDto, resolutionDto, undoResultDto } from '../../../testing/places';
import { toPlaceChoice, toPlaceChoiceBody, toPlaceChoiceResult, toPlaceChoiceUndoResult, toPlaceResolution } from './places.mappers';

describe('places.mappers', () => {
  it('mapea la resolución con candidatos, evidencia y rutas; los decimales llegan como texto', () => {
    const r = toPlaceResolution(resolutionDto({ resolved_by_choice: [{ place_text: 'X', place_key: 'x', municipality_code: '05664', municipality_name: 'San Pedro de los Milagros', department: 'Antioquia', trips: 4 }], reprocess_hint: { places: 2, trips: 9 } }));
    const p = r.pending[0];

    expect(r.pendingPlaces).toBe(1);
    expect(r.pendingTrips).toBe(102);
    expect(r.resolvedByChoice[0].trips).toBe(4);
    expect(r.reprocessHint).toEqual({ places: 2, trips: 9 });
    expect(p.placeText).toBe('SAN PEDRO, ANTIOQUIA');
    expect(p.candidates.map((c) => c.code)).toEqual(['05664', '05665']);
    expect(p.candidates[0].routes).toEqual([{ counterpartCode: '05001', km: 48.3 }]);
    expect(p.candidates[1].routes[0].km).toBeNull();
    expect(p.counterpartsAsOrigin[0]).toEqual(jasmine.objectContaining({ name: 'Medellín', trips: 90, tripsWithFileDistance: 80, avgFileDistanceKm: 51.2 }));
  });

  it('un promedio del archivo vacío es «sin dato», nunca 0', () => {
    const r = toPlaceResolution(resolutionDto({ pending: [pendingPlaceDto({ counterparts_as_origin: [counterpartDto({ avg_file_distance_km: null, trips_with_file_distance: 0 })] })] }));

    expect(r.pending[0].counterpartsAsOrigin[0].avgFileDistanceKm).toBeNull();
  });

  it('valores nuevos del servidor no rompen: motivo → desconocido, tipo → municipio, coincidencia → contiene, alcance → carga', () => {
    const r = toPlaceResolution(resolutionDto({ pending: [pendingPlaceDto({ reason: 'NEW', candidates: [candidateDto({ kind: 'X', match: 'Y' })] })] }));

    expect(r.pending[0].reason).toBe('UNKNOWN_MUNICIPALITY');
    expect(r.pending[0].candidates[0]).toEqual(jasmine.objectContaining({ kind: 'MUNICIPALITY', match: 'CONTAINS' }));
    expect(toPlaceChoiceResult(choiceResultDto({ scope: 'OTHER' })).scope).toBe('IMPORT');
  });

  it('la decisión existente de un lugar y la lista sin candidatos se conservan', () => {
    const r = toPlaceResolution(resolutionDto({ pending: [pendingPlaceDto({ choice: choiceDto({ note: 'ok' }), candidates: [] })] }));

    expect(r.pending[0].choice).toEqual(jasmine.objectContaining({ municipalityCode: '05664', note: 'ok' }));
    expect(r.pending[0].candidates).toEqual([]);
  });

  it('la decisión: persona eliminada y sin nota llegan como null', () => {
    expect(toPlaceChoice(choiceDto({ chosen_by: null, note: null }))).toEqual(jasmine.objectContaining({ chosenBy: null, note: null }));
  });

  it('el cuerpo del PUT solo lleva nota y carga si existen', () => {
    expect(toPlaceChoiceBody({ placeText: 'T', municipalityCode: '05664', note: null, importFileId: null })).toEqual({ place_text: 'T', municipality_code: '05664' });
    expect(toPlaceChoiceBody({ placeText: 'T', municipalityCode: '05664', note: 'n', importFileId: 'imp-1' })).toEqual({ place_text: 'T', municipality_code: '05664', note: 'n', import_file_id: 'imp-1' });
  });

  it('resultados de decidir y de deshacer', () => {
    expect(toPlaceChoiceResult(choiceResultDto({ other_trips_pending: 7, changed: false }))).toEqual(jasmine.objectContaining({ created: true, changed: false, scope: 'IMPORT', tripsUpdated: 102, tripsRecalculated: 98, nowCalculated: 95, stillPending: 3, otherTripsPending: 7 }));
    expect(toPlaceChoiceUndoResult(undoResultDto())).toEqual({ removed: true, tripsReverted: 102, tripsRecalculated: 95 });
  });
});
