import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { notificationDto, pagedBody, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { NotificationsFacade } from '../../features/notifications/notifications.facade';
import { ActionsBellComponent, BellAlert } from './actions-bell.component';

@Component({ imports: [ActionsBellComponent], template: '<app-actions-bell [alerts]="alerts" [pending]="pending" [notifications]="notifications" />' })
class HostComponent {
  alerts: readonly BellAlert[] = [{ label: 'Invitaciones pendientes', hint: 'Esperan aceptación.', count: 2, path: '/usuarios' }];
  pending = 2;
  notifications = true;
}

const LIST = `${VEHICLES_ORG_URL}/notifications`;
const COUNT = `${LIST}/unread-count`;

describe('ActionsBellComponent: notificaciones y acciones pendientes', () => {
  let fixture: ComponentFixture<HostComponent>;
  let http: HttpTestingController;
  let navigate: jasmine.Spy;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function render(notifications = true, unread = 3): void {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.notifications = notifications;
    fixture.detectChanges();

    if (notifications) {
      TestBed.inject(NotificationsFacade).loadUnread();
      http.expectOne(COUNT).flush({ data: { count: unread } });
    }

    fixture.detectChanges();
  }

  function openPanel(items = [notificationDto(), notificationDto({ id: 'n-2', read: true, severity: 'WARNING', title: 'Hay inconsistencias' })]): void {
    q('[data-testid="bell"]')!.click();
    fixture.detectChanges();
    http.expectOne(COUNT).flush({ data: { count: 3 } });
    http.expectOne((r) => r.url === LIST).flush(pagedBody(items));
    fixture.detectChanges();
  }

  afterEach(() => TestBed.inject(NotificationsFacade).stop());

  it('la insignia suma las notificaciones sin leer y las acciones pendientes', () => {
    render();

    expect(text('[data-testid="bell-count"]')).toBe('5');
    expect(q('[data-testid="bell"]')!.getAttribute('aria-label')).toBe('Notificaciones y acciones pendientes: 5');
  });

  it('sin notificaciones activas (consola de plataforma) la campana es la de siempre', () => {
    render(false);

    expect(text('[data-testid="bell-count"]')).toBe('2');
    expect(q('[data-testid="bell"]')!.getAttribute('aria-label')).toBe('Acciones pendientes: 2');
    q('[data-testid="bell"]')!.click();
    fixture.detectChanges();
    expect(q('[data-testid="bell-notifications"]')).toBeNull();
    http.expectNone(LIST);
  });

  it('al abrir el panel carga la lista y muestra «Notificaciones» y «Acciones pendientes»', () => {
    render();
    openPanel();

    const sections = Array.from(el().querySelectorAll('[data-testid="bell-panel"] > section strong')).map((s) => s.textContent!.trim());
    expect(sections).toContain('Notificaciones');
    expect(sections).toContain('Acciones pendientes');
    expect(el().querySelectorAll('[data-testid="notification"]').length).toBe(2);
  });

  it('muestra punto de no leída, título, descripción, severidad y tiempo relativo', () => {
    render();
    openPanel();
    const [first, second] = Array.from(el().querySelectorAll('[data-testid="notification"]'));

    expect(first.querySelector('[data-testid="unread-dot"]')).not.toBeNull();
    expect(first.textContent).toContain('Vehículos nuevos por confirmar');
    expect(first.textContent).toContain('Se detectaron 3 vehículos nuevos.');
    expect(first.querySelector('.sev')!.classList).toContain('INFO');
    expect(first.querySelector('.when')!.textContent).toMatch(/^(hace|\d)/);
    expect(second.querySelector('[data-testid="unread-dot"]')).toBeNull();
    expect(second.querySelector('.sev')!.classList).toContain('WARNING');
    expect(second.classList).toContain('read');
  });

  it('al hacer clic marca como leída (POST read) y navega al enlace con su query', () => {
    render();
    openPanel();

    q('[data-testid="notification"]')!.click();
    http.expectOne({ method: 'POST', url: `${LIST}/n-1/read` }).flush({ data: notificationDto({ read: true }) });
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/vehiculos'], { queryParams: { analysis: 'run-1' } });
    expect(q('[data-testid="bell-panel"]')).toBeNull();
    expect(text('[data-testid="bell-count"]')).toBe('4');
  });

  it('un enlace que no es una ruta interna no se sigue (solo se marca como leída)', () => {
    render();
    openPanel([notificationDto({ deep_link: { path: 'https://evil.test/x', query: {} } })]);

    q('[data-testid="notification"]')!.click();
    http.expectOne({ method: 'POST', url: `${LIST}/n-1/read` }).flush({ data: notificationDto({ read: true }) });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('si marcar como leída falla, igual navega', () => {
    render();
    openPanel();

    q('[data-testid="notification"]')!.click();
    http.expectOne({ method: 'POST', url: `${LIST}/n-1/read` }).flush({ error: { code: 'NOTIFICATION_NOT_FOUND' } }, { status: 404, statusText: 'x' });

    expect(navigate).toHaveBeenCalled();
  });

  it('«Marcar todas como leídas» pone todo en leído y el conteo en cero; deshabilitado sin no leídas', () => {
    render();
    openPanel();

    q('[data-testid="mark-all"]')!.click();
    http.expectOne({ method: 'POST', url: `${LIST}/read-all` }).flush({ data: { updated: 1 } });
    fixture.detectChanges();

    expect(el().querySelectorAll('[data-testid="unread-dot"]').length).toBe(0);
    expect(q<HTMLButtonElement>('[data-testid="mark-all"]')!.disabled).toBeTrue();
    expect(text('[data-testid="bell-count"]')).toBe('2');
  });

  it('sin notificaciones muestra «No tienes notificaciones»', () => {
    render(true, 0);
    openPanel([]);

    expect(text('[data-testid="notifs-empty"]')).toBe('No tienes notificaciones');
  });

  it('si la lista falla muestra el error con «Reintentar»', () => {
    render();
    q('[data-testid="bell"]')!.click();
    fixture.detectChanges();
    http.expectOne(COUNT).flush({ data: { count: 3 } });
    http.expectOne((r) => r.url === LIST).flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'x' });
    fixture.detectChanges();

    expect(text('[data-testid="notifs-error"]')).toContain('Ocurrió un error interno');
    q('[data-testid="notifs-error"] button')!.click();
    http.expectOne((r) => r.url === LIST).flush(pagedBody([notificationDto()]));
    fixture.detectChanges();
    expect(el().querySelectorAll('[data-testid="notification"]').length).toBe(1);
  });

  it('al cambiar de empresa se descartan lista y conteo', () => {
    render();
    openPanel();

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);
    fixture.detectChanges();

    expect(TestBed.inject(NotificationsFacade).list.data()).toBeNull();
    expect(text('[data-testid="bell-count"]')).toBe('2');
  });

  it('las acciones pendientes siguen listándose con su cantidad', () => {
    render();
    openPanel();

    expect(text('[data-testid="bell-panel"] li a')).toContain('Invitaciones pendientes');
  });
});
