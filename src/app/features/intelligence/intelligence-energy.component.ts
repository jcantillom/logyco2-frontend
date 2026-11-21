import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TrendChartComponent } from '../../shared/ui/charts/trend-chart.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { energyChart } from './intelligence-charts';
import { ENERGY_INDICATORS, ENERGY_RANGES, IntelligenceFacade } from './intelligence.facade';
import { formatMoney, formatMonth, formatNumber, formatPct, shortDate } from './intelligence.format';
import { PANEL_STYLES } from './intelligence.styles';

/** «Mercado energético»: histórico de precios de combustibles, su lectura y la comparación entre ciudades. */
@Component({
  selector: 'app-intelligence-energy',
  imports: [ResourceStateComponent, TrendChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    PANEL_STYLES,
    `
      :host { display: block; }
      .filters { display: flex; align-items: center; gap: 8px; font-size: 0.76rem; color: var(--c-mu); }
      .rank { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
      .rank li { border-radius: 10px; }
      .rank li.sel { background: var(--c-row-hover); box-shadow: inset 3px 0 var(--c-primary); }
      .r-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 10px; width: 100%; padding: 8px 10px; border: 0; border-radius: 10px; background: transparent; font: inherit; font-size: 0.78rem; text-align: left; cursor: pointer; transition: background-color 0.15s; }
      .r-row:hover { background: var(--c-row-hover); }
      .r-row:focus-visible { outline: 2px solid var(--c-primary); outline-offset: 1px; }
      .rank .sub { grid-column: 1 / -1; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 10px; color: var(--c-mu); font-size: 0.68rem; }
      .rank-note { margin: 10px 4px 0; color: var(--c-mu); font-size: 0.72rem; }
      .c-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 4px 0 8px; }
      .c-summary > span { display: flex; flex-direction: column; gap: 1px; padding: 8px 10px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-s2); }
      .c-summary small, .c-summary em { color: var(--c-mu); font-size: 0.68rem; font-style: normal; }
      .c-summary b { color: var(--c-head); font-size: 0.86rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .e-sentence { margin: 0 0 10px; color: var(--c-text2); font-size: 0.88rem; line-height: 1.45; }
      .e-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 8px; }
      .e-tile { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-sf); }
      .e-tile span { color: var(--c-mu); font-size: 0.76rem; font-weight: 600; }
      .e-tile strong { color: var(--c-head); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
      .e-tile small { color: var(--c-mu); font-size: 0.7rem; }
      @media (prefers-reduced-motion: reduce) { .r-row { transition: none; } }
      .rank .name { font-weight: 600; color: var(--c-head); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .rank .num { font-variant-numeric: tabular-nums; font-weight: 700; }
      .rank .bar { grid-column: 1 / -1; height: 5px; border-radius: 3px; background: var(--c-s3); overflow: hidden; }
      .rank .bar i { display: block; height: 100%; border-radius: 3px; background: var(--c-primary); }
      @media (min-width: 1101px) and (min-height: 700px) {
        :host { height: 100%; }
      }
    `,
  ],
  template: `
          <div class="split">
            <div class="card panel" data-testid="energy">
              <div class="panel-head">
                <div><h3>Histórico de precios</h3><p>{{ energyUnit() }} · {{ facade.energy.data()?.source?.publisher ?? '' }}</p></div>
                <div class="controls">
                  <div class="seg" role="group" aria-label="Combustible">
                    @for (i of energyOptions; track i.code) { <button type="button" [attr.aria-pressed]="facade.energyCode() === i.code" (click)="facade.selectEnergy(i.code)">{{ i.label }}</button> }
                  </div>
                  <select class="sel" aria-label="Período del histórico" (change)="onEnergyRange($event)">
                    @for (m of energyRanges; track m) { <option [value]="m" [selected]="facade.energyMonths() === m">Últimos {{ m }} meses</option> }
                  </select>
                </div>
              </div>
              @if ((facade.energy.data()?.areas?.length ?? 0) > 1) {
                <label class="filters">Ciudad o departamento
                  <select class="sel" (change)="onEnergyArea($event)" aria-label="Ciudad o departamento">
                    @for (a of facade.energy.data()?.areas ?? []; track a.code) { <option [value]="a.code" [selected]="a.code === facade.energy.data()?.areaCode">{{ a.name }}</option> }
                  </select>
                </label>
              }
              @if (energyStats(); as st) {
                <div class="reading" data-testid="energy-reading">
                  <p class="e-sentence" data-testid="energy-sentence">{{ energySentence() }}</p>
                  <div class="e-tiles">
                    <div class="e-tile"><span>Precio actual</span><strong data-testid="energy-price">{{ money(st.last.value) }}</strong><small>{{ st.unit }}@if (st.since) { · vigente desde {{ st.since }} }</small></div>
                    <div class="e-tile"><span>Último cambio</span><strong data-testid="energy-change">{{ st.change === null ? '—' : st.change === 0 ? 'Sin variación' : pct(st.change) }}</strong><small>{{ st.changeBasis }}</small></div>
                    <div class="e-tile"><span>En el período</span><strong data-testid="energy-window">{{ st.windowPct === null ? '—' : st.windowPct === 0 ? 'Sin variación' : pct(st.windowPct) }}</strong><small>últimos {{ facade.energyMonths() }} meses</small></div>
                    @if (st.vsAverage !== null) { <div class="e-tile"><span>Frente al promedio</span><strong data-testid="energy-vs-average">{{ st.vsAverage === 0 ? 'Igual' : pct(st.vsAverage) }}</strong><small>promedio de {{ st.cities }} ciudades</small></div> }
                  </div>
                </div>
              }
              <div class="chart-box">
                @if (energy.series(); as s) {
                  <app-trend-chart kind="line" [area]="true" [fill]="true" [labelGap]="40" [labels]="energy.labels()" [series]="s" [fitRange]="true" [notes]="energy.notes()" [markLast]="energy.mark()" [ariaLabel]="'Histórico de ' + (facade.energy.data()?.name ?? 'precios')" />
                  <p class="axis-note" data-testid="energy-axis-note">El eje vertical no parte de cero: se ajusta a los datos para que se aprecie la variación.</p>
                } @else {
                  <p class="nodata"><strong>Sin información disponible</strong>{{ energy.emptyHint() }}</p>
                }
              </div>
            </div>
            <div class="card panel" data-testid="cities">
              <div class="panel-head"><div><h3>Comparación entre ciudades</h3><p>{{ facade.cities.data()?.referencePeriod ? month(facade.cities.data()!.referencePeriod) : 'Último período disponible' }}@if (facade.cities.data()?.unit) { · {{ facade.cities.data()!.unit }} }</p></div></div>
              @if (citySummary(); as cs) {
                <div class="c-summary" data-testid="cities-summary">
                  <span><small>Más barata</small><b data-testid="city-cheapest">{{ cs.cheapest.areaName }}</b><em>{{ number(cs.cheapest.value) }}</em></span>
                  <span><small>Más cara</small><b data-testid="city-priciest">{{ cs.priciest.areaName }}</b><em>{{ number(cs.priciest.value) }}</em></span>
                  <span><small>Diferencia</small><b data-testid="city-spread">{{ number(cs.spread) }} %</b><em>entre ambas</em></span>
                </div>
              }
              <div class="scroll">
                @if (sharedError()) { <p class="nodata"><strong>No disponible</strong>Consulta el aviso superior.</p> } @else {
                <app-resource-state [status]="facade.cities.status()" [error]="facade.cities.error()" (retry)="facade.loadAll()">
                  @if (cityRows().length === 0) {
                    <p class="nodata"><strong>Sin información disponible</strong>No hay valores por ciudad o departamento para este indicador.</p>
                  } @else {
                    <ul class="rank">
                      @for (r of cityRows(); track r.areaCode) {
                        <li [class.sel]="r.selected">
                          <button type="button" class="r-row" [attr.aria-pressed]="r.selected" [attr.aria-label]="'Ver el histórico de ' + r.areaName" (click)="selectCity(r.areaCode)">
                            <span class="name">{{ r.areaName }}</span><span class="num">{{ number(r.value) }}</span>
                            <span class="bar" aria-hidden="true"><i [style.width.%]="r.width"></i></span>
                            <span class="sub">
                              @if (r.vsAverage !== null) { <span data-testid="city-vs-average">{{ r.vsAverage === 0 ? 'En el promedio' : pct(r.vsAverage) + ' vs. promedio' }}</span> }
                              @if (r.change !== null && r.change !== 0) { <span class="chg">{{ pct(r.change) }} {{ r.changeLabel }}</span> }
                            </span>
                          </button>
                        </li>
                      }
                    </ul>
                    <p class="rank-note" data-testid="city-note">{{ cityNote() }}</p>
                  }
                </app-resource-state>
                }
              </div>
            </div>
          </div>
  `,
})
export class IntelligenceEnergyComponent {
  protected readonly facade = inject(IntelligenceFacade);
  protected readonly sharedError = this.facade.sharedError;
  protected readonly energy = energyChart(this.facade);
  protected readonly energyOptions = ENERGY_INDICATORS;
  protected readonly energyRanges = ENERGY_RANGES;
  protected readonly energyUnit = computed(() => this.facade.energy.data()?.unit ?? 'COP');

