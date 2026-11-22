import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { HomeFacade } from './home.facade';

describe('HomeFacade', () => {
  const ORG = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}`;
  const org = { id: ORG_ENVIA.id, name: 'ENVIA', legal_name: 'ENVIA SAS', tax_id: '900-1', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', types: [{ code: 'CARRIER', name: 'Transportador' }], active_admins: 1, pending_invitations: 0 };
  let facade: HomeFacade;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA)] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(HomeFacade);
    http = TestBed.inject(HttpTestingController);
  });

  it('las acciones pendientes salen de los datos reales de la empresa', () => {
    facade.load();
    http.expectOne(ORG).flush({ data: { ...org, legal_name: null, tax_id: null, pending_invitations: 2 } });
    http.expectOne(`${ORG}/links/summary`).flush({ data: { active: 0, pending_received: 0, pending_sent: 0, external: 0 } });

    expect(facade.actions().map((a) => a.label)).toEqual(['Invitaciones pendientes', 'Datos de la empresa incompletos']);
    expect(facade.pending()).toBe(4); // 2 invitaciones + 2 datos faltantes
  });

  it('las solicitudes de vinculación recibidas son una acción con enlace directo', () => {
    facade.load();
    http.expectOne(ORG).flush({ data: org });
    http.expectOne(`${ORG}/links/summary`).flush({ data: { active: 1, pending_received: 2, pending_sent: 0, external: 0 } });

    const action = facade.actions().find((a) => a.label === 'Solicitudes de vinculación')!;

    expect(action.count).toBe(2);
    expect(action.path).toBe('/mi-empresa');
    expect(action.query).toEqual({ tab: 'links', sub: 'solicitudes', view: 'received' });
  });

  it('pide la empresa una sola vez aunque se llame varias veces', () => {
    facade.load();
    facade.load();

    expect(http.match(ORG).length).toBe(1);
    http.match(() => true);
  });
});
