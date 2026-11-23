import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ResourceStatus } from '../../core/org/scoped-resource';
import { Footprint } from '../../domain/models/footprint';
import { ImportCounts } from '../../domain/models/imports';
import { ACCENT_CARD_STYLES } from '../../shared/ui/accent-card.styles';
import { HEADER_CHIP_STYLES } from '../../shared/ui/icon-chip.styles';
import { createRotation } from '../../shared/ui/rotation';
import { ROUTES_ATTRIBUTION } from '../imports/imports.labels';
import { coverageHint, measuredEstimatedHint, measuredEstimatedLine, tripsInScope, withPossibleDuplicates } from '../../shared/ui/footprint.format';
import { hasEmissions, noEmissionsText } from './footprint.view';
import { fuelResults, totalsView } from './result.view';

const LEAF = 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19c2-5 6-8 10-10';
const ROUTE = 'M6 19a2 2 0 1 0 .01 0M18 5a2 2 0 1 0 .01 0M8 19h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6';
const BOX = 'M3 7.5L12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9';

/**
 * Tarjeta «Resultado del periodo»: la protagonista del Resumen: la misma receta visual que «Factor de emisión» (fondo claro, degradado suave en la esquina, filete de 3 px, borde fino) con el verde autorizado de LOGYCA (aguamarina) como color de marca. Mitad izquierda: kg CO₂ por combustible del periodo (con su consumo), que rota igual
 * que «Factor de emisión» (cada 3 s, tres segmentos, pausas), y una línea corta «Medido · Estimado»; si el resultado es parcial lo marca con «Parcial» junto al periodo.
 * Sin viajes calculados muestra el estado vacío, sin rotación ni cifras inventadas. Mitad derecha: distancia total y carga transportada del periodo elegido (datos reales del Excel, sumando solo los viajes que
 * las traen). Presentacional: los counts los comparte `ImportsOverviewFacade` y la huella `FootprintFacade`.
 */
