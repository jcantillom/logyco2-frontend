import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlatformAccess } from '../../core/auth/platform-access';

/**
 * Enlace a la consola global. Solo se muestra a quien `/auth/me` informa con el
 * rol GLOBAL SUPER_ADMIN. Es una comodidad de navegación: el acceso real lo
 * confirman `platformGuard` y el backend.
 */
@Component({
  selector: 'app-context-switch',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (access.isSuperAdmin()) {
      <a class="btn btn-secondary btn-sm" routerLink="/plataforma" data-testid="to-platform">Consola de plataforma</a>
    }
  `,
})
export class ContextSwitchComponent {
  protected readonly access = inject(PlatformAccess);
}
