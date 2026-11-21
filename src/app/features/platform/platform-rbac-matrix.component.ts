import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PermissionImplementation, RbacRole } from '../../domain/models/platform-admin';
import { permissionLabel, roleLabel } from '../../shared/ui/labels';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { PlatformRbacTabsComponent } from './platform-rbac-tabs.component';
import { PlatformRbacFacade } from './platform.facades';

const IMPLEMENTATION_LABEL: Readonly<Record<PermissionImplementation, { text: string; badge: string }>> = {
  active: { text: 'En uso', badge: 'badge-success' },
  planned: { text: 'Previsto', badge: 'badge-neutral' },
  complementary: { text: 'Complementario', badge: 'badge-warning' },
};
const FUNCTIONAL = ['SUPER_ADMIN', 'ORG_ADMIN', 'ORG_ANALYST', 'ORG_VIEWER'];

/** Herramienta de auditoría: permisos reales por rol. Es de solo lectura; la autorización se aplica siempre en el servidor. */
@Component({
  selector: 'app-platform-rbac-matrix',
  imports: [PlatformRbacTabsComponent, ResourceStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; min-width: 0; }
      .page { min-width: 0; }
      .legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; padding: 0; list-style: none; font-size: 0.8rem; color: var(--c-mute2); }
      /* El desplazamiento horizontal ocurre SOLO dentro de la tabla, nunca en toda la página. */
      .scroller { max-width: 100%; overflow: auto; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: 0 10px 30px color-mix(in srgb, var(--c-gray) 5%, transparent), 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); }
      .scroller:focus-visible { outline: 3px solid var(--c-primary); outline-offset: 2px; }
      table { width: 100%; min-width: 880px; border-collapse: separate; border-spacing: 0; }
      th, td { padding: 12px 14px; border-bottom: 1px solid var(--c-bd); vertical-align: middle; }
      thead th { position: sticky; top: 0; z-index: 2; background: var(--c-s2); text-align: center; font-size: 0.78rem; color: var(--c-text2); vertical-align: bottom; }
      thead th.perm { text-align: left; }
      tbody th { text-align: left; font-weight: 600; background: var(--c-sf); text-transform: none; letter-spacing: 0; font-size: inherit; }
      th.perm { min-width: 270px; }
      th.state, td.state { min-width: 130px; white-space: nowrap; text-align: center; }
      th.role { min-width: 150px; }
      td { text-align: center; }
      .yes { color: var(--c-accent); font-weight: 800; }
      .no { color: var(--c-gray-400); }
      .role-name { display: block; margin-bottom: 4px; font-weight: 650; }
      .counts { display: inline-flex; align-items: center; gap: 5px; margin-top: 4px; font-size: 0.8rem; color: var(--c-mu); }
      .counts svg { width: 14px; height: 14px; fill: none; stroke: var(--c-primary); stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
      .counts b { color: var(--c-head); font-variant-numeric: tabular-nums; }
      .perm-label { display: block; }
      .perm-code { display: block; margin-top: 2px; overflow-wrap: anywhere; font-weight: 400; font-size: 0.74rem; color: var(--c-mu); background: transparent; padding: 0; }
      tbody tr:hover td, tbody tr:hover th { background: var(--c-row-hover); }
      /* La primera columna queda fija solo cuando hay ancho de sobra: en pantallas estrechas ocuparía casi toda la tabla. */
      @media (min-width: 900px) {
        thead th.perm, tbody th { position: sticky; left: 0; z-index: 1; box-shadow: 1px 0 0 var(--c-gray-200); }
        thead th.perm { z-index: 3; }
      }
      @media (max-width: 640px) { table { min-width: 760px; } th.perm { min-width: 220px; } }
    `,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Roles y accesos</h1>
          <p>Permisos por rol (vista técnica), de solo consulta. Cada permiso se muestra con su nombre y, debajo, su código técnico de referencia. La autorización real se aplica siempre en el servidor y no se edita desde aquí.</p>
        </div>
      </header>
      <app-rbac-tabs />

      <app-resource-state [status]="facade.catalog.status()" [error]="facade.catalog.error()" (retry)="facade.load()">
        @if (facade.catalog.data(); as c) {
          <ul class="legend" aria-label="Estado de cada permiso">
            <li><span class="badge badge-success">En uso</span> lo exige algún endpoint hoy</li>
            <li><span class="badge badge-neutral">Previsto</span> la función aún no existe</li>
            <li><span class="badge badge-warning">Complementario</span> módulo fuera del foco principal</li>
          </ul>
          <div class="scroller" tabindex="0" role="region" aria-label="Matriz de permisos por rol (desplazable)">
            <table data-testid="rbac-matrix">
              <caption class="sr-only">Permisos concedidos a cada rol</caption>
              <thead>
                <tr>
                  <th scope="col" class="perm">Permiso</th>
                  <th scope="col" class="state">Estado</th>
                  @for (r of c.roles; track r.code) {
                    <th scope="col" class="role">
                      <span class="role-name">{{ roleName(r) }}</span>
                      <span class="badge" [class.badge-warning]="r.scope === 'GLOBAL'" [class.badge-info]="r.scope === 'ORGANIZATION'">{{ r.scope === 'GLOBAL' ? 'Global' : 'Empresa' }}</span>
                      @if (legacy(r)) { <span class="badge badge-neutral" style="margin-left: 4px">Heredado</span> }
                      <span class="counts" [attr.title]="r.people + (r.people === 1 ? ' persona' : ' personas')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></svg><b>{{ r.people }}</b><span class="sr-only"> {{ r.people === 1 ? 'persona' : 'personas' }}</span></span>
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (p of c.permissions; track p.code) {
                  <tr>
                    <th scope="row"><span class="perm-label">{{ permission(p.code, p.name) }}</span><code class="perm-code">{{ p.code }}</code></th>
                    <td class="state"><span class="badge" [class]="'badge ' + implementation(p.implementation).badge">{{ implementation(p.implementation).text }}</span></td>
                    @for (r of c.roles; track r.code) {
                      <td [attr.aria-label]="r.permissions.includes(p.code) ? 'Concedido' : 'No concedido'">
                        @if (r.permissions.includes(p.code)) { <span class="yes" aria-hidden="true">✓</span> } @else { <span class="no" aria-hidden="true">–</span> }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="hint">Un permiso global solo amplía el acceso a la administración de la plataforma; nunca da acceso a datos confidenciales de una empresa.</p>
        }
      </app-resource-state>
    </div>
  `,
})
export class PlatformRbacMatrixComponent {
  protected readonly facade = inject(PlatformRbacFacade);

  constructor() {
    this.facade.load();
  }

  /** Rol del catálogo fuera de los cuatro perfiles funcionales (p. ej. consulta gremial): se conserva por seguridad e historial. */
  protected legacy(role: RbacRole): boolean {
    return !FUNCTIONAL.includes(role.code);
  }
  /** Nombre en español del permiso; el código técnico queda como referencia secundaria. */
  protected permission(code: string, name: string): string {
    return permissionLabel(code, name);
  }
  /** Los perfiles funcionales usan el nombre del negocio; un rol heredado conserva el que tiene en el catálogo. */
  protected roleName(role: RbacRole): string {
    return this.legacy(role) ? role.name : roleLabel(role.code);
  }
  protected implementation(value: PermissionImplementation): { text: string; badge: string } {
    return IMPLEMENTATION_LABEL[value];
  }
}
