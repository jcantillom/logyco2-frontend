import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ResourceStatus } from '../../core/org/scoped-resource';
import { FootprintBucket } from '../../domain/models/footprint';
import { GRANULARITIES, GRANULARITY_TEXT, Granularity, parseGranularity } from '../../domain/models/granularity';
import { BarChartComponent } from '../../shared/ui/charts/bar-chart.component';
import { formatKgCo2 } from '../../shared/ui/footprint.format';
import { FootprintSeriesTableComponent } from './footprint-series-table.component';
import { NO_TRIPS_IN_PERIOD, hasSeriesData, seriesAnnouncement, seriesBars, seriesTitle } from './footprint-series.view';
import { HEADER_CHIP_STYLES } from '../../shared/ui/icon-chip.styles';
import { CHART_CARD_STYLES } from './chart-card.styles';
import { NO_CALCULATION } from './emissions-charts.view';

const BARS = 'M5 20V11M12 20V4M19 20v-6M3 20h18';
let nextId = 0;

/**
 * Tarjeta «Emisiones de CO₂ por {día|semana|mes|trimestre|semestre|año}» (barras con tendencia o tabla de los mismos datos). Sigue el periodo y la granularidad
 * elegidos: el eje X son las cubetas de `series` tal como las entrega el servidor (las vacías en 0, las parciales marcadas) y el total es `seriesTotalKg`; la
 * interfaz solo muestra, nunca calcula emisiones. Presentacional: `series` es `null` si aún no se pidió la huella (estado pendiente, sin dibujar nada); con
 * huella pero sin viajes calculados dice «Sin viajes calculados en este periodo» y, si existe, por qué (`emptyText`). Un resultado parcial lleva el marcador «Parcial».
 */