  protected readonly cityRows = computed(() => {
    const rows = [...(this.facade.cities.data()?.rows ?? [])].sort((a, b) => b.value - a.value);
    const values = rows.map((r) => r.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const average = rows.length ? values.reduce((a, b) => a + b, 0) / rows.length : 0;
    const selected = this.facade.energy.data()?.areaCode;

    // Las barras comparan las ciudades entre sí (la más barata al 30 %, la más cara al 100 %): partiendo de cero todas se ven iguales.
    return rows.map((r) => ({
      ...r,
      width: max === min ? 100 : Math.round(30 + 70 * ((r.value - min) / (max - min))),
      vsAverage: rows.length > 1 ? Math.round((r.value / average - 1) * 10_000) / 100 : null,
      change: r.previousPct ?? r.monthlyPct,
      changeLabel: r.previousPct !== null ? 'frente a la publicación anterior' : 'frente al mes anterior',
      selected: r.areaCode === selected,
    }));
  });
  /** Más barata, más cara y cuánto las separa (sobre la más barata). */
  protected readonly citySummary = computed(() => {
    const rows = this.cityRows();

    if (rows.length < 2) return null;

    const priciest = rows[0];
    const cheapest = rows[rows.length - 1];

    return { priciest, cheapest, spread: Math.round((priciest.value / cheapest.value - 1) * 10_000) / 100 };
  });
  protected readonly cityNote = computed(() => {
    const rows = this.cityRows();
    const unchanged = rows.length > 0 && rows.every((r) => r.change === null || r.change === 0);

    return `Las barras comparan las ciudades entre sí y no parten de cero.${unchanged ? ' Ninguna ciudad cambió frente a la publicación anterior.' : ''}`;
  });
  protected selectCity(areaCode: string): void {
    if (areaCode !== this.facade.energy.data()?.areaCode) this.facade.selectEnergyArea(areaCode);
  }
  /** Fecha de vigencia del precio (los combustibles líquidos rigen por fecha; el GNCV es mensual). */
  private energyDate(date: Date): string {
    return this.facade.energyCode() === 'FUEL_GNCV_PRICE' ? formatMonth(date) : shortDate(date);
  }
  /** Lectura del histórico que se está viendo: precio actual, cambios y posición frente al resto de ciudades. */
  protected readonly energyStats = computed(() => {
    const data = this.facade.energy.data();
    const points = data?.points ?? [];
    const last = points.at(-1);

    if (!data || !last) return null;

    const first = points[0];
    const rows = this.cityRows();
    const average = rows.length > 1 ? rows.reduce((a, r) => a + r.value, 0) / rows.length : null;
    const inList = !!data.areaCode && rows.some((r) => r.areaCode === data.areaCode);
    let index = points.length - 1;

    while (index > 0 && points[index - 1].value === last.value) index--;

    return {
      last,
      unit: data.unit,
      since: this.energyDate(last.referencePeriod),
      change: last.previousPct ?? last.monthlyPct,
      changeBasis: last.previousPct !== null ? 'vs. publicación anterior' : 'vs. mes anterior',
      windowPct: points.length > 1 ? Math.round((last.value / first.value - 1) * 10_000) / 100 : null,
      vsAverage: average !== null && inList ? Math.round((last.value / average - 1) * 10_000) / 100 : null,
      cities: rows.length,
      stableSince: index < points.length - 1 ? points[index].referencePeriod : null,
    };
  });
  /** Una frase que resume el precio: cuánto vale y si cambió o lleva tiempo igual. */
  protected readonly energySentence = computed(() => {
    const st = this.energyStats();
    const data = this.facade.energy.data();

    if (!st || !data) return '';

    const per = st.unit.split('/')[1] ?? 'unidad';
    const where = data.areaName ? ` en ${data.areaName}` : '';
    const base = `El precio de referencia de ${this.energy.label()}${where} es ${formatMoney(st.last.value)} por ${per}`;

    if (st.stableSince) return `${base} y no ha cambiado desde el ${this.energyDate(st.stableSince)}.`;

    return st.change !== null && st.change !== 0 ? `${base}; ${formatPct(st.change)} ${st.changeBasis}.` : `${base}.`;
  });

  protected onEnergyArea(event: Event): void {
    this.facade.selectEnergyArea((event.target as HTMLSelectElement).value || null);
  }
  protected onEnergyRange(event: Event): void {
    this.facade.setEnergyMonths(Number((event.target as HTMLSelectElement).value));
  }

  protected readonly money = formatMoney;
  protected readonly number = formatNumber;
  protected readonly pct = formatPct;
  protected readonly month = formatMonth;
}
