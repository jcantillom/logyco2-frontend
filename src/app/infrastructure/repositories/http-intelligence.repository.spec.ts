import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTestApp } from '../../../testing/providers';
import { IndicatorCard } from '../../domain/models/intelligence';
import { IntelligenceRepository } from '../../domain/repositories/intelligence.repositories';

const API = 'http://api.test/api/v1/intelligence';
const source = { code: 'DANE_ICTC', name: 'ICTC', publisher: 'DANE', url: 'https://www.dane.gov.co', license: null };

describe('HttpIntelligenceRepository', () => {
  let http: HttpTestingController;
  let repository: IntelligenceRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    repository = TestBed.inject(IntelligenceRepository);
  });
  afterEach(() => http.verify());

  it('el resumen conserva fuente, período, unidad, variaciones y fechas (las de calendario como fecha local)', () => {
    let card: IndicatorCard | undefined;
    repository.summary().subscribe((s) => (card = s.featured[0]));
    http.expectOne(`${API}/summary`).flush({ data: { generated_at: '2026-11-18T10:00:00Z', featured: [{
      code: 'ICTC_TOTAL', name: 'ICTC · Total nacional', category: 'LOGISTICS_COST', unit: 'Índice (dic. 2015 = 100)', status: 'AVAILABLE', value: 163.81,
      area_code: 'CO', area_name: 'Colombia', reference_period: '2026-09-01', published_at: '2026-10-21', acquired_at: '2026-11-18T09:00:00Z',
      valid_from: null, valid_to: null, kind: 'OFFICIAL', source, variation: { monthly_pct: 0.1, annual_pct: 6.13, year_to_date_pct: 4.2 },
      last_success_at: '2026-11-18T09:00:00Z', last_error_code: null,
    }] } });

    expect(card!.value).toBe(163.81);
    expect(card!.unit).toContain('dic. 2015');
    expect([card!.referencePeriod!.getFullYear(), card!.referencePeriod!.getMonth(), card!.referencePeriod!.getDate()]).toEqual([2026, 8, 1]);
    expect(card!.publishedAt!.getDate()).toBe(21);
    expect(card!.variation).toEqual({ monthlyPct: 0.1, annualPct: 6.13, yearToDatePct: 4.2, previousPct: null, previousDate: null });
    expect(card!.source.publisher).toBe('DANE');
  });

  it('los precios CREG conservan la circular, la vigencia y la variación frente a la publicación anterior', () => {
    let card: IndicatorCard | undefined;
    repository.summary().subscribe((s) => (card = s.featured[0]));
    http.expectOne(`${API}/summary`).flush({ data: { generated_at: '2026-11-18T10:00:00Z', featured: [{
      code: 'FUEL_ACPM_PRICE', name: 'Precio del ACPM', category: 'ENERGY_MARKET', unit: 'COP/galón', status: 'AVAILABLE', value: 11616, area_code: '11001', area_name: 'Bogotá',
      reference_period: '2026-11-01', published_at: '2026-10-30', acquired_at: '2026-11-18T09:00:00Z', valid_from: '2026-11-01', valid_to: null, kind: 'OFFICIAL',
      source_url: 'https://gestornormativo.creg.gov.co/gestor/entorno/docs/originales/Circular_CREG_371_2026/', source_reference: 'Circular CREG 371 de 2026',
      source: { ...source, code: 'CREG_FUEL_PRICES', publisher: 'CREG' },
      variation: { monthly_pct: null, annual_pct: null, year_to_date_pct: null, previous_pct: -0.28, previous_date: '2026-10-02' }, last_success_at: null, last_error_code: null,
    }] } });

    expect(card!.sourceReference).toBe('Circular CREG 371 de 2026');
    expect(card!.sourceUrl).toContain('Circular_CREG_371_2026');
    expect(card!.validFrom!.getDate()).toBe(1);
    expect(card!.variation!.previousPct).toBe(-0.28);
    expect([card!.variation!.previousDate!.getMonth(), card!.variation!.previousDate!.getDate()]).toEqual([9, 2]);
  });

  it('un indicador sin datos llega sin valor (no se inventa ninguno)', () => {
    let value: number | null | undefined;
    repository.summary().subscribe((s) => (value = s.featured[0].value));
    http.expectOne(`${API}/summary`).flush({ data: { generated_at: '2026-11-18T10:00:00Z', featured: [{
      code: 'FUEL_ACPM_PRICE', name: 'Precio del ACPM', category: 'ENERGY_MARKET', unit: 'COP/galón', status: 'NO_DATA', value: null, area_code: null, area_name: null,
      reference_period: null, published_at: null, acquired_at: null, valid_from: null, valid_to: null, kind: null, source, variation: null, last_success_at: null, last_error_code: null,
    }] } });

    expect(value).toBeNull();
  });

  it('el histórico envía el área y la fecha de inicio como parámetros', () => {
    repository.history('FUEL_ACPM_PRICE', { areaCode: '11001', dateFrom: '2023-01-01' }).subscribe();
    const request = http.expectOne((r) => r.url === `${API}/indicators/FUEL_ACPM_PRICE/history`);

    expect([request.request.params.get('area_code'), request.request.params.get('date_from')]).toEqual(['11001', '2023-01-01']);
    request.flush({ data: { code: 'FUEL_ACPM_PRICE', name: 'ACPM', unit: 'COP/galón', area_code: '11001', area_name: 'Bogotá', source, points: [], areas: [] } });
  });

  it('el desglose del ICTC por grupo conserva el período y la variación de cada grupo', () => {
    let first: { name: string; monthlyPct: number | null } | undefined;
    let period: Date | null | undefined;
    repository.ictcGroups().subscribe((g) => { first = g.items[0]; period = g.referencePeriod; });
    http.expectOne(`${API}/ictc/groups`).flush({ data: { reference_period: '2026-09-01', source, items: [{ code: 'ICTC_TOTAL', name: 'Total nacional', value: 163.81, monthly_pct: 0.56, annual_pct: 6.13 }] } });

    expect(first).toEqual(jasmine.objectContaining({ name: 'Total nacional', monthlyPct: 0.56 }));
    expect(period!.getMonth()).toBe(8);
  });

  it('actualizar una fuente es un POST a su ruta y devuelve el resultado de la adquisición', () => {
    let status: string | undefined;
    repository.refreshSource('DANE_ICTC').subscribe((r) => (status = r.status));
    const refresh = http.expectOne(`${API}/sources/DANE_ICTC/refresh`);
    expect(refresh.request.method).toBe('POST');
    refresh.flush({ data: { source_code: 'DANE_ICTC', status: 'SUCCESS', records_seen: 5, inserted: 5, revised: 0, unchanged: 0, error_code: null } });

    expect(status).toBe('SUCCESS');
  });

  it('ya no existe la importación manual de precios', () => {
    expect((repository as unknown as Record<string, unknown>)['importFuelPrices']).toBeUndefined();
  });
});
