import { ChangeDetectionStrategy, Component, afterNextRender, computed, input, signal } from '@angular/core';
import { DonutSegment } from './chart-model';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Separación visual (en unidades de arco) entre segmentos contiguos. */
const GAP = 2.4;

/**
 * Distribución en una dona con su leyenda (valor y porcentaje); accesible y sin dependencias.
 * Dinámica: se dibuja con una animación de entrada, y al pasar el cursor (o enfocar con teclado) por un segmento
 * o por su fila de la leyenda se resalta y el centro muestra su valor.
 */
@Component({
  selector: 'app-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.fluid]': 'fluid()' },
  styles: [
    `
      :host { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 22px; }
      /* Modo fluido: la dona ocupa todo el alto/ancho que le deja su contenedor y la leyenda va a su lado. */
      :host(.fluid) { flex-wrap: nowrap; align-items: stretch; justify-content: stretch; gap: 24px; }
      :host(.fluid) .ring { position: relative; flex: 1 1 0; min-width: 0; min-height: 170px; }
      :host(.fluid) .ring svg { position: absolute; inset: 0; width: 100%; height: 100%; }
      :host(.fluid) ul { flex: 0 1 46%; min-width: 170px; max-width: none; justify-content: center; }
      svg { flex: none; overflow: visible; filter: drop-shadow(0 6px 10px color-mix(in srgb, var(--c-primary) 14%, transparent)); }
      .track { fill: none; stroke: var(--c-s3); stroke-width: 14; }
      .halo { fill: none; stroke: var(--c-s2); stroke-width: 1; }
      .seg { fill: none; stroke-width: 14; transition: stroke-dasharray 0.9s cubic-bezier(0.22, 0.8, 0.3, 1), stroke-width 0.2s, opacity 0.2s; cursor: pointer; outline: none; }
      .seg.on { stroke-width: 18; }
      .seg.dim { opacity: 0.32; }
      .center { text-anchor: middle; fill: var(--c-head); font-weight: 800; font-size: 24px; letter-spacing: -0.03em; }
      .center-sub { text-anchor: middle; fill: var(--c-mu); font-size: 8.5px; font-weight: 600; letter-spacing: 0.02em; }
      ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 0.86rem; min-width: 190px; flex: 1 1 190px; max-width: 320px; }
      li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto auto; align-items: center; column-gap: 9px; row-gap: 5px; padding: 8px 10px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); cursor: default; transition: border-color 0.2s, background 0.2s, opacity 0.2s, transform 0.2s; outline: none; }
      li.on { border-color: var(--seg); background: var(--c-s2); transform: translateX(3px); }
      li.dim { opacity: 0.5; }
      li:focus-visible { box-shadow: 0 0 0 3px var(--c-secondary-soft); }
      li i.dot { width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 3px color-mix(in srgb, var(--seg) 22%, transparent); }
      li .name { min-width: 0; overflow-wrap: anywhere; line-height: 1.2; font-weight: 600; color: var(--c-head); }
      li .name small { display: block; font-weight: 500; letter-spacing: 0.04em; font-size: 0.68rem; color: var(--c-mu); }
      li .value { font-variant-numeric: tabular-nums; font-weight: 800; font-size: 1rem; color: var(--c-head); }
      li .pct { color: var(--seg); font-size: 0.74rem; font-weight: 800; background: color-mix(in srgb, var(--seg) 12%, transparent); padding: 2px 7px; border-radius: 999px; min-width: 40px; text-align: center; }
      li .bar { grid-column: 1 / -1; height: 5px; border-radius: 3px; background: var(--c-s3); overflow: hidden; }
      li .bar b { display: block; height: 100%; border-radius: 3px; transition: width 0.9s cubic-bezier(0.22, 0.8, 0.3, 1); }
      @media (prefers-reduced-motion: reduce) { .seg, li, li .bar b { transition: none; } li.on { transform: none; } }
    `,
  ],
  template: `
    <div class="ring">
    <svg viewBox="0 0 132 132" [attr.width]="fluid() ? null : size()" [attr.height]="fluid() ? null : size()" role="img" [attr.aria-label]="ariaLabel()" (pointerleave)="active.set(null)">
      <circle class="halo" cx="66" cy="66" r="40" />
      <circle class="track" cx="66" cy="66" [attr.r]="radius" />
      @for (arc of arcs(); track arc.label) {
        <circle class="seg" [class.on]="active() === arc.label" [class.dim]="active() !== null && active() !== arc.label" cx="66" cy="66" [attr.r]="radius" [attr.stroke]="arc.color"
          [attr.stroke-dasharray]="ready() ? arc.dash : '0 ' + circumference" [attr.stroke-dashoffset]="arc.offset" transform="rotate(-90 66 66)"
          (pointerenter)="active.set(arc.label)" />
      }
      <text class="center" x="66" y="70">{{ centerValue() }}</text>
      <text class="center-sub" x="66" y="84">{{ centerSub() }}</text>
    </svg>
    </div>
    <ul>
      @for (segment of segments(); track segment.label) {
        <li [class.on]="active() === segment.label" [class.dim]="active() !== null && active() !== segment.label" [style.--seg]="segment.color" tabindex="0"
          (pointerenter)="active.set(segment.label)" (pointerleave)="active.set(null)" (focus)="active.set(segment.label)" (blur)="active.set(null)">
          <i class="dot" [style.background]="segment.color"></i>
          <span class="name">{{ segment.label + (segment.detail ? ' ' : '') }}@if (segment.detail) { <small>({{ segment.detail }})</small> }</span>
          <span class="value">{{ segment.value }}</span><span class="pct">{{ percent(segment.value) }}</span>
          <span class="bar" aria-hidden="true"><b [style.background]="segment.color" [style.width.%]="ready() ? share(segment.value) : 0"></b></span>
        </li>
      }
    </ul>
  `,
})
export class DonutChartComponent {
  readonly segments = input.required<readonly DonutSegment[]>();
  readonly centerLabel = input('total');
  /** Valor del centro cuando no coincide con la suma de los segmentos (p. ej. una empresa con dos tipos aparece en ambos segmentos). */
  readonly centerTotal = input<number | null>(null);
  readonly ariaLabel = input('Distribución');
  /** Lado del gráfico en píxeles. */
  readonly size = input(150);
  /** Ocupa el espacio disponible del contenedor (ignora `size`). */
  readonly fluid = input(false);

