import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { TrendChartComponent } from '../../shared/ui/charts/trend-chart.component';
import { factorDto, GASOLINE, NATURAL_GAS } from '../emissions/emissions.fixtures';
import { PlatformDashboardComponent } from './platform-dashboard.component';

const API = 'http://api.test/api/v1';
const metrics = {
  organizations: { total: 3, active: 2, inactive: 1, without_active_admin: 2, without_type: 1, with_pending_invitations: 1, by_type: [{ code: 'CARRIER', name: 'Transportador', count: 2 }, { code: 'SHIPPER', name: 'Generador de carga', count: 1 }] },
  users: { total: 3, active: 2 },
  memberships: { pending: 2, active: 1 },
  invitations: { pending: 4 },
  super_admins: { active: 3, max_active: 5, reserved_by_invitations: 1, available: 1 },
  generated_at: '2026-11-14T12:00:00Z',
};
/** Sin nada pendiente: ni membresías por aprobar, ni empresas sin administrador o sin tipo. */
const quietMetrics = { ...metrics, organizations: { ...metrics.organizations, without_active_admin: 0, without_type: 0 }, memberships: { pending: 0, active: 1 }, invitations: { pending: 0 } };
const zero = { organizations_created: 0, users_registered: 0, invitations_created: 0, admins_onboarded: 0, memberships_approved: 0, super_admins_granted: 0 };
const localToday = (): string => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const trends = (summary = { ...zero, organizations_created: 2, users_registered: 3, invitations_created: 4, admins_onboarded: 1, memberships_approved: 2 }, dateTo = localToday()) => ({
  period: { date_from: '2026-10-16', date_to: dateTo, granularity: 'day', days: 30 },
  summary,
  points: [{ bucket: '2026-11-13', ...summary }, { bucket: '2026-11-14', ...zero }],
  audit_available_since: '2026-11-10T00:00:00Z',
});
const attention = (empty = false) => ({
  organizations_without_admin: { count: empty ? 0 : 2, items: empty ? [] : [{ id: 'o1', name: 'ENVIA', has_pending_invitation: false }, { id: 'o2', name: 'Coordinadora', has_pending_invitation: true }] },
  organizations_waiting_admin: empty ? 0 : 1, // Coordinadora solo espera que su administrador acepte; ENVIA requiere reinvitar
  inactive_organizations: { count: empty ? 0 : 1, items: empty ? [] : [{ id: 'o3', name: 'Vieja SAS' }] },
  pending_memberships: { count: empty ? 0 : 2, items: empty ? [] : [{ membership_id: 'm1', organization_id: 'o1', organization_name: 'ENVIA', user_name: 'Luis Gómez' }] },
  invitations_expiring: { count: empty ? 0 : 1, items: empty ? [] : [{ id: 'i1', organization_id: 'o1', organization_name: 'ENVIA', role_code: 'ORG_ADMIN', expires_at: '2026-11-16T00:00:00Z' }] },
  super_admins: { active: 3, max_active: 5, reserved_by_invitations: 1, available: 1 },
  super_admin_near_limit: !empty,
  expiring_within_days: 3,
});
const event = { id: 'e1', occurred_at: new Date().toISOString(), action: 'organization.create', actor_name: 'Ana Gómez', target_name: null, organization_name: 'ENVIA', channel: 'api', details: {} };

const fuelSource = { code: 'CREG_FUEL_PRICES', name: 'Precios CREG', publisher: 'CREG', url: 'https://gestornormativo.creg.gov.co/', license: null };
const fuelCard = (code: string, name: string, value: number | null, extra: Record<string, unknown> = {}) => ({
  code, name, category: 'ENERGY_MARKET', unit: 'COP/galón', status: value === null ? 'NO_DATA' : 'AVAILABLE', value, area_code: value === null ? null : '11001', area_name: value === null ? null : 'Bogotá',
  reference_period: value === null ? null : '2026-11-01', published_at: null, acquired_at: null, valid_from: value === null ? null : '2026-11-01', valid_to: null, kind: 'OFFICIAL', source_url: null, source_reference: null,
  source: fuelSource, variation: null, last_success_at: null, last_error_code: null, ...extra,
});
const FUEL_ACPM = fuelCard('FUEL_ACPM_PRICE', 'ACPM', 11616, { source_url: 'https://gestornormativo.creg.gov.co/Circular_CREG_371_2026/', source_reference: 'Circular CREG 371 de 2026', variation: { monthly_pct: null, annual_pct: null, year_to_date_pct: null, previous_pct: -0.2, previous_date: '2026-10-02' } });
const FUEL_GAS = fuelCard('FUEL_GASOLINE_PRICE', 'Gasolina', 16331);
const FUEL_GNCV = fuelCard('FUEL_GNCV_PRICE', 'GNCV', null);

