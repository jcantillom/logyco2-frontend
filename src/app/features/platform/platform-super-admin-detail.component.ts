import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthFacade } from '../../core/auth/auth.facade';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { ActionFeedbackService } from '../../core/notifications/action-feedback.service';
import { ToastService } from '../../core/notifications/toast.service';
import { hueOf, initialsOf } from '../../shared/ui/avatar';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { activityText, relativeTime } from './platform-labels';
import { PlatformSuperAdminsFacade } from './platform.facades';

@Component({
  selector: 'app-platform-super-admin-detail',
  imports: [DatePipe, RouterLink, ResourceStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; min-width: 0; }
      .page { min-width: 0; }
      .title { display: flex; align-items: center; gap: 16px; }
      .title h1 { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 4px; font-size: 1.6rem; overflow-wrap: anywhere; }
      .title p { margin: 0; }
      .title a { display: inline-flex; align-items: center; gap: 4px; font-size: 0.82rem; font-weight: 600; color: var(--c-mu); text-decoration: none; }
      .title a:hover { color: var(--c-accent); }
      .avatar { display: grid; place-items: center; width: 60px; height: 60px; border-radius: 16px; background: linear-gradient(145deg, hsl(var(--h, 160) 45% 95%), hsl(var(--h, 160) 40% 86%)); border: 1px solid hsl(var(--h, 160) 35% 82%); box-shadow: 0 6px 14px hsl(var(--h, 160) 40% 40% / 0.18); color: hsl(var(--h, 160) 55% 26%); font-size: 1.15rem; font-weight: 700; flex: none; }
      .card { padding: 22px 24px; border: 1px solid var(--c-bd); border-radius: 14px; background: linear-gradient(135deg, var(--c-sf), var(--c-s2)); box-shadow: 0 10px 30px color-mix(in srgb, var(--c-gray) 5%, transparent), 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); }
      .card h2 { margin: 0; font-size: 1.05rem; }
      .facts { display: grid; grid-template-columns: max-content 1fr; gap: 12px 28px; align-items: center; }
      .facts dt { font-size: 0.74rem; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; color: var(--c-mute2); }
      .facts dd { margin: 0; font-size: 0.92rem; color: var(--c-head); overflow-wrap: anywhere; }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; font-size: 0.74rem; }
      .badge-success::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
      .danger-zone { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-top: 4px; padding-top: 16px; border-top: 1px solid var(--c-bd); }
      .tone-danger { background: var(--c-sf); border-color: #d98a84; color: var(--c-bad); }
      .tone-danger:hover:not(:disabled) { background: var(--c-bad-soft); }
      .timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
      .timeline li { position: relative; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; padding: 10px 0 10px 22px; border-bottom: 1px solid var(--c-bd); font-size: 0.88rem; }
      .timeline li:last-child { border-bottom: 0; }
      .timeline li::before { content: ''; position: absolute; left: 4px; top: 17px; width: 8px; height: 8px; border-radius: 50%; background: var(--c-primary); box-shadow: 0 0 0 3px var(--c-primary-200); }
      .timeline time { color: var(--c-mu); font-size: 0.78rem; white-space: nowrap; }
      .none { margin: 0; padding: 16px 18px; border: 1px dashed var(--c-bd); border-radius: 12px; background: var(--c-s2); }
      @media (max-width: 640px) { .facts { grid-template-columns: 1fr; gap: 4px; } .facts dd { margin-bottom: 8px; } }
    `,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="title">
          @if (facade.detail.data(); as head) { <span class="avatar" [style.--h]="hueOf(head.member.fullName)" aria-hidden="true">{{ initialsOf(head.member.fullName) }}</span> }
          <div>
            <h1>{{ facade.detail.data()?.member?.fullName ?? 'Superadministrador' }}@if (facade.detail.data()?.member?.isSelf) { <span class="badge badge-info">Tú</span> }</h1>
            <p><a routerLink="/plataforma/superadministradores"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>Volver a superadministradores</a></p>
          </div>
        </div>
      </header>

      <app-resource-state [status]="facade.detail.status()" [error]="facade.detail.error()" (retry)="facade.loadDetail(id())">
        @if (facade.detail.data(); as d) {
          <section class="card stack" aria-labelledby="sa-info">
            <h2 id="sa-info">Información</h2>
            <dl class="facts">
              <dt>Correo</dt><dd>{{ d.member.email }}</dd>
              <dt>Cuenta</dt><dd><span class="badge" [class.badge-success]="d.member.isActive" [class.badge-warning]="!d.member.isActive">{{ d.member.isActive ? 'Activo' : 'Suspendido' }}</span></dd>
              <dt>Rol global</dt><dd><span class="badge" [class.badge-success]="d.member.hasGlobalAccess" [class.badge-neutral]="!d.member.hasGlobalAccess">{{ d.member.hasGlobalAccess ? 'Superadministrador con acceso' : 'Sin acceso (cuenta suspendida)' }}</span></dd>
              <dt>Rol concedido</dt><dd>{{ d.member.assignedAt ? (d.member.assignedAt | date: 'medium') : 'Sin registro' }}@if (d.member.assignedByName) { · por {{ d.member.assignedByName }} }</dd>
              <dt>Última actividad</dt><dd>{{ d.member.lastActivityAt ? (d.member.lastActivityAt | date: 'medium') : '—' }}</dd>
            </dl>
            <div class="danger-zone">
              <button type="button" class="btn tone-danger" data-testid="revoke-detail" [disabled]="busy()" (click)="revoke()">Revocar rol global</button>
              <span class="hint">La cuenta no se elimina. Revocar libera un cupo y no es posible con el último superadministrador activo.</span>
            </div>
          </section>

          @if (d.invitation; as i) {
            <section class="card stack" aria-labelledby="sa-inv">
              <h2 id="sa-inv">Invitación asociada</h2>
              <dl class="facts">
                <dt>Estado</dt><dd>{{ statusText(i.status) }}</dd>
                <dt>Enviada</dt><dd>{{ i.createdAt | date: 'medium' }}@if (i.invitedByName) { · por {{ i.invitedByName }} }</dd>
                <dt>{{ i.status === 'ACCEPTED' ? 'Aceptada' : 'Vence' }}</dt><dd>{{ (i.acceptedAt ?? i.expiresAt) | date: 'medium' }}</dd>
              </dl>
            </section>
          }

          <section class="card stack" aria-labelledby="sa-act">
            <h2 id="sa-act">Actividad</h2>
            @if (d.activity.length === 0) {
              <p class="muted none">Todavía no hay actividad administrativa registrada para esta persona.</p>
            } @else {
              <ul class="timeline">
                @for (item of d.activity; track item.id) {
                  <li><span>{{ text(item).title }}</span><time [attr.datetime]="item.occurredAt.toISOString()" [title]="item.occurredAt | date: 'medium'">{{ ago(item.occurredAt) }}</time></li>
                }
              </ul>
            }
          </section>
        }
      </app-resource-state>
    </div>
  `,
})
export class PlatformSuperAdminDetailComponent {
  readonly id = input.required<string>();

