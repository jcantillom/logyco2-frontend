import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthFacade } from '../../core/auth/auth.facade';
import { AppError } from '../../core/errors/app-error';
import { SUPER_ADMIN_LIMIT_MESSAGE } from '../../core/errors/error-catalog';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { ActionFeedbackService } from '../../core/notifications/action-feedback.service';
import { ToastService } from '../../core/notifications/toast.service';
import { SuperAdminInvitation, SuperAdminMember } from '../../domain/models/platform-admin';
import { hueOf, initialsOf } from '../../shared/ui/avatar';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { PlatformSuperAdminsFacade } from './platform.facades';

const STATUS_LABEL: Record<string, { text: string; badge: string }> = {
  PENDING: { text: 'Pendiente', badge: 'badge-warning' },
  ACCEPTED: { text: 'Aceptada', badge: 'badge-success' },
  REVOKED: { text: 'Revocada', badge: 'badge-neutral' },
  EXPIRED: { text: 'Vencida', badge: 'badge-neutral' },
};

/** Aviso que debe mostrarse tal cual cuando se completa el cupo. */
export const LIMIT_MESSAGE = SUPER_ADMIN_LIMIT_MESSAGE;

@Component({
  selector: 'app-platform-super-admins',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, ResourceStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; min-width: 0; }
      .head { display: flex; align-items: center; gap: 14px; }
      .head-ico { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 13px; background: linear-gradient(145deg, var(--c-primary-600), var(--c-primary)); color: #fff; box-shadow: 0 6px 14px color-mix(in srgb, var(--c-primary) 25%, transparent); flex: none; }
      .head-ico svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .card { padding: 22px 24px; border: 1px solid var(--c-bd); border-radius: 14px; background: linear-gradient(135deg, var(--c-sf), var(--c-gray-50)); box-shadow: 0 10px 30px color-mix(in srgb, var(--c-gray) 5%, transparent), 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); }
      .quota { display: grid; gap: 20px 32px; grid-template-columns: minmax(220px, 300px) 1fr; align-items: center; }
      .quota .big { font-size: 2.6rem; font-weight: 800; color: var(--c-head); line-height: 1; font-variant-numeric: tabular-nums; }
      .quota .big small { font-size: 0.95rem; font-weight: 600; color: var(--c-mu); }
      .slots { display: flex; gap: 8px; margin: 14px 0 4px; }
      .slots i { flex: 1; height: 12px; border-radius: 6px; background: var(--c-s3); }
      .slots i.on { background: var(--c-primary); }
      .slots i.reserved { background: repeating-linear-gradient(45deg, var(--c-primary-400) 0 5px, var(--c-primary-200) 5px 10px); }
      .facts { display: flex; flex-wrap: wrap; gap: 12px; color: var(--c-mu); font-size: 0.82rem; }
      .facts span { flex: 1 1 150px; padding: 12px 16px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-sf); }
      .facts b { display: block; margin-bottom: 2px; font-size: 1.5rem; line-height: 1.1; color: var(--c-head); font-variant-numeric: tabular-nums; }
      .empty-state { text-align: center; padding: 24px 16px; border: 1px dashed var(--c-bd); border-radius: 14px; background: var(--c-s2); }
      .empty-state h3 { margin-bottom: 4px; }
      .who { display: flex; align-items: center; gap: 12px; }
      .avatar { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 11px; background: var(--c-ok-soft); border: 1px solid var(--c-primary-200); color: var(--c-accent); font-size: 0.72rem; font-weight: 700; flex: none; }
      .me { margin-left: 6px; }
      .by { display: block; }
      .email { display: block; font-weight: 400; margin-top: 2px; }
      .nowrap { white-space: nowrap; }
      .stack > h2 { margin: 0; font-size: 1.05rem; }
      .table-wrap { overflow: auto; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: 0 10px 30px color-mix(in srgb, var(--c-gray) 5%, transparent), 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); }
      .table th { background: var(--c-s2); font-size: 0.74rem; letter-spacing: 0.03em; color: var(--c-mute2); }
      .table td, .table th { padding: 14px 18px; }
      .table tbody tr { transition: background 0.12s; }
      .table tbody tr:hover { background: var(--c-row-hover); }
      .table th.c, .table td.c { text-align: center; }
      /* La columna de acciones se ajusta a sus botones y queda centrada bajo su cabecera. */
      .table th.act, .table td.act { width: 1%; white-space: nowrap; text-align: center; padding-inline: 20px; }
      .acts { display: inline-flex; gap: 8px; }
      .tone-neutral { background: var(--c-sf); border-color: var(--c-bd); color: var(--c-head); }
      .tone-danger { background: var(--c-sf); border-color: #d98a84; color: var(--c-bad); }
      .tone-danger:hover:not(:disabled) { background: var(--c-bad-soft); }
      .none { padding: 18px 20px; border: 1px dashed var(--c-bd); border-radius: 14px; background: var(--c-s2); }
      .role-chip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; background: var(--c-s2); border: 1px solid var(--c-bd); color: var(--c-accent); font-weight: 700; }
      .check { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 8px; background: var(--c-warning-bg); border: 1px solid #ecd089; color: var(--c-warning); font-size: 0.9rem; }
      .code { word-break: break-all; padding: 12px; background: var(--c-bg); border-radius: 8px; display: block; font-size: 0.95rem; }
      ol.steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 0.9rem; }
      @media (max-width: 720px) { .quota { grid-template-columns: 1fr; } }
    `,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="head">
          <span class="head-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5zM5 21h14" /></svg></span>
          <div>
            <h1>Superadministradores</h1>
            <p>Personas con acceso global de administración. El máximo de {{ maxLabel() }} activos se aplica en el servidor.</p>
          </div>
        </div>
        <button type="button" class="btn btn-primary" data-testid="invite-open" [disabled]="limitReached()" [attr.aria-describedby]="limitReached() ? 'limit-msg' : null" (click)="openInvite()">
          Incorporar superadministrador
        </button>
      </header>

      <app-resource-state [status]="facade.overview.status()" [error]="facade.overview.error()" (retry)="facade.load()">
        @if (facade.overview.data(); as o) {
          <section class="card stack" aria-labelledby="quota-title" data-testid="quota">
            <div class="quota">
              <div>
                <h2 id="quota-title" class="sr-only">Cupos</h2>
                <div class="big">{{ o.quota.active }} <small>de {{ o.quota.maxActive }} cupos ocupados</small></div>
                <div class="slots" aria-hidden="true">
                  @for (slot of slots(); track $index) { <i [class.on]="slot === 'on'" [class.reserved]="slot === 'reserved'"></i> }
                </div>
              </div>
              <div class="facts">
                <span><b>{{ o.quota.available }}</b> cupo(s) disponible(s)</span>
                <span><b>{{ o.quota.reservedByInvitations }}</b> reservado(s) por invitaciones</span>
                <span><b>{{ pending().length }}</b> invitación(es) pendiente(s)</span>
              </div>
            </div>
          </section>

          @if (o.quota.limitReached) {
            <div class="alert alert-warning" role="alert" id="limit-msg" data-testid="limit-reached"><span>{{ limitMessage }}</span></div>
          } @else if (pending().length > 0) {
            <div class="alert" role="status" data-testid="pending-note"><span>Hay {{ pending().length }} invitación(es) pendiente(s) que reservan cupo hasta que se acepten, se revoquen o venzan.</span></div>
          }

          @if (onlyMe()) {
            <div class="empty-state" data-testid="only-me">
              <h3>Aún no hay superadministradores adicionales</h3>
              <p class="muted">Eres el único. Incorpora a otra persona para no depender de una sola cuenta.</p>
            </div>
          }

          <section class="stack" aria-labelledby="members-title">
            <h2 id="members-title">Superadministradores actuales</h2>
            <div class="table-wrap">
              <table class="table">
                <caption class="sr-only">Superadministradores</caption>
                <thead><tr><th scope="col">Persona</th><th scope="col" class="c">Cuenta</th><th scope="col" class="c">Rol global</th><th scope="col" class="c">Rol concedido</th><th scope="col" class="c">Última actividad</th><th scope="col" class="act">Acciones</th></tr></thead>
                <tbody>
                  @for (m of o.members; track m.userId) {
                    <tr data-testid="member-row">
                      <th scope="row" style="text-transform: none; letter-spacing: 0; font-size: inherit; background: transparent">
                        <div class="who">
                          <span class="avatar" [style.--h]="hueOf(m.fullName)" aria-hidden="true">{{ initialsOf(m.fullName) }}</span>
                          <div>
                            <a [routerLink]="['/plataforma/superadministradores', m.userId]">{{ m.fullName }}</a>@if (m.isSelf) { <span class="badge badge-info me">Tú</span> }
                            <span class="muted small email">{{ m.email }}</span>
                          </div>
                        </div>
                      </th>
                      <td class="c"><span class="badge" [class.badge-success]="m.isActive" [class.badge-warning]="!m.isActive">{{ m.isActive ? 'Activo' : 'Suspendido' }}</span></td>
                      <td class="c"><span class="badge" [class.badge-success]="m.hasGlobalAccess" [class.badge-neutral]="!m.hasGlobalAccess">{{ m.hasGlobalAccess ? 'Con acceso' : 'Sin acceso' }}</span></td>
                      <td class="c">@if (m.assignedAt) { {{ m.assignedAt | date: 'mediumDate' }}@if (m.assignedByName) { <span class="muted small by">por {{ m.assignedByName }}</span> } } @else { <span class="muted" title="Se concedió antes de que se registrara quién y cuándo">Sin registro</span> }</td>
                      <td class="nowrap c">{{ m.lastActivityAt ? (m.lastActivityAt | date: 'short') : '—' }}</td>
                      <td class="act">
                        <span class="acts">
                          <a class="btn btn-sm tone-neutral" [routerLink]="['/plataforma/superadministradores', m.userId]">Ver detalle</a>
                          <button type="button" class="btn btn-sm tone-danger" data-testid="revoke" title="Retira su acceso global de administración" [disabled]="busy()" (click)="revoke(m)">Revocar</button>
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="stack" aria-labelledby="inv-title">
            <h2 id="inv-title">Invitaciones</h2>
            @if (o.invitations.length === 0) {
              <p class="muted none">Todavía no se ha enviado ninguna invitación.</p>
            } @else {
              <div class="table-wrap">
                <table class="table">
                  <caption class="sr-only">Invitaciones de superadministrador</caption>
                  <thead><tr><th scope="col">Persona</th><th scope="col" class="c">Estado</th><th scope="col" class="c">Enviada</th><th scope="col" class="c">Vence</th><th scope="col" class="act">Acciones</th></tr></thead>
                  <tbody>
                    @for (i of o.invitations; track i.id) {
                      <tr data-testid="invitation-row">
                        <th scope="row" style="text-transform: none; letter-spacing: 0; font-size: inherit; background: transparent">{{ i.inviteeName }}<br /><span class="muted small">{{ i.email }}</span></th>
                        <td class="c"><span class="badge" [class]="statusBadge(i.status)">{{ statusText(i.status) }}</span></td>
                        <td class="c">{{ i.createdAt | date: 'mediumDate' }}@if (i.invitedByName) { <span class="muted small"> · {{ i.invitedByName }}</span> }</td>
                        <td class="nowrap c">{{ i.status === 'PENDING' ? (i.expiresAt | date: 'medium') : '—' }}</td>
                        <td class="act">@if (i.status === 'PENDING') { <button type="button" class="btn btn-sm tone-danger" [disabled]="busy()" (click)="revokeInvitation(i)">Revocar invitación</button> }</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>
        }
      </app-resource-state>
    </div>

    <dialog #inviteDialog class="dialog" aria-labelledby="invite-title">
      <form [formGroup]="form" (ngSubmit)="invite()" novalidate>
        <div class="dialog-body">
          <h2 id="invite-title">Incorporar superadministrador</h2>
          <p class="hint">No se crea ninguna cuenta ni contraseña. La persona debe iniciar sesión con su cuenta corporativa y aceptar con un código: solo entonces se concede el acceso.</p>
          @if (inviteError(); as e) { <div class="alert alert-danger" role="alert" data-testid="invite-error">{{ e.message }}</div> }
          <div class="field">
            <label for="sa-name">Nombre completo</label>
            <input id="sa-name" class="input" type="text" formControlName="fullName" maxlength="255" [attr.aria-invalid]="form.controls.fullName.touched && form.controls.fullName.invalid" />
            @if (form.controls.fullName.touched && form.controls.fullName.invalid) { <span class="field-error">El nombre es obligatorio.</span> }
          </div>
          <div class="field">
            <label for="sa-email">Correo electrónico</label>
            <input id="sa-email" class="input" type="email" formControlName="email" maxlength="320" [attr.aria-invalid]="form.controls.email.touched && form.controls.email.invalid" />
            @if (form.controls.email.touched && form.controls.email.invalid) { <span class="field-error">Ingresa un correo válido.</span> }
          </div>
          <div class="grid grid-2">
            <div class="field"><span id="sa-role-label" style="font-weight: 600; font-size: 0.9rem">Rol global</span><span class="role-chip" aria-labelledby="sa-role-label">Superadministrador</span></div>
            <div class="field">
              <label for="sa-days">Vigencia de la invitación</label>
              <select id="sa-days" class="input" formControlName="expiresInDays"><option [ngValue]="3">3 días</option><option [ngValue]="7">7 días</option><option [ngValue]="14">14 días</option></select>
            </div>
          </div>
          <label class="check">
            <input type="checkbox" formControlName="confirm" data-testid="invite-confirm" />
            <span>Entiendo que concedo <strong>acceso total de administración de la plataforma</strong> y que ocupará uno de los {{ maxLabel() }} cupos.</span>
          </label>
          @if (form.controls.confirm.touched && form.controls.confirm.invalid) { <span class="field-error">Debes confirmar para continuar.</span> }
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" (click)="closeInvite()">Cancelar</button>
          <button type="submit" class="btn btn-primary" data-testid="invite-submit" [disabled]="busy()">{{ busy() ? 'Creando…' : 'Crear invitación' }}</button>
        </div>
      </form>
    </dialog>

    <dialog #codeDialog class="dialog" aria-labelledby="sa-code-title" (close)="created.set(null)">
      <div class="dialog-body">
        <h2 id="sa-code-title">Invitación creada</h2>
        <div class="alert alert-warning" role="note">Este código se muestra <strong>una sola vez</strong>: no se puede recuperar después.</div>
        <code class="code" data-testid="super-admin-code">{{ created()?.code }}</code>
        <ol class="steps">
          <li>Compártelo con {{ created()?.inviteeName }} por un canal seguro.</li>
          <li>La persona inicia sesión en LoGyCO₂ con su cuenta corporativa.</li>
          <li>Ingresa el código en «Aceptar invitación». El acceso se activa al aceptar.</li>
        </ol>
        @if (created(); as c) { <p class="hint">Vigente hasta el {{ c.expiresAt | date: 'medium' }}.</p> }
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" (click)="copyCode()">Copiar código</button>
        <button type="button" class="btn btn-primary" (click)="closeCode()">Cerrar</button>
      </div>
    </dialog>
  `,
})
export class PlatformSuperAdminsComponent {
  protected readonly facade = inject(PlatformSuperAdminsFacade);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly feedback = inject(ActionFeedbackService);
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inviteDialog = viewChild.required<ElementRef<HTMLDialogElement>>('inviteDialog');
  private readonly codeDialog = viewChild.required<ElementRef<HTMLDialogElement>>('codeDialog');

