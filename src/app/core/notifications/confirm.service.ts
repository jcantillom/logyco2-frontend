import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly danger?: boolean;
}

export interface PendingConfirm extends ConfirmRequest {
  readonly resolve: (accepted: boolean) => void;
}

/** Diálogo de confirmación basado en promesa; lo renderiza `ConfirmDialogHostComponent`. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly state = signal<PendingConfirm | null>(null);

  readonly pending = this.state.asReadonly();

  confirm(request: ConfirmRequest): Promise<boolean> {
    // Una confirmación nueva cancela la anterior sin aceptarla.
    this.state()?.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.state.set({
        ...request,
        resolve: (accepted) => {
          this.state.set(null);
          resolve(accepted);
        },
      });
    });
  }
}
