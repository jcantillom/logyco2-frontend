import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ACCENT_CARD_STYLES } from '../../shared/ui/accent-card.styles';
import { HEADER_CHIP_STYLES } from '../../shared/ui/icon-chip.styles';
import { ROTATION_MS, createRotation } from '../../shared/ui/rotation';
import { EmissionsFacade } from './emissions.facade';
import { FACTOR_PILLS, factorValue, unitLabel } from './emissions.format';

/** Cada cuánto cambia el combustible que muestra la tarjeta (milisegundos). */
export const FACTOR_ROTATION_MS = ROTATION_MS;


/**
 * Tarjeta «Factor de emisión» (resumen de la consola de plataforma y de la empresa): rota entre los combustibles que entrega la API (uno cada `FACTOR_ROTATION_MS`) con una barra de
 * progreso por combustible. Se detiene con el cursor o el foco dentro, con el botón de pausa y con la pestaña oculta; con «reducir movimiento»
 * no rota sola. Los puntos permiten saltar a un combustible. Los valores salen de la API sin ninguna constante de negocio.
 */
@Component({
  selector: 'app-factor-rotator-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(mouseenter)': 'hovering.set(true)',
    '(mouseleave)': 'hovering.set(false)',
    '(focusin)': 'focused.set(true)',
    '(focusout)': 'leaveFocus($event)',
    '[class.tile]': "appearance() === 'tile'",
  },
  styles: [HEADER_CHIP_STYLES, ACCENT_CARD_STYLES, `
    :host { display: block; min-width: 0; }
    /* En la consola de plataforma la tarjeta usa las clases de las vecinas (kpi, label, ico, hint): su rejilla, tamaños, radio y tinte salen de la hoja global. */
    .kpi { position: relative; height: 100%; }
    .vals { grid-area: line; display: flex; flex-direction: column; justify-content: center; gap: 6px; min-width: 0; }
    .row { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    .num { font-variant-numeric: tabular-nums; }
    .unit { font-size: 0.95rem; font-weight: 700; white-space: nowrap; color: var(--c-mu); }
    .msg { margin: 0; font-size: 1rem; font-weight: 650; line-height: 1.2; color: var(--c-head); }
    .badge { flex: none; padding: 2px 8px; font-size: 0.68rem; font-weight: 800; }
    .hint { display: flex; align-items: center; gap: 8px; }
    .side { grid-area: ico; align-self: center; display: flex; align-items: center; margin-left: auto; padding-left: clamp(10px, 1.6vw, 22px); border-left: 1px dashed color-mix(in srgb, var(--c-head) 20%, transparent); }
    /* Mismo trazo y tamaño que el glifo de las vecinas (sin la clase «i», cuya regla global lo agranda a 30 px). */
    /* Centrado del glifo en el cuadro (en las vecinas lo da el CSS del Resumen, que no llega a esta plantilla). */
    .ico { display: grid; place-items: center; padding: 0; }
    .ico svg { display: block; flex: none; width: 19px; height: 19px; fill: color-mix(in srgb, currentColor 14%, transparent); stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    .pause { position: absolute; top: 6px; right: 6px; display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--c-mu); cursor: pointer; }
    .pause:hover { background: var(--c-s3); color: var(--c-head); }
    .pause svg { width: 12px; height: 12px; fill: currentColor; }
    /* Indicador discreto: tres segmentos cortos (24 × 3 px) con un área de toque ampliada. */
    .bar { display: inline-flex; align-self: flex-start; gap: 6px; }
    .seg { position: relative; width: 24px; height: 3px; padding: 0; border: 0; border-radius: 999px; background: var(--c-s3); overflow: visible; cursor: pointer; }
    .seg::after { content: ''; position: absolute; inset: -11px -3px; }
    .seg i { position: absolute; inset: 0; border-radius: 999px; background: var(--c-primary); transform: scaleX(0); transform-origin: left; }
    .seg.done i, .seg[aria-current='true'] i { transform: scaleX(1); }
    .seg.running[aria-current='true'] i { animation: fill var(--dur) linear both; }
    .skeleton-block { grid-area: line; height: 40px; width: 100%; }
    .error { grid-area: line; display: flex; align-items: center; gap: 8px; margin: 0; font-size: 0.8rem; color: var(--c-danger); }
    .error button { padding: 0 8px; border: 1px solid var(--c-bd); border-radius: 6px; background: var(--c-sf); color: var(--c-head); font: inherit; font-size: 0.75rem; cursor: pointer; }
    @media (prefers-reduced-motion: no-preference) {
      .swap { animation: swap 0.22s ease-out both; }
    }
    /* Aspecto «tile» (espacio de empresa): tarjeta grande con filete de marca arriba, cabecera con chip de ícono, cifra protagonista y píldoras rotuladas. */
    :host(.tile) .ft { position: relative; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; height: 100%; min-height: 190px; padding: 16px 18px; container-type: inline-size; }
    :host(.tile) .fh { display: flex; align-items: center; gap: 12px; min-width: 0; padding-right: 30px; }
    :host(.tile) .ht { min-width: 0; }
    :host(.tile) .ht h2 { margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--c-head); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :host(.tile) .ht p { margin: 1px 0 0; font-size: 0.78rem; color: var(--c-mu); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :host(.tile) .pause { top: 14px; right: 14px; }
    :host(.tile) .pause:focus-visible, :host(.tile) .pill:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
    :host(.tile) .fb { flex: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; min-width: 0; }
    :host(.tile) .vals { gap: 8px; }
    :host(.tile) .value { font-size: 2.3rem; font-weight: 750; line-height: 1.05; letter-spacing: -0.03em; color: var(--c-head); white-space: nowrap; }
    :host(.tile) .unit { font-size: 0.95rem; }
    :host(.tile) .hint { font-size: 0.86rem; font-weight: 600; color: var(--c-text2); }
    :host(.tile) .pills { display: flex; flex-wrap: wrap; gap: 8px; }
    :host(.tile) .pill { position: relative; overflow: hidden; display: inline-flex; align-items: center; padding: 5px 12px 7px; border: 1px solid var(--c-bd); border-radius: 999px; background: var(--c-s2); color: var(--c-text2); font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
    :host(.tile) .pill[aria-current='true'] { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); border-color: color-mix(in srgb, var(--c-primary) 40%, var(--c-sf)); color: var(--c-head); }
    :host(.tile) .pill i { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--c-primary); transform: scaleX(0); transform-origin: left; }
    :host(.tile) .pill[aria-current='true'] i { transform: scaleX(1); }
    :host(.tile) .pill.running[aria-current='true'] i { animation: fill var(--dur) linear both; }
    :host(.tile) .skeleton-block { height: 70px; }
    @container (max-width: 359px) { :host(.tile) .pill .t { display: none; } :host(.tile) .pill { width: 28px; height: 10px; padding: 0; } }
    @keyframes swap { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @keyframes fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  `],
  template: `
    @if (appearance() === 'tile') {
      <section class="ft acard" aria-labelledby="frc-title" data-testid="kpi-emission-factor">
        <header class="fh hdr">
          <span class="ico chip" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="6" y="3" width="10" height="18" rx="2" /><path d="M4 21h14M8 8h6M16 9h1.5a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8.5L20 6" fill="none" /></svg></span>
          <div class="ht"><h2 id="frc-title">Factor de emisión</h2><p>Valor de referencia por combustible</p></div>
        </header>
        <div class="fb">
          @switch (facade.fuels.status()) {
            @case ('error') {
              <p class="error" role="alert" data-testid="factor-error"><span>{{ facade.fuels.error()?.message }}</span><button type="button" (click)="facade.loadFuels()">Reintentar</button></p>
            }
            @case ('ready') {
              @if (current(); as fuel) {
                <div class="vals" data-testid="factor-values">
                  <div class="fade" [attr.aria-live]="live()" aria-atomic="true" data-testid="factor-live">
                    @for (code of [fuel.fuelCode]; track code) {
                      <div class="swap">
                        @if (value(); as v) {
                          <span class="row"><strong class="value num" data-testid="factor-value">{{ v }}</strong><span class="unit" data-testid="factor-unit">{{ unit() }}</span></span>
                        } @else {
                          <p class="msg" data-testid="factor-message">{{ fuel.status === 'INVALID_CONFIGURATION' ? 'Configuración inválida' : 'Factor pendiente de configuración' }}</p>
                        }
                      </div>
                    }
                  </div>
                  <span class="hint" data-testid="factor-caption"><span data-testid="factor-fuel">{{ fuel.name }}</span><span class="badge" [class]="pill().badge" data-testid="factor-status">{{ pill().text }}</span></span>
                </div>
                <div class="pills" role="group" aria-label="Combustible">
                  @for (f of fuels(); track f.fuelCode; let i = $index) {
                    <button type="button" class="pill" [class.running]="running()" [attr.aria-current]="i === index()" [attr.aria-label]="f.name" [attr.title]="f.name" [attr.data-testid]="'factor-segment-' + i" [style.--dur.ms]="rotationMs" (click)="select(i)">
                      <span class="t">{{ shortName(f.name) }}</span>
                      @for (c of [cycle()]; track c) { <i></i> }
                    </button>
                  }
                </div>
              }
            }
            @default {
              <span class="skeleton skeleton-block" role="status" aria-busy="true"><span class="sr-only">Cargando…</span></span>
            }
          }
        </div>
        <button type="button" class="pause" [attr.aria-pressed]="manualPause()" [attr.aria-label]="manualPause() ? 'Reanudar rotación' : 'Pausar rotación'" data-testid="factor-pause" (click)="manualPause.set(!manualPause())">
          @if (manualPause()) { <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg> } @else { <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg> }
        </button>
      </section>
    } @else {
    <section class="kpi" aria-labelledby="frc-title" data-testid="kpi-emission-factor">
      <h2 class="label" id="frc-title">Factor de emisión</h2>
      @switch (facade.fuels.status()) {
        @case ('error') {
          <p class="error" role="alert" data-testid="factor-error"><span>{{ facade.fuels.error()?.message }}</span><button type="button" (click)="facade.loadFuels()">Reintentar</button></p>
        }
        @case ('ready') {
          @if (current(); as fuel) {
            <div class="vals" data-testid="factor-values">
              <div class="fade" [attr.aria-live]="live()" aria-atomic="true" data-testid="factor-live">
                @for (code of [fuel.fuelCode]; track code) {
                  <div class="swap">
                    @if (value(); as v) {
                      <span class="row"><strong class="value num" data-testid="factor-value">{{ v }}</strong><span class="unit" data-testid="factor-unit">{{ unit() }}</span></span>
                    } @else {
                      <p class="msg" data-testid="factor-message">{{ fuel.status === 'INVALID_CONFIGURATION' ? 'Configuración inválida' : 'Factor pendiente de configuración' }}</p>
                    }
                  </div>
                }
              </div>
              <div class="bar" role="group" aria-label="Combustible">
                @for (f of fuels(); track f.fuelCode; let i = $index) {
                  <button type="button" class="seg" [class.running]="running()" [class.done]="i < index()" [attr.aria-current]="i === index()" [attr.aria-label]="f.name" [attr.data-testid]="'factor-segment-' + i" [style.--dur.ms]="rotationMs" (click)="select(i)">
                    @for (c of [cycle()]; track c) { <i></i> }
                  </button>
                }
              </div>
            </div>
            <span class="hint" data-testid="factor-caption"><span data-testid="factor-fuel">{{ fuel.name }}</span><span class="badge" [class]="pill().badge" data-testid="factor-status">{{ pill().text }}</span></span>
          }
        }
        @default {
          <span class="skeleton skeleton-block" role="status" aria-busy="true"><span class="sr-only">Cargando…</span></span>
        }
      }
      <span class="side"><span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="6" y="3" width="10" height="18" rx="2" /><path d="M4 21h14M8 8h6M16 9h1.5a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8.5L20 6" fill="none" /></svg></span></span>
      <button type="button" class="pause" [attr.aria-pressed]="manualPause()" [attr.aria-label]="manualPause() ? 'Reanudar rotación' : 'Pausar rotación'" data-testid="factor-pause" (click)="manualPause.set(!manualPause())">
        @if (manualPause()) { <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg> } @else { <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg> }
      </button>
    </section>
    }
  `,
})
export class FactorRotatorCardComponent {
  /** `console`: aspecto de la consola de plataforma (hojas globales); `tile`: aspecto de las tarjetas de indicador del espacio de empresa. */
  readonly appearance = input<'console' | 'tile'>('console');

