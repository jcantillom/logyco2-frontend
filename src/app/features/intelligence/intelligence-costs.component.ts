import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TrendChartComponent } from '../../shared/ui/charts/trend-chart.component';
import { costChart } from './intelligence-charts';
import { COST_INDICATORS, COST_RANGES, IntelligenceFacade } from './intelligence.facade';
import { formatMonth, formatNumber, formatPct } from './intelligence.format';
import { PANEL_STYLES } from './intelligence.styles';

/** «Costos de transporte»: evolución del ICTC por grupo de costos y lectura del índice. */
@Component({
  selector: 'app-intelligence-costs',
  imports: [TrendChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    PANEL_STYLES,
    `
      :host { display: block; }
      .r-hero { padding: 14px 16px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); }
      .r-label { color: var(--c-mu); font-size: 0.78rem; font-weight: 700; }
      .r-value { display: flex; align-items: baseline; gap: 10px; margin: 2px 0 8px; }
      .r-value strong { color: var(--c-head); font-size: 2.1rem; line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
      .r-value small { color: var(--c-mu); font-size: 0.8rem; }
      .r-sentence { margin: 0; color: var(--c-text2); font-size: 0.86rem; line-height: 1.45; }
      .r-sentence b { color: var(--c-head); }
      .r-base { margin: 6px 0 0; color: var(--c-mu); font-size: 0.74rem; }
      .r-changes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .r-chg { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-sf); }
      .r-chg span { color: var(--c-mu); font-size: 0.76rem; font-weight: 600; }
      .r-chg strong { color: var(--c-head); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
      .r-chg small { color: var(--c-mu); font-size: 0.7rem; }
      .r-range { padding: 12px 14px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-sf); }
      .r-range h4 { margin: 0 0 14px; color: var(--c-head); font-size: 0.84rem; }
      .r-bar { position: relative; height: 8px; border-radius: 999px; background: linear-gradient(90deg, var(--c-s3), var(--c-primary-200)); }
      .r-marker { position: absolute; top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px; border: 3px solid var(--c-sf); border-radius: 50%; background: var(--c-primary); box-shadow: 0 1px 4px color-mix(in srgb, var(--c-gray) 40%, transparent); }
      .r-bounds { display: flex; justify-content: space-between; gap: 12px; margin-top: 12px; }
      .r-bounds > span { display: flex; flex-direction: column; gap: 1px; }
      .r-bounds .r-max { align-items: flex-end; text-align: right; }
      .r-bounds b { color: var(--c-head); font-size: 1rem; font-variant-numeric: tabular-nums; }
      .r-bounds small, .r-window small { color: var(--c-mu); font-size: 0.7rem; }
      .r-where { margin: 12px 0 0; color: var(--c-head); font-size: 0.82rem; font-weight: 600; }
      .r-window { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--c-bd); color: var(--c-mu); font-size: 0.8rem; }
      .r-window span { display: flex; flex-direction: column; gap: 1px; }
      .r-window strong { color: var(--c-head); font-size: 1.05rem; font-variant-numeric: tabular-nums; }
      @media (min-width: 1101px) and (min-height: 700px) {
        :host { height: 100%; }
      }
    `,
  ],
  template: `
          <div class="split">
            <div class="card panel" data-testid="costs">
              <div class="panel-head wrap">
                <div><h3>Evolución del ICTC</h3><p data-testid="cost-context">{{ costContext() }}</p></div>
                <div class="controls">
                  <div class="seg" role="group" aria-label="Grupo de costos">
                    @for (i of costOptions; track i.code) { <button type="button" [attr.aria-pressed]="facade.costCode() === i.code" (click)="facade.selectCost(i.code)">{{ i.label }}</button> }
                  </div>
                  <select class="sel" aria-label="Período del ICTC" (change)="onCostRange($event)">
                    @for (m of costRanges; track m) { <option [value]="m" [selected]="facade.costMonths() === m">Últimos {{ m }} meses</option> }
                  </select>
                </div>
              </div>
              <div class="chart-box">
                @if (cost.series(); as s) {
                  <app-trend-chart kind="line" [area]="true" [fill]="true" [fitRange]="true" [labelGap]="40" [labels]="cost.labels()" [series]="s" [markLast]="cost.mark()" [ariaLabel]="'Evolución de ' + (facade.costs.data()?.name ?? 'ICTC')" />
                } @else {
                  <p class="nodata" data-testid="costs-empty"><strong>Sin información disponible</strong>Aún no se ha adquirido el ICTC del DANE.</p>
                }
                @if (cost.series()) { <p class="axis-note" data-testid="axis-note">El eje vertical no parte de cero: se ajusta a los datos para que se aprecie la variación.</p> }
              </div>
            </div>
            <div class="card panel" data-testid="cost-stats">
              <div class="panel-head"><div><h3>Lectura del índice</h3><p>Índice base dic. 2015 = 100 · DANE</p></div></div>
              @if (costStats(); as st) {
                <div class="reading">
                  <div class="r-hero">
                    <span class="r-label">Índice actual</span>
                    <div class="r-value"><strong data-testid="cost-last">{{ number(st.last.value) }}</strong><small>{{ month(st.last.date) }}</small></div>
                    @if (baseDelta(); as delta) {
                      <p class="r-sentence" data-testid="cost-sentence">{{ costSubject() }} <b>{{ number(absolute(delta)) }} % {{ delta > 0 ? 'por encima' : 'por debajo' }}</b> de diciembre de 2015.</p>
                    }
                    <p class="r-base">Base: diciembre de 2015 = 100.</p>
                  </div>
                  <div class="r-changes">
                    <div class="r-chg"><span>Último mes</span><strong data-testid="cost-monthly">{{ pct(st.monthlyPct) }}</strong><small>vs. mes anterior</small></div>
                    <div class="r-chg"><span>Últimos 12 meses</span><strong data-testid="cost-annual">{{ pct(st.annualPct) }}</strong><small>vs. hace 12 meses</small></div>
                  </div>
                  <div class="r-range" data-testid="cost-range">
                    <h4>En los últimos {{ facade.costMonths() }} meses</h4>
                    <div class="r-bar" role="img" [attr.aria-label]="costPosition().text"><span class="r-marker" [style.left.%]="costPosition().percent"></span></div>
                    <div class="r-bounds">
                      <span><small>Mínimo</small><b data-testid="cost-min">{{ number(st.min.value) }}</b><small>{{ month(st.min.date) }}</small></span>
                      <span class="r-max"><small>Máximo</small><b data-testid="cost-max">{{ number(st.max.value) }}</b><small>{{ month(st.max.date) }}</small></span>
                    </div>
                    <p class="r-where" data-testid="cost-where">{{ costPosition().text }}</p>
                    <div class="r-window"><span>Cambio en el período<small>{{ month(st.first.date) }} → {{ month(st.last.date) }}</small></span><strong data-testid="cost-window">{{ pct(st.windowPct) }}</strong></div>
                  </div>
                </div>
              } @else {
                <p class="nodata"><strong>Sin información disponible</strong>Aún no se ha adquirido el ICTC del DANE.</p>
              }
            </div>
          </div>
  `,
})
export class IntelligenceCostsComponent {
  protected readonly facade = inject(IntelligenceFacade);
  protected readonly cost = costChart(this.facade);
  protected readonly costOptions = COST_INDICATORS;
  protected readonly costRanges = COST_RANGES;

