import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { ChartSeries, axisFit, axisFor } from './chart-model';

const WIDTH = 640;
const PAD = { left: 34, right: 26, top: 10, bottom: 26 };
/** Con etiquetas de dos líneas («Sep» y debajo «2026») el eje necesita más alto. */
const PAD_BOTTOM_TWO_LINES = 42;
const MIN_FILL = { w: 260, h: 90 };

/**
 * Gráfico de evolución en el tiempo: líneas (`kind="line"`) o barras agrupadas (`kind="bar"`).
 * Accesible: describe su contenido con `aria-label` y ofrece los mismos datos como tabla
 * solo para lectores de pantalla. El cursor/foco muestra el valor exacto de cada punto.
 *
 * Con `fill` ocupa todo el alto que le deja su contenedor (se mide y se redibuja a su tamaño real,
 * sin escalar el texto); sin `fill` mantiene una proporción fija.
 */
@Component({
  selector: 'app-trend-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.fill]': 'fill()' },
  styles: [
    `
      :host { display: block; position: relative; }
      :host(.fill) { display: flex; flex-direction: column; min-height: 0; flex: 1 1 0; }
      .plot { position: relative; }
      :host(.fill) .plot { flex: 1 1 0; min-height: 0; }
      svg { width: 100%; height: auto; display: block; overflow: hidden; }
      :host(.fill) svg { position: absolute; inset: 0; height: 100%; }
      .grid { stroke: var(--c-bd); stroke-width: 1; }
      .axis-label { fill: var(--c-mu); font-size: 11px; }
      .axis-sub { fill: var(--c-mute2); font-size: 10px; }
      .cursor { stroke: var(--c-gray-400); stroke-dasharray: 3 3; }
      .tooltip { position: absolute; top: 0; z-index: 2; pointer-events: none; min-width: 150px; padding: 8px 10px; border-radius: 8px; background: var(--c-gray); color: #fff; font-size: 0.8rem; box-shadow: 0 6px 18px rgb(81 83 74 / 30%); transform: translateX(-50%); }
      .tooltip strong { display: block; margin-bottom: 4px; }
      .tooltip .note { display: block; margin-top: 4px; opacity: 0.8; font-size: 0.72rem; }
      .tooltip span { display: flex; align-items: center; gap: 6px; }
      .tooltip i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
      .legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 6px; font-size: 0.82rem; color: var(--c-mu); }
      .legend span { display: inline-flex; align-items: center; gap: 6px; }
      .legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
      .hit { fill: transparent; }
      .mark-text { fill: #fff; font-size: 11px; font-weight: 700; }
      path.area { stroke: none; opacity: 0.14; }
      path.line { fill: none; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
      @media (prefers-reduced-motion: no-preference) { path.line { stroke-dasharray: 1200; stroke-dashoffset: 1200; animation: draw 0.9s ease-out forwards; } }
      @keyframes draw { to { stroke-dashoffset: 0; } }
    `,
  ],
  template: `
    <div class="plot" #plot>
      <svg [attr.viewBox]="'0 0 ' + width() + ' ' + canvasHeight()" role="img" [attr.aria-label]="ariaLabel()" (pointerleave)="hover.set(null)">
        @for (tick of yTicks(); track tick) {
          <line class="grid" [attr.x1]="padLeft()" [attr.x2]="width() - pad.right" [attr.y1]="y(tick)" [attr.y2]="y(tick)" />
          <text class="axis-label" [attr.x]="padLeft() - 6" [attr.y]="y(tick) + 4" text-anchor="end">{{ tickLabel(tick) }}</text>
        }
        @for (label of xLabels(); track label.index) {
          @for (line of label.lines; track $index; let li = $index) {
            <text class="axis-label" [class.axis-sub]="li > 0" [attr.x]="x(label.index)" [attr.y]="lineY(li, label.lines.length)" text-anchor="middle">{{ line }}</text>
          }
        }

        @if (kind() === 'line') {
          @for (s of series(); track s.name) {
            @if (area()) { <path class="area" [attr.d]="areaPath(s)" [attr.fill]="s.color" /> }
            <path class="line" [attr.d]="path(s)" [attr.stroke]="s.color" />
            @if (labels().length <= 16) {
              @for (v of s.values; track $index) { @if (has(v)) { <circle [attr.cx]="x($index)" [attr.cy]="y(v)" r="3" [attr.fill]="s.color" /> } }
            }
          }
        } @else {
          @for (s of series(); track s.name; let si = $index) {
            @for (v of s.values; track $index) {
              @if (has(v)) { <rect [attr.x]="barX($index, si)" [attr.y]="y(v)" [attr.width]="barWidth()" [attr.height]="max0(y(0) - y(v))" [attr.fill]="s.color" rx="2" /> }
            }
          }
        }

        @if (markLast() && kind() === 'line' && series()[0]?.values?.length) {
          <g class="mark" aria-hidden="true">
            <circle [attr.cx]="x(lastIndex())" [attr.cy]="y(lastValue())" r="5" [attr.fill]="series()[0].color" style="stroke: var(--c-sf)" stroke-width="2" />
            <rect [attr.x]="markX()" [attr.y]="y(lastValue()) - 32" [attr.width]="markWidth()" height="22" rx="6" [attr.fill]="series()[0].color" />
            <text class="mark-text" [attr.x]="markX() + markWidth() / 2" [attr.y]="y(lastValue()) - 17" text-anchor="middle">{{ markLast() }}</text>
          </g>
        }

        @if (hover() !== null) { <line class="cursor" [attr.x1]="x(hover()!)" [attr.x2]="x(hover()!)" [attr.y1]="pad.top" [attr.y2]="canvasHeight() - padBottom()" /> }

        @for (label of labels(); track $index) {
          <rect class="hit" [attr.x]="slotX($index)" [attr.y]="pad.top" [attr.width]="slotWidth()" [attr.height]="canvasHeight() - pad.top - padBottom()"
            tabindex="0" (pointerenter)="hover.set($index)" (focus)="hover.set($index)" (blur)="hover.set(null)" />
        }
      </svg>

      @if (hover() !== null) {
        <div class="tooltip" [style.left.%]="(x(hover()!) / width()) * 100" role="status">
          <strong>{{ labels()[hover()!] }}</strong>
          @for (s of series(); track s.name) { <span><i [style.background]="s.color"></i>{{ s.name }}: {{ valueText(s.values[hover()!]) }}</span> }
          @if (notes()[hover()!]; as note) { <small class="note">{{ note }}</small> }
        </div>
      }
    </div>

    @if (!fill() || series().length > 1) {
      <div class="legend">@for (s of series(); track s.name) { <span><i [style.background]="s.color"></i>{{ s.name }}</span> }</div>
    }

    <table class="sr-only">
      <caption>{{ ariaLabel() }}</caption>
      <thead><tr><th scope="col">Período</th>@for (s of series(); track s.name) { <th scope="col">{{ s.name }}</th> }</tr></thead>
      <tbody>@for (label of labels(); track $index; let i = $index) { <tr><th scope="row">{{ label }}</th>@for (s of series(); track s.name) { <td>{{ valueText(s.values[i]) }}</td> }</tr> }</tbody>
    </table>
  `,
})
export class TrendChartComponent {
  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly ChartSeries[]>();
  readonly kind = input<'line' | 'bar'>('line');
  readonly height = input(210);
  /** Rellena el área bajo la línea (solo en `kind="line"`). */
  readonly area = input(false);
  /** Ocupa el alto disponible de su contenedor en lugar de una proporción fija. */
  readonly fill = input(false);
  /** Espacio mínimo (px) por etiqueta del eje X; con menos se omiten etiquetas alternas. Etiquetas cortas admiten menos. */
  readonly labelGap = input(90);
  /** Texto que se muestra sobre el último punto de la primera serie (valor actual); `null` = sin marcador. */
  readonly markLast = input<string | null>(null);
  readonly ariaLabel = input('Gráfico de evolución');
  /** Líneas de precios: el eje Y se ajusta al rango real de los datos en vez de partir de cero (las barras siempre parten de cero). */
  readonly fitRange = input(false);
  /** Línea extra del tooltip por punto (p. ej. la circular de origen y la variación). */
  readonly notes = input<readonly (string | null)[]>([]);

