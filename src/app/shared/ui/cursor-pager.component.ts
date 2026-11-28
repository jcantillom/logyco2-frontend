import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export const CURSOR_PAGE_SIZES: readonly number[] = [25, 50, 100];

/**
 * Paginador de listas por cursor: «Anterior» / «Siguiente» y el tamaño de página, sin páginas numeradas
 * (con un cursor no hay forma eficiente de saltar a la página N ni de saber cuántas hay). El contenido proyectado va en la misma fila, junto al «Mostrando…».
 */
@Component({
  selector: 'app-cursor-pager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; container-type: inline-size; }
      .pager { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; padding: 10px 4px 0; font-size: 0.82rem; color: var(--c-mu); }
      .info b { color: var(--c-head); font-variant-numeric: tabular-nums; }
      .size { display: inline-flex; align-items: center; gap: 8px; margin-left: auto; }
      .size select { padding: 5px 26px 5px 10px; border: 1px solid var(--c-bd); border-radius: 8px; background-color: var(--c-sf); font: inherit; color: var(--c-head); cursor: pointer; }
      .nav { display: inline-flex; align-items: center; gap: 6px; }
      .nav button { display: inline-flex; align-items: center; gap: 4px; height: 34px; padding: 0 12px; border: 1px solid var(--c-bd); border-radius: 9px; background: var(--c-sf); font: inherit; font-weight: 600; color: var(--c-head); cursor: pointer; transition: background 0.12s, border-color 0.12s; }
      .nav button:hover:not(:disabled) { background: var(--c-s2); }
      .nav button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .nav button:disabled, .nav button[aria-disabled='true'] { opacity: 0.35; cursor: not-allowed; }
      .nav svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
      @media (max-width: 640px) { .size { margin-left: 0; } }
      @container (max-width: 720px) { .size-l { display: none; } .pager { gap: 6px 12px; } }
    `,
  ],
  template: `
    <nav class="pager" aria-label="Paginación" data-testid="pager">
      <p class="info" role="status" aria-live="polite">
        Mostrando <b>{{ from() }}–{{ to() }}</b>@if (totalLabel()) { de <b data-testid="pager-total">{{ totalLabel() }}</b> }
      </p>
      <ng-content />
      <label class="size"><span class="size-l">Filas por página</span>
        <select aria-label="Filas por página" data-testid="page-size" [value]="pageSize()" (change)="changeSize($event)">
          @for (size of sizes(); track size) { <option [value]="size" [selected]="size === pageSize()">{{ size }}</option> }
        </select>
      </label>
      <div class="nav">
        <button type="button" data-testid="page-prev" [disabled]="!hasPrevious() || (busy() && !keepFocus())" [attr.aria-disabled]="busy() && keepFocus() ? 'true' : null" (click)="go(previous)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>Anterior</button>
        <button type="button" data-testid="page-next" [disabled]="!hasNext() || (busy() && !keepFocus())" [attr.aria-disabled]="busy() && keepFocus() ? 'true' : null" (click)="go(next)">Siguiente<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg></button>
      </div>
    </nav>
  `,
})
export class CursorPagerComponent {
  /** Posición del primer y el último elemento visible (desde 1). */
  readonly from = input.required<number>();
  readonly to = input.required<number>();
  /** «53», «10.000+» o vacío si el total no se conoce. */
  readonly totalLabel = input<string>('');
  readonly pageSize = input.required<number>();
  readonly sizes = input<readonly number[]>(CURSOR_PAGE_SIZES);
  readonly hasPrevious = input.required<boolean>();
  readonly hasNext = input.required<boolean>();
  /** Mientras se pide una página no se admite otro clic. */
  readonly busy = input(false);
  /** Mientras se pide otra página, los botones no se desactivan (no pierden el foco): quedan `aria-disabled` y no hacen nada. */
  readonly keepFocus = input(false);
  readonly previous = output<void>();
  readonly next = output<void>();
  readonly sizeChange = output<number>();

  protected go(target: { emit(): void }): void {
    if (this.busy() && this.keepFocus()) return;

    target.emit();
  }

  protected changeSize(event: Event): void {
    this.sizeChange.emit(Number((event.target as HTMLSelectElement).value));
  }
}
