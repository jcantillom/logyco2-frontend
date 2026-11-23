import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { FOOTPRINT_URL, footprintDto } from '../../../testing/footprint';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { FootprintFacade } from './footprint.facade';

describe('FootprintFacade', () => {
  let facade: FootprintFacade;
  let http: HttpTestingController;
  const request = (): TestRequest => http.expectOne((r) => r.url === FOOTPRINT_URL);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(FootprintFacade);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.match(() => true));

  it('un periodo pide la huella con from y to, pasa por «cargando» y deja el dominio en `footprint`', () => {
    facade.load({ from: '2026-10-01', to: '2026-11-30' });
    const r = request();

    expect(facade.footprint.status()).toBe('loading');
    expect([r.request.params.get('from'), r.request.params.get('to')]).toEqual(['2026-10-01', '2026-11-30']);
    r.flush({ data: footprintDto() });
    expect(facade.footprint.status()).toBe('ready');
    expect(facade.footprint.data()?.totals.tripsCalculated).toBe(12);
  });

  it('«todos» no envía from ni to', () => {
    facade.load('ALL');
    const r = request();

    expect(r.request.params.has('from') || r.request.params.has('to')).toBeFalse();
    r.flush({ data: footprintDto() });
  });

  it('cambiar de periodo vuelve a pedir y muestra «cargando» otra vez', () => {
    facade.load({ from: '2026-10-01', to: '2026-11-30' });
    request().flush({ data: footprintDto() });
    facade.load({ from: '2026-01-01', to: '2026-03-31' });

    expect(facade.footprint.status()).toBe('loading');
    expect(request().request.params.get('from')).toBe('2026-01-01');
  });

  it('con `background` conserva los datos y no pasa por «cargando» (renovación sin parpadeo)', () => {
    facade.load('ALL');
    request().flush({ data: footprintDto() });
    facade.reload({ background: true });

    expect(facade.footprint.status()).toBe('ready');
    request().flush({ data: footprintDto({ totals: { ...footprintDto().totals, trips_calculated: 13 } }) });
    expect(facade.footprint.data()?.totals.tripsCalculated).toBe(13);
  });

  it('un error queda en `error` y `reload` reintenta con el último periodo pedido', () => {
    facade.load({ from: '2026-10-01', to: '2026-11-30' });
    request().flush({ error: { code: 'X' } }, { status: 500, statusText: 'Server Error' });

    expect(facade.footprint.status()).toBe('error');
    facade.reload();
    const r = request();

    expect(r.request.params.get('from')).toBe('2026-10-01');
    r.flush({ data: footprintDto() });
    expect(facade.footprint.status()).toBe('ready');
  });

  it('al cambiar de empresa se limpia la huella', () => {
    facade.load('ALL');
    request().flush({ data: footprintDto() });
    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.footprint.data()).toBeNull();
  });

  it('sin empresa activa no pide nada', () => {
    TestBed.inject(SessionStore).setUser(buildUser({ memberships: [] }));
    facade.load('ALL');

    http.expectNone((r) => r.url === FOOTPRINT_URL);
    expect(facade.footprint.status()).toBe('idle');
  });
});
