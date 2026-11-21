import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, switchMap } from 'rxjs';
import { AuthFacade } from '../../core/auth/auth.facade';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ToastService } from '../../core/notifications/toast.service';
import { InvitationsRepository } from '../../domain/repositories/identity.repositories';
import { SuperAdminsRepository } from '../../domain/repositories/platform-admin.repositories';

/** Las invitaciones de superadministrador llevan este prefijo (el backend lo antepone al generarlas). */
export const SUPER_ADMIN_CODE_PREFIX = 'sa_';
import { LogoComponent } from '../../shared/ui/logo.component';
import { PENDING_INVITATION_KEY } from './activate-account.component';

/**
 * Vincula una identidad corporativa autenticada con una invitación. La
 * membresía resultante queda PENDIENTE hasta que un administrador la apruebe.
 */
@Component({
  selector: 'app-accept-invitation',
  imports: [ReactiveFormsModule, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main style="min-height: 100vh; display: grid; place-items: center; padding: 24px">
      <form class="card stack" style="width: min(480px, 100%)" [formGroup]="form" (ngSubmit)="submit()" novalidate aria-labelledby="inv-title">
        <app-logo variant="horizontal" theme="light" [size]="56" />
        <h1 id="inv-title">Aceptar invitación</h1>
        <p class="muted">
          Tu identidad corporativa es válida, pero todavía no tienes una cuenta en LoGyCO₂.
          Ingresa el código de invitación que recibiste.
        </p>

        @if (error(); as e) {
          <div class="alert alert-danger" role="alert">
            <div>
              <strong>{{ e.message }}</strong>
              @if (e.requestId) { <div class="small">Solicitud: <code>{{ e.requestId }}</code></div> }
            </div>
          </div>
        }
        @if (accepted()) {
          <div class="alert alert-success" role="status" data-testid="accepted">
            @if (superAdmin()) { Invitación aceptada. Ya eres <strong>superadministrador</strong> de la plataforma. }
            @else { Invitación aceptada. Tu membresía queda <strong>pendiente de aprobación</strong>: un administrador debe activarla antes de que puedas operar. }
          </div>
        }

        <div class="field">
          <label for="code">Código de invitación</label>
          <input id="code" class="input" type="password" formControlName="code" autocomplete="off" spellcheck="false" [attr.aria-invalid]="form.controls.code.invalid && form.controls.code.touched" />
          @if (form.controls.code.invalid && form.controls.code.touched) {
            <span class="field-error">El código debe tener al menos 20 caracteres.</span>
          }
        </div>

        <div class="row between">
          <button type="button" class="btn btn-secondary" (click)="auth.logout()">Cancelar sesión</button>
          <button type="submit" class="btn btn-primary" [disabled]="loading()" data-testid="accept-submit">
            {{ loading() ? 'Validando…' : 'Aceptar invitación' }}
          </button>
        </div>
      </form>
    </main>
  `,
})
export class AcceptInvitationComponent {
  protected readonly auth = inject(AuthFacade);
  private readonly invitations = inject(InvitationsRepository);
  private readonly superAdmins = inject(SuperAdminsRepository);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(false);
  protected readonly error = signal<AppError | null>(null);
  protected readonly accepted = signal(false);
  protected readonly superAdmin = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    // Mismos límites que el backend (`InvitationAccept.code`: 20–200).
    code: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(200)]],
  });

  constructor() {
    // El código llega del enlace del correo (fragmento `#codigo=`) o de la activación recién hecha (sessionStorage).
    let code = new URLSearchParams(this.route.snapshot.fragment ?? '').get('codigo') ?? '';

    try {
      code = code || (sessionStorage.getItem(PENDING_INVITATION_KEY) ?? '');
    } catch {
      /* sin almacenamiento */
    }

    if (code) this.form.controls.code.setValue(code);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    const code = this.form.getRawValue().code.trim();
    const isSuperAdmin = code.startsWith(SUPER_ADMIN_CODE_PREFIX);
    this.superAdmin.set(isSuperAdmin);

    const accept$: Observable<unknown> = isSuperAdmin ? this.superAdmins.accept(code) : this.invitations.accept(code);

    accept$
      .pipe(
        switchMap(() => {
          this.accepted.set(true);
          return this.auth.refreshUser();
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.loading.set(false);
          try { sessionStorage.removeItem(PENDING_INVITATION_KEY); } catch { /* sin almacenamiento */ }
          this.toast.success('Invitación aceptada.');
          // Un superadministrador entra a su consola; quien aceptó una membresía, a su espacio.
          void this.router.navigate([this.superAdmin() ? '/plataforma' : '/resumen']);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          const appError = toAppError(error);
          // Aceptar fue correcto pero aún no hay usuario activo con acceso: se informa sin error.
          if (this.accepted() && appError.code === 'USER_NOT_REGISTERED') return;
          this.error.set(appError);
        },
      });
  }
}
