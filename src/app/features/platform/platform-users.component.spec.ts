import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { PlatformUsersComponent } from './platform-users.component';
import { PlatformUsersFacade } from './platform.facades';

const API = 'http://api.test/api/v1';
const pag = (total: number) => ({ page: 1, page_size: 100, total, total_pages: 1, has_next: false, has_previous: false });
const ORG = '33333333-3333-4333-8333-333333333333';

describe('PlatformUsersComponent: solicitudes pendientes y aprobación', () => {
  let fixture: ComponentFixture<PlatformUsersComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PlatformUsersComponent], providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(PlatformUsersComponent);
    fixture.detectChanges();
    flushUsers();
    http.match((r) => r.url === `${API}/organizations`).forEach((r) => r.flush({ data: [], meta: { pagination: pag(0) } }));
    http.match((r) => r.url === `${API}/users/invitations`).forEach((r) => r.flush({ data: [], meta: { pagination: pag(0) } }));
    fixture.detectChanges();
  });
  /** Responde a cada petición de usuarios (página visible y solicitudes pendientes) con los mismos datos. */
  const flushUsers = (): void => {
    http.match((r) => r.url === `${API}/users`).forEach((r) => r.flush({ data: [
      { id: 'u1', full_name: 'Luis Gómez', email: 'luis@x.co', is_active: true, memberships: [{ membership_id: 'm-9', organization: { id: ORG, name: 'ENVIA' }, status: 'PENDING', roles: ['ORG_ANALYST'] }] },
      { id: 'u2', full_name: 'Ana Prueba', email: 'ana@x.co', is_active: true, memberships: [{ membership_id: 'm-1', organization: { id: ORG, name: 'ENVIA' }, status: 'ACTIVE', roles: ['ORG_ADMIN'] }] },
    ], meta: { pagination: pag(2) } }));
  };

  it('muestra la tabla con Usuario, Correo electrónico, Empresa, Tipo de usuario y Estado', () => {
    const headers = Array.from(el().querySelectorAll('thead th')).map((h) => h.textContent!.trim()).filter((h) => h && h !== 'Abrir');
    expect(headers).toEqual(['Usuario', 'Correo electrónico', 'Empresa a la que pertenece', 'Tipo de usuario', 'Estado']);

    const rows = Array.from(el().querySelectorAll('tbody tr')).map((r) => Array.from(r.querySelectorAll('th, td')).map((c) => c.textContent!.replace(/\s+/g, ' ').trim()));
    expect(rows[0].slice(0, 5)).toEqual(['LGLuis Gómez', 'luis@x.co', 'EENVIA', 'Analista', 'Pendiente']); // iniciales del logo + nombre; el estado sale de su membresía
    expect(rows[1].slice(4, 5)).toEqual(['Activo']);
  });

  it('el contador muestra el ícono y solo el número; el texto completo queda para lectores de pantalla y tooltip', () => {
    const result = el().querySelector<HTMLElement>('.result')!;

    expect(result.querySelector('svg')).not.toBeNull();
    expect(result.querySelector('b')!.textContent).toBe('2');
    expect(result.querySelector('.sr-only')!.textContent!.trim()).toBe('personas');
    expect(result.getAttribute('title')).toBe('2 personas');
  });

  it('la columna de empresa muestra el logo (o sus iniciales) y el nombre', () => {
    const cell = el().querySelector<HTMLElement>('tbody tr .c-org')!;

    expect(cell.querySelector('.org-name')!.textContent!.trim()).toBe('ENVIA');
    expect(cell.querySelector('.org-logo')!.textContent!.trim()).toBe('E'); // sin versión de logo: iniciales (una letra en nombres de una palabra)
    expect(http.match((r) => r.url.endsWith('/logo')).length).toBe(0); // no pide imágenes que no existen
  });

  it('con versión de logo pide la imagen una sola vez y la dibuja', () => {
    const facade = TestBed.inject(PlatformUsersFacade);
    const person = (id: string) => ({
      id, fullName: id, email: `${id}@x.co`, isActive: true, lastLoginAt: null, globalRoles: [],
      memberships: [{ membershipId: `m-${id}`, organization: { id: ORG, name: 'ENVIA', logoVersion: 'abc123' }, status: 'ACTIVE' as const, roles: ['ORG_ANALYST'] }],
    });
    facade.list.data.set({ items: [person('p1'), person('p2')], page: 1, pageSize: 25, total: 2, totalPages: 1, hasNext: false, hasPrevious: false });
    fixture.detectChanges();

    const requests = http.match((r) => r.url === `${API}/organizations/${ORG}/logo`);
    expect(requests.length).toBe(1); // dos personas, una misma empresa y versión: una sola petición
    requests[0].flush(new Blob(['png'], { type: 'image/png' }));
    fixture.detectChanges();

    expect(el().querySelectorAll('tbody .org-logo img').length).toBe(2);
  });

  it('solo pide personas con empresa y sin rol global (los superadministradores no se listan aquí)', () => {
    const reload = http.match(() => true);
    expect(reload.length).toBe(0);
    const select = el().querySelector<HTMLSelectElement>('#u-acc')!;
    select.value = 'active'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    const { params } = http.expectOne((r) => r.url === `${API}/users`).request;
    expect(params.get('classification')).toBe('company');
    expect(params.get('has_global_role')).toBe('false');
  });

  it('solo quedan las pestañas Usuarios e Invitaciones (sin solicitudes pendientes ni actividad)', () => {
    const tabs = Array.from(el().querySelectorAll('[role="tab"]')).map((t) => t.textContent!.trim());
    expect(tabs).toEqual(['Usuarios', 'Invitaciones']);
    expect(el().querySelector('h1')!.textContent).toBe('Usuarios');
  });

  it('la búsqueda se envía al servidor (con espera) y vuelve a la primera página', fakeAsync(() => {
    const input = el().querySelector<HTMLInputElement>('#u-q')!;
    input.value = 'luis'; input.dispatchEvent(new Event('input'));
    tick(299);
    expect(http.match((r) => r.url === `${API}/users` && r.params.get('search') === 'luis').length).toBe(0);
    tick(1);
    fixture.detectChanges();
    const request = http.expectOne((r) => r.url === `${API}/users` && r.params.get('search') === 'luis');
    expect(request.request.params.get('page')).toBe('1');
    request.flush({ data: [], meta: { pagination: pag(0) } });
    fixture.detectChanges();
    expect(el().querySelector('[data-testid=empty-state]')!.textContent).toContain('Sin resultados');
  }));

  it('el estado es un criterio del servidor, no un filtro local', () => {
    const select = el().querySelector<HTMLSelectElement>('#u-acc')!;
    select.value = 'inactive'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(http.expectOne((r) => r.url === `${API}/users` && r.params.get('status') === 'inactive')).toBeTruthy();
    expect(el().querySelector('#u-org')).toBeNull();
  });

  it('la misma barra busca por empresa y, al coincidir, muestra solo el rol que tiene en ESA empresa', fakeAsync(() => {
    const input = el().querySelector<HTMLInputElement>('#u-q')!;
    input.value = 'envia'; input.dispatchEvent(new Event('input'));
    tick(300);
    fixture.detectChanges();
    const request = http.expectOne((r) => r.url === `${API}/users` && r.params.get('search') === 'envia');
    request.flush({ data: [
      { id: 'u2', full_name: 'Ana Prueba', email: 'ana@x.co', is_active: true, memberships: [
        { membership_id: 'm-1', organization: { id: ORG, name: 'ENVIA' }, status: 'ACTIVE', roles: ['ORG_ADMIN'] },
        { membership_id: 'm-2', organization: { id: 'otra', name: 'OTRA' }, status: 'ACTIVE', roles: ['ORG_VIEWER'] },
      ] },
    ], meta: { pagination: pag(1) } });
    fixture.detectChanges();

    const row = el().querySelector('tbody tr')!.textContent!;
    expect(row).toContain('ENVIA');
    expect(row).toContain('Administrador de empresa');
    expect(row).not.toContain('OTRA');
    expect(row).not.toContain('Consulta');
  }));

  it('cambiar de página pide esa página al servidor', () => {
    const select = el().querySelector<HTMLSelectElement>('#u-acc')!;
    select.value = 'active'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    http.match((r) => r.url === `${API}/users`).forEach((r) => r.flush({ data: [], meta: { pagination: { page: 1, page_size: 25, total: 80, total_pages: 4, has_next: true, has_previous: false } } }));
    fixture.detectChanges();

    el().querySelector<HTMLButtonElement>('[data-testid=page-next]')!.click();
    fixture.detectChanges();
    expect(http.expectOne((r) => r.url === `${API}/users` && r.params.get('page') === '2' && r.params.get('page_size') === '25')).toBeTruthy();
  });

  it('las invitaciones revocadas no aparecen en la lista de invitaciones', () => {
    Array.from(el().querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) => t.textContent!.includes('Invitaciones'))!.click();
    fixture.detectChanges();
    const inv = (id: string, email: string, status: string) => ({
      id, organization: { id: ORG, name: 'ENVIA' }, email, invitee_name: null, role_code: 'ORG_VIEWER', status,
      expires_at: '2027-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', accepted_at: null,
    });
    TestBed.inject(PlatformUsersFacade).loadInvitations();
    http.match((r) => r.url === `${API}/users/invitations`).forEach((r) => r.flush({ data: [
      inv('i1', 'vigente@x.co', 'PENDING'), inv('i2', 'revocada@x.co', 'REVOKED'),
    ], meta: { pagination: pag(2) } }));
    fixture.detectChanges();

    const text = el().textContent!;
    expect(text).toContain('vigente@x.co');
    expect(text).not.toContain('revocada@x.co');
  });

  it('el filtro por rol se envía al servidor, se muestra como etiqueta y al quitarlo vuelve la lista completa', () => {
    (fixture.componentInstance as unknown as { role: { set(value: string): void } }).role.set('ORG_ADMIN');
    fixture.detectChanges();
    const filtered = http.expectOne((r) => r.url === `${API}/users` && r.params.get('role') === 'ORG_ADMIN');
    expect(filtered.request.params.get('page')).toBe('1');
    filtered.flush({ data: [], meta: { pagination: pag(0) } });
    fixture.detectChanges();

    const tag = el().querySelector('[data-testid="role-tag"]')!;
    expect(tag.textContent).toContain('Administrador de empresa');

    el().querySelector<HTMLButtonElement>('[data-testid="clear-role"]')!.click();
    fixture.detectChanges();
    expect(http.expectOne((r) => r.url === `${API}/users` && !r.params.has('role'))).toBeTruthy();
    expect(el().querySelector('[data-testid="role-tag"]')).toBeNull();
  });

  it('no expone credenciales ni el token de sesión en pantalla', () => {
    const text = el().textContent!.toLowerCase();
    ['password', 'contraseña', 'token-de-prueba', 'bearer'].forEach((word) => expect(text).not.toContain(word));
  });
});

