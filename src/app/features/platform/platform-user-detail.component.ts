import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { ActionFeedbackService } from '../../core/notifications/action-feedback.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ManagedMembership, ManagedUser, MembershipTargetStatus } from '../../domain/models/users';
import { hueOf, initialsOf } from '../../shared/ui/avatar';
import { MEMBERSHIP_LABELS, roleLabel } from '../../shared/ui/labels';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { PlatformUsersFacade } from './platform.facades';

type Tone = 'primary' | 'neutral' | 'warn' | 'danger';
interface Action {
  readonly status: MembershipTargetStatus;
  readonly label: string;
  readonly tone: Tone;
  /** Qué ocurre al confirmar: se muestra como ayuda del botón y en la confirmación. */
  readonly effect: string;
}

const APPROVE: Action = { status: 'ACTIVE', label: 'Aprobar', tone: 'primary', effect: 'La persona podrá acceder a la empresa con su rol.' };
const REJECT: Action = { status: 'REVOKED', label: 'Rechazar', tone: 'danger', effect: 'Se descarta la solicitud. No se puede deshacer.' };
const SUSPEND: Action = { status: 'SUSPENDED', label: 'Suspender', tone: 'warn', effect: 'Pierde el acceso a la empresa de forma temporal. Puedes reactivarla cuando quieras.' };
const REACTIVATE: Action = { status: 'ACTIVE', label: 'Reactivar', tone: 'neutral', effect: 'Recupera el acceso a la empresa con su rol.' };
const REVOKE: Action = { status: 'REVOKED', label: 'Revocar', tone: 'danger', effect: 'Se retira de la empresa de forma definitiva: no se puede deshacer ni volver a vincular a esta misma empresa.' };

/** Transiciones válidas del backend; el servidor las vuelve a validar. */
const ACTIONS: Readonly<Record<string, readonly Action[]>> = {
  PENDING: [APPROVE, REJECT],
  ACTIVE: [SUSPEND, REVOKE],
  SUSPENDED: [REACTIVATE, REVOKE],
  REVOKED: [],
};

