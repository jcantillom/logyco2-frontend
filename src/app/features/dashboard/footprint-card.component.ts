import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResourceStatus } from '../../core/org/scoped-resource';
import { FootprintSummary } from '../../domain/models/footprint';
import { ICON_CHIP_STYLES } from '../../shared/ui/icon-chip.styles';
import { footprintView } from './footprint.view';

const LEAF = 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19c2-5 6-8 10-10';
const PENDING = 'Se activa al calcular tu huella';
const DIRECTION_TEXT = { down: 'bajó', up: 'subió', flat: 'sin cambio' } as const;

/**
 * Tarjeta «Huella de carbono» del Resumen: la huella del último periodo cerrado (o la del actual si no hay uno anterior), con su variación contra
 * el periodo previo. Es presentacional: recibe el dato ya calculado (`summary`) y hoy llega `null` (estado «pendiente») porque el backend aún no
 * calcula emisiones; nunca inventa cifras. Con `link` es un enlace.
 */
@Component({
  selector: 'app-footprint-card',
  imports: [NgTemplateOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; min-width: 0; }
      .fp { all: unset; box-sizing: border-box; display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: 'ico top' 'num num' 'delta delta' 'foot foot'; align-items: center; column-gap: 10px; row-gap: 6px; height: 100%; min-height: 96px; padding: 14px 16px; border: 1px solid color-mix(in srgb, var(--c-primary) 20%, var(--c-sf)); border-radius: 18px; background: linear-gradient(160deg, var(--c-ok-soft), var(--c-sf) 70%); box-shadow: var(--shadow); cursor: default; transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s; }
      a.fp { cursor: pointer; }
      a.fp:hover { border-color: color-mix(in srgb, var(--c-primary) 40%, var(--c-sf)); box-shadow: 0 10px 22px color-mix(in srgb, var(--c-head) 20%, transparent); transform: translateY(-2px); }
      a.fp:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .top { grid-area: top; display: flex; align-items: center; gap: 10px; min-width: 0; }
      .ico { grid-area: ico; display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 12px; background: var(--c-sf); color: var(--c-primary); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-primary) 20%, transparent); }
      .ico svg { width: 20px; height: 20px; fill: color-mix(in srgb, currentColor 14%, transparent); stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
      .label { flex: 1; min-width: 0; font-size: 0.88rem; font-weight: 600; color: var(--c-text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .period { flex: none; padding: 2px 10px; border-radius: 999px; background: var(--c-sf); box-shadow: inset 0 0 0 1px var(--c-bd); color: var(--c-text2); font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
      .num { grid-area: num; display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 8px; min-width: 0; }
      .value { font-size: 1.7rem; font-weight: 800; line-height: 1.1; letter-spacing: -0.03em; color: var(--c-head); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
      .value.none { color: var(--c-mute2); }
      .unit { font-size: 0.82rem; font-weight: 700; color: var(--c-mu); white-space: nowrap; }
      .delta { grid-area: delta; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; min-height: 22px; font-size: 0.78rem; color: var(--c-mu); }
      .badge-v { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-weight: 800; white-space: nowrap; background: var(--c-s3); color: var(--c-text2); }
      .badge-v.down { background: color-mix(in srgb, var(--c-secondary) 14%, var(--c-sf)); color: color-mix(in srgb, var(--c-secondary) 80%, var(--c-head)); }
      .badge-v.up { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); color: color-mix(in srgb, var(--c-primary) 80%, var(--c-head)); }
      .foot { grid-area: foot; font-size: 0.78rem; color: var(--c-mu); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .err, .skeleton { grid-area: num; }
      .err { margin: 0; font-size: 0.85rem; color: var(--c-danger); }
      .err button { margin-left: 6px; padding: 0 8px; border: 1px solid var(--c-bd); border-radius: 6px; background: var(--c-sf); color: var(--c-head); font: inherit; font-size: 0.78rem; cursor: pointer; }
      /* Versión compacta (size="sm"): ≈ 80 px, ícono a la izquierda y tres líneas (etiqueta y periodo · cifra · variación o pie). */
      .fp.sm { grid-template-areas: 'ico top' 'ico num' 'ico delta'; min-height: 0; padding: 10px 14px; column-gap: 12px; row-gap: 0; border-radius: 14px; }
      .fp.sm .ico { align-self: center; }
      .fp.sm .label { font-size: 0.8rem; }
      .fp.sm .period { padding: 1px 8px; font-size: 0.68rem; }
      .fp.sm .value { font-size: 1.5rem; }
      .fp.sm .num { gap: 0 6px; }
      .fp.sm .unit { font-size: 0.7rem; }
      .fp.sm .delta { min-height: 0; font-size: 0.74rem; flex-wrap: nowrap; overflow: hidden; white-space: nowrap; }
      .fp.sm .badge-v { padding: 0 6px; }
      .fp.sm .foot { grid-area: delta; font-size: 0.74rem; }
      .fp.sm .err { font-size: 0.78rem; }
      @media (prefers-reduced-motion: reduce) { .fp { transition: none; } a.fp:hover { transform: none; } }
    `,
    ICON_CHIP_STYLES,
  ],
  template: `
    @if (link(); as target) {
      <a class="fp" [class.sm]="size() === 'sm'" [routerLink]="target" [attr.aria-label]="accessibleName()" data-testid="footprint"><ng-container *ngTemplateOutlet="body" /></a>
    } @else {
      <div class="fp" [class.sm]="size() === 'sm'" role="group" [attr.aria-label]="accessibleName()" data-testid="footprint"><ng-container *ngTemplateOutlet="body" /></div>
    }
    <ng-template #body>
      <span class="ico" [class.chip]="size() === 'sm'" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="leaf" /></svg></span>
      <span class="top">
        <span class="label">Huella de carbono</span>
        @if (status() === 'ready' && view(); as v) { <span class="period" data-testid="footprint-period">{{ v.periodLabel }}</span> }
      </span>
      @switch (status()) {
        @case ('error') { <p class="err" role="alert">No se pudo cargar. <button type="button" (click)="retry.emit()">Reintentar</button></p> }
        @case ('ready') {
          @if (view(); as v) {
            <span class="num"><b class="value" data-testid="kpi-value">{{ v.value }}</b><span class="unit" data-testid="footprint-unit">{{ v.unit }}</span></span>
            <span class="delta" data-testid="footprint-delta" [attr.title]="foot(v.isPrevious)">
              @if (v.variation; as d) {
                <span class="badge-v" [class]="'badge-v ' + d.direction" [attr.data-direction]="d.direction" data-testid="footprint-variation"><span aria-hidden="true">{{ arrow(d.direction) }}</span>{{ d.text }}</span>
                <span>vs. periodo anterior</span>
              } @else {
                <span data-testid="footprint-note">{{ v.note }}</span>
              }
            </span>
            @if (size() === 'md') { <span class="foot" data-testid="footprint-foot">{{ foot(v.isPrevious) }}</span> }
          } @else {
            <span class="num"><b class="value none" data-testid="kpi-value">—</b></span>
            <span class="foot" data-testid="footprint-foot" [attr.title]="pending">{{ pending }}</span>
          }
        }
        @default { <span class="skeleton" style="height: 28px" role="status" aria-busy="true"><span class="sr-only">Cargando…</span></span> }
      }
    </ng-template>
  `,
})
export class FootprintCardComponent {
  /** Huella calculada por periodo; `null` mientras no exista el cálculo (estado «pendiente»). */
  readonly summary = input<FootprintSummary | null>(null);
  readonly status = input<ResourceStatus>('ready');
  readonly link = input<string | null>(null);
  /** `sm`: versión compacta (≈ 80 px) para la fila de resumen; `md` es el tamaño normal. */
  readonly size = input<'md' | 'sm'>('md');
  readonly retry = output();

  protected readonly leaf = LEAF;
  protected readonly pending = PENDING;
  protected readonly view = computed(() => footprintView(this.summary()));
  protected readonly accessibleName = computed(() => {
    if (this.status() !== 'ready') return 'Huella de carbono';

    const v = this.view();

    if (!v) return `Huella de carbono: sin calcular. ${PENDING}`;

    const change = v.variation ? `${DIRECTION_TEXT[v.variation.direction]} ${v.variation.text} frente al periodo anterior` : v.note;

    return `Huella de carbono: ${v.value} ${v.unit}, ${v.periodLabel}, ${change}`;
  });

  protected foot(isPrevious: boolean): string {
    return isPrevious ? 'Calculada en el periodo anterior' : 'Calculada en el periodo actual';
  }

  protected arrow(direction: 'down' | 'up' | 'flat'): string {
    return direction === 'down' ? '▼' : direction === 'up' ? '▲' : '■';
  }
}
