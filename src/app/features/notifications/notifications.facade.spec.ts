import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { NOTIFICATIONS_URL, notificationDto } from '../../../testing/notifications';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { pagedBody } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { NotificationsFacade, UNREAD_MIN_GAP_MS, UNREAD_REFRESH_MS } from './notifications.facade';

describe('NotificationsFacade', () => {
  let facade: NotificationsFacade;
  let http: HttpTestingController;
  const unread = (count: number): void => http.expectOne(`${NOTIFICATIONS_URL}/unread-count`).flush({ data: { count } });
  const list = () => http.expectOne((r) => r.url === NOTIFICATIONS_URL && r.method === 'GET');

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(NotificationsFacade);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    facade.stop();
    http.verify();
  });

  it('start pide el conteo ahora y lo renueva cada 60 s', fakeAsync(() => {
    facade.start();
    unread(3);
    expect(facade.unreadCount()).toBe(3);

    tick(UNREAD_REFRESH_MS);
    unread(4);
    expect(facade.unreadCount()).toBe(4);

    facade.stop();
    tick(UNREAD_REFRESH_MS * 2);
    http.expectNone(`${NOTIFICATIONS_URL}/unread-count`);
  }));

  it('con la pestaña oculta no consulta y al volver a verse consulta de inmediato', fakeAsync(() => {
    let hidden = false;
    spyOnProperty(document, 'hidden', 'get').and.callFake(() => hidden);
    facade.start();
    unread(1);

    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    tick(UNREAD_REFRESH_MS * 3);
    http.expectNone(`${NOTIFICATIONS_URL}/unread-count`);

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    unread(2);
    expect(facade.unreadCount()).toBe(2);
    facade.stop();
  }));

  it('refresh (cambio de ruta) no repite la consulta si se acaba de hacer, y sí pasado el intervalo mínimo', fakeAsync(() => {
    facade.start();
    unread(1);

    facade.refresh();
    http.expectNone(`${NOTIFICATIONS_URL}/unread-count`);

    tick(UNREAD_MIN_GAP_MS);
    facade.refresh();
    unread(5);
    expect(facade.unreadCount()).toBe(5);
    facade.stop();
  }));

  it('sin empresa activa no hace peticiones', () => {
    signInAs(buildUser({ memberships: [] }), TestBed.inject(SessionStore));
    facade.loadUnread();
    facade.loadList();

    http.expectNone((r) => r.url.startsWith('http://api.test'));
    expect(facade.unreadCount()).toBe(0);
  });

  it('markRead de uno sin leer baja el conteo y marca el aviso; uno ya leído no lo baja', () => {
    facade.loadUnread();
    unread(2);
    facade.loadList();
    list().flush(pagedBody([notificationDto(), notificationDto({ id: 'n-2', read_at: '2026-03-02T08:00:00Z' })]));

    facade.markRead(facade.list.data()!.items[0]).subscribe();
    http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/n-1/read` }).flush({ data: {} });

    expect(facade.unreadCount()).toBe(1);
    expect(facade.list.data()!.items[0].readAt).not.toBeNull();

    facade.markRead(facade.list.data()!.items[1]).subscribe();
    http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/n-2/read` }).flush({ data: {} });
    expect(facade.unreadCount()).toBe(1);
  });

  it('markAllRead deja el conteo en cero y todos los avisos leídos', () => {
    facade.loadUnread();
    unread(2);
    facade.loadList();
    list().flush(pagedBody([notificationDto(), notificationDto({ id: 'n-2' })]));

    facade.markAllRead().subscribe();
    http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/read-all` }).flush({ data: { updated: 2 } });

    expect(facade.unreadCount()).toBe(0);
    expect(facade.list.data()!.items.every((n) => n.readAt !== null)).toBeTrue();
  });

  it('cambiar de empresa descarta el conteo y la lista', () => {
    facade.loadUnread();
    unread(2);
    facade.loadList();
    list().flush(pagedBody([notificationDto()]));

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.unreadCount()).toBe(0);
    expect(facade.list.data()).toBeNull();
  });

  it('un error al pedir la lista queda en el recurso con su mensaje', () => {
    facade.loadList();
    list().flush({ error: { code: 'FORBIDDEN' } }, { status: 403, statusText: 'Forbidden' });

    expect(facade.list.status()).toBe('error');
    expect(facade.list.error()?.message).toContain('permisos');
  });
});
