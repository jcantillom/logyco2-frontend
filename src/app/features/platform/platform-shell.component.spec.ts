import { HttpTestingController } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildSuperAdmin, buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { CurrentUser } from '../../domain/models/identity';
import { ShellComponent } from '../../shared/layouts/shell.component';
import { PlatformShellComponent } from './platform-shell.component';

describe('Shell de la consola de plataforma y separación de contextos', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PlatformShellComponent, ShellComponent], providers: provideTestApp() });
  });
  function render<T>(component: Type<T>, user: CurrentUser): { fixture: ComponentFixture<T>; el: HTMLElement } {
    signInAs(user, TestBed.inject(SessionStore));
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  const labels = (el: HTMLElement): string[] => Array.from(el.querySelectorAll('nav a.nav-link .label')).map((n) => n.textContent?.trim() ?? '');

  it('el menú de usuario lleva a la Configuración de la consola (no al espacio de empresa)', () => {
    const { fixture, el } = render(PlatformShellComponent, buildSuperAdmin());
    el.querySelector<HTMLButtonElement>('app-user-menu button[aria-haspopup]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('app-user-menu a[role="menuitem"]')!.getAttribute('href')).toBe('/plataforma/configuracion');
    expect(el.querySelector('app-user-menu [data-testid="logout"]')!.textContent).toContain('Cerrar sesión');
  });

  it('al entrar precarga la primera página de Empresas y de Personas para que el primer clic ya las encuentre cargadas', () => {
    render(PlatformShellComponent, buildSuperAdmin());
    const http = TestBed.inject(HttpTestingController);
    const orgs = http.match((r) => r.url === 'http://api.test/api/v1/organizations');
    const users = http.match((r) => r.url === 'http://api.test/api/v1/users');

    expect(orgs.length).toBe(1);
    expect(orgs[0].request.params.get('page')).toBe('1');
    expect(orgs[0].request.params.get('page_size')).toBe('25');
    expect(orgs[0].request.params.get('sort')).toBe('name');
    expect(users.length).toBe(1);
    expect(users[0].request.params.get('page_size')).toBe('25');
  });

  it('publica --dlg-left para centrar los diálogos en el área de contenido y lo ajusta al colapsar el menú', () => {
    const { fixture, el } = render(PlatformShellComponent, buildSuperAdmin());
    const value = (): string => document.documentElement.style.getPropertyValue('--dlg-left');

    expect(value()).toBe('var(--sidebar-w)');
    el.querySelector<HTMLButtonElement>('.collapse-btn')!.click();
    fixture.detectChanges();

    expect(value()).toBe('var(--sidebar-w-collapsed)');
    fixture.destroy();

    expect(value()).toBe('');
  });

  it('indica de forma permanente el contexto GLOBAL de plataforma', () => {
    const { el } = render(PlatformShellComponent, buildSuperAdmin());
    expect(el.querySelector('[data-testid="platform-context"]')?.textContent).toContain('Contexto global · Plataforma');
    expect(el.querySelector('.scope')).toBeNull();
  });

  it('organiza la navegación en Panel general, Administración, Herramientas, Seguridad y Sistema, todas desplegadas por defecto y sin Descarbonización', () => {
    const { el } = render(PlatformShellComponent, buildSuperAdmin());

    expect(labels(el)).toEqual([
      'Resumen', 'Empresas', 'Usuarios', 'Superadministradores', 'Cálculo de emisiones',
      'Referencias de combustibles', 'Indicadores de costos', 'Roles y accesos', 'Matriz técnica',
      'Actividad y auditoría', 'Estado de la plataforma',
    ]);
    expect(Array.from(el.querySelectorAll('.group h2')).map((h) => h.textContent!.trim())).toEqual(['Panel general', 'Sistema']); // «Actividad y auditoría» vive en Sistema
    expect(Array.from(el.querySelectorAll('.group-toggle, .parent-toggle')).map((b) => b.textContent!.trim())).toEqual(['Administración', 'Descarbonización', 'Herramientas complementarias', 'Seguridad']);
    el.querySelectorAll('.group-toggle').forEach((button) => expect(button.getAttribute('aria-expanded')).toBe('true')); // ninguna categoría parte plegada
  });

  it('el super admin ve «Descarbonización → Cálculo de emisiones» y ninguna función futura sin API; ninguna etiqueta técnica (REAL, PARCIAL, SIN API)', () => {
    const { el } = render(PlatformShellComponent, buildSuperAdmin());
    const nav = el.querySelector('nav')!;
    const link = Array.from(nav.querySelectorAll('a.nav-link')).find((a) => a.textContent!.includes('Cálculo de emisiones'))!;

    expect(nav.textContent).toContain('Descarbonización');
    expect(link.getAttribute('href')).toBe('/plataforma/calculo-emisiones');
    expect(link.querySelector('.pill')).toBeNull();
    expect(el.querySelectorAll('nav .pill').length).toBe(0);
    ['Vehículos', 'Operaciones de transporte', 'Cargas masivas', 'Centro de calidad', 'Reportes globales'].forEach((label) => expect(nav.textContent).not.toContain(label));
    ['SIN API', 'PARCIAL', 'REAL'].forEach((word) => expect(nav.textContent).not.toContain(word));
  });

  it('cada grupo se pliega con su chevron y conserva las rutas existentes', () => {
    const { fixture, el } = render(PlatformShellComponent, buildSuperAdmin());
    const toggle = (title: string): HTMLButtonElement => Array.from(el.querySelectorAll<HTMLButtonElement>('.group-toggle')).find((b) => b.textContent!.includes(title))!;

    expect(toggle('Seguridad').getAttribute('aria-expanded')).toBe('true');
    expect(labels(el)).toContain('Roles y accesos');
    toggle('Seguridad').click();
    fixture.detectChanges();
    expect(toggle('Seguridad').getAttribute('aria-expanded')).toBe('false');
    expect(labels(el)).not.toContain('Roles y accesos');
    toggle('Seguridad').click();
    fixture.detectChanges();
    expect(labels(el)).toContain('Roles y accesos');
    const hrefs = Array.from(el.querySelectorAll('nav a.nav-link')).map((a) => a.getAttribute('href'));
    ['/plataforma/roles', '/plataforma/superadministradores', '/plataforma/estado'].forEach((path) => expect(hrefs).toContain(path));
  });

  it('conserva nombres accesibles y rutas al contraer el menú con grupos plegados', () => {
    const { fixture, el } = render(PlatformShellComponent, buildSuperAdmin());
    const collapse = el.querySelector<HTMLButtonElement>('.collapse-btn')!;
    collapse.click(); fixture.detectChanges();
    expect(el.querySelector('.shell')!.classList.contains('collapsed')).toBeTrue();
    expect(el.querySelectorAll('nav a.nav-link').length).toBe(11);
    el.querySelectorAll('nav a.nav-link').forEach(link => {
      expect(link.getAttribute('aria-label')).toContain(link.querySelector('.label')!.textContent!.trim());
    });
    collapse.click(); fixture.detectChanges();
    expect(labels(el)).not.toContain('Vehículos');
  });

  it('permite plegar grupos en móvil después de contraer el menú en escritorio', () => {
    const { fixture, el } = render(PlatformShellComponent, buildSuperAdmin());
    el.querySelector<HTMLButtonElement>('.collapse-btn')!.click();
    fixture.detectChanges();
    const button = Array.from(el.querySelectorAll<HTMLButtonElement>('.group-toggle')).find(b => b.textContent!.includes('Administración'))!;
    expect(labels(el)).toContain('Empresas');
    button.click(); fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(labels(el)).not.toContain('Empresas');
    expect(el.querySelector('.shell')!.classList.contains('collapsed')).toBeFalse();
  });

  it('asocia cada control de grupo con su lista de navegación', () => {
    const { el } = render(PlatformShellComponent, buildSuperAdmin());
    el.querySelectorAll('.group-toggle[aria-expanded="true"]').forEach(button => {
      const id = button.getAttribute('aria-controls');
      expect(id).toBeTruthy();
      expect(el.querySelector(`[id="${id}"]`)).not.toBeNull();
    });
  });

  it('la barra superior muestra el contexto global, la identidad con su rol y la campana de acciones pendientes', () => {
    const { fixture, el } = render(PlatformShellComponent, buildSuperAdmin());
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((r) => r.url === 'http://api.test/api/v1/platform/metrics').flush({ data: {
      organizations: { total: 3, active: 3, inactive: 0, without_active_admin: 1, without_type: 0, with_pending_invitations: 0, by_type: [] },
      users: { total: 2, active: 2 }, memberships: { pending: 2, active: 0 }, invitations: { pending: 1 },
      super_admins: { active: 1, max_active: 5, reserved_by_invitations: 0, available: 4 }, generated_at: '2026-11-14T12:00:00Z',
    } });
    // La campana y la tarjeta del Resumen leen la misma fuente: también se carga la atención (invitaciones por vencer, empresas en espera…).
    http.expectOne((r) => r.url === 'http://api.test/api/v1/platform/attention').flush({ data: {
      organizations_without_admin: { count: 2, items: [{ id: 'o1', name: 'ENVIA', has_pending_invitation: false }, { id: 'o2', name: 'Coordinadora', has_pending_invitation: true }] },
      organizations_waiting_admin: 1, // Coordinadora solo espera que su administrador acepte: no es una acción
      inactive_organizations: { count: 2, items: [] }, // solo seguimiento: tampoco cuenta
      pending_memberships: { count: 2, items: [] },
      invitations_expiring: { count: 1, items: [{ id: 'i1', organization_id: 'o1', organization_name: 'ENVIA', role_code: 'ORG_ADMIN', expires_at: '2026-11-16T00:00:00Z' }] },
      super_admins: { active: 1, max_active: 5, reserved_by_invitations: 0, available: 4 }, super_admin_near_limit: false, expiring_within_days: 3,
    } });
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="platform-context"]')!.textContent).toContain('Contexto global');
    expect(el.querySelector('app-user-menu .who')!.textContent).toContain('SUPER_ADMIN');
    expect(el.querySelector('[data-testid="bell"] .count')!.textContent!.trim()).toBe('4');
    expect(el.querySelector('[data-testid="bell"]')!.getAttribute('aria-label')).toBe('Acciones pendientes: 4');

    // Al hacer clic abre un panel con cada acción pendiente y su destino.
    expect(el.querySelector('[data-testid="bell-panel"]')).toBeNull();
    el.querySelector<HTMLButtonElement>('[data-testid="bell"]')!.click();
    fixture.detectChanges();
    const rows = Array.from(el.querySelectorAll('[data-testid="bell-panel"] li a')).map((a) => [a.querySelector('strong')!.textContent, a.querySelector('.num')!.textContent!.trim(), a.getAttribute('href')]);
    expect(rows).toEqual([
      ['Membresías por aprobar', '2', '/plataforma/usuarios?tab=pendientes'],
      ['Invitaciones por vencer', '1', '/plataforma/usuarios?tab=invitaciones'],
      ['Empresas sin administrador activo', '1', '/plataforma/organizaciones?filtro=sin-admin'],
    ]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="bell-panel"]')).toBeNull();
    expect(el.querySelector('.side-version')!.textContent).toContain('v1.0.0 (DEV)');
  });

  it('el enlace al espacio de empresa solo aparece si el usuario tiene empresas', () => {
    expect(render(PlatformShellComponent, buildSuperAdmin()).el.querySelector('[data-testid="to-organization"]')).toBeNull();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [PlatformShellComponent], providers: provideTestApp() });
    expect(render(PlatformShellComponent, buildSuperAdmin({ memberships: [membership(ORG_ENVIA)] })).el.querySelector('[data-testid="to-organization"]')).not.toBeNull();
  });

  it('cambiar de empresa NO altera la consola global (contextos aislados)', () => {
    const user = buildSuperAdmin({ memberships: [membership(ORG_ENVIA), membership(ORG_COORDINADORA, ['ORG_VIEWER'])] });
    const { fixture, el } = render(PlatformShellComponent, user);
    const before = labels(el);
    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);
    fixture.detectChanges();
    expect(labels(el)).toEqual(before);
    expect(el.querySelector('[data-testid="platform-context"]')).not.toBeNull();
  });

  describe('selector de contexto en el espacio de empresa', () => {
    it('un SUPER_ADMIN ve el acceso a la consola de plataforma', () => {
      const { el } = render(ShellComponent, buildSuperAdmin({ memberships: [membership(ORG_ENVIA)] }));
      expect(el.querySelector('[data-testid="to-platform"]')).not.toBeNull();
    });
    it('un ORG_ADMIN NO lo ve: la visibilidad se decide por el rol global, no por el rol de empresa', () => {
      const { el } = render(ShellComponent, buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }));
      expect(el.querySelector('[data-testid="to-platform"]')).toBeNull();
    });
  });
});
