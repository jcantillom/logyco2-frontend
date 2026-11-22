import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { notificationDto, pagedBody, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { toNotification } from '../../infrastructure/mappers/vehicles.mappers';
import { NotificationsFacade, UNREAD_REFRESH_MS, internalLink } from './notifications.facade';
import { relativeTime } from './relative-time';

const COUNT = `${VEHICLES_ORG_URL}/notifications/unread-count`;

describe('NotificationsFacade', () => {
  let facade: NotificationsFacade;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_VIEWER'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(NotificationsFacade);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    facade.stop();
    http.verify();
  });

  it('start pide el conteo de no leídas ya y lo renueva cada 60 s', fakeAsync(() => {
    facade.start();
    http.expectOne(COUNT).flush({ data: { count: 3 } });
    expect(facade.unreadCount()).toBe(3);

    tick(UNREAD_REFRESH_MS - 1);
    http.expectNone(COUNT);
    tick(1);
    http.expectOne(COUNT).flush({ data: { count: 4 } });
    expect(facade.unreadCount()).toBe(4);

    tick(UNREAD_REFRESH_MS);
    http.expectOne(COUNT).flush({ data: { count: 4 } });
    facade.stop();
  }));

  it('con la pestaña oculta no renueva; al volver a verse consulta y reanuda el intervalo', fakeAsync(() => {
    const hidden = spyOnProperty(document, 'hidden').and.returnValue(false);

    facade.start();
    http.expectOne(COUNT).flush({ data: { count: 0 } });

    hidden.and.returnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    tick(UNREAD_REFRESH_MS * 3);
    http.expectNone(COUNT);

    hidden.and.returnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    http.expectOne(COUNT).flush({ data: { count: 2 } });
    tick(UNREAD_REFRESH_MS);
    http.expectOne(COUNT).flush({ data: { count: 3 } });
    expect(facade.unreadCount()).toBe(3);
    facade.stop();
  }));

  it('stop limpia el temporizador y deja de escuchar la visibilidad', fakeAsync(() => {
    facade.start();
    http.expectOne(COUNT).flush({ data: { count: 1 } });
    facade.stop();
    tick(UNREAD_REFRESH_MS * 2);
    document.dispatchEvent(new Event('visibilitychange'));

    http.expectNone(COUNT);
    expect(facade.unreadCount()).toBe(1);
  }));

  it('al cambiar de empresa descarta conteo y lista, y start vuelve a pedir para la nueva', fakeAsync(() => {
    facade.start();
    http.expectOne(COUNT).flush({ data: { count: 5 } });
    facade.loadList();
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/notifications`).flush(pagedBody([notificationDto()]));

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.unread.data()).toBeNull();
    expect(facade.list.data()).toBeNull();
    expect(facade.unreadCount()).toBe(0);

    facade.start();
    http.expectOne(`http://api.test/api/v1/organizations/${ORG_COORDINADORA.id}/notifications/unread-count`).flush({ data: { count: 1 } });
    expect(facade.unreadCount()).toBe(1);
    facade.stop();
  }));

  it('la lista pide la primera página, sin filtrar por leídas', () => {
    facade.loadList();
    const req = http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/notifications`);

    expect(req.request.params.has('unread')).toBeFalse();
    expect(req.request.params.get('page')).toBe('1');
    req.flush(pagedBody([notificationDto(), notificationDto({ id: 'n-2', read: true })]));
    expect(facade.list.data()?.items.length).toBe(2);
  });

  it('marcar una como leída actualiza la fila y baja el conteo; si ya estaba leída no lo baja', () => {
    facade.unread.data.set(2);
    facade.loadList();
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/notifications`).flush(pagedBody([notificationDto(), notificationDto({ id: 'n-2', read: true })]));
    const [unread, read] = facade.list.data()!.items;

    facade.markRead(unread).subscribe();
    http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/notifications/n-1/read` }).flush({ data: notificationDto({ read: true }) });
    expect(facade.list.data()!.items[0].read).toBeTrue();
    expect(facade.unreadCount()).toBe(1);

    facade.markRead(read).subscribe();
    http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/notifications/n-2/read` }).flush({ data: notificationDto({ id: 'n-2', read: true }) });
    expect(facade.unreadCount()).toBe(1);
  });

  it('marcar todas deja la lista leída y el conteo en cero', () => {
    facade.unread.data.set(3);
    facade.loadList();
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/notifications`).flush(pagedBody([notificationDto()]));

    facade.markAllRead().subscribe();
    http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/notifications/read-all` }).flush({ data: { updated: 3 } });

    expect(facade.unreadCount()).toBe(0);
    expect(facade.list.data()!.items.every((n) => n.read)).toBeTrue();
  });
});

describe('internalLink', () => {
  const link = (path: string) => internalLink({ path, query: { analysis: 'run-1' } });

  it('acepta rutas internas con su query', () => {
    expect(link('/vehiculos')).toEqual({ path: '/vehiculos', query: { analysis: 'run-1' } });
  });

  it('descarta todo lo que no sea una ruta interna', () => {
    for (const path of ['https://evil.test/x', '//evil.test', 'javascript:alert(1)', 'mailto:a@b.c', 'vehiculos', '/a\\b', '/a\nb', '\\\\host', '']) {
      expect(link(path)).withContext(path).toBeNull();
    }
  });

  it('el mapper entrega el enlace tal como lo manda el servidor', () => {
    expect(internalLink(toNotification(notificationDto()).deepLink)?.path).toBe('/vehiculos');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-03-10T12:00:00Z').getTime();
  const ago = (ms: number): string => new Date(now - ms).toISOString();

  it('expresa el tiempo transcurrido en español', () => {
    expect(relativeTime(ago(10_000), now)).toBe('hace un momento');
    expect(relativeTime(ago(5 * 60_000), now)).toBe('hace 5 min');
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe('hace 3 h');
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe('hace 2 d');
    expect(relativeTime(ago(30 * 86_400_000), now)).toMatch(/2026/);
    expect(relativeTime('no es fecha', now)).toBe('');
  });
});
