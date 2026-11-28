import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, importDetailDto } from '../../../testing/imports';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { ImportCargoUnitFacade } from './import-cargo-unit.facade';

const URL = `${IMPORTS_URL}/imp-1/cargo-unit`;
const result = (overrides: object = {}): object => ({ data: { unit: 'KG', confirmed_at: '2026-03-02T09:30:00Z', rows_updated: 180, rows_converted: 178, unchanged: false, ...overrides } });

describe('ImportCargoUnitFacade', () => {
  let facade: ImportCargoUnitFacade;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(ImportCargoUnitFacade);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.match(() => true));

  const flushReload = (): void => {
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` }).flush({ data: importDetailDto() });
  };

  it('confirmar kg envía la unidad, guarda el resultado y vuelve a pedir la carga', () => {
    facade.confirm('imp-1', 'KG');

    expect(facade.busy()).toBe('KG');
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ unit: 'KG' });
    req.flush(result());
    flushReload();

    expect(facade.busy()).toBeNull();
    expect(facade.outcome()).toEqual({ importId: 'imp-1', unit: 'KG', result: jasmine.objectContaining({ rowsConverted: 178, unchanged: false }) });
    expect(facade.error()).toBeNull();
  });

  it('«Mantener como está» envía TON', () => {
    facade.confirm('imp-1', 'TON');

    expect(http.expectOne(URL).request.body).toEqual({ unit: 'TON' });
  });

  it('un segundo clic mientras se envía no repite la llamada', () => {
    facade.confirm('imp-1', 'KG');
    facade.confirm('imp-1', 'KG');

    expect(http.match(URL).length).toBe(1);
  });

  it('repetir la misma elección: el servidor responde unchanged y la pantalla lo conserva', () => {
    facade.confirm('imp-1', 'KG');
    http.expectOne(URL).flush(result({ unchanged: true, rows_updated: 0, rows_converted: 0 }));
    flushReload();

    expect(facade.outcome()!.result.unchanged).toBeTrue();
  });

  it('CARGO_UNIT_NOT_PROPOSED muestra el texto del catálogo y recarga la revisión (la propuesta cambió)', () => {
    facade.confirm('imp-1', 'KG');
    http.expectOne(URL).flush({ error: { code: 'CARGO_UNIT_NOT_PROPOSED', message: 'x' } }, { status: 409, statusText: 'Conflict' });
    flushReload();

    expect(facade.error()!.message).toContain('ya no tiene una conversión de kilogramos');
    expect(facade.outcome()).toBeNull();
    expect(facade.busy()).toBeNull();
  });

  it('al cambiar de empresa se descarta lo mostrado', () => {
    facade.confirm('imp-1', 'KG');
    http.expectOne(URL).flush(result());
    flushReload();

    TestBed.inject(ContextResetRegistry).resetAll();

    expect(facade.outcome()).toBeNull();
    expect(facade.error()).toBeNull();
  });
});
