import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { hueOf, initialsOf, PlatformOrganizationsComponent } from './platform-organizations.component';

const API = 'http://api.test/api/v1';
const SIZE_KEY = 'logyco2.platform.organizations.pageSize';
const QUERY_KEYS = ['page', 'page_size', 'search', 'is_active', 'type_code', 'attention', 'sort', 'order', 'deleted'];
const org = (n: number, over: Record<string, unknown> = {}) => ({
  id: `0000000${n}-0000-4000-8000-000000000000`, name: `Org ${n}`, legal_name: null, tax_id: null, is_active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', types: [], active_admins: 1, pending_invitations: 0, ...over,
});
const METRICS = {
  organizations: { total: 12, active: 9, inactive: 3, without_active_admin: 4, without_type: 2, with_pending_invitations: 3, deleted: 5, by_type: [{ code: 'CARRIER', name: 'Transportador', count: 7 }] },
  users: { total: 1, active: 1 }, memberships: { pending: 0, active: 1 }, invitations: { pending: 0 }, generated_at: '2026-11-18T00:00:00Z',
};
const pageOf = (items: unknown[], total = items.length, page = 1, pageSize = 25) => ({
  data: items, meta: { pagination: { page, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)), has_next: page * pageSize < total, has_previous: page > 1 } },
});