describe('PlatformDashboardComponent: resumen ejecutivo con datos reales', () => {
  let fixture: ComponentFixture<PlatformDashboardComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent!.replace(/\s+/g, ' ');
  const requests = (path: string): TestRequest[] => http.match((r) => r.url === `${API}${path}`);
  const q = (selector: string): HTMLElement => el().querySelector<HTMLElement>(selector)!;

  function answer(options: { fuel?: 'ok' | 'error'; health?: 'ok' | 'down'; attentionEmpty?: boolean; quiet?: boolean; activity?: unknown[]; summary?: ReturnType<typeof trends>['summary'] } = {}): void {
    requests('/emissions/reference/fuels').forEach((r) => r.flush({ data: [factorDto(), GASOLINE(), NATURAL_GAS()] }));
    requests('/platform/metrics').forEach((r) => r.flush({ data: options.quiet ? quietMetrics : metrics }));
    requests('/platform/metrics/trends').forEach((r) => r.flush({ data: trends(options.summary) }));
    requests('/platform/attention').forEach((r) => r.flush({ data: attention(options.attentionEmpty) }));
    requests('/platform/activity').forEach((r) => r.flush({ data: { items: options.activity ?? [event] } }));
    http.match('http://api.test/health/live').forEach((r) => (options.health === 'down' ? r.error(new ProgressEvent('error')) : r.flush({ status: 'alive' })));
    http.match((r) => r.url === `${API.replace('/api/v1', '/api/v1')}/../intelligence/summary` || r.url.endsWith('/api/v1/intelligence/summary')).forEach((r) => {
      if (options.fuel === 'error') r.flush({ error: { code: 'DATABASE_ERROR', message: 'Error' } }, { status: 500, statusText: 'Server Error' });
      else r.flush({ data: { generated_at: '2026-11-18T10:00:00Z', featured: [FUEL_ACPM, FUEL_GAS, FUEL_GNCV] } });
    });
    requests('/platform/services').forEach((r) => r.flush({ data: { items: [{ id: 'sso', status: 'UP', checked_at: '2026-11-18T10:00:00Z', detail: 'ok' }, { id: 'directory', status: 'UNVERIFIED', checked_at: null, detail: 'Sin token de servicio.' }] } }));
    http.match('http://api.test/health').forEach((r) => (options.health === 'down' ? r.error(new ProgressEvent('error')) : r.flush({ status: 'ready', database: 'connected' })));
  }

  function create(): void {
    TestBed.configureTestingModule({ imports: [PlatformDashboardComponent], providers: [...provideTestApp(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin({ fullName: 'Administrador de Plataforma' }), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(PlatformDashboardComponent);
    fixture.detectChanges();
  }
  /** La tarjeta del factor se crea al llegar las métricas: sus combustibles se piden después de la primera pasada. */
  const settle = (options?: Parameters<typeof answer>[0]): void => { answer(options); fixture.detectChanges(); requests('/emissions/reference/fuels').forEach((r) => r.flush({ data: [factorDto(), GASOLINE(), NATURAL_GAS()] })); fixture.detectChanges(); };
  const choosePeriod = (value: string): void => { const select = q('#period') as HTMLSelectElement; select.value = value; select.dispatchEvent(new Event('change')); fixture.detectChanges(); };

  it('presenta una cabecera ejecutiva profesional y accesos de gestión', () => {
    create(); settle();

    expect(q('h1').textContent).toContain('Bienvenido, Administrador de Plataforma');
    expect(q('.page-header').textContent).not.toContain('Resumen ejecutivo');
    expect(q('.page-header').textContent).not.toContain('Administración de la plataforma');
    expect(q('.page-header').textContent).not.toContain('👋');
    expect(text()).not.toContain('ORG_ADMIN');
  });

  it('muestra los KPI de empresas, usuarios y superadministradores (GET /platform/metrics) y la tarjeta del factor de emisión; sin Activas, Inactivas ni Sin administrador activo', () => {
    create(); settle();

    const cards = Array.from(el().querySelectorAll('[data-testid="admin-cards"] .kpi')).map((c) => [c.querySelector('.label')!.textContent!.trim(), c.querySelector('.value')!.textContent!.replace(/\s+/g, ' ').trim()]);
    expect(cards).toEqual([['Empresas', '3'], ['Usuarios', '3'], ['Superadministradores', '3 / 5'], ['Factor de emisión', '10,1000']]);
    const kpis = q('[data-testid="admin-cards"]');
    for (const removed of ['Activas', 'Inactivas', 'Sin administrador activo']) expect(kpis.textContent).not.toContain(removed);
    for (const id of ['kpi-active', 'kpi-inactive', 'kpi-without-admin']) expect(kpis.querySelector(`[data-testid="${id}"]`)).toBeNull();
    expect(kpis.querySelectorAll('.kpi').length).toBe(4);
    expect(kpis.querySelectorAll('a.kpi').length).toBe(3);
    expect(kpis.querySelector('app-factor-rotator-card [data-testid="kpi-emission-factor"]')).not.toBeNull();
    expect(kpis.lastElementChild!.tagName.toLowerCase()).toBe('app-factor-rotator-card');
  });

  it('las variaciones salen del período: porcentaje con base previa, número de nuevos si no la había', () => {
    create(); settle();

    expect(q('[data-testid="kpi-organizations"] .delta').textContent).toContain('+200%'); // 2 nuevas sobre 1 previa
    expect(q('[data-testid="kpi-users"] .delta').textContent).toContain('+3');             // 3 nuevos, sin base previa
    expect(q('[data-testid="kpi-super-admins"] .bar i.reserved')).not.toBeNull();            // cupo reservado por invitaciones
  });

  it('cada KPI enlaza con su gestión', () => {
    create(); settle();

    const href = (id: string): string => q(`[data-testid="${id}"]`).getAttribute('href')!;
    expect(href('kpi-super-admins')).toBe('/plataforma/superadministradores');
    expect(href('kpi-users')).toBe('/plataforma/usuarios');
  });

  const chartSeries = (): number[] => (fixture.debugElement.query(By.directive(TrendChartComponent)).componentInstance as TrendChartComponent).series()[0].values as number[];
  const chartLabels = (): readonly string[] => (fixture.debugElement.query(By.directive(TrendChartComponent)).componentInstance as TrendChartComponent).labels();
  const clickSeg = (name: string): void => { Array.from(el().querySelectorAll<HTMLButtonElement>('.seg button')).find((b) => b.textContent!.trim() === name)!.click(); fixture.detectChanges(); };
  const thisYear = new Date().getFullYear();

  it('la evolución es mensual (solo meses), del año en curso, y alterna entre empresas y usuarios', () => {
    create(); settle();

    expect(q('#evo-title').textContent).toContain('Evolución de empresas');
    expect(q('[data-testid="year"]').textContent).toContain(`${thisYear}`);
    expect(q('[data-testid="evo-subtitle"]').textContent).toContain(`${thisYear}`);
    expect(el().querySelectorAll('app-trend-chart').length).toBe(1);
    expect(chartLabels()[0]).toBe('Ene');
    expect(chartLabels().every((label) => /^[A-Z][a-z]{2}$/.test(label))).toBeTrue();
    clickSeg('Usuarios');
    expect(q('#evo-title').textContent).toContain('Evolución de usuarios');
    const summary = Array.from(el().querySelectorAll('[data-testid="period-summary"] span')).map((c) => c.textContent!.replace(/\s+/g, ' ').trim());
    expect(summary).toContain('1 administradores');
  });

  it('la línea muestra el total registrado al cierre de cada mes, reconstruido con exactitud', () => {
    create(); settle();

    // 3 empresas hoy y 2 altas este año (noviembre): antes había 1; el total llega a 3.
    const values = chartSeries();
    expect(values[0]).toBe(1);
    expect(values.at(-1)).toBe(3);
    expect(q('[data-testid="evo-subtitle"]').textContent).toContain('Total registrado al cierre de cada mes');
    expect(q('[data-testid="evo-tiles"]').textContent).toContain('+2');
  });

  it('se puede navegar al año anterior y volver; el año siguiente no se habilita más allá del año en curso', () => {
    create(); settle();

    expect((q('[data-testid="year-next"]') as HTMLButtonElement).disabled).toBeTrue();
    q('[data-testid="year-prev"]').click();
    const [request] = requests('/platform/metrics/trends');
    expect([request.request.params.get('date_from'), request.request.params.get('date_to')]).toEqual([`${thisYear - 1}-01-01`, `${thisYear - 1}-12-31`]);
    request.flush({ data: { ...trends(), period: { date_from: `${thisYear - 1}-01-01`, date_to: `${thisYear - 1}-12-31`, granularity: 'month', days: 365 }, summary: { ...zero, organizations_created: 1 }, points: [{ bucket: `${thisYear - 1}-06-01`, ...zero, organizations_created: 1 }] } });
    fixture.detectChanges();

    expect(q('[data-testid="year"]').textContent).toContain(`${thisYear - 1}`);
    expect(chartLabels().length).toBe(12);
    // Base antes de enero del año anterior: 3 − 1 (año anterior) − 2 (este año) = 0 → junio llega a 1.
    expect(chartSeries().slice(4, 6)).toEqual([0, 1]);
    expect((q('[data-testid="year-next"]') as HTMLButtonElement).disabled).toBeFalse();

    q('[data-testid="year-next"]').click();
    fixture.detectChanges();
    http.expectNone((r) => r.url === `${API}/platform/metrics/trends`);
    expect(q('[data-testid="year"]').textContent).toContain(`${thisYear}`);
  });

  it('si los datos fueran incoherentes (más altas que el total) no se inventa una base negativa: se muestran las altas por mes', () => {
    create(); answer({ summary: { ...zero, organizations_created: 9 } }); fixture.detectChanges();

    expect(chartSeries().at(-1)).toBe(9);
    expect(q('[data-testid="evo-subtitle"]').textContent).toContain('Altas registradas en cada mes');
  });

  it('un año sin altas muestra un estado vacío y no gráficos inventados', () => {
    create(); settle({ summary: { ...zero } });

    expect(q('[data-testid="trends-empty"]').textContent).toContain(`Sin altas en ${thisYear}`);
    expect(el().querySelectorAll('app-trend-chart').length).toBe(0);
  });

  it('el selector de período refleja el período vigente (30 días por defecto)', () => {
    create(); settle();

    expect((q('#period') as HTMLSelectElement).value).toBe('30');
    expect(Array.from((q('#period') as HTMLSelectElement).options).map((o) => o.textContent!.trim())).toEqual(['Últimos 7 días', 'Últimos 30 días', 'Últimos 90 días', 'Personalizado']);
  });

  it('el selector de período consulta al backend con ese período (7, 30 y 90 días)', () => {
    create(); settle();

    for (const days of ['7', '90']) {
      choosePeriod(days);
      const [request] = requests('/platform/metrics/trends');
      expect(request.request.params.get('days')).toBe(days);
      request.flush({ data: trends() });
      fixture.detectChanges();
    }
  });

  it('un rango personalizado se valida antes de enviarse y luego usa date_from/date_to', () => {
    create(); settle();
    choosePeriod('custom');
    const set = (id: string, value: string): void => { const input = q(id) as HTMLInputElement; input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges(); };
    const apply = (): HTMLButtonElement => q('form.range button[type="submit"]') as HTMLButtonElement;

    set('#range-from', '2026-11-10'); set('#range-to', '2026-11-01');
    expect(apply().disabled).toBeTrue();
    expect(text()).toContain('La fecha inicial debe ser anterior a la final');
    set('#range-from', '2025-01-01'); set('#range-to', '2026-11-01');
    expect(text()).toContain('El rango máximo es de un año');

    set('#range-from', '2026-10-01'); set('#range-to', '2026-10-31');
    expect(apply().disabled).toBeFalse();
    q('form.range').dispatchEvent(new Event('submit'));
    const [request] = requests('/platform/metrics/trends');
    expect([request.request.params.get('date_from'), request.request.params.get('date_to')]).toEqual(['2026-10-01', '2026-10-31']);
    request.flush({ data: trends() });
  });

  it('empresas por tipo: nombre, código, cantidad y porcentaje', () => {
    create(); settle();

    const donut = q('[data-testid="distribution"]').textContent!.replace(/\s+/g, ' ');
    expect(donut).toContain('Transportador (CARRIER)');
    expect(donut).toContain('Generador de carga (SHIPPER)');
    expect(donut).toContain('Empresas');
    expect(donut).toContain('67%');
  });

  it('el centro de la dona cuenta empresas vigentes con tipo UNA vez (no la suma de tipos): 3 empresas − 1 sin tipo = 2', () => {
    create(); settle(); // los segmentos suman 3 (una empresa tiene dos tipos), pero las empresas con tipo son 2

    expect(q('[data-testid="distribution"] app-donut-chart .center').textContent).toBe('2');
  });

  it('acciones pendientes: solo lo que requiere acción, por urgencia, con la suma en la insignia; lo demás va en «En seguimiento»', () => {
    create(); settle();

    const panel = q('[data-testid="attention"]');
    const rows = (selector: string) => Array.from(panel.querySelectorAll(`${selector} > li`)).map((li) => [li.querySelector('strong')!.textContent, li.querySelector('.count')!.textContent!.trim()]);

    expect(rows('[data-testid="attention-actions"]')).toEqual([
      ['Membresías por aprobar', '2'], ['Invitaciones por vencer', '1'], ['Empresas sin administrador activo', '1'], ['Empresas sin tipo asignado', '1'], ['Cupo de superadministradores', '3/5'],
    ]);
    expect(rows('[data-testid="attention-followup"]')).toEqual([['Empresas esperando a su administrador', '1'], ['Empresas inactivas', '1']]);
    expect(panel.querySelector('.badge-num')!.textContent).toBe('6'); // 2 + 1 + 1 + 1 + 1 del cupo; el seguimiento no cuenta
    expect(panel.querySelector('[data-testid="action-needs-admin"]')!.textContent).toContain('ENVIA'); // solo la que requiere reinvitar
    expect(panel.querySelector('[data-testid="action-needs-admin"]')!.textContent).not.toContain('Coordinadora');
    expect(panel.querySelector('[data-testid="attention-clear"]')).toBeNull();
    const hrefs = Array.from(panel.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.some((h) => h.startsWith('/plataforma/usuarios?tab=pendientes'))).toBeTrue();
    expect(hrefs.some((h) => h.startsWith('/plataforma/usuarios?tab=invitaciones'))).toBeTrue();
    expect(hrefs.some((h) => h.startsWith('/plataforma/organizaciones?filtro=sin-admin'))).toBeTrue();
  });

  it('acciones pendientes: si la atención no carga, se muestra lo que sí se sabe por las métricas (sin inventar lo demás)', () => {
    create();
    requests('/platform/attention').forEach((r) => r.flush({ error: { code: 'DATABASE_ERROR', message: 'Error' } }, { status: 500, statusText: 'Server Error' }));
    settle();

    const labels = Array.from(q('[data-testid="attention"]').querySelectorAll('.todo > li strong')).map((s) => s.textContent);
    expect(labels).toEqual(['Membresías por aprobar', 'Empresas sin administrador activo', 'Empresas sin tipo asignado']); // sin «por vencer», cupo ni seguimiento
    expect(q('[data-testid="attention"] [data-testid="attention-followup"]')).toBeNull();
  });

  it('acciones pendientes: si no hay nada que hacer dice «Todo al día» en vez de listar filas en cero', () => {
    create(); settle({ attentionEmpty: true, quiet: true });

    const panel = q('[data-testid="attention"]');
    expect(panel.querySelector('[data-testid="attention-clear"]')!.textContent).toContain('Todo al día');
    expect(panel.querySelector('[data-testid="attention-actions"]')).toBeNull();
    expect(panel.querySelector('[data-testid="attention-followup"]')).toBeNull();
    expect(panel.querySelector('.badge-num')).toBeNull();
  });

  it('el contador de una acción pendiente va en el tono de advertencia, no en el rojo de peligro (el rojo es de eliminar o fallar)', () => {
    create(); settle();
    const color = (token: string): string => {
      const reference = document.createElement('span');
      reference.style.backgroundColor = `var(${token})`;
      el().appendChild(reference);

      return getComputedStyle(reference).backgroundColor;
    };
    const count = q('[data-testid="attention-actions"] .count.on');

    expect(getComputedStyle(count).backgroundColor).toBe(color('--c-warn-soft'));
    expect(getComputedStyle(count).backgroundColor).not.toBe(color('--c-bad-soft'));
    expect(getComputedStyle(q('#acciones .badge-num')).backgroundColor).toBe(color('--c-warn-soft'));
  });

  it('actividad reciente: acción y objeto, quién la hizo y cuándo; solo eventos reales', () => {
    create(); settle({ activity: [event, { ...event, id: 'e2', actor_name: null, action: 'global_role.grant', target_name: 'Luis', details: { role: 'SUPER_ADMIN' } }] });

    const rows = Array.from(el().querySelectorAll('[data-testid="recent-activity"] .feed li')).map((li) => [li.children[1].textContent, li.querySelector('.actor')!.textContent]);
    expect(rows).toEqual([['Empresa creada: ENVIA', 'Ana Gómez'], ['Rol concedido: Superadministrador → Luis', 'Sistema']]);
    expect(q('[data-testid="recent-activity"] time').textContent).toContain('hace');
  });

  it('el resumen muestra solo los 4 eventos más recientes (el historial completo está en «Actividad y auditoría»)', () => {
    create(); settle({ activity: Array.from({ length: 8 }, (_, i) => ({ ...event, id: `e${i}` })) });

    expect(el().querySelectorAll('[data-testid="recent-activity"] .feed li').length).toBe(4);
    expect(q('[data-testid="recent-activity"] a[href="/plataforma/auditoria"]')).not.toBeNull();
  });

  it('mantiene el contenido visible sin recortes de altura y conserva el gráfico adaptable', () => {
    create(); settle();

    expect(q('.page').classList.contains('executive-dashboard')).toBeTrue();
    expect(getComputedStyle(q('[data-testid="attention"]')).overflow).not.toBe('hidden');
    expect(q('app-trend-chart').classList.contains('fill')).toBeTrue();
  });

  it('muestra siempre acciones pendientes y actividad reciente, junto al análisis', () => {
    create(); settle();
    const analysis = q('#dashboard-analysis');
    const management = q('#dashboard-management');
    expect(analysis.hidden).toBeFalse();
    expect(management.hidden).toBeFalse();
    expect(management.querySelectorAll('[data-testid="attention-actions"] > li').length).toBe(5);
    expect(management.querySelectorAll('.feed li').length).toBe(1);
  });

  it('sin eventos registrados no se inventa actividad', () => {
    create(); settle({ activity: [] });

    expect(q('[data-testid="recent-activity"]').textContent).toContain('Aún no hay actividad registrada');
  });

  it('muestra los precios de combustible (ACPM, gasolina y GNCV) con ciudad, vigencia, variación y fuente, en vez del estado de servicios', () => {
    create(); settle();

    expect(el().querySelector('[data-testid="services"]')).toBeNull();
    const fuel = q('[data-testid="fuel-prices"]');
    expect(Array.from(fuel.querySelectorAll('.fp-card strong')).map((n) => n.textContent!.trim())).toEqual(['ACPM', 'Gasolina corriente', 'Gas natural vehicular']);
    const acpm = q('[data-fuel="FUEL_ACPM_PRICE"]').textContent!.replace(/\s+/g, ' ');
    expect(acpm).toContain('$ 11.616');
    expect(acpm).toContain('COP/galón');
    expect(acpm).toContain('Bogotá');
    expect(acpm).toContain('↓ 0,2 % vs. publicación anterior');
    expect(acpm).toContain('CREG · Circular CREG 371 de 2026');
    expect(q('[data-fuel="FUEL_GNCV_PRICE"]').textContent).toContain('Sin información disponible'); // sin dato no se inventa
    expect(fuel.querySelectorAll('.fp-ico svg path').length).toBe(3); // un icono por combustible
    expect(q('[data-testid="fuel-detail"]').getAttribute('href')).toBe('/plataforma/intelligence/energia');
  });

  it('si el servicio de precios falla se muestra el error con reintento, no valores en blanco', () => {
    create(); settle({ fuel: 'error' });

    expect(el().querySelector('[data-fuel]')).toBeNull();
    expect(q('[data-testid="fuel-prices"]').textContent).toContain('Reintentar');
  });

  it('el resumen no muestra textos técnicos ni tarjetas de «funcionalidad no disponible»', () => {
    create(); settle();

    ['GET /', '/api/v1', 'Funcionalidad no disponible', 'SIN API', 'Sin API'].forEach((technical) => expect(text()).not.toContain(technical));
  });

});
