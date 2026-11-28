import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, output, viewChild } from '@angular/core';
import { TripVoidFacade, VOID_REASON_MAX } from './trip-void.facade';
import { voidErrorText } from './registration.view';

/**
 * Confirmación de «Anular viaje»: dice la consecuencia en palabras simples, pide un motivo opcional (hasta 200 caracteres) y confirma. Nunca se borra nada.
 * Diálogo nativo (foco atrapado, `Escape` cancela). El estado y el pedido viven en `TripVoidFacade`.
 */
@Component({
  selector: 'app-trip-void-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      dialog.void { width: min(460px, calc(100vw - var(--dlg-left, 0px) - 32px)); border-radius: 16px; background: var(--c-sf); }
      .vb { display: grid; gap: 10px; padding: 18px 20px 12px; }
      h2 { margin: 0; font-size: 1.15rem; color: var(--c-head); }
      h2:focus { outline: none; }
      p { margin: 0; font-size: 0.9rem; line-height: 1.45; color: var(--c-text2); }
      .f { display: grid; gap: 2px; }
      .f label { font-size: 0.78rem; font-weight: 650; color: var(--c-head); }
      .f textarea { width: 100%; box-sizing: border-box; min-height: 64px; padding: 6px 10px; resize: none; font: inherit; }
      .f small { text-align: right; font-size: 0.72rem; color: var(--c-mu); }
      .alert { margin: 0; padding: 8px 10px; font-size: 0.84rem; }
      .ft { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding: 10px 20px; border-top: 1px solid var(--c-bd); background: var(--c-s2); border-radius: 0 0 16px 16px; }
      .ft .btn { min-height: 36px; padding: 0 14px; }
    `,
  ],
  template: `
    <dialog #dialog class="dialog void" aria-labelledby="void-title" aria-describedby="void-text" data-testid="void-dialog" (cancel)="onCancel($event)" (close)="closed.emit()">
      <div class="vb">
        <h2 id="void-title" tabindex="-1" #title>¿Anular este viaje?</h2>
        <p id="void-text" data-testid="void-text">El viaje dejará de contarse en tus emisiones. No se elimina: queda en el historial como Anulado.</p>
        <div class="f">
          <label for="void-reason">Motivo (opcional)</label>
          <textarea id="void-reason" class="input" [attr.maxlength]="max" [value]="facade.reason()" [disabled]="facade.saving()" data-testid="void-reason" (input)="facade.setReason(read($event))"></textarea>
          <small aria-hidden="true" data-testid="void-count">{{ facade.reason().length }}/{{ max }}</small>
        </div>
        @if (facade.error(); as e) { <p class="alert alert-danger" role="alert" data-testid="void-error">{{ errorText(e) }}</p> }
      </div>
      <div class="ft">
        <button type="button" class="btn btn-ghost" data-testid="void-cancel" [disabled]="facade.saving()" (click)="close()">Cancelar</button>
        <button type="button" class="btn btn-danger" data-testid="void-confirm" [disabled]="facade.saving()" [attr.aria-busy]="facade.saving()" (click)="facade.confirm()">{{ facade.saving() ? 'Anulando…' : 'Anular viaje' }}</button>
      </div>
    </dialog>
  `,
})
export class TripVoidDialogComponent {
  protected readonly facade = inject(TripVoidFacade);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** El diálogo se cerró (cancelado, anulado o por Escape): la pantalla devuelve el foco. */
  readonly closed = output<void>();

  protected readonly max = VOID_REASON_MAX;
  protected readonly errorText = voidErrorText;

  constructor() {
    afterNextRender(() => {
      const element = this.dialog().nativeElement;

      if (!element.open) element.showModal();
    });
  }

  protected read(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected close(): void {
    this.closed.emit();
  }

  /** Escape no interrumpe una anulación en curso. */
  protected onCancel(event: Event): void {
    if (this.facade.saving()) event.preventDefault();
  }
}