  /** Qué se está viendo en el gráfico: el grupo de costos y el período. */
  protected readonly costContext = computed(() => {
    const group = this.costOptions.find((o) => o.code === this.facade.costCode())?.label ?? 'Total nacional';

    return `${group} · últimos ${this.facade.costMonths()} meses`;
  });
  /** Cuánto por encima (o por debajo) de la base (dic. 2015 = 100) está el último dato, en %. */
  protected readonly baseDelta = computed(() => {
    const last = this.facade.costs.data()?.points.at(-1);

    return last ? Math.round((last.value / 100 - 1) * 10_000) / 100 : null;
  });
  /** Dónde está el último dato entre el mínimo y el máximo de la ventana (0–100) y cómo se lee. */
  protected readonly costPosition = computed(() => {
    const stats = this.costStats();

    if (!stats) return { percent: 50, text: '' };

    const span = stats.max.value - stats.min.value;
    const percent = span === 0 ? 50 : Math.min(100, Math.max(0, ((stats.last.value - stats.min.value) / span) * 100));
    const text = span === 0 ? 'El índice se mantuvo estable en el período' : percent >= 85 ? 'El último dato está cerca del máximo del período' : percent <= 15 ? 'El último dato está cerca del mínimo del período' : 'El último dato está en la zona media del período';

    return { percent: Math.round(percent), text };
  });
  /** Sujeto de la frase de lectura: el total del transporte o el grupo de costos elegido. */
  protected readonly costSubject = computed(() => {
    const code = this.facade.costCode();
    const group = this.costOptions.find((o) => o.code === code);

    return !group || code === COST_INDICATORS[0].code ? 'Los costos del transporte de carga están' : `El grupo «${group.label}» está`;
  });
  protected absolute(value: number): number {
    return Math.abs(value);
  }
  /** Lectura de la serie del ICTC que se está viendo (calculada con los puntos ya cargados). */
  protected readonly costStats = computed(() => {
    const points = this.facade.costs.data()?.points ?? [];
    const last = points.at(-1);

    if (!last || points.length < 2) return null;

    const at = (p: (typeof points)[number]) => ({ value: p.value, date: p.referencePeriod });
    const max = points.reduce((a, b) => (b.value > a.value ? b : a));
    const min = points.reduce((a, b) => (b.value < a.value ? b : a));

    return {
      last: at(last), first: at(points[0]), max: at(max), min: at(min),
      monthlyPct: last.monthlyPct, annualPct: last.annualPct,
      windowPct: Math.round((last.value / points[0].value - 1) * 10_000) / 100,
    };
  });

  protected onCostRange(event: Event): void {
    this.facade.setCostMonths(Number((event.target as HTMLSelectElement).value));
  }

  protected readonly number = formatNumber;
  protected readonly pct = formatPct;
  protected readonly month = formatMonth;
}
