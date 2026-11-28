import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, untracked, viewChild } from '@angular/core';
import { BulkPlatePreview, CompletionPlate } from '../../domain/models/operations';
import { BULK_PAGE_SIZE, BulkCompletionFacade, PlateValue } from './bulk-completion.facade';
import { plural, previewSummary } from './completion.view';
import { countText, kgText } from './operations.view';

const ICON = 'M2 6h12v10H2zM14 9h4l3 3v4h-7zM5 19.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M16 19.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0';

/**
 * «Completar por vehículo»: un diálogo pequeño (flota sobre la página: no añade altura ni scroll) para aportar un rendimiento EXPLÍCITO por placa a los viajes que no lo traen.
 * Paso 1: valores (las placas con viajes por completar que lista el servidor, 6 por página dentro del diálogo, con búsqueda por prefijo; la unidad ya declarada se muestra de solo lectura, si no se elige a mano; nada por defecto). Paso 2: lo que el servidor contó y calculó en seco, con «Aplicar a N viajes».
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
      td.plate { font-weight: 700; padding-top: 10px; }
      td.num { text-align: right; font-variant-numeric: tabular-nums; }
      .input { width: 100%; box-sizing: border-box; min-height: 32px; padding-block: 3px; }
      td small { display: block; font-size: 0.68rem; color: var(--c-danger); font-weight: 600; }
      .find { display: grid; gap: 1px; font-size: 0.72rem; color: var(--c-mu); }
      .declared { display: block; padding-top: 7px; font-size: 0.8rem; color: var(--c-head); white-space: nowrap; }
      .meta { display: block; font-weight: 400; color: var(--c-mu); font-size: 0.74rem; }
      .count { font-size: 0.76rem; color: var(--c-mu); }
      .bd { display: grid; gap: 8px; }
      .ft { display: grid; gap: 6px; }
      .pg { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.76rem; color: var(--c-mu); }
      .btn { min-height: 32px; padding: 0 12px; font-size: 0.8rem; }
      .acts { display: flex; flex-wrap: wrap; gap: 6px; }
      .sum { display: grid; gap: 4px; padding: 8px 10px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-s3); }
      .sum b { font-size: 0.9rem; color: var(--c-head); font-weight: 700; }
      .alert { margin: 0; padding: 8px 10px; font-size: 0.8rem; }
      @media (max-width: 1100px) { .panel { left: 0; } }
      @media (max-width: 719px) {
        .panel { position: fixed; inset: 0; width: 100vw; max-height: 100dvh; display: flex; flex-direction: column; border-radius: 0; border: 0; box-shadow: none; }
        .bd { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
        .head, .ft { flex: none; }
      }
    `,
  ],
  template: `
    <button type="button" class="btn btn-secondary trigger" #trigger aria-label="Completar por vehículo" title="Completar por vehículo" aria-haspopup="dialog" aria-controls="bulk-panel" [attr.aria-expanded]="facade.open()" [disabled]="!facade.canComplete()" [attr.aria-describedby]="facade.canComplete() ? null : 'bulk-hint'" data-testid="bulk-open" (click)="toggle()">
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon" /></svg>Por vehículo
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
            <div class="bd">
              <p>Escribe el rendimiento solo de las placas que conoces; las filas vacías no se tocan. Nada se guarda hasta que lo confirmes.</p>
              @if (facade.importFileId()) {
                <div class="scope" role="radiogroup" aria-label="Alcance" data-testid="bulk-scope">
                  <label><input type="radio" name="bulk-scope" [checked]="!facade.allImports()" (change)="facade.setScope(false)" />Solo la carga elegida en el filtro</label>
                  <label><input type="radio" name="bulk-scope" [checked]="facade.allImports()" (change)="facade.setScope(true)" />Todas las cargas</label>
                </div>
              }
              <label class="find">Buscar placa<input class="input" type="search" autocomplete="off" maxlength="20" [value]="facade.query()" data-testid="bulk-search" (input)="facade.setQuery(read($event))" /></label>
              @if (facade.plates().length === 0) {
                <p data-testid="bulk-empty" role="status">{{ facade.loading() ? 'Cargando placas…' : facade.query() ? 'Ninguna placa con viajes sin rendimiento empieza por «' + facade.query() + '».' : 'No hay placas con viajes sin rendimiento.' }}</p>
              } @else {
                <table data-testid="bulk-table" [attr.aria-busy]="facade.loading()">
                  <caption class="sr-only">Placas con viajes sin rendimiento</caption>
                  <thead><tr><th scope="col">Placa</th><th scope="col">Rendimiento</th><th scope="col">Unidad</th></tr></thead>
                  <tbody>
                    @for (plate of facade.plates(); track plate.plate) {
                      <tr data-testid="bulk-row">
                        <td class="plate">{{ plate.plate }}<span class="meta"> · {{ tripsText(plate) }} · {{ plate.fuelLabel }}</span></td>
                        <td><input class="input" type="text" inputmode="decimal" autocomplete="off" [attr.aria-label]="'Rendimiento de ' + plate.plate" [attr.data-testid]="'bulk-value-' + plate.plate" [value]="entry(plate).value" [attr.aria-invalid]="facade.plateErrors()[plate.plate] ? 'true' : null" [attr.aria-describedby]="facade.plateErrors()[plate.plate] ? 'bulk-err-' + plate.plate : null" (input)="facade.setEntry(plate, { value: read($event) })" /></td>
                        <td>
                          @if (plate.efficiencyUnit; as declared) {
                            <span class="declared" [attr.data-testid]="'bulk-declared-' + plate.plate">{{ declared }} (del archivo)</span>
                          } @else {
                            <select class="input" [attr.aria-label]="'Unidad de ' + plate.plate" [attr.data-testid]="'bulk-unit-' + plate.plate" (change)="facade.setEntry(plate, { unit: read($event) })">
                              <option value="" [selected]="!entry(plate).unit">Elegir</option>
                              @for (o of plate.unitOptions; track o.value) { <option [value]="o.value" [selected]="o.value === entry(plate).unit">{{ o.label }}</option> }
                            </select>
                          }
                          @if (facade.plateErrors()[plate.plate]; as e) { <small [id]="'bulk-err-' + plate.plate" data-testid="bulk-plate-error">{{ e }}</small> }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
                <div class="pg" data-testid="bulk-pager">
                  <span>{{ facade.rangeLabel() }}</span>
                  <span class="acts">
                    <button type="button" class="btn btn-secondary" [disabled]="facade.page() === 0 || facade.loading()" data-testid="bulk-prev" (click)="facade.setPage(facade.page() - 1)">Anterior</button>
                    <button type="button" class="btn btn-secondary" [disabled]="!facade.hasNext() || facade.loading()" data-testid="bulk-next" (click)="facade.setPage(facade.page() + 1)">Siguiente</button>
                  </span>
                </div>
              }
              @if (facade.problem(); as p) { <p class="alert alert-danger" role="alert" data-testid="bulk-problem">{{ p }}</p> }
              @if (facade.error(); as e) { <p class="alert alert-danger" role="alert" data-testid="bulk-error">{{ e.message }}</p> }
            </div>
            <div class="ft">
              <span class="count" data-testid="bulk-filled" aria-live="polite">{{ filledText() }}</span>
              <div class="acts">
                <button type="button" class="btn btn-primary" [disabled]="facade.busy() || facade.filled().length === 0" [attr.aria-busy]="facade.busy()" data-testid="bulk-review" (click)="facade.review()">{{ facade.busy() ? 'Revisando…' : 'Revisar' }}</button>
                <button type="button" class="btn btn-secondary" (click)="close()">Cancelar</button>
              </div>
            </div>
          }
          @case ('review') {
            @if (facade.preview(); as pv) {
              <div class="bd">
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
              </div>
              <div class="ft"><div class="acts">
                @if (facade.stale()) {
                  <button type="button" class="btn btn-primary" data-testid="bulk-rereview" (click)="facade.backToValues()">Revisar de nuevo</button>
                } @else {
                  <button type="button" class="btn btn-primary" [disabled]="facade.busy() || pv.totals.affected === 0" [attr.aria-busy]="facade.busy()" data-testid="bulk-apply" (click)="facade.apply()">{{ facade.busy() ? 'Aplicando…' : 'Aplicar a ' + plural(pv.totals.affected, 'viaje', 'viajes') }}</button>
                }
                <button type="button" class="btn btn-secondary" [disabled]="facade.busy()" data-testid="bulk-back" (click)="facade.backToValues()">Volver</button>
              </div></div>
            }
          }
          @default {
            @if (facade.result(); as r) {
              <div class="bd"><div class="sum" data-testid="bulk-result">
                <b>{{ plural(r.applied, 'viaje completado', 'viajes completados') }}</b>
                <span>{{ plural(r.nowCalculated, 'quedó calculado', 'quedaron calculados') }} · {{ plural(r.stillPending, 'sigue pendiente', 'siguen pendientes') }}@if (r.held > 0) { · {{ plural(r.held, 'retenido', 'retenidos') }} }</span>
                @if (r.alreadyCompleted > 0) { <span>{{ plural(r.alreadyCompleted, 'viaje ya estaba completado', 'viajes ya estaban completados') }}: se omitieron.</span> }
                @if (r.skippedIncompatible > 0) { <span>{{ plural(r.skippedIncompatible, 'viaje no se tocó', 'viajes no se tocaron') }} por unidad incompatible o dato ya declarado.</span> }
              </div></div>
              <div class="ft"><div class="acts"><button type="button" class="btn btn-primary" data-testid="bulk-finish" (click)="close()">Listo</button></div></div>
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
  protected readonly filledText = computed(() => {
    const filled = this.facade.filled().length;
    const total = this.facade.total();

    return `${plural(filled, 'placa con valor', 'placas con valor')}${total ? ` de ${countText(total)}` : ''}`;
  });

  constructor() {
    // Al abrir y al cambiar de paso el foco va al título; al cerrar vuelve al botón.
    effect(() => {
      this.facade.step();

      if (this.facade.open()) untracked(() => setTimeout(() => this.title()?.nativeElement.focus()));
    });
  }

  protected entry(plate: CompletionPlate): PlateValue {
    return this.facade.entries().get(plate.plate) ?? { value: '', unit: '', declared: plate.efficiencyUnit };
  }

  protected tripsText(plate: CompletionPlate): string {
    return plural(plate.trips, 'viaje', 'viajes');
  }

  protected read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected toggle(): void {
    if (this.facade.open()) this.close();
    else this.facade.show();
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