describe('PlatformOrganizationsComponent: lista paginada en el servidor', () => {
  let fixture: ComponentFixture<PlatformOrganizationsComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const names = (): string[] => Array.from(el().querySelectorAll('tbody th a')).map((a) => a.textContent!.trim());
  const orgRequests = (): TestRequest[] => http.match((r) => r.url === `${API}/organizations`);
  const paramsOf = (request: TestRequest): Record<string, string | null> => {
    const params = request.request.params;
    return Object.fromEntries(QUERY_KEYS.map((key) => [key, params.get(key)])); // ausente = null
  };
  /** Contesta lo pendiente (indicadores y la última página pedida) y devuelve los parámetros de esa petición. */
  function answer(items: unknown[] = [org(1)], total = items.length): Record<string, string | null> {
    http.match(`${API}/platform/metrics`).forEach((r) => r.flush({ data: METRICS }));
    const pending = orgRequests();
    const params = paramsOf(pending[pending.length - 1]);
    pending.forEach((r) => r.flush(pageOf(items, total, Number(params['page'] ?? 1), Number(params['page_size'] ?? 25))));
    fixture.detectChanges();

    return params;
  }
  function render(query: Record<string, string> = {}): void {
    localStorage.removeItem(SIZE_KEY);
    TestBed.configureTestingModule({
      imports: [PlatformOrganizationsComponent],
      providers: [...provideTestApp(), provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } }],
    });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(PlatformOrganizationsComponent);
    fixture.detectChanges();
  }
  const chip = (key: string): HTMLButtonElement => el().querySelector<HTMLButtonElement>(`[data-testid="chip-${key}"]`)!;
  const type = (selector: string, value: string): void => {
    const input = el().querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
    fixture.detectChanges();
  };
  const click = (selector: string): void => { el().querySelector<HTMLButtonElement>(selector)!.click(); fixture.detectChanges(); };
  afterEach(() => {
    localStorage.removeItem(SIZE_KEY);
  });

  it('muestra un esqueleto de carga y luego pide solo la primera página, ordenada por nombre', () => {
    render();

    expect(el().querySelectorAll('.skel').length).toBeGreaterThan(0);
    const params = answer([org(1), org(2)]);

    expect(params).toEqual(jasmine.objectContaining({ page: '1', page_size: '25', sort: 'name', order: 'asc' }));
    expect(params['search']).toBeNull();
    expect(names()).toEqual(['Org 1', 'Org 2']);
    expect(el().querySelector('.skel')).toBeNull();
  });

  it('al volver con la misma petición muestra la lista sin atenuarla y la refresca en segundo plano', () => {
    render();
    answer([org(1), org(2)]);
    fixture.destroy();

    fixture = TestBed.createComponent(PlatformOrganizationsComponent);
    fixture.detectChanges();

    expect(el().querySelector('.dt')!.classList.contains('busy')).toBeFalse();
    expect(names()).toEqual(['Org 1', 'Org 2']);
    answer([org(1), org(2), org(3)]);

    expect(names()).toEqual(['Org 1', 'Org 2', 'Org 3']);
  });

  it('si cambia el criterio la tabla se atenúa mientras llegan los datos distintos', () => {
    render();
    answer([org(1), org(2)]);
    click('[data-testid="chip-activas"]');

    expect(el().querySelector('.dt')!.classList.contains('busy')).toBeTrue();
    answer([org(1)]);

    expect(el().querySelector('.dt')!.classList.contains('busy')).toBeFalse();
    expect(names()).toEqual(['Org 1']);
  });

  it('el contador muestra el ícono y solo el número, con el texto completo para lectores de pantalla y tooltip', () => {
    render();
    answer([org(1), org(2)]);
    const result = (): HTMLElement => el().querySelector<HTMLElement>('.result')!;

    expect(result().querySelector('svg')).not.toBeNull();
    expect(result().querySelector('b')!.textContent).toBe('2');
    expect(result().querySelector('.sr-only')!.textContent!.trim()).toBe('empresas');
    expect(result().getAttribute('title')).toBe('2 empresas');

    click('[data-testid="chip-eliminadas"]');
    answer([org(1)]);

    expect(result().querySelector('b')!.textContent).toBe('1');
    expect(result().querySelector('.sr-only')!.textContent!.trim()).toBe('empresa eliminada');
  });

  it('los indicadores salen de las métricas de la plataforma, no de contar filas cargadas', () => {
    render();
    answer([org(1)]);

    const counts = Object.fromEntries(Array.from(el().querySelectorAll('.chip')).map((c) => [c.querySelector('span:not(.ci)')!.textContent!.trim(), Number(c.querySelector('b')!.textContent)]));
    expect(counts).toEqual({ Todas: 12, Activas: 9, Inactivas: 3, 'Sin administrador activo': 4, 'Con invitaciones pendientes': 3, 'Sin tipo': 2, Eliminadas: 5 });
  });

  it('cada indicador le pide el filtro al servidor y queda marcado', () => {
    render();
    answer();

    const expectations: [string, Record<string, string | null>][] = [
      ['sin-admin', { attention: 'without_admin' }],
      ['con-invitaciones', { attention: 'with_invitations' }],
      ['sin-tipo', { attention: 'without_type' }],
      ['activas', { is_active: 'true' }],
      ['inactivas', { is_active: 'false' }],
      ['eliminadas', { deleted: 'true' }],
    ];

    for (const [key, expected] of expectations) {
      click(`[data-testid="chip-${key}"]`);
      expect(answer()).toEqual(jasmine.objectContaining({ page: '1', ...expected }));
      expect(chip(key).getAttribute('aria-pressed')).toBe('true');
    }

    click('[data-testid="chip-todas"]');
    const all = answer();
    expect(all['attention']).toBeNull();
    expect(all['is_active']).toBeNull();
    expect(all['deleted']).toBeNull();
  });

  it('el enlace del resumen (`?filtro=sin-admin`) abre el listado ya filtrado', () => {
    render({ filtro: 'sin-admin' });

    expect(answer()['attention']).toBe('without_admin');
    expect(chip('sin-admin').getAttribute('aria-pressed')).toBe('true');
  });

  it('restaura de la URL página, tamaño, orden, búsqueda y tipo', () => {
    render({ vista: 'activas', q: 'norte', tipo: 'CARRIER', orden: 'created_at', dir: 'asc', pagina: '3', tam: '50' });

    expect(answer([org(1)], 140)).toEqual(jasmine.objectContaining({
      is_active: 'true', search: 'norte', type_code: 'CARRIER', sort: 'created_at', order: 'asc', page: '3', page_size: '50',
    }));
    expect((el().querySelector('#org-q') as HTMLInputElement).value).toBe('norte');
  });

  it('ignora valores inválidos de la URL en lugar de pedirlos al servidor', () => {
    render({ vista: 'cualquiera', orden: 'tax_id', pagina: '-4', tam: '7' });

    expect(answer()).toEqual(jasmine.objectContaining({ page: '1', page_size: '25', sort: 'name', order: 'asc' }));
  });

  it('la búsqueda espera a que se deje de escribir y vuelve a la primera página', fakeAsync(() => {
    render({ pagina: '4' });
    answer([org(1)], 200);

    type('#org-q', 'nor');
    type('#org-q', 'norte');
    tick(299);
    expect(orgRequests().length).toBe(0); // todavía no se pidió nada

    tick(1);
    fixture.detectChanges();
    const requests = orgRequests();
    expect(requests.map((r) => r.request.params.get('search'))).toEqual(['norte']);
    expect(paramsOf(requests[0])['page']).toBe('1');
    requests.forEach((r) => r.flush(pageOf([org(2)], 1)));
    fixture.detectChanges();
    expect(names()).toEqual(['Org 2']);
  }));

  it('el botón de borrar limpia la búsqueda y vuelve a pedir la lista completa', fakeAsync(() => {
    render({ q: 'norte' });
    answer([org(1)], 1);

    click('[data-testid="clear-search"]');

    expect(answer()['search']).toBeNull();
    expect(el().querySelector('[data-testid="clear-search"]')).toBeNull();
  }));

  it('el selector de tipo filtra en el servidor con los tipos que informan las métricas', () => {
    render();
    answer();

    expect(Array.from(el().querySelectorAll('[data-testid="type-filter"] option')).map((o) => o.textContent!.trim())).toEqual(['Todos los tipos', 'Transportador (7)']);
    type('[data-testid="type-filter"]', 'CARRIER');

    expect(answer()).toEqual(jasmine.objectContaining({ type_code: 'CARRIER', page: '1' }));
  });

  it('pagina en el servidor: muestra el rango, avanza y cambia el tamaño de página', () => {
    render();
    answer([org(1), org(2)], 60);

    expect(el().querySelector('.info')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Mostrando 1–25 de 60');
    click('[data-testid="page-next"]');
    expect(answer([org(3)], 60)).toEqual(jasmine.objectContaining({ page: '2', page_size: '25' }));
    expect(el().querySelector('.info')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Mostrando 26–50 de 60');

    type('[data-testid="page-size"]', '50');
    expect(answer([org(1)], 60)).toEqual(jasmine.objectContaining({ page: '1', page_size: '50' }));
    expect(localStorage.getItem(SIZE_KEY)).toBe('50');
  });

  it('ordena por columna: alterna el sentido, marca aria-sort y vuelve a la primera página', () => {
    render({ pagina: '2' });
    answer([org(1)], 80);
    const sorted = (id: string): string | null => el().querySelector(`[data-testid="${id}"]`)!.closest('th')!.getAttribute('aria-sort');

    expect(sorted('sort-name')).toBe('ascending');
    click('[data-testid="sort-name"]');
    expect(answer([org(1)], 80)).toEqual(jasmine.objectContaining({ sort: 'name', order: 'desc', page: '1' }));
    expect(sorted('sort-name')).toBe('descending');

    click('[data-testid="sort-created"]');
    expect(answer()).toEqual(jasmine.objectContaining({ sort: 'created_at', order: 'desc' })); // las fechas, de la más reciente
    expect(sorted('sort-name')).toBe('none');

    click('[data-testid="sort-status"]');
    expect(answer()).toEqual(jasmine.objectContaining({ sort: 'status', order: 'asc' }));
  });

  it('con criterios sin coincidencias ofrece limpiarlos; sin criterios invita a crear la primera empresa', () => {
    render({ q: 'zzz' });
    answer([], 0);

    expect(el().querySelector('[data-testid="empty-state"] h2')!.textContent).toContain('Sin resultados');
    click('[data-testid="empty-state"] button');
    answer([], 0);
    expect(el().querySelector('[data-testid="empty-state"] h2')!.textContent).toContain('Aún no hay empresas');
  });

  it('un error al cargar la primera página se muestra con opción de reintentar', () => {
    render();
    http.match(`${API}/platform/metrics`).forEach((r) => r.flush({ data: METRICS }));
    orgRequests().forEach((r) => r.flush({ error: { code: 'X', message: 'Falla' } }, { status: 500, statusText: 'Server Error' }));
    fixture.detectChanges();

    expect(el().querySelector('[role=alert]')).not.toBeNull();
    click('[role=alert] button');
    expect(orgRequests().length).toBe(1);
  });

  it('cada empresa muestra sus iniciales, su estado y sus tipos con icono', () => {
    render();
    answer([org(1, { name: 'Acme Logística', types: [{ code: 'CARRIER', name: 'Transportador' }] }), org(2, { is_active: false }), org(3, { active_admins: 0 })], 3);

    const rows = el().querySelectorAll('tbody tr');
    expect(rows[0].querySelector('.avatar')!.textContent!.trim()).toBe('AL');
    expect(rows[0].querySelector('.tbadge svg')).not.toBeNull();
    expect(rows[1].querySelector('.avatar')!.classList.contains('off')).toBeTrue(); // inactiva
    expect(rows[2].querySelector('.avatar')!.classList.contains('warn')).toBeTrue(); // sin administrador
    expect(rows[2].textContent).toContain('Sin administrador');
  });

  it('reserva espacio para nombres largos sin comprimir ni ocultar las otras columnas', () => {
    render();
    const name = 'Transportes y Soluciones Logísticas Internacionales del Caribe';
    answer([org(1, {
      name, legal_name: `${name} Sociedad por Acciones Simplificada`,
      tax_id: '901234567-8', active_admins: 0, pending_invitations: 12,
      types: [{ code: 'CARRIER', name: 'Transportador' }, { code: 'SHIPPER', name: 'Generador de carga' }],
    })]);

    for (const width of [360, 760, 1080, 1400]) {
      el().style.cssText = `display:block;width:${width}px;max-width:none`;
      const region = el().querySelector<HTMLElement>('.dt')!;
      const table = region.querySelector('table')!;
      const row = table.querySelector('tbody tr')!;
      const nameCell = row.querySelector('th')!;
      const link = nameCell.querySelector('a')!;

      expect(nameCell.getBoundingClientRect().width).withContext(`company width at ${width}px`).toBeGreaterThanOrEqual(300);
      expect(getComputedStyle(link).whiteSpace).toBe('normal');
      expect(link.textContent).toBe(name);
      expect(link.scrollWidth).toBeLessThanOrEqual(link.clientWidth + 1);
      expect(region.getBoundingClientRect().width).toBeLessThanOrEqual(width);
      expect(getComputedStyle(region).overflowX).toBe('auto');
      for (const cell of Array.from(row.children)) {
        expect(getComputedStyle(cell).display).withContext(`visible column at ${width}px`).not.toBe('none');
      }
    }
  });

  it('permite enfocar y desplazar el listado con teclado y conserva el enlace de cada empresa', () => {
    render();
    answer([org(1)]);
    const region = el().querySelector<HTMLElement>('.dt')!;

    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.getAttribute('aria-label')).toBe('Listado de empresas');
    region.focus();
    expect(document.activeElement).toBe(region);
    expect(el().querySelector('tbody th a')!.getAttribute('href')).toBe(`/plataforma/organizaciones/${org(1).id}`);
  });

  it('integra búsqueda y paginación en el directorio y agrupa los accesos sin perder datos', () => {
    render();
    answer([org(1, { tax_id: '901234567-8', active_admins: 2, pending_invitations: 3 })]);

    const directory = el().querySelector('.directory');
    expect(directory?.querySelector('[role="search"]')).toBeTruthy();
    expect(directory?.querySelector('app-pager')).toBeTruthy();
    expect(el().querySelectorAll('thead th').length).toBe(7);
    const access = el().querySelector('tbody .c-access');
    expect(access?.textContent).toContain('2 administradores');
    expect(access?.textContent).toContain('3 invitaciones pendientes');
    expect(el().querySelector('tbody .c-nit')?.textContent).toContain('901234567-8');
  });

  it('alinea las filas con uno o dos tipos y evita partir sus etiquetas habituales', () => {
    render();
    const carrier = { code: 'CARRIER', name: 'Transportador' };
    const shipper = { code: 'SHIPPER', name: 'Generador de carga' };
    answer([org(1, { types: [carrier] }), org(2, { types: [shipper, carrier] })]);

    for (const width of [760, 1080, 1400]) {
      el().style.cssText = `display:block;width:${width}px;max-width:none`;
      const rows = Array.from(el().querySelectorAll('tbody tr'));
      expect(Math.abs(rows[0].getBoundingClientRect().height - rows[1].getBoundingClientRect().height)).toBeLessThanOrEqual(1);
      for (const label of Array.from(el().querySelectorAll<HTMLElement>('.tbadge'))) {
        expect(label.getBoundingClientRect().height).withContext(`single-line type at ${width}px`).toBeLessThanOrEqual(30);
        expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth + 1);
      }
    }
  });

  describe('equipo desplegable por empresa', () => {
    const userDto = (id: string, name: string, status: string, orgId = org(1).id) => ({
      id, full_name: name, email: `${id}@x.co`, is_active: true,
      memberships: [{ membership_id: `m-${id}`, organization: { id: orgId, name: 'Org 1' }, status, roles: ['ORG_ANALYST'] }],
    });
    const twirl = (): HTMLButtonElement => el().querySelector<HTMLButtonElement>('tbody tr .twirl')!;
    const teamRequests = (): TestRequest[] => http.match((r) => r.url === `${API}/users`);

    it('al desplegar pide solo el equipo de ESA empresa al servidor y lo muestra sin las membresías revocadas; al plegar lo oculta', () => {
      render();
      answer([org(1), org(2)]);

      expect(el().querySelector('[data-testid="team-panel"]')).toBeNull();
      expect(teamRequests().length).toBe(0); // nada se pide hasta desplegar

      twirl().click();
      fixture.detectChanges();
      const requests = teamRequests();

      expect(requests.length).toBe(1);
      expect(requests[0].request.params.get('organization_id')).toBe(org(1).id);
      expect(requests[0].request.params.get('page_size')).toBe('10');
      expect(twirl().getAttribute('aria-expanded')).toBe('true');

      requests[0].flush({ data: [userDto('u1', 'Ana Pérez', 'ACTIVE'), userDto('u2', 'Beto Revocado', 'REVOKED')], meta: { pagination: { page: 1, page_size: 10, total: 2, total_pages: 1, has_next: false, has_previous: false } } });
      fixture.detectChanges();
      const panel = el().querySelector('[data-testid="team-panel"]')!;

      expect(panel.textContent).toContain('Ana Pérez');
      expect(panel.textContent).toContain('Activo');
      expect(panel.textContent).not.toContain('Beto Revocado');
      expect(panel.querySelector('a')!.getAttribute('href')).toBe('/plataforma/usuarios/u1');
      expect(el().querySelector('[data-testid="team-more"]')).toBeNull(); // caben todas

      twirl().click();
      fixture.detectChanges();

      expect(el().querySelector('[data-testid="team-panel"]')).toBeNull();
      expect(twirl().getAttribute('aria-expanded')).toBe('false');
    });

    it('si hay más personas que las mostradas enlaza a Usuarios filtrado por esa empresa', () => {
      render();
      answer([org(1)]);
      twirl().click();
      fixture.detectChanges();
      teamRequests()[0].flush({ data: [userDto('u1', 'Ana Pérez', 'ACTIVE')], meta: { pagination: { page: 1, page_size: 10, total: 42, total_pages: 5, has_next: true, has_previous: false } } });
      fixture.detectChanges();
      const link = el().querySelector<HTMLAnchorElement>('[data-testid="team-more"]')!;

      expect(link.getAttribute('href')).toBe(`/plataforma/usuarios?empresa=${org(1).id}`);
    });

    it('una empresa sin personas lo dice, y un fallo permite reintentar', () => {
      render();
      answer([org(1)]);
      twirl().click();
      fixture.detectChanges();
      teamRequests()[0].flush({ message: 'x' }, { status: 500, statusText: 'Error' });
      fixture.detectChanges();

      expect(el().querySelector('[data-testid="team-panel"] [role="alert"]')).not.toBeNull();
      el().querySelector<HTMLButtonElement>('[data-testid="team-panel"] [role="alert"] button')!.click();
      teamRequests()[0].flush({ data: [], meta: { pagination: { page: 1, page_size: 10, total: 0, total_pages: 1, has_next: false, has_previous: false } } });
      fixture.detectChanges();

      expect(el().querySelector('[data-testid="team-panel"]')!.textContent).toContain('aún no tiene personas');
    });
  });

  it('Generador de carga y Transportador usan íconos distintos (caja y camión)', () => {
    render();
    answer([org(1, { types: [{ code: 'SHIPPER', name: 'Generador de carga' }, { code: 'CARRIER', name: 'Transportador' }] })]);
    const path = (label: string): string =>
      Array.from(el().querySelectorAll('.tbadge')).find((b) => b.textContent!.includes(label))!.querySelector('path')!.getAttribute('d')!;

    expect(path('Generador de carga')).toContain('M21 8l-9-5-9 5'); // caja
    expect(path('Transportador')).toContain('M2 6h11v10H2z'); // camión
    expect(path('Generador de carga')).not.toBe(path('Transportador'));
  });

  it('distingue los conteos desconocidos de cero en la columna de administración', () => {
    render();
    answer([
      org(1, { active_admins: null, pending_invitations: null }),
      org(2, { active_admins: 1, pending_invitations: 1 }),
      org(3, { active_admins: 0, pending_invitations: 0 }),
    ]);
    const cells = el().querySelectorAll('tbody .c-access');
    expect(cells[0].textContent).toContain('Administradores: —');
    expect(cells[0].textContent).toContain('Invitaciones: —');
    expect(cells[0].textContent).not.toContain('Sin invitaciones pendientes');
    expect(cells[1].textContent).toContain('1 administrador');
    expect(cells[1].textContent).toContain('1 invitación pendiente');
    expect(cells[2].textContent).toContain('Sin administrador');
    expect(cells[2].textContent).toContain('Sin invitaciones pendientes');
  });

  it('resalta la fila con el tono suave de la paleta elegida (no con el verde de éxito) sin perder legibilidad', () => {
    render();
    answer([org(1)]);
    const row = el().querySelector<HTMLElement>('tbody tr')!;
    const link = row.querySelector<HTMLAnchorElement>('a')!;
    const reference = document.createElement('span');
    reference.style.backgroundColor = 'var(--c-row-hover)';
    el().appendChild(reference);
    row.style.transition = 'none';
    link.focus();

    expect(getComputedStyle(row).backgroundColor).toBe(getComputedStyle(reference).backgroundColor);
    expect(getComputedStyle(row.querySelector('th')!).backgroundColor).toBe(getComputedStyle(row).backgroundColor);
    expect(getComputedStyle(link).color).not.toBe(getComputedStyle(row).backgroundColor);

    el().style.setProperty('--c-row-hover', 'rgb(220, 240, 230)'); // la fila sigue al token, no a un color fijo
    expect(getComputedStyle(row).backgroundColor).toBe('rgb(220, 240, 230)');
  });

  it('centra cabeceras y registros en sus columnas excepto Empresa, incluso al desplazar la tabla', () => {
    render();
    answer([
      org(1, { active_admins: 0, types: [{ code: 'CARRIER', name: 'Transportador' }] }),
      org(2, { active_admins: 2, is_active: false }),
      org(3, { active_admins: null }),
    ]);
    const textRect = (element: Element): DOMRect => {
      const text = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())!;
      const range = document.createRange();
      range.selectNodeContents(text);
      return range.getBoundingClientRect();
    };
    const region = el().querySelector<HTMLElement>('.dt')!;
    const headers = Array.from(el().querySelectorAll('thead th')).slice(0, 6);
    for (const width of [360, 760, 1080, 1400]) {
      el().style.cssText = `display:block;width:${width}px;max-width:none`;
      for (const scrollLeft of [0, 180]) {
        region.scrollLeft = scrollLeft;
        for (const row of Array.from(el().querySelectorAll('tbody tr'))) {
          const labels = [
            row.querySelector('.who')!, row.querySelector('.c-nit')!,
            row.querySelector('.types > :first-child')!, row.querySelector('.access > :first-child')!,
            row.querySelector('.pill')!, row.querySelector('.c-created')!,
          ];
          headers.forEach((header, index) => {
            const label = header.querySelector('button, span')!;
            const headerRect = textRect(label);
            const recordRect = index === 1 || index === 5 ? textRect(labels[index]) : labels[index].getBoundingClientRect();
            const headerPosition = index === 0 ? headerRect.left : headerRect.left + headerRect.width / 2;
            const recordPosition = index === 0 ? recordRect.left : recordRect.left + recordRect.width / 2;
            expect(Math.abs(headerPosition - recordPosition))
              .withContext(`column ${index + 1}, width ${width}, scroll ${scrollLeft}`)
              .toBeLessThanOrEqual(1);
            if (index > 0) {
              const columnRect = header.getBoundingClientRect();
              expect(Math.abs(headerPosition - (columnRect.left + columnRect.width / 2)))
                .withContext(`centered header ${index + 1} at ${width}px`)
                .toBeLessThanOrEqual(1);
            }
          });
        }
      }
    }
  });
});

describe('avatar de empresa', () => {
  it('toma las iniciales de las dos primeras palabras e ignora las etiquetas entre corchetes', () => {
    expect(initialsOf('Acme Logística SAS')).toBe('AL');
    expect(initialsOf('Cargas')).toBe('C');
    expect(initialsOf('[PRUEBA] Flujo E2E')).toBe('FE');
    expect(initialsOf('   ')).toBe('·');
  });

  it('el tono es estable por nombre y solo usa los matices de marca LOGYCA (naranja o aguamarina)', () => {
    expect(hueOf('Acme')).toBe(hueOf('Acme'));
    for (const name of ['A', 'Zeta', 'Transportes del Norte', '[PRUEBA] X']) {
      expect([17, 174]).toContain(hueOf(name));
    }
  });
});
