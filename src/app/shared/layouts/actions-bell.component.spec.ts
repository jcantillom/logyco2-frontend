import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { NOTIFICATIONS_URL, notificationDto } from '../../../testing/notifications';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { pagedBody } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { NotificationsFacade } from '../../features/notifications/notifications.facade';
import { ActionsBellComponent, BellAlert } from './actions-bell.component';

@Component({ imports: [ActionsBellComponent], template: '<app-actions-bell [alerts]="alerts" [pending]="pending" [withNotifications]="withNotifications" />' })
class HostComponent {
  alerts: readonly BellAlert[] = [{ label: 'Invitaciones pendientes', hint: 'Esperan aceptación.', count: 2, path: '/usuarios' }];
  pending = 2;
  withNotifications = false;
}

describe('ActionsBellComponent: acciones pendientes', () => {
  let fixture: ComponentFixture<HostComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = (selector: string): HTMLElement | null => el().querySelector<HTMLElement>(selector);

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: provideTestApp() });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('la insignia muestra solo las acciones pendientes', () => {
    expect(q('[data-testid="bell-count"]')).toBeNull();
    expect(q('.count')!.textContent!.trim()).toBe('2');
    expect(q('[data-testid="bell"]')!.getAttribute('aria-label')).toBe('Acciones pendientes: 2');
  });

  it('el panel lista las acciones con su cantidad y no tiene sección de notificaciones', () => {
    q('[data-testid="bell"]')!.click();
    fixture.detectChanges();

    expect(q('[data-testid="bell-panel"]')!.getAttribute('aria-label')).toBe('Acciones pendientes');
    expect(q('[data-testid="bell-panel"] li a')!.textContent).toContain('Invitaciones pendientes');
    expect(q('[data-testid="bell-notifications"]')).toBeNull();
    expect(q('[data-testid="mark-all"]')).toBeNull();
    expect(el().textContent).not.toMatch(/Notificaciones|Marcar todas/);
  });

  it('sin acciones dice que todo está al día', () => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.alerts = [];
    fixture.componentInstance.pending = 0;
    fixture.detectChanges();
    q('[data-testid="bell"]')!.click();
    fixture.detectChanges();

    expect(q('[data-testid="bell-empty"]')!.textContent).toContain('Todo al día');
    expect(q('.count')).toBeNull();
  });

  it('no consulta notificaciones: abrir el panel no hace ninguna petición', () => {
    q('[data-testid="bell"]')!.click();
    fixture.detectChanges();

    TestBed.inject(HttpTestingController).expectNone(() => true);
    expect(q('[data-testid="notification"]')).toBeNull();
  });

  it('sin avisos activos no inicia ni consulta nada de avisos, ni siquiera al cambiar de empresa', () => {
    const http = TestBed.inject(HttpTestingController);
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);
    fixture.detectChanges();

    http.expectNone((r) => r.url.includes('/notifications'));
  });
});

