import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { buildSuperAdmin, buildUser } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { AuthFacade } from '../../core/auth/auth.facade';
import { SessionStore } from '../../core/auth/session.store';
import { SUPER_ADMIN_LIMIT_MESSAGE } from '../../core/errors/error-catalog';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { PlatformSuperAdminsComponent } from './platform-super-admins.component';

const API = 'http://api.test/api/v1';
const BASE = `${API}/platform/super-admins`;
const member = (n: number, over: Record<string, unknown> = {}) => ({
  user_id: `u${n}`, full_name: `Persona ${n}`, email: `p${n}@x.co`, is_active: true, has_global_access: true,
  assigned_at: '2026-11-01T10:00:00Z', assigned_by_name: 'Ana Gómez', last_activity_at: null, is_self: n === 1, ...over,
});
const invitation = (n: number, status: string) => ({
  id: `i${n}`, email: `inv${n}@x.co`, invitee_name: `Invitada ${n}`, status, invited_by_name: 'Ana Gómez',
  created_at: '2026-11-10T10:00:00Z', expires_at: '2026-11-20T10:00:00Z', accepted_at: null, revoked_at: null,
});
const quota = (active: number, reserved = 0) => ({ max_active: 5, active, reserved_by_invitations: reserved, available: Math.max(5 - active - reserved, 0), limit_reached: active + reserved >= 5 });
const overview = (members: unknown[], invitations: unknown[] = [], q = quota(members.length)) => ({ quota: q, members, invitations });

