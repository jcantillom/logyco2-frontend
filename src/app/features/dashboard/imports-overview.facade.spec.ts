import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { importCountsDto, importPeriodDto } from '../../../testing/imports';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { ImportsOverviewFacade } from './imports-overview.facade';

describe('ImportsOverviewFacade', () => {
  const URL = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}/imports`;
  const recent = importPeriodDto({ period_from: '2026-04-01', period_to: '2026-06-30' });
  const older = importPeriodDto({ period_from: '2026-01-05', period_to: '2026-03-28' });
  let facade: ImportsOverviewFacade;
  let http: HttpTestingController;
  const countsRequest = (): TestRequest => http.expectOne((r) => r.url === `${URL}/counts`);
  const flushPeriods = (list: unknown[]): void => http.expectOne(`${URL}/periods`).flush({ data: list });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(ImportsOverviewFacade);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.match(() => true));

  it('la selección por defecto es el periodo más reciente y los conteos se piden con ese periodo', () => {
    facade.load();
    http.expectNone((r) => r.url === `${URL}/counts`);
    flushPeriods([recent, older]);
    const counts = countsRequest();

    expect(facade.selection()).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(counts.request.params.get('period_from')).toBe('2026-04-01');
    expect(counts.request.params.get('period_to')).toBe('2026-06-30');
    counts.flush({ data: importCountsDto({ rows_read: 10 }) });
    expect(facade.counts.data()?.rowsRead).toBe(10);
  });

  it('sin periodos la selección es «todos» y los conteos se piden sin filtro', () => {
    facade.load();
    flushPeriods([]);
    const counts = countsRequest();

    expect(facade.selection()).toBe('ALL');
    expect(counts.request.params.has('period_from')).toBeFalse();
  });

  it('elegir otro periodo o «todos» vuelve a pedir los conteos con esos parámetros', () => {
    facade.load();
    flushPeriods([recent, older]);
    countsRequest().flush({ data: importCountsDto() });

    facade.select({ from: '2026-01-05', to: '2026-03-28' });
    expect(facade.counts.status()).toBe('loading');
    const second = countsRequest();
    expect(second.request.params.get('period_from')).toBe('2026-01-05');
    second.flush({ data: importCountsDto() });

    facade.select('ALL');
    const all = countsRequest();
    expect(all.request.params.has('period_from')).toBeFalse();
    all.flush({ data: importCountsDto() });
    expect(facade.selection()).toBe('ALL');
  });

  it('al volver a cargar conserva la elección (incluido «todos») si todavía existe', () => {
    facade.load();
    flushPeriods([recent, older]);
    countsRequest().flush({ data: importCountsDto() });
    facade.select({ from: '2026-01-05', to: '2026-03-28' });
    countsRequest().flush({ data: importCountsDto() });

    facade.load();
    flushPeriods([recent, older]);
    expect(countsRequest().request.params.get('period_from')).toBe('2026-01-05');
  });

  it('si el periodo elegido desaparece de la lista vuelve al más reciente', () => {
    facade.load();
    flushPeriods([recent, older]);
    countsRequest().flush({ data: importCountsDto() });
    facade.select({ from: '2026-01-05', to: '2026-03-28' });
    countsRequest().flush({ data: importCountsDto() });

    facade.load();
    flushPeriods([recent]);
    const counts = countsRequest();

    expect(facade.selection()).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(counts.request.params.get('period_from')).toBe('2026-04-01');
  });

  it('si falla la lista de periodos igual pide los conteos, sin filtro', () => {
    facade.load();
    http.expectOne(`${URL}/periods`).flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'x' });

    expect(facade.periods.status()).toBe('error');
    expect(countsRequest().request.params.has('period_from')).toBeFalse();
  });

  it('al cambiar de empresa se descarta la selección y todo lo cargado', () => {
    facade.load();
    flushPeriods([recent, older]);
    countsRequest().flush({ data: importCountsDto() });
    facade.select({ from: '2026-01-05', to: '2026-03-28' });
    countsRequest().flush({ data: importCountsDto() });

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.selection()).toBe('ALL');
    expect(facade.periods.data()).toBeNull();
    expect(facade.counts.data()).toBeNull();
  });

  it('el recargo de los conteos usa la selección vigente', () => {
    facade.load();
    flushPeriods([recent]);
    countsRequest().flush({ data: importCountsDto() });

    facade.reloadCounts();
    expect(countsRequest().request.params.get('period_from')).toBe('2026-04-01');
  });
});
