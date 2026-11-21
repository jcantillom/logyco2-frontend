import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { ConfirmService } from '../../core/notifications/confirm.service';

/** Renderiza `ConfirmService` con `<dialog>` nativo: foco atrapado y Escape cancelan. */
@Component({
  selector: 'app-confirm-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="dialog" aria-labelledby="confirm-title" (cancel)="onCancel($event)" (close)="onClosed()">
      @if (confirm.pending(); as request) {
        <div class="dialog-body">
          <h2 id="confirm-title">{{ request.title }}</h2>
          <p>{{ request.message }}</p>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" (click)="request.resolve(false)">
            {{ request.cancelLabel ?? 'Cancelar' }}
          </button>
          <button
            type="button"
            class="btn"
            [class.btn-danger]="request.danger"
            [class.btn-primary]="!request.danger"
            (click)="request.resolve(true)"
          >
            {{ request.confirmLabel ?? 'Confirmar' }}
          </button>
        </div>
      }
    </dialog>
  `,
})
export class ConfirmDialogHostComponent {
  protected readonly confirm = inject(ConfirmService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.confirm.pending()) {
        if (!element.open) element.showModal();
      } else if (element.open) {
        element.close();
      }
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.confirm.pending()?.resolve(false);
  }

  protected onClosed(): void {
    this.confirm.pending()?.resolve(false);
  }
}