@Component({
  selector: 'app-period-result-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(mouseenter)': 'rotation.hovering.set(true)',
    '(mouseleave)': 'rotation.hovering.set(false)',
    '(focusin)': 'rotation.focused.set(true)',
    '(focusout)': 'rotation.leaveFocus($event)',
  },
  styles: [
    HEADER_CHIP_STYLES,
    ACCENT_CARD_STYLES,
    `
      :host { display: block; min-width: 0; }
      /* Misma receta visual que «Factor de emisión» (ACCENT_CARD_STYLES) con el verde autorizado (aguamarina) como color de marca: es la tarjeta protagonista. */
      .rc { --card-accent: var(--c-secondary); position: relative; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 190px; padding: 14px 18px; border-color: color-mix(in srgb, var(--card-accent) 40%, var(--c-sf)); border-top-color: var(--card-accent); box-shadow: 0 10px 24px color-mix(in srgb, var(--card-accent) 20%, transparent), var(--shadow); container-type: inline-size; }
      .head { display: flex; align-items: center; gap: 12px; min-width: 0; padding-right: 30px; --tone: var(--c-success); --chip-bg: color-mix(in srgb, var(--card-accent) 20%, var(--c-sf)); }
      .ht { min-width: 0; }
      h2 { margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--c-head); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sub { display: flex; align-items: center; gap: 8px; margin: 2px 0 0; min-width: 0; font-size: 0.78rem; color: var(--c-text2); }
      .pchip { flex: none; padding: 1px 9px; border-radius: 999px; background: color-mix(in srgb, var(--card-accent) 14%, var(--c-sf)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--card-accent) 40%, var(--c-sf)); color: var(--c-head); font-size: 0.72rem; font-weight: 700; white-space: nowrap; }
      .halves { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 18px; align-items: stretch; }
      .sep { width: 1px; background: var(--c-bd); }
      .half { display: flex; flex-direction: column; justify-content: space-between; gap: 4px; min-width: 0; }
      .row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 8px; min-width: 0; }
      .big { font-size: 2.5rem; font-weight: 750; line-height: 1.05; letter-spacing: -0.03em; color: var(--c-head); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
      .big.none { color: var(--c-mute2); }
      .unit { font-size: 0.95rem; font-weight: 700; color: var(--c-text2); white-space: nowrap; }
      .fuel { display: flex; align-items: center; gap: 8px; margin-top: 4px; min-width: 0; font-size: 0.86rem; font-weight: 600; color: var(--c-text2); }
      .fuel .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .share { flex: none; padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--card-accent) 14%, var(--c-sf)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--card-accent) 40%, var(--c-sf)); color: var(--c-head); font-size: 0.72rem; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .split { display: flex; gap: 2px; height: 4px; border-radius: 3px; overflow: hidden; background: var(--c-s3); }
      .split i { display: block; min-width: 0; }
      .split i.m { background: var(--c-success); }
      .split i.e { background: color-mix(in srgb, var(--card-accent) 40%, var(--c-sf)); }
      .pchip.partial { background: var(--c-sf); box-shadow: inset 0 0 0 1px var(--c-primary); }
      .note { display: block; font-size: 0.74rem; line-height: 1.2; color: var(--c-text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .wait { display: flex; align-items: center; gap: 12px; }
      .leaf { flex: none; width: 36px; height: 36px; fill: color-mix(in srgb, var(--card-accent) 14%, transparent); stroke: var(--c-success); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; opacity: 0.7; }
      .help { display: block; font-size: 0.78rem; color: var(--c-text2); }
      .metrics { flex: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 6px; margin: 0; min-width: 0; }
      .metric { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 12px; min-width: 0; }
      .metric .ic { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: color-mix(in srgb, var(--card-accent) 20%, var(--c-sf)); color: var(--c-success); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--card-accent) 40%, var(--c-sf)); }
      .metric .ic svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
      .metric .tx { display: grid; min-width: 0; }
      .metric dt { font-size: 0.78rem; font-weight: 600; line-height: 1.2; color: var(--c-text2); }
      .metric dd { margin: 0; min-width: 0; }
      .metric .v { font-size: 1.4rem; font-weight: 750; line-height: 1.1; letter-spacing: -0.02em; color: var(--c-head); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
      .metric .v.none { color: var(--c-mute2); }
      .pills { display: flex; flex-wrap: nowrap; gap: 8px; min-width: 0; }
      .pill { position: relative; overflow: hidden; flex: 0 1 auto; min-width: 0; display: inline-flex; align-items: center; padding: 5px 12px 7px; border: 1px solid var(--c-bd); border-radius: 999px; background: var(--c-s2); color: var(--c-text2); font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
      .pill .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pill[aria-current='true'] { background: color-mix(in srgb, var(--card-accent) 14%, var(--c-sf)); border-color: color-mix(in srgb, var(--card-accent) 40%, var(--c-sf)); color: var(--c-head); }
      .pill i { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--card-accent); transform: scaleX(0); transform-origin: left; }
      .pill[aria-current='true'] i { transform: scaleX(1); }
      .pill.running[aria-current='true'] i { animation: fill var(--dur) linear both; }
      .pill:focus-visible, .pause:focus-visible, .retry:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 3px; }
      .pause { position: absolute; top: 14px; right: 14px; display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--c-mu); cursor: pointer; }
      .pause:hover { background: var(--c-s3); color: var(--c-head); }
      .pause svg { width: 12px; height: 12px; fill: currentColor; }
      .err { margin: 0; font-size: 0.8rem; color: var(--c-danger); }
      .retry { margin-left: 6px; padding: 0 8px; border: 1px solid var(--c-bd); border-radius: 6px; background: var(--c-sf); color: var(--c-head); font: inherit; font-size: 0.75rem; cursor: pointer; }
      @media (prefers-reduced-motion: no-preference) { .swap { animation: swap 0.22s ease-out both; } }
      @keyframes swap { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      @keyframes fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      @container (max-width: 359px) { .pill .t { display: none; } .pill { width: 28px; height: 10px; padding: 0; } }
      @media (max-width: 560px) { .halves { grid-template-columns: minmax(0, 1fr); } .sep { width: auto; height: 1px; } }
    `,
  ],
  template: `
    <section class="rc acard" aria-labelledby="rc-title" [attr.title]="attribution()" [attr.aria-describedby]="totals().distance.extra ? 'rc-routes' : null" data-testid="period-result">
      <header class="head hdr">
        <span class="ico chip" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="leafIcon" /></svg></span>
        <div class="ht">
          <h2 id="rc-title">Resultado del periodo</h2>
          <p class="sub">Huella del periodo @if (periodLabel(); as label) { <span class="pchip" data-testid="result-period">{{ label }}</span> }@if (partial()) { <span class="pchip partial" data-testid="result-partial" [attr.title]="partialHint()">Parcial</span> }@if (partialHint()) { <span class="sr-only" data-testid="result-partial-hint">{{ partialHint() }}</span> }</p>
        </div>
      </header>
      <div class="halves">
        <div class="half" data-testid="result-fuel">
          @switch (footprintStatus()) {
            @case ('error') { <p class="err" role="alert" data-testid="result-fuel-error">No se pudo cargar. <button type="button" class="retry" (click)="retryFootprint.emit()">Reintentar</button></p> }
            @case ('ready') {
              @if (current(); as fuel) {
                <div>
                  <div [attr.aria-live]="rotation.live()" aria-atomic="true" data-testid="result-live">
                    @for (code of [fuel.fuelCode]; track code) {
                      <div class="swap">
                        <span class="row"><b class="big" data-testid="result-value">{{ fuel.value }}</b><span class="unit" data-testid="result-unit">{{ fuel.unit }}</span></span>
                        <span class="fuel"><span class="nm" data-testid="result-fuel-name" [attr.title]="fuel.name + (fuel.consumption ? ' · ' + fuel.consumption : '')">{{ fuel.name }}@if (fuel.consumption) { <span data-testid="result-consumption"> · {{ fuel.consumption }}</span> }</span>@if (fuel.share) { <span class="share" data-testid="result-share" [attr.title]="fuel.share + ' % del total de kg CO₂ del periodo'">{{ fuel.share }} %</span> }</span>
                      </div>
                    }
                  </div>
                </div>
                @if (items().length > 1) {
                  <div class="pills" role="group" aria-label="Combustible">
                    @for (f of items(); track f.fuelCode; let i = $index) {
                      <button type="button" class="pill" [class.running]="rotation.running()" [attr.aria-current]="i === rotation.index()" [attr.aria-label]="f.name" [attr.title]="f.name" [attr.data-testid]="'result-segment-' + i" [style.--dur.ms]="rotation.intervalMs" (click)="rotation.select(i)">
                        <span class="t">{{ shortName(f.name) }}</span>
                        @for (c of [rotation.cycle()]; track c) { <i></i> }
                      </button>
                    }
                  </div>
                }
                @if (split(); as s) { <span class="split" aria-hidden="true" data-testid="result-split"><i class="m" [style.flex-grow]="s.measured"></i><i class="e" [style.flex-grow]="s.estimated"></i></span> }
                @if (measured(); as m) { <span class="note" data-testid="result-measured" [attr.title]="m.hint">{{ m.line }}<span class="sr-only" data-testid="result-measured-hint">. {{ m.hint }}</span></span> }
              } @else {
                <div class="wait">
                  <svg class="leaf" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="leafIcon" /></svg>
                  <div>
                    <b class="big none" data-testid="result-value">—</b>
                    <span class="note" data-testid="result-pending" [attr.title]="pending()">{{ pending() }}</span>
                  </div>
                </div>
                <span class="help" data-testid="result-help">Aquí verás tus kg CO₂ por combustible: gasolina, GNC y los demás.</span>
              }
            }
            @default { <span class="skeleton" style="height: 22px" role="status" aria-busy="true"><span class="sr-only">Cargando…</span></span> }
          }
        </div>
        <span class="sep" aria-hidden="true"></span>
        <div class="half">
          @switch (status()) {
            @case ('error') { <p class="err" role="alert" data-testid="result-error">No se pudo cargar. <button type="button" class="retry" (click)="retry.emit()">Reintentar</button></p> }
            @case ('ready') {
              <dl class="metrics" data-testid="result-totals">
                <div class="metric" data-testid="result-distance">
                  <span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="routeIcon" /></svg></span>
                  <span class="tx">
                    <dt>Distancia total</dt>
                    <dd>
                      <span class="row">@if (totals().distance.value; as v) { <b class="v" data-testid="result-distance-value">{{ v }}</b><span class="unit">{{ totals().distance.unit }}</span> } @else { <b class="v none" data-testid="result-distance-value">—</b> }</span>
                      @if (totals().distance.note) { <span class="note" data-testid="result-distance-note">{{ totals().distance.note }}</span> }
                      @if (totals().distance.extra; as extra) { <span class="sr-only" id="rc-routes" data-testid="result-distance-routes">{{ extra }}</span> }
                    </dd>
                  </span>
                </div>
                <div class="metric" data-testid="result-cargo">
                  <span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="boxIcon" /></svg></span>
                  <span class="tx">
                    <dt>Carga transportada</dt>
                    <dd>
                      <span class="row">@if (totals().cargo.value; as v) { <b class="v" data-testid="result-cargo-value">{{ v }}</b><span class="unit">{{ totals().cargo.unit }}</span> } @else { <b class="v none" data-testid="result-cargo-value">—</b> }</span>
                      @if (totals().cargo.note) { <span class="note" data-testid="result-cargo-note">{{ totals().cargo.note }}</span> }
                    </dd>
                  </span>
                </div>
              </dl>
            }
            @default { <span class="skeleton" style="height: 22px" role="status" aria-busy="true"><span class="sr-only">Cargando…</span></span> }
          }
        </div>
      </div>
      @if (items().length > 1) {
        <button type="button" class="pause" [attr.aria-pressed]="rotation.manualPause()" [attr.aria-label]="rotation.manualPause() ? 'Reanudar rotación' : 'Pausar rotación'" data-testid="result-pause" (click)="rotation.manualPause.set(!rotation.manualPause())">
          @if (rotation.manualPause()) { <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg> } @else { <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg> }
        </button>
      }
    </section>
  `,
})
export class ResultCardComponent {
  /** Huella del periodo elegido; `null` mientras no se haya pedido (estado «pendiente»). */
  readonly footprint = input<Footprint | null>(null);
  /** Estado de la petición de la huella (la mitad izquierda); la derecha usa `status` (counts). */
  readonly footprintStatus = input<ResourceStatus>('ready');
  /** Counts del periodo elegido (compartidos con las demás tarjetas); `null` sin permiso o sin datos. */
  readonly counts = input<ImportCounts | null>(null);
  readonly periodLabel = input<string | null>(null);
  readonly status = input<ResourceStatus>('ready');
  readonly retry = output();
  readonly retryFootprint = output();

