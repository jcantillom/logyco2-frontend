import { DestroyRef, Signal, inject, signal } from '@angular/core';

export interface SecondTicker {
  /** Hora actual en ms, renovada cada segundo mientras esté activo. */
  readonly now: Signal<number>;
  /** Enciende o apaga el temporizador; encenderlo dos veces no crea otro. */
  setActive(active: boolean): void;
}

/** Un solo temporizador de 1 s compartido por todas las filas (sin consultas de red); se limpia al destruir. Llamar en un contexto de inyección. */
export function createSecondTicker(): SecondTicker {
  const now = signal(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = (): void => {
    if (timer === null) return;

    clearInterval(timer);
    timer = null;
  };

  inject(DestroyRef).onDestroy(stop);

  return {
    now: now.asReadonly(),
    setActive(active: boolean): void {
      if (!active) return stop();

      if (timer !== null) return;

      now.set(Date.now());
      timer = setInterval(() => now.set(Date.now()), 1000);
    },
  };
}
