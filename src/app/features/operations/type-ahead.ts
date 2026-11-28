import { DestroyRef, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, Subject, catchError, debounce, map, of, switchMap, timer } from 'rxjs';

/** Espera tras la última tecla antes de pedir sugerencias al servidor. */
export const TYPE_AHEAD_DEBOUNCE_MS = 250;

type Request = { readonly query: string; readonly immediate: boolean } | null;

/**
 * Búsqueda mientras se escribe: espera 250 ms tras la última tecla y cada petición nueva cancela la anterior en vuelo (`switchMap`), así que una respuesta tardía
 * nunca pisa a una más reciente. `clear()` cancela lo pendiente y vacía la lista.
 */
export class TypeAhead<T> {
  readonly results = signal<readonly T[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);

  private readonly requests = new Subject<Request>();

  constructor(search: (query: string) => Observable<readonly T[]>, destroyRef: DestroyRef, waitMs: number = TYPE_AHEAD_DEBOUNCE_MS) {
    this.requests
      .pipe(
        debounce((request) => timer(request && !request.immediate ? waitMs : 0)),
        switchMap((request) => {
          if (!request) {
            this.results.set([]);
            this.loading.set(false);

            return EMPTY;
          }

          return search(request.query).pipe(
            map((items) => ({ items }) as { readonly items: readonly T[] } | null),
            catchError(() => of(null)),
          );
        }),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((response) => {
        this.loading.set(false);
        this.failed.set(response === null);

        if (response) this.results.set(response.items);
      });
  }

  /** Pide sugerencias para `query` tras la espera (o ya, con `immediate`: al enfocar el campo). */
  search(query: string, immediate = false): void {
    this.loading.set(true);
    this.failed.set(false);
    this.requests.next({ query, immediate });
  }

  clear(): void {
    this.failed.set(false);
    this.requests.next(null);
  }
}