  protected readonly limitMessage = LIMIT_MESSAGE;
  protected readonly busy = signal(false);
  protected readonly inviteError = signal<AppError | null>(null);
  protected readonly created = signal<{ code: string; inviteeName: string; expiresAt: Date } | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(255)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
    expiresInDays: [7],
    confirm: [false, Validators.requiredTrue],
  });

  protected readonly limitReached = computed(() => this.facade.overview.data()?.quota.limitReached ?? false);
  protected readonly maxLabel = computed(() => this.facade.overview.data()?.quota.maxActive ?? 5);
  protected readonly pending = computed(() => (this.facade.overview.data()?.invitations ?? []).filter((i) => i.status === 'PENDING'));
  protected readonly hueOf = hueOf;
  protected readonly initialsOf = initialsOf;
  protected readonly onlyMe = computed(() => {
    const members = this.facade.overview.data()?.members ?? [];

    return members.length === 1 && members[0].isSelf;
  });
  protected readonly slots = computed(() => {
    const quota = this.facade.overview.data()?.quota;

    return quota
      ? Array.from({ length: quota.maxActive }, (_, i) => (i < quota.active ? 'on' : i < quota.active + quota.reservedByInvitations ? 'reserved' : 'free'))
      : [];
  });

  constructor() {
    this.facade.load();
  }

  protected statusText(status: string): string {
    return STATUS_LABEL[status]?.text ?? status;
  }
  protected statusBadge(status: string): string {
    return STATUS_LABEL[status]?.badge ?? 'badge-neutral';
  }

  protected openInvite(): void {
    if (this.limitReached()) return;

    this.form.reset({ fullName: '', email: '', expiresInDays: 7, confirm: false });
    this.inviteError.set(null);
    this.inviteDialog().nativeElement.showModal();
  }
  protected closeInvite(): void {
    this.inviteDialog().nativeElement.close();
  }
  protected closeCode(): void {
    this.codeDialog().nativeElement.close();
  }
  protected async copyCode(): Promise<void> {
    const code = this.created()?.code;

    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      this.toast.success('Código copiado.');
    } catch {
      this.toast.error('No se pudo copiar; selecciona el código manualmente.');
    }
  }

  protected invite(): void {
    this.form.markAllAsTouched();

    if (this.form.invalid || this.busy()) return;

    const value = this.form.getRawValue();
    this.busy.set(true);
    this.inviteError.set(null);
    this.facade
      .invite({ fullName: value.fullName.trim(), email: value.email.trim(), expiresInDays: value.expiresInDays })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invitation) => {
          this.busy.set(false);
          this.closeInvite();
          this.created.set({ code: invitation.code, inviteeName: invitation.inviteeName, expiresAt: invitation.expiresAt });
          this.codeDialog().nativeElement.showModal();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.inviteError.set(toAppError(error));
        },
      });
  }

  protected async revoke(member: SuperAdminMember): Promise<void> {
    const accepted = await this.confirm.confirm({
      title: member.isSelf ? 'Revocar tu propio acceso' : 'Revocar acceso global',
      message: member.isSelf
        ? 'Perderás el acceso a la consola de plataforma de inmediato. Tu cuenta no se elimina. ¿Continuar?'
        : `${member.fullName} dejará de ser superadministrador de inmediato y perderá la consola de plataforma. Su cuenta no se elimina y conserva sus membresías de empresa. Se libera un cupo. ¿Continuar?`,
      confirmLabel: 'Revocar acceso',
      danger: true,
    });

    if (!accepted) return;

    this.busy.set(true);
    this.feedback.start('Revocando acceso…');
    this.facade
      .revoke(member.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.feedback.finish(member.isSelf ? 'Revocaste tu acceso global' : 'Acceso global revocado. La cuenta se conserva');

          if (member.isSelf) this.auth.refreshUser().subscribe({ next: () => void this.router.navigate(['/resumen']), error: () => void this.router.navigate(['/resumen']) });
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.feedback.close();
          this.toast.error(toAppError(error));
        },
      });
  }

  protected async revokeInvitation(invitation: SuperAdminInvitation): Promise<void> {
    const accepted = await this.confirm.confirm({
      title: 'Revocar invitación',
      message: `El código enviado a ${invitation.email} dejará de funcionar y se libera el cupo reservado. ¿Continuar?`,
      confirmLabel: 'Revocar invitación',
      danger: true,
    });

    if (!accepted) return;

    this.busy.set(true);
    this.feedback.start('Revocando invitación…');
    this.facade
      .revokeInvitation(invitation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.feedback.finish('Invitación revocada');
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.feedback.close();
          this.toast.error(toAppError(error));
        },
      });
  }
}
