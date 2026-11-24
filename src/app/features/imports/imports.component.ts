import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { reloadOnContextChange } from '../../core/org/organization-context';
import { ImportFilter, ImportSummary, VehiclesDetected } from '../../domain/models/imports';
import { PageHeroComponent } from '../../shared/ui/page-hero.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { relativeTime } from '../notifications/relative-time';
import { ExcelIconComponent } from '../../shared/ui/excel-icon.component';
import { TruckProgressComponent } from '../../shared/ui/truck-progress.component';
import { ImportReviewDialogComponent } from './import-review-dialog.component';
import { DuplicateOriginal, ImportsFacade, UploadEntry } from './imports.facade';
import { VehiclesDetectedDialogComponent } from './vehicles-detected-dialog.component';
import { NotCalculableDialogComponent } from './not-calculable-dialog.component';
import { VehiclesFoundModalComponent } from './vehicles-found-modal.component';
import { STATUS_LABELS, formatCount, longDate, formatSize, hasVehiclesToReview, isRunning, phaseLabel, share, vehiclesSummary } from './imports.labels';
import { StepMeter, liveRow, overallPercent, processedIn, queuedText } from './imports.progress';
import { createSecondTicker } from './imports.ticker';

/** Parámetro de la ruta que abre la revisión de una carga (lo usan los avisos de la campana). */
export const IMPORT_PARAM = 'import';
/** Parámetro de la ruta que activa una pestaña del historial (`/cargas?filter=VEHICLES_PENDING`); un valor inválido se ignora. */
export const FILTER_PARAM = 'filter';
const URL_FILTERS: readonly ImportFilter[] = ['IN_PROGRESS', 'COMPLETED', 'FAILED', 'VEHICLES_PENDING'];

/** Trazos de los íconos (viewBox 24, sin relleno). */
const ICONS = {
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  retry: 'M20 11a8 8 0 1 0-2.3 6.3M20 4v7h-7',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 .01 0',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  truck: 'M2 7h11v9H2zM13 10h4.5l3.5 3.5V16h-8M6.5 18.5a1.8 1.8 0 1 0 .01 0M17.5 18.5a1.8 1.8 0 1 0 .01 0',
} as const;

/** Mensaje cuando la subida se corta sin respuesta (estado 0): el servidor puede cerrar la conexión si el archivo es demasiado grande. */
export const UPLOAD_NETWORK_MESSAGE = 'No se pudo subir el archivo: puede superar el tamaño permitido o se perdió la conexión.';

/** Mensaje cuando un archivo no es un libro de Excel. */
export const NOT_XLSX_MESSAGE = 'El archivo debe ser un libro de Excel con extensión .xlsx.';

/** Pestañas del historial: «Vehículos por revisar» es secundaria y va al final. */
const TABS: readonly { readonly filter: ImportFilter; readonly label: string; readonly count: 'total' | 'inProgress' | 'completed' | 'failed' | 'vehiclesPending' }[] = [
  { filter: 'ALL', label: 'Todas', count: 'total' },
  { filter: 'IN_PROGRESS', label: 'En proceso', count: 'inProgress' },
  { filter: 'COMPLETED', label: 'Listas', count: 'completed' },
  { filter: 'FAILED', label: 'Fallidas', count: 'failed' },
  { filter: 'VEHICLES_PENDING', label: 'Vehículos por revisar', count: 'vehiclesPending' },
];

/** Título y apoyo del estado vacío de cada filtro. */
const EMPTY: Readonly<Record<ImportFilter, { readonly title: string; readonly hint: string }>> = {
  ALL: { title: 'Aún no has cargado archivos.', hint: 'Suelta tus archivos arriba: aquí verás qué tanto se puede calcular de cada uno.' },
  IN_PROGRESS: { title: 'No hay cargas en proceso', hint: 'Cuando subas archivos, aquí verás su avance.' },
  COMPLETED: { title: 'Aún no hay cargas listas', hint: 'Las cargas aparecen aquí cuando termina su revisión.' },
  FAILED: { title: 'No hay cargas fallidas', hint: 'Si alguna falla, la verás aquí con su motivo.' },
  VEHICLES_PENDING: { title: 'No hay cargas con vehículos por revisar', hint: 'Cuando una carga proponga vehículos nuevos o con cambios, aparecerá aquí.' },
};

