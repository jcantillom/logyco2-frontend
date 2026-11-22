import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { pagedBody, summaryDto, vehicleDetailDto, vehicleDto } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { catalogDto } from '../emissions/emissions.fixtures';
import { PlatformOrganizationDetailComponent } from './platform-organization-detail.component';
import { PlatformOrganizationVehiclesFacade } from './platform-organization-vehicles.facade';

const API = 'http://api.test/api/v1';
const ORG_ID = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';
const V = `${API}/platform/organizations/${ORG_ID}/vehicles`;
const orgDto = { id: ORG_ID, name: 'Acme', legal_name: 'Acme S.A.S.', tax_id: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', types: [] };
const pag = (total: number) => ({ page: 1, page_size: 100, total, total_pages: 1, has_next: false, has_previous: false });

describe('Consola Super Admin: pestaña «Vehículos» de una empresa (solo lectura)', () => {
  let fixture: ComponentFixture<PlatformOrganizationDetailComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const tab = (name: string): HTMLButtonElement => Array.from(el().querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) => t.textContent!.includes(name))!;
  const listRequest = () => http.expectOne((r) => r.url === V);

  function render(): void {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PlatformOrganizationDetailComponent);
    fixture.componentRef.setInput('id', ORG_ID);
    fixture.detectChanges();
    http.match(`${API}/organizations/${ORG_ID}`).forEach((r) => r.flush({ data: orgDto, meta: {} }));
    http.match(`${API}/organizations/${ORG_ID}/relationships`).forEach((r) => r.flush({ data: [], meta: {} }));
    http.match(`${API}/organization-types`).forEach((r) => r.flush({ data: [], meta: {} }));
    http.match((r) => r.url === `${API}/users`).forEach((r) => r.flush({ data: [], meta: { pagination: pag(0) } }));
    http.match((r) => r.url === `${API}/users/invitations`).forEach((r) => r.flush({ data: [], meta: { pagination: pag(0) } }));
    fixture.detectChanges();
  }

  function openVehicles(items = [vehicleDto()], total = items.length): void {
    tab('Vehículos').click();
    fixture.detectChanges();
    http.expectOne(`${V}/summary`).flush({ data: summaryDto });
    listRequest().flush(pagedBody(items, total));
    http.expectOne(`${API}/emissions/vehicles`).flush({ data: catalogDto() });
    fixture.detectChanges();
  }

  afterEach(() => http.match(() => true));

  it('el detalle de la empresa trae la pestaña «Vehículos» y no consulta nada hasta abrirla', () => {
    render();

    expect(Array.from(el().querySelectorAll('[role="tab"]')).map((t) => t.textContent!.trim())).toEqual(['Información general', 'Administrador y equipo', 'Relaciones comerciales', 'Vehículos', 'Actividad']);
    expect(tab('Vehículos').getAttribute('aria-selected')).toBe('false');
    http.expectNone(`${V}/summary`);
    http.expectNone((r) => r.url === V);
    expect(q('app-platform-organization-vehicles')).toBeNull();
  });

  it('al abrirla pide resumen, lista y catálogo de ESA empresa (ruta de plataforma) y muestra el aviso de solo lectura', () => {
    render();
    openVehicles();

    expect(tab('Vehículos').getAttribute('aria-selected')).toBe('true');
    expect(text('[data-testid="read-only-banner"]')).toBe('Vista de solo lectura para supervisión. Cada empresa administra su propio inventario de vehículos.');
    expect(el().querySelectorAll('tbody tr').length).toBe(1);
    expect(text('tbody tr')).toContain('ABC123');
  });

  it('las cuatro tarjetas muestran los conteos del servidor y no son botones; la pestaña lleva el total de registrados', () => {
    render();
    openVehicles();
    const tiles = Array.from(el().querySelectorAll('[data-testid="vehicle-tiles"] .kpi'));

    expect(tiles.map((t) => t.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Registrados12', 'Nuevos pendientes3', 'Con inconsistencias2', 'Inactivos1']);
    expect(tiles.every((t) => t.tagName === 'DIV')).toBeTrue();
    expect(el().querySelectorAll('[data-testid="vehicle-tiles"] button').length).toBe(0);
    expect(text('[data-testid="vehicles-count"]')).toBe('12');
  });

  it('no ofrece registrar, editar, analizar archivos, cargas recientes ni el asistente', () => {
    render();
    openVehicles();

    for (const id of ['register-vehicle', 'register-empty', 'analyze-file', 'analyze-top', 'recent-analyses', 'analysis-wizard']) expect(q(`[data-testid="${id}"]`)).withContext(id).toBeNull();

    q('[data-testid="view-detail"]')!.click();
    fixture.detectChanges();
    http.expectOne(`${V}/veh-1`).flush({ data: vehicleDetailDto() });
    fixture.detectChanges();

    expect(q<HTMLDialogElement>('dialog[data-testid="vehicle-detail"]')!.open).toBeTrue();
    expect(q('[data-testid="edit-vehicle"]')).toBeNull();
  });

  it('reutiliza el detalle: diagrama del catálogo, propiedad «Sin declarar», historial y archivos', () => {
    render();
    openVehicles();
    q('[data-testid="view-detail"]')!.click();
    fixture.detectChanges();
    http.expectOne(`${V}/veh-1`).flush({ data: vehicleDetailDto() });
    fixture.detectChanges();

    expect(q('app-vehicle-diagram svg[data-testid="vehicle-diagram"]')).not.toBeNull();
    expect(text('[data-testid="ownership"]')).toBe('Sin declarar');
    expect(text('.hint')).toContain('no implica que el vehículo sea de tu empresa');
    expect(el().querySelectorAll('[data-testid="history"] > li').length).toBe(2);
    expect(text('[data-testid="runs"]')).toContain('operaciones-marzo.xlsx');
  });

  it('búsqueda, filtros y paginación se piden al servidor de plataforma con la empresa en la ruta', () => {
    render();
    openVehicles([vehicleDto()], 25);

    (Array.from(el().querySelectorAll('app-pagination button')).find((b) => b.textContent!.includes('Siguiente')) as HTMLButtonElement).click();
    const page2 = listRequest();
    expect(page2.request.params.get('page')).toBe('2');
    page2.flush(pagedBody([vehicleDto()], 25, 10, 2));
    fixture.detectChanges();

    q('[data-testid="more-filters"]')!.click();
    fixture.detectChanges();
    const status = el().querySelector<HTMLSelectElement>('select[aria-label="Filtrar por estado"]')!;

    status.value = 'INACTIVE';
    status.dispatchEvent(new Event('change'));
    const inactive = listRequest();
    expect(inactive.request.params.get('status')).toBe('INACTIVE');
    expect(inactive.request.params.get('page')).toBe('1');
    inactive.flush(pagedBody([vehicleDto({ status: 'INACTIVE' })]));
    fixture.detectChanges();
    const fuel = el().querySelector<HTMLSelectElement>('select[aria-label="Filtrar por combustible"]')!;

    fuel.value = 'GASOLINE';
    fuel.dispatchEvent(new Event('change'));
    const filtered = listRequest();
    expect(filtered.request.params.get('fuel')).toBe('GASOLINE');
    filtered.flush(pagedBody([], 0));
    fixture.detectChanges();
    expect(text('[data-testid="vehicles-empty"] h2')).toBe('Sin resultados');
  });

  it('sin vehículos dice «Esta empresa aún no tiene vehículos registrados.» sin acciones', () => {
    render();
    openVehicles([]);

    expect(text('[data-testid="vehicles-empty"] h2')).toBe('Esta empresa aún no tiene vehículos registrados.');
    expect(q('[data-testid="vehicles-empty"] button')).toBeNull();
  });

  it('si la lista o el resumen fallan muestra el error con «Reintentar»', () => {
    render();
    tab('Vehículos').click();
    fixture.detectChanges();
    http.expectOne(`${V}/summary`).flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'x' });
    listRequest().flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'x' });
    http.expectOne(`${API}/emissions/vehicles`).flush({ data: catalogDto() });
    fixture.detectChanges();

    expect(el().querySelectorAll('[role="alert"]').length).toBe(2);
    el().querySelector<HTMLButtonElement>('app-resource-state [role="alert"] button')!.click();
    listRequest().flush(pagedBody([vehicleDto()]));
    el().querySelector<HTMLButtonElement>('[data-testid="vehicle-tiles"] [role="alert"] button')!.click();
    http.expectOne(`${V}/summary`).flush({ data: summaryDto });
    fixture.detectChanges();

    expect(el().querySelectorAll('tbody tr').length).toBe(1);
    expect(el().querySelectorAll('[data-testid="vehicle-tiles"] .kpi').length).toBe(4);
  });

  it('al cambiar de empresa se descarta todo y se pide el inventario de la nueva', () => {
    render();
    openVehicles();
    const facade = TestBed.inject(PlatformOrganizationVehiclesFacade);

    fixture.componentRef.setInput('id', OTHER);
    fixture.detectChanges();

    expect(facade.organizationId()).toBe(OTHER);
    expect(facade.list.data()).toBeNull();
    expect(facade.summary.data()).toBeNull();
    http.expectOne(`${API}/platform/organizations/${OTHER}/vehicles/summary`);
    http.expectOne((r) => r.url === `${API}/platform/organizations/${OTHER}/vehicles`);
    expect(q('[data-testid="vehicles-count"]')).toBeNull();
  });

  it('el CSS de la pestaña usa solo tokens de la plataforma: sin hexadecimales ni rgb()', () => {
    render();
    openVehicles();
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.banner') || (c.includes('.kpi') && c.includes('.tbl')) || c.includes('.tab-n')).join('\n');

    expect(css).toContain('.banner');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
  });
});