describe('ActionsBellComponent: campana unificada con avisos', () => {
  let fixture: ComponentFixture<HostComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const listRequest = () => http.expectOne((r) => r.url === NOTIFICATIONS_URL && r.method === 'GET');
  const twoNotices = () => [notificationDto(), notificationDto({ id: 'n-2', kind: 'VEHICLES_CHANGED', title: 'Revisa tus vehículos', read_at: '2026-03-02T08:00:00Z', payload: { import_id: 'imp-2', new: 0, changed: 2 } })];

  function render(unread = 2, pending = 3): void {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.pending = pending;
    fixture.componentInstance.withNotifications = true;
    fixture.detectChanges();
    http.expectOne(`${NOTIFICATIONS_URL}/unread-count`).flush({ data: { count: unread } });
    fixture.detectChanges();
  }

  function openPanel(items = twoNotices(), total = items.length, unread = 2): void {
    q<HTMLButtonElement>('[data-testid="bell"]')!.click();
    fixture.detectChanges();
    http.expectOne(`${NOTIFICATIONS_URL}/unread-count`).flush({ data: { count: unread } });
    listRequest().flush(pagedBody(items, total, 20));
    fixture.detectChanges();
  }

  afterEach(() => http?.match(() => true));

  it('un solo botón: el contador suma avisos sin leer y acciones pendientes, y el nombre accesible lo dice', () => {
    render(2, 3);

    expect(qa('[data-testid="bell"]').length).toBe(1);
    expect(text('[data-testid="bell-count"]')).toBe('5');
    expect(q('[data-testid="bell"]')!.getAttribute('aria-label')).toBe('Notificaciones: 2 avisos sin leer, 3 acciones pendientes');
  });

  it('el contador se limita a 99+ y sin nada dice «Sin notificaciones»', () => {
    render(120, 3);
    expect(text('[data-testid="bell-count"]')).toBe('99+');

    TestBed.resetTestingModule();
    render(0, 0);
    expect(q('[data-testid="bell-count"]')).toBeNull();
    expect(q('[data-testid="bell"]')!.getAttribute('aria-label')).toBe('Sin notificaciones');
  });

  it('el panel tiene dos pestañas con su contador y abre en «Avisos» si hay sin leer', () => {
    render();
    openPanel();

    expect(q('[role="tablist"]')).not.toBeNull();
    expect(qa('[role="tab"]').map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(text('[data-testid="tab-notices-count"]')).toBe('2');
    expect(text('[data-testid="tab-pending-count"]')).toBe('3');
    expect(q('[data-testid="bell"]')!.getAttribute('aria-expanded')).toBe('true');
    expect(qa('[data-testid="notification"]').length).toBe(2);
  });

  it('abre en «Pendientes» si no hay avisos sin leer pero sí pendientes, y en «Avisos» si tampoco hay pendientes', () => {
    render(0, 3);
    openPanel([], 0, 0);
    expect(q('[data-testid="tab-pending"]')!.getAttribute('aria-selected')).toBe('true');
    expect(q('[data-testid="bell-panel"] li a')!.textContent).toContain('Invitaciones pendientes');

    TestBed.resetTestingModule();
    render(0, 0);
    openPanel([], 0, 0);
    expect(q('[data-testid="tab-notices"]')!.getAttribute('aria-selected')).toBe('true');
  });

  it('las flechas, Inicio y Fin mueven entre pestañas con foco y tabindex itinerante', () => {
    render();
    openPanel();
    const key = (name: string): void => {
      q('[role="tab"][tabindex="0"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
      fixture.detectChanges();
    };

    key('ArrowRight');
    expect(q('[data-testid="tab-pending"]')!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(q('[data-testid="tab-pending"]'));
    expect(q('[data-testid="tab-pending"]')!.getAttribute('tabindex')).toBe('0');
    expect(q('[data-testid="tab-notices"]')!.getAttribute('tabindex')).toBe('-1');
    key('ArrowLeft');
    expect(q('[data-testid="tab-notices"]')!.getAttribute('aria-selected')).toBe('true');
    key('End');
    expect(q('[data-testid="tab-pending"]')!.getAttribute('aria-selected')).toBe('true');
    key('Home');
    expect(q('[data-testid="tab-notices"]')!.getAttribute('aria-selected')).toBe('true');
  });

  it('«Avisos» muestra título, texto y punto de no leído; «Pendientes» lista las acciones con su cantidad', () => {
    render();
    openPanel();
    const rows = qa('[data-testid="notification"]');

    expect(rows[0].textContent).toContain('Vehículos nuevos en tu carga');
    expect(rows[0].textContent).toContain('La carga trae 2 vehículos nuevos para registrar.');
    expect(rows[0].querySelector('[data-testid="unread-dot"]')).not.toBeNull();
    expect(rows[1].querySelector('[data-testid="unread-dot"]')).toBeNull();

    q('[data-testid="tab-pending"]')!.click();
    fixture.detectChanges();

    expect(q('[data-testid="bell-panel"] li a')!.textContent).toContain('Invitaciones pendientes');
    expect(q('[data-testid="notification"]')).toBeNull();
  });

  it('sin avisos muestra el estado vacío, y cargando muestra «Cargando…»', () => {
    render(0, 0);
    q<HTMLButtonElement>('[data-testid="bell"]')!.click();
    fixture.detectChanges();
    http.expectOne(`${NOTIFICATIONS_URL}/unread-count`).flush({ data: { count: 0 } });

    expect(text('[data-testid="notifications-loading"]')).toBe('Cargando…');

    listRequest().flush(pagedBody([]));
    fixture.detectChanges();

    expect(text('[data-testid="notifications-empty"]')).toBe('No tienes avisos.');
  });

  it('un error al cargar la lista se dice con su mensaje y se puede reintentar', () => {
    render();
    q<HTMLButtonElement>('[data-testid="bell"]')!.click();
    fixture.detectChanges();
    http.expectOne(`${NOTIFICATIONS_URL}/unread-count`).flush({ data: { count: 2 } });
    listRequest().flush({ error: { code: 'SERVICE_UNAVAILABLE' } }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();

    expect(q('[data-testid="notifications-error"]')!.getAttribute('role')).toBe('alert');
    q<HTMLButtonElement>('.retry')!.click();
    listRequest().flush(pagedBody([notificationDto()]));
    fixture.detectChanges();

    expect(qa('[data-testid="notification"]').length).toBe(1);
  });

  it('sin scroll interno: muestra los 5 más recientes y resume el resto; «Marcar todas» marca todos', () => {
    render(8, 0);
    const items = Array.from({ length: 8 }, (_, i) => notificationDto({ id: `n-${i + 1}`, title: `Aviso ${i + 1}` }));
    openPanel(items, 8, 8);

    expect(qa('[data-testid="notification"]').length).toBe(5);
    expect(qa('[data-testid="notification"]')[4].textContent).toContain('Aviso 5');
    expect(text('[data-testid="notifications-older"]')).toBe('Hay 3 avisos más antiguos');
    expect(q('[data-testid="notifications-older"] a, [data-testid="notifications-older"] button')).toBeNull();

    q<HTMLButtonElement>('[data-testid="mark-all"]')!.click();
    http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/read-all` }).flush({ data: { updated: 8 } });
    fixture.detectChanges();

    expect(q('[data-testid="bell-count"]')).toBeNull();
    expect(q<HTMLButtonElement>('[data-testid="mark-all"]')!.disabled).toBeTrue();
    expect(qa('[data-testid="unread-dot"]').length).toBe(0);
  });

  it('con cinco avisos o menos no muestra la línea de avisos más antiguos', () => {
    render();
    openPanel();

    expect(q('[data-testid="notifications-older"]')).toBeNull();
  });

  it('un aviso lo marca leído y navega a /cargas con ?import=<id> de su carga', () => {
    render();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    openPanel();

    qa('[data-testid="notification"]')[0].click();
    http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/n-1/read` }).flush({ data: {} });
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledOnceWith(['/cargas'], { queryParams: { import: 'imp-1' } });
    expect(q('[data-testid="bell-panel"]')).toBeNull();
    expect(text('[data-testid="bell-count"]')).toBe('4');
  });

  it('un aviso POSSIBLE_DUPLICATES muestra el texto del servidor con su ícono propio, lo marca leído y abre /calidad (no la revisión de la carga)', () => {
    render();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const body = 'Se encontraron 12 operaciones que podrían estar repetidas. Revísalas antes de incorporarlas al cálculo de emisiones. Archivo: «x».';

    openPanel([notificationDto({ id: 'n-9', kind: 'POSSIBLE_DUPLICATES', title: 'Posibles operaciones repetidas por revisar', body, payload: { import_id: 'imp-7', new: 0, changed: 0, possible_duplicates: 12 } })], 1, 1);

    expect(text('[data-testid="notification"] strong')).toBe('Posibles operaciones repetidas por revisar');
    expect(text('[data-testid="notification"] .txt > span:not(.when)')).toBe(body);
    expect(q('[data-testid="notification"] .ico path')!.getAttribute('d')).not.toBe(q('.bell path')!.getAttribute('d'));

    q('[data-testid="notification"]')!.click();
    http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/n-9/read` }).flush({ data: {} });
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledOnceWith(['/calidad']);
    expect(q('[data-testid="bell-panel"]')).toBeNull();
  });

  it('un aviso de un viaje registrado a mano (import_kind MANUAL) abre /calidad y nunca /cargas', () => {
    render();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    openPanel([notificationDto({ id: 'n-7', kind: 'VEHICLES_NEW', payload: { import_id: 'imp-manual', new: 1, changed: 0, import_kind: 'MANUAL' } })], 1, 1);

    q('[data-testid="notification"]')!.click();
    http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/n-7/read` }).flush({ data: {} });
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledOnceWith(['/calidad']);
  });

  it('un aviso SHARED_OPERATIONS muestra el texto agrupado del servidor con su ícono propio, lo marca leído y abre /calidad en la pestaña de operaciones compartidas', () => {
    render();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const body = 'Se identificaron 12 posibles viajes compartidos con una empresa vinculada. Revísalos antes de incorporarlos a un consolidado.';

    openPanel([notificationDto({ id: 'n-8', kind: 'SHARED_OPERATIONS', title: 'Posibles viajes compartidos por revisar', body, payload: { import_id: 'imp-7', possible_shared: 12 } })], 1, 1);

    expect(text('[data-testid="notification"] strong')).toBe('Posibles viajes compartidos por revisar');
    expect(text('[data-testid="notification"] .txt > span:not(.when)')).toBe(body);
    expect(q('[data-testid="notification"] .ico path')!.getAttribute('d')).not.toBe(q('.bell path')!.getAttribute('d'));

    q('[data-testid="notification"]')!.click();
    http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/n-8/read` }).flush({ data: {} });
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledOnceWith(['/calidad'], { queryParams: { tab: 'compartidas' } });
    expect(q('[data-testid="bell-panel"]')).toBeNull();
  });

  it('si marcar como leído falla igual navega a la revisión', () => {
    render();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    openPanel();

    qa('[data-testid="notification"]')[1].click();
    http.expectOne({ method: 'POST', url: `${NOTIFICATIONS_URL}/n-2/read` }).flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'Error' });

    expect(navigate).toHaveBeenCalledOnceWith(['/cargas'], { queryParams: { import: 'imp-2' } });
  });

  it('Escape cierra el panel y devuelve el foco a la campana; un clic fuera también lo cierra', () => {
    render();
    openPanel();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(q('[data-testid="bell-panel"]')).toBeNull();
    expect(document.activeElement).toBe(q('[data-testid="bell"]'));

    openPanel();
    document.body.click();
    fixture.detectChanges();

    expect(q('[data-testid="bell-panel"]')).toBeNull();
  });

  it('cualquier navegación cierra el panel y refresca el conteo por la facade', () => {
    render();
    openPanel();
    const refresh = spyOn(TestBed.inject(NotificationsFacade), 'refresh');

    (TestBed.inject(Router).events as Subject<unknown>).next(new NavigationEnd(1, '/', '/'));
    fixture.detectChanges();

    expect(q('[data-testid="bell-panel"]')).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('al destruirse detiene el seguimiento de avisos', () => {
    render();
    const stop = spyOn(TestBed.inject(NotificationsFacade), 'stop');

    fixture.destroy();

    expect(stop).toHaveBeenCalled();
  });

  it('al cambiar de empresa se vuelve a pedir el conteo y se cierra el panel', () => {
    render();
    openPanel();

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);
    fixture.detectChanges();

    http.expectOne(`http://api.test/api/v1/organizations/${ORG_COORDINADORA.id}/notifications/unread-count`).flush({ data: { count: 7 } });
    fixture.detectChanges();

    expect(q('[data-testid="bell-panel"]')).toBeNull();
    expect(text('[data-testid="bell-count"]')).toBe('10');
  });
});
