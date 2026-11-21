import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { OrganizationContext } from '../../core/org/organization-context';

/** Muestra su contenido solo si existe una empresa activa. */
@Component({
  selector: 'app-org-required',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (context.activeOrganizationId()) {
      <ng-content />
    } @else {
      <div class="card" style="text-align: center; padding: 40px 20px" data-testid="org-required">
        <h2>Sin empresa activa</h2>
        <p class="muted" style="margin-top: 6px">
          Esta sección trabaja con los datos de una empresa. Solicita una invitación o
          selecciona una empresa para continuar.
        </p>
      </div>
    }
  `,
})
export class OrgRequiredComponent {
  protected readonly context = inject(OrganizationContext);
}
