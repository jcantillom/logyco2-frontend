import { Injectable, inject, signal } from '@angular/core';
import { ContextResetRegistry, Resettable } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { OrganizationsRepository } from '../../domain/repositories/identity.repositories';

/**
 * Logo de la empresa activa como URL local (`blob:`). Se pide con la sesión porque un `<img>` no puede enviar el token, y se
 * descarta al cambiar de empresa. Si no hay logo (o la consulta falla) simplemente no hay imagen: nunca bloquea la pantalla.
 */
@Injectable({ providedIn: 'root' })
export class OrganizationLogoStore implements Resettable {
  private readonly repository = inject(OrganizationsRepository);
  private readonly context = inject(OrganizationContext);

  readonly url = signal<string | null>(null);
  private generation = 0;
  private requestedFor: string | null = null;

  constructor() {
    inject(ContextResetRegistry).track(this);
  }

  /** Pide el logo de la empresa activa (una sola vez por empresa aunque lo pidan el menú y la vista). */
  load(): void {
    const id = this.context.activeOrganizationId();

    if (!id) {
      this.reset();

      return;
    }

    if (this.requestedFor === id) return;

    this.requestedFor = id;
    const generation = ++this.generation;

    this.repository.logo(id).subscribe({
      next: (blob) => generation === this.generation && this.set(blob),
      error: () => generation === this.generation && this.set(null),
    });
  }

  /** Muestra de inmediato lo que se acaba de subir (o `null` al quitarlo). */
  set(blob: Blob | null): void {
    const previous = this.url();

    this.url.set(blob ? URL.createObjectURL(blob) : null);

    if (previous) URL.revokeObjectURL(previous);
  }

  reset(): void {
    this.generation++;
    this.requestedFor = null;
    this.set(null);
  }
}
