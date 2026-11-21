import { Injectable } from '@angular/core';

export interface Resettable {
  reset(): void;
}

/**
 * Registro de estado que debe descartarse al cambiar de empresa, de modo
 * de datos o al cerrar sesión. Garantiza que datos de una empresa nunca
 * permanezcan en memoria bajo el contexto de otra.
 */
@Injectable({ providedIn: 'root' })
export class ContextResetRegistry {
  private readonly items = new Set<Resettable>();

  track<R extends Resettable>(item: R): R {
    this.items.add(item);
    return item;
  }

  resetAll(): void {
    this.items.forEach((item) => item.reset());
  }
}
