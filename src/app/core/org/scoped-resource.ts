import { Observable, Subscription } from 'rxjs';
import { signal } from '@angular/core';
import { AppError } from '../errors/app-error';
import { toAppError } from '../errors/http-error-mapper';
import { Resettable } from './context-reset';

export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Recurso asíncrono con estado observable por señales.
 *
 * `reset()` invalida cualquier petición en vuelo: si la respuesta de la
 * empresa anterior llega tarde, se descarta en lugar de escribirse en el
 * estado del nuevo contexto.
 */
export class ScopedResource<T> implements Resettable {
  readonly status = signal<ResourceStatus>('idle');
  readonly data = signal<T | null>(null);
  readonly error = signal<AppError | null>(null);

  private generation = 0;
  private subscription: Subscription | null = null;

  /**
   * `keepData`: si ya hay datos, se vuelve a pedir en segundo plano sin pasar por «cargando», para que la
   * pantalla no parpadee al volver a ella (los datos se reemplazan cuando llega la respuesta).
   */
  load(source$: Observable<T>, options: { keepData?: boolean } = {}): void {
    this.subscription?.unsubscribe();
    const generation = ++this.generation;
    if (!(options.keepData && this.data() !== null)) this.status.set('loading');
    this.error.set(null);

    this.subscription = source$.subscribe({
      next: (value) => {
        if (generation !== this.generation) return;
        this.data.set(value);
        this.status.set('ready');
      },
      error: (error: unknown) => {
        if (generation !== this.generation) return;
        this.error.set(toAppError(error));
        this.status.set('error');
      },
    });
  }

  reset(): void {
    this.generation++;
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.status.set('idle');
    this.data.set(null);
    this.error.set(null);
  }
}
