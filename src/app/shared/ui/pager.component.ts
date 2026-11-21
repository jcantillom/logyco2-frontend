import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export const PAGE_SIZES: readonly number[] = [10, 25, 50, 100];

/** Elementos del paginador: números de página o `null` para los puntos suspensivos. */
export function pageWindow(current: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const wanted = new Set([1, 2, totalPages - 1, totalPages, current - 1, current, current + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const result: (number | null)[] = [];

  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1] > 1) result.push(null);
    result.push(n);
  });

  return result;
}

/** Paginador de listas largas: rango visible, tamaño de página, primera/anterior/números/siguiente/última. */
@Component({
  selector: 'app-pager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      .pager { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; padding: 10px 4px 0; font-size: 0.82rem; color: var(--c-mu); }
      .info b { color: var(--c-head); font-variant-numeric: tabular-nums; }
      .size { display: inline-flex; align-items: center; gap: 8px; margin-left: auto; }
      .size select { padding: 5px 26px 5px 10px; border: 1px solid var(--c-bd); border-radius: 8px; background-color: var(--c-sf); font: inherit; color: var(--c-head); cursor: pointer; }
      .nav { display: inline-flex; align-items: center; gap: 4px; }
      .nav button { min-width: 34px; height: 34px; padding: 0 8px; border: 1px solid transparent; border-radius: 9px; background: transparent; font: inherit; font-weight: 600; color: var(--c-head); cursor: pointer; transition: background 0.12s, border-color 0.12s; }
      .nav button:hover:not(:disabled):not([aria-current]) { background: var(--c-s2); border-color: var(--c-bd); }
      .nav button:focus-visible { outline: 3px solid var(--c-secondary-soft); }
      .nav button:disabled { opacity: 0.35; cursor: not-allowed; }
      .nav button[aria-current='page'] { background: linear-gradient(145deg, var(--c-primary-600), var(--c-primary)); color: #fff; box-shadow: 0 4px 10px color-mix(in srgb, var(--c-primary) 25%, transparent); }
      .nav svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; vertical-align: middle; }
      .gap { padding: 0 4px; letter-spacing: 0.1em; }
      @media (max-width: 640px) { .size { margin-left: 0; } .nav .num { display: none; } }
    `,
  ],
  template: `
    @if (total() > 0) {
      <nav class="pager" aria-label="Paginación" data-testid="pager">
        <p class="info" role="status" aria-live="polite">Mostrando <b>{{ from() }}–{{ to() }}</b> de <b>{{ total() }}</b></p>
        <label class="size">Filas por página
          <select aria-label="Filas por página" data-testid="page-size" [value]="pageSize()" (change)="changeSize($event)">
            @for (size of sizes(); track size) { <option [value]="size" [selected]="size === pageSize()">{{ size }}</option> }
          </select>
        </label>
        @if (totalPages() > 1) {
          <div class="nav">
            <button type="button" aria-label="Primera página" [disabled]="page() <= 1" (click)="go(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg></button>
            <button type="button" aria-label="Página anterior" data-testid="page-prev" [disabled]="page() <= 1" (click)="go(page() - 1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></button>
            @for (item of window(); track $index) {
              @if (item === null) { <span class="gap" aria-hidden="true">…</span> }
              @else { <button type="button" class="num" [attr.aria-current]="item === page() ? 'page' : null" [attr.aria-label]="'Página ' + item" (click)="go(item)">{{ item }}</button> }
            }
            <button type="button" aria-label="Página siguiente" data-testid="page-next" [disabled]="page() >= totalPages()" (click)="go(page() + 1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg></button>
            <button type="button" aria-label="Última página" [disabled]="page() >= totalPages()" (click)="go(totalPages())"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg></button>
          </div>
        }
      </nav>
    }
  `,
})
export class PagerComponent {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly sizes = input<readonly number[]>(PAGE_SIZES);
  readonly pageChange = output<number>();
  readonly sizeChange = output<number>();

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly from = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1));
  protected readonly to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
  protected readonly window = computed(() => pageWindow(this.page(), this.totalPages()));

  protected go(target: number): void {
    const clamped = Math.min(Math.max(1, target), this.totalPages());
    if (clamped !== this.page()) this.pageChange.emit(clamped);
  }

  protected changeSize(event: Event): void {
    this.sizeChange.emit(Number((event.target as HTMLSelectElement).value));
  }
}
