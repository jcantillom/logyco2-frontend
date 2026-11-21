import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IndicatorCard, SourceStatus } from '../../domain/models/intelligence';
import { TrendChartComponent } from '../../shared/ui/charts/trend-chart.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { relativeTime } from '../platform/platform-labels';
import { costChart, energyChart } from './intelligence-charts';
import { COST_RANGES, ENERGY_INDICATORS, ENERGY_RANGES, IntelligenceFacade } from './intelligence.facade';
import { formatMoney, formatMonth, formatNumber, formatPct, shortDate, shortMonth } from './intelligence.format';
import { errorLabel, statusLabel, statusOf } from './intelligence.labels';
import { PANEL_STYLES } from './intelligence.styles';

const NO_DATA_HINTS: Readonly<Record<string, string>> = {
  FUEL_ACPM_PRICE: 'Aún no se han adquirido las circulares de precios de referencia de la CREG.',
  FUEL_GASOLINE_PRICE: 'Aún no se han adquirido las circulares de precios de referencia de la CREG.',
  ICTC_TOTAL: 'Aún no se ha adquirido el ICTC del DANE.',
  FUEL_GNCV_PRICE: 'Aún no se han adquirido los precios de datos.gov.co.',
};
const KPI_TITLES: Readonly<Record<string, string>> = { FUEL_ACPM_PRICE: 'ACPM (referencia)', FUEL_GASOLINE_PRICE: 'Gasolina corriente', ICTC_TOTAL: 'ICTC', FUEL_GNCV_PRICE: 'GNCV' };
const SOURCE_BRIEF: Readonly<Record<string, { title: string; desc: string }>> = {
  DANE_ICTC: { title: 'DANE – ICTC', desc: 'Índice de Costos del Transporte de Carga' },
  MINENERGIA_GNCV: { title: 'MinEnergía – GNCV', desc: 'Precios del gas natural vehicular' },
  CREG_FUEL_PRICES: { title: 'CREG – Combustibles', desc: 'Precios de referencia de ACPM y gasolina' },
  SUPERTRANSPORTE_PORTS: { title: 'Supertransporte – Puertos', desc: 'Tráfico portuario por zona portuaria' },
};
const ICON = {
  fuel: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M7 8h6M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3',
  coins: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  leaf: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19c2-5 6-8 10-10',
} as const;
const KPI_ICONS: Readonly<Record<string, string>> = { FUEL_ACPM_PRICE: ICON.fuel, FUEL_GASOLINE_PRICE: ICON.fuel, ICTC_TOTAL: ICON.coins, FUEL_GNCV_PRICE: ICON.leaf };
const BOGOTA = '11001';
type CitySort = 'name' | 'acpm' | 'gasoline' | 'change';

