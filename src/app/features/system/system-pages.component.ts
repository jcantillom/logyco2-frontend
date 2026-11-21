import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthFacade } from '../../core/auth/auth.facade';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card" style="text-align: center; padding: 48px 20px" role="alert">
      <h1>Acceso denegado</h1>
      <p class="muted" style="margin: 8px 0 16px">No tienes permisos para ver esta sección con tu empresa y rol actuales.</p>
      <a class="btn btn-primary" routerLink="/resumen">Ir al inicio</a>
    </div>
  `,
})
export class ForbiddenComponent {}

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card" style="text-align: center; padding: 48px 20px">
      <h1>Página no encontrada</h1>
      <p class="muted" style="margin: 8px 0 16px">La dirección solicitada no existe.</p>
      <a class="btn btn-primary" routerLink="/resumen">Ir al inicio</a>
    </div>
  `,
})
export class NotFoundComponent {}

@Component({
  selector: 'app-pending-access',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="card" style="max-width: 520px; margin: 12vh auto; text-align: center; padding: 48px 20px" data-testid="pending-access">
      <h1>Acceso pendiente</h1>
      <p class="muted" style="margin: 8px 0 16px">
        Tu cuenta está activa, pero aún no tiene un rol ni una empresa asignados. Solicita una invitación al administrador.
      </p>
      <button type="button" class="btn btn-secondary" (click)="auth.logout()">Cerrar sesión</button>
    </main>
  `,
})
export class PendingAccessComponent {
  protected readonly auth = inject(AuthFacade);
}