@Component({
  selector: 'app-monthly-emissions-card',
  imports: [BarChartComponent, FootprintSeriesTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    HEADER_CHIP_STYLES,
    CHART_CARD_STYLES,
    `
      .cc .meta { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .cc .meta p { flex: none; }
      .cc .meta p.warn { flex: 1 1 0; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cc .meta .pchip { min-width: 0; padding: 0 8px; font-size: 0.68rem; overflow: hidden; text-overflow: ellipsis; }
      .cc .meta .pchip.partial { flex: none; }
      .cc .ht p.warn { color: var(--c-danger); font-weight: 600; }
      .cc .hdr { gap: 8px; }
      .cc h2 { font-size: 0.95rem; }
      .cc .ctl { flex: none; display: flex; align-items: center; gap: 4px; }
      .cc select.gran { height: 26px; max-width: 96px; padding: 0 2px; border: 1px solid var(--c-bd); border-radius: 8px; background: var(--c-sf); color: var(--c-head); font: inherit; font-size: 0.74rem; font-weight: 600; cursor: pointer; }
      .cc select.gran:focus-visible, .cc .seg button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .cc .seg { display: inline-flex; border: 1px solid var(--c-bd); border-radius: 8px; overflow: hidden; }
      .cc .seg button { display: grid; place-items: center; width: 26px; height: 24px; padding: 0; border: 0; background: var(--c-sf); color: var(--c-text2); cursor: pointer; }
      .cc .seg button[aria-checked='true'] { background: color-mix(in srgb, var(--c-primary) 20%, var(--c-sf)); color: var(--c-head); }
      .cc .seg svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    `,
  ],
  template: `
    <section class="cc" aria-labelledby="mc-title" data-testid="monthly-card">
      <header class="hdr">
        <span class="ico chip" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon" /></svg></span>
        <div class="ht">
          <h2 id="mc-title">{{ title() }}</h2>
          <div class="meta">
            @if (notice(); as message) { <p class="warn" role="alert" [attr.title]="message" data-testid="granularity-notice">{{ message }}</p> } @else {
              <p data-testid="chart-subtitle">{{ subtitle() }}</p>
              @if (partial()) { <span class="pchip partial" data-testid="chart-partial" [attr.title]="partialHint()">Parcial</span> }
              @if (periodLabel(); as label) { <span class="pchip" data-testid="chart-period" [attr.title]="label">{{ label }}</span> }
            }
          </div>
        </div>
        @if (showControls()) {
          <div class="ctl">
            <select class="gran" [attr.aria-label]="'Granularidad de la serie'" [attr.aria-describedby]="disabledHint() ? hintId : null" [attr.title]="disabledHint()" (change)="choose($any($event.target).value)" data-testid="granularity-select">
              @for (g of granularities; track g) { <option [value]="g" [selected]="g === granularity()" [disabled]="disabled().includes(g)">{{ text[g].option }}</option> }
            </select>
            @if (disabledHint(); as hint) { <span class="sr-only" [attr.id]="hintId" data-testid="granularity-hint">{{ hint }}</span> }
            @if (state() === 'chart') {
              <div class="seg" role="radiogroup" aria-label="Vista de la serie" data-testid="view-switch">
                <button type="button" role="radio" [attr.aria-checked]="view() === 'chart'" [attr.tabindex]="view() === 'chart' ? 0 : -1" aria-label="Gráfico" title="Gráfico" (click)="view.set('chart')" (keydown)="onViewKey($event)" data-testid="view-chart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11M12 20V4M19 20v-6" /></svg></button>
                <button type="button" role="radio" [attr.aria-checked]="view() === 'table'" [attr.tabindex]="view() === 'table' ? 0 : -1" aria-label="Tabla" title="Tabla" (click)="view.set('table')" (keydown)="onViewKey($event)" data-testid="view-table"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16M10 6v12" /></svg></button>
              </div>
            }
          </div>
        }
        @if (partialHint()) { <span class="sr-only" data-testid="chart-partial-hint">{{ partialHint() }}</span> }
        <span class="sr-only" aria-live="polite" data-testid="series-live">{{ announcement() }}</span>
      </header>
      <div class="body">
        @switch (status()) {
          @case ('error') { <p class="err" role="alert" data-testid="chart-error">No se pudo cargar. <button type="button" (click)="retry.emit()">Reintentar</button></p> }
          @case ('ready') {
            @if (state() === 'chart' && view() === 'table') {
              <app-footprint-series-table [series]="buckets()" [totalKg]="seriesTotalKg() ?? 0" [caption]="chartTitle()" />
            } @else if (state() === 'chart') {
              <app-bar-chart [data]="bars()" [title]="chartTitle()" seriesName="Emisiones (kg CO₂)" trendName="Tendencia" />
            } @else {
              <div class="frame" data-testid="chart-empty">
                <div class="plot" aria-hidden="true" data-testid="bar-frame">
                  <i style="top: 20%"></i><i style="top: 50%"></i><i style="top: 80%"></i>
                </div>
                @if (slotLabels().length > 0) { <div class="months" [class.all]="slotLabels().length <= 6" aria-hidden="true" data-testid="frame-months">@for (label of slotLabels(); track $index) { <span>{{ label }}</span> }</div> }
                <p class="note" role="status" data-testid="chart-message">{{ message() }}</p>
              </div>
            }
          }
          @default { <span class="skeleton" style="height: 150px" role="status" aria-busy="true" data-testid="chart-skeleton"><span class="sr-only">Cargando…</span></span> }
        }
      </div>
    </section>
  `,
})
export class MonthlyEmissionsCardComponent {
  readonly periodLabel = input<string | null>(null);
  /** El resultado es parcial (hay viajes sin calcular): se marca junto al periodo. */
  readonly partial = input(false);
  /** Aclaración del resultado parcial (cobertura por viajes), para `title` y lectores de pantalla. */
  readonly partialHint = input<string | null>(null);
  /** Texto del estado vacío cuando hay huella pero ningún viaje calculado (explica por qué); `null` = el genérico. */
  readonly emptyText = input<string | null>(null);
  /** Serie por granularidad del servidor (cubetas contiguas, las vacías en 0); `null` mientras no se haya pedido la huella. */
  readonly series = input<readonly FootprintBucket[] | null>(null);
  /** `series_total_kg` del servidor: el total de la serie (no una suma de cubetas). */
  readonly seriesTotalKg = input<number | null>(null);
  readonly granularity = input<Granularity>('month');
  /** Granularidades que el servidor ya rechazó para un periodo así de largo (y las más finas): van deshabilitadas con su explicación. */
  readonly disabled = input<readonly Granularity[]>([]);
  /** Mensaje del servidor cuando la granularidad pedida no se pudo usar (ya se volvió a la anterior). */
  readonly notice = input<string | null>(null);
  readonly status = input<ResourceStatus>('ready');
  readonly retry = output();
  readonly granularityChange = output<Granularity>();

