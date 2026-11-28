import { dataOriginShareDto, inventoryCoverageDto, methodologyDto, methodologyRef } from '../../../testing/methodology';
import { toDataOriginShare, toInventoryCoverage, toMethodology, toMethodologyRef } from './methodology.mappers';

describe('methodology.mappers', () => {
  it('la referencia compacta pasa a camelCase y `has_estimates` ausente es falso', () => {
    expect(toMethodologyRef({ id: 'X', version: '1', scope_label: 'a', unit: 'b', has_estimates: true })).toEqual(methodologyRef({ id: 'X', version: '1', scopeLabel: 'a', unit: 'b' }));
    expect(toMethodologyRef({ id: 'X', version: '1', scope_label: 'a', unit: 'b' })?.hasEstimates).toBeFalse();
    expect(toMethodologyRef(undefined)).toBeNull();
  });

  it('el reparto conserva los pct del servidor (incluido `null`), las fuentes solo donde llegan y claves desconocidas sin romper', () => {
    const dto = dataOriginShareDto();
    const share = toDataOriginShare({ ...dto, buckets: [...(dto.buckets ?? []), { key: 'FUTURE_ORIGIN', pct: null }] });

    expect(share?.buckets.map((b) => b.pct)).toEqual([50, 25.1, 0, 24.9, null]);
    expect(share?.buckets[3].sources.map((s) => s.source)).toEqual(['UPME', 'Steer/ANDI']);
    expect(share?.buckets[0].sources).toEqual([]);
    expect(share?.buckets[4]).toEqual({ key: 'FUTURE_ORIGIN', label: 'FUTURE_ORIGIN', meaning: '', kgCo2: 0, trips: 0, pct: null, sources: [] });
    expect(share?.hasVerifiedData).toBeFalse();
    expect(toDataOriginShare(null)).toBeNull();
  });

  it('la cobertura pasa a dominio y tolera bloques ausentes', () => {
    expect(toInventoryCoverage(inventoryCoverageDto())).toEqual(jasmine.objectContaining({ eligibleTrips: 18, coveragePct: 66.7, excluded: { heldTrips: 3, duplicateTrips: 1, voidedTrips: 0 } }));
    expect(toInventoryCoverage({ coverage_pct: null })?.coveragePct).toBeNull();
    expect(toInventoryCoverage({})?.kg.heldKgCo2).toBe(0);
    expect(toInventoryCoverage(undefined)).toBeNull();
  });

  it('las etiquetas de unidad y los factores usados llegan del servidor y son nulables', () => {
    const m = toMethodology(methodologyDto());

    expect(m.factors.map((f) => f.unitLabel)).toEqual(['kg CO₂/gal', 'kg CO₂/gal', 'kg CO₂/gal', null, 'kg CO₂/gal']);
    expect(m.usedFactors.length).toBe(4);
    expect(m.usedFactors[2]).toEqual(jasmine.objectContaining({ unitLabel: null, referenceYear: null, trips: 1 }));
    expect(toMethodology({ current: { declaration: { id: 'A', version: '2' }, used_factors: [{ fuel_code: 'X' }] } }).usedFactors[0]).toEqual({ fuelCode: 'X', value: '', unit: null, unitLabel: null, sourceName: null, sourceDocument: null, referenceYear: null, trips: 0, kgCo2: '' });
  });

  it('la declaración conserva los textos del servidor y tolera campos ausentes', () => {
    const m = toMethodology(methodologyDto());

    expect(m.declaration.reviewStatus).toBe('PENDING_LOGYCA_APPROVAL');
    expect(m.declaration.notClaimed.length).toBe(2);
    expect(m.factors[4]).toEqual(jasmine.objectContaining({ value: null, usableForCalculation: false }));

    const bare = toMethodology({ current: { declaration: { id: 'A', version: '2' } } });

    expect(bare.declaration.referenceStandards).toEqual([]);
    expect(bare.declaration.notClaimed).toEqual([]);
    expect(bare.factors).toEqual([]);
    expect(bare.usedFactors).toEqual([]);
  });
});
