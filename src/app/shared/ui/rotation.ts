import { DestroyRef, Signal, computed, effect, inject, signal, untracked } from '@angular/core';

/** Cada cuánto cambia el elemento que muestra una tarjeta rotativa (milisegundos). */
export const ROTATION_MS = 3000;

export interface RotationOptions {
  /** Cuántos elementos hay para rotar. */
  readonly count: () => number;
  /** `false` mientras no haya nada que rotar (cargando, error, sin datos): no corre el temporizador. */
  readonly active: () => boolean;
}

/**
 * Rotación automática de una tarjeta (la comparten «Factor de emisión» y «Resultado del periodo»): cambia de elemento cada `ROTATION_MS`, con un
 * ciclo que reinicia la cuenta y la barra de progreso. Se detiene con el cursor o el foco dentro, con la pausa manual y con la pestaña oculta; con
 * «reducir movimiento» no rota sola. Debe crearse en un contexto de inyección (campo o constructor del componente).
 */
export class Rotation {
  readonly index = signal(0);
  readonly manualPause = signal(false);
  readonly hovering = signal(false);
  readonly focused = signal(false);
  readonly hidden = signal(typeof document !== 'undefined' && document.hidden);
  readonly reduce = signal(false);
  /** Cambia cada vez que (re)empieza una cuenta atrás: reinicia el temporizador y la barra de progreso. */
  readonly cycle = signal(0);
  /** `polite` solo después de elegir a mano; durante la rotación automática no se anuncia nada. */
  readonly live = signal<'off' | 'polite'>('off');
  readonly intervalMs = ROTATION_MS;
  readonly running: Signal<boolean>;

  constructor(private readonly options: RotationOptions) {
    this.running = computed(() => this.options.active() && this.options.count() > 1 && !this.reduce() && !this.manualPause() && !this.hovering() && !this.focused() && !this.hidden());

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
      const timer = setTimeout(() => untracked(() => this.advance()), ROTATION_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  select(position: number): void {
    this.live.set('polite');
    this.index.set(position);
    this.cycle.update((n) => n + 1);
  }

  leaveFocus(event: FocusEvent): void {
    const host = event.currentTarget as HTMLElement;

    if (!host.contains(event.relatedTarget as Node | null)) this.focused.set(false);
  }

  private advance(): void {
    this.live.set('off');
    this.index.update((i) => (i + 1) % Math.max(1, this.options.count()));
    this.cycle.update((n) => n + 1);
  }
}

export const createRotation = (options: RotationOptions): Rotation => new Rotation(options);
