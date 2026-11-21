import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthFacade } from '../../core/auth/auth.facade';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { roleLabel } from '../ui/labels';

@Component({
  selector: 'app-user-menu',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { position: relative; }
      .avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--c-primary); color: #fff; font-weight: 800; display: inline-grid; place-items: center; }
      .menu { position: absolute; right: 0; top: calc(100% + 8px); z-index: 60; width: 300px; background: var(--c-sf); border: 1px solid var(--c-bd); border-radius: var(--radius); box-shadow: var(--shadow); padding: 8px; display: flex; flex-direction: column; gap: 2px; }
      .head { display: flex; align-items: center; gap: 12px; padding: 10px 10px 12px; border-bottom: 1px solid var(--c-bd); margin-bottom: 6px; }
      .head .avatar { width: 44px; height: 44px; font-size: 1rem; flex: none; }
      .head strong { display: block; color: var(--c-head); overflow-wrap: anywhere; }
      .head .mail { color: var(--c-mu); font-size: 0.8rem; overflow-wrap: anywhere; }
      .head .role { display: inline-block; margin-top: 4px; font-size: 0.72rem; font-weight: 700; color: var(--c-accent); background: rgba(0, 179, 152, 0.1); border-radius: 999px; padding: 1px 8px; }
      .item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--c-head); font: inherit; font-weight: 600; text-align: left; text-decoration: none; cursor: pointer; }
      .item:hover, .item:focus-visible { background: var(--c-s2); }
      .item svg { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .item.danger { color: var(--c-bad); }
      .item.danger:hover, .item.danger:focus-visible { background: var(--c-s3); }
      hr { border: 0; border-top: 1px solid var(--c-bd); margin: 6px 0; width: 100%; }
      .who { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2; text-align: left; margin-left: 8px; }
      .who strong { font-size: 0.86rem; color: var(--c-head); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .who small { font-size: 0.72rem; color: var(--c-mu); font-weight: 500; }
      @media (max-width: 900px) { .who { display: none; } }
    `,
  ],
  template: `
    <button type="button" class="btn btn-ghost" style="padding: 0 6px" aria-haspopup="true" [attr.aria-expanded]="open()" aria-label="Menú de usuario" (click)="open.set(!open())">
      <span class="avatar" aria-hidden="true">{{ initials() }}</span>
      @if (identity()) { <span class="who"><strong>{{ session.user()?.fullName }}</strong><small>{{ primaryRole() }}</small></span> }
    </button>
    @if (open()) {
      <div class="menu" role="menu" aria-label="Opciones de sesión">
        <div class="head">
          <span class="avatar" aria-hidden="true">{{ initials() }}</span>
          <div>
            <strong>{{ session.user()?.fullName }}</strong>
            <div class="mail">{{ session.user()?.email }}</div>
            <span class="role">{{ roles() }}</span>
          </div>
        </div>
        <a class="item" role="menuitem" [routerLink]="settingsLink()" (click)="open.set(false)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2"/></svg>
          Configuración
        </a>
        <hr />
        <button type="button" class="item danger" role="menuitem" data-testid="logout" (click)="logout()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          Cerrar sesión
        </button>
      </div>
    }
  `,
})
export class UserMenuComponent {
  protected readonly session = inject(SessionStore);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(OrganizationContext);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Muestra nombre y rol junto al avatar (consola de plataforma). */
  readonly identity = input(false);
  /** Destino de «Configuración»: la consola de plataforma tiene la suya, dentro de su propio menú. */
  readonly settingsLink = input('/configuracion');
  protected readonly open = signal(false);
  /** Rol global (consola) o, si no tiene, el rol que ejerce en la empresa activa. */
  protected readonly primaryRole = computed(() => {
    const global = this.session.user()?.globalRoles[0]?.code;
    if (global) return global;
    const own = this.context.activeMembership()?.roles[0]?.code;

    return own ? roleLabel(own) : 'Usuario';
  });
  protected readonly initials = computed(() =>
    (this.session.user()?.fullName ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join(''),
  );
  protected readonly roles = computed(() => {
    const codes = (this.session.user()?.globalRoles ?? []).map((role) => roleLabel(role.code));
    if (codes.length) return codes.join(' · ');
    const own = (this.context.activeMembership()?.roles ?? []).map((role) => roleLabel(role.code));

    return own.length ? own.join(' · ') : 'Roles por empresa';
  });

  protected logout(): void {
    this.open.set(false);
    this.auth.logout();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
