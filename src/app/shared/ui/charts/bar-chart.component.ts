import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { BarBox, BarDatum, BarLayoutItem, barLayout, formatTick } from './bar-chart';

/** Aclaración que acompaña a las barras parciales en la leyenda. */
const PARTIAL_LEGEND = 'Periodo parcial';

/** Alto fijo del SVG (unidades = píxeles: el ancho se mide del contenedor y el texto no se estira). */
export const BAR_CHART_HEIGHT = 150;
const DEFAULT_WIDTH = 560;
const CHAR = 5.4;
let nextId = 0;

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
      .track { fill: var(--c-s2); }
      .bar { fill: var(--c-primary); transition: opacity 0.2s ease; }
      .bar.partial { fill: color-mix(in srgb, var(--c-primary) 60%, var(--c-sf)); stroke: var(--c-primary-700); stroke-width: 1; stroke-dasharray: 3 2; }
      .hit { fill: transparent; }
      .hit.active { fill: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); }
      svg:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; border-radius: 4px; }
      figure { position: relative; }
      .tip { position: absolute; top: 0; z-index: 2; max-width: 240px; padding: 6px 9px; border: 1px solid var(--c-bd); border-radius: 8px; background: var(--c-sf); box-shadow: var(--shadow); color: var(--c-text2); font-size: 0.72rem; line-height: 1.35; pointer-events: none; transform: translateX(-50%); }
      .tip b { display: block; color: var(--c-head); font-size: 0.76rem; }
      .tip span { display: block; }
      .month.partial { font-style: italic; }
      .sheen { pointer-events: none; transition: opacity 0.2s ease; }
      svg:has(.bar:hover) .bar:not(:hover), svg:has(.bar:hover) .sheen:not(.on) { opacity: 0.45; }
      .sheen-top { stop-color: var(--c-sf); stop-opacity: 0.16; }
      .sheen-bottom { stop-color: var(--c-sf); stop-opacity: 0; }
      .none { fill: var(--c-mute2); text-anchor: middle; font-size: 11px; }
      .val { text-anchor: middle; fill: var(--c-head); font-size: 9.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .month { text-anchor: middle; fill: var(--c-text2); font-size: 9.5px; }
      .month.rot { text-anchor: end; }
      .trend { fill: none; stroke: var(--c-head); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 5 4; }
      .dot { fill: var(--c-sf); stroke: var(--c-head); stroke-width: 1.4; }
      .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 2px 0 0; padding: 0 0 0 4px; font-size: 0.74rem; color: var(--c-text2); }
      .legend span { display: inline-flex; align-items: center; gap: 6px; }
      .legend i.sq { width: 10px; height: 10px; border-radius: 3px; background: var(--c-primary); }
      .legend i.pt { width: 10px; height: 10px; border-radius: 3px; background: color-mix(in srgb, var(--c-primary) 60%, var(--c-sf)); border: 1px dashed var(--c-primary-700); box-sizing: border-box; }
      .legend i.ln { width: 16px; height: 0; border-top: 2px solid var(--c-head); position: relative; }
      @media (prefers-reduced-motion: reduce) { .bar, .sheen { transition: none; } }
    `,
  ],
  template: `
    <figure>
      <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height" [attr.width]="width()" [attr.height]="height" role="img" [attr.aria-label]="summary()" [attr.tabindex]="interactive() ? 0 : null" (keydown)="onKey($event)" (focus)="onFocus()" (blur)="active.set(null)" (mouseleave)="active.set(null)" data-testid="bar-svg">
        <defs><linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="0" y2="1"><stop class="sheen-top" offset="0" /><stop class="sheen-bottom" offset="1" /></linearGradient></defs>
        <text class="unit" x="0" y="8">{{ unit() }}</text>
        @for (tick of layout().ticks; track tick.value) {
          <line class="grid" [attr.x1]="box().left" [attr.x2]="width() - box().right" [attr.y1]="tick.y" [attr.y2]="tick.y" />
          <text class="tick" [attr.x]="box().left - 6" [attr.y]="tick.y + 3">{{ tick.label }}</text>
        }
        @if (!layout().dense) { @for (bar of layout().bars; track $index) {
          <rect class="track" [attr.x]="bar.x" [attr.y]="box().top" [attr.width]="bar.width" [attr.height]="box().height - box().top - box().bottom" rx="5" aria-hidden="true" />
        } }
        @for (bar of layout().bars; track $index) {
          @if (bar.value === null) {
            <text class="none" [attr.x]="bar.cx" [attr.y]="bar.y - 4" data-testid="bar-empty">—</text>
          } @else {
            @if (bar.height > 0) {
              <rect class="bar" [class.partial]="bar.partial" [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="bar.width" [attr.height]="bar.height" [attr.rx]="layout().dense ? 1 : 5" data-testid="bar">@if (!bar.tip) { <title>{{ bar.label }}: {{ bar.valueLabel }} {{ unit() }}</title> }</rect>
              @if (!layout().dense) { <rect class="sheen" [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="bar.width" [attr.height]="bar.height" rx="5" [attr.fill]="'url(#' + gradientId + ')'" aria-hidden="true" /> }
            }
            @if (!layout().dense) { <text class="val" [attr.x]="layout().rotateValues ? bar.cx + 3 : bar.cx" [attr.y]="bar.y - 4" [attr.transform]="layout().rotateValues ? 'rotate(-90 ' + (bar.cx + 3) + ' ' + (bar.y - 4) + ')' : null" [attr.text-anchor]="layout().rotateValues ? 'start' : 'middle'" data-testid="bar-value">{{ bar.valueLabel }}</text> }
          }
          @if (bar.showLabel) { <text class="month" [class.partial]="bar.partial" [class.rot]="layout().rotateAxis" [attr.x]="bar.cx" [attr.y]="box().height - box().bottom + 13" [attr.transform]="layout().rotateAxis ? 'rotate(-40 ' + bar.cx + ' ' + (box().height - box().bottom + 13) + ')' : null" data-testid="bar-month">{{ bar.label }}</text> }
          @if (bar.tip) { <rect class="hit" [class.active]="active() === $index" [attr.x]="bar.slotX" [attr.y]="box().top" [attr.width]="bar.slotWidth" [attr.height]="box().height - box().top - box().bottom" (mouseenter)="active.set($index)" data-testid="bar-hit" /> }
        }
        @for (points of layout().trend; track points) {
          <polyline class="trend" [attr.points]="points" data-testid="bar-trend" />
        }
        @for (bar of layout().bars; track $index) {
          @if (!layout().dense && bar.value !== null && layout().trend.length > 0) { <circle class="dot" [attr.cx]="bar.cx" [attr.cy]="bar.cy" r="2.6" /> }
        }
      </svg>
      @if (activeBar(); as bar) {
        <div class="tip" aria-hidden="true" [style.left.px]="tipLeft()" data-testid="bar-tip">
          @for (line of bar.tip; track $index) { @if ($first) { <b>{{ line }}</b> } @else { <span>{{ line }}</span> } }
        </div>
      }
      <figcaption class="legend" data-testid="bar-legend"><span><i class="sq" aria-hidden="true"></i>{{ seriesName() }}</span>@if (!layout().dense) { <span><i class="ln" aria-hidden="true"></i>{{ trendName() }}</span> }@if (hasPartial()) { <span data-testid="bar-legend-partial"><i class="pt" aria-hidden="true"></i>{{ partialLegend }}</span> }</figcaption>
    </figure>
    @if (!layout().dense) { <div class="sr-only"><table data-testid="bar-table">
      <caption>{{ title() }}</caption>
      <thead><tr><th scope="col">Mes</th><th scope="col">{{ unit() }}</th></tr></thead>
      <tbody>@for (bar of layout().bars; track $index) { <tr><th scope="row">{{ bar.label }}</th><td>{{ bar.value === null ? 'Sin dato' : bar.valueLabel }}</td></tr> }</tbody>
    </table></div> }
  `,
})
export class BarChartComponent {
  readonly data = input.required<readonly BarDatum[]>();
  readonly unit = input('kg CO₂');
  readonly title = input('Emisiones por mes');
  readonly seriesName = input('Emisiones (kg CO₂)');
  readonly trendName = input('Tendencia');

  /** Barra resaltada por el puntero o el teclado (su tooltip se muestra); `null` si ninguna. */
  protected readonly active = signal<number | null>(null);
  protected readonly partialLegend = PARTIAL_LEGEND;
  protected readonly gradientId = `bar-sheen-${nextId++}`;
  protected readonly height = BAR_CHART_HEIGHT;
  protected readonly width = signal(DEFAULT_WIDTH);
  protected readonly box = computed<BarBox>(() => {
    const data = this.data();
    const longest = Math.max(...data.map((d) => (d.value !== null && Number.isFinite(d.value) ? formatTick(d.value).length : 0)), 4);

    return { width: this.width(), height: this.height, left: Math.max(30, longest * CHAR + 14), right: 6, top: 18, bottom: data.length > 6 ? 36 : 22 };
  });
  protected readonly layout = computed(() => barLayout(this.data(), this.box()));
  /** Hay tooltips propios (serie por granularidad): el SVG es un solo punto de tabulación y se recorre con las flechas. */
  protected readonly interactive = computed(() => this.data().some((d) => d.tip));
  protected readonly hasPartial = computed(() => this.layout().bars.some((b) => b.partial));
  protected readonly activeBar = computed<BarLayoutItem | null>(() => {
    const i = this.active();

    return i === null ? null : (this.layout().bars[i] ?? null);
  });
  protected readonly tipLeft = computed(() => Math.min(Math.max(this.activeBar()?.cx ?? 0, 90), this.width() - 90));
  protected readonly summary = computed(() => {
    if (this.layout().dense) return `${this.title()}: ${this.layout().bars.length} periodos. Los valores exactos están en la vista de tabla.`;

    const parts = this.layout().bars.map((b) => `${b.label} ${b.value === null ? 'sin dato' : `${b.valueLabel} ${this.unit()}`}`);

    return `${this.title()}: ${parts.join(', ')}`;
  });

  protected onFocus(): void {
    if (this.interactive() && this.active() === null && this.layout().bars.length > 0) this.active.set(0);
  }

  /** Flechas, Inicio y Fin recorren las barras (foco único en el SVG); Escape oculta el tooltip. */
  protected onKey(event: KeyboardEvent): void {
    const count = this.layout().bars.length;
    const current = this.active();

    if (!this.interactive() || count === 0) return;

    const next = event.key === 'ArrowRight' ? (current === null ? 0 : Math.min(count - 1, current + 1)) : event.key === 'ArrowLeft' ? (current === null ? count - 1 : Math.max(0, current - 1)) : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : event.key === 'Escape' ? null : undefined;

    if (next === undefined) return;

    event.preventDefault();
    this.active.set(next);
  }

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
