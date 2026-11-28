import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, importDetailDto } from '../../../testing/imports';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { ImportEfficiencyFacade } from './import-efficiency.facade';

const URL = `${IMPORTS_URL}/imp-1/efficiency-estimation`;
const body = (overrides: object = {}): object => ({ data: { mode: 'ASK', estimate_efficiency: true, vehicles_estimated: 8, trips_calculated: 80, trips_still_pending: 5, next_cursor: null, ...overrides } });

describe('ImportEfficiencyFacade', () => {
  let facade: ImportEfficiencyFacade;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(ImportEfficiencyFacade);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.match(() => true));

  const flushReload = (): void => {
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` }).flush({ data: importDetailDto() });
  };

  it('consentir «sí» envía estimate_efficiency=true, guarda lo que estimó el servidor y recarga la carga', () => {
    facade.consent('imp-1', true);

    expect(facade.busy()).toBeTrue();
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ estimate_efficiency: true });
    req.flush(body());
    flushReload();

    expect(facade.busy()).toBeNull();
    expect(facade.outcome()!.result).toEqual(jasmine.objectContaining({ vehiclesEstimated: 8, tripsCalculated: 80, tripsStillPending: 5 }));
  });

  it('un «no» también se envía (queda registrado) y no estima nada', () => {
    facade.consent('imp-1', false);
    const req = http.expectOne(URL);

    expect(req.request.body).toEqual({ estimate_efficiency: false });
    req.flush(body({ estimate_efficiency: false, vehicles_estimated: 0, trips_calculated: 0 }));
    flushReload();

    expect(facade.outcome()!.result.estimateEfficiency).toBeFalse();
  });

  it('no repite la llamada mientras hay una en curso', () => {
    facade.consent('imp-1', true);
    facade.consent('imp-1', false);

    expect(http.match(URL).length).toBe(1);
  });

  for (const [code, status, text] of [
    ['ESTIMATION_MODE_OFF', 409, 'apagada en los ajustes'],
    ['ESTIMATION_DISABLED', 404, 'no está disponible por ahora'],
    ['ORGANIZATION_ACCESS_DENIED', 403, 'No tienes acceso'],
  ] as const) {
    it(`${code}: muestra el texto del catálogo, no deja resultado y recarga la revisión`, () => {
      facade.consent('imp-1', true);
      http.expectOne(URL).flush({ error: { code, message: 'x' } }, { status, statusText: 'x' });
      flushReload();

      expect(facade.error()!.message).toContain(text);
      expect(facade.outcome()).toBeNull();
      expect(facade.busy()).toBeNull();
    });
  }

  it('al cambiar de empresa se descarta el resultado', () => {
    facade.consent('imp-1', true);
    http.expectOne(URL).flush(body());
    flushReload();
    TestBed.inject(ContextResetRegistry).resetAll();

    expect(facade.outcome()).toBeNull();
  });
});
