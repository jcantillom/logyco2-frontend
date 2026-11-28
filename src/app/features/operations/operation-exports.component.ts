import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { OrganizationContext } from '../../core/org/organization-context';
import { GRANULARITY_TEXT } from '../../domain/models/granularity';
import { ExportJob } from '../../domain/models/operations';
import { OperationExportsFacade } from './operation-exports.facade';
import { agoText, expiryText, failureText, isActive, sizeText, statusText, statusTone } from './operation-exports.view';

/** Cuántos reportes se ven a la vez en el panel (sin scroll interno); «Ver más» muestra el resto de los recientes. */
export const VISIBLE_EXPORTS = 5;

const ICON = 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6';

/**
 * «Reportes»: botón con insignia junto a «Exportar» y un panel pequeño (no una tarjeta de la página: flota sobre ella y no añade altura) con los reportes Excel recientes de la empresa:
 * estado (con texto, no solo color), barra de avance determinada, quién lo pidió y cuándo, tamaño, «Descargar» y «Cancelar». Los trabajos vienen del servidor, así que recargar no los pierde.
 * Accesible: el panel es un diálogo no modal con foco al abrir y al cerrar, Escape lo cierra y los cambios de estado se anuncian en una región `aria-live` educada.
 */
@Component({
  selector: 'app-operation-exports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'onDocumentClick($event)', '(keydown.escape)': 'close()' },
  styles: [
    `
      :host { position: relative; display: inline-flex; }
      .trigger { position: relative; width: 40px; padding: 0; justify-content: center; }
      .trigger .n { position: absolute; top: -7px; right: -7px; min-width: 20px; padding: 0 6px; border-radius: 999px; background: var(--c-ok-soft); color: var(--c-accent); font-size: 0.72rem; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; }
      .ico { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .panel { position: absolute; z-index: 30; top: calc(100% + 6px); right: 0; box-sizing: border-box; width: min(440px, calc(100vw - 32px)); padding: 10px 12px 12px; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: 0 14px 38px color-mix(in srgb, var(--c-head) 22%, transparent); }
      .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
      .head h2 { margin: 0; font-size: 0.92rem; font-weight: 700; color: var(--c-head); }
      .head h2:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; border-radius: 4px; }
      .x { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 50%; background: var(--c-s3); color: var(--c-text2); cursor: pointer; }
      .x:focus-visible { outline: 3px solid var(--c-focus); }
      .x svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
      ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
      li { display: grid; gap: 4px; padding: 8px 10px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-s3); }
      .line { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; }
      .meta { font-size: 0.76rem; color: var(--c-text2); }
      .chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 999px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
      .chip::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
      .chip.success { background: var(--c-success-bg); color: var(--c-success); }
      .chip.warning { background: var(--c-warning-bg); color: var(--c-warning); }
      .chip.danger { background: var(--c-danger-bg); color: var(--c-danger); }
      .chip.info { background: var(--c-info-bg); color: var(--c-info); }
      .bar { height: 6px; border-radius: 999px; background: color-mix(in srgb, var(--c-head) 14%, var(--c-sf)); overflow: hidden; }
      .bar > span { display: block; height: 100%; border-radius: 999px; background: var(--c-primary); transition: width 0.4s; }
      .acts { display: flex; gap: 6px; }
      .acts .btn { min-height: 30px; padding: 0 10px; font-size: 0.78rem; }
      .err { margin: 0; font-size: 0.78rem; color: var(--c-danger); }
      .empty { margin: 4px 0 0; font-size: 0.84rem; color: var(--c-text2); }
      .more { margin-top: 6px; }
      .alert { margin-top: 6px; }
      @media (max-width: 1100px) { :host { display: flex; flex: 1; } .trigger { flex: 1; } .panel { left: 0; right: auto; } }
    `,
  ],
  template: `
    <button type="button" class="btn btn-secondary trigger" #trigger aria-haspopup="dialog" aria-controls="ops-exports-panel" [attr.aria-expanded]="facade.panelOpen()" title="Reportes" data-testid="exports-button" (click)="toggle()">
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon" /></svg><span class="sr-only">Reportes</span>
      @if (facade.liveCount() > 0) { <span class="n" data-testid="exports-count" [attr.aria-label]="facade.liveCount() + (facade.liveCount() === 1 ? ' reporte activo o listo' : ' reportes activos o listos')">{{ facade.liveCount() }}</span> }
    </button>
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="exports-live">{{ facade.announcement() }}</span>

    @if (facade.panelOpen()) {
      <div class="panel" id="ops-exports-panel" role="dialog" aria-modal="false" aria-labelledby="ops-exports-title" data-testid="exports-panel">
        <div class="head">
          <h2 id="ops-exports-title" tabindex="-1" #title>Reportes recientes</h2>
          <button type="button" class="x" aria-label="Cerrar reportes" data-testid="exports-close" (click)="close()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>

        @if (facade.status() === 'loading' && facade.jobs().length === 0) {
          <p class="empty" data-testid="exports-loading">Cargando reportes…</p>
        } @else if (facade.status() === 'error') {
          <div class="alert alert-danger" role="alert" data-testid="exports-error"><div>{{ facade.error()?.message }}</div><button type="button" class="btn btn-secondary btn-sm" data-testid="exports-retry" (click)="facade.load()">Reintentar</button></div>
        } @else if (facade.jobs().length === 0) {
          <p class="empty" data-testid="exports-empty">Todavía no hay reportes. Si «Exportar» no puede con tantos viajes, se ofrece generarlo en segundo plano y aparecerá aquí.</p>
        } @else {
          <ul data-testid="exports-list" aria-label="Reportes">
            @for (job of visible(); track job.id) {
              <li [attr.data-testid]="'export-' + job.id">
                <div class="line">
                  <span class="chip" [class]="'chip ' + tone(job)" data-testid="export-status">{{ status(job) }}</span>
                  <span class="meta">{{ job.requestedByName || 'Alguien de tu empresa' }} · {{ ago(job) }}@if (size(job)) { · {{ size(job) }} } · Evolución {{ granularityText[job.granularity].adjective }}</span>
                </div>
                @if (job.status === 'RUNNING') {
                  <div class="bar" role="progressbar" aria-label="Avance del reporte" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="job.progress ?? 0" data-testid="export-progress"><span [style.width.%]="job.progress ?? 0"></span></div>
                }
                @if (failure(job)) { <p class="err" data-testid="export-failure">{{ failure(job) }}</p> }
                @if (expiry(job)) { <span class="meta" data-testid="export-expiry">{{ expiry(job) }}</span> }
                @if (job.downloadable || isActive(job)) {
                  <div class="acts">
                    @if (job.downloadable) { <button type="button" class="btn btn-primary" [disabled]="facade.busy().has(job.id)" data-testid="export-download" (click)="facade.download(job.id)">@if (facade.busy().has(job.id)) { Descargando… } @else { Descargar }</button> }
                    @if (isActive(job)) { <button type="button" class="btn btn-secondary" [disabled]="facade.busy().has(job.id)" data-testid="export-cancel" (click)="facade.cancel(job.id)">Cancelar</button> }
                  </div>
                }
              </li>
            }
          </ul>
          @if (facade.jobs().length > visibleCount) {
            <button type="button" class="btn btn-secondary btn-sm more" data-testid="exports-more" [attr.aria-expanded]="showAll()" (click)="showAll.set(!showAll())">{{ showAll() ? 'Ver menos' : 'Ver más (' + (facade.jobs().length - visibleCount) + ')' }}</button>
          }
        }
        @if (facade.actionError(); as failure) { <div class="alert alert-danger" role="alert" data-testid="exports-action-error"><div>{{ failure.message }}</div></div> }
      </div>
    }
  `,
})
export class OperationExportsComponent {
  protected readonly facade = inject(OperationExportsFacade);
  private readonly context = inject(OrganizationContext);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');