  protected readonly icon = BARS;
  protected readonly pendingText = NO_CALCULATION;
  protected readonly granularities = GRANULARITIES;
  protected readonly text = GRANULARITY_TEXT;
  protected readonly hintId = `mc-gran-hint-${nextId++}`;
  protected readonly view = signal<'chart' | 'table'>('chart');
  protected readonly buckets = computed(() => this.series() ?? []);
  protected readonly bars = computed(() => seriesBars(this.buckets()));
  protected readonly title = computed(() => seriesTitle(this.granularity()));
  protected readonly chartTitle = computed(() => `Emisiones por ${GRANULARITY_TEXT[this.granularity()].unit}`);
  /** Los controles se ven con datos o mientras se carga (sin saltos de diseño); no con la huella sin pedir. */
  protected readonly showControls = computed(() => this.status() !== 'ready' || this.series() !== null);
  /** Apoyo corto (cabe junto al periodo al ancho de la tarjeta): el total del servidor, o la unidad si no hay serie con datos. */
  protected readonly subtitle = computed(() => {
    const total = this.seriesTotalKg();

    return this.state() === 'chart' && total !== null ? `Total ${formatKgCo2(total)} kg` : 'Kg de CO₂';
  });
  protected readonly disabledHint = computed(() => {
    const names = this.disabled().map((g) => GRANULARITY_TEXT[g].option);

    return names.length === 0 ? null : `No disponible para este periodo: ${names.join(', ')}. El periodo es demasiado largo para esa serie; elige una granularidad más amplia o un periodo más corto.`;
  });
  protected readonly message = computed(() => {
    if (this.state() === 'pending') return this.pendingText;

    return this.emptyText() ? `${NO_TRIPS_IN_PERIOD}. ${this.emptyText()}` : NO_TRIPS_IN_PERIOD;
  });
  protected readonly announcement = computed(() => (this.status() === 'ready' && this.buckets().length > 0 && this.seriesTotalKg() !== null ? seriesAnnouncement(this.granularity(), this.buckets().length, this.seriesTotalKg() ?? 0) : ''));
  /** Etiquetas del eje del marco vacío: todas si son pocas, y la primera y la última si son muchas. */
  protected readonly slotLabels = computed(() => {
    const labels = this.buckets().map((b) => b.label);

    return labels.length <= 6 ? labels : [labels[0], labels[labels.length - 1]];
  });
  protected readonly state = computed<'pending' | 'empty' | 'chart'>(() => {
    if (this.series() === null) return 'pending';

    return hasSeriesData(this.buckets()) ? 'chart' : 'empty';
  });

  /** Elige la granularidad del control (un valor que no sea una de las seis se ignora). */
  protected choose(value: string): void {
    if (!(GRANULARITIES as readonly string[]).includes(value)) return;

    const granularity = parseGranularity(value);

    if (granularity !== this.granularity()) this.granularityChange.emit(granularity);
  }

  /** Flechas, Inicio y Fin cambian entre gráfico y tabla en el grupo de opciones, y el foco sigue a la opción elegida. */
  protected onViewKey(event: KeyboardEvent): void {
    const keys: Record<string, 'chart' | 'table' | undefined> = { ArrowLeft: 'chart', ArrowUp: 'chart', Home: 'chart', ArrowRight: 'table', ArrowDown: 'table', End: 'table' };
    const next = keys[event.key];

    if (!next) return;

    event.preventDefault();
    this.view.set(next);
    (event.currentTarget as HTMLElement).parentElement?.querySelectorAll('button')[next === 'chart' ? 0 : 1]?.focus();
  }
}