  protected readonly pad = PAD;
  /** El margen izquierdo crece con la etiqueta más ancha del eje («16.000») para que nunca se recorte. */
  protected readonly padLeft = computed(() => Math.max(PAD.left, Math.max(...this.yTicks().map((t) => this.tickLabel(t).length)) * 6.6 + 14));
  protected readonly hover = signal<number | null>(null);

  private readonly plot = viewChild.required<ElementRef<HTMLElement>>('plot');
  private readonly size = signal({ w: WIDTH, h: 210 });
  protected readonly width = computed(() => (this.fill() ? this.size().w : WIDTH));
  protected readonly canvasHeight = computed(() => (this.fill() ? this.size().h : this.height()));

  private readonly axis = computed(() => {
    const values = this.series().flatMap((s) => s.values).filter(Number.isFinite);

    if (this.fitRange() && this.kind() === 'line' && values.length > 0) {
      return axisFit(Math.min(...values), Math.max(...values));
    }

    return { ...axisFor(Math.max(0, ...values)), bottom: 0 };
  });
  protected readonly yTicks = computed(() => {
    const { step, bottom, top } = this.axis();

    return Array.from({ length: Math.round((top - bottom) / step) + 1 }, (_, i) => bottom + i * step);
  });
  /** Un valor `NaN` es un período SIN DATO: no se dibuja ni se interpola. */
  protected has(value: number): boolean {
    return Number.isFinite(value);
  }
  protected valueText(value: number | undefined): string {
    return value === undefined || !Number.isFinite(value) ? 'Sin dato' : String(value);
  }
  protected tickLabel(tick: number): string {
    return new Intl.NumberFormat('es-CO').format(tick);
  }
  protected readonly xLabels = computed(() => {
    const total = this.labels().length;
    const every = Math.max(1, Math.ceil(total / Math.max(3, Math.floor(this.width() / this.labelGap()))));

    return this.labels().map((text, index) => ({ text, lines: text.split('\n'), index })).filter(({ index }) => index % every === 0 || index === total - 1);
  });
  protected readonly lastIndex = computed(() => {
    const values = this.series()[0]?.values ?? [];
    let index = values.length - 1;

    while (index > 0 && !Number.isFinite(values[index])) index -= 1;

    return Math.max(index, 0);
  });
  protected readonly lastValue = computed(() => this.series()[0]?.values[this.lastIndex()] ?? 0);
  protected readonly markWidth = computed(() => Math.max(44, (this.markLast()?.length ?? 0) * 7 + 16));
  /** El rótulo se mantiene dentro del lienzo: si el último punto está en el borde derecho, se desplaza a la izquierda. */
  protected readonly markX = computed(() => Math.min(this.x(this.lastIndex()) - this.markWidth() / 2, this.width() - PAD.right - this.markWidth() + 8));
  /** Alto reservado bajo el área de trazado: crece si alguna etiqueta tiene dos líneas. */
  protected readonly padBottom = computed(() => (this.labels().some((label) => label.includes('\n')) ? PAD_BOTTOM_TWO_LINES : PAD.bottom));
  protected readonly slotWidth = computed(() => (this.width() - this.padLeft() - PAD.right) / Math.max(this.labels().length, 1));
  protected readonly barWidth = computed(() => Math.max(2, (this.slotWidth() * 0.72) / Math.max(this.series().length, 1)));

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;