  protected readonly pending = computed(() => noEmissionsText(this.footprint()));
  protected readonly leafIcon = LEAF;
  protected readonly routeIcon = ROUTE;
  protected readonly boxIcon = BOX;
  protected readonly items = computed(() => fuelResults(hasEmissions(this.footprint()) ? this.footprint()?.byFuel ?? null : null));
  protected readonly rotation = createRotation({ count: () => this.items().length, active: () => true });
  protected readonly current = computed(() => this.items()[this.rotation.index() % Math.max(1, this.items().length)] ?? null);
  protected readonly totals = computed(() => totalsView(this.counts()));
  protected readonly partial = computed(() => hasEmissions(this.footprint()) && (this.footprint()?.totals.partial ?? false));
  protected readonly partialHint = computed(() => {
    const t = this.footprint()?.totals;

    return t && hasEmissions(this.footprint()) ? withPossibleDuplicates(this.partial() ? coverageHint(t.tripsCalculated, tripsInScope(t), t.coverageTripsPct) : null, t.tripsPossibleDuplicate) : null;
  });
  /** «Medido X kg · Estimado Y kg» con su explicación completa; solo con emisiones calculadas. */
  protected readonly measured = computed(() => {
    const f = this.footprint();

    return hasEmissions(f) ? { line: measuredEstimatedLine(f.totals), hint: measuredEstimatedHint(f.totals) } : null;
  });
  /** Proporción medido / estimado del total (barra fina sobre la línea «Medido · Estimado»); solo si hay algo calculado. */
  protected readonly split = computed(() => {
    const t = this.footprint()?.totals;

    return hasEmissions(this.footprint()) && t && t.measuredKgCo2 + t.estimatedKgCo2 > 0 ? { measured: Math.max(t.measuredKgCo2, 0), estimated: Math.max(t.estimatedKgCo2, 0) } : null;
  });
  /**
   * Con distancias por ruta, «de ellos N km calculados por ruta (aprox.)» y la atribución de los datos van en el `title` de la tarjeta y en su descripción
   * accesible (`aria-describedby`): una línea visible más haría crecer la tarjeta por encima de ≈ 215 px.
   */
  protected readonly attribution = computed(() => {
    const extra = this.totals().distance.extra;

    return extra ? `${extra}. ${ROUTES_ATTRIBUTION}` : null;
  });

  /** Nombre corto para las píldoras: sin la aclaración entre paréntesis. */
  protected shortName(name: string): string {
    return name.replace(/\s*\(.*\)\s*$/, '').trim() || name;
  }
}
