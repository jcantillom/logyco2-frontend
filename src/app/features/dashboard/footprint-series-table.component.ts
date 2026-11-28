import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { FootprintBucket } from '../../domain/models/footprint';
import { FOOTPRINT_UNIT, formatKgExact } from '../../shared/ui/footprint.format';
import { PARTIAL_BUCKET_HINT, seriesRows } from './footprint-series.view';

/** Filas por página: la tabla cabe en el mismo alto que el gráfico, sin scroll interno. */
export const SERIES_PAGE_SIZE = 6;

/**
 * Tabla compacta de la serie (periodo, viajes, kg y t de CO₂) con paginación de 6 filas: es la alternativa accesible del gráfico y permite leer los valores
 * exactos. El total es `series_total_kg` del servidor (no se suma en el cliente). Las cubetas parciales llevan el marcador «Parcial» con su aclaración.
 */
@Component({
  selector: 'app-footprint-series-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; min-width: 0; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 0.74rem; font-variant-numeric: tabular-nums; }
      caption { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
      th, td { height: 20px; padding: 0 6px; border-bottom: 1px solid var(--c-bd); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      thead th { color: var(--c-text2); font-weight: 700; text-align: right; border-bottom-color: var(--c-bd); }
      thead th:first-child, tbody th { text-align: left; }
      tbody th { color: var(--c-head); font-weight: 600; }
      tbody td { color: var(--c-text2); text-align: right; }
      th.lbl { width: 38%; }
      .badge { margin-left: 5px; padding: 0 5px; border-radius: 999px; box-shadow: inset 0 0 0 1px var(--c-primary); color: var(--c-head); font-size: 0.64rem; font-weight: 700; }
      .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 24px; padding-top: 2px; font-size: 0.72rem; color: var(--c-text2); }
      .foot b { color: var(--c-head); }
      .pager { display: inline-flex; align-items: center; gap: 4px; }
      .pager button { width: 22px; height: 22px; padding: 0; border: 1px solid var(--c-bd); border-radius: 6px; background: var(--c-sf); color: var(--c-head); font: inherit; line-height: 1; cursor: pointer; }
      .pager button:disabled { opacity: 0.45; cursor: default; }
      .pager button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
    `,
  ],
  template: `
    <table data-testid="series-table">
      <caption>{{ caption() }}</caption>
      <thead><tr><th scope="col" class="lbl">Periodo</th><th scope="col">Viajes</th><th scope="col">kg CO₂</th><th scope="col">t CO₂</th></tr></thead>
      <tbody>
        @for (row of pageRows(); track row.key) {
          <tr data-testid="series-row">
            <th scope="row" [attr.title]="row.range || null">{{ row.label }}@if (row.partial) { <span class="badge" [attr.title]="partialHint" data-testid="series-partial">Parcial</span><span class="sr-only">. {{ partialHint }}</span> }</th>
            <td>{{ row.trips }}</td><td>{{ row.kg }}</td><td>{{ row.tonnes }}</td>
          </tr>
        }
      </tbody>
    </table>
    <div class="foot">
      <span data-testid="series-total">Total <b>{{ totalText() }} {{ unit }}</b></span>
      @if (pages() > 1) {
        <span class="pager" role="group" aria-label="Páginas de la tabla">
          <button type="button" aria-label="Página anterior" [disabled]="page() === 0" (click)="go(-1)" data-testid="series-prev">‹</button>
          <span aria-live="polite" data-testid="series-range">{{ firstRow() }}–{{ lastRow() }} de {{ rows().length }}</span>
          <button type="button" aria-label="Página siguiente" [disabled]="page() >= pages() - 1" (click)="go(1)" data-testid="series-next">›</button>
        </span>
      }
    </div>
  `,
})
export class FootprintSeriesTableComponent {
  readonly series = input.required<readonly FootprintBucket[]>();
  /** `series_total_kg` del servidor. */
  readonly totalKg = input.required<number>();
  readonly caption = input('Emisiones de CO₂ por periodo');

  protected readonly unit = FOOTPRINT_UNIT;
  protected readonly partialHint = PARTIAL_BUCKET_HINT;
  protected readonly page = signal(0);
  protected readonly rows = computed(() => seriesRows(this.series()));
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.rows().length / SERIES_PAGE_SIZE)));
  protected readonly pageRows = computed(() => this.rows().slice(this.page() * SERIES_PAGE_SIZE, (this.page() + 1) * SERIES_PAGE_SIZE));
  protected readonly firstRow = computed(() => this.page() * SERIES_PAGE_SIZE + 1);
  protected readonly lastRow = computed(() => Math.min(this.rows().length, (this.page() + 1) * SERIES_PAGE_SIZE));
  protected readonly totalText = computed(() => formatKgExact(this.totalKg()));

  constructor() {
    // Una serie nueva (otro periodo o granularidad) vuelve a la primera página.
    effect(() => {
      this.series();
      untracked(() => this.page.set(0));
    });
  }

  protected go(step: number): void {
    this.page.update((p) => Math.min(this.pages() - 1, Math.max(0, p + step)));
  }
}