describe('PlatformUsersComponent: filtro de rol desde «Roles y permisos»', () => {
  it('abrir /plataforma/usuarios?rol=ORG_ANALYST pide solo ese rol al servidor; un rol desconocido se ignora', () => {
    for (const [rol, expected] of [['ORG_ANALYST', 'ORG_ANALYST'], ['NO_EXISTE', null]] as const) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [PlatformUsersComponent],
        providers: [...provideTestApp(), { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ rol }) } } }],
      });
      const http = TestBed.inject(HttpTestingController);
      signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
      TestBed.createComponent(PlatformUsersComponent).detectChanges();

      const request = http.match((r) => r.url === `${API}/users`)[0];
      expect(request.request.params.get('role')).toBe(expected);
    }
  });
});

describe('PlatformUsersComponent: filtro de empresa desde «Empresas»', () => {
  const render = (empresa: string) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PlatformUsersComponent],
      providers: [...provideTestApp(), { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ empresa }) } } }],
    });
    const http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    const fixture = TestBed.createComponent(PlatformUsersComponent);
    fixture.detectChanges();

    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  };

  it('?empresa=<id> pide al servidor solo esa empresa; un valor que no es un id se ignora', () => {
    for (const [empresa, expected] of [[ORG, ORG], ['no-es-un-id', null]] as const) {
      const { http } = render(empresa);

      expect(http.match((r) => r.url === `${API}/users`)[0].request.params.get('organization_id')).toBe(expected);
    }
  });

  it('muestra la etiqueta con el nombre de la empresa, solo esa empresa en la fila, y «×» la quita', () => {
    const { http, fixture, el } = render(ORG);
    http.match((r) => r.url === `${API}/users`).forEach((r) => r.flush({ data: [
      { id: 'u1', full_name: 'Ana Prueba', email: 'ana@x.co', is_active: true, memberships: [
        { membership_id: 'm1', organization: { id: ORG, name: 'ENVIA' }, status: 'ACTIVE', roles: ['ORG_ANALYST'] },
        { membership_id: 'm2', organization: { id: 'otra', name: 'OTRA EMPRESA' }, status: 'ACTIVE', roles: ['ORG_VIEWER'] },
      ] },
    ], meta: { pagination: pag(1) } }));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="company-tag"]')!.textContent).toContain('Empresa: ENVIA');
    expect(el.querySelector('tbody tr .c-org')!.textContent).toContain('ENVIA');
    expect(el.querySelector('tbody tr .c-org')!.textContent).not.toContain('OTRA EMPRESA');

    el.querySelector<HTMLButtonElement>('[data-testid="clear-company"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="company-tag"]')).toBeNull();
    const request = http.match((r) => r.url === `${API}/users`).pop()!;
    expect(request.request.params.get('organization_id')).toBeNull();
  });
});