  protected readonly facade = inject(EmissionsFacade);

  protected readonly fuels = computed(() => this.facade.fuels.data() ?? []);
  /** Rotación compartida con «Resultado del periodo»: 3 s, pausas y «reducir movimiento». */
  protected readonly rotation = createRotation({ count: () => this.fuels().length, active: () => this.facade.fuels.status() === 'ready' });
  protected readonly rotationMs = FACTOR_ROTATION_MS;
  protected readonly index = this.rotation.index;
  protected readonly manualPause = this.rotation.manualPause;
  protected readonly hovering = this.rotation.hovering;
  protected readonly focused = this.rotation.focused;
  protected readonly cycle = this.rotation.cycle;
  protected readonly live = this.rotation.live;
  protected readonly running = this.rotation.running;

  protected readonly current = computed(() => this.fuels()[this.index() % Math.max(1, this.fuels().length)] ?? null);
  protected readonly value = computed(() => {
    const fuel = this.current();

    return fuel ? factorValue(fuel) : null;
  });
  protected readonly unit = computed(() => unitLabel(this.current()?.unit ?? ''));
  protected readonly pill = computed(() => FACTOR_PILLS[this.current()?.status ?? 'NOT_CONFIGURED']);

  constructor() {
    this.facade.loadFuels();
  }

  /** Nombre corto para las píldoras: sin la aclaración entre paréntesis («Gasolina motor (sin mezcla)» → «Gasolina motor»). */
  protected shortName(name: string): string {
    return name.replace(/\s*\(.*\)\s*$/, '').trim() || name;
  }

  protected select(position: number): void {
    this.rotation.select(position);
  }

  protected leaveFocus(event: FocusEvent): void {
    this.rotation.leaveFocus(event);
  }
}
