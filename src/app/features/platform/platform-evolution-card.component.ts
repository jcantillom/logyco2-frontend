import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { CHART_COLORS, ChartSeries } from '../../shared/ui/charts/chart-model';
import { TrendChartComponent } from '../../shared/ui/charts/trend-chart.component';
import { EvolutionMetric, MONTH_NAMES, buildEvolution } from './platform-evolution';
import { PlatformDashboardFacade } from './platform.facades';

/** Cuántos años hacia atrás se puede navegar (cada año adicional suma una consulta al calcular el acumulado). */
const MAX_YEARS_BACK = 5;

function localToday(): string {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Evolución mensual de empresas o usuarios, de enero a diciembre de un año, con navegación
 * año a año. Independiente del selector de período del resumen.
 */
@Component({
  selector: 'app-platform-evolution-card',
  imports: [DecimalPipe, ResourceStateComponent, TrendChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: contents; }
      svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
      .head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .head > svg { color: var(--c-accent); }
      .head .grow { flex: 1; min-width: 200px; }
      .head h2 { margin: 0; font-size: 0.98rem; font-weight: 650; letter-spacing: -0.02em; }
      .head p { margin: 4px 0 0; font-size: 0.75rem; color: var(--c-mu); }
      .controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .seg { display: inline-flex; padding: 3px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-s2); }
      .seg button { border: 0; background: none; padding: 7px 11px; border-radius: 7px; font: inherit; font-size: 0.74rem; font-weight: 600; color: var(--c-mu); cursor: pointer; }
      .seg button[aria-pressed='true'] { background: var(--c-primary); color: #fff; box-shadow: 0 2px 6px color-mix(in srgb, var(--c-primary) 25%, transparent); }
      .years { display: inline-flex; align-items: center; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); overflow: hidden; }
      .years button { all: unset; box-sizing: border-box; display: grid; place-items: center; width: 34px; height: 34px; cursor: pointer; color: var(--c-head); }
      .years button:hover:not(:disabled) { background: var(--c-s2); color: var(--c-accent); }
      .years button:disabled { opacity: 0.35; cursor: not-allowed; }
      .years button:focus-visible { outline: 3px solid var(--c-secondary-soft); outline-offset: -3px; }
      .years output { min-width: 64px; text-align: center; font-weight: 700; font-size: 0.9rem; color: var(--c-head); font-variant-numeric: tabular-nums; border-inline: 1px solid var(--c-gray-200); line-height: 34px; }
      /* Apilado (móvil o ventana baja): alto propio. En el resumen a pantalla completa lo reparte el layout global. */
      app-trend-chart.fill { flex: none; height: 260px; margin-top: 4px; }
      .strip { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 18px; padding-top: 8px; border-top: 1px solid var(--c-bd); }
      .stats { display: flex; flex-wrap: wrap; gap: 4px 18px; }
      .stat { display: inline-flex; align-items: baseline; gap: 6px; font-size: 0.74rem; color: var(--c-mu); }
      .stat b { font-size: 1.05rem; color: var(--c-head); letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
      .stat small { font-size: 0.7rem; font-weight: 700; color: var(--c-accent); }
      .chips { display: flex; flex-wrap: wrap; gap: 2px 14px; font-size: 0.7rem; color: var(--c-mu); }
      .chips b { color: var(--c-accent); font-variant-numeric: tabular-nums; }
      .empty { text-align: center; padding: 26px 10px; color: var(--c-mu); font-size: 0.84rem; }
      .empty strong { display: block; color: var(--c-accent); }
      @media (max-width: 560px) { app-trend-chart.fill { height: 220px; } }
    `,
  ],
  template: `
    <section class="card stack" aria-labelledby="evo-title" data-testid="trends">
      <div class="head">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V4M4 20h16M8 15l3-4 3 2 5-6" /></svg>
        <div class="grow">
          <h2 id="evo-title">Evolución de {{ metric() === 'organizations' ? 'empresas' : 'usuarios' }}</h2>
          <p data-testid="evo-subtitle">{{ evolution().cumulative ? 'Total registrado al cierre de cada mes' : 'Altas registradas en cada mes' }} · {{ year() }}</p>
        </div>
        <div class="controls">
          <div class="seg" role="group" aria-label="Qué evolución ver">
            <button type="button" [attr.aria-pressed]="metric() === 'organizations'" (click)="metric.set('organizations')">Empresas</button>
            <button type="button" [attr.aria-pressed]="metric() === 'users'" (click)="metric.set('users')">Usuarios</button>
          </div>
          <div class="years" role="group" aria-label="Año">
            <button type="button" data-testid="year-prev" aria-label="Año anterior" [disabled]="!canGoBack()" (click)="go(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
            <output data-testid="year" aria-live="polite">{{ year() }}</output>
            <button type="button" data-testid="year-next" aria-label="Año siguiente" [disabled]="!canGoForward()" (click)="go(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
          </div>
        </div>
      </div>

      <app-resource-state skeleton="chart" [status]="status()" [error]="dash.yearly.error()" (retry)="reload()">
        @if (dash.yearly.data()) {
          @if (!hasMovement()) {
            <p class="empty" data-testid="trends-empty"><strong>Sin altas en {{ year() }}</strong>No se registraron {{ metric() === 'organizations' ? 'empresas' : 'usuarios' }} en este año.</p>
          } @else {
            <app-trend-chart kind="line" [area]="true" [fill]="true" [labelGap]="38" [labels]="evolution().labels" [series]="series()" [ariaLabel]="'Evolución mensual de ' + (metric() === 'organizations' ? 'empresas' : 'usuarios') + ' en ' + year()" />
            <div class="strip">
              <div class="stats" data-testid="evo-tiles">
                <span class="stat">{{ evolution().cumulative ? 'Total a ' + lastMonth() : 'Altas en ' + lastMonth() }} <b>{{ (evolution().cumulative ? lastCumulative() : lastCreated()) | number }}</b></span>
                <span class="stat">Altas {{ year() }} <b>+{{ yearTotal() | number }}</b></span>
                <span class="stat">Mejor mes <b>{{ best().name }}</b> <small>+{{ best().count | number }}</small></span>
              </div>
              <div class="chips" data-testid="period-summary">
                <span><b>{{ evolution().summary.invitationsCreated }}</b> invitaciones</span>
                <span title="Administradores de empresa incorporados en el año"><b>{{ evolution().summary.adminsOnboarded }}</b> administradores</span>
                <span><b>{{ evolution().summary.membershipsApproved }}</b> membresías aprobadas</span>
              </div>
            </div>
          }
        }
      </app-resource-state>
    </section>
  `,
})
export class PlatformEvolutionCardComponent {
  protected readonly dash = inject(PlatformDashboardFacade);
  private readonly today = localToday();
  private readonly currentYear = Number(this.today.slice(0, 4));

  protected readonly metric = signal<EvolutionMetric>('organizations');
  protected readonly year = signal(this.currentYear);
  protected readonly canGoBack = computed(() => this.year() > this.currentYear - MAX_YEARS_BACK);
  protected readonly canGoForward = computed(() => this.year() < this.currentYear);

  /** El acumulado necesita las altas del año Y el total actual: se muestra todo junto para que la línea no cambie al llegar el total. */
  protected readonly status = computed(() => {
    const yearly = this.dash.yearly.status();
    const admin = this.dash.admin.status();

    if (yearly !== 'ready') return yearly;

    return admin === 'idle' || admin === 'loading' ? 'loading' : 'ready';
  });

  protected readonly evolution = computed(() => {
    const admin = this.dash.admin.data();
    const metric = this.metric();
    const total = admin ? (metric === 'organizations' ? admin.organizations.total : admin.users.total) : null;

    return buildEvolution(this.year(), metric, this.dash.yearly.data() ?? new Map(), total, this.today);
  });
  protected readonly series = computed<readonly ChartSeries[]>(() => {
    const e = this.evolution();
    const organizations = e.metric === 'organizations';

    return [{ name: organizations ? 'Empresas' : 'Usuarios', color: organizations ? CHART_COLORS.green : CHART_COLORS.blue, values: e.cumulative ?? e.created }];
  });
  protected readonly hasMovement = computed(() => this.evolution().created.some((n) => n > 0));
  protected readonly yearTotal = computed(() => this.evolution().created.reduce((sum, n) => sum + n, 0));
  protected readonly lastCumulative = computed(() => this.evolution().cumulative?.at(-1) ?? 0);
  protected readonly lastCreated = computed(() => this.evolution().created.at(-1) ?? 0);
  protected readonly lastMonth = computed(() => MONTH_NAMES[Math.max(this.evolution().labels.length - 1, 0)]);
  protected readonly best = computed(() => {
    const created = this.evolution().created;
    const count = Math.max(0, ...created);

    return { count, name: MONTH_NAMES[Math.max(created.indexOf(count), 0)].replace(/^./, (c) => c.toUpperCase()) };
  });

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.dash.loadEvolution(this.year(), this.today, true);
  }

  protected go(step: -1 | 1): void {
    const next = this.year() + step;

    if (next > this.currentYear || next < this.currentYear - MAX_YEARS_BACK) return;

    this.year.set(next);
    this.dash.loadEvolution(next, this.today);
  }
}
