import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ActivationCheck } from '../../domain/models/onboarding';
import { LogoComponent } from '../../shared/ui/logo.component';
import { OnboardingFacade } from '../onboarding/onboarding.facade';
import { onboardingError } from '../onboarding/onboarding.labels';

/** Clave donde se conserva el código (solo en esta pestaña) para aceptar la invitación después de iniciar sesión. */
export const PENDING_INVITATION_KEY = 'logyco2.pendingInvitationCode';

const MESSAGES: Readonly<Record<string, string>> = {
  EXPIRED: 'Este enlace expiró. Pide a tu administrador que te reenvíe la invitación.',
  USED: 'Esta cuenta ya fue activada. Inicia sesión con tu contraseña.',
  NOT_APPLICABLE: 'Ya tienes una cuenta corporativa: inicia sesión con tus credenciales actuales para aceptar la invitación.',
  INVALID: 'El enlace no es válido o fue reemplazado por uno más reciente. Revisa el último correo que recibiste.',
};

/**
 * Primer acceso: la persona abre el enlace de su correo (el código viaja en el fragmento `#codigo=`), elige su contraseña y
 * el backend la fija en el directorio corporativo. La contraseña no se guarda ni se muestra; el cambio lo confirma el backend.
 */
@Component({
  selector: 'app-activate-account',
  imports: [ReactiveFormsModule, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main style="min-height: 100vh; display: grid; place-items: center; padding: 24px">
      <section class="card stack" style="width: min(480px, 100%)" aria-labelledby="act-title">
        <app-logo variant="horizontal" theme="light" [size]="56" />
        <h1 id="act-title">Activa tu cuenta</h1>

        @if (phase() === 'checking') { <p class="muted" role="status">Validando tu enlace…</p> }

        @if (phase() === 'blocked') {
          <div class="alert alert-warning" role="alert" data-testid="activation-blocked"><div>{{ message() }}</div></div>
          <button type="button" class="btn btn-primary" (click)="goToLogin(false)">Ir a iniciar sesión</button>
        }

        @if (phase() === 'form') {
          <p class="muted">Hola. Elige la contraseña con la que ingresarás a LoGyCO₂ <strong data-testid="activation-org">({{ check()?.organizationName }})</strong>.</p>
          @if (error()) { <div class="alert alert-danger" role="alert" data-testid="activation-error"><div>{{ error() }}</div></div> }
          <form class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div class="field">
              <label for="act-email">Correo</label>
              <input id="act-email" class="input" type="email" [value]="check()?.email ?? ''" readonly autocomplete="username" />
            </div>
            <div class="field">
              <label for="act-pass">Nueva contraseña</label>
              <input id="act-pass" class="input" type="password" formControlName="password" autocomplete="new-password" [attr.aria-invalid]="form.controls.password.touched && form.controls.password.invalid" />
              <span class="hint small">Mínimo 8 caracteres. Usa mayúsculas, minúsculas, números y un símbolo.</span>
              @if (form.controls.password.touched && form.controls.password.invalid) { <span class="field-error">La contraseña debe tener entre 8 y 128 caracteres.</span> }
            </div>
            <div class="field">
              <label for="act-confirm">Confirma la contraseña</label>
              <input id="act-confirm" class="input" type="password" formControlName="confirm" autocomplete="new-password" />
              @if (form.controls.confirm.touched && mismatch()) { <span class="field-error">Las contraseñas no coinciden.</span> }
            </div>
            <button type="submit" class="btn btn-primary" data-testid="activation-submit" [disabled]="saving()">{{ saving() ? 'Activando…' : 'Activar mi cuenta' }}</button>
          </form>
        }

        @if (phase() === 'done') {
          <div class="alert alert-success" role="status" data-testid="activation-done"><div><strong>Cuenta activada.</strong> Ya puedes iniciar sesión con tu nueva contraseña.</div></div>
          <button type="button" class="btn btn-primary" data-testid="activation-login" (click)="goToLogin(true)">Iniciar sesión</button>
        }
      </section>
    </main>
  `,
})
export class ActivateAccountComponent implements OnInit {
  private readonly onboarding = inject(OnboardingFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly phase = signal<'checking' | 'blocked' | 'form' | 'done'>('checking');
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  protected readonly check = signal<ActivationCheck | null>(null);
  private code = '';

  protected readonly form = inject(FormBuilder).nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
    confirm: ['', [Validators.required]],
  });

  ngOnInit(): void {
    this.code = new URLSearchParams(this.route.snapshot.fragment ?? '').get('codigo') ?? '';

    // El código sale de la barra de direcciones (no queda en el historial ni se comparte por error).
    void this.router.navigate([], { fragment: undefined, replaceUrl: true });

    if (this.code.length < 20) {
      this.block('INVALID');

      return;
    }

    this.onboarding.checkActivation(this.code).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.check.set(result);

        if (result.state === 'VALID') this.phase.set('form');
        else this.block(result.state);
      },
      error: (failure: unknown) => {
        this.message.set(toAppError(failure).message);
        this.phase.set('blocked');
      },
    });
  }

  protected mismatch(): boolean {
    const { password, confirm } = this.form.getRawValue();

    return password !== confirm;
  }

  protected submit(): void {
    this.form.markAllAsTouched();

    if (this.form.invalid || this.mismatch() || this.saving()) return;

    this.saving.set(true);
    this.error.set('');
    this.onboarding.activate(this.code, this.form.getRawValue().password).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset();
        this.phase.set('done');
      },
      error: (failure: unknown) => {
        const app = toAppError(failure);
        this.saving.set(false);

        if (app.code === 'ACTIVATION_ALREADY_USED' || app.code === 'INVITATION_EXPIRED' || app.code === 'ACTIVATION_NOT_APPLICABLE') {
          this.block(app.code === 'ACTIVATION_ALREADY_USED' ? 'USED' : app.code === 'INVITATION_EXPIRED' ? 'EXPIRED' : 'NOT_APPLICABLE');
        } else {
          this.error.set(onboardingError(app.code) || app.message);
        }
      },
    });
  }

  protected goToLogin(acceptAfter: boolean): void {
    try {
      if (acceptAfter && this.code) sessionStorage.setItem(PENDING_INVITATION_KEY, this.code);
    } catch {
      /* sin almacenamiento: la persona pegará el código manualmente */
    }

    void this.router.navigate(['/login'], acceptAfter ? { queryParams: { returnUrl: '/aceptar-invitacion' } } : undefined);
  }

  private block(state: string): void {
    this.message.set(MESSAGES[state] ?? MESSAGES['INVALID']);
    this.phase.set('blocked');
  }
}
