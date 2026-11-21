import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { OnboardingStatus } from '../../domain/models/onboarding';
import { NEXT_STEP_HINT, ROLE_NAMES, onboardingError } from './onboarding.labels';

type Tone = 'ok' | 'warn' | 'bad' | 'idle';

/** Estado REAL de una incorporación en tres pasos (identidad, correo, activación), con reenvío seguro. */
@Component({
  selector: 'app-onboarding-status',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      .ob { display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-s2); }
      .ob-who { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
      .ob-who strong { color: var(--c-head); }
      .ob-who span { font-size: 0.8rem; color: var(--c-mu); }
      .ob-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; }
      .ob-step { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 10px; background: var(--c-sf); border: 1px solid var(--c-bd); }
      .ob-step small { font-size: 0.7rem; color: var(--c-mu); }
      .ob-step b { font-size: 0.84rem; }
      .ob-step.ok b { color: var(--c-accent); } .ob-step.warn b { color: #9a6b00; } .ob-step.bad b { color: var(--c-bad); } .ob-step.idle b { color: var(--c-mute2); }
      .ob-step.bad { border-color: #f1c9c6; background: var(--c-s2); }
      .ob-hint { margin: 0; font-size: 0.8rem; color: var(--c-text2); }
      .ob-err { margin: 0; font-size: 0.8rem; color: var(--c-bad); }
      .ob-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    `,
  ],
  template: `
    <section class="ob" data-testid="onboarding-status" [attr.aria-label]="'Incorporación de ' + status().email">
      <div class="ob-who"><strong>{{ status().fullName || status().email }}</strong><span>{{ status().email }} · {{ role() }} · {{ status().organizationName }}</span></div>
      <ol class="ob-steps">
        <li class="ob-step" [class]="'ob-step ' + identity().tone" data-step="identity"><small>1 · Identidad corporativa</small><b>{{ identity().text }}</b></li>
        <li class="ob-step" [class]="'ob-step ' + delivery().tone" data-step="delivery"><small>2 · Correo</small><b>{{ delivery().text }}</b></li>
        <li class="ob-step" [class]="'ob-step ' + activation().tone" data-step="activation"><small>3 · Activación</small><b>{{ activation().text }}</b></li>
      </ol>
      @if (error()) { <p class="ob-err" role="alert" data-testid="onboarding-error">{{ error() }}</p> }
      <p class="ob-hint">{{ hint() }}@if (status().firstAdmin) { <span> Primer administrador: tendrá acceso inmediato al aceptar.</span> }</p>
      <div class="ob-actions">
        @if (canResend()) {
          <button type="button" class="btn btn-secondary btn-sm" data-testid="onboarding-resend" [disabled]="busy()" (click)="resend.emit(status().invitationId)">
            {{ busy() ? 'Enviando…' : status().nextStep === 'RETRY_IDENTITY' ? 'Reintentar' : 'Reenviar correo' }}
          </button>
        }
        @if (status().lastSentAt) { <span class="muted small">Último envío: {{ status().lastSentAt | date: 'medium' }} · vence {{ status().expiresAt | date: 'mediumDate' }}</span> }
      </div>
    </section>
  `,
})
export class OnboardingStatusComponent {
  readonly status = input.required<OnboardingStatus>();
  readonly busy = input(false);
  readonly resend = output<string>();

  protected readonly role = computed(() => ROLE_NAMES[this.status().roleCode] ?? this.status().roleCode);
  protected readonly error = computed(() => onboardingError(this.status().deliveryErrorCode));
  protected readonly hint = computed(() => NEXT_STEP_HINT[this.status().nextStep]);
  protected readonly canResend = computed(() => this.status().invitationStatus === 'PENDING' && this.status().nextStep !== 'DONE');
  protected readonly identity = computed<{ text: string; tone: Tone }>(() => {
    const s = this.status().identityStatus;

    return s === 'CREATED' ? { text: 'Cuenta creada', tone: 'ok' } : s === 'EXISTING' ? { text: 'Ya tenía cuenta', tone: 'ok' } : { text: 'Pendiente', tone: this.status().deliveryErrorCode ? 'bad' : 'idle' };
  });
  protected readonly delivery = computed<{ text: string; tone: Tone }>(() => {
    const s = this.status().deliveryStatus;

    return s === 'SENT' ? { text: 'Enviado', tone: 'ok' } : s === 'FAILED' ? { text: 'Falló', tone: 'bad' } : { text: 'No enviado', tone: 'idle' };
  });
  protected readonly activation = computed<{ text: string; tone: Tone }>(() => {
    const s = this.status();

    if (s.invitationStatus === 'ACCEPTED') return { text: 'Completada', tone: 'ok' };

    return s.activation === 'DONE' ? { text: 'Contraseña establecida', tone: 'ok' } : s.activation === 'PENDING' ? { text: 'Pendiente de la persona', tone: 'warn' } : { text: 'No requerida (usa su cuenta)', tone: 'idle' };
  });
}
