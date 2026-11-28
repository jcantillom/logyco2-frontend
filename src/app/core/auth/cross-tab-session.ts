import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';

export type SessionSignal = 'login' | 'logout';

const CHANNEL = 'logyco2.session';
/** Clave solo de señalización (nunca guarda nada sensible): cada escritura dispara el evento `storage` en las demás pestañas. */
const STORAGE_SIGNAL = 'logyco2.session.signal';

/**
 * Avisa a las demás pestañas del navegador cuando esta inicia o cierra sesión, para que no queden
 * mostrando una sesión que ya no existe (o sin enterarse de que ya hay una).
 *
 * Usa `BroadcastChannel`; si el navegador no lo ofrece, recurre al evento `storage` de
 * `localStorage`. En ambos casos solo viaja la palabra `login` o `logout` y una marca de tiempo:
 * ningún dato de la persona ni credencial.
 */
@Injectable({ providedIn: 'root' })
export class CrossTabSession implements OnDestroy {
  private readonly zone = inject(NgZone);
  private channel: BroadcastChannel | null = null;
  private removeStorageListener: (() => void) | null = null;

  publish(signal: SessionSignal): void {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.ensureChannel().postMessage(signal);
      } else {
        localStorage.setItem(STORAGE_SIGNAL, `${signal}:${Date.now()}`);
      }
    } catch {
      // Sin canal ni almacenamiento: las otras pestañas se enteran en su siguiente petición (401).
    }
  }

  /** Escucha las señales de OTRAS pestañas (el emisor no recibe las suyas). */
  listen(handler: (signal: SessionSignal) => void): void {
    const dispatch = (value: unknown): void => {
      if (value === 'login' || value === 'logout') this.zone.run(() => handler(value));
    };

    if (typeof BroadcastChannel !== 'undefined') {
      this.ensureChannel().onmessage = (event: MessageEvent<unknown>) => dispatch(event.data);
      return;
    }

    const listener = (event: StorageEvent): void => {
      if (event.key === STORAGE_SIGNAL && event.newValue) dispatch(event.newValue.split(':')[0]);
    };
    window.addEventListener('storage', listener);
    this.removeStorageListener = () => window.removeEventListener('storage', listener);
  }

  ngOnDestroy(): void {
    this.channel?.close();
    this.removeStorageListener?.();
  }

  private ensureChannel(): BroadcastChannel {
    this.channel ??= new BroadcastChannel(CHANNEL);
    return this.channel;
  }
}
