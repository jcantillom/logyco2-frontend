import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { PlatformRbacMatrixComponent } from './platform-rbac-matrix.component';

const API = 'http://api.test/api/v1';
const role = (code: string, name: string, scope: string, permissions: string[], people: number) =>
  ({ code, name, description: null, scope, is_active: true, permissions, assignments: people, effective_assignments: people, people });
const catalog = {
  roles: [
    role('SUPER_ADMIN', 'Superadministrador', 'GLOBAL', ['organizations:manage'], 2),
    role('ORG_VIEWER', 'Consulta de empresa', 'ORGANIZATION', ['reports:read'], 3),
    role('GUILD_VIEWER', 'Consulta gremial', 'ORGANIZATION', ['sector_reports:read'], 0),
  ],
  permissions: [
    { code: 'organizations:manage', name: 'Administrar empresas', description: null, implementation: 'active' },
    { code: 'reports:read', name: 'Consultar reportes', description: null, implementation: 'planned' },
    { code: 'sector_reports:read', name: 'Consultar reportes sectoriales', description: null, implementation: 'complementary' },
  ],
};

describe('PlatformRbacMatrixComponent: matriz técnica', () => {
  let fixture: ComponentFixture<PlatformRbacMatrixComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PlatformRbacMatrixComponent], providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(PlatformRbacMatrixComponent);
    fixture.detectChanges();
    http.expectOne(`${API}/rbac/catalog`).flush({ data: catalog });
    fixture.detectChanges();
  });
  it('conserva los datos reales: permisos, estado (En uso / Previsto / Complementario) y quién los tiene', () => {
    const rows = Array.from(el().querySelectorAll('[data-testid="rbac-matrix"] tbody tr')).map((r) => ({
      code: r.querySelector('code')!.textContent,
      state: r.querySelector('td.state')!.textContent!.trim(),
      granted: Array.from(r.querySelectorAll('td:not(.state)')).map((c) => c.getAttribute('aria-label')),
    }));

    expect(rows).toEqual([
      { code: 'organizations:manage', state: 'En uso', granted: ['Concedido', 'No concedido', 'No concedido'] },
      { code: 'reports:read', state: 'Previsto', granted: ['No concedido', 'Concedido', 'No concedido'] },
      { code: 'sector_reports:read', state: 'Complementario', granted: ['No concedido', 'No concedido', 'Concedido'] },
    ]);
  });

  it('muestra cada permiso por su nombre en español y deja el código técnico como referencia secundaria', () => {
    const first = el().querySelector('[data-testid="rbac-matrix"] tbody tr th')!;

    expect(first.querySelector('.perm-label')!.textContent).toBe('Administrar empresas');
    expect(first.querySelector('.perm-code')!.textContent).toBe('organizations:manage');
    const labels = Array.from(el().querySelectorAll('.perm-label')).map((l) => l.textContent);
    expect(labels).toEqual(['Administrar empresas', 'Consultar reportes', 'Consultar estadísticas sectoriales']);
  });

  it('los roles usan su nombre de negocio y el heredado conserva el del catálogo', () => {
    const names = Array.from(el().querySelectorAll('th.role .role-name')).map((n) => n.textContent);
    expect(names).toEqual(['Superadministrador', 'Consulta', 'Consulta gremial']);
  });

  it('conserva el rol gremial como «Heredado» y muestra personas por rol', () => {
    const headers = Array.from(el().querySelectorAll('th.role')).map((h) => h.textContent!.replace(/\s+/g, ' '));

    expect(headers[2]).toContain('Consulta gremial');
    expect(headers[2]).toContain('Heredado');
    expect(headers[0]).not.toContain('Heredado');
    expect(headers[0]).toContain('2 personas');
  });

  it('el desplazamiento es de la tabla y accesible con teclado; las pestañas permiten volver a Roles', () => {
    const scroller = el().querySelector<HTMLElement>('.scroller')!;

    expect(scroller.getAttribute('tabindex')).toBe('0');
    expect(scroller.getAttribute('role')).toBe('region');
    expect(scroller.getAttribute('aria-label')).toContain('desplazable');
    expect(el().querySelector('[data-testid="tab-roles"]')!.getAttribute('href')).toBe('/plataforma/roles');
    expect(el().querySelector('[data-testid="tab-matrix"]')!.textContent).toContain('Permisos (vista técnica)');
  });

  it('es de solo lectura', () => {
    expect(el().querySelector('input, textarea, select')).toBeNull();
    expect(el().textContent).toContain('no se edita desde aquí');
  });
});
