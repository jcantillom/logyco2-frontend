import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { OrgLogoCache } from './org-logo.cache';

/**
 * Logo de una empresa dentro de su avatar. Sin logo (o mientras llega) muestra el contenido proyectado: normalmente las iniciales.
 * Uso: `<app-org-logo [id]="org.id" [version]="org.logoVersion">{{ iniciales }}</app-org-logo>`.
 */
@Component({
  selector: 'app-org-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; } img { width: 100%; height: 100%; object-fit: contain; border-radius: inherit; display: block; }'],
  template: `@if (src(); as url) { <img [src]="url" alt="" /> } @else { <ng-content /> }`,
})
export class OrgLogoComponent {
  private readonly cache = inject(OrgLogoCache);

  readonly id = input.required<string>();
  readonly version = input<string | null>(null);
  protected readonly src = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const version = this.version();

      if (!version) {
        this.src.set(null);

        return;
      }

      const subscription = this.cache.get(this.id(), version).subscribe((url) => this.src.set(url));

      onCleanup(() => subscription.unsubscribe());
    });
  }
}
