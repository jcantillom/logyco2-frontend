import { HttpRequest } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { UsersComponent } from './users.component';

const API = 'http://api.test/api/v1';
const SELF_ID = '99999999-9999-4999-8999-999999999999';
const page = (items: unknown[], total = items.length) => ({ data: items, meta: { pagination: { page: 1, page_size: 20, total, total_pages: 1, has_next: false, has_previous: false } } });
const person = (id: string, name: string, lastLogin: string | null) => ({
  id, full_name: name, email: `${id}@envia.co`, is_active: true, last_login_at: lastLogin,
  memberships: [{ membership_id: `m-${id}`, organization: ORG_ENVIA, status: 'ACTIVE', roles: ['ORG_ANALYST'] }],
});

describe('Usuarios y accesos: vista de la empresa', () => {
  let fixture: ComponentFixture<UsersComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (selector: string): string => (el().querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [UsersComponent], providers: [...provideTestApp(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(UsersComponent);
    fixture.detectChanges();

    const totals: Record<string, number> = { ACTIVE: 5, PENDING: 2, SUSPENDED: 1 };
    http.match((r: HttpRequest<unknown>) => r.url === `${API}/users`).forEach((r) => {
      const status = r.request.params.get('membership_status');
      r.flush(status ? page([], totals[status]) : page([person(SELF_ID, 'Admin Propio', '2025-01-15T15:42:00Z'), person('u2', 'Luis Analista', null), { ...person('u3', 'Eva Revocada', null), memberships: [{ membership_id: 'm-u3', organization: ORG_ENVIA, status: 'REVOKED', roles: ['ORG_ANALYST'] }] }]));
    });
    http.match((r: HttpRequest<unknown>) => r.url === `${API}/users/invitations`).forEach((r) => r.flush(page([], r.request.params.get('status') ? 3 : 0)));
    fixture.detectChanges();
  });

  it('las tarjetas muestran los totales del servidor, no el tamaño de la página visible', () => {
    expect(text('[data-testid="tile-total"] b')).toBe('8'); // activos + pendientes de aprobación + suspendidos
    expect(text('[data-testid="tile-active"] b')).toBe('5');
    expect(text('[data-testid="tile-inactive"] b')).toBe('1');
    expect(text('[data-testid="tile-invitations"] b')).toBe('3');
  });

  it('la tabla muestra usuario, correo, rol y último acceso; sin registro lo dice con honestidad', () => {
    const rows = Array.from(el().querySelectorAll('tbody tr')).map((r) => (r.textContent ?? '').replace(/\s+/g, ' '));

    expect(rows[0]).toContain('Admin Propio');
    expect(rows[0]).toContain(`${SELF_ID}@envia.co`);
    expect(rows[0]).toContain('Analista');
    expect(rows[0]).toContain('15 ene 2025');
    expect(rows[1]).toContain('Sin accesos registrados');
  });

  const openMenu = (id: string): string[] => {
    el().querySelector<HTMLButtonElement>(`[data-testid="menu-${id}"]`)!.click();
    fixture.detectChanges();

    return Array.from(el().querySelectorAll('[role="menuitem"]')).map((b) => b.textContent!.trim());
  };

  it('el menú de cada fila ofrece «Editar»; suspender y revocar solo sobre las demás personas, no sobre la propia cuenta', () => {
    expect(openMenu(SELF_ID)).toEqual(['Editar']);
    expect(openMenu('u2')).toEqual(['Editar', 'Suspender', 'Revocar']);
  });

  it('a quien ya está revocado se le ofrece «Eliminar», que pide confirmación y borra la membresía', async () => {
    expect(openMenu('u3')).toEqual(['Editar', 'Eliminar']);
    const confirm = TestBed.inject(ConfirmService);
    spyOn(confirm, 'confirm').and.resolveTo(true);

    el().querySelector<HTMLButtonElement>('[data-testid="remove-u3"]')!.click();
    await fixture.whenStable();

    const req = http.expectOne(`${API}/organizations/${ORG_ENVIA.id}/memberships/m-u3`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('en la cuenta propia el correo está bloqueado y solo se envía el nombre', () => {
    openMenu(SELF_ID);
    el().querySelector<HTMLButtonElement>(`[data-testid="edit-${SELF_ID}"]`)!.click();
    fixture.detectChanges();
    const email = el().querySelector<HTMLInputElement>('#usr-email')!;
    const name = el().querySelector<HTMLInputElement>('#usr-name')!;

    expect(email.disabled).toBe(true);
    name.value = 'Admin Renombrado'; name.dispatchEvent(new Event('input'));
    el().querySelector<HTMLFormElement>('dialog[aria-labelledby="edit-user-title"] form')!.dispatchEvent(new Event('submit'));

    const req = http.expectOne(`${API}/users/${SELF_ID}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ full_name: 'Admin Renombrado', email: undefined });
    req.flush({ data: person(SELF_ID, 'Admin Renombrado', null), meta: {} });
  });

  it('en otra persona se puede cambiar el correo y solo viaja lo que cambió', () => {
    openMenu('u2');
    el().querySelector<HTMLButtonElement>('[data-testid="edit-u2"]')!.click();
    fixture.detectChanges();
    const email = el().querySelector<HTMLInputElement>('#usr-email')!;

    expect(email.disabled).toBe(false);
    email.value = ' NUEVO@Envia.co '; email.dispatchEvent(new Event('input'));
    el().querySelector<HTMLFormElement>('dialog[aria-labelledby="edit-user-title"] form')!.dispatchEvent(new Event('submit'));

    const req = http.expectOne(`${API}/users/u2`);
    expect(req.request.body).toEqual({ full_name: undefined, email: 'nuevo@envia.co' });
    req.flush({ data: person('u2', 'Luis Analista', null), meta: {} });
  });

  it('pide 6 registros por página y el paginador resume con puntos suspensivos', () => {
    const component = fixture.componentInstance as unknown as { pageNumbers(c: number, t: number): (number | null)[] };

    expect(component.pageNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(component.pageNumbers(1, 12)).toEqual([1, 2, null, 12]);
    expect(component.pageNumbers(6, 12)).toEqual([1, null, 5, 6, 7, null, 12]);
    expect(component.pageNumbers(12, 12)).toEqual([1, null, 11, 12]);
  });

  it('una tarjeta filtra la tabla en el servidor por el estado de la membresía', () => {
    el().querySelector<HTMLButtonElement>('[data-testid="tile-inactive"]')!.click();

    const req = http.expectOne((r) => r.url === `${API}/users` && r.params.get('membership_status') === 'SUSPENDED' && r.params.get('page_size') === '6');
    req.flush(page([]));
    fixture.detectChanges();

    expect(el().textContent).toContain('Ningún usuario coincide');
  });
});