/** Resumen de LoGyCO₂ Intelligence: indicadores destacados, evolución del combustible y del ICTC, precios por ciudad, grupos del ICTC y fuentes. */
@Component({
  selector: 'app-intelligence-overview',
  imports: [DatePipe, RouterLink, ResourceStateComponent, TrendChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    PANEL_STYLES,
    `
      :host { display: block; }
      .ov { display: grid; gap: 12px; grid-template-rows: auto auto auto; }
      .ig-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
      @media (max-width: 1100px) { .ig-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 560px) { .ig-kpis { grid-template-columns: minmax(0, 1fr); } }
      .ig-kpi { display: flex; flex-direction: column; gap: 5px; padding: 10px 14px; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); min-width: 0; }
      .ig-kpi header { display: flex; align-items: center; gap: 10px; }
      .ig-kpi .ttl { min-width: 0; }
      .ig-kpi .ttl h3, .ig-kpi .ttl p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ig-kpi header .val { margin-left: auto; text-align: right; flex: none; }
      .ig-kpi .ico { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 11px; background: var(--c-ok-soft); color: var(--c-accent); }
      .ig-kpi .ico svg { width: 22px; height: 22px; fill: color-mix(in srgb, currentColor 14%, transparent); }
      .ig-kpi h3 { margin: 0; font-size: 0.95rem; color: var(--c-head); }
      .ig-kpi header p { margin: 1px 0 0; font-size: 0.74rem; color: var(--c-mu); }
      .ig-kpi .main { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
      .val strong { display: block; font-size: 1.5rem; line-height: 1.1; letter-spacing: -0.03em; color: var(--c-head); font-variant-numeric: tabular-nums; }
      .val .unit { font-size: 0.76rem; color: var(--c-mu); }
      .vstats { display: grid; grid-template-columns: repeat(auto-fit, minmax(76px, 1fr)); gap: 6px; margin: 0; }
      .vstats div { padding: 4px 8px; border-radius: 9px; background: var(--c-s2); }
      .vstats dt { font-size: 0.62rem; font-weight: 600; color: var(--c-mu); white-space: normal; line-height: 1.15; }
      .vstats dd { margin: 0; font-size: 0.82rem; font-weight: 800; color: var(--c-text2); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .vstats dd.down { color: var(--c-accent); }
      .vstats dd.up { color: var(--c-bad); }
      .sortbtn { all: unset; cursor: pointer; display: inline-flex; flex-direction: column; font-weight: 700; }
      .sortbtn.on { color: var(--c-accent); text-decoration: underline; }
      .sortbtn:focus-visible { outline: 2px solid var(--c-primary); outline-offset: 2px; }
      .cityfilter { width: 100%; box-sizing: border-box; margin: 0 0 6px; padding: 4px 8px; border: 1px solid var(--c-bd); border-radius: 8px; font: inherit; font-size: 0.8rem; }
      .mean { margin: 0; font-size: 0.72rem; font-weight: 600; color: var(--c-head); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .foot { margin: 0; font-size: 0.66rem; color: var(--c-mu); line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .foot a { color: var(--c-accent); }
      .stale { margin: 0; padding: 3px 8px; border-radius: 7px; background: var(--c-warn-soft); color: var(--c-warning); font-size: 0.68rem; }
      .duo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-height: 0; }
      .duo.lean { grid-template-columns: minmax(260px, 0.6fr) minmax(0, 1.4fr); }
      .duo.lean [data-testid='energy-overview'] { align-self: start; }
      .trio { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; min-height: 0; }
      @media (max-width: 1100px) { .duo, .trio { grid-template-columns: minmax(0, 1fr); } }
      .ctable { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
      .ctable th { position: sticky; top: 0; padding: 7px 10px; background: var(--c-s2); font-size: 0.68rem; font-weight: 700; color: var(--c-mu); text-align: right; border-bottom: 1px solid var(--c-bd); }
      .ctable th:first-child, .ctable td:first-child { text-align: left; }
      .ctable th small { display: block; font-weight: 500; }
      .ctable td { padding: 6px 10px; border-bottom: 1px solid var(--c-bd); text-align: right; font-variant-numeric: tabular-nums; color: var(--c-head); }
      .ctable td:first-child { font-weight: 600; }
      .chip { display: inline-block; padding: 1px 8px; border-radius: 999px; background: var(--c-s2); color: var(--c-text2); font-size: 0.7rem; font-weight: 700; }
      .chip.down { background: var(--c-ok-soft); color: var(--c-accent); }
      .chip.up { background: var(--c-s3); color: var(--c-bad); }
      .groups { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
      .groups li { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 54px; align-items: center; gap: 10px; font-size: 0.78rem; }
      .groups .gname { font-weight: 600; color: var(--c-head); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .groups .gbar { height: 14px; border-radius: 4px; background: var(--c-s3); overflow: hidden; }
      .groups .gbar i { display: block; height: 100%; border-radius: 4px; background: var(--c-primary); }
      .groups .gbar i.neg { background: var(--c-gray-300); }
      .groups .gnum { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
      .srcs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
      .srcs li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 0.8rem; }
      .srcs strong { display: block; color: var(--c-head); }
      .srcs span.d { font-size: 0.7rem; color: var(--c-mu); }
      @media (min-width: 1101px) and (min-height: 700px) {
        :host { height: 100%; }
        .ov { height: 100%; grid-template-rows: auto minmax(210px, 1.3fr) minmax(150px, 1fr); }
      }
    `,
  ],
  template: `
          <div class="ov">
            @if (sharedError()) {
              <p class="nodata" data-testid="section-unavailable"><strong>No disponible</strong>El resumen no se pudo cargar: consulta el aviso superior.</p>
            } @else {
              <app-resource-state skeleton="kpis" [status]="facade.summary.status()" [error]="facade.summary.error()" (retry)="facade.loadAll()">
                <div class="ig-kpis" data-testid="featured">
                  @for (c of facade.summary.data()?.featured ?? []; track c.code) {
                    <article class="ig-kpi" [attr.data-indicator]="c.code">
                      <header>
                        <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="kpiIcon(c.code)" /></svg></span>
                        <div class="ttl"><h3>{{ kpiTitle(c) }}</h3>@if (c.status === 'AVAILABLE') { <p>{{ c.areaName }} · {{ shortMonth(c.referencePeriod) }}</p> }</div>
                        @if (c.status === 'AVAILABLE') { <div class="val"><strong data-testid="value">{{ display(c) }}</strong><span class="unit">{{ unitLabel(c) }}</span></div> }
                      </header>
                      @if (c.status === 'AVAILABLE') {
                        @if (c.variation; as v) {
                          <dl class="vstats" aria-label="Variaciones">
                            @if (v.previousDate) {
                              <div><dt [title]="'Variación frente a la publicación anterior (vigente desde ' + shortDate(v.previousDate) + ')'">vs. anterior</dt><dd [class.up]="(v.previousPct ?? 0) > 0" [class.down]="(v.previousPct ?? 0) < 0">{{ pct(v.previousPct) }}</dd></div>
                            } @else {
                              <div><dt title="Variación frente al mes anterior">Mensual</dt><dd [class.up]="(v.monthlyPct ?? 0) > 0" [class.down]="(v.monthlyPct ?? 0) < 0">{{ pct(v.monthlyPct) }}</dd></div>
                            }
                            <div><dt title="Variación frente al mismo mes del año anterior">Anual</dt><dd [class.up]="(v.annualPct ?? 0) > 0" [class.down]="(v.annualPct ?? 0) < 0">{{ pct(v.annualPct) }}</dd></div>
                            <div><dt title="Variación desde diciembre del año anterior">Año corrido</dt><dd [class.up]="(v.yearToDatePct ?? 0) > 0" [class.down]="(v.yearToDatePct ?? 0) < 0">{{ pct(v.yearToDatePct) }}</dd></div>
                          </dl>
                        }
                        <p class="mean" [title]="meaning(c)">{{ meaning(c) }}</p>
                        <p class="foot" [title]="detail(c)">
                          @if (c.sourceReference) {
                            Vigente desde {{ shortDate(c.validFrom ?? c.referencePeriod) }} · <a [href]="c.sourceUrl ?? c.source.url" target="_blank" rel="noopener noreferrer">{{ c.source.publisher }} · {{ c.sourceReference }}</a>
                          } @else {
                            Período {{ month(c.referencePeriod) }} · Fuente <a [href]="c.source.url" target="_blank" rel="noopener noreferrer">{{ c.source.publisher }}</a>
                          }
                          @if (c.publishedAt) { · Publ. {{ c.publishedAt | date: 'd MMM y' }} } · Adq. {{ c.acquiredAt ? ago(c.acquiredAt) : '—' }}
                        </p>
                        @if (c.lastErrorCode) { <p class="stale" role="status">La última actualización falló ({{ errorLabel(c.lastErrorCode) }}). Se muestra el último dato válido.</p> }
                      } @else {
                        <p class="nodata" data-testid="no-data"><strong>Sin información disponible</strong>{{ hint(c) }}</p>
                      }
                    </article>
                  }
                </div>
              </app-resource-state>
            }

            <div class="duo" [class.lean]="energyEmpty()">
              <div class="card panel" data-testid="energy-overview">
                <div class="panel-head">
                  <div><h3>Evolución del precio del {{ energy.label() }}</h3><p>{{ energySubtitle() }}</p></div>
                  <div class="controls">
                    <div class="seg" role="group" aria-label="Combustible">
                      @for (i of energyOptions; track i.code) { <button type="button" [attr.aria-pressed]="facade.energyCode() === i.code" (click)="facade.selectEnergy(i.code)">{{ i.label }}</button> }
                    </div>
                    <select class="sel" aria-label="Período" (change)="onEnergyRange($event)">
                      @for (m of energyRanges; track m) { <option [value]="m" [selected]="facade.energyMonths() === m">Últimos {{ m }} meses</option> }
                    </select>
                  </div>
                </div>
                @if (energyEmpty() && !sharedError()) {
                  <p class="nodata" data-testid="energy-empty"><strong>Sin información disponible</strong>{{ energy.emptyHint() }}</p>
                } @else {
                <div class="chart-box">
                  @if (sharedError()) { <p class="nodata"><strong>No disponible</strong>Consulta el aviso superior.</p> } @else {
                    <app-resource-state [grow]="true" skeleton="chart" [status]="facade.energy.status()" [error]="facade.energy.error()" (retry)="facade.selectEnergy(facade.energyCode())">
                      @if (energy.series(); as s) {
                        <app-trend-chart kind="line" [area]="true" [fill]="true" [labelGap]="40" [labels]="energy.labels()" [series]="s" [fitRange]="true" [notes]="energy.notes()" [markLast]="energy.mark()" [ariaLabel]="'Evolución de ' + (facade.energy.data()?.name ?? 'precios')" />
                      } @else {
                        <p class="nodata" data-testid="energy-empty"><strong>Sin información disponible</strong>{{ energy.emptyHint() }}</p>
                      }
                    </app-resource-state>
                  }
                </div>
                }
              </div>
              <div class="card panel" data-testid="costs-overview">
                <div class="panel-head">
                  <div><h3>Evolución del ICTC</h3><p>Índice de costos del transporte de carga por carretera</p></div>
                  <select class="sel" aria-label="Período" (change)="onCostRange($event)">
                    @for (m of costRanges; track m) { <option [value]="m" [selected]="facade.costMonths() === m">Últimos {{ m }} meses</option> }
                  </select>
                </div>
                <div class="chart-box">
                  @if (sharedError()) { <p class="nodata"><strong>No disponible</strong>Consulta el aviso superior.</p> } @else {
                    <app-resource-state [grow]="true" skeleton="chart" [status]="facade.costs.status()" [error]="facade.costs.error()" (retry)="facade.selectCost(facade.costCode())">
                      @if (cost.series(); as s) {
                        <app-trend-chart kind="line" [area]="true" [fill]="true" [labelGap]="40" [labels]="cost.labels()" [series]="s" [markLast]="cost.mark()" [ariaLabel]="'Evolución de ' + (facade.costs.data()?.name ?? 'ICTC')" />
                      } @else {
                        <p class="nodata"><strong>Sin información disponible</strong>Aún no se ha adquirido el ICTC del DANE.</p>
                      }
                    </app-resource-state>
                  }
                </div>
              </div>
            </div>

            <div class="trio">
              <div class="card panel" data-testid="city-table">
                <div class="panel-head"><div><h3>{{ cityCardTitle() }}</h3><p>Último dato disponible · {{ cityPeriod() }}</p></div></div>
                <div class="scroll">
                  @if (cityTable().length === 0 && gncvTable().length > 0) {
                    <table class="ctable" data-testid="gncv-table">
                      <thead><tr><th scope="col">Departamento</th><th scope="col">GNCV<small>(COP/m³)</small></th><th scope="col">Variación mensual</th></tr></thead>
                      <tbody>
                        @for (r of gncvTable(); track r.code) {
                          <tr><td>{{ r.name }}</td><td>{{ money(r.value) }}</td>
                            <td>@if (r.pct === null) { — } @else { <span class="chip" [class.down]="r.pct < 0" [class.up]="r.pct > 0">{{ pct(r.pct) }}</span> }</td></tr>
                        }
                      </tbody>
                    </table>
                  } @else if (cityTable().length === 0) {
                    <p class="nodata"><strong>Sin información disponible</strong>Aún no hay una publicación oficial de ACPM y gasolina por ciudad que se pueda leer automáticamente.</p>
                  } @else {
                    <input class="cityfilter" type="search" placeholder="Filtrar ciudad" aria-label="Filtrar por ciudad" [value]="cityFilter()" (input)="onCityFilter($event)" data-testid="city-filter" />
                    <table class="ctable">
                      <thead><tr>
                        <th scope="col"><button type="button" class="sortbtn" [class.on]="citySort() === 'name'" (click)="setCitySort('name')">Ciudad</button></th>
                        <th scope="col"><button type="button" class="sortbtn" [class.on]="citySort() === 'acpm'" (click)="setCitySort('acpm')" title="Ordenar por precio del ACPM">ACPM<small>(COP/galón)</small></button></th>
                        <th scope="col"><button type="button" class="sortbtn" [class.on]="citySort() === 'gasoline'" (click)="setCitySort('gasoline')" title="Ordenar por precio de la gasolina">Gasolina<small>(COP/galón)</small></button></th>
                        <th scope="col"><button type="button" class="sortbtn" [class.on]="citySort() === 'change'" (click)="setCitySort('change')" title="Variación del ACPM frente a la publicación anterior; ordenar">Var. ACPM</button></th>
                      </tr></thead>
                      <tbody>
                        @for (r of cityTable(); track r.code) {
                          <tr><td>{{ r.name }}</td><td>{{ r.acpm === null ? '—' : money(r.acpm) }}</td><td>{{ r.gasoline === null ? '—' : money(r.gasoline) }}</td>
                            <td>@if (r.acpmPct === null) { — } @else { <span class="chip" [class.down]="r.acpmPct < 0" [class.up]="r.acpmPct > 0">{{ pct(r.acpmPct) }}</span> }</td></tr>
                        }
                      </tbody>
                    </table>
                  }
                </div>
                <a class="link" routerLink="/intelligence/energia">Ver todas las ciudades →</a>
              </div>

              <div class="card panel" data-testid="groups">
                <div class="panel-head"><div><h3>ICTC por grupo de costos</h3><p>Variación mensual · {{ groupPeriod() }}</p></div></div>
                <div class="scroll">
                  @if (groupRows().length === 0) {
                    <p class="nodata"><strong>Sin información disponible</strong>Aún no se ha adquirido el ICTC del DANE.</p>
                  } @else {
                    <ul class="groups">
                      @for (g of groupRows(); track g.code) {
                        <li><span class="gname">{{ g.name }}</span><span class="gbar" aria-hidden="true"><i [class.neg]="(g.monthlyPct ?? 0) < 0" [style.width.%]="g.width"></i></span><span class="gnum">{{ pct(g.monthlyPct) }}</span></li>
                      }
                    </ul>
                  }
                </div>
                <a class="link" routerLink="/intelligence/costos">Ver detalle del ICTC →</a>
              </div>

              <div class="card panel" data-testid="sources-brief">
                <div class="panel-head"><div><h3>Fuentes de datos</h3><p>Estado y última actualización</p></div></div>
                <div class="scroll">
                  <ul class="srcs">
                    @for (s of facade.sources.data() ?? []; track s.code) {
                      <li>
                        <div><strong>{{ brief(s).title }}</strong><span class="d">{{ brief(s).desc }}</span></div>
                        <span class="pill" [class.ok]="statusOf(s) === 'ok'" [class.err]="statusOf(s) === 'err'">
                          {{ statusLabel(s) }}@if (s.lastSuccessAt && !s.lastErrorCode) { <small>{{ s.lastSuccessAt | date: 'd MMM y' }}</small> }
                        </span>
                      </li>
                    }
                  </ul>
                </div>
                <button type="button" class="link" (click)="sources.emit()">Gestionar fuentes y actualizaciones →</button>
              </div>
            </div>
          </div>
  `,
})
export class IntelligenceOverviewComponent {
  protected readonly facade = inject(IntelligenceFacade);
  protected readonly sharedError = this.facade.sharedError;
  /** Pide abrir el diálogo «Fuentes y actualización». */
  readonly sources = output<void>();
  protected readonly energy = energyChart(this.facade);
  protected readonly cost = costChart(this.facade);
  protected readonly energyOptions = ENERGY_INDICATORS;
  protected readonly energyRanges = ENERGY_RANGES;
  protected readonly costRanges = COST_RANGES;

