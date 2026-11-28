import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { reloadOnContextChange } from '../../core/org/organization-context';
import { PageHeroComponent } from '../../shared/ui/page-hero.component';
import { OrgRequiredComponent } from '../../shared/ui/org-required.component';
import { DEFAULT_GRANULARITY, Granularity, parseGranularity } from '../../domain/models/granularity';
import { periodRangeLabel } from '../../domain/models/period';
import { AccessPolicy } from '../../core/auth/access-policy';
import { SessionStore } from '../../core/auth/session.store';
import { FuelPriceCardsComponent } from '../intelligence/fuel-price-cards.component';
import { IntelligenceFacade } from '../intelligence/intelligence.facade';
import { UsersFacade } from '../users/users.facade';
import { roleLabel } from '../../shared/ui/labels';
import { ROUTE_PIN_ICON, TRUCK_ICON } from '../../shared/ui/icons';
import { HEADER_CHIP_STYLES } from '../../shared/ui/icon-chip.styles';
import { KpiTileComponent } from '../../shared/ui/kpi-tile.component';
import { VehiclesFacade } from '../vehicles/vehicles.facade';
import { FactorRotatorCardComponent } from '../emissions/factor-rotator-card.component';
import { formatCount, share } from '../imports/imports.labels';
import { FootprintCardComponent } from './footprint-card.component';
import { PeriodSelectorComponent } from './period-selector.component';
import { FuelShareCardComponent } from './fuel-share-card.component';
import { MonthlyEmissionsCardComponent } from './monthly-emissions-card.component';
import { ResultCardComponent } from './result-card.component';
import { MethodologyDialogComponent } from './methodology-dialog.component';
import { MethodologyFacade } from './methodology.facade';
import { ImportsOverviewFacade } from './imports-overview.facade';
import { FootprintFacade } from './footprint.facade';
import { coverageHint, tripsInScope, withPossibleDuplicates } from '../../shared/ui/footprint.format';
import { hasEmissions, noEmissionsText } from './footprint.view';

/** Parámetro de la URL con la granularidad de la serie («?gran=week»). */
export const GRANULARITY_PARAM = 'gran';

/** Cada cuánto se renueva el Resumen mientras haya cargas en proceso (para ver la huella apenas termina el cálculo). */
const REFRESH_MS = 5000;

