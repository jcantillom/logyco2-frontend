import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ORG_ENVIA } from '../../../testing/builders';
import { NOTIFICATIONS_URL, notificationDto } from '../../../testing/notifications';
import { provideTestApp } from '../../../testing/providers';
import { pagedBody } from '../../../testing/vehicles';
import { NotificationsRepository } from '../../domain/repositories/notifications.repositories';

const ORG = ORG_ENVIA.id;

describe('HttpNotificationsRepository', () => {
  let repo: NotificationsRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    repo = TestBed.inject(NotificationsRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list: GET con página y tamaño y avisos mapeados', () => {
    let page: { total: number; items: readonly unknown[] } | undefined;
    repo.list(ORG, { page: 1, pageSize: 20 }).subscribe((p) => (page = p));

    const req = http.expectOne((r) => r.url === NOTIFICATIONS_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('page_size')).toBe('20');
    req.flush(pagedBody([notificationDto(), notificationDto({ id: 'n-2', kind: 'VEHICLES_CHANGED', read_at: '2026-03-02T08:00:00Z', payload: { import_id: 'imp-2', new: 0, changed: 3 } })]));

    expect(page!.total).toBe(2);
    expect(page!.items).toEqual([
      { id: 'n-1', kind: 'VEHICLES_NEW', title: 'Vehículos nuevos en tu carga', body: 'La carga trae 2 vehículos nuevos para registrar.', payload: { importId: 'imp-1', new: 2, changed: 0 }, createdAt: '2026-03-01T10:02:00Z', readAt: null },
      jasmine.objectContaining({ id: 'n-2', kind: 'VEHICLES_CHANGED', readAt: '2026-03-02T08:00:00Z', payload: { importId: 'imp-2', new: 0, changed: 3 } }),
    ]);
  });

  it('un tipo desconocido se trata como aviso de cambios', () => {
    let kind = '';
    repo.list(ORG, { page: 1, pageSize: 20 }).subscribe((p) => (kind = p.items[0].kind));

    http.expectOne((r) => r.url === NOTIFICATIONS_URL).flush(pagedBody([notificationDto({ kind: 'RARO' })]));

    expect(kind).toBe('VEHICLES_CHANGED');
  });

  it('unreadCount: GET /unread-count y devuelve el número', () => {
    let count = -1;
    repo.unreadCount(ORG).subscribe((n) => (count = n));

    const req = http.expectOne(`${NOTIFICATIONS_URL}/unread-count`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: { count: 4 } });

    expect(count).toBe(4);
  });

  it('markRead: POST /{id}/read con el id codificado', () => {
    let done = false;
    repo.markRead(ORG, 'n 1').subscribe(() => (done = true));

    const req = http.expectOne(`${NOTIFICATIONS_URL}/n%201/read`);
    expect(req.request.method).toBe('POST');
    req.flush({ data: notificationDto({ read_at: '2026-03-02T08:00:00Z' }) });

    expect(done).toBeTrue();
  });

  it('markAllRead: POST /read-all', () => {
    let done = false;
    repo.markAllRead(ORG).subscribe(() => (done = true));

    const req = http.expectOne(`${NOTIFICATIONS_URL}/read-all`);
    expect(req.request.method).toBe('POST');
    req.flush({ data: { updated: 3 } });

    expect(done).toBeTrue();
  });

  it('la empresa se codifica en la ruta', () => {
    repo.unreadCount('a/b').subscribe();

    http.expectOne('http://api.test/api/v1/organizations/a%2Fb/notifications/unread-count').flush({ data: { count: 0 } });
  });
});