  /** El combustible elegido ya cargó y no tiene datos: la tarjeta se compacta y el ICTC aprovecha el espacio. */
  protected readonly energyEmpty = computed(() => this.facade.energy.status() === 'ready' && !this.energy.series());
  protected readonly energySubtitle = computed(() => {
    const data = this.facade.energy.data();

    return data ? `${data.areaName ?? ''}${data.areaName ? ' · ' : ''}${data.unit}` : 'Precio de referencia';
  });

  /** Tabla del resumen: ACPM y gasolina por ciudad (Bogotá primero), unidas por código de municipio. */
  protected readonly citySort = signal<CitySort>('name');
  protected readonly cityFilter = signal('');
  protected setCitySort(key: CitySort): void {
    this.citySort.set(key);
  }
  protected onCityFilter(event: Event): void {
    this.cityFilter.set((event.target as HTMLInputElement).value);
  }
  protected readonly cityTable = computed(() => {
    const term = this.cityFilter().trim().toLowerCase();
    const sort = this.citySort();
    const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const num = (v: number | null) => v ?? Number.NEGATIVE_INFINITY;

    return this.cityTableAll()
      .filter((r) => fold(r.name).includes(fold(term)))
      .sort((x, y) =>
        sort === 'acpm' ? num(y.acpm) - num(x.acpm)
        : sort === 'gasoline' ? num(y.gasoline) - num(x.gasoline)
        : sort === 'change' ? num(y.acpmPct) - num(x.acpmPct)
        : x.code === BOGOTA ? -1 : y.code === BOGOTA ? 1 : x.name.localeCompare(y.name, 'es'),
      );
  });
  private readonly cityTableAll = computed(() => {
    const acpm = this.facade.acpmAreas.data()?.rows ?? [];
    const gasoline = this.facade.gasolineAreas.data()?.rows ?? [];
    const codes = [...new Set([...acpm.map((r) => r.areaCode), ...gasoline.map((r) => r.areaCode)])];

    return codes
      .map((code) => {
        const a = acpm.find((r) => r.areaCode === code);
        const g = gasoline.find((r) => r.areaCode === code);

        return { code, name: a?.areaName ?? g?.areaName ?? code, acpm: a?.value ?? null, gasoline: g?.value ?? null, acpmPct: a?.previousPct ?? a?.monthlyPct ?? null };
      })
      ;
  });
  /** Si no hay precios de ACPM ni de gasolina por ciudad, la tarjeta muestra lo que sí hay: el GNCV por departamento. */
  protected readonly gncvTable = computed(() =>
    [...(this.facade.gncvAreas.data()?.rows ?? [])]
      .sort((a, b) => a.areaName.localeCompare(b.areaName, 'es'))
      .map((r) => ({ code: r.areaCode, name: r.areaName, value: r.value, pct: r.monthlyPct })),
  );
  protected readonly cityCardTitle = computed(() =>
    this.cityTable().length === 0 && this.gncvTable().length > 0 ? 'Precio del GNCV por departamento' : 'Precio de combustibles por ciudad',
  );
  protected readonly cityPeriod = computed(() => {
    const fallback = this.cityTable().length === 0 && this.gncvTable().length > 0;

    return formatMonth(
      fallback
        ? (this.facade.gncvAreas.data()?.referencePeriod ?? null)
        : (this.facade.acpmAreas.data()?.referencePeriod ?? this.facade.gasolineAreas.data()?.referencePeriod ?? null),
    );
  });
  protected readonly groupPeriod = computed(() => formatMonth(this.facade.groups.data()?.referencePeriod ?? null));
  protected readonly groupRows = computed(() => {
    const items = this.facade.groups.data()?.items ?? [];
    const max = Math.max(0.01, ...items.map((g) => Math.abs(g.monthlyPct ?? 0)));

    return items.map((g) => ({ ...g, width: Math.max(4, Math.round((Math.abs(g.monthlyPct ?? 0) / max) * 100)) }));
  });

