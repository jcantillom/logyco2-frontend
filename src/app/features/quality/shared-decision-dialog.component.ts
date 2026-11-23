import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, viewChild } from '@angular/core';
import { DECISION_CONSEQUENCE, SELECTION_CONSEQUENCE } from './shared-operations.view';

/** Lo que pide confirmación: dos decisiones sobre el viaje y las dos formas de elegir la declaración vigente en un conflicto. */
export type SharedConfirmKind = 'SAME' | 'DISTINCT' | 'MINE' | 'THEIRS';

/** Confirmación de una acción sobre viajes compartidos: dice qué pasará con las declaraciones de ambas empresas y con los totales. */
@Component({
  selector: 'app-shared-decision-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      h2 { margin: 0; font-size: 1.2rem; color: var(--c-head); }
      p { margin: 0; color: var(--c-text2); line-height: 1.45; }
      .err { color: var(--c-danger); font-weight: 600; }
    `,
  ],
  template: `
    <dialog #dialog class="dialog" aria-labelledby="sd-title" aria-describedby="sd-text" (cancel)="onCancel($event)" (close)="closed.emit()" data-testid="shared-dialog">
      <div class="dialog-body" aria-live="polite">
        <h2 id="sd-title" data-testid="shared-dialog-title">{{ title() }}</h2>
        <p id="sd-text" data-testid="shared-dialog-text">{{ text() }}</p>
        @if (error(); as message) { <p class="err" role="alert" data-testid="shared-dialog-error">{{ message }}</p> }
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" data-testid="shared-dialog-cancel" [disabled]="busy()" (click)="close()">Cancelar</button>
        <button type="button" class="btn btn-primary" data-testid="shared-dialog-confirm" [disabled]="busy()" (click)="confirm()">{{ busy() ? 'Guardando…' : confirmLabel() }}</button>
      </div>
    </dialog>
  `,
})
export class SharedDecisionDialogComponent {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly kind = input.required<SharedConfirmKind>();
  /** Cuántos viajes se deciden a la vez. */
  readonly count = input(1);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly confirmed = output();
  readonly closed = output();

  protected readonly title = computed(() => {
    const many = this.count() > 1;

    switch (this.kind()) {
      case 'SAME':
        return many ? `¿Confirmar que son el mismo viaje en los ${this.count()} seleccionados?` : '¿Confirmar que es el mismo viaje?';
      case 'DISTINCT':
        return many ? `¿Confirmar que son viajes distintos en los ${this.count()} seleccionados?` : '¿Confirmar que son viajes distintos?';
      case 'MINE':
        return '¿Usar tu declaración como la vigente?';
      default:
        return '¿Usar la declaración de la otra empresa como la vigente?';
    }
  });
  protected readonly text = computed(() => (this.kind() === 'SAME' || this.kind() === 'DISTINCT' ? DECISION_CONSEQUENCE[this.kind() as 'SAME' | 'DISTINCT'] : SELECTION_CONSEQUENCE));
  protected readonly confirmLabel = computed(() => {
    switch (this.kind()) {
      case 'SAME':
        return 'Confirmar: es el mismo viaje';
      case 'DISTINCT':
        return 'Confirmar: son viajes distintos';
      default:
        return 'Confirmar elección';
    }
  });

  constructor() {
    afterNextRender(() => {
      const element = this.dialog().nativeElement;

      if (!element.open) element.showModal();
    });
  }

  protected confirm(): void {
    if (!this.busy()) this.confirmed.emit();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  /** Escape no interrumpe un guardado en curso. */
  protected onCancel(event: Event): void {
    if (this.busy()) event.preventDefault();
  }
}
