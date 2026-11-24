import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, untracked, viewChild } from '@angular/core';
import { BulkPlatePreview } from '../../domain/models/operations';
import { BULK_PAGE_SIZE, BulkCompletionFacade } from './bulk-completion.facade';
import { plural, previewSummary } from './completion.view';
import { kgText } from './operations.view';

const ICON = 'M2 6h12v10H2zM14 9h4l3 3v4h-7zM5 19.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M16 19.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0';

/**
 * «Completar por vehículo»: un diálogo pequeño (flota sobre la página: no añade altura ni scroll) para aportar un rendimiento EXPLÍCITO por placa a los viajes que no lo traen.
 * Paso 1: valores (6 placas por página dentro del diálogo, unidad elegida a mano, nada por defecto). Paso 2: lo que el servidor contó y calculó en seco, con «Aplicar a N viajes».
 * Paso 3: el resultado. Se ofrece en «Por completar» (junto al paginador) cuando hay viajes a la vista; sin permiso queda deshabilitado con su explicación.
 */
@Component({
  selector: 'app-bulk-completion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'onDocumentClick($event)', '(keydown.escape)': 'close()' },
  styles: [
    `
      :host { position: relative; display: inline-flex; }
      .ico { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .trigger { min-height: 34px; padding: 0 12px; font-size: 0.82rem; white-space: nowrap; }
      .panel { position: absolute; z-index: 30; bottom: calc(100% + 6px); left: 0; box-sizing: border-box; display: grid; gap: 8px; width: min(520px, calc(100vw - 32px)); padding: 10px 12px 12px; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: 0 14px 38px color-mix(in srgb, var(--c-head) 20%, transparent); }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .head h2 { margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--c-head); }
      .head h2:focus { outline: none; }
      .x { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 50%; background: var(--c-s3); color: var(--c-text2); cursor: pointer; }
      .x:focus-visible { outline: 3px solid var(--c-focus); }
      .x svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
      p { margin: 0; font-size: 0.8rem; color: var(--c-text2); }
      .scope { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 0.8rem; color: var(--c-head); }
      .scope label { display: inline-flex; align-items: center; gap: 6px; }
      table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      th { padding: 0 6px 4px; text-align: left; font-size: 0.72rem; font-weight: 700; color: var(--c-mute2); }
      td { padding: 3px 6px; border-top: 1px solid var(--c-bd); vertical-align: top; color: var(--c-head); }
      td.plate { font-weight: 700; white-space: nowrap; padding-top: 10px; }
      td.num { text-align: right; font-variant-numeric: tabular-nums; }
      .input { width: 100%; box-sizing: border-box; min-height: 32px; padding-block: 3px; }
      td small { display: block; font-size: 0.68rem; color: var(--c-danger); font-weight: 600; }
      .add { display: flex; gap: 6px; align-items: flex-end; }
      .add label { display: grid; gap: 1px; flex: 1; font-size: 0.72rem; color: var(--c-mu); }
      .pg { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.76rem; color: var(--c-mu); }
      .btn { min-height: 32px; padding: 0 12px; font-size: 0.8rem; }
      .acts { display: flex; flex-wrap: wrap; gap: 6px; }
      .sum { display: grid; gap: 4px; padding: 8px 10px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-s3); }
      .sum b { font-size: 0.9rem; color: var(--c-head); font-weight: 700; }
      .alert { margin: 0; padding: 8px 10px; font-size: 0.8rem; }
      @media (max-width: 1100px) { .panel { left: 0; } }
    `,
  ],
  template: `
    <button type="button" class="btn btn-secondary trigger" #trigger aria-haspopup="dialog" aria-controls="bulk-panel" [attr.aria-expanded]="facade.open()" [disabled]="!facade.canComplete()" [attr.aria-describedby]="facade.canComplete() ? null : 'bulk-hint'" data-testid="bulk-open" (click)="toggle()">
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon" /></svg>Completar por vehículo
    </button>
    @if (!facade.canComplete()) { <small class="sr-only" id="bulk-hint" data-testid="bulk-hint">Necesitas el permiso para cargar datos de la empresa para completar viajes</small> }
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="bulk-live">{{ facade.announcement() }}</span>

    @if (facade.open()) {
      <div class="panel" id="bulk-panel" role="dialog" aria-modal="false" aria-labelledby="bulk-title" data-testid="bulk-panel" [attr.aria-busy]="facade.busy()">
        <div class="head">
          <h2 id="bulk-title" tabindex="-1" #title>Completar por vehículo</h2>
          <button type="button" class="x" aria-label="Cerrar" data-testid="bulk-close" (click)="close()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>

        @switch (facade.step()) {
          @case ('values') {
            <p>Escribe el rendimiento solo de las placas que conoces; las filas vacías no se tocan. Nada se guarda hasta que lo confirmes.</p>
            @if (facade.importFileId()) {
              <div class="scope" role="radiogroup" aria-label="Alcance" data-testid="bulk-scope">
                <label><input type="radio" name="bulk-scope" [checked]="!facade.allImports()" (change)="facade.setScope(false)" />Solo la carga elegida en el filtro</label>
                <label><input type="radio" name="bulk-scope" [checked]="facade.allImports()" (change)="facade.setScope(true)" />Todas las cargas</label>
              </div>
            }
            @if (facade.plates().length === 0) { <p data-testid="bulk-empty">En esta página no hay viajes a los que les falte el rendimiento. Agrega una placa para revisarla.</p> }
            @else {
              <table data-testid="bulk-table">
                <caption class="sr-only">Placas con viajes sin rendimiento</caption>
                <thead><tr><th scope="col">Placa</th><th scope="col">Rendimiento</th><th scope="col">Unidad</th></tr></thead>
                <tbody>
                  @for (plate of facade.visiblePlates(); track plate) {
                    <tr data-testid="bulk-row">
                      <td class="plate">{{ plate }}</td>
                      <td><input class="input" type="text" inputmode="decimal" autocomplete="off" [attr.aria-label]="'Rendimiento de ' + plate" [attr.data-testid]="'bulk-value-' + plate" [value]="entry(plate).value" [attr.aria-invalid]="facade.plateErrors()[plate] ? 'true' : null" [attr.aria-describedby]="facade.plateErrors()[plate] ? 'bulk-err-' + plate : null" (input)="facade.setEntry(plate, { value: read($event) })" /></td>
                      <td>
                        <select class="input" [attr.aria-label]="'Unidad de ' + plate" [attr.data-testid]="'bulk-unit-' + plate" (change)="facade.setEntry(plate, { unit: read($event) })">
                          <option value="" [selected]="!entry(plate).unit">Elegir</option>
                          @for (o of facade.unitsFor(plate); track o.value) { <option [value]="o.value" [selected]="o.value === entry(plate).unit">{{ o.label }}</option> }
                        </select>
                        @if (facade.plateErrors()[plate]; as e) { <small [id]="'bulk-err-' + plate" data-testid="bulk-plate-error">{{ e }}</small> }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              @if (facade.pageCount() > 1) {
                <div class="pg" data-testid="bulk-pager">
                  <span>{{ rangeLabel() }}</span>
                  <span class="acts">
                    <button type="button" class="btn btn-secondary" [disabled]="facade.page() === 0" data-testid="bulk-prev" (click)="facade.setPage(facade.page() - 1)">Anterior</button>
                    <button type="button" class="btn btn-secondary" [disabled]="facade.page() >= facade.pageCount() - 1" data-testid="bulk-next" (click)="facade.setPage(facade.page() + 1)">Siguiente</button>
                  </span>
                </div>
              }
            }
            <form class="add" (submit)="add($event, plateInput)">
              <label>Agregar otra placa<input class="input" #plateInput type="text" autocomplete="off" maxlength="20" data-testid="bulk-add-input" /></label>
              <button type="submit" class="btn btn-secondary" data-testid="bulk-add">Agregar</button>
            </form>
            @if (facade.problem(); as p) { <p class="alert alert-danger" role="alert" data-testid="bulk-problem">{{ p }}</p> }
            @if (facade.error(); as e) { <p class="alert alert-danger" role="alert" data-testid="bulk-error">{{ e.message }}</p> }
            <div class="acts">
              <button type="button" class="btn btn-primary" [disabled]="facade.busy() || facade.filled().length === 0" [attr.aria-busy]="facade.busy()" data-testid="bulk-review" (click)="facade.review()">{{ facade.busy() ? 'Revisando…' : 'Revisar' }}</button>
              <button type="button" class="btn btn-secondary" (click)="close()">Cancelar</button>
            </div>
          }
          @case ('review') {
            @if (facade.preview(); as pv) {
              <div class="sum" data-testid="bulk-summary">
                <b>{{ summary() }}</b>
                @if (pv.totals.held > 0) { <span>{{ plural(pv.totals.held, 'viaje quedará retenido', 'viajes quedarán retenidos') }} como posible duplicado y no sumará hasta resolverlo.</span> }
                @if (pv.totals.skippedIncompatible > 0) { <span>{{ plural(pv.totals.skippedIncompatible, 'viaje no se tocará', 'viajes no se tocarán') }}: unidad incompatible con su combustible o dato ya declarado.</span> }
                <span>Aproximadamente {{ kg(pv.totals.expectedKgCo2) }} kg CO₂ (cálculo del servidor).</span>
              </div>
              <table data-testid="bulk-preview">
                <caption class="sr-only">Efecto por placa</caption>
                <thead><tr><th scope="col">Placa</th><th scope="col" class="num">Viajes</th><th scope="col" class="num">Se calcularán</th><th scope="col" class="num">Seguirán pendientes</th></tr></thead>
                <tbody>
                  @for (p of shownPlates(); track p.plate) {
                    <tr data-testid="bulk-preview-row"><td class="plate">{{ p.plate ?? '—' }}</td><td class="num">{{ p.affected }}</td><td class="num">{{ p.wouldCalculate }}</td><td class="num">{{ p.wouldRemainPending }}</td></tr>
                  }
                </tbody>
              </table>
              @if (hiddenPlates() > 0) { <p data-testid="bulk-more">y {{ hiddenPlates() }} más</p> }
              @if (facade.error(); as e) { <p class="alert alert-danger" role="alert" data-testid="bulk-error">{{ e.message }}</p> }
              <div class="acts">
                @if (facade.stale()) {
                  <button type="button" class="btn btn-primary" data-testid="bulk-rereview" (click)="facade.backToValues()">Revisar de nuevo</button>
                } @else {
                  <button type="button" class="btn btn-primary" [disabled]="facade.busy() || pv.totals.affected === 0" [attr.aria-busy]="facade.busy()" data-testid="bulk-apply" (click)="facade.apply()">{{ facade.busy() ? 'Aplicando…' : 'Aplicar a ' + plural(pv.totals.affected, 'viaje', 'viajes') }}</button>
                }
                <button type="button" class="btn btn-secondary" [disabled]="facade.busy()" data-testid="bulk-back" (click)="facade.backToValues()">Volver</button>
              </div>
            }
          }
          @default {
            @if (facade.result(); as r) {
              <div class="sum" data-testid="bulk-result">
                <b>{{ plural(r.applied, 'viaje completado', 'viajes completados') }}</b>
                <span>{{ plural(r.nowCalculated, 'quedó calculado', 'quedaron calculados') }} · {{ plural(r.stillPending, 'sigue pendiente', 'siguen pendientes') }}@if (r.held > 0) { · {{ plural(r.held, 'retenido', 'retenidos') }} }</span>
                @if (r.alreadyCompleted > 0) { <span>{{ plural(r.alreadyCompleted, 'viaje ya estaba completado', 'viajes ya estaban completados') }}: se omitieron.</span> }
                @if (r.skippedIncompatible > 0) { <span>{{ plural(r.skippedIncompatible, 'viaje no se tocó', 'viajes no se tocaron') }} por unidad incompatible o dato ya declarado.</span> }
              </div>
              <div class="acts"><button type="button" class="btn btn-primary" data-testid="bulk-finish" (click)="close()">Listo</button></div>
            }
          }
        }
      </div>
    }
  `,
})
export class BulkCompletionComponent {
  protected readonly facade = inject(BulkCompletionFacade);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');

