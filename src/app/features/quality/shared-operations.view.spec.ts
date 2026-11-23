import { toSharedCandidate } from '../../infrastructure/mappers/reconciliation.mappers';
import { conflictCandidateDto, operationDto, ownDeclarationDto, sharedCandidateDto, visibleCandidateDto } from '../../../testing/reconciliation';
import { AMBIGUOUS_NOTE, bilateralStatus, comparisonLine, isAmbiguous, isDecidable, canSelect, decisionMessage, evidenceLabels, ruleSentence, selectionMessage, selectionStatus, sharedFields, sideFor, sideOwner } from './shared-operations.view';

describe('shared-operations.view', () => {
  it('la frase de la regla M1 dice qué coincide y la de M2 dice que falta un identificador compartido', () => {
    expect(ruleSentence({ rule: 'M1', strength: 'STRONG' })).toBe('Coinciden el ID de servicio, la fecha y la placa.');
    expect(ruleSentence({ rule: 'M2', strength: 'WEAK' })).toBe('Coinciden fecha, placa y ruta; falta un identificador compartido.');
  });

  it('los nombres de campo de la evidencia se traducen a etiquetas claras y uno desconocido se muestra tal cual', () => {
    expect(evidenceLabels(['service_id', 'origin', 'kg_co2', 'raro'])).toEqual(['ID de servicio', 'Origen', 'Emisiones (kg CO₂)', 'raro']);
  });

  it('sin contraparte ningún campo ajeno se rellena: `other` es null en todas las filas', () => {
    const fields = sharedFields(toSharedCandidate(sharedCandidateDto({ evidence: { matches: [], differs: ['consumption'] } })));

    expect(fields.every((f) => f.other === null)).toBeTrue();
    expect(fields.find((f) => f.key === 'consumption')?.differs).toBeTrue();
    expect(fields.find((f) => f.key === 'plate')?.own).toBe('ABC123');
  });

  it('con contraparte visible muestra su placa enmascarada y destaca lo que difiere o está en conflicto', () => {
    const fields = sharedFields(toSharedCandidate(conflictCandidateDto()));
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));

    expect(byKey['plate'].other).toBe('***123');
    expect(byKey['consumption'].differs).toBeTrue();
    expect(byKey['emissions'].differs).toBeTrue();
    expect(byKey['distance'].differs).toBeFalse();
    expect(byKey['emissions'].own).toContain('3.030');
    expect(byKey['emissions'].other).toContain('3.100,5');
  });

  it('muestra el ID de servicio y el peso propios solo si existen, y la fila de su archivo', () => {
    const bare = sharedFields(toSharedCandidate(sharedCandidateDto())).map((f) => f.key);
    const full = sharedFields(toSharedCandidate(sharedCandidateDto({ own: ownDeclarationDto({ service_id: 'SRV-9', cargo_ton: '12.5' }) }))).map((f) => f.key);

    expect(bare).not.toContain('serviceId');
    expect(bare).not.toContain('weight');
    expect(full).toContain('serviceId');
    expect(full).toContain('weight');
    expect(bare).toContain('row');
  });

  it('el estado bilateral usa palabras claras para cada decisión y avisa del desacuerdo y de la aclaración pedida', () => {
    expect(bilateralStatus({ myDecision: null, counterpartDecision: 'SAME', disagreement: false, status: 'POSSIBLE_MATCH' })).toEqual({ mine: 'Tu empresa: pendiente', other: 'La otra empresa: ya confirmó que es el mismo viaje', note: null });
    expect(bilateralStatus({ myDecision: 'DISTINCT', counterpartDecision: 'SAME', disagreement: true, status: 'POSSIBLE_MATCH' }).note).toContain('decidieron distinto');
    expect(bilateralStatus({ myDecision: 'SAME', counterpartDecision: 'NEEDS_INFO', disagreement: false, status: 'POSSIBLE_MATCH' })).toEqual(jasmine.objectContaining({ other: 'La otra empresa: solicitó una aclaración', note: 'La otra empresa pidió una aclaración sobre este viaje.' }));
  });

  it('«mi declaración» es el lado propio (A o B) y «la de la otra empresa» el contrario', () => {
    expect(sideFor('A', 'MINE')).toBe('A');
    expect(sideFor('A', 'THEIRS')).toBe('B');
    expect(sideFor('B', 'MINE')).toBe('B');
    expect(sideFor('B', 'THEIRS')).toBe('A');
    expect(sideOwner('B', 'B')).toBe('MINE');
    expect(sideOwner('B', 'A')).toBe('THEIRS');
    expect(sideOwner('A', null)).toBeNull();
  });

  it('la elección se lee desde la propia empresa según `mySide` y solo es vigente cuando el servidor lo dice', () => {
    const pending = selectionStatus(toSharedCandidate(conflictCandidateDto({ my_side: 'B', operation: operationDto({ my_selection: 'B', counterpart_selection: null }) })))!;

    expect(pending.mine).toBe('Tu empresa: tu declaración');
    expect(pending.other).toBe('La otra empresa: aún no eligió');
    expect(pending.summary).toContain('Solo se aplica cuando ambas');

    const effective = selectionStatus(toSharedCandidate(conflictCandidateDto({ my_side: 'B', operation: operationDto({ my_selection: 'B', counterpart_selection: 'B', effective_selection: 'B', state: 'EFFECTIVE' }) })))!;

    expect(effective.summary).toContain('Ambas empresas eligieron tu declaración');
    expect(selectionStatus(toSharedCandidate(sharedCandidateDto()))).toBeNull();
  });

  it('elegir exige conflicto con operación y los valores de la otra empresa a la vista', () => {
    expect(canSelect(toSharedCandidate(conflictCandidateDto()))).toBeTrue();
    expect(canSelect(toSharedCandidate(conflictCandidateDto({ counterpart: null })))).toBeFalse();
    expect(canSelect(toSharedCandidate(conflictCandidateDto({ operation: null })))).toBeFalse();
    expect(canSelect(toSharedCandidate(conflictCandidateDto({ data_comparison: 'not_shared' })))).toBeFalse();
    expect(canSelect(toSharedCandidate(visibleCandidateDto()))).toBeFalse();
  });

  it('el mensaje al confirmar «mismo viaje» dice si ya quedó confirmado o si falta la otra empresa', () => {
    const waiting = { updated: 1, unchanged: 0, confirmed: 0, conflicting: 0, items: [{ id: 'a', status: 'POSSIBLE_MATCH' as const, myDecision: 'SAME' as const, disagreement: false, conflictFields: [] }] };
    const confirmed = { updated: 1, unchanged: 0, confirmed: 1, conflicting: 1, items: [{ id: 'a', status: 'CONFLICTING_DATA' as const, myDecision: 'SAME' as const, disagreement: false, conflictFields: ['co2_kg'] }] };

    expect(decisionMessage('SAME', waiting, 1)).toContain('hasta que la otra empresa confirme');
    expect(decisionMessage('SAME', confirmed, 1)).toContain('1 coincidencia quedó confirmada');
    expect(decisionMessage('SAME', confirmed, 1)).toContain('1 quedó en conflicto de cifras');
    expect(decisionMessage('SAME', { ...waiting, items: [{ ...waiting.items[0], disagreement: true }] }, 1)).toContain('en desacuerdo');
    expect(decisionMessage('SAME', { updated: 0, unchanged: 2, confirmed: 0, conflicting: 0, items: [] }, 2)).toBe('No hubo cambios: 2 ya estaban registrados.');
    expect(decisionMessage('NEEDS_INFO', { ...waiting, updated: 3 }, 3)).toContain('Pediste una aclaración sobre 3 viajes');
    expect(decisionMessage('KEEP_PENDING', waiting, 1)).toContain('Quedó pendiente');
  });

  it('el mensaje al elegir es veraz: efectiva solo si el servidor lo dice, si no, falta la otra empresa', () => {
    expect(selectionMessage({ updated: 1, unchanged: 0, effective: 1 })).toContain('quedó como la vigente');
    expect(selectionMessage({ updated: 1, unchanged: 0, effective: 0 })).toContain('Solo se aplicará cuando la otra empresa');
    expect(selectionMessage({ updated: 0, unchanged: 1, effective: 0 })).toContain('No hubo cambios');
  });

  it('la línea de cifras no insinúa nada cuando no se comparten: «no se comparan» (not_shared), «coinciden» (identical) y nada si está pendiente', () => {
    expect(comparisonLine({ dataComparison: 'not_shared' })).toBe('Las cifras no se comparan porque no se comparten resultados entre las dos empresas.');
    expect(comparisonLine({ dataComparison: 'identical' })).toBe('Las cifras coinciden.');
    expect(comparisonLine({ dataComparison: 'conflict' })).toBeNull();
    expect(comparisonLine({ dataComparison: null })).toBeNull();
  });

  it('`ambiguous_group` tiene etiqueta llana y se reconoce; un par sustituido (superseded) no es decidible', () => {
    expect(evidenceLabels(['ambiguous_group'])).toEqual(['Viajes repetidos ese día']);
    expect(isAmbiguous(toSharedCandidate(sharedCandidateDto({ evidence: { matches: ['ambiguous_group'], differs: [] } })))).toBeTrue();
    expect(isAmbiguous(toSharedCandidate(sharedCandidateDto()))).toBeFalse();
    expect(AMBIGUOUS_NOTE).toBe('Hay varios viajes iguales ese día; el emparejamiento es por orden y hay que revisarlo.');
    expect(isDecidable(toSharedCandidate(sharedCandidateDto({ superseded: true })))).toBeFalse();
    expect(isDecidable(toSharedCandidate(sharedCandidateDto()))).toBeTrue();
  });
});