      const observer = new ResizeObserver(([entry]) => {
        if (!this.fill()) return;

        const { width, height } = entry.contentRect;
        this.size.set({ w: Math.max(MIN_FILL.w, Math.round(width)), h: Math.max(MIN_FILL.h, Math.round(height)) });
      });
      observer.observe(this.plot().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** Posición vertical de cada línea de una etiqueta del eje X (una sola línea: pegada al borde, como siempre). */
  protected lineY(line: number, total: number): number {
    return total === 1 ? this.canvasHeight() - 6 : this.canvasHeight() - 24 + line * 13;
  }

  protected x(index: number): number {
    return this.padLeft() + this.slotWidth() * (index + 0.5);
  }
  protected slotX(index: number): number {
    return this.padLeft() + this.slotWidth() * index;
  }
  protected barX(index: number, seriesIndex: number): number {
    const group = this.barWidth() * this.series().length;

    return this.x(index) - group / 2 + seriesIndex * this.barWidth();
  }
  protected y(value: number): number {
    const inner = this.canvasHeight() - PAD.top - this.padBottom();

    const { bottom, top } = this.axis();

    return PAD.top + inner * (1 - (value - bottom) / (top - bottom));
  }
  protected max0(value: number): number {
    return Math.max(0, value);
  }
  protected areaPath(series: ChartSeries): string {
    if (series.values.length === 0 || series.values.some((v) => !Number.isFinite(v))) return '';

    const last = series.values.length - 1;

    return `${this.path(series)} L${this.x(last).toFixed(1)} ${this.y(this.axis().bottom).toFixed(1)} L${this.x(0).toFixed(1)} ${this.y(this.axis().bottom).toFixed(1)} Z`;
  }
  protected path(series: ChartSeries): string {
    let drawing = false;

    return series.values
      .map((v, i) => {
        if (!Number.isFinite(v)) {
          drawing = false;

          return '';
        }

        const command = drawing ? 'L' : 'M';
        drawing = true;

        return `${command}${this.x(i).toFixed(1)} ${this.y(v).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(' ');
  }
}
