import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FactorVerification } from '../../domain/models/emissions';
import { EmissionsFacade } from '../emissions/emissions.facade';
import { factorValue, unitLabel } from '../emissions/emissions.format';

/** Cada cuánto cambia el combustible que muestra la tarjeta (milisegundos). */
export const FACTOR_ROTATION_MS = 3000;

const PILLS: Readonly<Record<FactorVerification, { text: string; badge: string }>> = {
  VERIFIED: { text: 'Verificado', badge: 'badge-success' },
  PENDING_VALIDATION: { text: 'Pendiente de validación', badge: 'badge-warning' },
  NOT_CONFIGURED: { text: 'Sin configurar', badge: 'badge-neutral' },
  INVALID_CONFIGURATION: { text: 'Inválido', badge: 'badge-danger' },
};

/**
 * Tarjeta «Factor de emisión» del resumen: rota entre los combustibles que entrega la API (uno cada `FACTOR_ROTATION_MS`) con una barra de
 * progreso por combustible. Se detiene con el cursor o el foco dentro, con el botón de pausa y con la pestaña oculta; con «reducir movimiento»
 * no rota sola. Los puntos permiten saltar a un combustible. Los valores salen de la API sin ninguna constante de negocio.
 */
@Component({
  selector: 'app-platform-factor-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(mouseenter)': 'hovering.set(true)',
    '(mouseleave)': 'hovering.set(false)',
    '(focusin)': 'focused.set(true)',
    '(focusout)': 'leaveFocus($event)',
  },
  styles: [`
    :host { display: block; min-width: 0; }
    /* La tarjeta usa las clases de las vecinas (kpi, label, ico, hint): su rejilla, tamaños, radio y tinte salen de la misma hoja global. */
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
    @keyframes swap { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @keyframes fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  `],
  template: `
    <section class="kpi" aria-labelledby="pfc-title" data-testid="kpi-emission-factor">
      <h2 class="label" id="pfc-title">Factor de emisión</h2>
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
  `,
})
export class PlatformFactorCardComponent {
  protected readonly facade = inject(EmissionsFacade);

  protected readonly rotationMs = FACTOR_ROTATION_MS;
  protected readonly index = signal(0);
  protected readonly manualPause = signal(false);
  protected readonly hovering = signal(false);
  protected readonly focused = signal(false);
  protected readonly hidden = signal(typeof document !== 'undefined' && document.hidden);
  protected readonly reduce = signal(false);
  /** Cambia cada vez que (re)empieza una cuenta atrás: reinicia el temporizador y la barra de progreso. */
  protected readonly cycle = signal(0);
  /** `polite` solo después de elegir un combustible a mano; durante la rotación automática no se anuncia nada. */
  protected readonly live = signal<'off' | 'polite'>('off');

  protected readonly fuels = computed(() => this.facade.fuels.data() ?? []);
  protected readonly current = computed(() => this.fuels()[this.index() % Math.max(1, this.fuels().length)] ?? null);
  protected readonly value = computed(() => {
    const fuel = this.current();

    return fuel ? factorValue(fuel) : null;
  });
  protected readonly unit = computed(() => unitLabel(this.current()?.unit ?? ''));
  protected readonly pill = computed(() => PILLS[this.current()?.status ?? 'NOT_CONFIGURED']);
  protected readonly running = computed(() => this.facade.fuels.status() === 'ready' && this.fuels().length > 1 && !this.reduce() && !this.manualPause() && !this.hovering() && !this.focused() && !this.hidden());

  constructor() {
    this.facade.loadFuels();

    const destroyRef = inject(DestroyRef);
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const onMedia = (): void => this.reduce.set(!!media?.matches);
    const onVisibility = (): void => this.hidden.set(document.hidden);

    onMedia();
    media?.addEventListener?.('change', onMedia);
    document.addEventListener('visibilitychange', onVisibility);
    destroyRef.onDestroy(() => {
      media?.removeEventListener?.('change', onMedia);
      document.removeEventListener('visibilitychange', onVisibility);
    });

    // La cuenta atrás vive en un efecto: se cancela sola al detener la rotación, al cambiar de ciclo y al destruir el componente.
    effect((onCleanup) => {
      if (!this.running()) return;

      this.cycle();
      const timer = setTimeout(() => untracked(() => this.advance()), FACTOR_ROTATION_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected select(position: number): void {
    this.live.set('polite');
    this.index.set(position);
    this.cycle.update((n) => n + 1);
  }

  protected leaveFocus(event: FocusEvent): void {
    const host = event.currentTarget as HTMLElement;
    if (!host.contains(event.relatedTarget as Node | null)) this.focused.set(false);
  }

  private advance(): void {
    this.live.set('off');
    this.index.update((i) => (i + 1) % Math.max(1, this.fuels().length));
    this.cycle.update((n) => n + 1);
  }
}