@Component({
  selector: 'app-platform-user-detail',
  imports: [RouterLink, ResourceStateComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; min-width: 0; }
      .title { display: flex; align-items: center; gap: 16px; }
      .title h1 { margin: 0 0 4px; font-size: 1.6rem; overflow-wrap: anywhere; }
      .title p { margin: 0; }
      .title a { display: inline-flex; align-items: center; gap: 4px; font-size: 0.82rem; font-weight: 600; color: var(--c-mu); text-decoration: none; }
      .title a:hover { color: var(--c-accent); }
      .avatar { display: grid; place-items: center; width: 60px; height: 60px; border-radius: 16px; background: linear-gradient(145deg, hsl(var(--h, 160) 45% 95%), hsl(var(--h, 160) 40% 86%)); border: 1px solid hsl(var(--h, 160) 35% 82%); box-shadow: 0 6px 14px hsl(var(--h, 160) 40% 40% / 0.18); color: hsl(var(--h, 160) 55% 26%); font-size: 1.15rem; font-weight: 700; flex: none; }
      .avatar.off { background: var(--c-s2); border-color: var(--c-bd); box-shadow: none; color: var(--c-mute2); }
      .card { padding: 22px 24px; border: 1px solid var(--c-bd); border-radius: 14px; background: linear-gradient(135deg, var(--c-sf), var(--c-s2)); box-shadow: 0 10px 30px color-mix(in srgb, var(--c-gray) 5%, transparent), 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); }
      .card h2, .stack > h2 { margin: 0; font-size: 1.05rem; }
      .facts { display: grid; grid-template-columns: max-content 1fr; gap: 12px 28px; align-items: center; }
      .facts dt { font-size: 0.74rem; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: var(--c-mute2); }
      .facts dd { margin: 0; font-size: 0.92rem; color: var(--c-head); overflow-wrap: anywhere; }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; font-size: 0.74rem; }
      .badge-success::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .stack { display: grid; gap: 12px; }
      .table-wrap { overflow: hidden; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: 0 10px 30px color-mix(in srgb, var(--c-gray) 5%, transparent), 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); }
      .table th { background: var(--c-s2); font-size: 0.74rem; letter-spacing: 0.03em; color: var(--c-mute2); }
      .table td, .table th { padding: 14px 18px; }
      /* La columna de acciones se ajusta a sus botones y queda pegada al borde derecho. */
      .table th:last-child, .table td:last-child { width: 1%; white-space: nowrap; }
      .table th:last-child, .table td:last-child { padding-inline: 20px; text-align: center; }
      /* Todo se centra, salvo el nombre de la empresa; «Acciones» queda centrada sobre sus botones. */
      .table th:nth-child(2), .table td:nth-child(2), .table th:nth-child(3), .table td:nth-child(3) { text-align: center; }
      .table tbody tr { transition: background 0.12s; }
      .table tbody tr:hover { background: var(--c-row-hover); }
      .history { color: var(--c-mu); font-size: 0.82rem; }
      tr.revoked td { color: var(--c-mu); }
      .acts { display: inline-flex; flex-wrap: nowrap; justify-content: center; gap: 8px; }
      .tone-primary { background: var(--c-primary); border-color: var(--c-primary); color: #fff; }
      .tone-neutral { background: var(--c-sf); border-color: var(--c-bd); color: var(--c-head); }
      .tone-warn { background: var(--c-sf); border-color: #d9a441; color: var(--c-warning); }
      .tone-warn:hover { background: var(--c-warn-soft); }
      .tone-danger { background: var(--c-sf); border-color: #d98a84; color: var(--c-bad); }
      .tone-danger:hover { background: var(--c-bad-soft); }
      .legend { display: grid; gap: 6px; margin: 4px 0 0; padding: 12px 16px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); list-style: none; font-size: 0.8rem; color: var(--c-mute2); }
      .legend b { color: var(--c-head); }
    `,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="title">
          @if (facade.detail.data(); as u) { <span class="avatar" [class.off]="!u.isActive" [style.--h]="hueOf(u.fullName)" aria-hidden="true">{{ initialsOf(u.fullName) }}</span> }
          <div><h1>{{ facade.detail.data()?.fullName ?? 'Usuario' }}</h1><p><a routerLink="/plataforma/usuarios"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>Volver a usuarios</a></p></div>
        </div>
      </header>
      <app-resource-state [status]="facade.detail.status()" [error]="facade.detail.error()" (retry)="facade.loadDetail(id())">
        @if (facade.detail.data(); as u) {
          <section class="card" aria-labelledby="ident"><h2 id="ident">Identidad</h2>
            <dl class="facts" style="margin-top: 12px">
              <dt>Nombre</dt><dd>{{ u.fullName }}</dd><dt>Correo</dt><dd>{{ u.email }}</dd>
              <dt>Estado</dt><dd><span class="badge" [class.badge-success]="u.isActive" [class.badge-neutral]="!u.isActive" data-testid="user-status">{{ u.isActive ? 'Activo' : 'Inactivo' }}</span></dd>
              <dt>Empresa</dt>
              <dd data-testid="user-company">@if (company(u); as c) { <a [routerLink]="['/plataforma/organizaciones', c.organization.id]">{{ c.organization.name }}</a> } @else { <span class="muted">Sin empresa</span> }</dd>
              <dt>Tipo de usuario</dt>
              <dd class="chips">@for (r of types(u); track r) { <span class="badge badge-info">{{ r }}</span> } @empty { <span class="muted">—</span> }</dd>
            </dl>
            <p class="hint" style="margin-top: 10px">Los identificadores del proveedor SSO no se muestran ni se editan desde la interfaz.</p>
          </section>
          <section class="stack" aria-labelledby="mem"><h2 id="mem">Membresía</h2>
            <div class="table-wrap">
              <table class="table">
                <caption class="sr-only">Membresías</caption>
                <thead><tr><th scope="col">Empresa</th><th scope="col">Estado</th><th scope="col">Tipo de usuario</th><th scope="col">Acciones</th></tr></thead>
                <tbody>
                  @for (m of u.memberships; track m.membershipId) {
                    <tr [class.revoked]="m.status === 'REVOKED'">
                      <td><a [routerLink]="['/plataforma/organizaciones', m.organization.id]">{{ m.organization.name }}</a>@if (m.status === 'REVOKED') { <span class="history"> · anterior</span> }</td>
                      <td><app-status-badge [label]="labels[m.status]" /></td>
                      <td>{{ roles(m.roles) }}</td>
                      <td><span class="acts">@for (a of actionsFor(m); track a.label) { <button type="button" class="btn btn-sm" [class]="'btn btn-sm tone-' + a.tone" [title]="a.effect" (click)="change(u.fullName, m, a)">{{ a.label }}</button> }</span></td>
                    </tr>
                  } @empty { <tr><td colspan="4" class="muted">Sin membresías visibles.</td></tr> }
                </tbody>
              </table>
            </div>
            <ul class="legend" aria-label="Qué hace cada acción">
              <li><b>Suspender:</b> quita el acceso de forma temporal; se puede reactivar.</li>
              <li><b>Revocar:</b> retira a la persona de la empresa de forma definitiva; no se puede deshacer.</li>
            </ul>
          </section>
        }
      </app-resource-state>
    </div>
  `,
})
export class PlatformUserDetailComponent {
  readonly id = input.required<string>();
  protected readonly facade = inject(PlatformUsersFacade);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly feedback = inject(ActionFeedbackService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly labels = MEMBERSHIP_LABELS;
  protected readonly hueOf = hueOf;
  protected readonly initialsOf = initialsOf;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.facade.loadDetail(id));
    });
  }

  /** Una persona pertenece a una sola empresa: su membresía vigente (la revocada es historia). */
  protected company(user: ManagedUser): ManagedMembership | null { return user.memberships.find((m) => m.status !== 'REVOKED') ?? null; }
  /** Tipo de usuario: roles de su empresa y, si los tiene, los globales. */
  protected types(user: ManagedUser): string[] {
    return [...user.globalRoles, ...(this.company(user)?.roles ?? [])].map(roleLabel);
  }
  protected roles(codes: readonly string[]): string { return codes.map(roleLabel).join(', ') || 'Sin roles'; }
  protected actionsFor(m: ManagedMembership): readonly Action[] { return ACTIONS[m.status] ?? []; }

  protected async change(userName: string, m: ManagedMembership, a: Action): Promise<void> {
    const accepted = await this.confirm.confirm({ title: `${a.label} membresía`, message: `¿${a.label} la membresía de ${userName} en ${m.organization.name}? ${a.effect}`, confirmLabel: a.label, danger: a.tone === 'danger' });
    if (!accepted) return;
    this.feedback.start('Actualizando membresía…');
    this.facade.changeMembershipStatus(m.organization.id, m.membershipId, a.status).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.feedback.finish('Membresía actualizada'); this.facade.loadDetail(this.id()); },
      error: (error: unknown) => { this.feedback.close(); this.toast.error(toAppError(error)); },
    });
  }
}
