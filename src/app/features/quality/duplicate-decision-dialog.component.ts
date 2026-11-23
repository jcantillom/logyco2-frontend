import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { DuplicateDecision, DuplicateKeep } from '../../domain/models/duplicates';

/** Decisiones que piden confirmación; «Dejar pendiente» no cambia nada y se aplica directo. */
export type ConfirmableDecision = Exclude<DuplicateDecision, 'KEEP_PENDING'>;

/**
 * Confirmación de una decisión sobre posibles duplicados (uno o varios): dice qué pasará con los totales y, con «mismo viaje», obliga a
 * elegir qué versión se queda (sin opción marcada de antemano). Nada se borra: la versión que no se queda se conserva en el historial.
 */
@Component({
  selector: 'app-duplicate-decision-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      fieldset { margin: 0; padding: 0; border: 0; display: grid; gap: 8px; min-width: 0; }
      legend { padding: 0; margin-bottom: 4px; font-weight: 700; color: var(--c-head); }
      .opt { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--c-bd); border-radius: 12px; cursor: pointer; background: var(--c-sf); }
      .opt:hover { background: var(--c-s2); }
      .opt.off { cursor: not-allowed; opacity: 0.6; background: var(--c-s2); }
      .opt .why { color: var(--c-danger); font-weight: 600; }
      .opt:has(input:checked) { border-color: var(--c-primary); background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); }
      .opt:has(input:focus-visible) { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .opt input { margin-top: 3px; accent-color: var(--c-primary); }
      .opt strong { display: block; color: var(--c-head); }
      .opt small { display: block; color: var(--c-mu); overflow-wrap: anywhere; }
      h2 { margin: 0; font-size: 1.2rem; color: var(--c-head); }
      p { margin: 0; color: var(--c-text2); line-height: 1.45; }
      .err { color: var(--c-danger); font-weight: 600; }
    `,
  ],
  template: `
    <dialog #dialog class="dialog" aria-labelledby="dd-title" aria-describedby="dd-text" (cancel)="onCancel($event)" (close)="closed.emit()" data-testid="decision-dialog">
      <div class="dialog-body" aria-live="polite">
        <h2 id="dd-title" data-testid="decision-title">{{ title() }}</h2>
        <p id="dd-text" data-testid="decision-text">{{ text() }}</p>
        @if (decision() === 'SAME_TRIP') {
          <fieldset data-testid="keep-options">
            <legend>¿Qué versión se queda?</legend>
            <label class="opt">
              <input type="radio" name="keep" value="NEW" data-testid="keep-new" [checked]="keep() === 'NEW'" [disabled]="retainedBlocked()" [attr.aria-describedby]="retainedBlocked() ? 'dd-blocked' : null" (change)="keep.set('NEW')" />
              <span><strong>Quedarme con el retenido{{ fileA() ? ' (archivo ' + fileA() + ')' : '' }}</strong>@if (retainedBlocked()) { <small class="why" id="dd-blocked" data-testid="keep-new-blocked">{{ blockedReason() }}</small> }</span>
            </label>
            <label class="opt">
              <input type="radio" name="keep" value="EXISTING" data-testid="keep-existing" [checked]="keep() === 'EXISTING'" (change)="keep.set('EXISTING')" />
              <span><strong>Quedarme con el vigente{{ fileB() ? ' (archivo ' + fileB() + ')' : '' }}</strong></span>
            </label>
          </fieldset>
        }
        @if (error(); as message) { <p class="err" role="alert" data-testid="decision-error">{{ message }}</p> }
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" data-testid="decision-cancel" [disabled]="busy()" (click)="close()">Cancelar</button>
        <button type="button" class="btn btn-primary" data-testid="decision-confirm" [disabled]="busy() || !ready()" (click)="confirm()">{{ busy() ? 'Guardando…' : confirmLabel() }}</button>
      </div>
    </dialog>
  `,
})
export class DuplicateDecisionDialogComponent {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly decision = input.required<ConfirmableDecision>();
  /** Cuántos pares se deciden a la vez. */
  readonly count = input(1);
  /** Nombres de los archivos de A y de B, solo cuando se decide un único par. */
  readonly fileA = input<string | null>(null);
  readonly fileB = input<string | null>(null);
  /** El retenido (A) tiene resultado calculado; sin él no suma emisiones. */
  readonly retainedHasResult = input(true);
  /** El vigente (B) tiene resultado calculado. */
  readonly currentHasResult = input(true);
  /** Con varios pares, cuántos retenidos no tienen resultado calculado. */
  readonly withoutResult = input(0);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly confirmed = output<DuplicateKeep | undefined>();
  readonly closed = output();

  protected readonly keep = signal<DuplicateKeep | null>(null);
  /** Quedarse con el retenido dejaría al viaje sin resultado calculado mientras el vigente sí lo tiene: el servidor lo rechaza, aquí no se ofrece. */
  protected readonly retainedBlocked = computed(() => (this.many() ? this.withoutResult() > 0 : !this.retainedHasResult() && this.currentHasResult()));
  protected readonly blockedReason = computed(() =>
    this.many() ? `No disponible: ${this.withoutResult()} de los retenidos todavía no ${this.withoutResult() === 1 ? 'tiene' : 'tienen'} resultado calculado.` : 'No disponible: el retenido todavía no tiene resultado calculado.',
  );
  protected readonly ready = computed(() => this.decision() !== 'SAME_TRIP' || (this.keep() !== null && !(this.keep() === 'NEW' && this.retainedBlocked())));
  private readonly many = computed(() => this.count() > 1);
  protected readonly title = computed(() => {
    const n = this.count();

    if (this.decision() === 'SAME_TRIP') return this.many() ? `¿Son el mismo viaje en las ${n} operaciones seleccionadas?` : '¿Son el mismo viaje?';

    return this.many() ? `¿Son viajes diferentes las ${n} operaciones seleccionadas?` : '¿Son viajes diferentes?';
  });
  protected readonly text = computed(() => {
    if (this.decision() === 'SAME_TRIP') {
      return this.many()
        ? 'En cada par solo una versión seguirá sumando en tus emisiones. La otra se conserva en el historial y deja de contar; no se borra nada.'
        : 'Solo una de las dos versiones seguirá sumando en tus emisiones. La otra se conserva en el historial y deja de contar; no se borra nada.';
    }

    const missing = this.many() ? this.withoutResult() : this.retainedHasResult() ? 0 : 1;

    if (!this.many()) {
      return missing === 0
        ? 'Los dos viajes se sumarán a tus emisiones, cada uno por separado.'
        : 'Este viaje quedará como un viaje independiente, pero todavía no tiene resultado calculado, así que no suma emisiones hasta que corrijas sus datos.';
    }

    const total = this.count();

    if (missing === 0) return 'Los viajes retenidos pasarán a ser viajes independientes y se sumarán a tus emisiones junto con los vigentes.';

    return `Los viajes retenidos pasarán a ser viajes independientes. ${missing === total ? 'Ninguno' : `${missing} de ${total}`} todavía ${missing === 1 ? 'no tiene' : 'no tienen'} resultado calculado, así que ${missing === 1 ? 'no suma' : 'no suman'} emisiones hasta que corrijas sus datos.`;
  });
  protected readonly confirmLabel = computed(() => (this.decision() === 'SAME_TRIP' ? 'Confirmar: son el mismo viaje' : 'Confirmar: son viajes diferentes'));

  constructor() {
    afterNextRender(() => {
      const element = this.dialog().nativeElement;

      if (!element.open) element.showModal();
    });
  }

  protected confirm(): void {
    if (this.busy() || !this.ready()) return;

    this.confirmed.emit(this.decision() === 'SAME_TRIP' ? (this.keep() ?? undefined) : undefined);
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  /** Escape no interrumpe un guardado en curso. */
  protected onCancel(event: Event): void {
    if (this.busy()) event.preventDefault();
  }
}