  protected readonly facade = inject(PlatformSuperAdminsFacade);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly feedback = inject(ActionFeedbackService);
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly busy = signal(false);
  protected text = activityText;
  protected readonly hueOf = hueOf;
  protected readonly initialsOf = initialsOf;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.facade.loadDetail(id));
    });
  }

  protected ago(moment: Date): string {
    return relativeTime(moment);
  }
  protected statusText(status: string): string {
    return { PENDING: 'Pendiente', ACCEPTED: 'Aceptada', REVOKED: 'Revocada', EXPIRED: 'Vencida' }[status] ?? status;
  }

  protected async revoke(): Promise<void> {
    const detail = this.facade.detail.data();

    if (!detail) return;

    const accepted = await this.confirm.confirm({
      title: detail.member.isSelf ? 'Revocar tu propio acceso' : 'Revocar acceso global',
      message: `${detail.member.isSelf ? 'Perderás' : `${detail.member.fullName} perderá`} el acceso a la consola de plataforma de inmediato. La cuenta no se elimina y se libera un cupo. ¿Continuar?`,
      confirmLabel: 'Revocar acceso',
      danger: true,
    });

    if (!accepted) return;

    this.busy.set(true);
    this.feedback.start('Revocando acceso…');
    this.facade
      .revoke(detail.member.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.feedback.finish('Acceso global revocado. La cuenta se conserva');

          if (detail.member.isSelf) this.auth.refreshUser().subscribe({ next: () => void this.router.navigate(['/resumen']), error: () => void this.router.navigate(['/resumen']) });
          else void this.router.navigate(['/plataforma/superadministradores']);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.feedback.close();
          this.toast.error(toAppError(error));
        },
      });
  }
}