describe('PlatformSuperAdminsComponent: cupos, incorporación y revocación', () => {
  let fixture: ComponentFixture<PlatformSuperAdminsComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent!.replace(/\s+/g, ' ');
  const calls = (path = ''): TestRequest[] => http.match((r) => r.url === `${BASE}${path}`);

  function render(data: ReturnType<typeof overview>): void {
    TestBed.configureTestingModule({ imports: [PlatformSuperAdminsComponent], providers: [...provideTestApp(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(PlatformSuperAdminsComponent);
    fixture.detectChanges();
    calls().forEach((r) => r.flush({ data }));
    fixture.detectChanges();
  }
  const click = (selector: string): void => { el().querySelector<HTMLButtonElement>(selector)!.click(); fixture.detectChanges(); };
  const type = (selector: string, value: string): void => { const input = el().querySelector<HTMLInputElement>(selector)!; input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges(); };
  const fillInvite = (): void => { type('#sa-name', 'Nueva Persona'); type('#sa-email', 'nueva@x.co'); };
  it('con cupos disponibles muestra los ocupados, los disponibles y habilita incorporar', () => {
    render(overview([member(1), member(2), member(3)], [invitation(1, 'PENDING')], quota(3, 1)));

    expect(text()).toContain('3 de 5 cupos ocupados');
    expect(text()).toContain('1 cupo(s) disponible(s)');
    expect(text()).toContain('1 reservado(s) por invitaciones');
    expect(el().querySelector<HTMLButtonElement>('[data-testid="invite-open"]')!.disabled).toBeFalse();
    expect(el().querySelector('[data-testid="pending-note"]')).not.toBeNull();
    expect(el().querySelector('[data-testid="limit-reached"]')).toBeNull();
  });

  it('con el límite alcanzado muestra el mensaje acordado y no permite incorporar', () => {
    render(overview([1, 2, 3, 4, 5].map((n) => member(n)), [], quota(5)));

    const notice = el().querySelector('[data-testid="limit-reached"]')!;
    expect(notice.textContent!.trim()).toBe('Se alcanzó el límite máximo de 5 superadministradores activos. Para incorporar uno nuevo, primero debes revocar el acceso de uno de los actuales.');
    expect(notice.textContent!.trim()).toBe(SUPER_ADMIN_LIMIT_MESSAGE);
    expect(el().querySelector<HTMLButtonElement>('[data-testid="invite-open"]')!.disabled).toBeTrue();
    expect(el().querySelector('[data-testid="invite-open"]')!.getAttribute('aria-describedby')).toBe('limit-msg');
  });

  it('sin otros superadministradores muestra un estado vacío con la invitación a incorporar', () => {
    render(overview([member(1)]));

    expect(el().querySelector('[data-testid="only-me"]')!.textContent).toContain('Aún no hay superadministradores adicionales');
  });

  it('la tabla muestra solo datos reales: sin fecha inventada ni "última actividad" sin eventos', () => {
    render(overview([member(1, { assigned_at: null, assigned_by_name: null }), member(2, { last_activity_at: '2026-11-12T10:00:00Z' }), member(3, { is_active: false, has_global_access: false })]));

    const rows = Array.from(el().querySelectorAll('[data-testid="member-row"]')).map((r) => r.textContent!.replace(/\s+/g, ' '));
    expect(rows[0]).toContain('Tú');
    expect(rows[0]).toContain('Sin registro'); // el rol se concedió antes de registrar quién y cuándo: no se inventa
    expect(rows[0].match(/—/g)!.length).toBe(1); // sin última actividad
    expect(Array.from(el().querySelectorAll('thead th')).map((h) => h.textContent!.trim())).toContain('Rol concedido');
    expect(rows[1]).toContain('11/12/26');
    expect(rows[2]).toContain('Suspendido');
    expect(rows[2]).toContain('Sin acceso');
  });

  it('incorporar exige confirmación explícita y envía POST con confirm:true; el código se muestra una sola vez', () => {
    render(overview([member(1)], [], quota(1)));
    click('[data-testid="invite-open"]');
    fillInvite();

    click('[data-testid="invite-submit"]');
    http.expectNone(`${BASE}/invitations`);  // sin confirmar no se envía nada
    expect(text()).toContain('Debes confirmar para continuar');

    el().querySelector<HTMLInputElement>('[data-testid="invite-confirm"]')!.click();
    fixture.detectChanges();
    click('[data-testid="invite-submit"]');
    const request = http.expectOne(`${BASE}/invitations`);
    expect(request.request.body).toEqual({ full_name: 'Nueva Persona', email: 'nueva@x.co', expires_in_days: 7, confirm: true });
    request.flush({ data: { ...invitation(9, 'PENDING'), code: 'sa_CODIGO-DE-UN-SOLO-USO' } });
    calls().forEach((r) => r.flush({ data: overview([member(1)], [invitation(9, 'PENDING')], quota(1, 1)) }));
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="super-admin-code"]')!.textContent).toContain('sa_CODIGO-DE-UN-SOLO-USO');
    expect(text()).toContain('una sola vez');
  });

  it('si el servidor rechaza por el límite, muestra el mensaje acordado dentro del diálogo y no cierra', () => {
    render(overview([member(1)], [], quota(1)));
    click('[data-testid="invite-open"]');
    fillInvite();
    el().querySelector<HTMLInputElement>('[data-testid="invite-confirm"]')!.click();
    fixture.detectChanges();

    click('[data-testid="invite-submit"]');
    http.expectOne(`${BASE}/invitations`).flush({ error: { code: 'SUPER_ADMIN_LIMIT_REACHED', message: 'texto crudo del servidor', request_id: 'r1' } }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="invite-error"]')!.textContent).toBe(SUPER_ADMIN_LIMIT_MESSAGE);
    expect(el().querySelector('[data-testid="super-admin-code"]')!.closest('dialog')!.hasAttribute('open')).toBeFalse();
  });

  it('revocar pide confirmación que explica el efecto y NO elimina la cuenta', async () => {
    render(overview([member(1), member(2)]));
    el().querySelectorAll<HTMLButtonElement>('[data-testid="revoke"]')[1].click();
    const pending = TestBed.inject(ConfirmService).pending()!;

    expect(pending.message).toContain('Persona 2 dejará de ser superadministrador');
    expect(pending.message).toContain('Su cuenta no se elimina');
    pending.resolve(true);
    await fixture.whenStable();

    const request = http.expectOne(`${BASE}/u2/revoke`);
    expect(request.request.body).toEqual({ confirm: true });
    request.flush({ data: { user_id: 'u2', role_code: 'SUPER_ADMIN', revoked: true, remaining_active: 1 } });
    calls().forEach((r) => r.flush({ data: overview([member(1)]) }));
    fixture.detectChanges();
    expect(text()).not.toContain('Persona 2');
  });

  it('si el servidor impide revocar al último, el mensaje es claro y no cambia nada', async () => {
    render(overview([member(1)]));
    el().querySelector<HTMLButtonElement>('[data-testid="revoke"]')!.click();
    TestBed.inject(ConfirmService).pending()!.resolve(true);
    await fixture.whenStable();

    http.expectOne(`${BASE}/u1/revoke`).flush({ error: { code: 'LAST_GLOBAL_ADMIN', message: 'x', request_id: 'r2' } }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();

    expect(text()).toContain('Persona 1');
  });

  it('revocar tu propio acceso refresca la sesión y te saca de la consola', async () => {
    render(overview([member(1), member(2)]));
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    const refresh = spyOn(TestBed.inject(AuthFacade), 'refreshUser').and.returnValue(of(buildUser()));
    el().querySelectorAll<HTMLButtonElement>('[data-testid="revoke"]')[0].click();
    const pending = TestBed.inject(ConfirmService).pending()!;

    expect(pending.title).toBe('Revocar tu propio acceso');
    pending.resolve(true);
    await fixture.whenStable();
    http.expectOne(`${BASE}/u1/revoke`).flush({ data: { user_id: 'u1', role_code: 'SUPER_ADMIN', revoked: true, remaining_active: 1 } });
    calls().forEach((r) => r.flush({ data: overview([member(2)]) }));
    expect(refresh).toHaveBeenCalledTimes(1); // la sesión se vuelve a consultar: ya no trae el rol global
    expect(router.navigate).toHaveBeenCalledWith(['/resumen']);
  });

  it('las invitaciones pendientes se pueden revocar y las demás muestran su estado', async () => {
    render(overview([member(1)], [invitation(1, 'PENDING'), invitation(2, 'EXPIRED'), invitation(3, 'REVOKED')], quota(1, 1)));

    const rows = Array.from(el().querySelectorAll('[data-testid="invitation-row"]'));
    expect(rows.map((r) => r.querySelector('.badge')!.textContent!.trim())).toEqual(['Pendiente', 'Vencida', 'Revocada']);
    expect(rows.filter((r) => r.querySelector('button')).length).toBe(1);
    rows[0].querySelector('button')!.click();
    TestBed.inject(ConfirmService).pending()!.resolve(true);
    await fixture.whenStable();
    http.expectOne(`${BASE}/invitations/i1/revoke`).flush({ data: { ...invitation(1, 'REVOKED') } });
  });

  it('el formulario fija el rol global (no editable) y no pide contraseñas', () => {
    render(overview([member(1)]));
    click('[data-testid="invite-open"]');

    expect(el().querySelector('dialog')!.textContent).toContain('Superadministrador');
    expect(el().querySelector('dialog select#sa-role')).toBeNull();
    expect(el().querySelector('dialog input[type="password"]')).toBeNull();
    expect(el().querySelector('dialog')!.textContent).toContain('No se crea ninguna cuenta ni contraseña');
  });
});