  protected readonly icon = ICON;
  protected readonly plural = plural;
  protected readonly kg = kgText;
  protected readonly summary = computed(() => {
    const preview = this.facade.preview();

    return preview ? previewSummary(preview) : '';
  });
  /** Hasta 6 placas del efecto a la vez (sin scroll); las demás se resumen en «y N más». */
  protected readonly shownPlates = computed<readonly BulkPlatePreview[]>(() => this.facade.preview()?.perPlate.slice(0, BULK_PAGE_SIZE) ?? []);
  protected readonly hiddenPlates = computed(() => Math.max(0, (this.facade.preview()?.perPlate.length ?? 0) - BULK_PAGE_SIZE));
  protected readonly rangeLabel = computed(() => {
    const from = this.facade.page() * BULK_PAGE_SIZE + 1;

    return `${from}–${Math.min(from + BULK_PAGE_SIZE - 1, this.facade.plates().length)} de ${this.facade.plates().length} placas`;
  });

  constructor() {
    // Al abrir y al cambiar de paso el foco va al título; al cerrar vuelve al botón.
    effect(() => {
      this.facade.step();

      if (this.facade.open()) untracked(() => setTimeout(() => this.title()?.nativeElement.focus()));
    });
  }

  protected entry(plate: string): { readonly value: string; readonly unit: string } {
    return this.facade.entries()[plate] ?? { value: '', unit: '' };
  }

  protected read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected toggle(): void {
    if (this.facade.open()) this.close();
    else this.facade.show();
  }

  protected add(event: Event, input: HTMLInputElement): void {
    event.preventDefault();

    if (this.facade.addPlate(input.value)) input.value = '';
  }

  protected close(): void {
    if (!this.facade.open()) return;

    this.facade.close();
    this.trigger()?.nativeElement.focus();
  }

  protected onDocumentClick(event: Event): void {
    if (this.facade.open() && !event.composedPath().includes(this.host.nativeElement)) this.facade.close();
  }
}
