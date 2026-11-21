import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/preferences/theme.service';
import { ActionFeedbackHostComponent } from './shared/ui/action-feedback-host.component';
import { ConfirmDialogHostComponent } from './shared/ui/confirm-dialog-host.component';
import { ToastHostComponent } from './shared/ui/toast-host.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent, ConfirmDialogHostComponent, ActionFeedbackHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <app-toast-host />
    <app-confirm-dialog-host />
    <app-action-feedback-host />
  `,
})
export class App {
  /** Aplica el tema guardado desde el primer render. */
  private readonly theme = inject(ThemeService);
}
