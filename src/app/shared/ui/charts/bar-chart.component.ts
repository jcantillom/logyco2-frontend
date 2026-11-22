import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { BarBox, BarDatum, barLayout, formatTick } from './bar-chart';

/** Alto fijo del SVG (unidades = píxeles: el ancho se mide del contenedor y el texto no se estira). */
export const BAR_CHART_HEIGHT = 140;
const DEFAULT_WIDTH = 560;
const CHAR = 5.4;

/**
 * Barras verticales con línea de tendencia, eje Y de marcas redondas y cifra sobre cada barra; SVG propio y presentacional. El ancho se adapta al contenedor
 * (`ResizeObserver`) y con muchos meses las etiquetas se inclinan, así que no hay scroll. Una ranura sin dato (`value: null`) queda vacía con «—» y la
 * tendencia salta el hueco. Accesible: `role="img"` con un resumen y una tabla `sr-only` con los mismos datos.
 */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; min-width: 0; }
      figure { margin: 0; }
      svg { display: block; overflow: visible; }
      .grid { stroke: var(--c-bd); stroke-width: 1; stroke-dasharray: 3 3; opacity: 0.7; }
      .tick { text-anchor: end; fill: var(--c-text2); font-size: 9px; font-variant-numeric: tabular-nums; }
      .unit { text-anchor: start; fill: var(--c-text2); font-size: 9px; font-weight: 700; }
      .bar { fill: var(--c-primary); transition: fill 0.15s; }
      .bar:hover { fill: color-mix(in srgb, var(--c-primary) 80%, var(--c-sf)); }
      .none { fill: var(--c-mute2); text-anchor: middle; font-size: 11px; }
      .val { text-anchor: middle; fill: var(--c-head); font-size: 9.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .month { text-anchor: middle; fill: var(--c-text2); font-size: 9.5px; }
      .month.rot { text-anchor: end; }
      .trend { fill: none; stroke: var(--c-head); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
      .dot { fill: var(--c-sf); stroke: var(--c-head); stroke-width: 1.4; }
      .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 2px 0 0; padding: 0 0 0 4px; font-size: 0.74rem; color: var(--c-text2); }
      .legend span { display: inline-flex; align-items: center; gap: 6px; }
      .legend i.sq { width: 10px; height: 10px; border-radius: 3px; background: var(--c-primary); }
      .legend i.ln { width: 16px; height: 0; border-top: 2px solid var(--c-head); position: relative; }
      @media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
    `,
  ],
  template: `
    <figure>
      <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height" [attr.width]="width()" [attr.height]="height" role="img" [attr.aria-label]="summary()" data-testid="bar-svg">
        <text class="unit" x="0" y="8">{{ unit() }}</text>
        @for (tick of layout().ticks; track tick.value) {
          <line class="grid" [attr.x1]="box().left" [attr.x2]="width() - box().right" [attr.y1]="tick.y" [attr.y2]="tick.y" />
          <text class="tick" [attr.x]="box().left - 6" [attr.y]="tick.y + 3">{{ tick.label }}</text>
        }
        @for (bar of layout().bars; track $index) {
          @if (bar.value === null) {
            <text class="none" [attr.x]="bar.cx" [attr.y]="bar.y - 4" data-testid="bar-empty">—</text>
          } @else {
            <rect class="bar" [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="bar.width" [attr.height]="bar.height" rx="3" data-testid="bar"><title>{{ bar.label }}: {{ bar.valueLabel }} {{ unit() }}</title></rect>
            <text class="val" [attr.x]="layout().rotateValues ? bar.cx + 3 : bar.cx" [attr.y]="bar.y - 4" [attr.transform]="layout().rotateValues ? 'rotate(-90 ' + (bar.cx + 3) + ' ' + (bar.y - 4) + ')' : null" [attr.text-anchor]="layout().rotateValues ? 'start' : 'middle'" data-testid="bar-value">{{ bar.valueLabel }}</text>
          }
          <text class="month" [class.rot]="layout().rotateAxis" [attr.x]="bar.cx" [attr.y]="box().height - box().bottom + 13" [attr.transform]="layout().rotateAxis ? 'rotate(-40 ' + bar.cx + ' ' + (box().height - box().bottom + 13) + ')' : null" data-testid="bar-month">{{ bar.label }}</text>
        }
        @for (points of layout().trend; track points) {
          <polyline class="trend" [attr.points]="points" data-testid="bar-trend" />
        }
        @for (bar of layout().bars; track $index) {
          @if (bar.value !== null) { <circle class="dot" [attr.cx]="bar.cx" [attr.cy]="bar.cy" r="2.6" /> }
        }
      </svg>
      <figcaption class="legend" data-testid="bar-legend"><span><i class="sq" aria-hidden="true"></i>{{ seriesName() }}</span><span><i class="ln" aria-hidden="true"></i>{{ trendName() }}</span></figcaption>
    </figure>
    <table class="sr-only" data-testid="bar-table">
      <caption>{{ title() }}</caption>
      <thead><tr><th scope="col">Mes</th><th scope="col">{{ unit() }}</th></tr></thead>
      <tbody>@for (bar of layout().bars; track $index) { <tr><th scope="row">{{ bar.label }}</th><td>{{ bar.value === null ? 'Sin dato' : bar.valueLabel }}</td></tr> }</tbody>
    </table>
  `,
})
export class BarChartComponent {
  readonly data = input.required<readonly BarDatum[]>();
  readonly unit = input('kg CO₂');
  readonly title = input('Emisiones por mes');
  readonly seriesName = input('Emisiones (kg CO₂)');
  readonly trendName = input('Tendencia');

  protected readonly height = BAR_CHART_HEIGHT;
  protected readonly width = signal(DEFAULT_WIDTH);
  protected readonly box = computed<BarBox>(() => {
    const data = this.data();
    const longest = Math.max(...data.map((d) => (d.value !== null && Number.isFinite(d.value) ? formatTick(d.value).length : 0)), 4);

    return { width: this.width(), height: this.height, left: Math.max(30, longest * CHAR + 14), right: 6, top: 18, bottom: data.length > 6 ? 36 : 22 };
  });
  protected readonly layout = computed(() => barLayout(this.data(), this.box()));
  protected readonly summary = computed(() => {
    const parts = this.layout().bars.map((b) => `${b.label} ${b.value === null ? 'sin dato' : `${b.valueLabel} ${this.unit()}`}`);

    return `${this.title()}: ${parts.join(', ')}`;
  });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;

      const observer = new ResizeObserver((entries) => {
        const w = Math.floor(entries[0]?.contentRect.width ?? 0);

        if (w >= 200) this.width.set(w);
      });

      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
