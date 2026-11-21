import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { PlatformRbacComponent } from './platform-rbac.component';

const API = 'http://api.test/api/v1';
const role = (code: string, name: string, scope: string, permissions: string[], people: number, assignments = people) =>
  ({ code, name, description: null, scope, is_active: true, permissions, assignments, effective_assignments: people, people });
const catalog = {
  roles: [
    role('SUPER_ADMIN', 'Superadministrador', 'GLOBAL', ['organizations:manage', 'memberships:manage', 'users:read', 'catalogs:manage'], 2, 3),
    role('ORG_ADMIN', 'Administrador de empresa', 'ORGANIZATION', ['organizations:read', 'memberships:manage', 'reports:read'], 1),
    role('ORG_ANALYST', 'Analista', 'ORGANIZATION', ['organizations:read', 'imports:create', 'reports:read'], 0),
    role('ORG_VIEWER', 'Consulta de empresa', 'ORGANIZATION', ['organizations:read', 'reports:read', 'sector_reports:read'], 3),
    role('GUILD_VIEWER', 'Consulta gremial', 'ORGANIZATION', ['sector_reports:read'], 0),
  ],
  permissions: [
    { code: 'organizations:read', name: 'Consultar empresas', description: null, implementation: 'active' },
    { code: 'organizations:manage', name: 'Administrar empresas', description: null, implementation: 'active' },
    { code: 'memberships:manage', name: 'Administrar accesos', description: null, implementation: 'active' },
    { code: 'users:read', name: 'Consultar usuarios', description: null, implementation: 'active' },
    { code: 'catalogs:manage', name: 'Administrar catálogos', description: null, implementation: 'planned' },
    { code: 'imports:create', name: 'Cargar archivos', description: null, implementation: 'planned' },
    { code: 'reports:read', name: 'Consultar reportes', description: null, implementation: 'planned' },
    { code: 'sector_reports:read', name: 'Consultar reportes sectoriales', description: null, implementation: 'complementary' },
  ],
};

const assignmentsPage = (items: unknown[], total = items.length) => ({
  data: items,
  meta: { pagination: { page: 1, page_size: 3, total, total_pages: Math.max(1, Math.ceil(total / 3)), has_next: total > 3, has_previous: false } },
});
const holder = (id: string, name: string, org: { id: string; name: string } | null = null, status: string | null = null, active = true) =>
  ({ user_id: id, user_name: name, email: `${id}@x.co`, is_active: active, organization: org, membership_status: status, assigned_at: null });

