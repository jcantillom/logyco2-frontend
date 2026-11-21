import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Pestañas de «Roles y accesos»: los perfiles y, aparte, la matriz técnica de permisos (dos rutas, un mismo menú). */
@Component({
  selector: 'app-rbac-tabs',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      nav { display: flex; gap: 6px; border-bottom: 1px solid var(--c-bd); }
      a { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; margin-bottom: -1px; border: 1px solid transparent; border-radius: 10px 10px 0 0; font-size: 0.9rem; font-weight: 600; color: var(--c-mute2); text-decoration: none; }
      a:hover { color: var(--c-accent); }
      a:focus-visible { outline: 3px solid var(--c-secondary-soft); outline-offset: -3px; }
      a.active { color: var(--c-accent); background: var(--c-sf); border-color: var(--c-bd) var(--c-bd) var(--c-bd); box-shadow: inset 0 -3px var(--c-primary); }
      svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    `,
  ],
  template: `
    <nav aria-label="Secciones de roles y accesos">
      <a routerLink="/plataforma/roles" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" ariaCurrentWhenActive="page" data-testid="tab-roles"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" /></svg>Roles</a>
      <a routerLink="/plataforma/roles/matriz" routerLinkActive="active" ariaCurrentWhenActive="page" data-testid="tab-matrix"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>Permisos (vista técnica)</a>
    </nav>
  `,
})
export class PlatformRbacTabsComponent {}
