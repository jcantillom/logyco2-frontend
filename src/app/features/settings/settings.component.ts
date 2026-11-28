import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SessionStore } from '../../core/auth/session.store';
import { PaletteName, ThemePreference, ThemeService } from '../../core/preferences/theme.service';
import { OrganizationContext } from '../../core/org/organization-context';
import { AccessPolicy } from '../../core/auth/access-policy';
import { EfficiencySettingsComponent } from '../vehicles/efficiency-settings.component';
import { CompanyPlaceChoicesComponent } from './company-place-choices.component';
import { hueOf, initialsOf } from '../../shared/ui/avatar';
import { roleLabel } from '../../shared/ui/labels';

@Component({
  selector: 'app-settings',
  imports: [DatePipe, EfficiencySettingsComponent, CompanyPlaceChoicesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
      .solo { grid-template-columns: minmax(0, 640px); }
      .full { grid-column: 1 / -1; }
      .who { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
      .who-avatar { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 1.1rem; flex: none; }
      .who-name { font-weight: 700; color: var(--c-head); overflow-wrap: anywhere; }
      .who-mail { color: var(--c-mu); font-size: 0.86rem; overflow-wrap: anywhere; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .themes { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 12px 0 0; padding: 0; border: 0; min-width: 0; }
      .themes legend { padding: 0; font-weight: 600; color: var(--c-mu); font-size: 0.84rem; }
      .theme-opt { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--c-bd); border-radius: var(--radius); cursor: pointer; background: var(--c-sf); }
      .theme-opt input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
      .theme-opt:has(input:checked) { border-color: var(--c-primary); box-shadow: 0 0 0 1px var(--c-primary); background: var(--c-s2); }
      .theme-opt:has(input:focus-visible) { outline: 2px solid var(--c-focus); outline-offset: 2px; }
      .theme-opt strong { color: var(--c-head); }
      .theme-opt small { color: var(--c-mu); }
      .toggle { display: flex; align-items: center; gap: 10px; margin-top: 14px; cursor: pointer; }
      .hint.tight { margin-top: 4px; }
      .hint { color: var(--c-mu); font-size: 0.84rem; margin: 10px 0 0; }
      .companies { margin: 12px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
      .company { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--c-bd); border-radius: var(--radius); }
      @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Configuración</h1>
          <p>{{ platform ? 'Tu cuenta y tu sesión en la consola de plataforma.' : 'Tu cuenta, tus empresas y la apariencia.' }}</p>
        </div>
      </header>

      <div class="grid" [class.solo]="platform">
        <section class="card" aria-labelledby="prof">
          <h2 id="prof">Mi cuenta</h2>
          <div class="who" style="margin-top: 12px">
            <span class="who-avatar" aria-hidden="true" [style.background]="'hsl(' + hue() + ' 45% 38%)'">{{ initials() }}</span>
            <div>
              <div class="who-name">{{ session.user()?.fullName }}</div>
              <div class="who-mail">{{ session.user()?.email }}</div>
            </div>
          </div>
          <dl class="facts">
            <dt>Estado</dt>
            <dd>
              <span class="badge" [class.badge-success]="session.user()?.isActive">{{ session.user()?.isActive ? 'Activo' : 'Inactivo' }}</span>
            </dd>
            <dt>Roles globales</dt>
            <dd>
              <span class="chips">
                @for (r of session.user()?.globalRoles ?? []; track r.code) { <span class="badge">{{ roleName(r.code) }}</span> }
                @empty { <span class="muted">Ninguno</span> }
              </span>
            </dd>
            <dt>Sesión</dt>
            <dd>
              @if (session.expiresAt(); as exp) { Vence: {{ exp | date: 'medium' : 'America/Bogota' }} (hora de Bogotá) } @else { Activa }
            </dd>
          </dl>
          <p class="hint">Tu sesión se mantiene al recargar y en otras pestañas mediante una cookie protegida que la página no puede leer; termina al vencer o al cerrar sesión.</p>
        </section>

        <section class="card" aria-labelledby="look">
          <h2 id="look">Apariencia</h2>
          <fieldset class="themes">
            <legend>Tema</legend>
            @for (t of themes; track t.value) {
              <label class="theme-opt">
                <input type="radio" name="theme" [value]="t.value" [checked]="theme.preference() === t.value" (change)="theme.setTheme(t.value)" />
                <strong>{{ t.label }}</strong>
                <small>{{ t.hint }}</small>
              </label>
            }
          </fieldset>
          <fieldset class="themes" data-testid="palette-options">
            <legend>Paleta de colores</legend>
            @for (p of palettes; track p.value) {
              <label class="theme-opt">
                <input type="radio" name="palette" [value]="p.value" [checked]="theme.palette() === p.value" (change)="theme.setPalette(p.value)" />
                <strong>{{ p.label }}</strong>
                <small>{{ p.hint }}</small>
              </label>
            }
          </fieldset>
          <label class="toggle">
            <input type="checkbox" data-testid="reduce-motion" [checked]="theme.reducedMotion()" (change)="theme.setReducedMotion($any($event.target).checked)" />
            <span>Reducir animaciones</span>
          </label>
          <p class="hint">Tema y paleta se recuerdan en este navegador. «Automático» sigue el modo claro u oscuro de tu equipo.</p>
        </section>

        @if (!platform) {
        <section class="card full" aria-labelledby="orgs">
          <h2 id="orgs">Mis empresas</h2>
          <ul class="companies">
            @for (m of context.memberships(); track m.membershipId) {
              <li class="company">
                <span><strong>{{ m.organization.name }}</strong> · <span class="muted">{{ roleNames(m.roles) }}</span></span>
                @if (m.organization.id === context.activeOrganizationId()) { <span class="badge badge-success">Activa</span> }
                @else { <button type="button" class="btn btn-secondary btn-sm" (click)="context.select(m.organization.id)">Usar esta empresa</button> }
              </li>
            } @empty { <li class="muted">No perteneces a ninguna empresa.</li> }
          </ul>
        </section>

        @if (access.can('vehicles:read')) {
        <section class="card full" aria-labelledby="imp-set" data-testid="import-settings">
          <h2 id="imp-set">Importación de cargas</h2>
          <p class="hint tight">Cómo se tratan el rendimiento de los vehículos y la carga en kilogramos al subir un archivo a tu empresa.</p>
          <app-efficiency-settings />
        </section>
        }

        @if (access.can('imports:create')) {
        <section class="card full" aria-labelledby="places-set" data-testid="place-choices-card">
          <h2 id="places-set">Lugares de tu empresa</h2>
          <p class="hint tight">Cuando un texto de lugar de tus archivos puede ser más de un municipio, tú eliges cuál es. Aquí ves lo elegido y puedes deshacerlo.</p>
          <app-company-place-choices />
        </section>
        }
        }
      </div>
    </div>
  `,
})
export class SettingsComponent {
  protected readonly session = inject(SessionStore);
  protected readonly context = inject(OrganizationContext);
  protected readonly theme = inject(ThemeService);
  protected readonly access = inject(AccessPolicy);
  protected readonly themes: readonly { value: ThemePreference; label: string; hint: string }[] = [
    { value: 'light', label: 'Claro', hint: 'Fondo claro' },
    { value: 'dark', label: 'Oscuro', hint: 'Menos brillo' },
    { value: 'system', label: 'Automático', hint: 'Como tu equipo' },
  ];
  protected readonly palettes: readonly { value: PaletteName; label: string; hint: string }[] = [
    { value: 'brand', label: 'Marca LOGYCA', hint: 'Naranja, aguamarina y gris' },
    { value: 'classic', label: 'Clásica', hint: 'Verde y petróleo originales' },
  ];
  /** En la consola de plataforma solo aplica la cuenta: el superadministrador no pertenece a ninguna empresa. */
  protected readonly platform = inject(ActivatedRoute).snapshot.data['platform'] === true;
  protected readonly initials = computed(() => initialsOf(this.session.user()?.fullName ?? '?'));
  protected readonly hue = computed(() => hueOf(this.session.user()?.fullName ?? ''));

  protected roleName(code: string): string {
    return roleLabel(code);
  }

  protected roleNames(roles: readonly { code: string }[]): string {
    return roles.map((r) => roleLabel(r.code)).join(', ') || 'Sin roles';
  }
}