describe('PlatformRbacComponent: roles y accesos', () => {
  let fixture: ComponentFixture<PlatformRbacComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const panel = (): HTMLElement | null => el().querySelector<HTMLElement>('[data-testid="role-panel"]');
  const roleCards = (): string[] => Array.from(el().querySelectorAll('[data-testid="role-cards"] article')).map((c) => c.getAttribute('data-testid')!);
  const flushAssignments = (code: string, body: object): void => {
    http.expectOne((r) => r.url === `${API}/rbac/roles/${code}/assignments` && r.params.get('page') === '1' && r.params.get('page_size') === '3').flush(body);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PlatformRbacComponent], providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(PlatformRbacComponent);
    fixture.detectChanges();
    http.expectOne(`${API}/rbac/catalog`).flush({ data: catalog });
    fixture.detectChanges();
    flushAssignments('SUPER_ADMIN', assignmentsPage([holder('u1', 'Ana Gómez')]));
  });
  const select = (code: string): void => {
    el().querySelector<HTMLButtonElement>(`[data-testid="role-${code}"] button`)!.click();
    fixture.detectChanges();
  };

  it('presenta «Roles y accesos» con pestañas y los cuatro perfiles en una cuadrícula, sin «Consulta gremial»', () => {
    const text = el().textContent!.replace(/\s+/g, ' ');

    expect(el().querySelector('h1')!.textContent).toBe('Roles y accesos');
    expect(text).toContain('Gestiona quién puede hacer qué en LoGyCO₂');
    expect(roleCards()).toEqual(['role-SUPER_ADMIN', 'role-ORG_ADMIN', 'role-ORG_ANALYST', 'role-ORG_VIEWER']);
    expect(text).not.toContain('Consulta gremial');
    expect(Array.from(el().querySelectorAll('app-rbac-tabs a')).map((a) => a.textContent!.trim())).toEqual(['Roles', 'Permisos (vista técnica)']);
    expect(el().querySelector('[data-testid="tab-matrix"]')!.getAttribute('href')).toBe('/plataforma/roles/matriz');
    expect(el().querySelector('[data-testid="tab-roles"]')!.getAttribute('href')).toBe('/plataforma/roles');
  });

  it('cada tarjeta indica alcance y PERSONAS reales, sin textos repetitivos ni términos técnicos', () => {
    const text = el().textContent!.replace(/\s+/g, ' ');
    const counts = Array.from(el().querySelectorAll('[data-testid="people-count"]')).map((c) => c.textContent!.trim());

    expect(counts).toEqual(['2', '1', '0', '3']); // SUPER_ADMIN: 3 asignaciones, 2 personas
    expect(el().querySelector('[data-testid="role-SUPER_ADMIN"]')!.textContent).toContain('Global');
    expect(el().querySelector('[data-testid="role-ORG_ADMIN"]')!.textContent).toContain('Empresa');
    expect(text).not.toMatch(/se activ|asignados|membres/i);
    expect(text.replace(/[a-z_]+:[a-z]+ \w+/gi, '')).not.toMatch(/\b(organizations|memberships|reports|imports):[a-z]+/);
  });

  it('el panel de detalle va acoplado junto a las tarjetas (no es una ventana modal) con el primer perfil seleccionado', () => {
    expect(el().querySelector('dialog')).toBeNull();
    expect(panel()).not.toBeNull();
    expect(panel()!.querySelector('#panel-title')!.textContent).toContain('Superadministrador');
    expect(el().querySelector('[data-testid="role-SUPER_ADMIN"]')!.getAttribute('data-selected')).toBe('true');
    expect(el().querySelector('.layout')!.classList.contains('with-panel')).toBeTrue();
  });

  it('elegir otro perfil cambia el panel y pide solo sus primeras personas al servidor', () => {
    select('ORG_VIEWER');
    flushAssignments('ORG_VIEWER', assignmentsPage([holder('u9', 'Luis Gómez', { id: 'o1', name: 'ENVIA' }, 'PENDING')], 25));

    expect(panel()!.querySelector('#panel-title')!.textContent).toContain('Usuario de consulta');
    expect(el().querySelector('[data-testid="role-ORG_VIEWER"]')!.getAttribute('data-selected')).toBe('true');
    expect(el().querySelector('[data-testid="role-SUPER_ADMIN"]')!.getAttribute('data-selected')).toBe('false');
    const row = panel()!.querySelector('[data-testid="people-table"] tbody tr')!;

    expect(row.textContent).toContain('Luis Gómez');
    expect(row.textContent).toContain('ENVIA');
    expect(row.textContent).toContain('Pendiente de aprobación');
    expect(row.querySelector('a')!.getAttribute('href')).toBe('/plataforma/usuarios/u9');
  });

  it('con muchas personas el panel muestra solo unas pocas y enlaza al listado completo de Usuarios filtrado por el rol', () => {
    select('ORG_ADMIN');
    flushAssignments('ORG_ADMIN', assignmentsPage([holder('a', 'A', { id: 'o', name: 'E' }, 'ACTIVE'), holder('b', 'B', { id: 'o', name: 'E' }, 'ACTIVE')], 4200));

    expect(panel()!.querySelectorAll('[data-testid="people-table"] tbody tr').length).toBe(2);
    expect(panel()!.querySelector('[data-testid="panel-people"]')!.textContent).toBe('1');
    const all = panel()!.querySelector('[data-testid="see-all"]')!;
    expect(all.textContent).toContain('Ver las 4200 personas');
    expect(all.getAttribute('href')).toBe('/plataforma/usuarios?rol=ORG_ADMIN');
    expect(panel()!.querySelector('[data-testid="people-link"]')!.getAttribute('href')).toBe('/plataforma/usuarios?rol=ORG_ADMIN');
  });

  it('el detalle agrupa las capacidades por función con su estado real y explica las restricciones', () => {
    select('ORG_VIEWER');
    flushAssignments('ORG_VIEWER', assignmentsPage([]));
    const groups = Array.from(panel()!.querySelectorAll('[data-testid="capability-group"]')).map((g) => g.textContent!.replace(/\s+/g, ' ').trim());

    expect(groups.some((g) => g.startsWith('Empresas y accesosDisponible'))).toBeTrue();
    const open = Array.from(panel()!.querySelectorAll('details')).map((d) => d.open);
    expect(open[0]).toBeTrue(); // solo el primer grupo llega abierto: el panel es corto y no obliga a desplazarse
    expect(open.slice(1).every((o) => !o)).toBeTrue();
    expect(groups.some((g) => g.startsWith('ReportesAún no disponible') && g.includes('Consultar los reportes'))).toBeTrue();
    expect(groups.some((g) => g.startsWith('Información sectorialComplementaria'))).toBeTrue();
    expect(panel()!.textContent).toContain('Restricciones');
    expect(panel()!.textContent).toContain('No modifica información.');
    expect(panel()!.textContent).not.toMatch(/\b[a-z_]+:[a-z]+\b/);
  });

  it('un rol global se describe con sus alcances de plataforma y lleva a Superadministradores', () => {
    expect(panel()!.textContent).toContain('Crear, editar, activar y eliminar empresas');
    expect(panel()!.textContent).toContain('No accede a los datos privados de las empresas');
    expect(panel()!.querySelector('[data-testid="people-link"]')!.getAttribute('href')).toBe('/plataforma/superadministradores');
    expect(panel()!.querySelector('[data-testid="people-table"] a')!.getAttribute('href')).toBe('/plataforma/superadministradores/u1');
  });

  it('un perfil sin personas muestra un estado vacío', () => {
    select('ORG_ANALYST');
    flushAssignments('ORG_ANALYST', assignmentsPage([]));

    expect(panel()!.textContent).toContain('Sin personas');
  });

  it('la X oculta el panel y las tarjetas ocupan todo el ancho; volver a elegir un perfil lo muestra', () => {
    const close = panel()!.querySelector<HTMLButtonElement>('[data-testid="close-panel"]')!;
    expect(close.getAttribute('aria-label')).toBe('Cerrar detalle');

    close.click();
    fixture.detectChanges();
    expect(panel()).toBeNull();
    expect(el().querySelector('.layout')!.classList.contains('with-panel')).toBeFalse();

    select('ORG_ADMIN');
    flushAssignments('ORG_ADMIN', assignmentsPage([]));
    expect(panel()).not.toBeNull();
  });

  it('cada «Ver detalle» tiene un nombre accesible propio e indica cuál está activo', () => {
    const buttons = Array.from(el().querySelectorAll('article button'));

    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Ver detalle de Superadministrador', 'Ver detalle de Administrador de empresa', 'Ver detalle de Analista de huella de carbono', 'Ver detalle de Usuario de consulta']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
  });

  it('explica dónde se asignan los roles, enlazando a los módulos que los administran', () => {
    const where = el().querySelector('[data-testid="where-assigned"]')!;

    expect(where.textContent).toContain('¿Dónde se asignan los roles?');
    expect(Array.from(where.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['/plataforma/organizaciones', '/plataforma/usuarios', '/plataforma/superadministradores']);
  });

  it('es de solo lectura: no ofrece crear ni editar roles o permisos', () => {
    expect(el().querySelector('input, textarea, select')).toBeNull();
    expect(Array.from(el().querySelectorAll('button')).map((b) => b.textContent!.trim().toLowerCase()).some((t) => /crear|editar|eliminar|nuevo/.test(t))).toBeFalse();
  });
});
