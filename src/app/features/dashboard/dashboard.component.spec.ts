import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { footprintDto } from '../../../testing/footprint';
import { importCountsDto, importPeriodDto } from '../../../testing/imports';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { pagedBody, summaryDto } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { factorDto, GASOLINE, NATURAL_GAS } from '../emissions/emissions.fixtures';
import { ROUTE_PIN_ICON, TRUCK_ICON } from '../../shared/ui/icons';
import { DashboardComponent } from './dashboard.component';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { bucketDto } from '../../../testing/footprint';
import { METHODOLOGY_URL, dataOriginShareDto, inventoryCoverageDto, methodologyDto } from '../../../testing/methodology';

describe('DashboardComponent', () => {
  const API = 'http://api.test/api/v1';
  const ORG = `${API}/organizations/${ORG_ENVIA.id}`;
  const RECENT = importPeriodDto({ period_from: '2026-04-01', period_to: '2026-06-30', imports: 2, rows_read: 3_400_000 });
  const OLDER = importPeriodDto({ period_from: '2026-01-05', period_to: '2026-03-28', imports: 1, rows_read: 500 });
  const loaded = importCountsDto({ total: 5, in_progress: 2, completed: 3, failed: 1, vehicles_pending: 2, rows_read: 3_400_000, rows_calculable: 3_200_000, rows_pending: 200_000 });

  /** Huella pedida sin ningún viaje calculado ni pendiente: la empresa aún no tiene emisiones. */
  const NO_EMISSIONS = footprintDto({ by_month: [], by_fuel: [], periods: [], series: ['abr', 'may', 'jun'].map((m, i) => bucketDto({ key: `2026-0${i + 4}`, label: `${m} 2026`, kg_co2: 0, t_co2: 0, trips: 0 })), series_total_kg: 0, totals: { ...footprintDto().totals, kg_co2: 0, trips_calculated: 0, trips_pending: 0, trips_blocked: 0, trips_duplicate: 0, coverage_trips_pct: null, partial: false, measured_kg_co2: 0, estimated_kg_co2: 0, measured_trips: 0, estimated_trips: 0 } });
  const footprintRequests = () => http.match((r) => r.url === `${ORG}/emissions/footprint`);

  let fixture: ComponentFixture<DashboardComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const tiles = (): HTMLElement[] => qa('[data-testid="kpi-row"] app-kpi-tile');
  const value = (testid: string): string => text(`[data-testid="${testid}"] [data-testid="kpi-value"]`);
  const caption = (testid: string): string => text(`[data-testid="${testid}"] .cap`);
  const countsRequests = () => http.match((r) => r.url === `${ORG}/imports/counts`);

  /** Parámetros de la URL simulados (`?gran=`) y el `navigate` espiado, solo cuando una prueba pasa `urlGran`. */
  let params$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let navigate: jasmine.Spy;

  function open(roles: string[] = ['ORG_ADMIN'], urlGran?: string | null): void {
    params$ = new BehaviorSubject(convertToParamMap(urlGran ? { gran: urlGran } : {}));
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [...provideTestApp(), ...(urlGran === undefined ? [] : [{ provide: ActivatedRoute, useValue: { queryParamMap: params$.asObservable() } }])],
    });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles), membership(ORG_COORDINADORA, ['ORG_VIEWER'])] }), TestBed.inject(SessionStore));
    if (urlGran !== undefined) navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  }

  /** Responde lo que pide la pantalla: primero los periodos y, con ellos, los conteos (con el periodo elegido). */
  function answer(options: { periods?: unknown[]; counts?: unknown; summary?: unknown; fuels?: unknown[]; active?: number; footprint?: unknown } = {}): void {
    http.match(`${ORG}/imports/periods`).forEach((r) => r.flush({ data: options.periods ?? [] }));
    http.match((r) => r.url === `${ORG}/imports/counts`).forEach((r) => r.flush({ data: options.counts ?? loaded }));
    // La huella se pide cuando el periodo ya está resuelto (en la siguiente detección de cambios).
    fixture.detectChanges();
    http.match((r) => r.url === `${ORG}/emissions/footprint`).forEach((r) => r.flush({ data: options.footprint ?? NO_EMISSIONS }));
    http.match(`${ORG}/vehicles/summary`).forEach((r) => r.flush({ data: options.summary ?? summaryDto }));
    http.match(`${API}/emissions/reference/fuels`).forEach((r) => r.flush({ data: options.fuels ?? [factorDto(), GASOLINE(), NATURAL_GAS()] }));
    http.match((r) => r.url === `${API}/users`).forEach((r) => r.flush(pagedBody([], r.request.params.get('membership_status') === 'ACTIVE' ? (options.active ?? 7) : 1)));
    http.match((r) => r.url === `${API}/users/invitations`).forEach((r) => r.flush(pagedBody([], 0)));
    fixture.detectChanges();
  }

  afterEach(() => http?.match(() => true));

  it('el encabezado da la bienvenida por nombre, sin repetir «Resumen»', () => {
    open();
    answer();

    expect(text('h1')).toMatch(/^Bienvenido, \S+/);
    expect(text('h1')).not.toContain('Resumen');
  });

  it('se actualiza solo: mientras hay cargas en proceso renueva, y al terminar la última vuelve a pedir la huella', fakeAsync(() => {
    open();
    answer({ periods: [RECENT], counts: importCountsDto({ in_progress: 1, total: 1 }) });
    expect(footprintRequests().length).toBe(0);

    tick(5000);
    fixture.detectChanges();
    http.match(`${ORG}/imports/periods`).forEach((r) => r.flush({ data: [RECENT] }));
    const counts = countsRequests();
    const refreshed = footprintRequests();

    expect(counts.length).toBe(1);
    expect(refreshed.length).toBe(1);
    // La renovación es silenciosa: no vuelve a mostrar el esqueleto.
    expect(qa('[data-testid="monthly-chart"] [data-testid="chart-skeleton"]').length).toBe(0);
    refreshed[0].flush({ data: NO_EMISSIONS });
    counts[0].flush({ data: importCountsDto({ in_progress: 0, total: 1, completed: 1 }) });
    fixture.detectChanges();
    const final = footprintRequests();

    expect(final.length).toBe(1);
    final[0].flush({ data: footprintDto() });
    fixture.detectChanges();
    expect(value('kpi-footprint')).toBe('5.588');
    tick(20000);
    expect(footprintRequests().length).toBe(0);
    fixture.destroy();
  }));

  it('sin empresa activa explica por qué', () => {
    TestBed.configureTestingModule({ imports: [DashboardComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [] }), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    expect(q('[data-testid="org-required"]')).not.toBeNull();
    expect(q('[data-testid="kpi-emission-factor"]')).toBeNull();
  });

  describe('selector de periodo', () => {
    it('es un selector compacto a la derecha, en una barra entre la cabecera y la fila de tarjetas, y arranca en el periodo más reciente', () => {
      open();
      answer({ periods: [RECENT, OLDER] });
      const period = q('[data-testid="period"]')!;

      expect(text('[data-testid="period"] [data-testid="period-range"]')).toBe('Abr 2026 a Jun 2026');
      expect(text('[data-testid="period"] [data-testid="period-kind"]')).toBe('· Trimestral');
      expect(getComputedStyle(period.parentElement!).justifyContent).toBe('flex-end');
      expect(period.parentElement!.classList).toContain('toolbar');
      expect(q('app-page-hero')!.compareDocumentPosition(period) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(period.compareDocumentPosition(q('[data-testid="kpi-row"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('los counts se piden con el periodo elegido y elegir otro (o «todos») los vuelve a pedir y las tarjetas de filas cambian', () => {
      open();
      http.expectOne(`${ORG}/imports/periods`).flush({ data: [RECENT, OLDER] });
      const first = countsRequests()[0];

      expect(first.request.params.get('period_from')).toBe('2026-04-01');
      first.flush({ data: loaded });
      http.match(`${ORG}/vehicles/summary`).forEach((r) => r.flush({ data: summaryDto }));
      fixture.detectChanges();
      expect(value('kpi-trips')).toBe('3.400.000');

      q<HTMLButtonElement>('[data-testid="period"] button')!.click();
      fixture.detectChanges();
      q('[data-testid="period-option-2"]')!.click();
      fixture.detectChanges();
      expect(qa('[data-testid="kpi-trips"] .skeleton').length).toBe(1);
      const second = countsRequests();

      expect(second.length).toBe(1);
      expect(second[0].request.params.get('period_from')).toBe('2026-01-05');
      expect(second[0].request.params.get('period_to')).toBe('2026-03-28');
      second[0].flush({ data: importCountsDto({ total: 5, in_progress: 2, completed: 3, failed: 1, rows_read: 500, rows_calculable: 400, rows_pending: 100 }) });
      fixture.detectChanges();
      expect(value('kpi-trips')).toBe('500');
      expect(caption('kpi-trips')).toBe('viajes revisados en el periodo');
      expect(value('kpi-running')).toBe('2');
      expect(text('[data-testid="period"] [data-testid="period-range"]')).toBe('Ene 2026 a Mar 2026');

      q<HTMLButtonElement>('[data-testid="period"] button')!.click();
      fixture.detectChanges();
      q('[data-testid="period-option-0"]')!.click();
      fixture.detectChanges();
      expect(countsRequests()[0].request.params.has('period_from')).toBeFalse();
    });

    it('la huella se pide con el from y to del periodo elegido (una sola vez) y al cambiar de periodo o elegir «todos» se vuelve a pedir', () => {
      open();
      http.expectOne(`${ORG}/imports/periods`).flush({ data: [RECENT, OLDER] });
      countsRequests().forEach((r) => r.flush({ data: loaded }));
      fixture.detectChanges();
      const first = footprintRequests();

      expect(first.length).toBe(1);
      expect([first[0].request.params.get('from'), first[0].request.params.get('to')]).toEqual(['2026-04-01', '2026-06-30']);
      first[0].flush({ data: NO_EMISSIONS });

      q<HTMLButtonElement>('[data-testid="period"] button')!.click();
      fixture.detectChanges();
      q('[data-testid="period-option-2"]')!.click();
      fixture.detectChanges();
      const second = footprintRequests();

      expect([second[0].request.params.get('from'), second[0].request.params.get('to')]).toEqual(['2026-01-05', '2026-03-28']);
      second[0].flush({ data: NO_EMISSIONS });

      q<HTMLButtonElement>('[data-testid="period"] button')!.click();
      fixture.detectChanges();
      q('[data-testid="period-option-0"]')!.click();
      fixture.detectChanges();
      const all = footprintRequests();

      expect(all[0].request.params.has('from') || all[0].request.params.has('to')).toBeFalse();
    });

    it('sin periodos muestra «—» y «Se define al subir tu primer archivo»', () => {
      open();
      answer({ counts: importCountsDto() });

      expect(text('[data-testid="period"] [data-testid="period-range"]')).toBe('—');
      expect(text('[data-testid="period"] [data-testid="period-pending"]')).toBe('Se define al subir tu primer archivo');
    });

    it('sin imports:create muestra «—» sin enlace y no se piden periodos ni counts', () => {
      open(['ORG_VIEWER']);
      http.expectNone(`${ORG}/imports/periods`);
      http.expectNone((r) => r.url === `${ORG}/imports/counts`);
      answer();

      expect(text('[data-testid="period"] [data-testid="period-range"]')).toBe('—');
      expect(q('[data-testid="period"] a')).toBeNull();
    });

    it('si falla la lista de periodos ofrece «Reintentar» y las tarjetas igual reciben los counts sin filtro', () => {
      open();
      http.expectOne(`${ORG}/imports/periods`).flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'x' });
      expect(countsRequests()[0].request.params.has('period_from')).toBeFalse();
      fixture.detectChanges();

      expect(q('[data-testid="period"] [role="alert"]')).not.toBeNull();
      q('[data-testid="period"] [role="alert"] button')!.click();
      expect(http.match(`${ORG}/imports/periods`).length).toBe(1);
    });
  });

  describe('fila de indicadores', () => {
      it('la tarjeta «Huella de carbono» es la primera de la fila y sin emisiones calculadas muestra «—», sin cifras de CO₂ ni variación, enlace a /cargas', () => {
        open();
        answer();
        const first = q('[data-testid="kpi-row"] .kpis-in')!.firstElementChild!;

        expect(first.tagName.toLowerCase()).toBe('app-footprint-card');
        expect(first.getAttribute('data-testid')).toBe('kpi-footprint');
        expect(text('[data-testid="kpi-footprint"] .label')).toBe('Huella de carbono');
        expect(text('[data-testid="kpi-footprint"] [data-testid="kpi-value"]')).toBe('—');
        expect(text('[data-testid="kpi-footprint"] [data-testid="footprint-foot"]')).toBe('Aún no hay emisiones calculadas');
        expect(q('[data-testid="kpi-footprint"] [data-testid="footprint-variation"]')).toBeNull();
        expect(text('[data-testid="kpi-footprint"]')).not.toMatch(/kg CO|vs\. periodo/);
        expect(q('[data-testid="kpi-footprint"] a')!.getAttribute('href')).toBe('/cargas');
        expect(el().querySelectorAll('[data-testid="kpi-row"] .kpis-in > *').length).toBe(5);
      });

      it('con huella real muestra el total del periodo elegido, la variación contra el periodo anterior, «Parcial» y la cobertura por viajes', () => {
        open();
        answer({ periods: [RECENT], footprint: footprintDto({ period: { from: '2026-04-01', to: '2026-06-30' }, periods: [{ start: '2026-01-01', end: '2026-03-31', kg_co2: 4000 }, { start: '2026-04-01', end: '2026-06-30', kg_co2: 5588.4016 }] }) });

        expect(value('kpi-footprint')).toBe('5.588');
        expect(text('[data-testid="kpi-footprint"] [data-testid="footprint-unit"]')).toBe('kg CO₂');
        expect(text('[data-testid="footprint-variation"]')).toBe('▲+39,7 %');
        expect(text('[data-testid="footprint-partial"]')).toBe('Parcial');
        expect(text('[data-testid="footprint-coverage"]')).toBe('12 de 18 viajes');
      });

      it('sin imports:create la tarjeta de huella no es un enlace', () => {
        open(['ORG_VIEWER']);
        answer();

        expect(q('[data-testid="kpi-footprint"] a')).toBeNull();
        expect(q('[data-testid="kpi-footprint"] [role="group"]')).not.toBeNull();
      });

      it('la rejilla pasa de 5 a 3, 2 y 1 columnas por consultas de contenedor', () => {
        open();
        answer();
        const css = Array.from(document.querySelectorAll('style')).map((st) => (st.textContent ?? '').replace(/\s+/g, ' ')).filter((c) => c.includes('.kpis-in')).join('\n');

        expect(css).toContain('repeat(5, minmax(0, 1fr))');
        expect(css).toMatch(/@container \(max-width: 1180px\) \{ [^}]*repeat\(3,/);
        expect(css).toMatch(/@container \(max-width: 760px\) \{ [^}]*repeat\(2,/);
        expect(css).toMatch(/@container \(max-width: 460px\) \{ [^}]*minmax\(0, 1fr\)/);
      });
      it('ORG_ADMIN ve cinco tarjetas en orden: huella, viajes procesados, datos por completar, vehículos y cargas en proceso', () => {
        open();
        answer({ periods: [RECENT, OLDER], footprint: footprintDto() });

        expect(qa('[data-testid="kpi-row"] .kpis-in > *').map((n) => n.getAttribute('data-testid'))).toEqual(['kpi-footprint', 'kpi-trips', 'kpi-missing', 'kpi-registered', 'kpi-running']);
        expect(tiles().map((t) => text(`[data-testid="${t.getAttribute('data-testid')}"] .label`))).toEqual(['Viajes procesados', 'Datos por completar', 'Vehículos registrados', 'Cargas en proceso']);
        expect(tiles().map((t) => t.querySelector('[data-testid="kpi-value"]')!.textContent)).toEqual(['3.400.000', '6', '12', '2']);
        expect(tiles().map((t) => text(`[data-testid="${t.getAttribute('data-testid')}"] .cap`))).toEqual([
          'viajes revisados en el periodo',
          '33 % de los viajes sin calcular',
          '2 cargas con vehículos por revisar',
          '5 en total · 1 fallida',
        ]);
        expect(tiles().map((t) => t.querySelector('a')!.getAttribute('href'))).toEqual(['/cargas', '/cargas', '/vehiculos', '/cargas']);
        expect(tiles()[1].querySelector('.kpi')!.classList).toContain('warn');
      });

      it('con «Todos los periodos» el pie de viajes procesados dice «en total»', () => {
        open();
        answer({ periods: [] });

        expect(value('kpi-trips')).toBe('3.400.000');
        expect(caption('kpi-trips')).toBe('viajes revisados en total');
      });

      it('«Datos por completar» es en vivo (pendientes + bloqueados del inventario) y no usa la foto de la carga: 63.433 al subir, 6 tras calcular', () => {
        open();
        answer({ counts: importCountsDto({ total: 1, completed: 1, rows_read: 63_433, rows_calculable: 0, rows_pending: 63_433 }), footprint: footprintDto({ totals: { ...footprintDto().totals, trips_calculated: 3_305, trips_pending: 2, trips_blocked: 1 } }) });

        expect(value('kpi-missing')).toBe('3');
        expect(caption('kpi-missing')).toBe('1 % de los viajes sin calcular');
      });

      it('la proporción es pendientes ÷ contabilizables y nunca da 0 % ni 100 % falsos', () => {
        open();
        answer({ footprint: footprintDto({ totals: { ...footprintDto().totals, trips_calculated: 1, trips_pending: 3_399_999, trips_blocked: 0 } }) });
        expect(caption('kpi-missing')).toBe('99 % de los viajes sin calcular');
      });

      it('sin viajes contabilizables no inventa nada: «—» y una invitación a subir el primer archivo', () => {
        open();
        answer({ counts: importCountsDto(), footprint: NO_EMISSIONS });

        expect(tiles().map((t) => t.querySelector('[data-testid="kpi-value"]')!.textContent)).toEqual(['—', '—', '12', '0']);
        expect(caption('kpi-trips')).toBe('Sube tu primer archivo para empezar');
        expect(caption('kpi-missing')).toBe('Aparecerá cuando subas un archivo');
        expect(caption('kpi-registered')).toBe('Inventario de tu empresa');
        expect(caption('kpi-running')).toBe('0 en total · 0 fallidas');
        expect(tiles()[1].querySelector('.kpi')!.classList).not.toContain('warn');
      });

      it('si todos los viajes están calculados, «Datos por completar» vale 0 con tono normal', () => {
        open();
        answer({ counts: importCountsDto({ total: 1, completed: 1, rows_read: 200, rows_calculable: 200 }), footprint: footprintDto({ totals: { ...footprintDto().totals, trips_pending: 0, trips_blocked: 0, partial: false } }) });

        expect(value('kpi-missing')).toBe('0');
        expect(caption('kpi-missing')).toBe('Todos los viajes están calculados');
        expect(tiles()[1].querySelector('.kpi')!.classList).not.toContain('warn');
      });

      it('con una sola carga por revisar o una sola fallida usa el singular', () => {
        open();
        answer({ counts: importCountsDto({ total: 1, completed: 1, failed: 1, vehicles_pending: 1, rows_read: 10, rows_calculable: 5, rows_pending: 5 }) });

        expect(caption('kpi-registered')).toBe('1 carga con vehículos por revisar');
        expect(caption('kpi-running')).toBe('1 en total · 1 fallida');
      });

      it('cada tarjeta enlazada tiene un nombre accesible con su cifra y los íconos son decorativos', () => {
        open();
        answer({ periods: [RECENT] });

        expect(tiles()[0].querySelector('a')!.getAttribute('aria-label')).toBe('Viajes procesados: 3.400.000. viajes revisados en el periodo');
        expect(tiles()[2].querySelector('a')!.getAttribute('aria-label')).toBe('Vehículos registrados: 12. 2 cargas con vehículos por revisar');
        expect(tiles().every((t) => t.querySelector('.ico')!.getAttribute('aria-hidden') === 'true')).toBeTrue();
        expect(q('[data-testid="kpi-row"]')!.getAttribute('aria-label')).toBe('Indicadores de la empresa');
      });

      it('ORG_ANALYST ve las cinco; ORG_VIEWER solo huella y vehículos y no se pide counts', () => {
        open(['ORG_ANALYST']);
        answer();
        expect(qa('[data-testid="kpi-row"] .kpis-in > *').length).toBe(5);

        TestBed.resetTestingModule();
        open(['ORG_VIEWER']);
        http.expectNone((r) => r.url === `${ORG}/imports/counts`);
        answer();

        expect(qa('[data-testid="kpi-row"] .kpis-in > *').map((n) => n.getAttribute('data-testid'))).toEqual(['kpi-footprint', 'kpi-registered']);
        expect(caption('kpi-registered')).toBe('Inventario de tu empresa');
        expect(q('[data-testid="team-card"]')).toBeNull();
      });

      it('sin vehicles:read ni imports:create no hay fila ni se consultan el resumen ni los counts', () => {
        open(['GUILD_VIEWER']);
        http.expectNone(`${ORG}/vehicles/summary`);
        http.expectNone((r) => r.url === `${ORG}/imports/counts`);
        answer();

        expect(q('[data-testid="kpi-row"]')).toBeNull();
      });

      it('muestra un esqueleto por tarjeta que carga y cada grupo falla por separado con «Reintentar»', () => {
        open();
        expect(qa('[data-testid="kpi-row"] .skeleton').length).toBeGreaterThanOrEqual(4);

        http.match(`${ORG}/vehicles/summary`).forEach((r) => r.flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'x' }));
        http.match(`${ORG}/imports/periods`).forEach((r) => r.flush({ data: [] }));
        countsRequests().forEach((r) => r.flush({ data: loaded }));
        fixture.detectChanges();

        expect(tiles().map((t) => !!t.querySelector('[role="alert"]'))).toEqual([false, false, true, false]);
        tiles()[2].querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
        http.expectOne(`${ORG}/vehicles/summary`).flush({ data: summaryDto });
        fixture.detectChanges();
        expect(value('kpi-registered')).toBe('12');
      });

      it('si fallan los counts las tarjetas de cargas ofrecen «Reintentar» (solo los counts) y la de vehículos sigue', () => {
        open();
        http.match(`${ORG}/imports/periods`).forEach((r) => r.flush({ data: [] }));
        countsRequests().forEach((r) => r.flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'x' }));
        http.match(`${ORG}/vehicles/summary`).forEach((r) => r.flush({ data: summaryDto }));
        fixture.detectChanges();

        expect(tiles().map((t) => !!t.querySelector('[role="alert"]'))).toEqual([true, false, false, true]);  // «Datos por completar» es en vivo (huella): no depende de los counts
        tiles()[0].querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
        expect(http.match(`${ORG}/imports/periods`).length).toBe(0);
        countsRequests()[0].flush({ data: loaded });
        fixture.detectChanges();
        expect(value('kpi-trips')).toBe('3.400.000');
      });

      it('los periodos y los counts se piden una vez al entrar, sin sondeo', () => {
        open();
        expect(http.match(`${ORG}/imports/periods`).length).toBe(1);
        answer();
        http.expectNone(`${ORG}/imports/periods`);
        http.expectNone((r) => r.url === `${ORG}/imports/counts`);
      });

      it('las tarjetas de la fila son compactas (size sm) y la fila baja de 5 a 3, 2 y 1 columnas por consultas de contenedor', () => {
        open();
        answer();

        expect(tiles().every((t) => t.querySelector('.kpi')!.classList.contains('sm'))).toBeTrue();
        expect(q('[data-testid="kpi-footprint"] .fp')!.classList).toContain('sm');
        const css = Array.from(document.querySelectorAll('style')).map((st) => (st.textContent ?? '').replace(/\s+/g, ' ')).filter((c) => c.includes('.kpis-in')).join('\n');

        expect(css).toContain('repeat(5, minmax(0, 1fr))');
        expect(css).toMatch(/@container \(max-width: 1180px\) \{ [^}]*repeat\(3,/);
        expect(css).toMatch(/@container \(max-width: 760px\) \{ [^}]*repeat\(2,/);
        expect(css).toMatch(/@container \(max-width: 460px\) \{ [^}]*minmax\(0, 1fr\)/);
      });

      it('los cinco chips de ícono de la fila son idénticos en tamaño, radio y aro (el tono solo cambia el color)', () => {
        open();
        answer({ periods: [RECENT], footprint: footprintDto() });
        const chips = qa('[data-testid="kpi-row"] .ico');
        const shape = (c: HTMLElement): string[] => [getComputedStyle(c).width, getComputedStyle(c).height, getComputedStyle(c).borderRadius, getComputedStyle(c).boxShadow.includes('inset') ? 'ring' : 'none', getComputedStyle(c.querySelector('svg')!).width];

        expect(chips.length).toBe(5);
        expect(new Set(chips.map((c) => shape(c).join('|'))).size).toBe(1);
        expect(shape(chips[0])).toEqual(['40px', '40px', '12px', 'ring', '20px']);
        expect(getComputedStyle(chips[2]).color).not.toBe(getComputedStyle(chips[1]).color);
      });

      it('«Viajes procesados» usa el pin sobre la carretera como glifo sólido y «Vehículos registrados» el camión compartido', () => {
        open();
        answer({ periods: [RECENT] });
        const trips = q('[data-testid="kpi-trips"] .ico')!;
        const vehicles = q('[data-testid="kpi-registered"] .ico')!;

        expect(trips.classList).toContain('solid');
        expect(trips.querySelector('path')!.getAttribute('d')).toBe(ROUTE_PIN_ICON);
        expect(getComputedStyle(trips.querySelector('svg')!).stroke).toBe('none');
        expect(vehicles.classList).not.toContain('solid');
        expect(vehicles.querySelector('path')!.getAttribute('d')).toBe(TRUCK_ICON);
        expect(qa('[data-testid="kpi-row"] .ico.solid').length).toBe(1);
      });

      it('con viajes retenidos como posibles duplicados las tarjetas dicen cuántos no están sumados sin cambiar ninguna altura', () => {
        const sentence = '12 operaciones por revisar (posibles duplicados) no están sumadas';
        const totals = { ...footprintDto().totals, partial: false, trips_pending: 0, trips_blocked: 0, coverage_trips_pct: 100, trips_possible_duplicate: 12 };

        open();
        answer({ periods: [RECENT], footprint: footprintDto({ totals }) });

        expect(q('[data-testid="kpi-footprint"] [data-testid="footprint-delta"]')!.getAttribute('title')).toBe(`${sentence}.`);
        expect(q('[data-testid="kpi-footprint"] .fp')!.getAttribute('aria-label')).toContain(sentence);
        expect(text('[data-testid="result-partial-hint"]')).toBe(`${sentence}.`);
        expect(qa('[data-testid="chart-partial-hint"]').map((n) => n.textContent!.trim())).toEqual([`${sentence}.`, `${sentence}.`]);
        expect(qa('[data-testid="result-partial"], [data-testid="chart-partial"]').length).toBe(0);

        const heights = qa('[data-testid="kpi-row"] .kpis-in > *').map((n) => Math.round(n.getBoundingClientRect().height));

        expect(Math.max(...heights)).toBeLessThanOrEqual(92);
        expect(Math.round(q('[data-testid="monthly-chart"] .cc')!.getBoundingClientRect().height)).toBe(256);
        expect(Math.round(q('[data-testid="fuel-chart"] .cc')!.getBoundingClientRect().height)).toBe(256);
        expect(Math.round(q('[data-testid="period-result"]')!.getBoundingClientRect().height)).toBeLessThanOrEqual(215);
      });

      it('la fila compacta mide cerca de 80 px de alto y todas las tarjetas igual', () => {
        open();
        answer({ periods: [RECENT] });
        const heights = qa('[data-testid="kpi-row"] .kpis-in > *').map((n) => Math.round(n.getBoundingClientRect().height));

        expect(Math.max(...heights)).toBeLessThanOrEqual(92);
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
      });
    });
  describe('tarjeta rotativa de factor de emisión', () => {
      const factor = (): string => text('[data-testid="factor-fuel"]');
      const factorValue = (): string => text('[data-testid="factor-value"]');

      beforeEach(() => {
        spyOn(window, 'matchMedia').and.returnValue({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as MediaQueryList);
      });

      it('hay una sola tarjeta de factor (no las tres fijas) con el aspecto de las tarjetas de indicador', () => {
        open();
        answer();

        expect(el().querySelectorAll('app-factor-rotator-card').length).toBe(1);
        expect(el().querySelectorAll('[data-testid="kpi-emission-factor"]').length).toBe(1);
        expect(q('app-factor-rotator-card')!.classList).toContain('tile');
        expect(q('[data-testid="factor-cards"]')).toBeNull();
        expect(q('#factors-title')).toBeNull();
        expect(text('app-factor-rotator-card h2')).toBe('Factor de emisión');
        expect(el().textContent).not.toContain('Factores de emisión');
        fixture.destroy();
      });

      it('muestra el primer combustible con el valor de la API, la unidad, el nombre y la insignia de estado', () => {
        open();
        answer();

        expect(factor()).toBe('Diésel B2');
        expect(factorValue()).toBe('10,1000');
        expect(text('[data-testid="factor-unit"]')).toBe('kg CO₂/gal');
        expect(text('[data-testid="factor-status"]')).toBe('Verificado');
        expect(el().querySelectorAll('[data-testid^="factor-segment-"]').length).toBe(3);
        fixture.destroy();
      });

      it('cambia de combustible cada 3 segundos y vuelve al primero', fakeAsync(() => {
        open();
        answer();

        tick(2999);
        fixture.detectChanges();
        expect(factor()).toBe('Diésel B2');
        tick(1);
        fixture.detectChanges();
        expect(factor()).toBe('Gasolina motor (sin mezcla)');
        expect(factorValue()).toBe('8,2000');
        tick(3000);
        fixture.detectChanges();
        expect(factor()).toBe('Gas natural (m³ estándar)');
        tick(3000);
        fixture.detectChanges();
        expect(factor()).toBe('Diésel B2');
        fixture.destroy();
      }));

      it('el botón de pausa detiene la rotación y los segmentos saltan a un combustible', fakeAsync(() => {
        open();
        answer();

        q<HTMLButtonElement>('[data-testid="factor-pause"]')!.click();
        fixture.detectChanges();
        tick(9000);
        fixture.detectChanges();
        expect(factor()).toBe('Diésel B2');
        expect(q('[data-testid="factor-pause"]')!.getAttribute('aria-pressed')).toBe('true');

        q<HTMLButtonElement>('[data-testid="factor-segment-2"]')!.click();
        fixture.detectChanges();
        expect(factor()).toBe('Gas natural (m³ estándar)');
        fixture.destroy();
      }));

      it('un factor sin configurar muestra el aviso en lugar de un número', () => {
        open();
        answer({ fuels: [factorDto({ verification_status: 'NOT_CONFIGURED', value: null, usable_for_calculation: false }), GASOLINE(), NATURAL_GAS()] });

        expect(text('[data-testid="factor-message"]')).toBe('Factor pendiente de configuración');
        expect(text('[data-testid="factor-status"]')).toBe('Sin configurar');
        expect(q('[data-testid="factor-value"]')).toBeNull();
        fixture.destroy();
      });

      it('pide los combustibles una sola vez y muestra un esqueleto mientras carga', () => {
        open();
        expect(el().querySelectorAll('[data-testid="kpi-emission-factor"] .skeleton').length).toBe(1);

        const requests = http.match(`${API}/emissions/reference/fuels`);
        expect(requests.length).toBe(1);
        requests[0].flush({ data: [factorDto()] });
        fixture.detectChanges();
        expect(factor()).toBe('Diésel B2');
        fixture.destroy();
      });

      it('si falla muestra el error con «Reintentar»', () => {
        open();
        http.match(`${API}/emissions/reference/fuels`).forEach((r) => r.flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'x' }));
        fixture.detectChanges();
        expect(text('[data-testid="factor-error"]')).toContain('Ocurrió un error interno');

        q('[data-testid="factor-error"] button')!.click();
        expect(http.match(`${API}/emissions/reference/fuels`).length).toBe(1);
        fixture.destroy();
      });
    });

    describe('tarjeta «Resultado del periodo»', () => {
      const withTotals = importCountsDto({ total: 3, completed: 3, rows_read: 3_400_000, rows_calculable: 3_000_000, distance_km: 1_234_567.4, cargo_ton: 48.26, rows_with_distance: 3_300_000, rows_with_cargo: 2_900_000 });

      it('sin emisiones muestra el resultado de CO₂ vacío y la distancia y la carga reales del periodo elegido, con su cobertura', () => {
        open();
        answer({ periods: [RECENT, OLDER], counts: withTotals });

        expect(text('[data-testid="period-result"] h2')).toBe('Resultado del periodo');
        expect(text('[data-testid="result-period"]')).toBe('Abr 2026 a Jun 2026');
        expect(text('[data-testid="result-fuel"] [data-testid="result-value"]')).toBe('—');
        expect(text('[data-testid="result-pending"]')).toBe('Aún no hay emisiones calculadas');
        expect(q('[data-testid="result-segment-0"]')).toBeNull();
        expect(q('[data-testid="result-pause"]')).toBeNull();
        expect(text('[data-testid="result-distance-value"]')).toBe('1.234.567');
        expect(text('[data-testid="result-distance"]')).toContain('km');
        expect(text('[data-testid="result-distance-note"]')).toBe('en 3.300.000 viajes con distancia');
        expect(text('[data-testid="result-cargo-value"]')).toBe('48,3');
        expect(text('[data-testid="result-cargo-note"]')).toBe('en 2.900.000 viajes con carga');
        expect(text('[data-testid="period-result"]')).not.toMatch(/\d kg CO/);
      });

      it('con huella real muestra los kg CO₂ por combustible con su consumo, medido y estimado, y «Parcial»', () => {
        open();
        answer({ periods: [RECENT], counts: withTotals, footprint: footprintDto() });

        expect(text('[data-testid="result-value"]')).toBe('4.200');
        expect(text('[data-testid="result-fuel-name"]')).toBe('Diésel B2 · 411 gal');
        expect(text('[data-testid="result-measured"]')).toContain('Medido 2.499 kg · Estimado 3.089 kg');
        expect(text('[data-testid="result-partial"]')).toBe('Parcial');
        expect(text('[data-testid="result-distance-value"]')).toBe('1.234.567');
      });

      it('«Metodología y calidad del dato» abre el detalle con la declaración del servidor y «Cerrar» lo retira, sin tocar las demás tarjetas', async () => {
        open();
        answer({ periods: [RECENT], counts: withTotals, footprint: footprintDto({ methodology: { id: 'LGC-CO2-TTW', version: '1.0.0', scope_label: 'TTW', unit: 'kg de CO₂ (no CO₂e)', has_estimates: true }, data_origin_share: dataOriginShareDto(), inventory_coverage: inventoryCoverageDto() }) });

        expect(q('[data-testid="methodology-dialog"]')).toBeNull();
        q<HTMLButtonElement>('[data-testid="result-methodology"]')!.click();
        fixture.detectChanges();
        http.expectOne(METHODOLOGY_URL).flush({ data: methodologyDto() });
        fixture.detectChanges();

        expect(q<HTMLDialogElement>('[data-testid="methodology-dialog"]')!.open).toBeTrue();
        expect(text('[data-testid="origin-REAL_CONSUMPTION"]')).toContain('Consumo real');
        expect(q('[data-testid="monthly-chart"]')).not.toBeNull();
        expect(q('[data-testid="emission-factor"]')).not.toBeNull();
        // El evento `close` del <dialog> es asíncrono: se espera el evento mismo (no un temporizador) para que la prueba no dependa de la carga de la máquina.
        const native = new Promise((resolve) => q('[data-testid="methodology-dialog"]')!.addEventListener('close', resolve, { once: true }));

        q<HTMLButtonElement>('[data-testid="methodology-close"]')!.click();
        await native;
        fixture.detectChanges();

        expect(q('[data-testid="methodology-dialog"]')).toBeNull();
      });

      it('con «Todos los periodos» el chip lo dice y al elegir otro periodo las cifras de la derecha cambian con los counts', () => {
        open();
        answer({ periods: [] , counts: withTotals });
        expect(q('[data-testid="result-period"]')).toBeNull();

        TestBed.resetTestingModule();
        open();
        http.expectOne(`${ORG}/imports/periods`).flush({ data: [RECENT, OLDER] });
        countsRequests()[0].flush({ data: withTotals });
        fixture.detectChanges();
        q<HTMLButtonElement>('[data-testid="period"] button')!.click();
        fixture.detectChanges();
        q('[data-testid="period-option-0"]')!.click();
        fixture.detectChanges();
        expect(text('[data-testid="result-period"]')).toBe('Todos los periodos');

        countsRequests()[0].flush({ data: importCountsDto({ rows_read: 10, distance_km: 90.4, cargo_ton: 3, rows_with_distance: 9, rows_with_cargo: 10 }) });
        fixture.detectChanges();
        expect(text('[data-testid="result-distance-value"]')).toBe('90');
        expect(text('[data-testid="result-cargo-value"]')).toBe('3');
      });

      it('sin cargas muestra «—» y «Sube un archivo para ver…»; con cargas sin ese dato, «Ningún viaje trae…»', () => {
        open();
        answer({ counts: importCountsDto() });
        expect(text('[data-testid="result-distance-note"]')).toBe('Sube un archivo para ver la distancia total');
        expect(text('[data-testid="result-cargo-note"]')).toBe('Sube un archivo para ver la carga transportada');

        TestBed.resetTestingModule();
        open();
        answer({ counts: importCountsDto({ rows_read: 50 }) });
        expect(text('[data-testid="result-distance-note"]')).toBe('Ningún viaje trae distancia');
        expect(text('[data-testid="result-cargo-value"]')).toBe('—');
      });

      it('sin imports:create la tarjeta sigue con «—», sin notas y sin pedir counts', () => {
        open(['ORG_VIEWER']);
        http.expectNone((r) => r.url === `${ORG}/imports/counts`);
        answer();

        expect(text('[data-testid="result-distance-value"]')).toBe('—');
        expect(q('[data-testid="result-distance-note"]')).toBeNull();
        expect(q('[data-testid="result-period"]')).toBeNull();
      });

      it('muestra un esqueleto mientras cargan los counts y un error con «Reintentar» que solo repite los counts', () => {
        open();
        expect(q('[data-testid="period-result"] .skeleton')).not.toBeNull();

        http.match(`${ORG}/imports/periods`).forEach((r) => r.flush({ data: [] }));
        countsRequests().forEach((r) => r.flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'x' }));
        fixture.detectChanges();
        expect(q('[data-testid="result-error"]')).not.toBeNull();

        q('[data-testid="result-error"] button')!.click();
        expect(http.match(`${ORG}/imports/periods`).length).toBe(0);
        expect(countsRequests().length).toBe(1);
      });
    });

    describe('gráficas de emisiones', () => {
      it('van en una fila nueva de igual tamaño debajo de «Factor» y «Resultado» y encima de «Usuarios» y «Precios», con la misma altura', () => {
        open();
        answer();
        const row = q('[data-testid="charts-row"]')!;
        const css = Array.from(document.querySelectorAll('style')).map((st) => (st.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.row.b')).join('\n');

        expect(row.classList).toContain('row');
        expect(row.children[0].tagName.toLowerCase()).toBe('app-monthly-emissions-card');
        expect(row.children[1].tagName.toLowerCase()).toBe('app-fuel-share-card');
        expect(getComputedStyle(row).alignItems).toBe('stretch');
        expect(css).toContain('.row.b { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }');
        expect(q('[data-testid="period-result"]')!.closest('.row')).not.toBe(row);
        expect(row.compareDocumentPosition(q('[data-testid="team-card"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      });

      it('sin emisiones calculadas las dos explican que aún no hay emisiones, sin dibujar nada', () => {
        open();
        answer({ periods: [RECENT] });

        expect(qa('[data-testid="charts-row"] [data-testid="chart-message"]').map((m) => m.textContent)).toEqual(['Sin viajes calculados en este periodo. Aún no hay emisiones calculadas', 'Aún no hay emisiones calculadas']);
        expect(q('[data-testid="charts-row"] svg[role="img"]')).toBeNull();
        expect(q('[data-testid="charts-row"] [data-testid="bar"]')).toBeNull();
        expect(q('[data-testid="charts-row"] [data-testid="donut-slice"]')).toBeNull();
      });

      it('sin emisiones se ve el marco vacío de cada gráfica (anillo y rejilla), con las etiquetas de mes del periodo elegido y sin datos', () => {
        open();
        answer({ periods: [RECENT] });

        expect(q('[data-testid="monthly-chart"] [data-testid="bar-frame"]')).not.toBeNull();
        expect(Array.from(el().querySelectorAll('[data-testid="monthly-chart"] [data-testid="frame-months"] span')).map((m) => m.textContent)).toEqual(['abr 2026', 'may 2026', 'jun 2026']);
        expect(q('[data-testid="fuel-chart"] [data-testid="donut-frame"]')).not.toBeNull();
        expect(q('[data-testid="fuel-chart"] [data-testid="donut-slice"]')).toBeNull();
        expect(q('[data-testid="monthly-chart"] [data-testid="bar"]')).toBeNull();
      });

      it('las dos llevan el periodo elegido en un chip y cambia con el selector', () => {
        open();
        answer({ periods: [RECENT, OLDER] });
        expect(qa('[data-testid="charts-row"] [data-testid="chart-period"]').map((c) => c.textContent)).toEqual(['Abr 2026 a Jun 2026', 'Abr 2026 a Jun 2026']);

        q<HTMLButtonElement>('[data-testid="period"] button')!.click();
        fixture.detectChanges();
        q('[data-testid="period-option-2"]')!.click();
        fixture.detectChanges();
        expect(qa('[data-testid="charts-row"] [data-testid="chart-period"]').map((c) => c.textContent)).toEqual(['Ene 2026 a Mar 2026', 'Ene 2026 a Mar 2026']);

        q<HTMLButtonElement>('[data-testid="period"] button')!.click();
        fixture.detectChanges();
        q('[data-testid="period-option-0"]')!.click();
        fixture.detectChanges();
        expect(qa('[data-testid="charts-row"] [data-testid="chart-period"]').map((c) => c.textContent)).toEqual(['Todos los periodos', 'Todos los periodos']);
      });

      it('al cambiar de periodo muestran su esqueleto mientras se recarga y vuelven', () => {
        open();
        answer({ periods: [RECENT, OLDER] });
        q<HTMLButtonElement>('[data-testid="period"] button')!.click();
        fixture.detectChanges();
        q('[data-testid="period-option-2"]')!.click();
        fixture.detectChanges();

        expect(qa('[data-testid="charts-row"] [data-testid="chart-skeleton"]').length).toBe(2);
        footprintRequests().forEach((r) => r.flush({ data: NO_EMISSIONS }));
        fixture.detectChanges();
        expect(qa('[data-testid="charts-row"] [data-testid="chart-skeleton"]').length).toBe(0);
        expect(qa('[data-testid="charts-row"] [data-testid="chart-message"]').length).toBe(2);
      });

      it('si falla la huella ofrecen «Reintentar» (solo vuelve a pedir la huella)', () => {
        open();
        http.match(`${ORG}/imports/periods`).forEach((r) => r.flush({ data: [] }));
        countsRequests().forEach((r) => r.flush({ data: loaded }));
        fixture.detectChanges();
        footprintRequests().forEach((r) => r.flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'x' }));
        fixture.detectChanges();

        expect(qa('[data-testid="charts-row"] [data-testid="chart-error"]').length).toBe(2);
        q('[data-testid="monthly-chart"] [data-testid="chart-error"] button')!.click();
        expect(footprintRequests().length).toBe(1);
        expect(countsRequests().length).toBe(0);
      });

      it('con huella real dibuja las barras de la serie (un mes sin viajes queda en cero, sin barra) y la dona por combustible, y marca «Parcial»', () => {
        open();
        answer({ periods: [RECENT], footprint: footprintDto({ period: { from: '2026-04-01', to: '2026-06-30' }, series: [bucketDto({ key: '2026-04', label: 'abr 2026', kg_co2: 1000, trips: 3 }), bucketDto({ key: '2026-05', label: 'may 2026', kg_co2: 0, t_co2: 0, trips: 0 }), bucketDto({ key: '2026-06', label: 'jun 2026', kg_co2: 500, trips: 2 })] }) });

        expect(qa('[data-testid="monthly-chart"] [data-testid="bar"]').length).toBe(2);
        expect(qa('[data-testid="monthly-chart"] [data-testid="bar-hit"]').length).toBe(3);
        expect(qa('[data-testid="fuel-chart"] [data-testid="donut-slice"]').length).toBe(2);
        expect(qa('[data-testid="charts-row"] [data-testid="chart-partial"]').length).toBe(2);
      });

      it('sin imports:create siguen pendientes y sin esqueleto (no hay nada que esperar)', () => {
        open(['ORG_VIEWER']);
        answer();

        expect(qa('[data-testid="charts-row"] [data-testid="chart-skeleton"]').length).toBe(0);
        expect(qa('[data-testid="charts-row"] [data-testid="chart-period"]').length).toBe(0);
      });
    });

    describe('huella por granularidad', () => {
      const PERIOD = { from: '2026-04-01', to: '2026-06-30' };
      const WEEKS = [
        bucketDto({ key: '2026-W14', label: 'Sem 14', start: '2026-04-01', end: '2026-04-05', kg_co2: 1000, t_co2: 1, trips: 3, partial: true }),
        bucketDto({ key: '2026-W15', label: 'Sem 15', start: '2026-04-06', end: '2026-04-12', kg_co2: 0, t_co2: 0, trips: 0 }),
        bucketDto({ key: '2026-W16', label: 'Sem 16', start: '2026-04-13', end: '2026-04-19', kg_co2: 500, t_co2: 0.5, trips: 2 }),
      ];
      const weekly = (extra: object = {}) => footprintDto({ period: PERIOD, granularity: 'week', series: WEEKS, series_total_kg: 1500, ...extra });
      const select = (): HTMLSelectElement => q<HTMLSelectElement>('[data-testid="monthly-chart"] [data-testid="granularity-select"]')!;
      const pick = (value: string): void => {
        select().value = value;
        select().dispatchEvent(new Event('change'));
        fixture.detectChanges();
      };

      it('por defecto es mensual y la petición no cambia (sin `granularity`); la URL no lleva ?gran', () => {
        open(['ORG_ADMIN'], null);
        answer({ periods: [RECENT], footprint: footprintDto({ period: PERIOD }) });

        expect(select().value).toBe('month');
        expect(text('[data-testid="monthly-chart"] h2')).toBe('Emisiones de CO₂ por mes');
        expect(navigate).not.toHaveBeenCalled();
      });

      it('al elegir «Semanal» pide UNA vez el mismo periodo con granularity=week, muestra el esqueleto sin cambiar la altura y dibuja la serie (con 0 y parcial)', () => {
        open(['ORG_ADMIN'], null);
        answer({ periods: [RECENT], footprint: footprintDto({ period: PERIOD }) });
        const before = Math.round(q('[data-testid="monthly-chart"] .cc')!.getBoundingClientRect().height);

        pick('week');
        const requests = footprintRequests();

        expect(requests.length).toBe(1);
        expect([requests[0].request.params.get('granularity'), requests[0].request.params.get('from'), requests[0].request.params.get('to')]).toEqual(['week', '2026-04-01', '2026-06-30']);
        expect(q('[data-testid="monthly-chart"] [data-testid="chart-skeleton"]')).not.toBeNull();
        expect(Math.round(q('[data-testid="monthly-chart"] .cc')!.getBoundingClientRect().height)).toBe(before);
        requests[0].flush({ data: weekly() });
        fixture.detectChanges();

        expect(text('[data-testid="monthly-chart"] h2')).toBe('Emisiones de CO₂ por semana');
        expect(qa('[data-testid="monthly-chart"] [data-testid="bar"]').length).toBe(2);
        expect(qa('[data-testid="monthly-chart"] [data-testid="bar-hit"]').length).toBe(3);
        expect(text('[data-testid="monthly-chart"] [data-testid="chart-subtitle"]')).toBe('Total 1.500 kg');
        expect(Math.round(q('[data-testid="monthly-chart"] .cc')!.getBoundingClientRect().height)).toBe(256);
      });

      it('lo demás no cambia al cambiar la granularidad: el total de la tarjeta de huella y la dona siguen siendo los de totals/by_fuel', () => {
        open(['ORG_ADMIN'], null);
        answer({ periods: [RECENT], footprint: footprintDto({ period: PERIOD }) });
        const kpi = text('[data-testid="kpi-footprint"] [data-testid="kpi-value"]');

        pick('week');
        footprintRequests()[0].flush({ data: weekly() });
        fixture.detectChanges();

        expect(text('[data-testid="kpi-footprint"] [data-testid="kpi-value"]')).toBe(kpi);
        expect(kpi).toContain('5.588');
        expect(qa('[data-testid="fuel-chart"] [data-testid="donut-slice"]').length).toBe(2);
      });

      it('la URL queda con ?gran=week (reemplazando el historial) y con la mensual se quita', () => {
        open(['ORG_ADMIN'], null);
        answer({ periods: [RECENT], footprint: footprintDto({ period: PERIOD }) });
        pick('week');

        expect(navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { gran: 'week' }, queryParamsHandling: 'merge', replaceUrl: true }));
        footprintRequests().forEach((r) => r.flush({ data: weekly() }));
        params$.next(convertToParamMap({ gran: 'week' }));
        navigate.calls.reset();
        fixture.detectChanges();
        pick('month');

        expect(navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { gran: null } }));
      });

      it('al abrir con ?gran=quarter la primera petición ya la lleva (no se pide antes la mensual) y el control la muestra', () => {
        open(['ORG_ADMIN'], 'quarter');
        http.match(`${ORG}/imports/periods`).forEach((r) => r.flush({ data: [RECENT] }));
        http.match((r) => r.url === `${ORG}/imports/counts`).forEach((r) => r.flush({ data: loaded }));
        fixture.detectChanges();
        const requests = footprintRequests();

        expect(requests.length).toBe(1);
        expect(requests[0].request.params.get('granularity')).toBe('quarter');
        expect(select().value).toBe('quarter');
        expect(navigate).not.toHaveBeenCalled();
      });

      it('un valor hostil en la URL vuelve a la mensual (sin enviarlo al servidor) y limpia la URL', () => {
        for (const hostile of ['zzz', '<script>alert(1)</script>', 'WEEK', '__proto__', 'day;drop']) {
          TestBed.resetTestingModule();
          open(['ORG_ADMIN'], hostile);
          http.match(`${ORG}/imports/periods`).forEach((r) => r.flush({ data: [RECENT] }));
          http.match((r) => r.url === `${ORG}/imports/counts`).forEach((r) => r.flush({ data: loaded }));
          fixture.detectChanges();
          const requests = footprintRequests();

          expect(requests.length).withContext(hostile).toBe(1);
          expect(requests[0].request.params.has('granularity')).withContext(hostile).toBeFalse();
          expect(select().value).toBe('month');
          expect(navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { gran: null } }));
          http.match(() => true);
        }
      });

      it('si la URL cambia (atrás/adelante) la serie se vuelve a pedir una vez con la nueva granularidad', () => {
        open(['ORG_ADMIN'], null);
        answer({ periods: [RECENT], footprint: footprintDto({ period: PERIOD }) });
        params$.next(convertToParamMap({ gran: 'semester' }));
        fixture.detectChanges();
        const requests = footprintRequests();

        expect(requests.length).toBe(1);
        expect(requests[0].request.params.get('granularity')).toBe('semester');
      });

      it('cambiar de periodo con otra granularidad la conserva en la nueva petición', () => {
        open();
        answer({ periods: [RECENT, OLDER], footprint: footprintDto({ period: PERIOD }) });
        pick('week');
        footprintRequests().forEach((r) => r.flush({ data: weekly() }));
        fixture.detectChanges();
        q<HTMLButtonElement>('[data-testid="period"] button')!.click();
        fixture.detectChanges();
        qa('[data-testid="period"] [role="option"]')[2].click();
        fixture.detectChanges();
        const requests = footprintRequests();

        expect(requests.length).toBe(1);
        expect([requests[0].request.params.get('granularity'), requests[0].request.params.get('from')]).toEqual(['week', '2026-01-05']);
      });

      it('cambios seguidos de granularidad cancelan la petición anterior y solo cuenta la última', () => {
        open(['ORG_ADMIN'], null);
        answer({ periods: [RECENT], footprint: footprintDto({ period: PERIOD }) });
        pick('week');
        const first = footprintRequests();

        pick('year');
        const second = footprintRequests();

        expect(first[0].cancelled).toBeTrue();
        expect(second.length).toBe(1);
        second[0].flush({ data: footprintDto({ period: PERIOD, granularity: 'year', series: [bucketDto({ key: '2026', label: '2026', kg_co2: 1500, t_co2: 1.5, trips: 5 })], series_total_kg: 1500 }) });
        fixture.detectChanges();
        expect(text('[data-testid="monthly-chart"] h2')).toBe('Emisiones de CO₂ por año');
      });

      it('GRANULARITY_TOO_FINE: vuelve a la granularidad anterior, muestra el mensaje en español con estilo de alerta, deshabilita «Diario» y no rompe el resto', () => {
        open(['ORG_ADMIN'], null);
        answer({ periods: [RECENT], footprint: footprintDto({ period: PERIOD }) });
        pick('day');
        footprintRequests()[0].flush({ error: { code: 'GRANULARITY_TOO_FINE', message: 'El periodo tiene 91 días: la serie diaria admite hasta 30.' } }, { status: 422, statusText: 'x' });
        fixture.detectChanges();
        const retry = footprintRequests();

        expect(retry.length).toBe(1);
        expect(retry[0].request.params.has('granularity')).toBeFalse();
        retry[0].flush({ data: footprintDto({ period: PERIOD }) });
        fixture.detectChanges();

        expect(select().value).toBe('month');
        const alert = q('[data-testid="monthly-chart"] [data-testid="granularity-notice"]')!;

        expect(alert.getAttribute('role')).toBe('alert');
        expect(alert.textContent).toContain('demasiado largo para ver la serie diaria');
        expect(Array.from(select().options).filter((o) => o.disabled).map((o) => o.value)).toEqual(['day']);
        expect(q('[data-testid="monthly-chart"] [data-testid="chart-error"]')).toBeNull();
        expect(Math.round(q('[data-testid="monthly-chart"] .cc')!.getBoundingClientRect().height)).toBe(256);
      });

      it('INVALID_PERIOD: aviso con el mensaje del catálogo en estilo de alerta y la gráfica anterior intacta (sin error ni esqueleto), a 256 px', () => {
        open();
        answer({ periods: [RECENT, OLDER], footprint: footprintDto({ period: PERIOD }) });
        const bars = qa('[data-testid="monthly-chart"] [data-testid="bar"]').length;

        q<HTMLButtonElement>('[data-testid="period"] button')!.click();
        fixture.detectChanges();
        qa('[data-testid="period"] [role="option"]')[2].click();
        fixture.detectChanges();
        footprintRequests()[0].flush({ error: { code: 'INVALID_PERIOD', message: 'x' } }, { status: 422, statusText: 'x' });
        fixture.detectChanges();

        const alert = q('[data-testid="monthly-chart"] [data-testid="granularity-notice"]')!;

        expect(alert.getAttribute('role')).toBe('alert');
        expect(alert.textContent).toContain('El periodo no es válido');
        expect(q('[data-testid="monthly-chart"] [data-testid="chart-error"]')).toBeNull();
        expect(qa('[data-testid="monthly-chart"] [data-testid="bar"]').length).toBe(bars);
        expect(Math.round(q('[data-testid="monthly-chart"] .cc')!.getBoundingClientRect().height)).toBe(256);
      });

      it('un error de la serie muestra «No se pudo cargar» con «Reintentar», que vuelve a pedir la misma granularidad', () => {
        open(['ORG_ADMIN'], null);
        answer({ periods: [RECENT], footprint: footprintDto({ period: PERIOD }) });
        pick('week');
        footprintRequests()[0].flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'x' });
        fixture.detectChanges();

        expect(q('[data-testid="monthly-chart"] [data-testid="chart-error"]')).not.toBeNull();
        expect(select().value).toBe('week');
        q<HTMLButtonElement>('[data-testid="monthly-chart"] [data-testid="chart-error"] button')!.click();
        expect(footprintRequests()[0].request.params.get('granularity')).toBe('week');
      });

      it('serie en cero: «Sin viajes calculados en este periodo» con la pista de cobertura y la altura de siempre', () => {
        const zero = WEEKS.map((b) => ({ ...b, kg_co2: 0, t_co2: 0, trips: 0 }));
        const empty = footprintDto({ period: PERIOD, by_month: [], by_fuel: [], periods: [], granularity: 'week', series: zero, series_total_kg: 0, totals: { ...footprintDto().totals, kg_co2: 0, trips_calculated: 0, trips_pending: 4, coverage_trips_pct: 0, partial: true, measured_kg_co2: 0, estimated_kg_co2: 0, measured_trips: 0, estimated_trips: 0 } });

        open(['ORG_ADMIN'], 'week');
        answer({ periods: [RECENT], footprint: empty });

        expect(text('[data-testid="monthly-chart"] [data-testid="chart-message"]')).toBe('Sin viajes calculados en este periodo. Aún no hay emisiones calculadas: faltan datos en 6 viajes');
        expect(Math.round(q('[data-testid="monthly-chart"] .cc')!.getBoundingClientRect().height)).toBe(256);
      });

      it('la tabla alterna con el gráfico en la misma tarjeta, con el total de series_total_kg, sin cambiar de alto ni pedir nada', () => {
        open(['ORG_ADMIN'], 'week');
        answer({ periods: [RECENT], footprint: weekly() });
        q<HTMLButtonElement>('[data-testid="monthly-chart"] [data-testid="view-table"]')!.click();
        fixture.detectChanges();

        expect(qa('[data-testid="monthly-chart"] [data-testid="series-row"]').length).toBe(3);
        expect(text('[data-testid="monthly-chart"] [data-testid="series-total"]')).toBe('Total 1.500 kg CO₂');
        expect(Math.round(q('[data-testid="monthly-chart"] .cc')!.getBoundingClientRect().height)).toBe(256);
        expect(footprintRequests().length).toBe(0);
      });

      it('la tarjeta de gráficas por combustible no cambia de alto ni de contenido con la serie semanal', () => {
        open(['ORG_ADMIN'], 'week');
        answer({ periods: [RECENT], footprint: weekly() });

        expect(Math.round(q('[data-testid="fuel-chart"] .cc')!.getBoundingClientRect().height)).toBe(256);
      });
    });

    describe('filas inferiores', () => {
      it('ya no hay «Acciones pendientes» ni «Próximamente» ni «Factores de emisión» de tres tarjetas en el Resumen', () => {
        open();
        answer();

        for (const gone of ['todo', 'todo-count', 'coming-soon', 'emission-factors', 'factor-cards']) expect(q(`[data-testid="${gone}"]`)).withContext(gone).toBeNull();
        expect(q('#todo-title')).toBeNull();
        expect(el().textContent).not.toMatch(/Acciones pendientes|Todo en orden|Próximamente|Factores de emisión/);
      });

      it('el orden de la página: bienvenida, periodo, indicadores, resultado y factor, y usuarios con precios', () => {
        open();
        answer();
        const order = ['app-page-hero', '[data-testid="period"]', '[data-testid="kpi-row"]', '[data-testid="period-result"]', '[data-testid="kpi-emission-factor"]', '[data-testid="monthly-chart"]', '[data-testid="fuel-chart"]', '[data-testid="team-card"]', '[data-testid="fuel-prices"]'].map((sel) => q(sel)!);

        for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).withContext(String(i)).toBeTruthy();
      });

      it('la fila 2 es «Resultado del periodo» y «Factor de emisión» (en ese orden) al 50 % cada una, estiradas a la misma altura, y se apilan bajo 1100 px', () => {
        open();
        answer();
        const row = q('[data-testid="emission-factor"]')!.parentElement!;
        const css = Array.from(document.querySelectorAll('style')).map((st) => (st.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.row.b')).join('\n');

        expect(row.classList).toContain('row');
        expect(row.children[0].tagName.toLowerCase()).toBe('app-period-result-card');
        expect(row.children[1].tagName.toLowerCase()).toBe('app-factor-rotator-card');
        expect(getComputedStyle(row).alignItems).toBe('stretch');
        expect(css).toContain('.row.b { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }');
        expect(css).toMatch(/@media \(max-width: 1100px\) \{ \.row\.b, \.row\.c, \.row\.c\.single \{ grid-template-columns: minmax\(0, 1fr\); \}/);
      });

      it('la fila 3 es «Usuarios de la empresa» (≈ 1/3, mínimo 300 px) y «Precios de combustibles» (resto); sin permiso de equipo, precios a todo el ancho', () => {
        open();
        answer();
        const row = q('[data-testid="team-card"]')!.parentElement!;
        const css = Array.from(document.querySelectorAll('style')).map((st) => (st.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.row.c')).join('\n');

        expect(row.classList).toContain('row');
        expect(row.children[0].getAttribute('data-testid')).toBe('team-card');
        expect(row.children[1].getAttribute('data-testid')).toBe('fuel-prices');
        expect(css).toContain('.row.c { grid-template-columns: minmax(300px, 1fr) minmax(0, 2fr); }');
        expect(text('[data-testid="team-card"] h2')).toBe('Usuarios de la empresa');
        expect(q('[data-testid="team-card"] a.more')!.getAttribute('href')).toBe('/usuarios');

        TestBed.resetTestingModule();
        open(['ORG_VIEWER']);
        answer();
        expect(q('[data-testid="team-card"]')).toBeNull();
        expect(q('[data-testid="fuel-prices"]')!.parentElement!.classList).toContain('single');
      });

      it('las cuatro tarjetas grandes comparten la cabecera: chip de ícono de 40 px, título y línea de apoyo', () => {
        open();
        answer({ periods: [RECENT] });
        const heads = [q('[data-testid="kpi-emission-factor"] .fh')!, q('[data-testid="period-result"] .head')!, q('[data-testid="team-card"] > header')!, q('[data-testid="fuel-prices"] > header')!];

        for (const head of heads) {
          const chip = head.querySelector<HTMLElement>('.ico.chip')!;

          expect(chip).not.toBeNull();
          expect([getComputedStyle(chip).width, getComputedStyle(chip).height, getComputedStyle(chip).borderRadius]).toEqual(['40px', '40px', '12px']);
          expect(head.querySelector('h2')).not.toBeNull();
          expect(head.querySelector('p')).not.toBeNull();
        }
        expect(text('[data-testid="team-card"] header p')).toBe('Personas con acceso a tu empresa');
        expect(text('[data-testid="fuel-prices"] header p')).toBe('Referencia CREG y MinEnergía');
      });

      it('«Precios de combustibles» sigue con su enlace a Inteligencia', () => {
        open();
        answer();

        expect(text('[data-testid="fuel-prices"] h2')).toBe('Precios de combustibles');
        expect(q('[data-testid="fuel-prices"] a.more')!.getAttribute('href')).toBe('/intelligence');
      });
    });

    it('el CSS de las tarjetas y de la pantalla usa solo tokens: sin hexadecimales ni rgb() y tintes permitidos', () => {
      open();
      answer();
      const css = Array.from(document.querySelectorAll('style')).map((st) => (st.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.kpi') || c.includes('.fp-grid') || c.includes('.team')).join('\n');

      expect(css).toContain('.kpi');
      expect(css).toContain('.team');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
    });
});
