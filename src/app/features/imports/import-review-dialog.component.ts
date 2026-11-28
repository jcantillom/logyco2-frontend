import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { CalculableWithEstimation, ImportColumn, ImportReview, ImportRoutes, ImportSummary, ReviewIssue } from '../../domain/models/imports';
import { monthLabel, periodKind, periodRangeLabel } from '../../domain/models/period';
import { COVERAGE_CAVEAT, FOOTPRINT_UNIT, coverageHint, coverageLine, formatKgCo2, formatPct, measuredEstimatedHint, measuredEstimatedLine, noEmissionsReason, possibleDuplicatesLine } from '../../shared/ui/footprint.format';
import { CloseOnBackdropDirective } from '../../shared/ui/close-on-backdrop.directive';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { ExcelIconComponent } from '../../shared/ui/excel-icon.component';
import { TruckProgressComponent } from '../../shared/ui/truck-progress.component';
import { ImportCargoUnitComponent } from './import-cargo-unit.component';
import { ImportEfficiencyCoverageComponent } from './import-efficiency-coverage.component';
import { ImportPlacesComponent } from './import-places.component';
import { ImportsFacade } from './imports.facade';
import { DIVIPOLA_URL, FORMAT_LABELS, MAX_EXAMPLES, OSM_COPYRIGHT_URL, exampleText, routesCount, REQUIREMENT_LABELS, SEVERITY_LABELS, formatCount, formatSize, isRunning, pendingAction, phaseLabel, sampleRowsShort, share, tripsCount } from './imports.labels';
import { overallPercent, processedIn, stepText } from './imports.progress';

/** Trazos de los íconos (viewBox 24, sin relleno). */
const ICONS = {
  real: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M7 8h6M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3',
  estimated: 'M4 20V4M4 20h16M8 15l3-4 3 2 5-6',
  pending: 'M12 4l9 16H3zM12 10v4M12 17.5v.01',
  close: 'M6 6l12 12M18 6L6 18',
} as const;

/** Un renglón de «Qué hacer»: un motivo pendiente o un hallazgo con acción, con sus ejemplos. */
interface TodoItem {
  readonly code: string;
  readonly label: string;
  readonly rows: number;
  readonly sampleRows: readonly number[];
  readonly examples: readonly string[];
}

/** Cuántos meses con su huella se ven de entrada; el resto va en «+N más» (con su detalle en el tooltip y el texto accesible). */
const VISIBLE_MONTHS = 6;

/** Cuántos motivos pendientes se ven de entrada; el resto va plegado. */
const VISIBLE_REASONS = 2;

/** Las columnas que el usuario debe traer para que los viajes se puedan calcular. */
const NEEDED_REQUIREMENTS: ReadonlySet<string> = new Set(['REQUIRED', 'CONDITIONAL']);

/** Orden de los avisos: los errores primero. */
const SEVERITY_ORDER: Readonly<Record<string, number>> = { ERROR: 0, WARNING: 1, INFO: 2 };

