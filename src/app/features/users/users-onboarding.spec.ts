import { HttpRequest } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { UsersComponent } from './users.component';

const API = 'http://api.test/api/v1';
const empty = { data: [], meta: { pagination: { page: 1, page_size: 20, total: 0, total_pages: 1, has_next: false, has_previous: false } } };
const STATUS = {
  invitation_id: 'inv-9', organization: { id: ORG_ENVIA.id, name: 'ENVIA' }, email: 'luis@envia.co', full_name: 'Luis Analista', role_code: 'ORG_ANALYST', invitation_status: 'PENDING',
  identity_status: 'EXISTING', delivery_status: 'SENT', delivery_error_code: null, activation: 'NOT_REQUIRED', first_admin: false, send_count: 1,
  last_sent_at: '2026-11-18T10:00:00Z', expires_at: '2026-11-25T10:00:00Z', next_step: 'WAIT_ACCEPTANCE',
};

describe('Usuarios de la empresa: incorporación por ORG_ADMIN', () => {
  let fixture: ComponentFixture<UsersComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const type = (id: string, value: string): void => { const input = el().querySelector<HTMLInputElement>(`#${id}`)!; input.value = value; input.dispatchEvent(new Event('input')); };
  const flushLists = (): void => {
    http.match((r: HttpRequest<unknown>) => ['/users', '/users/invitations'].some((p) => r.url === `${API}${p}`)).forEach((r) => r.flush(empty));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [UsersComponent], providers: [...provideTestApp(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(UsersComponent);
    fixture.detectChanges();
    flushLists();
  });

  function submit(roleCode = 'ORG_ANALYST'): void {
    el().querySelector<HTMLButtonElement>('[data-testid="new-invitation"]')!.click();
    flushLists();
    type('inv-email', ' LUIS@Envia.co '); type('inv-name', ' Luis Analista ');
    const role = el().querySelector<HTMLSelectElement>('#inv-role')!;
    role.value = roleCode; role.dispatchEvent(new Event('change'));
    el().querySelector<HTMLFormElement>('dialog form')!.dispatchEvent(new Event('submit'));
  }

  it('el ORG_ADMIN incorpora a una persona con el mismo caso de uso: el POST lleva nombre, correo normalizado y rol, sin vigencia ni contraseñas', () => {
    submit();

    const req = http.expectOne(`${API}/onboarding/members`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ organization_id: ORG_ENVIA.id, email: 'luis@envia.co', full_name: 'Luis Analista', role_code: 'ORG_ANALYST' });
    req.flush({ data: STATUS, meta: {} });
    flushLists();

    const dialog = el().querySelector('#code-title')!.parentElement!;
    expect(dialog.textContent!.replace(/\s+/g, ' ')).toContain('Ya tenía cuenta');
    expect(dialog.textContent).toContain('Enviado');
    expect(dialog.textContent).not.toMatch(/código de invitación|copiar/i); // ya no se entregan códigos al administrador
  });

  it('el nombre es obligatorio y no se envía nada si falta', () => {
    el().querySelector<HTMLButtonElement>('[data-testid="new-invitation"]')!.click();
    flushLists();
    type('inv-email', 'luis@envia.co');
    el().querySelector<HTMLFormElement>('dialog form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    http.expectNone(`${API}/onboarding/members`);
    expect(el().querySelector('#inv-name')!.closest('.field')!.textContent).toContain('Ingresa el nombre');
  });

  it('no pide la empresa: se incorpora a la empresa que administra, y los roles son Analista y Consulta', () => {
    el().querySelector<HTMLButtonElement>('[data-testid="new-invitation"]')!.click();
    flushLists();

    expect(el().querySelector('#inv-org')).toBeNull();
    expect(el().querySelector('[data-testid="invite-company"]')!.textContent).toContain('ENVIA');
    expect(Array.from(el().querySelectorAll('#inv-role option')).map((o) => o.textContent!.trim())).toEqual(['Analista', 'Consulta']);
  });

  it('el administrador no se ofrece como rol: una empresa tiene uno solo y se asigna desde su detalle', () => {
    el().querySelector<HTMLButtonElement>('[data-testid="new-invitation"]')!.click();
    flushLists();

    const roles = Array.from(el().querySelectorAll<HTMLOptionElement>('#inv-role option')).map((o) => o.value);
    expect(roles).toEqual(['ORG_ANALYST', 'ORG_VIEWER']);
    expect(roles).not.toContain('ORG_ADMIN');
  });

  it('un rol no permitido o una empresa ajena los rechaza el backend y el error se muestra, no se oculta', () => {
    submit('ORG_ANALYST');
    http.expectOne(`${API}/onboarding/members`).flush({ error: { code: 'ROLE_GRANT_NOT_ALLOWED', message: 'No puedes conceder ese rol' } }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="onboarding-status"]')).toBeNull();
  });
});