/** Resumen de la empresa: solo datos reales; lo que aún no tiene backend se anuncia como «Próximamente», nunca con ejemplos. */
@Component({
  selector: 'app-dashboard',
  imports: [PageHeroComponent, FuelPriceCardsComponent, RouterLink, OrgRequiredComponent, KpiTileComponent, FactorRotatorCardComponent, FootprintCardComponent, PeriodSelectorComponent, ResultCardComponent, MethodologyDialogComponent, MonthlyEmissionsCardComponent, FuelShareCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    HEADER_CHIP_STYLES,
    `
      :host { display: block; } .page { gap: 12px; display: flex; flex-direction: column; min-height: calc(100dvh - 124px); }
      app-org-required { display: contents; }
      /* Barra de herramientas de una línea, alineada a la derecha entre el encabezado y las tarjetas (el hero no aloja contenido: su ilustración ocupa la esquina inferior derecha). */
      .toolbar { display: flex; justify-content: flex-end; }
      .row { display: grid; gap: 12px; align-items: stretch; }
      .row.b { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .row.c { grid-template-columns: minmax(300px, 1fr) minmax(0, 2fr); } .row.c.single { grid-template-columns: minmax(0, 1fr); }
      .team { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
      .team li { display: flex; align-items: center; gap: 12px; padding: 4px 4px; border-bottom: 1px solid var(--c-bd); }
      .team .av { display: grid; place-items: center; flex: none; width: 34px; height: 34px; border-radius: 50%; background: var(--c-ok-soft); color: var(--c-accent); font-weight: 700; font-size: 0.76rem; }
      .team .who { min-width: 0; flex: 1; } .team .who strong { display: block; color: var(--c-head); font-size: 0.9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .team .who small { display: block; color: var(--c-mu); font-size: 0.76rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .team .rl { flex: none; font-size: 0.74rem; font-weight: 600; padding: 2px 9px; border-radius: 999px; background: var(--c-s3); color: var(--c-text2); }
      .team .rl.ORG_ADMIN { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); color: color-mix(in srgb, var(--c-primary-700) 80%, var(--c-head)); } .team .rl.ORG_ANALYST { background: color-mix(in srgb, var(--c-secondary) 14%, var(--c-sf)); color: color-mix(in srgb, var(--c-secondary) 80%, var(--c-head)); }
      .tstats { display: flex; gap: 14px; margin-left: auto; color: var(--c-mu); font-size: 0.78rem; text-align: right; } .tstats b { display: block; color: var(--c-head); font-size: 1.05rem; line-height: 1.1; }
      .card { border-radius: 16px; padding: 12px 18px; }
      .card > header { display: flex; align-items: center; justify-content: flex-start; gap: 12px; margin-bottom: 12px; text-align: left; }
      .card { padding: 16px 18px; }
      .card > header .ht { min-width: 0; }
      .card > header h2 { margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--c-head); }
      .card > header p { margin: 1px 0 0; color: var(--c-mu); font-size: 0.78rem; }
      .more { display: inline-block; margin-top: 6px; font-size: 0.9rem; font-weight: 600; color: var(--c-accent); text-decoration: none; }
      .allgood { display: flex; align-items: center; gap: 10px; margin: 0; padding: 5px 12px; border-radius: 12px; background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); color: var(--c-text2); font-size: 0.86rem; }
      .kpis { container-type: inline-size; }
      .kpis-in { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
      .kpis-in > * { min-width: 0; }
      @container (max-width: 1180px) { .kpis-in { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @container (max-width: 760px) { .kpis-in { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @container (max-width: 460px) { .kpis-in { grid-template-columns: minmax(0, 1fr); } }
      @media (max-width: 1100px) { .row.b, .row.c, .row.c.single { grid-template-columns: minmax(0, 1fr); } }
    `,
  ],
  template: `
    <div class="page">
      <app-page-hero [title]="'Bienvenido, ' + userName()" subtitle="Sigue la huella de carbono de tu empresa y avanza en su plan de descarbonización." />

      <app-org-required>
          <div class="toolbar">
                      <app-period-selector data-testid="period" [periods]="imports.periods.data() ?? []" [selection]="imports.selection()" [status]="canSeeImports() ? imports.periods.status() : 'ready'" [link]="canSeeImports() ? '/cargas' : null" (selected)="imports.select($event)" (retry)="imports.load()" />
          </div>
          @if (showKpis()) {
            <section class="kpis" aria-label="Indicadores de la empresa" data-testid="kpi-row">
              <div class="kpis-in">
                <app-footprint-card size="sm" data-testid="kpi-footprint" [footprint]="footprint()" [status]="footprintStatus()" (retry)="reloadFootprint()" [link]="canSeeImports() ? '/cargas' : null" />
                @if (canSeeImports()) {
                  <app-kpi-tile size="sm" data-testid="kpi-trips" label="Viajes procesados" [caption]="tripsCaption()" [icon]="icons.pin" [iconSolid]="true" [value]="tripsValue()" [status]="imports.counts.status()" link="/cargas" (retry)="imports.reloadCounts()" />
                  <app-kpi-tile size="sm" data-testid="kpi-missing" label="Datos por completar" [caption]="missingCaption()" [icon]="icons.alert" [value]="missingValue()" [tone]="missingTone()" [status]="missingStatus()" link="/cargas" (retry)="reloadFootprint()" />
                }
                @if (canSeeVehicles()) {
                  <app-kpi-tile size="sm" data-testid="kpi-registered" label="Vehículos registrados" [caption]="vehiclesCaption()" [icon]="icons.truck" [value]="summary()?.registered ?? 0" [status]="vehicles.summary.status()" link="/vehiculos" (retry)="vehicles.loadSummary()" />
                }
                @if (canSeeImports()) {
                  <app-kpi-tile size="sm" data-testid="kpi-running" label="Cargas en proceso" [caption]="runningCaption()" [icon]="icons.clock" [value]="counts()?.inProgress ?? 0" [status]="imports.counts.status()" link="/cargas" (retry)="imports.reloadCounts()" />
                }
              </div>
            </section>
          }
          <div class="row b">
            <app-period-result-card data-testid="period-result-card" [footprint]="footprint()" [footprintStatus]="footprintStatus()" (retryFootprint)="reloadFootprint()" (methodology)="methodology.show()" [counts]="canSeeImports() ? counts() ?? null : null" [periodLabel]="resultPeriodLabel()" [status]="canSeeImports() ? imports.counts.status() : 'ready'" (retry)="imports.reloadCounts()" />
            <app-factor-rotator-card appearance="tile" data-testid="emission-factor" />
          </div>

          <div class="row b" data-testid="charts-row">
            <app-monthly-emissions-card data-testid="monthly-chart" [series]="footprint()?.series ?? null" [seriesTotalKg]="footprint()?.seriesTotalKg ?? null" [granularity]="granularity()" [disabled]="disabledGranularities()" [notice]="granularityNotice()" (granularityChange)="chooseGranularity($event)" [periodLabel]="resultPeriodLabel()" [partial]="partial()" [partialHint]="partialHint()" [emptyText]="chartEmptyText()" [status]="footprintStatus()" (retry)="reloadFootprint()" />
            <app-fuel-share-card data-testid="fuel-chart" [byFuel]="footprint()?.byFuel ?? null" [periodLabel]="resultPeriodLabel()" [partial]="partial()" [partialHint]="partialHint()" [emptyText]="chartEmptyText()" [status]="footprintStatus()" (retry)="reloadFootprint()" />
          </div>

          <div class="row c" [class.single]="!canSeeTeam()">
            @if (canSeeTeam()) {
              <section class="card" aria-labelledby="team-title" data-testid="team-card">
                <header class="hdr">
                  <span class="ico chip" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14a6.5 6.5 0 0 1 3.5 6" /></svg></span>
                  <div class="ht"><h2 id="team-title">Usuarios de la empresa</h2><p>Personas con acceso a tu empresa</p></div>
                  @if (users.counts.data(); as c) { <div class="tstats"><span><b>{{ c.active + c.pending + c.suspended }}</b>en total</span><span><b>{{ c.active }}</b>activos</span>@if (c.pendingInvitations) { <span><b>{{ c.pendingInvitations }}</b>invitaciones</span> }</div> }
                </header>
                <ul class="team">
                  @for (u of sample(); track u.id) {
                    <li>
                      <span class="av" aria-hidden="true">{{ initials(u.fullName) }}</span>
                      <span class="who"><strong>{{ u.fullName }}</strong><small>{{ u.email }}</small></span>
                      @if (u.memberships[0]?.roles?.[0]; as r) { <span class="rl" [class]="'rl ' + r">{{ roleName(r) }}</span> }
                    </li>
                  } @empty { <li class="allgood">Aún no hay otras personas en tu empresa.</li> }
                </ul>
                <a class="more" routerLink="/usuarios">Ver todos los usuarios →</a>
              </section>
            }
            <section class="card" aria-labelledby="fuel-title" data-testid="fuel-prices">
              <header class="hdr">
                <span class="ico chip" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M7 8h6M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3" /></svg></span>
                <div class="ht"><h2 id="fuel-title">Precios de combustibles</h2><p>Referencia CREG y MinEnergía</p></div>
              </header>
              <app-fuel-price-cards [compact]="true" />
              <a class="more" routerLink="/intelligence">Ver detalle →</a>
            </section>
          </div>
      </app-org-required>
    </div>
    @if (methodology.open()) {
      <app-methodology-dialog [footprint]="footprint()" (closed)="methodology.hide()" />
    }
  `,
})
export class DashboardComponent {
  protected readonly users = inject(UsersFacade);
  private readonly session = inject(SessionStore);
  protected readonly userName = computed(() => this.session.user()?.fullName?.trim() ?? '');
  private readonly intel = inject(IntelligenceFacade);
  protected readonly vehicles = inject(VehiclesFacade);
  private readonly access = inject(AccessPolicy);
  protected readonly imports = inject(ImportsOverviewFacade);
  protected readonly methodology = inject(MethodologyFacade);
  private readonly footprints = inject(FootprintFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly granularity = this.footprints.granularity;
  protected readonly granularityNotice = this.footprints.notice;
  protected readonly disabledGranularities = this.footprints.disabledGranularities;
  /** `?gran=` de la URL: reabrir o recargar conserva la granularidad. */
  private readonly granularityParam = toSignal(this.route.queryParamMap.pipe(map((params) => params.get(GRANULARITY_PARAM))), { initialValue: null });
  /** La huella exige `indicators:read` (los tres roles de empresa la tienen). */
  private readonly canSeeFootprint = computed(() => this.access.can('indicators:read'));
  /** Huella real del periodo elegido (`null` mientras no llegue o sin permiso): alimenta la tarjeta de huella, el resultado por combustible y las dos gráficas. */
  protected readonly footprint = computed(() => (this.canSeeFootprint() ? this.footprints.footprint.data() : null));
  protected readonly footprintStatus = computed(() => (this.canSeeFootprint() ? this.footprints.footprint.status() : 'ready'));
  /** El resultado es parcial: hay viajes sin calcular (se marca en la tarjeta, el resultado y las gráficas). */
  protected readonly partial = computed(() => {
    const f = this.footprint();

    return hasEmissions(f) && f.totals.partial;
  });
  /** Ayuda de las gráficas: la cobertura si es parcial y la frase de posibles duplicados si hay viajes retenidos (esta última sin marcador visible nuevo). */
  protected readonly partialHint = computed(() => {
    const t = this.footprint()?.totals;

    return t && hasEmissions(this.footprint()) ? withPossibleDuplicates(this.partial() ? coverageHint(t.tripsCalculated, tripsInScope(t), t.coverageTripsPct) : null, t.tripsPossibleDuplicate) : null;
  });
  /** Con huella pedida pero sin viajes calculados, las gráficas explican por qué (faltan datos); con emisiones, el texto genérico. */
  protected readonly chartEmptyText = computed(() => {
    const f = this.footprint();

    return f && !hasEmissions(f) ? noEmissionsText(f) : null;
  });
  /** El periodo elegido en el selector, para el chip de «Resultado del periodo» («Todos los periodos» si no hay filtro). */
  protected readonly resultPeriodLabel = computed(() => {
    const selection = this.imports.selection();

    if (!this.canSeeImports() || (selection === 'ALL' && (this.imports.periods.data() ?? []).length === 0)) return null;

    return selection === 'ALL' ? 'Todos los periodos' : periodRangeLabel(selection.from, selection.to);
  });
  /** Ver a las personas de la empresa exige administrar membresías o leer usuarios (como la vista de Usuarios). */
  protected readonly canSeeVehicles = computed(() => this.access.can('vehicles:read'));
  /** Las tarjetas de calculabilidad y de cargas exigen poder cargar archivos (`imports:create`). */
  protected readonly canSeeImports = computed(() => this.access.can('imports:create'));
  protected readonly showKpis = computed(() => this.canSeeVehicles() || this.canSeeImports());
  protected readonly counts = computed(() => this.imports.counts.data());
  /** Sin filas leídas todavía no hay con qué calcular un porcentaje. */
  private readonly hasRows = computed(() => (this.counts()?.rowsRead ?? 0) > 0);
  protected readonly tripsValue = computed(() => (this.hasRows() ? formatCount(this.counts()?.rowsRead ?? 0) : '—'));
  protected readonly tripsCaption = computed(() => {
    if (!this.hasRows()) return 'Sube tu primer archivo para empezar';

    return this.imports.selection() === 'ALL' ? 'viajes revisados en total' : 'viajes revisados en el periodo';
  });
  /**
   * «Datos por completar» = viajes SIN CÁLCULO, en vivo: pendientes + bloqueados del inventario del periodo elegido (los mismos totales de la tarjeta de huella:
   * sin duplicados, retenidos ni anulados). No es la calidad del archivo al subirlo (esa foto vive en las cargas) y baja al calcular o completar viajes.
   */
  private readonly missingTrips = computed(() => {
    const t = this.footprint()?.totals;

    return t ? { pending: t.tripsPending + t.tripsBlocked, scope: tripsInScope(t) } : null;
  });
  protected readonly missingValue = computed(() => {
    const m = this.missingTrips();

    return m && m.scope > 0 ? formatCount(m.pending) : '—';
  });
  protected readonly missingTone = computed(() => ((this.missingTrips()?.pending ?? 0) > 0 ? 'warn' : ''));
  protected readonly missingStatus = computed(() => this.footprintStatus());
  protected readonly missingCaption = computed(() => {
    const m = this.missingTrips();

    if (!m || m.scope === 0) return 'Aparecerá cuando subas un archivo';

    return m.pending > 0 ? `${share(m.pending, m.scope)} % de los viajes sin calcular` : 'Todos los viajes están calculados';
  });
  protected readonly vehiclesCaption = computed(() => {
    const pending = this.canSeeImports() ? (this.counts()?.vehiclesPending ?? 0) : 0;

    return pending > 0 ? `${formatCount(pending)} ${pending === 1 ? 'carga con vehículos por revisar' : 'cargas con vehículos por revisar'}` : 'Inventario de tu empresa';
  });
  protected readonly runningCaption = computed(() => {
    const failed = this.counts()?.failed ?? 0;

    return `${formatCount(this.counts()?.total ?? 0)} en total · ${formatCount(failed)} ${failed === 1 ? 'fallida' : 'fallidas'}`;
  });
  protected readonly summary = computed(() => this.vehicles.summary.data());
  protected readonly icons = {
    truck: TRUCK_ICON,
    pin: ROUTE_PIN_ICON,
    alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 .01 0',
    leaf: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19c2-5 6-8 10-10',
  } as const;
  protected readonly canSeeTeam = computed(() => this.access.canAny(['users:read', 'memberships:manage']));
  /** Hubo cargas en proceso en la última lectura: al llegar a 0 se vuelve a pedir la huella (una carga terminó). */
  private hadRunning = false;

  /** El control de la tarjeta cambió la granularidad: la facade vuelve a pedir la serie y la URL se actualiza. */
  protected chooseGranularity(granularity: Granularity): void {
    this.footprints.setGranularity(granularity);
  }

  /** Vuelve a pedir la huella del periodo elegido (reintento). */
  protected reloadFootprint(): void {
    this.footprints.reload();
  }

  constructor() {
    // La URL manda al abrir y al cambiar (atrás, enlace): un valor ausente conserva el actual y uno inválido (hostil) vuelve a la mensual.
    effect(() => {
      const param = this.granularityParam();

      if (param !== null) untracked(() => this.footprints.setGranularity(parseGranularity(param)));
    });
    // La granularidad vigente (también tras volver a una anterior por un rechazo del servidor) queda en la URL; la mensual, que es la de por defecto, la quita.
    effect(() => {
      const granularity = this.footprints.granularity();
      const current = untracked(() => this.granularityParam());

      if (current === (granularity === DEFAULT_GRANULARITY ? null : granularity)) return;

      void this.router.navigate([], { relativeTo: this.route, queryParams: { [GRANULARITY_PARAM]: granularity === DEFAULT_GRANULARITY ? null : granularity }, queryParamsHandling: 'merge', replaceUrl: true });
    });
    // La huella espera a que el periodo esté resuelto (lista de periodos lista o fallida) para no pedir «todos» y luego el periodo elegido.
    effect(() => {
      const selection = this.imports.selection();
      const periods = this.imports.periods.status();
      const allowed = this.canSeeFootprint() && (!this.canSeeImports() || periods === 'ready' || periods === 'error');

      if (allowed) untracked(() => this.footprints.load(selection));
    });
    // Mientras haya cargas en proceso el Resumen se renueva solo, sin parpadeo; cuando la última termina se pide la huella una vez más.
    effect((onCleanup) => {
      const running = this.canSeeImports() && (this.counts()?.inProgress ?? 0) > 0;
      const finished = this.hadRunning && !running;

      this.hadRunning = running;

      if (finished && this.canSeeFootprint()) untracked(() => this.footprints.reload({ background: true }));

      if (!running) return;

      const timer = setTimeout(() => untracked(() => this.refresh()), REFRESH_MS);

      onCleanup(() => clearTimeout(timer));
    });
    reloadOnContextChange(() => {
      this.intel.loadSummary();
      if (this.canSeeVehicles()) this.vehicles.loadSummary();
      if (this.canSeeImports()) this.imports.load();
      if (this.canSeeTeam()) {
        this.users.loadPreview();
        this.users.loadCounts();
      }
    });
  }

  /** Renovación silenciosa de los indicadores del Resumen que dependen de las cargas. */
  private refresh(): void {
    this.imports.load({ background: true });
    if (this.canSeeFootprint()) this.footprints.reload({ background: true });
  }

  /** Tres personas al azar de la empresa (se sortean al llegar los datos y no cambian al redibujar). */
  protected readonly sample = computed(() => {
    const people = [...(this.users.preview.data()?.items ?? [])];

    for (let i = people.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [people[i], people[j]] = [people[j], people[i]];
    }

    return people.slice(0, 3);
  });

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  /** Etiqueta corta de la lista de personas: «Administrador», «Analista», «Consulta». */
  protected roleName(code: string): string {
    const short: Record<string, string> = { ORG_ADMIN: 'Administrador', ORG_ANALYST: 'Analista', ORG_VIEWER: 'Consulta' };

    return short[code] ?? roleLabel(code);
  }
}
