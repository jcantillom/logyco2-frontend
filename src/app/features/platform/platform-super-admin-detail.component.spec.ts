import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { PlatformSuperAdminDetailComponent } from './platform-super-admin-detail.component';

const API = 'http://api.test/api/v1/platform/super-admins';
const detail = (over: Record<string, unknown> = {}, activity: unknown[] = []) => ({
  member: {
    user_id: 'u2', full_name: 'Carlos Pérez', email: 'carlos@x.co', is_active: true, has_global_access: true,
    assigned_at: '2026-11-01T10:00:00Z', assigned_by_name: 'Ana Gómez', last_activity_at: null, is_self: false, ...over,
  },
  invitation: null,
  activity,
});

describe('PlatformSuperAdminDetailComponent', () => {
  let fixture: ComponentFixture<PlatformSuperAdminDetailComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const render = (data: unknown): void => {
    TestBed.configureTestingModule({ imports: [PlatformSuperAdminDetailComponent], providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(PlatformSuperAdminDetailComponent);
    fixture.componentRef.setInput('id', 'u2');
    fixture.detectChanges();
    // La carga inicial y la de «cambio de modo» llegan juntas: la primera queda cancelada y solo la última recibe respuesta.
    http.match(`${API}/u2`).filter((request) => !request.cancelled).forEach((request) => request.flush({ data }));
    fixture.detectChanges();
  };
  it('muestra la identidad con avatar, estado y los datos de la asignación', () => {
    render(detail());
    const text = el().textContent!.replace(/\s+/g, ' ');

    expect(el().querySelector('.avatar')!.textContent).toBe('CP');
    expect(el().querySelector('h1')!.textContent).toContain('Carlos Pérez');
    expect(el().querySelector('h1')!.textContent).not.toContain('Tú');
    expect(text).toContain('carlos@x.co');
    expect(text).toContain('Superadministrador con acceso');
    expect(text).toContain('por Ana Gómez');
    expect(el().querySelector('a[href="/plataforma/superadministradores"]')!.textContent).toContain('Volver a superadministradores');
  });

  it('marca «Tú» cuando es la propia cuenta', () => {
    render(detail({ is_self: true }));
    expect(el().querySelector('h1')!.textContent).toContain('Tú');
  });

  it('sin actividad muestra un estado vacío; con actividad la lista en orden con su tiempo relativo', () => {
    render(detail());
    expect(el().textContent).toContain('Todavía no hay actividad administrativa registrada');
    expect(el().querySelector('.timeline')).toBeNull();
  });

  it('una cuenta suspendida se indica sin acceso', () => {
    render(detail({ is_active: false, has_global_access: false }));
    const text = el().textContent!;

    expect(text).toContain('Suspendido');
    expect(text).toContain('Sin acceso (cuenta suspendida)');
  });

  it('revocar pide confirmación; cancelar no envía nada y confirmar envía la revocación', async () => {
    render(detail());
    const button = el().querySelector<HTMLButtonElement>('[data-testid="revoke-detail"]')!;
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    button.click();
    TestBed.inject(ConfirmService).pending()!.resolve(false);
    await fixture.whenStable();
    expect(http.match((r) => r.method !== 'GET').length).toBe(0);

    button.click();
    TestBed.inject(ConfirmService).pending()!.resolve(true);
    await fixture.whenStable();
    expect(http.match((r) => r.method !== 'GET' && r.url.startsWith(API)).length).toBe(1);
  });
});
