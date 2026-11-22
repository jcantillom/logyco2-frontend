import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatTick } from './bar-chart';
import { ShareSlice } from './share-chart';

const RADIUS = 38;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Hueco entre porciones (unidades de arco): se ve como un borde fino del color de la tarjeta. */
const GAP = 1.6;
const PCT = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Dona de participación con su leyenda en forma de tabla (punto de color, nombre, % y valor); SVG propio y presentacional. En el centro, el total. Accesible:
 * `role="img"` con un resumen y una tabla `sr-only`; la leyenda es el canal textual (el color no es el único).
 */
@Component({
  selector: 'app-share-donut',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: flex; align-items: center; gap: 18px; min-width: 0; }
      svg { flex: none; width: 112px; height: 112px; }
      .slice { fill: none; stroke-width: 16; }
      .total { text-anchor: middle; fill: var(--c-head); font-size: 15px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
      .unit { text-anchor: middle; fill: var(--c-text2); font-size: 8px; font-weight: 600; }
      ul { flex: 1; min-width: 0; list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
      li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto auto; align-items: center; column-gap: 8px; font-size: 0.8rem; min-width: 0; }
      li i { width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 1px var(--c-bd); }
      li .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: var(--c-head); }
      li .pct { font-variant-numeric: tabular-nums; font-weight: 750; color: var(--c-head); text-align: right; }
      li .kg { font-variant-numeric: tabular-nums; color: var(--c-text2); text-align: right; min-width: 64px; }
    `,
  ],
  template: `
    <svg viewBox="0 0 112 112" role="img" [attr.aria-label]="summary()" data-testid="donut-svg">
      <circle class="slice" cx="56" cy="56" [attr.r]="radius" stroke="var(--c-s3)" />
      @for (arc of arcs(); track arc.key) {
        <circle class="slice" cx="56" cy="56" [attr.r]="radius" [attr.stroke]="arc.color" [attr.stroke-dasharray]="arc.dash" [attr.stroke-dashoffset]="arc.offset" transform="rotate(-90 56 56)" data-testid="donut-slice"><title>{{ arc.label }}: {{ arc.pctText }} %</title></circle>
      }
      <text class="total" x="56" y="57" data-testid="donut-total">{{ totalText() }}</text>
      <text class="unit" x="56" y="69">{{ unit() }}</text>
    </svg>
    <ul data-testid="donut-legend">
      @for (slice of slices(); track slice.key) {
        <li data-testid="donut-row"><i [style.background]="slice.color" aria-hidden="true"></i><span class="name" [attr.title]="slice.label">{{ slice.label }}</span><span class="pct">{{ pctText(slice) }} %</span><span class="kg">{{ kg(slice) }} kg</span></li>
      }
    </ul>
    <table class="sr-only" data-testid="donut-table">
      <caption>{{ title() }}</caption>
      <thead><tr><th scope="col">Combustible</th><th scope="col">Participación</th><th scope="col">{{ unit() }}</th></tr></thead>
      <tbody>@for (slice of slices(); track slice.key) { <tr><th scope="row">{{ slice.label }}</th><td>{{ pctText(slice) }} %</td><td>{{ kg(slice) }}</td></tr> }</tbody>
    </table>
  `,
})
export class ShareDonutComponent {
  readonly slices = input.required<readonly ShareSlice[]>();
  readonly unit = input('kg CO₂');
  readonly title = input('Emisiones por tipo de combustible');

  protected readonly radius = RADIUS;
  protected readonly total = computed(() => this.slices().reduce((sum, s) => sum + s.value, 0));
  protected readonly totalText = computed(() => formatTick(this.total()));
  protected readonly arcs = computed(() => {
    let offset = 0;

    return this.slices().map((s) => {
      const length = (s.pct / 100) * CIRCUMFERENCE;
      const arc = { key: s.key, label: s.label, color: s.color, pctText: PCT.format(s.pct), dash: `${Math.max(length - GAP, 0.01)} ${CIRCUMFERENCE}`, offset: -offset };

      offset += length;

      return arc;
    });
  });
  protected readonly summary = computed(() => `${this.title()}: ${this.slices().map((s) => `${s.label} ${PCT.format(s.pct)} %, ${formatTick(s.value)} kg`).join('; ')}. Total ${this.totalText()} ${this.unit()}`);

  protected pctText(slice: ShareSlice): string {
    return PCT.format(slice.pct);
  }

  protected kg(slice: ShareSlice): string {
    return formatTick(slice.value);
  }
}