/** Informe de una carga: qué tan lista está (veredicto), el desglose, qué hacer y, plegados, los avisos y las columnas. */
@Component({
  selector: 'app-import-review-dialog',
  imports: [DatePipe, NgTemplateOutlet, RouterLink, ImportCargoUnitComponent, ImportEfficiencyCoverageComponent, ImportPlacesComponent, CloseOnBackdropDirective, StatusBadgeComponent, TruckProgressComponent, ExcelIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: contents; }
      dialog.review { width: min(800px, calc(100vw - var(--dlg-left, 0px) - 24px)); max-height: calc(100dvh - 24px); border-radius: 18px; overflow: hidden; }
      dialog.review[open] { display: flex; flex-direction: column; }
      .head { display: flex; align-items: center; gap: 12px; padding: 14px 18px 14px 22px; border-bottom: 1px solid var(--c-bd); background: radial-gradient(120% 140% at 0 0, var(--c-ok-soft), var(--c-sf) 70%); }
      .head .grow { flex: 1 1 auto; min-width: 0; }
      .head h2 { margin: 0; font-size: 1rem; color: var(--c-head); overflow-wrap: anywhere; }
      .head small { color: var(--c-text2); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
      .x { display: grid; place-items: center; width: 36px; height: 36px; flex: none; padding: 0; border: 1px solid color-mix(in srgb, var(--c-primary) 40%, var(--c-sf)); border-radius: 50%; background: var(--c-sf); color: var(--c-head); cursor: pointer; }
      .x:hover { background: var(--c-ok-soft); }
      .x:focus-visible, summary:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .x svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 22px 12px; display: flex; flex-direction: column; gap: 8px; font-size: 0.95rem; }
      h3 { margin: 0 0 6px; font-size: 0.9rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-accent); }
      .verdict h3 { margin: 0; font-size: 1.6rem; line-height: 1.2; letter-spacing: 0; text-transform: none; color: var(--c-head); font-weight: 800; }
      .verdict .bar { display: flex; height: 10px; margin: 10px 0 6px; border-radius: 999px; overflow: hidden; background: var(--c-s2); }
      .verdict .ok { background: var(--c-secondary); }
      .verdict .warn { background: color-mix(in srgb, var(--c-primary) 60%, var(--c-sf)); }
      .verdict p.period { margin-top: 8px; font-size: 0.86rem; color: var(--c-mu); }
      .verdict p { margin: 0; color: var(--c-text2); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
      .split { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--c-bd); border-radius: 12px; overflow: hidden; }
      .split li { display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: center; gap: 0 8px; padding: 6px 12px; border-left: 1px solid var(--c-bd); }
      .split li:first-child { border-left: 0; }
      .split li span { grid-column: 1 / -1; font-size: 0.86rem; line-height: 1.25; }
      .split svg { width: 22px; height: 22px; fill: none; stroke: var(--c-primary); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
      .split b { font-size: 1.25rem; color: var(--c-head); font-variant-numeric: tabular-nums; }
      .split span { min-width: 0; color: var(--c-text2); }
      .split strong { color: var(--c-head); }
      ol.todo { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
      ol.todo li { padding: 6px 12px; border: 1px solid var(--c-bd); border-left: 4px solid color-mix(in srgb, var(--c-primary) 60%, var(--c-sf)); border-radius: 10px; background: var(--c-sf); }
      .todo .top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; color: var(--c-text); }
      .todo .top strong { color: var(--c-head); font-variant-numeric: tabular-nums; }
      .todo .top small { margin-left: auto; color: var(--c-mu); font-size: 0.9rem; }
      .todo .do { margin: 2px 0 0; color: var(--c-text2); }
      .todo .do b { color: var(--c-head); }
      details { border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-sf); }
      details.more { border: 0; background: none; }
      details.more[open] > summary { margin-bottom: 8px; }
      summary { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 4px 14px; cursor: pointer; list-style: none; color: var(--c-head); font-weight: 700; border-radius: 12px; }
      details.more > summary { padding: 4px 2px; min-height: 32px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
      summary::-webkit-details-marker { display: none; }
      summary::before { content: ''; width: 8px; height: 8px; flex: none; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); }
      details[open] > summary::before { transform: rotate(45deg); }
      .fold { padding: 0 14px 12px; display: flex; flex-direction: column; gap: 8px; }
      .sum { color: var(--c-text2); font-weight: 500; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 8px; margin: 0; list-style: none; }
      .chips li { padding: 2px 10px; border-radius: 999px; background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); color: var(--c-head); font-size: 0.9rem; font-weight: 600; }
      .tw { border: 1px solid var(--c-bd); border-radius: 12px; overflow-x: auto; }
      .tbl { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.9rem; }
      .tbl th { text-align: left; padding: 9px 12px; font-weight: 600; color: var(--c-text2); background: var(--c-s2); white-space: nowrap; border-bottom: 1px solid var(--c-bd); }
      .tbl td { padding: 8px 12px; border-bottom: 1px solid var(--c-bd); vertical-align: middle; }
      .tbl tbody tr:last-child td { border-bottom: 0; }
      .tbl small { display: block; color: var(--c-mu); font-size: 0.9rem; }
      .tbl .no { color: var(--c-mu); }
      ul.items { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
      ul.items li { display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); }
      ul.items .txt { flex: 1 1 auto; min-width: 0; color: var(--c-text); }
      ul.items .txt small { display: block; margin-top: 2px; color: var(--c-mu); font-size: 0.9rem; }
      .muted { margin: 0; color: var(--c-mu); font-size: 0.9rem; }
      .verdict p.period.small { margin-top: 2px; font-size: 0.8rem; }
      .todo .ex { margin: 4px 0 0; padding: 0; list-style: none; display: grid; gap: 2px; font-size: 0.82rem; color: var(--c-mu); }
      ol.todo .ex li { padding: 0; border: 0; border-radius: 0; background: none; }
      .fp { display: flex; flex-direction: column; gap: 2px; padding: 6px 14px; border: 1px solid color-mix(in srgb, var(--c-secondary) 40%, var(--c-sf)); border-radius: 12px; background: linear-gradient(160deg, color-mix(in srgb, var(--c-secondary) 14%, var(--c-sf)), var(--c-sf) 70%); }
      .fp .top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
      .fp h3 { margin: 0 4px 0 0; font-size: 0.74rem; align-self: center; }
      .fp .top .meas { margin: 0 0 0 auto; color: var(--c-text2); font-size: 0.82rem; font-variant-numeric: tabular-nums; }
      .fp .big { font-size: 1.45rem; font-weight: 800; line-height: 1.1; color: var(--c-head); font-variant-numeric: tabular-nums; }
      .fp .big.none { color: var(--c-mute2); }
      .fp .unit { font-weight: 700; color: var(--c-text2); }
      .fp .tag { padding: 0 8px; border-radius: 999px; background: var(--c-sf); box-shadow: inset 0 0 0 1px var(--c-primary); color: var(--c-head); font-size: 0.74rem; font-weight: 800; }
      .fp .line { margin: 0; color: var(--c-text2); font-size: 0.86rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
      .fp .line b { color: var(--c-head); }
      .fp .dup { margin: 0; font-size: 0.86rem; color: var(--c-text2); }
      .fp .dup a { color: var(--c-accent); font-weight: 700; text-underline-offset: 2px; }
      .fp .dup a:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; border-radius: 4px; }
      .fp .small { margin: 0; color: var(--c-mu); font-size: 0.78rem; }
      .fp .months { display: flex; flex-wrap: wrap; gap: 4px 6px; margin: 0; padding: 0; list-style: none; }
      .fp .months li { padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--c-secondary) 14%, var(--c-sf)); color: var(--c-head); font-size: 0.8rem; font-weight: 600; font-variant-numeric: tabular-nums; }
      .attrib { margin: 0; font-size: 0.78rem; color: var(--c-mu); }
      .attrib a { color: var(--c-accent); text-underline-offset: 2px; }
      .attrib a:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; border-radius: 4px; }
      .foot { display: flex; flex-wrap: wrap; gap: 2px 14px; margin: 0; color: var(--c-mu); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
      .est { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); }
      .est p { margin: 0; font-size: 0.9rem; color: var(--c-text); }
      .est p.small { font-size: 0.82rem; color: var(--c-mu); }
      .note { margin: 0; color: var(--c-text2); font-size: 0.9rem; }
      .prog { display: flex; flex-direction: column; gap: 6px; }
      .msg { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
      .msg h3 { margin: 0; font-size: 1.4rem; line-height: 1.2; letter-spacing: 0; text-transform: none; color: var(--c-head); }
      .msg p { margin: 0; color: var(--c-text); }
      @media (max-width: 768px) {
        .tbl thead { display: none; }
        .tbl, .tbl tbody { display: block; }
        .tbl tr { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; padding: 10px 12px; border-bottom: 1px solid var(--c-bd); }
        .tbl td { display: block; padding: 0; border: 0; }
        .tbl td[data-l]::before { content: attr(data-l) ': '; color: var(--c-mu); }
      }
      @media (max-width: 520px) {
        .body { padding: 14px 16px 16px; }
        .verdict h3 { font-size: 1.35rem; }
        .split { grid-template-columns: minmax(0, 1fr); }
        .split li { border-left: 0; border-top: 1px solid var(--c-bd); }
        .split li:first-child { border-top: 0; }
      }
    `,
  ],
  template: `
    <dialog #dialog appCloseOnBackdrop class="dialog review" aria-labelledby="review-title" (close)="closed.emit()" data-testid="import-review">
      <div class="head">
        <app-excel-icon [size]="40" />
        <div class="grow">
          <h2 id="review-title">{{ summary().fileName }}</h2>
          <small data-testid="review-meta">{{ size(summary().fileSize) }} · {{ summary().createdAt | date: 'd MMM y, HH:mm' }}@if (took(); as t) { · <span data-testid="review-took">{{ t }}</span> }</small>
        </div>
        @if (format(); as f) { <app-status-badge [label]="formatLabels[f]" data-testid="review-format" /> }
        <button type="button" class="x" data-testid="close-review" aria-label="Cerrar" (click)="dialog.close()"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.close" /></svg></button>
      </div>

      <div class="body" aria-live="polite">
        @if (facade.detail.status() === 'error') {
          <div class="alert alert-danger" role="alert">
            <div class="stack" style="gap: 4px; flex: 1"><strong>{{ facade.detail.error()?.message }}</strong></div>
            <button type="button" class="btn btn-secondary btn-sm" data-testid="reload-review" (click)="facade.openDetail(summary().id)">Reintentar</button>
          </div>
        } @else if (detail(); as d) {
          @if (running()) {
            <div class="prog" data-testid="review-progress">
              <h3>Estamos revisando tu archivo</h3>
              <app-truck-progress [percent]="percentDone()" label="Avance de la revisión" />
              <p class="muted">{{ step(d.phase) ?? phase(d.phase) }}@if (d.rowsProcessed > 0) { · {{ count(d.rowsProcessed) }}@if (d.rowsTotal !== null) { de {{ count(d.rowsTotal) }} } filas }</p>
            </div>
          } @else if (d.status === 'FAILED') {
            <div class="msg" role="alert" data-testid="review-failed">
              <h3>La revisión falló</h3>
              <p>{{ d.error ?? 'No se pudo revisar el archivo.' }}</p>
              <p><strong>Qué hacer:</strong> intenta la revisión otra vez.</p>
              @if (retryError(); as e) { <p class="muted" data-testid="retry-error">{{ e.message }}</p> }
              <button type="button" class="btn btn-primary btn-sm" data-testid="retry-import" (click)="retry(d.id)">Reintentar</button>
            </div>
          } @else if (d.review; as r) {
            @if (r.format === 'UNRECOGNIZED') {
              <section class="msg" aria-labelledby="unrec-title" data-testid="unrecognized">
                <h3 id="unrec-title">No reconocimos el formato</h3>
                <p>{{ d.error ?? 'Los encabezados del archivo no coinciden con la plantilla ni con el formato CARITRANS.' }}</p>
                <p><strong>Qué hacer:</strong> usa la plantilla oficial y copia tus datos en ella.</p>
                <button type="button" class="btn btn-primary btn-sm" data-testid="download-template" [disabled]="facade.downloading()" (click)="facade.downloadTemplate()">{{ facade.downloading() ? 'Descargando…' : 'Descargar plantilla' }}</button>
                @if (facade.downloadError(); as e) { <p class="muted" role="alert" data-testid="download-error">{{ e.message }}</p> }
              </section>
            } @else {
              <section class="verdict" aria-labelledby="verdict-title" data-testid="review-verdict">
                <h3 id="verdict-title" data-testid="verdict-title">{{ verdictTitle() }}</h3>
                @if (r.rowsRead > 0) {
                  <div class="bar" role="img" [attr.aria-label]="verdictTitle()" data-testid="verdict-bar"><span class="ok" [style.width.%]="calcPct()"></span><span class="warn" [style.width.%]="100 - calcPct()"></span></div>
                  <p data-testid="verdict-support">{{ count(calculable()) }} de {{ trips(r.rowsRead) }} tienen los datos necesarios.</p>
                }
                @if (periodLine(r); as line) { <p class="period" data-testid="review-period">{{ line }}</p> }
                @if (r.routes; as routes) {
                  <p class="period" data-testid="review-routes">Distancias por ruta: {{ routesCount(routes.pairsResolved) }} (aproximadas)</p>
                  <p class="period small" data-testid="review-routes-rows">{{ routesRows(routes) }}</p>
                  @if (routes.rowsByUniqueName > 0) { <p class="period small" data-testid="review-routes-unique">{{ tripsCount(routes.rowsByUniqueName) }} {{ routes.rowsByUniqueName === 1 ? 'se reconoció' : 'se reconocieron' }} por el nombre único del municipio</p> }
                }
              </section>

              @if (d.calculableWithEstimation; as c) {
                <section class="note est" aria-labelledby="cwe-title" data-testid="calculable-with-estimation">
                  <h3 id="cwe-title">Se puede calcular estimando el rendimiento</h3>
                  <p data-testid="cwe-text">{{ estimationText(c) }}</p>
                  @if (c.requiresConsent) { <p class="small" data-testid="cwe-consent">Confirma la estimación en «Rendimiento de los vehículos», más abajo.</p> }
                  @else if (c.mode === 'AUTO') { <p class="small" data-testid="cwe-auto">Tu empresa estima el rendimiento automáticamente al importar.</p> }
                </section>
              }

              <app-import-cargo-unit [importId]="d.id" [review]="r" />

              @if (r.placeResolution; as places) { <app-import-places [importId]="d.id" [resolution]="places" /> }

              @if (footprint(); as f) {
                <section class="fp" aria-labelledby="fp-title" data-testid="review-footprint">
                  @if (f.hasEmissions) {
                    <div class="top">
                      <h3 id="fp-title">Huella de esta carga</h3>
                      <b class="big" data-testid="footprint-total">{{ f.value }}</b><span class="unit">{{ f.unit }}</span>
                      @if (f.partial) { <span class="tag" data-testid="footprint-partial" [attr.title]="f.hint">Parcial</span> }
                      <span class="meas" data-testid="footprint-method" [attr.title]="f.measuredHint">{{ f.measured }}<span class="sr-only">. {{ f.measuredHint }}</span></span>
                    </div>
                  } @else {
                    <div class="top"><h3 id="fp-title">Huella de esta carga</h3><b class="big none" data-testid="footprint-total">—</b></div>
                    <p class="line" data-testid="footprint-empty">{{ f.emptyText }}</p>
                  }
                  <p class="line" data-testid="footprint-trips"><b>{{ count(f.trips.calculated) }}</b> calculados · <b>{{ count(f.trips.pending) }}</b> pendientes · <b>{{ count(f.trips.blocked) }}</b> bloqueados · <b>{{ count(f.trips.duplicate) }}</b> {{ f.trips.duplicate === 1 ? 'duplicado' : 'duplicados' }}</p>
                  @if (f.duplicatesLine; as line) {
                    <p class="dup" data-testid="footprint-possible-duplicates">{{ line }}. <a routerLink="/calidad" [queryParams]="{ import_file_id: summary().id }" data-testid="review-duplicates-link">Revisar posibles duplicados</a></p>
                  }
                  @if (f.hasEmissions) {
                    @if (f.months.length > 0) {
                      <ul class="months" aria-label="Huella por mes" data-testid="footprint-months">
                        @for (m of f.months; track m.label) { <li>{{ m.label }}: {{ m.kg }} kg</li> }
                        @if (f.hiddenMonths; as more) { <li data-testid="footprint-more-months" [attr.title]="f.hiddenText">+{{ more }} más<span class="sr-only">: {{ f.hiddenText }}</span></li> }
                      </ul>
                    }
                  }
                  @if (f.coverage) { <p class="small" data-testid="footprint-coverage" [attr.title]="f.hint">{{ f.coverage }} · {{ shortCaveat }}<span class="sr-only">. {{ caveat }}</span></p> }
                </section>
              } @else {
                <p class="note" data-testid="review-no-footprint">Esta carga todavía no tiene su huella calculada, por eso no mostramos cifras de CO₂.</p>
              }

              <ul class="split" aria-label="Desglose de los viajes" data-testid="review-breakdown">
                <li data-testid="breakdown-real"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.real" /></svg><b>{{ count(r.methods.realConsumption) }}</b><span><strong>Con consumo real.</strong> Usamos el combustible que reportaste</span></li>
                <li data-testid="breakdown-estimated"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.estimated" /></svg><b>{{ count(r.methods.estimatedConsumption) }}</b><span><strong>Con consumo estimado.</strong> Calculado con distancia y rendimiento</span></li>
                <li data-testid="breakdown-pending"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.pending" /></svg><b>{{ count(r.methods.pending) }}</b><span><strong>Por completar datos.</strong> Les falta algún dato</span></li>
              </ul>

              @if (r.efficiencyCoverage; as coverage) { <app-import-efficiency-coverage [importId]="d.id" [coverage]="coverage" /> }

              @if (reasons().length > 0) {
                <section aria-labelledby="todo-title" data-testid="review-todo">
                  <h3 id="todo-title">Qué hacer</h3>
                  <ol class="todo" data-testid="reasons">
                    @for (p of visibleReasons(); track p.code) { <ng-container [ngTemplateOutlet]="reason" [ngTemplateOutletContext]="{ $implicit: p }" /> }
                  </ol>
                  @if (hiddenReasons().length > 0) {
                    <details class="more" data-testid="more-reasons">
                      <summary>{{ hiddenReasons().length === 1 ? 'Ver el motivo restante' : 'Ver los ' + hiddenReasons().length + ' motivos restantes' }}</summary>
                      <ol class="todo" data-testid="more-reasons-list">
                        @for (p of hiddenReasons(); track p.code) { <ng-container [ngTemplateOutlet]="reason" [ngTemplateOutletContext]="{ $implicit: p }" /> }
                      </ol>
                    </details>
                  }
                </section>
              }

              @if (sortedIssues().length > 0) {
                <details data-testid="review-issues">
                  <summary>Avisos del archivo ({{ sortedIssues().length }})</summary>
                  <div class="fold">
                    <ul class="items" data-testid="issues">
                      @for (i of sortedIssues(); track $index) {
                        <li>
                          <app-status-badge [label]="severityLabels[i.severity]" />
                          <span class="txt">{{ i.message }}@if (i.sampleRows.length > 0) { <small>{{ samples(i.sampleRows) }}</small> }</span>
                          <strong>{{ trips(i.rows) }}</strong>
                        </li>
                      }
                    </ul>
                  </div>
                </details>
              }

              <details data-testid="review-columns">
                <summary>Columnas del archivo <span class="sum" data-testid="columns-summary">· {{ columnsSummary(r) }}</span></summary>
                <div class="fold">
                  <div class="tw">
                    <table class="tbl" data-testid="columns">
                      <caption class="sr-only">Columnas del archivo</caption>
                      <thead><tr><th scope="col">Columna</th><th scope="col">Tipo</th><th scope="col">En tu archivo</th><th scope="col">Diligenciado</th></tr></thead>
                      <tbody>
                        @for (c of r.columns; track c.field) {
                          <tr>
                            <td>{{ c.label }}@if (c.found && c.sourceHeader && c.sourceHeader !== c.label) { <small>Encabezado: {{ c.sourceHeader }}</small> }</td>
                            <td data-l="Tipo"><app-status-badge [label]="requirementLabels[c.requirement]" /></td>
                            <td data-l="En tu archivo"><span [class.no]="!c.found">{{ c.found ? 'Encontrada' : 'No encontrada' }}</span></td>
                            <td data-l="Diligenciado">{{ c.found ? filled(c.filledRows, r.rowsRead) + ' %' : '—' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
              @if (missingColumns(r).length > 0) {
                <ul class="chips" aria-label="Columnas que faltan" data-testid="missing-columns">
                  @for (c of missingColumns(r); track c.field) { <li>Falta: {{ c.label }}</li> }
                </ul>
              }

              @if (r.routes) {
                <p class="attrib" data-testid="review-attribution">Distancias por carretera © colaboradores de <a [href]="osmUrl" target="_blank" rel="noopener noreferrer">OpenStreetMap (ODbL)</a> · Municipios: <a [href]="divipolaUrl" target="_blank" rel="noopener noreferrer">DANE, DIVIPOLA (CC BY-SA 4.0)</a></p>
              }
              <p class="foot" data-testid="counters"><span>{{ plates(r.vehicles.distinctPlates) }}</span><span>·</span><span>{{ trips(r.trips.distinctTripIds) }}</span></p>
            }
          } @else {
            <p class="muted">Esta carga no tiene una revisión disponible.</p>
          }
        } @else {
          <div class="stack" role="status" aria-busy="true"><span class="sr-only">Cargando…</span><span class="skeleton" style="height: 70px"></span><span class="skeleton" style="height: 120px"></span></div>
        }
      </div>
    </dialog>

    <ng-template #reason let-p>
      <li>
        <div class="top"><strong>{{ trips(p.rows) }}</strong><span>{{ p.label }}</span>@if (p.sampleRows.length > 0) { <small>{{ samples(p.sampleRows) }}</small> }</div>
        @if (action(p.code); as a) { <p class="do"><b>Qué hacer:</b> {{ a }}</p> }
        @if (p.examples.length > 0) { <ul class="ex" data-testid="todo-examples">@for (e of p.examples; track $index) { <li>{{ example(e) }}</li> }</ul> }
      </li>
    </ng-template>
  `,
})
export class ImportReviewDialogComponent {
  protected readonly facade = inject(ImportsFacade);
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** La fila elegida: da el nombre y la fecha mientras llega el detalle. */
  readonly summary = input.required<ImportSummary>();
  readonly closed = output();

  protected readonly icons = ICONS;
  protected readonly formatLabels = FORMAT_LABELS;
  protected readonly requirementLabels = REQUIREMENT_LABELS;
  protected readonly severityLabels = SEVERITY_LABELS;
  protected readonly phase = phaseLabel;
  protected readonly step = stepText;
  protected readonly samples = sampleRowsShort;
  protected readonly count = formatCount;
  protected readonly size = formatSize;
  protected readonly trips = tripsCount;
  protected readonly action = pendingAction;
  protected readonly example = exampleText;
  protected readonly routesCount = routesCount;
  protected readonly tripsCount = tripsCount;
  protected readonly osmUrl = OSM_COPYRIGHT_URL;
  protected readonly divipolaUrl = DIVIPOLA_URL;
  protected readonly retryError = signal<AppError | null>(null);

  protected readonly caveat = COVERAGE_CAVEAT;

  /** «N viajes se pueden estimar con referencia técnica (teórico) en M vehículos; K no tienen distancia o referencia.» con las cifras del servidor. */
  protected estimationText(c: CalculableWithEstimation): string {
    const head = c.trips > 0
      ? `${tripsCount(c.trips)} ${c.trips === 1 ? 'se puede estimar' : 'se pueden estimar'} con referencia técnica (teórico) en ${formatCount(c.vehicles)} ${c.vehicles === 1 ? 'vehículo' : 'vehículos'}`
      : `${tripsCount(c.alreadyEstimatedTrips)} ya ${c.alreadyEstimatedTrips === 1 ? 'se calculó' : 'se calcularon'} con rendimiento estimado (teórico)`;

    return c.pendingWithoutDistanceOrReference > 0 ? `${head}; ${formatCount(c.pendingWithoutDistanceOrReference)} no ${c.pendingWithoutDistanceOrReference === 1 ? 'tiene' : 'tienen'} distancia o referencia.` : `${head}.`;
  }
  /** Versión corta y siempre visible de la aclaración (el texto completo va en `title` y en texto accesible). */
  protected readonly shortCaveat = '% por cantidad de viajes, no por emisiones';

  protected readonly detail = computed(() => {
    const data = this.facade.detail.data();

    return data?.id === this.summary().id ? data : null;
  });
  protected readonly format = computed(() => this.detail()?.review?.format ?? this.detail()?.format ?? this.summary().format);
  protected readonly running = computed(() => {
    const d = this.detail();

    return !!d && isRunning(d.status);
  });
  protected readonly percentDone = computed(() => {
    const d = this.detail();

    return d ? overallPercent(d.phase, d.rowsProcessed, d.rowsTotal) : null;
  });
  /** «Procesada en 1 min 50 s» de la carga terminada (con los datos más frescos: el detalle o, mientras llega, la fila). */
  protected readonly took = computed(() => {
    const item = this.detail() ?? this.summary();

    return item.status === 'COMPLETED' ? processedIn(item) : null;
  });

  /** Huella de esta carga lista para mostrar; `null` si el servidor no la trae (carga anterior al cálculo o sin viajes): sin cifras inventadas. */
  protected readonly footprint = computed(() => {
    const f = this.detail()?.footprint;

    if (!f) return null;

    const scope = f.trips.calculated + f.trips.pending + f.trips.blocked;
    const months = f.byMonth.filter((m) => m.tripsCalculated > 0).map((m) => ({ label: monthLabel(m.month) ?? m.month, kg: formatKgCo2(m.kgCo2) }));
    const hidden = months.slice(VISIBLE_MONTHS);

    return {
      hasEmissions: f.trips.calculated > 0,
      value: formatKgCo2(f.kgCo2),
      unit: FOOTPRINT_UNIT,
      partial: f.partial,
      hint: coverageHint(f.trips.calculated, scope, f.coverageTripsPct),
      duplicatesLine: possibleDuplicatesLine(f.trips.possibleDuplicate),
      coverage: f.partial ? `${coverageLine(f.trips.calculated, scope)}${f.coverageTripsPct === null ? '' : ` (${formatPct(f.coverageTripsPct)} % de los viajes)`}` : null,
      emptyText: noEmissionsReason(f.trips.pending + f.trips.blocked),
      trips: f.trips,
      measured: measuredEstimatedLine(f),
      measuredHint: measuredEstimatedHint(f),
      months: months.slice(0, VISIBLE_MONTHS),
      hiddenMonths: hidden.length,
      hiddenText: hidden.map((m) => `${m.label}: ${m.kg} kg`).join(' · '),
    };
  });

  /** Viajes con los datos necesarios: con consumo real más con consumo estimado. */
  protected readonly calculable = computed(() => {
    const m = this.detail()?.review?.methods;

    return m ? m.realConsumption + m.estimatedConsumption : 0;
  });
  /** «1.250 viajes con distancia por ruta · 30 sin ruta» (la segunda cifra se omite si es 0). */
  protected routesRows(routes: ImportRoutes): string {
    const resolved = `${tripsCount(routes.rowsResolved)} con distancia por ruta`;

    return routes.rowsUnresolved > 0 ? `${resolved} · ${formatCount(routes.rowsUnresolved)} sin ruta` : resolved;
  }

  /** «Periodo de los viajes: Ene 2026 a Mar 2026 (Trimestral)»; `null` si la carga no trae fechas. */
  protected periodLine(review: ImportReview): string | null {
    const period = review.period;
    const label = period ? periodRangeLabel(period.from, period.to) : null;

    return period && label ? `Periodo de los viajes: ${label} (${periodKind(period.from, period.to)})` : null;
  }

  protected readonly calcPct = computed(() => share(this.calculable(), this.detail()?.review?.rowsRead ?? 0));
  protected readonly verdictTitle = computed(() => {
    const rows = this.detail()?.review?.rowsRead ?? 0;

    if (rows === 0) return 'No encontramos viajes en el archivo';

    return this.calcPct() === 0 ? 'Todavía no se puede calcular ningún viaje' : `El ${this.calcPct()} % de tus viajes se puede calcular`;
  });

  /** Motivos pendientes del servidor, del que afecta a más viajes al que afecta a menos. */
  /**
   * Lo que hay que hacer: los motivos por los que un viaje queda pendiente y los hallazgos que traen una acción (lugares no reconocidos, rutas no
   * disponibles, tope de rutas), de más a menos viajes; los hallazgos aportan hasta `MAX_EXAMPLES` ejemplos.
   */
  protected readonly reasons = computed<readonly TodoItem[]>(() => {
    const review = this.detail()?.review;
    const reasons = (review?.pendingReasons ?? []).map((p): TodoItem => ({ code: p.code, label: p.label, rows: p.rows, sampleRows: p.sampleRows, examples: [] }));
    const issues = (review?.issues ?? []).filter((i) => pendingAction(i.code) !== null).map((i): TodoItem => ({ code: i.code, label: i.message, rows: i.rows, sampleRows: i.sampleRows, examples: i.examples.slice(0, MAX_EXAMPLES) }));

    return [...reasons, ...issues].sort((a, b) => b.rows - a.rows);
  });
  protected readonly visibleReasons = computed(() => this.reasons().slice(0, VISIBLE_REASONS));
  protected readonly hiddenReasons = computed(() => this.reasons().slice(VISIBLE_REASONS));
  /** Avisos con los errores primero (el orden del servidor se conserva dentro de cada severidad). */
  protected readonly sortedIssues = computed<readonly ReviewIssue[]>(() => [...(this.detail()?.review?.issues ?? [])].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]));

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;

      // showModal() mueve el foco al diálogo; al cerrarse el navegador lo devuelve a quien lo abrió.
      if (!dialog.open) dialog.showModal();
    });
    effect(() => {
      const id = this.summary().id;

      untracked(() => this.facade.openDetail(id));
    });
    inject(DestroyRef).onDestroy(() => this.facade.closeDetail());
  }

  /** «18 de 20 columnas reconocidas». */
  protected columnsSummary(r: ImportReview): string {
    const found = r.columns.filter((c) => c.found).length;

    return `${found} de ${r.columns.length} ${r.columns.length === 1 ? 'columna reconocida' : 'columnas reconocidas'}`;
  }

  /** Columnas obligatorias o condicionales que el archivo no trae. */
  protected missingColumns(r: ImportReview): readonly ImportColumn[] {
    return r.columns.filter((c) => !c.found && NEEDED_REQUIREMENTS.has(c.requirement));
  }

  protected plates(n: number): string {
    return `${formatCount(n)} ${n === 1 ? 'placa distinta' : 'placas distintas'}`;
  }

  /** % diligenciado = filas con dato / filas leídas, con las cifras del servidor. */
  protected filled(filledRows: number, rowsRead: number): number {
    return rowsRead > 0 ? Math.min(100, Math.round((filledRows / rowsRead) * 100)) : 0;
  }

  protected retry(id: string): void {
    this.retryError.set(null);
    this.facade.retry(id).subscribe({
      next: () => this.dialogRef().nativeElement.close(),
      error: (e: unknown) => this.retryError.set(toAppError(e)),
    });
  }
}
