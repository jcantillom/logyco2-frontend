import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { DashboardComponent } from './dashboard.component';
import { HomeFacade } from './home.facade';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function create(memberships = [membership(ORG_ENVIA), membership(ORG_COORDINADORA, ['ORG_VIEWER'])]): void {
    TestBed.configureTestingModule({ imports: [DashboardComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships }), TestBed.inject(SessionStore));
  }

  function render(): void {
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  }

  it('muestra un único aviso «Próximamente» para emisiones, sin cifras, gráficos ni filtros de período', () => {
    create();
    render();

    const notice = el().querySelector('[data-testid="emissions-soon"]')!;
    expect(notice.textContent).toContain('Próximamente: indicadores de emisiones, intensidad y tendencia');
    expect(el().querySelectorAll('[data-testid="emissions-soon"]').length).toBe(1);
    expect(el().querySelector('[data-testid="home-kpis"]')).toBeNull();
    expect(el().querySelector('app-trend-chart')).toBeNull();
    expect(el().querySelector('#period')).toBeNull();
    expect(el().querySelector('#compare')).toBeNull();
  });

  it('el encabezado da la bienvenida por nombre, sin repetir «Resumen» (sin chips de empresa ni notas de filtros)', () => {
    create();
    render();
    expect(el().querySelector('h1')!.textContent).toMatch(/^\s*Bienvenido, \S+/);
    expect(el().querySelector('h1')!.textContent).not.toContain('Resumen');
    expect(el().querySelector('.chips')).toBeNull();
    expect(el().textContent).not.toContain('Los filtros se habilitan');
  });

  it('las acciones pendientes salen de los datos reales de la empresa', () => {
    create();
    render();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`http://api.test/api/v1/organizations/${ORG_ENVIA.id}`).flush({
      data: { id: ORG_ENVIA.id, name: 'ENVIA', legal_name: null, tax_id: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', types: [{ code: 'CARRIER', name: 'Transportador' }], active_admins: 1, pending_invitations: 2 },
    });
    fixture.detectChanges();

    const todo = el().querySelector('[data-testid="todo"]')!.textContent!;
    expect(todo).toContain('Invitaciones pendientes');
    expect(todo).toContain('Datos de la empresa incompletos');
    expect(el().querySelector('[aria-labelledby="todo-title"]')!.textContent).toContain('Definir el plan de reducción'); // «Próximos pasos» (Próximamente)
    expect(el().querySelector('[data-testid="todo-count"]')!.textContent).toContain('4 pendientes');
    expect(TestBed.inject(HomeFacade).pending()).toBe(4); // 2 invitaciones + 2 datos faltantes
  });

  it('las solicitudes de vinculación recibidas aparecen como acción pendiente con enlace directo', () => {
    create();
    render();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`http://api.test/api/v1/organizations/${ORG_ENVIA.id}`).flush({
      data: { id: ORG_ENVIA.id, name: 'ENVIA', legal_name: 'ENVIA SAS', tax_id: '900-1', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', types: [{ code: 'CARRIER', name: 'Transportador' }], active_admins: 1, pending_invitations: 0 },
    });
    http.expectOne(`http://api.test/api/v1/organizations/${ORG_ENVIA.id}/links/summary`).flush({ data: { active: 1, pending_received: 2, pending_sent: 0, external: 0 } });
    fixture.detectChanges();

    const action = TestBed.inject(HomeFacade).actions().find((a) => a.label === 'Solicitudes de vinculación')!;
    expect(action.count).toBe(2);
    expect(action.path).toBe('/mi-empresa');
    expect(action.query).toEqual({ tab: 'links', sub: 'solicitudes', view: 'received' });
    expect(el().querySelector('[data-testid="todo"]')!.textContent).toContain('Solicitudes de vinculación');
  });

  it('sin empresa activa explica por qué', () => {
    create([]);
    render();

    expect(el().querySelector('[data-testid="org-required"]')).not.toBeNull();
    expect(el().querySelector('[data-testid="emissions-soon"]')).toBeNull();
  });
});