@Component({
  selector: 'app-imports',
  imports: [DatePipe, PageHeroComponent, PaginationComponent, ResourceStateComponent, TruckProgressComponent, ExcelIconComponent, ImportReviewDialogComponent, VehiclesDetectedDialogComponent, VehiclesFoundModalComponent, NotCalculableDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      svg.i { width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }

      /* Ruta de la carga: tres paradas en una sola fila, según el estado real de la cola. */
      .route { display: flex; align-items: center; gap: 12px; margin: 0; }
      .route ol { display: contents; list-style: none; margin: 0; padding: 0; }
      .route li { display: flex; align-items: center; gap: 10px; flex: 1 1 0; min-width: 0; }
      .route li:last-child { flex: 0 1 auto; }
      .route li:not(:last-child)::after { content: ''; flex: 1; min-width: 16px; height: 3px; margin-left: 6px; border-radius: 999px; background: color-mix(in srgb, var(--c-head) 14%, var(--c-sf)); transition: background 0.4s; }
      .route li.done:not(:last-child)::after { background: var(--c-primary); }
      .route .stop { display: grid; place-items: center; width: 30px; height: 30px; flex: none; border-radius: 50%; background: var(--c-sf); border: 3px solid color-mix(in srgb, var(--c-head) 20%, var(--c-sf)); color: var(--c-mu); font-weight: 800; font-size: 0.85rem; transition: background 0.3s, border-color 0.3s, color 0.3s; }
      .route .stop svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
      .route li.done .stop { background: var(--c-primary); border-color: var(--c-primary); color: var(--c-sf); }
      .route li.current .stop { border-color: var(--c-primary); color: var(--c-primary); box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-primary) 20%, transparent); }
      .route .txt { display: grid; min-width: 0; }
      .route strong { color: var(--c-head); font-size: 0.95rem; white-space: nowrap; }
      .route li.todo strong { color: var(--c-text2); }
      .route small { color: var(--c-mu); font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .work { display: grid; grid-template-columns: minmax(250px, 320px) minmax(0, 1fr); gap: 14px; align-items: stretch; }
      .card { border-radius: 18px; padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
      .card > header { display: flex; align-items: center; justify-content: flex-start; gap: 14px; text-align: left; }
      .card > header h2 { margin: 0; font-size: 1.1rem; line-height: 1.25; color: var(--c-head); }
      .ico { display: grid; place-items: center; width: 38px; height: 38px; flex: none; border-radius: 16px; background: var(--c-sf); color: var(--c-primary); box-shadow: 0 0 0 1px color-mix(in srgb, var(--c-primary) 20%, var(--c-sf)); }
      .ico svg { width: 20px; height: 20px; fill: color-mix(in srgb, currentColor 14%, transparent); stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
      .tpl { background: linear-gradient(165deg, var(--c-ok-soft), var(--c-sf) 65%); border: 1px solid color-mix(in srgb, var(--c-primary) 20%, var(--c-sf)); }
      .card p { margin: 0; color: var(--c-text2); font-size: 0.92rem; line-height: 1.4; }
      .tpl .btn, .drop .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.95rem; padding: 10px 18px; }
      .tpl > .btn { margin-top: auto; }
      .err { margin: 0; color: var(--c-danger); font-size: 0.9rem; }

      .drop { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 2px 16px; min-height: 96px; padding: 14px 20px; border: 2px dashed color-mix(in srgb, var(--c-head) 40%, var(--c-sf)); border-radius: 16px; background: var(--c-s2); cursor: pointer; transition: border-color 0.15s, background 0.15s; }
      .drop:hover { border-color: var(--c-primary); }
      .drop.over { border-color: var(--c-primary); background: var(--c-ok-soft); }
      .drop strong { grid-column: 2; font-size: 1.05rem; color: var(--c-head); align-self: end; }
      .drop span:not(.big) { grid-column: 2; color: var(--c-mu); font-size: 0.9rem; align-self: start; }
      .drop .pick { grid-column: 3; grid-row: 1 / span 2; }
      .drop > div { grid-column: 1 / -1; }
      .drop .big { grid-row: 1 / span 2; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: var(--c-sf); color: var(--c-primary); box-shadow: 0 0 0 1px color-mix(in srgb, var(--c-primary) 20%, var(--c-sf)); transition: transform 0.2s; }
      .drop:hover .big, .drop.over .big { transform: translateY(-3px); }
      .drop .big svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .pick { position: relative; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
      .pick:focus-within { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .notice { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0; padding: 10px 14px; border-radius: 12px; background: var(--c-info-bg); color: var(--c-info); font-size: 0.92rem; font-weight: 600; }
      .notice span { flex: 1 1 200px; }
      .notice .dups { flex: 1 1 100%; display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; font-weight: 500; }
      .notice .dups li { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .sending { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
      .sending h3 { margin: 0; font-size: 0.95rem; color: var(--c-head); }
      .send { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 14px; padding: 10px 14px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-sf); }
      .send .fc { grid-column: 1; }
      .send app-truck-progress { grid-column: 1 / -1; }
      .send .row-actions { grid-column: 2; grid-row: 1; }
      .send .err { grid-column: 1 / -1; }
      .send .wait { grid-column: 2; grid-row: 1; color: var(--c-mu); font-size: 0.85rem; }
      .ibtn { display: inline-grid; place-items: center; width: 34px; height: 34px; padding: 0; border-radius: 10px; cursor: pointer; }
      .ibtn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
      .ibtn:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .ibtn-view { background: var(--c-sf); border: 1px solid color-mix(in srgb, var(--c-primary) 40%, var(--c-sf)); color: var(--c-head); }
      .ibtn-view:hover { background: var(--c-ok-soft); }
      .ibtn-retry { background: var(--c-primary); border: 1px solid var(--c-primary); color: var(--c-sf); }
      .ibtn-retry:hover { background: color-mix(in srgb, var(--c-head) 20%, var(--c-primary)); }
      .row-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
      .tbl .row-actions { flex-wrap: nowrap; justify-content: flex-end; gap: 8px; }
      .linkbtn { all: unset; box-sizing: border-box; cursor: pointer; color: var(--c-text2); text-decoration: underline; text-underline-offset: 3px; font-size: 0.86rem; }
      .linkbtn:hover { color: var(--c-head); }
      .warn-link { color: var(--c-danger); font-weight: 600; }
      .linkbtn:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; border-radius: 4px; }
      .notice .linkbtn { color: inherit; font-weight: 700; }

      .panel { border-radius: 18px; padding: 16px 20px; }
      .panel h2 { margin: 0; font-size: 1.1rem; color: var(--c-head); }
      .phead { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
      .count { padding: 4px 12px; border-radius: 999px; background: var(--c-s2); color: var(--c-text2); font-size: 0.88rem; font-weight: 600; font-variant-numeric: tabular-nums; }
      .tabs { display: flex; gap: 4px; flex-wrap: wrap; overflow: visible; margin-bottom: 10px; border-bottom: 1px solid var(--c-bd); }
      .tab { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: -1px; border-bottom: 3px solid transparent; color: var(--c-text2); font-weight: 600; font-size: 0.95rem; cursor: pointer; }
      .tab:hover { color: var(--c-head); }
      .tab[aria-selected='true'] { color: var(--c-head); border-bottom-color: var(--c-primary); }
      .tab:focus-visible { outline: 3px solid var(--c-focus); outline-offset: -3px; border-radius: 8px; }
      .tab .n { padding: 1px 8px; border-radius: 999px; background: var(--c-s2); color: var(--c-text2); font-size: 0.8rem; font-variant-numeric: tabular-nums; }
      .tab[aria-selected='true'] .n { background: var(--c-ok-soft); color: var(--c-head); }
      .tw { border: 1px solid var(--c-bd); border-radius: 16px; overflow: visible; }
      .tbl { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: 0.95rem; }
      .tbl th { text-align: left; padding: 8px 16px; font-weight: 600; font-size: 0.86rem; color: var(--c-mu); background: transparent; white-space: nowrap; border-bottom: 1px solid var(--c-bd); }
      .tbl td { height: 72px; padding: 8px 16px; border-bottom: 1px solid var(--c-bd); vertical-align: middle; transition: background 0.15s; }
      .tbl tbody tr:last-child td { border-bottom: 0; }
      .tbl tbody tr:hover td { background: var(--c-s2); }
      .tbl th.c-file { width: 23%; }
      .tbl th.c-when { width: 10%; }
      .tbl th.c-state { width: 11%; }
      .tbl th.c-res { width: 36%; }
      .tbl th.c-veh { width: 13%; }
      .tbl th.c-state, .tbl td:nth-child(3) { text-align: center; }
      .tbl th.c-res, .tbl td:nth-child(4) { padding-left: 24px; }
      .tbl th.c-veh, .tbl td:nth-child(5) { padding-left: 16px; }
      .tbl th.c-act { width: 7%; }
      .tbl td.act-col { text-align: right; }
      .fc { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .fname { display: grid; min-width: 0; }
      .fname strong { color: var(--c-head); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tbl small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-mu); font-size: 0.82rem; font-variant-numeric: tabular-nums; }
      .when { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-text2); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
      .pill { display: inline-flex; align-items: center; gap: 8px; height: 28px; padding: 0 12px; border: 1px solid var(--c-bd); border-radius: 999px; background: var(--c-sf); color: var(--c-head); font-size: 0.88rem; font-weight: 600; white-space: nowrap; }
      .pill .dot { width: 9px; height: 9px; flex: none; border-radius: 50%; background: var(--c-mu); }
      .pill[data-s='RUNNING'] .dot { background: var(--c-primary); animation: pulse 1.6s ease-in-out infinite; }
      .pill[data-s='COMPLETED'] .dot { background: var(--c-secondary); }
      .pill[data-s='FAILED'] .dot { background: var(--c-danger); }
      @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.8); } }
      .res { display: grid; gap: 4px; min-width: 0; }
      .rtop { display: flex; align-items: center; gap: 12px; min-width: 0; min-height: 36px; }
      .pct { flex: none; width: 4.4rem; color: var(--c-head); font-size: 1.2rem; font-weight: 800; line-height: 1.1; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .pct.dim { color: var(--c-mu); font-weight: 600; }
      .rtop app-truck-progress, .rtop .bar { flex: 1 1 0; min-width: 40px; max-width: 150px; }
      .bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--c-s2); }
      .bar .ok { background: var(--c-secondary); }
      .bar .warn { background: color-mix(in srgb, var(--c-primary) 60%, var(--c-sf)); }
      .rsub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-mu); font-size: 0.82rem; font-variant-numeric: tabular-nums; }
      .rsub .linkbtn { font-size: inherit; }
      .rt { flex: none; min-width: 9.6rem; color: var(--c-mu); font-size: 0.82rem; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .clock { color: var(--c-head); font-size: 0.9rem; font-weight: 600; line-height: 1.1; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .vlink { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
      .vlink svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .none { color: var(--c-mu); white-space: nowrap; }
      .empty { margin: 0; padding: 0; text-align: center; color: var(--c-head); font-size: 1.05rem; font-weight: 600; }
      .empty-box { display: grid; justify-items: center; gap: 10px; padding: 36px 12px; border: 1px dashed var(--c-bd); border-radius: 16px; background: var(--c-s2); }
      .empty-box small { color: var(--c-mu); font-size: 0.92rem; }
      .empty-box .big { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; background: var(--c-ok-soft); color: var(--c-primary); }
      .empty-box .big svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .foot { margin-top: 8px; }
      .range { margin: 0; color: var(--c-mu); font-size: 0.88rem; }
      @media (prefers-reduced-motion: reduce) { .pill .dot { animation: none; } .route .fill, .route .stop, .drop .big, .tbl td { transition: none; } }
      @media (max-width: 1099px) { .work { grid-template-columns: 1fr; } }
      @media (max-width: 768px) { .route small { display: none; } }
      @media (max-width: 1180px) {
        .tw { border: 0; border-radius: 0; overflow: visible; }
        .tbl thead { display: none; }
        .tbl, .tbl tbody { display: block; }
        .tbl tr { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; padding: 14px; margin-bottom: 10px; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); }
        .tbl td { display: block; padding: 0; border: 0; }
        .tbl td:nth-child(3), .tbl td:nth-child(4), .tbl td:nth-child(5) { padding-left: 0; text-align: left; }
        .tbl { table-layout: auto; }
        .tbl td { height: auto; }
        .tbl tr { grid-template-columns: auto minmax(0, 1fr); column-gap: 16px; }
        .tbl td { grid-column: 1 / -1; }
        .tbl td.when-col { grid-column: 1; }
        .tbl td.stat-col { grid-column: 2; }
        .tbl td.act-col { text-align: left; }
        .row-actions { justify-content: flex-start; }
        .tbl td[data-l]::before { content: attr(data-l) ': '; color: var(--c-mu); }
      }
    `,
  ],
  template: `
    <div class="page">
      <app-page-hero title="Cargar información" subtitle="Sube tus operaciones y calcula tu huella de CO₂." />

      <div class="route" data-testid="route">
        <ol aria-label="Pasos de la carga">
        @for (step of routeSteps; track step.label; let n = $index) {
          <li [class.done]="n < stage()" [class.current]="n === stage()" [class.todo]="n > stage()" [attr.aria-current]="n === stage() ? 'step' : null" data-testid="route-step">
            <span class="stop">@if (n < stage()) { <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.check" /></svg> } @else { {{ n + 1 }} }</span>
            <span class="txt"><strong>{{ step.label }}</strong><small>{{ step.hint }}</small></span>
          </li>
        }
        </ol>
      </div>

      <div class="work">
        <section class="card tpl" aria-labelledby="step-template-title" data-testid="step-template">
          <header>
            <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icons.download" /></svg></span>
            <h2 id="step-template-title">1. Descarga la plantilla</h2>
          </header>
          <p>Incluye instrucciones, listas desplegables y diccionario. El ID del viaje es obligatorio: debe ser estable (el mismo viaje lleva el mismo ID en cada carga) y único por viaje. Llénala y súbela en el paso 2.</p>
          <button type="button" class="btn btn-primary" data-testid="download-template" [disabled]="facade.downloading()" (click)="facade.downloadTemplate()">
            <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.download" /></svg>{{ facade.downloading() ? 'Descargando…' : 'Descargar plantilla (.xlsx)' }}
          </button>
          <div aria-live="polite">@if (facade.downloadError(); as e) { <p class="err" role="alert" data-testid="download-error">{{ e.message }}</p> }</div>
        </section>

        <section class="card" aria-labelledby="step-upload-title" data-testid="step-upload">
          <header>
            <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icons.upload" /></svg></span>
            <h2 id="step-upload-title">2. Sube tus archivos</h2>
          </header>
          <!-- Atajo para el ratón: el teclado y los lectores usan el campo de archivo del botón «Seleccionar archivos». -->
          <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events -->
          <div class="drop" [class.over]="over()" role="group" aria-label="Zona para soltar los archivos" data-testid="dropzone" (dragover)="onDragOver($event)" (dragleave)="over.set(false)" (drop)="onDrop($event)" (click)="onZoneClick($event, picker)">
            <span class="big" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icons.upload" /></svg></span>
            <strong>Arrastra tus archivos Excel aquí</strong>
            <span>o selecciónalos (.xlsx); puedes subir varios a la vez</span>
            <label class="btn btn-secondary pick">
              <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.upload" /></svg>Seleccionar archivos
              <input #picker class="sr-only" type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-testid="file-input" (change)="onPick($event)" />
            </label>
          </div>
          <div aria-live="polite" class="stack" style="gap: 10px">
            @if (localError(); as message) { <p class="err" role="alert" data-testid="upload-error">{{ message }}</p> }
            @if (facade.duplicates() > 0) {
              <div class="notice" role="status" data-testid="duplicate">
                <span>{{ duplicatesText() }}</span>
                @if (facade.duplicateOriginals().length === 1) {
                  <button type="button" class="linkbtn" data-testid="open-original" (click)="openOriginal($event, facade.duplicateOriginals()[0].id)">Ver resultado original</button>
                }
                <button type="button" class="linkbtn" data-testid="dismiss-duplicates" (click)="facade.dismissDuplicates()">Entendido</button>
                @if (facade.duplicateOriginals().length > 1) {
                  <ul class="dups" aria-label="Archivos que ya estaban cargados">
                    @for (original of facade.duplicateOriginals(); track original.id) {
                      <li data-testid="duplicate-original">
                        <span>{{ originalText(original) }}</span>
                        <button type="button" class="linkbtn" data-testid="open-original" [attr.aria-label]="'Ver el resultado original de ' + (original.fileName ?? 'este archivo')" (click)="openOriginal($event, original.id)">Ver resultado original</button>
                      </li>
                    }
                  </ul>
                }
              </div>
            }
          </div>
          @if (facade.uploads().length > 0) {
            <ul class="sending" aria-label="Enviando" data-testid="uploading-list">
              <li><h3>Enviando</h3></li>
              @for (entry of facade.uploads(); track entry.id) {
                <li class="send" data-testid="upload-item">
                  <div class="fc"><app-excel-icon [size]="34" /><span class="fname"><strong [attr.title]="entry.file.name">{{ entry.file.name }}</strong><small>{{ size(entry.file.size) }}</small></span></div>
                  @if (entry.status === 'failed') {
                    <span class="row-actions">
                      <button type="button" class="btn btn-primary btn-sm" data-testid="retry-upload" [attr.aria-label]="'Reintentar el envío de ' + entry.file.name" (click)="facade.retryUpload(entry.id)">Reintentar</button>
                      <button type="button" class="btn btn-secondary btn-sm" data-testid="discard-upload" [attr.aria-label]="'Descartar ' + entry.file.name" (click)="facade.discardUpload(entry.id)">Descartar</button>
                    </span>
                    <p class="err" role="alert" data-testid="upload-item-error">{{ uploadMessage(entry) }}</p>
                  } @else if (entry.status === 'waiting') {
                    <span class="wait" data-testid="upload-waiting">Esperando turno</span>
                  } @else {
                    <app-truck-progress size="sm" [label]="'Enviando ' + entry.file.name" />
                  }
                </li>
              }
            </ul>
          }
        </section>
      </div>

      <section class="card panel" aria-labelledby="history-title" data-testid="history">
        <div class="phead">
          <h2 id="history-title">Cola de cargas</h2>
          @if (facade.list.data(); as total) { @if (total.total > 0) { <span class="count" data-testid="history-count">{{ fmt(total.total) }} {{ total.total === 1 ? 'carga' : 'cargas' }}</span> } }
        </div>

        @if (groupCount(); as count) {
          <p class="notice" role="status" data-testid="batch-notice" style="margin-bottom: 14px">
            <span>{{ count === 1 ? '1 carga terminó' : fmt(count) + ' cargas terminaron' }} con vehículos por revisar</span>
            <button type="button" class="linkbtn" data-testid="see-vehicle-loads" (click)="showVehicleLoads()">Ver cargas</button>
            <button type="button" class="linkbtn" data-testid="dismiss-batch" (click)="facade.dismissBatchResult()">Cerrar</button>
          </p>
        }

        <div class="tabs" role="tablist" aria-label="Filtrar cargas por estado" data-testid="tabs">
          @for (tab of tabs; track tab.filter; let n = $index) {
            <button type="button" role="tab" class="tab" [id]="'tab-' + tab.filter" [attr.data-testid]="'tab-' + tab.filter" [attr.aria-selected]="facade.filter() === tab.filter" [attr.aria-controls]="'queue-panel'" [attr.tabindex]="facade.filter() === tab.filter ? 0 : -1" (click)="selectTab(tab.filter)" (keydown)="onTabKey($event, n)">
              {{ tab.label }}@if (facade.counts.data(); as c) { <span class="n" [attr.aria-label]="fmt(c[tab.count]) + (c[tab.count] === 1 ? ' carga' : ' cargas')">{{ fmt(c[tab.count]) }}</span> }
            </button>
          }
        </div>

        <div id="queue-panel" role="tabpanel" [attr.aria-labelledby]="'tab-' + facade.filter()" tabindex="-1">
          @if (retryError(); as e) { <p class="err" role="alert" data-testid="retry-error" style="margin-bottom: 10px">{{ e.message }}</p> }
          <app-resource-state [status]="facade.list.status()" [error]="facade.list.error()" (retry)="facade.loadList()">
            @if (facade.list.data(); as page) {
              @if (page.items.length === 0) {
                <div class="empty-box">
                  <span class="big" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icons.file" /></svg></span>
                  <p class="empty" data-testid="history-empty">{{ empty[facade.filter()].title }}</p>
                  <small>{{ empty[facade.filter()].hint }}</small>
                </div>
              } @else {
                <div class="tw">
                  <table class="tbl" data-testid="history-table">
                    <caption class="sr-only">Cargas de la empresa</caption>
                    <thead><tr><th scope="col" class="c-file">Archivo</th><th scope="col" class="c-when">Subida</th><th scope="col" class="c-state">Estado</th><th scope="col" class="c-res">Resultado</th><th scope="col" class="c-veh">Vehículos</th><th scope="col" class="c-act"><span class="sr-only">Acciones</span></th></tr></thead>
                    <tbody>
                      @for (i of page.items; track i.id) {
                        <tr data-testid="history-row" [attr.data-status]="i.status">
                          <td class="file">
                            <div class="fc">
                              <app-excel-icon [size]="34" />
                              <span class="fname"><strong [attr.title]="i.fileName">{{ i.fileName }}</strong><small data-testid="file-meta">{{ meta(i) }} · {{ i.createdByName ?? '—' }}</small></span>
                            </div>
                          </td>
                          <td class="when-col" data-l="Subida"><time class="when" data-testid="row-when" [attr.datetime]="i.createdAt" [attr.title]="i.createdAt | date: 'd MMM y · HH:mm'">{{ when(i.createdAt) }}</time></td>
                          <td class="stat-col" data-l="Estado"><span class="pill" data-testid="row-state" [attr.data-s]="i.status"><i class="dot" aria-hidden="true"></i>{{ statusLabels[i.status].text }}</span></td>
                          <td class="result" data-l="Resultado">
                            @if (i.status === 'QUEUED') {
                              <div class="res"><div class="rtop"><span class="pct">En cola</span><div class="bar" aria-hidden="true"></div></div><span class="rsub" data-testid="queued">{{ queued(i) }}</span></div>
                            } @else if (i.status === 'RUNNING') {
                              <div class="res" data-testid="row-progress">
                                @let live = liveOf(i);
                                <div class="rtop"><span class="pct">{{ progress(i) === null ? '…' : progress(i) + ' %' }}</span><app-truck-progress size="sm" [percent]="progress(i)" [label]="'Avance de ' + i.fileName" /><span class="rt" [attr.title]="live.title"><span class="clock" role="timer" data-testid="row-clock" [attr.aria-label]="'Tiempo transcurrido: ' + live.clockSpoken">{{ live.clock }}</span>@if (live.eta) { <span class="eta" data-testid="row-eta">{{ ' · ' + live.eta }}</span> }</span></div>
                                <span class="rsub" data-testid="row-rows" [attr.title]="live.title"><span data-testid="phase">{{ live.left || phase(i.phase) }}</span></span>
                                <span class="sr-only" role="status" data-testid="row-step">{{ live.step }}</span>
                              </div>
                            } @else if (i.status === 'FAILED') {
                              <div class="res"><div class="rtop"><span class="pct dim">—</span></div><span class="rsub" data-testid="row-failed" [attr.title]="i.error ?? null">{{ i.error ?? 'No se pudo revisar el archivo.' }}</span></div>
                            } @else if (i.headline; as h) {
                              <div class="res" data-testid="row-result">
                                <div class="rtop"><span class="pct" data-testid="row-pct">{{ share(calculable(h), h.rowsRead) }} %</span><div class="bar" role="img" [attr.aria-label]="share(calculable(h), h.rowsRead) + ' % de los viajes se pueden calcular'"><span class="ok" [style.flex-grow]="calculable(h)"></span><span class="warn" [style.flex-grow]="h.pending"></span></div>@if (took(i); as t) { <span class="rt" data-testid="row-took">{{ t }}</span> }</div>
                                <span class="rsub">{{ fmt(calculable(h)) }} calculables@if (h.pending > 0) { · <button type="button" class="linkbtn" data-testid="see-missing" [attr.aria-label]="'Ver qué falta en ' + i.fileName" (click)="open($event, i)">{{ fmt(h.pending) }} por completar</button> }@if (unconfirmed(i)) { · <button type="button" class="linkbtn warn-link" data-testid="confirm-keep" [attr.aria-label]="'Confirmar que se conserva ' + i.fileName" (click)="openConfirm($event, i)">Sin confirmar</button> }</span>
                              </div>
                            } @else { <span class="none">—</span> }
                          </td>
                          <td data-l="Vehículos">
                            @if (reviewable(i.vehiclesDetected); as v) {
                              <button type="button" class="linkbtn vlink" data-testid="review-vehicles" [attr.title]="vehiclesText(v)" [attr.aria-label]="'Revisar vehículos de ' + i.fileName" (click)="openVehicles($event, i)"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.truck" /></svg><span data-testid="history-vehicles">{{ fmt(v.new + v.changed) }} por revisar</span></button>
                            } @else {
                              <span class="none">{{ i.vehiclesDetected ? 'Sin novedades' : '—' }}</span>
                            }
                          </td>
                          <td class="act-col">
                            <span class="row-actions">
                              @if (i.status === 'FAILED') { <button type="button" class="ibtn ibtn-retry" data-testid="retry-import" title="Reintentar" [attr.aria-label]="'Reintentar ' + i.fileName" (click)="retry(i.id)"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.retry" /></svg></button> }
                              <button type="button" class="ibtn ibtn-view" data-testid="view-review" title="Ver revisión" [attr.aria-label]="'Ver revisión de ' + i.fileName" (click)="open($event, i)"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.eye" /></svg></button>
                            </span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <div class="foot"><app-pagination [page]="page" (pageChange)="facade.loadList($event)" />@if (page.totalPages <= 1) { <p class="range" data-testid="history-range">Mostrando {{ page.total }} {{ page.total === 1 ? 'carga' : 'cargas' }}</p> }</div>
              }
            }
          </app-resource-state>
        </div>
      </section>
    </div>

    @if (deepLinkError(); as e) {
      <div class="alert alert-danger" role="alert" data-testid="deep-link-error"><strong>{{ e.message }}</strong></div>
    }

    @if (confirmItem(); as item) {
      <app-not-calculable-dialog [summary]="item" (closed)="dismissConfirm(item)" />
    }

    @if (foundItem(); as item) {
      <app-vehicles-found-modal [summary]="item" (closed)="dismissFound()" (review)="reviewFound(item)" />
    }

    @if (selected(); as item) {
      <app-import-review-dialog [summary]="item" (closed)="close()" />
    }

    @if (vehiclesTarget(); as target) {
      <app-vehicles-detected-dialog [importId]="target.id" [fileName]="target.fileName" [counts]="targetCounts()" (closed)="closeVehicles()" />
    }
  `,
})
export class ImportsComponent {
  protected readonly facade = inject(ImportsFacade);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly ticker = createSecondTicker();
  private readonly meter = new StepMeter();
  /** Hora de la pantalla, renovada cada segundo SOLO mientras haya cargas en cola o en proceso. */
  protected readonly now = this.ticker.now;
  private readonly hasActive = computed(() => (this.facade.list.data()?.items ?? []).some((item) => isRunning(item.status)));

  protected readonly icons = ICONS;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly tabs = TABS;
  protected readonly empty = EMPTY;
  protected readonly fmt = formatCount;
  protected readonly size = formatSize;
  protected readonly share = share;
  protected readonly phase = phaseLabel;
  protected readonly vehiclesText = vehiclesSummary;
  /** Parada de la ruta según la cola: 0 sin cargas, 1 hay envíos o cargas en curso (o solo fallidas), 2 hay cargas listas. */
  protected readonly stage = computed<0 | 1 | 2>(() => {
    const counts = this.facade.counts.data();

    if (this.facade.uploads().length > 0 || (counts?.inProgress ?? 0) > 0) return 1;

    if ((counts?.completed ?? 0) > 0) return 2;

    return (counts?.total ?? 0) > 0 ? 1 : 0;
  });
  protected readonly routeSteps = [
    { label: 'Descarga la plantilla', hint: 'Plantilla oficial de Excel' },
    { label: 'Sube tus archivos', hint: 'Se revisan automáticamente' },
    { label: 'Calcula tu huella de CO₂', hint: 'Revisamos qué viajes se pueden calcular' },
  ] as const;
  protected readonly over = signal(false);
  protected readonly localError = signal<string | null>(null);
  protected readonly retryError = signal<AppError | null>(null);
  protected readonly selected = signal<ImportSummary | null>(null);
  /** La carga cuyos vehículos detectados se ven en su propia ventana (independiente de la revisión). */
  protected readonly vehiclesTarget = signal<{ id: string; fileName: string } | null>(null);
  /** Conteos vigentes de esa carga: el detalle renovado tras decidir, o si no la fila del historial. */
  protected readonly targetCounts = computed<VehiclesDetected>(() => {
    const id = this.vehiclesTarget()?.id;
    const sources = [this.facade.detail.data(), ...(this.facade.list.data()?.items ?? [])];

    return sources.find((item) => item?.id === id)?.vehiclesDetected ?? { new: 0, changed: 0, unchanged: 0, pendingDecision: 0 };
  });
  protected readonly deepLinkError = signal<AppError | null>(null);
  /**
   * La única carga subida que propone vehículos: se ofrece registrarlos en un aviso modal, una vez. Solo se abre cuando su fila ya está en
   * la tabla como lista (el usuario ya ve su resultado) y no hay otra ventana abierta que le quite el foco.
   */
  protected readonly foundItem = computed<ImportSummary | null>(() => {
    const result = this.facade.batchResult();

    if (result?.kind !== 'single' || this.selected() || this.vehiclesTarget() || this.confirmItem()) return null;

    return this.facade.list.data()?.items.some((item) => item.id === result.item.id && item.status === 'COMPLETED') ? result.item : null;
  });
  /** Carga manual (desde «Sin confirmar» en su fila) que abre el diálogo sin viajes calculables. */
  private readonly confirmTarget = signal<ImportSummary | null>(null);
  /** La carga sin viajes calculables que espera confirmación: la que se pidió en su fila o la primera del lote subido; solo con ninguna otra ventana abierta. */
  protected readonly confirmItem = computed<ImportSummary | null>(() => {
    if (this.selected() || this.vehiclesTarget()) return null;

    return this.confirmTarget() ?? this.facade.unconfirmed()[0] ?? null;
  });
  /** Cuántas cargas del lote terminaron con vehículos por revisar (aviso agrupado, no modal). */
  protected readonly groupCount = computed(() => {
    const result = this.facade.batchResult();

    return result?.kind === 'group' ? result.count : 0;
  });
  protected readonly duplicatesText = computed(() => {
    const count = this.facade.duplicates();
    const original = this.facade.duplicateOriginals()[0];

    if (count === 1 && original?.fileName) return `Este archivo ya fue procesado${this.processedOn(original.createdAt)}: «${original.fileName}». No se volvió a sumar a tus emisiones.`;

    return count === 1 ? '1 archivo ya estaba cargado' : `${formatCount(count)} archivos ya estaban cargados`;
  });
  protected readonly reviewable = (counts: VehiclesDetected | undefined): VehiclesDetected | null => (hasVehiclesToReview(counts) ? counts : null);
  private readonly deepLinkId = toSignal(this.route.queryParamMap.pipe(map((params) => params.get(IMPORT_PARAM))), { initialValue: null });

  /** Pestaña pedida por la URL, o `null` si no hay o no es válida. */
  private readonly filterParam = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => {
        const value = params.get(FILTER_PARAM) as ImportFilter | null;

        return value !== null && URL_FILTERS.includes(value) ? value : null;
      }),
    ),
    { initialValue: null },
  );

  private opener: HTMLElement | null = null;
  private loaded = false;

  constructor() {
    effect(() => this.ticker.setActive(this.hasActive()));
    effect(() => {
      const items = this.facade.list.data()?.items ?? [];

      untracked(() => this.meter.observe(items, Date.now()));
    });

    // Va antes de la carga inicial: así la primera petición ya lleva el filtro de la URL.
    effect(() => {
      const filter = this.filterParam();

      if (filter === null) return;

      untracked(() => {
        if (this.loaded) this.facade.setFilter(filter);
        else this.facade.filter.set(filter);
      });
    });
    reloadOnContextChange(() => {
      this.loaded = true;
      this.facade.loadList(1);
      this.selected.set(null);
      this.vehiclesTarget.set(null);
      this.localError.set(null);
      this.retryError.set(null);
    });
    // `?import=<id>` (desde un aviso) abre la revisión de esa carga, en la sección de vehículos.
    effect(() => {
      const id = this.deepLinkId();

      if (id) untracked(() => this.openFromLink(id));
    });
  }

  /** «Hace 2 h», «Hace 3 d» o la fecha corta pasada una semana. */
  protected when(iso: string): string {
    const text = relativeTime(iso);

    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /** Avance general (paso 1 y paso 2 con el mismo peso); nunca retrocede entre fases. */
  protected progress(item: ImportSummary): number | null {
    return overallPercent(item.phase, item.rowsProcessed, item.rowsTotal);
  }

  /** Reloj, paso, filas, ritmo y tiempo restante del paso actual de una carga en proceso. */
  protected liveOf(item: ImportSummary) {
    return liveRow(item, this.now(), this.meter);
  }

  protected queued(item: ImportSummary): string {
    return queuedText(item, this.now());
  }

  /** «Procesada en 1 min 50 s» de una carga terminada; `null` si el servidor no trae `started_at`. */
  protected took(item: ImportSummary): string | null {
    return processedIn(item);
  }

  /** «20 KB · 3.400.000 filas»: tamaño del archivo y filas leídas (o el total estimado mientras se revisa). */
  protected meta(item: ImportSummary): string {
    const rows = item.headline?.rowsRead ?? item.rowsTotal;

    return rows === null ? formatSize(item.fileSize) : `${formatSize(item.fileSize)} · ${formatCount(rows)} ${rows === 1 ? 'fila' : 'filas'}`;
  }

  /** Viajes que se pueden calcular: con consumo real o estimado. */
  protected calculable(headline: { realConsumption: number; estimatedConsumption: number }): number {
    return headline.realConsumption + headline.estimatedConsumption;
  }

  /** « · procesado el 22 de noviembre de 2026» de un archivo que ya estaba cargado. */
  protected originalText(original: DuplicateOriginal): string {
    return `«${original.fileName ?? 'Archivo sin nombre'}»${original.createdAt ? ` · procesado${this.processedOn(original.createdAt)}` : ''}`;
  }

  /** Consulta el resultado de la carga original (la revisión) sin volver a subir el archivo. */
  protected openOriginal(event: Event, id: string): void {
    const opener = event.currentTarget as HTMLElement;

    this.deepLinkError.set(null);
    this.facade.fetch(id).subscribe({
      next: (detail) => {
        this.opener = opener;
        this.selected.set(detail);
      },
      error: (e: unknown) => this.deepLinkError.set(toAppError(e)),
    });
  }

  protected uploadMessage(entry: UploadEntry): string {
    return entry.error?.kind === 'network' ? UPLOAD_NETWORK_MESSAGE : (entry.error?.message ?? '');
  }

  /** Toda la zona abre el selector de archivos, salvo el botón (que ya lo abre por su cuenta). */
  protected onZoneClick(event: MouseEvent, picker: HTMLInputElement): void {
    if ((event.target as HTMLElement).closest('.pick')) return;

    picker.click();
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.over.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.over.set(false);
    this.upload(Array.from(event.dataTransfer?.files ?? []));
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    input.value = '';
    this.upload(files);
  }

  /** Flechas, Inicio y Fin cambian de pestaña (el foco la sigue). */
  protected onTabKey(event: KeyboardEvent, index: number): void {
    const last = TABS.length - 1;
    const target = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];

    if (target === undefined) return;

    event.preventDefault();
    const tabs = Array.from((event.currentTarget as HTMLElement).parentElement!.querySelectorAll<HTMLElement>('[role="tab"]'));

    this.selectTab(TABS[target].filter);
    tabs[target].focus();
  }

  /** Cambia la pestaña; si la URL traía `?filter=`, se mantiene al día y «Todas» la limpia. */
  protected selectTab(filter: ImportFilter): void {
    this.facade.setFilter(filter);

    if (this.filterParam() !== null && this.filterParam() !== (filter === 'ALL' ? null : filter)) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { [FILTER_PARAM]: filter === 'ALL' ? null : filter }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  protected showVehicleLoads(): void {
    this.facade.setFilter('VEHICLES_PENDING');
    this.facade.dismissBatchResult();
  }

  protected retry(id: string): void {
    this.retryError.set(null);
    this.facade.retry(id).subscribe({ error: (e: unknown) => this.retryError.set(toAppError(e)) });
  }

  protected unconfirmed(item: ImportSummary): boolean {
    return item.status === 'COMPLETED' && !!item.notCalculable && !item.notCalculable.acknowledgedAt;
  }

  protected openConfirm(event: Event, item: ImportSummary): void {
    this.opener = event.currentTarget as HTMLElement;
    this.confirmTarget.set(item);
  }

  /** «Cancelar» o confirmar: se cierra el diálogo; la carga sin confirmar sigue marcada en su fila. */
  protected dismissConfirm(item: ImportSummary): void {
    this.confirmTarget.set(null);
    this.facade.dismissUnconfirmed(item.id);
  }

  protected dismissFound(): void {
    this.facade.dismissBatchResult();
  }

  /** Desde el aviso, «revisar uno por uno» abre la ventana de vehículos de la carga. */
  protected reviewFound(item: ImportSummary): void {
    this.dismissFound();
    this.opener = null;
    this.vehiclesTarget.set({ id: item.id, fileName: item.fileName });
  }

  protected open(event: Event, item: ImportSummary): void {
    this.opener = event.currentTarget as HTMLElement;
    this.selected.set(item);
  }

  protected openVehicles(event: Event, item: ImportSummary): void {
    this.opener = event.currentTarget as HTMLElement;
    this.vehiclesTarget.set({ id: item.id, fileName: item.fileName });
  }

  /** Al cerrar se limpia `?import=`: recargar o volver atrás no reabre la ventana. */
  protected close(): void {
    this.selected.set(null);
    this.leave();
  }

  protected closeVehicles(): void {
    this.vehiclesTarget.set(null);
    this.leave();
  }

  private processedOn(iso: string | null): string {
    const date = longDate(iso);

    return date ? ` el ${date}` : '';
  }

  private leave(): void {
    if (this.deepLinkId()) void this.router.navigate([], { relativeTo: this.route, queryParams: { [IMPORT_PARAM]: null }, queryParamsHandling: 'merge', replaceUrl: true });

    queueMicrotask(() => this.opener?.isConnected && this.opener.focus());
  }

  private openFromLink(id: string): void {
    this.deepLinkError.set(null);
    this.opener = null;
    this.facade.fetch(id).subscribe({
      // Un aviso de vehículos abre su ventana; si la carga ya no propone nada, la revisión.
      next: (detail) => (hasVehiclesToReview(detail.vehiclesDetected) ? this.vehiclesTarget.set({ id: detail.id, fileName: detail.fileName }) : this.selected.set(detail)),
      error: (e: unknown) => {
        this.deepLinkError.set(toAppError(e));
        void this.router.navigate([], { relativeTo: this.route, queryParams: { [IMPORT_PARAM]: null }, queryParamsHandling: 'merge', replaceUrl: true });
      },
    });
  }

  /** Solo los `.xlsx` entran a la cola; los demás se rechazan uno a uno, sin frenar al resto. */
  private upload(files: readonly File[]): void {
    const accepted = files.filter((file) => /\.xlsx$/i.test(file.name));
    const rejected = files.length - accepted.length;

    this.localError.set(rejected === 0 ? null : rejected === 1 ? NOT_XLSX_MESSAGE : `${formatCount(rejected)} archivos no se cargaron: deben ser libros de Excel con extensión .xlsx.`);
    this.facade.enqueue(accepted);
  }
}
