import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { reloadOnContextChange } from '../../core/org/organization-context';
import { PageHeroComponent } from '../../shared/ui/page-hero.component';
import { OrgRequiredComponent } from '../../shared/ui/org-required.component';
import { AccessPolicy } from '../../core/auth/access-policy';
import { SessionStore } from '../../core/auth/session.store';
import { FuelPriceCardsComponent } from '../intelligence/fuel-price-cards.component';
import { IntelligenceFacade } from '../intelligence/intelligence.facade';
import { UsersFacade } from '../users/users.facade';
import { roleLabel } from '../../shared/ui/labels';
import { HomeFacade } from './home.facade';

/** Resumen de la empresa: solo datos reales; lo que aún no tiene backend se anuncia como «Próximamente», nunca con ejemplos. */
@Component({
  selector: 'app-dashboard',
  imports: [PageHeroComponent, FuelPriceCardsComponent, RouterLink, OrgRequiredComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; } .page { gap: 12px; display: flex; flex-direction: column; min-height: calc(100dvh - 124px); }
      app-org-required { display: contents; }
      .ico { display: grid; place-items: center; width: 50px; height: 50px; flex: none; border-radius: 16px; background: var(--c-ok-soft); color: var(--c-accent); }
      .ico svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
      .row { display: grid; gap: 12px; align-items: stretch; }
      .row.b { grid-template-columns: minmax(0, 1fr); }
      .row.c { grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); }
      .team { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
      .team li { display: flex; align-items: center; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--c-bd); } 
      .team .av { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 50%; background: var(--c-ok-soft); color: var(--c-accent); font-weight: 700; font-size: 0.76rem; }
      .team .who { min-width: 0; flex: 1; } .team .who strong { display: block; color: var(--c-head); font-size: 0.9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .team .who small { display: block; color: var(--c-mu); font-size: 0.76rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .team .rl { flex: none; font-size: 0.74rem; font-weight: 600; padding: 2px 9px; border-radius: 999px; background: var(--c-s3); color: var(--c-text2); }
      .team .rl.ORG_ADMIN { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); color: color-mix(in srgb, var(--c-primary-700) 75%, var(--c-head)); } .team .rl.ORG_ANALYST { background: color-mix(in srgb, var(--c-secondary) 13%, var(--c-sf)); color: color-mix(in srgb, var(--c-secondary) 75%, var(--c-head)); }
      .tstats { display: flex; gap: 14px; margin-left: auto; color: var(--c-mu); font-size: 0.78rem; text-align: right; } .tstats b { display: block; color: var(--c-head); font-size: 1.05rem; line-height: 1.1; }
      .card { border-radius: 16px; padding: 12px 18px; }
      .card > header { display: flex; align-items: center; justify-content: flex-start; gap: 12px; margin-bottom: 8px; text-align: left; }
      .card > header .ico { width: 36px; height: 36px; border-radius: 10px; }
      .card > header .ico svg { width: 20px; height: 20px; }
      .card > header h2 { margin: 0; font-size: 1.05rem; color: var(--c-head); }
      .card > header p { margin: 0; color: var(--c-mu); font-size: 0.82rem; }
      .card > header .more { margin: 0 0 0 auto; align-self: flex-start; white-space: nowrap; }
      .empty { flex: 1; display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 8px; padding: 10px 16px; border: 1px dashed var(--c-bd); border-radius: 14px; text-align: left; }
      .e-ico { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background: var(--c-ok-soft); color: var(--c-accent); } .e-ico svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .empty strong { display: block; color: var(--c-head); font-size: 0.92rem; } .empty span:not(.e-ico) { color: var(--c-mu); font-size: 0.82rem; }
      .more { display: inline-block; margin-top: 6px; font-size: 0.9rem; font-weight: 600; color: var(--c-accent); text-decoration: none; }
      .todo { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
      .todo a { display: flex; align-items: center; gap: 12px; padding: 6px 12px; border: 1px solid var(--c-bd); border-radius: 12px; text-decoration: none; color: var(--c-head); font-weight: 600; font-size: 0.92rem; background: var(--c-sf); }
      .todo a:hover { border-color: var(--c-primary); }
      .todo .warn { background: var(--c-warn-soft); border-color: var(--c-warning); }
      .todo .warn .ico { background: transparent; color: var(--c-warning); }
      .todo .ico { width: 30px; height: 30px; border-radius: 8px; }
      .todo .ico svg { width: 18px; height: 18px; }
      .todo .txt { flex: 1; min-width: 0; }
      .todo .num { min-width: 26px; text-align: center; padding: 1px 8px; border-radius: 999px; background: var(--c-bad-soft); color: var(--c-danger); font-weight: 800; font-size: 0.8rem; }
      .todo .soon { font-size: 0.64rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--c-mu); border: 1px solid var(--c-bd); border-radius: 999px; padding: 2px 8px; }
      .todo .go { width: 18px; height: 18px; flex: none; fill: none; stroke: var(--c-mu); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .allgood { display: flex; align-items: center; gap: 10px; margin: 0; padding: 5px 12px; border-radius: 12px; background: color-mix(in srgb, var(--c-primary) 8%, var(--c-sf)); color: var(--c-text2); font-size: 0.86rem; }
      .ok-ico { display: grid; place-items: center; flex: none; width: 26px; height: 26px; border-radius: 50%; background: var(--c-primary); color: #fff; } .ok-ico svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
      .pill { margin-left: auto; padding: 3px 12px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; white-space: nowrap; } .pill.ok { background: var(--c-ok-soft); color: var(--c-accent); } .pill.warn { background: var(--c-warn-soft); color: var(--c-warning); }
      .next-title { margin: 8px 0 4px; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-mu); }
      .steps .txt b { display: block; font-size: 0.88rem; } .steps .txt small { display: block; margin-top: 1px; font-size: 0.74rem; font-weight: 400; color: var(--c-mu); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      @media (max-width: 1100px) { .row.b, .row.c { grid-template-columns: 1fr; } }
    `,
  ],
  template: `
    <div class="page">
      <app-page-hero [title]="'Bienvenido, ' + userName()" subtitle="Sigue la huella de carbono de tu empresa y avanza en su plan de descarbonización." />

      <app-org-required>
          <section class="card" aria-labelledby="emissions-soon-title" data-testid="emissions-soon">
            <div class="empty">
              <span class="e-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20V4M4 20h16M8 15l3-4 3 2 5-6" /></svg></span>
              <div><strong id="emissions-soon-title">Próximamente: indicadores de emisiones, intensidad y tendencia</strong><span>Se mostrarán aquí cuando existan datos medidos de tu empresa.</span></div>
            </div>
          </section>

          <div class="row b">
            <section class="card" aria-labelledby="todo-title">
              <header>
                <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 4h6l1 2h3v15H5V6h3zM9 13l2 2 4-4" /></svg></span>
                <div><h2 id="todo-title">Acciones pendientes</h2><p>Lo que requiere tu atención hoy.</p></div>
                @if (home.organization.data()) {
                  @if (home.pending() > 0) { <span class="pill warn" data-testid="todo-count">{{ home.pending() }} {{ home.pending() === 1 ? 'pendiente' : 'pendientes' }}</span> }
                  @else { <span class="pill ok" data-testid="todo-count">Al día</span> }
                }
              </header>
              <ul class="todo" data-testid="todo">
                @for (a of home.actions(); track a.label) {
                  <li>
                    <a class="warn" [routerLink]="a.path" [queryParams]="a.query">
                      <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4l9 16H3zM12 10v4M12 17h.01" /></svg></span>
                      <span class="txt">{{ a.label }}</span><span class="num">{{ a.count }}</span>
                      <svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                    </a>
                  </li>
                } @empty {
                  @if (home.organization.data()) {
                    <li class="allgood"><span class="ok-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></svg></span>Todo en orden: no tienes acciones pendientes en tu empresa.</li>
                  }
                }
              </ul>
              <h3 class="next-title">Próximos pasos</h3>
              <ul class="todo steps">
                <li>
                  <a routerLink="/cargas">
                    <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg></span>
                    <span class="txt"><b>Cargar tu primer período</b><small>Sube tus operaciones para calcular emisiones.</small></span><span class="soon">Próximamente</span>
                    <svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                  </a>
                </li>
                <li>
                  <a routerLink="/reduccion">
                    <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" /></svg></span>
                    <span class="txt"><b>Definir el plan de reducción</b><small>Fija metas y acciones para bajar tu huella.</small></span><span class="soon">Próximamente</span>
                    <svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                  </a>
                </li>
              </ul>
            </section>
          </div>

          <div class="row c">
            @if (canSeeTeam()) {
              <section class="card" aria-labelledby="team-title" data-testid="team-card">
                <header>
                  <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14a6.5 6.5 0 0 1 3.5 6" /></svg></span>
                  <div><h2 id="team-title">Usuarios de la empresa</h2></div>
                  @if (users.counts.data(); as c) { <div class="tstats"><span><b>{{ c.active + c.pending + c.suspended }}</b>en total</span><span><b>{{ c.active }}</b>activos</span>@if (c.pendingInvitations) { <span><b>{{ c.pendingInvitations }}</b>invitaciones</span> }</div> }
                </header>
                <ul class="team">
                  @for (u of sample(); track u.id) {
                    <li>
                      <span class="av" aria-hidden="true">{{ initials(u.fullName) }}</span>
                      <span class="who"><strong>{{ u.fullName }}</strong><small>{{ u.email }}</small></span>
                      @if (u.memberships[0]?.roles?.[0]; as r) { <span class="rl" [class]="'rl ' + r">{{ roleName(r) }}</span> }
                    </li>
                  } @empty { <li class="allgood">Aún no hay otras personas en tu empresa.</li> }
                </ul>
                <a class="more" routerLink="/usuarios">Ver todos los usuarios →</a>
              </section>
            }
            <section class="card" aria-labelledby="fuel-title" data-testid="fuel-prices">
              <header>
                <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M7 8h6M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3" /></svg></span>
                <div><h2 id="fuel-title">Precios de combustibles</h2><p>Referencia CREG y MinEnergía.</p></div>
              </header>
              <app-fuel-price-cards [compact]="true" />
              <a class="more" routerLink="/intelligence">Ver detalle →</a>
            </section>
          </div>
      </app-org-required>
    </div>
  `,
})
export class DashboardComponent {
  protected readonly home = inject(HomeFacade);
  protected readonly users = inject(UsersFacade);
  private readonly session = inject(SessionStore);
  protected readonly userName = computed(() => this.session.user()?.fullName?.trim() ?? '');
  private readonly intel = inject(IntelligenceFacade);
  private readonly access = inject(AccessPolicy);
  /** Ver a las personas de la empresa exige administrar membresías o leer usuarios (como la vista de Usuarios). */
  protected readonly canSeeTeam = computed(() => this.access.canAny(['users:read', 'memberships:manage']));
  constructor() {
    reloadOnContextChange(() => {
      this.home.load();
      this.intel.loadSummary();
      if (this.canSeeTeam()) {
        this.users.loadPreview();
        this.users.loadCounts();
      }
    });
  }

  /** Tres personas al azar de la empresa (se sortean al llegar los datos y no cambian al redibujar). */
  protected readonly sample = computed(() => {
    const people = [...(this.users.preview.data()?.items ?? [])];

    for (let i = people.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [people[i], people[j]] = [people[j], people[i]];
    }

    return people.slice(0, 3);
  });

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);

    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  /** Etiqueta corta de la lista de personas: «Administrador», «Analista», «Consulta». */
  protected roleName(code: string): string {
    const short: Record<string, string> = { ORG_ADMIN: 'Administrador', ORG_ANALYST: 'Analista', ORG_VIEWER: 'Consulta' };

    return short[code] ?? roleLabel(code);
  }
}
