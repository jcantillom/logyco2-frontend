import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/notifications/toast.service';

@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .host { position: fixed; right: 16px; bottom: 16px; z-index: 200; display: flex; flex-direction: column; gap: 10px; width: min(380px, calc(100vw - 32px)); }
      .toast { display: flex; gap: 10px; align-items: flex-start; box-shadow: var(--shadow); background: var(--c-sf); }
      .toast .alert { flex: 1; }
    `,
  ],
  template: `
    <div class="host" aria-live="polite" aria-atomic="false">
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          class="alert toast"
          [class.alert-success]="toast.kind === 'success'"
          [class.alert-warning]="toast.kind === 'warning'"
          [class.alert-danger]="toast.kind === 'error'"
          [attr.role]="toast.kind === 'error' ? 'alert' : 'status'"
        >
          <div style="flex: 1">
            <div>{{ toast.message }}</div>
            @if (toast.requestId) {
              <div class="small">Solicitud: <code>{{ toast.requestId }}</code></div>
            }
          </div>
          <button type="button" class="btn btn-ghost btn-sm" aria-label="Cerrar notificación" (click)="toasts.dismiss(toast.id)">✕</button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
}