  protected readonly icon = ICON;
  protected readonly visibleCount = VISIBLE_EXPORTS;
  protected readonly showAll = signal(false);
  protected readonly visible = computed<readonly ExportJob[]>(() => (this.showAll() ? this.facade.jobs() : this.facade.jobs().slice(0, VISIBLE_EXPORTS)));
  /** «Hace 5 min» se calcula con el reloj del navegador al pintar; cambia cuando llega una consulta nueva. */
  protected readonly isActive = isActive;
  protected readonly tone = (job: ExportJob): string => statusTone(job.status);
  protected readonly status = statusText;
  protected readonly size = (job: ExportJob): string => sizeText(job.sizeBytes);
  protected readonly ago = (job: ExportJob): string => agoText(job.createdAt, Date.now());
  protected readonly expiry = (job: ExportJob): string => expiryText(job, Date.now());
  protected readonly failure = failureText;
  protected readonly granularityText = GRANULARITY_TEXT;

  constructor() {
    // Vigila al entrar y al cambiar de empresa; al salir de la pantalla se detiene la consulta (los trabajos siguen en el servidor).
    effect(() => {
      this.context.activeOrganizationId();
      untracked(() => this.facade.load());
    });
    inject(DestroyRef).onDestroy(() => this.facade.stop());

    // Al abrir el panel (desde el botón o al pedir un reporte) el foco va a su título; al cerrarlo vuelve al botón.
    effect(() => {
      if (this.facade.panelOpen()) untracked(() => setTimeout(() => this.title()?.nativeElement.focus()));
    });
  }

  protected toggle(): void {
    this.facade.togglePanel();
  }

  protected close(): void {
    if (!this.facade.panelOpen()) return;

    this.facade.closePanel();
    this.trigger()?.nativeElement.focus();
  }

  protected onDocumentClick(event: Event): void {
    if (this.facade.panelOpen() && !this.host.nativeElement.contains(event.target as Node)) this.facade.closePanel();
  }
}
