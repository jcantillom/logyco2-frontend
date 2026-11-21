import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { PlatformUserDetailComponent } from './platform-user-detail.component';

const API = 'http://api.test/api/v1';
const ORG = '33333333-3333-4333-8333-333333333333';
const pag = { page: 1, page_size: 25, total: 1, total_pages: 1, has_next: false, has_previous: false };

describe('PlatformUserDetailComponent', () => {
  let fixture: ComponentFixture<PlatformUserDetailComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PlatformUserDetailComponent], providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(PlatformUserDetailComponent);
    fixture.componentRef.setInput('id', 'u1');
    fixture.detectChanges();
    http.expectOne(`${API}/users/u1`).flush({ data: {
      id: 'u1', full_name: 'Luis Gómez', email: 'luis@x.co', is_active: true, global_roles: [],
      memberships: [
        { membership_id: 'm-1', organization: { id: ORG, name: 'ENVIA' }, status: 'PENDING', roles: ['ORG_ANALYST'] },
        { membership_id: 'm-2', organization: { id: 'o2', name: 'OTRA' }, status: 'REVOKED', roles: ['ORG_VIEWER'] },
      ],
    }, meta: { pagination: pag } });
    fixture.detectChanges();
  });
  it('muestra el perfil sin textos técnicos de contrato', () => {
    const text = el().textContent!;
    expect(text).toContain('Luis Gómez');
    expect(text).toContain('luis@x.co');
    expect(el().querySelector('[data-testid=user-status]')!.textContent).toContain('Pendiente');
    expect(text).not.toContain('GET /users');
    expect(text).not.toContain('contrato pendiente');
    expect(text).not.toContain('REAL');
  });

  it('la identidad muestra su única empresa y su tipo de usuario', () => {
    expect(el().querySelector('[data-testid=user-company]')!.textContent).toContain('ENVIA');
    expect(el().querySelector('.chips')!.textContent).toContain('Analista');
  });

  it('la tabla muestra la membresía vigente y la anterior se marca como historia', () => {
    const rows = Array.from(el().querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' '));
    expect(rows[0]).toContain('ENVIA');
    expect(rows[0]).toContain('Pendiente');
    expect(rows[1]).toContain('anterior');
    expect(rows[1]).toContain('Revocado');
  });

  const menuItems = (membershipId: string): string[] => {
    el().querySelector<HTMLButtonElement>(`[data-testid="menu-${membershipId}"]`)!.click();
    fixture.detectChanges();

    return Array.from(el().querySelectorAll('[role="menuitem"]')).map((b) => b.textContent!.trim());
  };

  it('cada membresía tiene su menú de tres puntos: la pendiente ofrece aprobar y rechazar, la revocada ofrece eliminar', () => {
    expect(menuItems('m-1')).toEqual(['Aprobar', 'Rechazar']);
    expect(menuItems('m-2')).toEqual(['Anular revocación', 'Eliminar']);
  });

  it('aprobar desde el menú pide confirmación y envía ACTIVE; cancelar no envía nada', async () => {
    const approve = (): HTMLButtonElement => {
      menuItems('m-1');

      return Array.from(el().querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find((b) => b.textContent!.trim() === 'Aprobar')!;
    };

    approve().click();
    TestBed.inject(ConfirmService).pending()!.resolve(false);
    await fixture.whenStable();
    expect(http.match((r) => r.method === 'PATCH').length).toBe(0);

    approve().click();
    TestBed.inject(ConfirmService).pending()!.resolve(true);
    await fixture.whenStable();
    const patch = http.expectOne(`${API}/organizations/${ORG}/memberships/m-1`);
    expect(patch.request.body).toEqual({ status: 'ACTIVE' });
  });

  it('anular la revocación pide confirmación y envía ACTIVE a esa membresía', async () => {
    menuItems('m-2');
    Array.from(el().querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find((b) => b.textContent!.trim() === 'Anular revocación')!.click();
    const ask = TestBed.inject(ConfirmService).pending()!;
    expect(ask.message).toContain('Anular la revocación de la membresía de Luis Gómez en OTRA');
    ask.resolve(true);
    await fixture.whenStable();

    const patch = http.expectOne(`${API}/organizations/o2/memberships/m-2`);
    expect(patch.request.body).toEqual({ status: 'ACTIVE' });
  });

  it('eliminar una membresía revocada pide confirmación y la borra en el servidor', async () => {
    menuItems('m-2');
    el().querySelector<HTMLButtonElement>('[data-testid="remove-membership"]')!.click();
    TestBed.inject(ConfirmService).pending()!.resolve(true);
    await fixture.whenStable();

    const request = http.expectOne((r) => r.method === 'DELETE' && r.url === `${API}/organizations/o2/memberships/m-2`);
    expect(request.request.method).toBe('DELETE');
  });
});

describe('PlatformUserDetailComponent: estado de la persona', () => {
  function render(user: Record<string, unknown>): HTMLElement {
    TestBed.configureTestingModule({ imports: [PlatformUserDetailComponent], providers: provideTestApp() });
    const http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    const fixture = TestBed.createComponent(PlatformUserDetailComponent);
    fixture.componentRef.setInput('id', 'u9');
    fixture.detectChanges();
    http.expectOne(`${API}/users/u9`).flush({ data: { id: 'u9', full_name: 'Eva Revocada', email: 'eva@x.co', global_roles: [], ...user }, meta: { pagination: pag } });
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }
  const revoked = { membership_id: 'm-9', organization: { id: 'o9', name: 'ENVIA' }, status: 'REVOKED', roles: ['ORG_VIEWER'] };

  it('quien solo conserva una membresía revocada figura como «Revocado» aunque su cuenta siga activa, igual que en la tabla', () => {
    const el = render({ is_active: true, memberships: [revoked] });

    expect(el.querySelector('[data-testid=user-status]')!.textContent).toContain('Revocado');
    expect(el.querySelector('tbody .badge')!.textContent!.trim()).toBe(el.querySelector('[data-testid=user-status]')!.textContent!.trim());
    expect(el.querySelector('[data-testid="menu-m-9"]')).not.toBeNull();
  });

  it('con la cuenta inactiva figura como «Inactivo»', () => {
    expect(render({ is_active: false, memberships: [revoked] }).querySelector('[data-testid=user-status]')!.textContent).toContain('Inactivo');
  });

  it('con una membresía vigente muestra el estado de esa membresía', () => {
    const active = { ...revoked, membership_id: 'm-8', status: 'ACTIVE' };

    expect(render({ is_active: true, memberships: [revoked, active] }).querySelector('[data-testid=user-status]')!.textContent).toContain('Activo');
  });
});