  protected kpiTitle(card: IndicatorCard): string {
    return KPI_TITLES[card.code] ?? card.name;
  }
  protected kpiIcon(code: string): string {
    return KPI_ICONS[code] ?? ICON.coins;
  }
  protected brief(source: SourceStatus): { title: string; desc: string } {
    return SOURCE_BRIEF[source.code] ?? { title: source.name, desc: source.publisher };
  }
  /** Valor principal: los precios en pesos con «$» y sin decimales; los índices con dos decimales. */
  protected display(card: IndicatorCard): string {
    return card.unit.startsWith('COP') ? formatMoney(card.value ?? 0) : formatNumber(card.value);
  }
  /** Qué significa el valor, en una línea (el índice se compara con su base; los precios, con su definición). */
  protected meaning(card: IndicatorCard): string {
    if (card.code === 'ICTC_TOTAL' && card.value !== null) {
      const gap = Math.round((card.value - 100) * 10) / 10;

      return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(Math.abs(gap))} % ${gap >= 0 ? 'por encima' : 'por debajo'} de la base (dic. 2015 = 100)`;
    }

    return card.code === 'FUEL_GNCV_PRICE'
      ? 'Promedio simple de los precios publicados por las estaciones (no es un precio nacional oficial único)'
      : 'Precio de referencia (CREG) por galón; sigue vigente hasta una nueva circular';
  }
  protected unitLabel(card: IndicatorCard): string {
    return card.unit;
  }
  protected detail(card: IndicatorCard): string {
    return `${card.name} · ${formatMonth(card.referencePeriod)} · ${card.source.name}${card.validFrom ? ' · vigente desde ' + card.validFrom.toLocaleDateString('es-CO') : ''}`;
  }
  protected hint(card: IndicatorCard): string {
    return NO_DATA_HINTS[card.code] ?? 'Esta fuente aún no ha publicado datos en LoGyCO₂ Intelligence.';
  }
  protected ago(moment: Date): string {
    return relativeTime(moment);
  }
  protected onEnergyRange(event: Event): void {
    this.facade.setEnergyMonths(Number((event.target as HTMLSelectElement).value));
  }
  protected onCostRange(event: Event): void {
    this.facade.setCostMonths(Number((event.target as HTMLSelectElement).value));
  }

  protected readonly errorLabel = errorLabel;
  protected readonly statusOf = statusOf;
  protected readonly statusLabel = statusLabel;
  protected readonly money = formatMoney;
  protected readonly pct = formatPct;
  protected readonly month = formatMonth;
  protected readonly shortDate = shortDate;
  protected readonly shortMonth = shortMonth;
}