  protected readonly radius = RADIUS;
  protected readonly circumference = CIRCUMFERENCE;
  /** Etiqueta del segmento resaltado (cursor o foco); `null` = ninguno. */
  protected readonly active = signal<string | null>(null);
  /** Pasa a `true` tras el primer render: el trazo parte de cero y se anima hasta su longitud. */
  protected readonly ready = signal(false);
  protected readonly total = computed(() => this.segments().reduce((sum, s) => sum + s.value, 0));
  private readonly current = computed(() => this.segments().find((s) => s.label === this.active()) ?? null);
  protected readonly centerValue = computed(() => (this.current() ? this.current()!.value : (this.centerTotal() ?? this.total())));
  protected readonly centerSub = computed(() => {
    const segment = this.current();

    return segment ? (segment.detail ?? segment.label) : this.centerLabel();
  });
  protected readonly arcs = computed(() => {
    const total = this.total();
    const visible = this.segments().filter((s) => s.value > 0);
    const gap = visible.length > 1 ? GAP : 0;
    let consumed = 0;

    return visible.map((s) => {
      const full = (s.value / total) * CIRCUMFERENCE;
      const length = Math.max(full - gap, 0.5);
      const arc = { label: s.label, color: s.color, dash: `${length} ${CIRCUMFERENCE - length}`, offset: -(consumed + gap / 2) };
      consumed += full;

      return arc;
    });
  });

  constructor() {
    afterNextRender(() => this.ready.set(true));
  }

  protected share(value: number): number {
    const total = this.total();

    return total ? Math.round((value / total) * 100) : 0;
  }

  protected percent(value: number): string {
    return this.total() ? `${this.share(value)}%` : '—';
  }
}
