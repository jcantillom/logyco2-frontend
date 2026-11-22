import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ImportColumn, ImportReview, ImportSummary, PendingReason, ReviewIssue } from '../../domain/models/imports';
import { periodKind, periodRangeLabel } from '../../domain/models/period';
import { CloseOnBackdropDirective } from '../../shared/ui/close-on-backdrop.directive';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { ExcelIconComponent } from '../../shared/ui/excel-icon.component';
import { TruckProgressComponent } from '../../shared/ui/truck-progress.component';
import { ImportsFacade } from './imports.facade';
import { FORMAT_LABELS, REQUIREMENT_LABELS, SEVERITY_LABELS, formatCount, formatSize, isRunning, pendingAction, percent, phaseLabel, sampleRowsShort, share, tripsCount } from './imports.labels';

/** Trazos de los íconos (viewBox 24, sin relleno). */
const ICONS = {
  real: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M7 8h6M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3',
  estimated: 'M4 20V4M4 20h16M8 15l3-4 3 2 5-6',
  pending: 'M12 4l9 16H3zM12 10v4M12 17.5v.01',
  close: 'M6 6l12 12M18 6L6 18',
} as const;

/** Cuántos motivos pendientes se ven de entrada; el resto va plegado. */
const VISIBLE_REASONS = 3;

/** Las columnas que el usuario debe traer para que los viajes se puedan calcular. */
const NEEDED_REQUIREMENTS: ReadonlySet<string> = new Set(['REQUIRED', 'CONDITIONAL']);

/** Orden de los avisos: los errores primero. */
const SEVERITY_ORDER: Readonly<Record<string, number>> = { ERROR: 0, WARNING: 1, INFO: 2 };

/** Informe de una carga: qué tan lista está (veredicto), el desglose, qué hacer y, plegados, los avisos y las columnas. */
@Component({
  selector: 'app-import-review-dialog',
  imports: [DatePipe, NgTemplateOutlet, CloseOnBackdropDirective, StatusBadgeComponent, TruckProgressComponent, ExcelIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: contents; }
      dialog.review { width: min(720px, calc(100vw - var(--dlg-left, 0px) - 24px)); max-height: calc(100dvh - 24px); border-radius: 18px; overflow: hidden; }
      dialog.review[open] { display: flex; flex-direction: column; }
      .head { display: flex; align-items: center; gap: 12px; padding: 14px 18px 14px 22px; border-bottom: 1px solid var(--c-bd); background: radial-gradient(120% 140% at 0 0, var(--c-ok-soft), var(--c-sf) 70%); }
      .head .grow { flex: 1 1 auto; min-width: 0; }
      .head h2 { margin: 0; font-size: 1rem; color: var(--c-head); overflow-wrap: anywhere; }
      .head small { color: var(--c-text2); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
      .x { display: grid; place-items: center; width: 36px; height: 36px; flex: none; padding: 0; border: 1px solid color-mix(in srgb, var(--c-primary) 40%, var(--c-sf)); border-radius: 50%; background: var(--c-sf); color: var(--c-head); cursor: pointer; }
      .x:hover { background: var(--c-ok-soft); }
      .x:focus-visible, summary:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .x svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 14px 22px 14px; display: flex; flex-direction: column; gap: 10px; font-size: 0.95rem; }
      h3 { margin: 0 0 6px; font-size: 0.9rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-accent); }
      .verdict h3 { margin: 0; font-size: 1.6rem; line-height: 1.2; letter-spacing: 0; text-transform: none; color: var(--c-head); font-weight: 800; }
      .verdict .bar { display: flex; height: 10px; margin: 10px 0 6px; border-radius: 999px; overflow: hidden; background: var(--c-s2); }
      .verdict .ok { background: var(--c-secondary); }
      .verdict .warn { background: color-mix(in srgb, var(--c-primary) 60%, var(--c-sf)); }
      .verdict p.period { margin-top: 8px; font-size: 0.86rem; color: var(--c-mu); }
      .verdict p { margin: 0; color: var(--c-text2); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
      .split { list-style: none; margin: 0; padding: 0; border: 1px solid var(--c-bd); border-radius: 12px; overflow: hidden; }
      .split li { display: grid; grid-template-columns: 28px auto minmax(0, 1fr); align-items: center; gap: 4px 12px; padding: 5px 14px; border-bottom: 1px solid var(--c-bd); }
      .split li:last-child { border-bottom: 0; }
      .split svg { width: 22px; height: 22px; fill: none; stroke: var(--c-primary); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
      .split b { min-width: 7ch; font-size: 1.25rem; color: var(--c-head); font-variant-numeric: tabular-nums; }
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
      summary { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 4px 14px; cursor: pointer; list-style: none; color: var(--c-head); font-weight: 700; border-radius: 12px; }
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
      .foot { display: flex; flex-wrap: wrap; gap: 2px 14px; margin: 0; color: var(--c-mu); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
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
        .split li { grid-template-columns: 28px auto; }
        .split span { grid-column: 1 / -1; }
      }
    `,
  ],
  template: `
    <dialog #dialog appCloseOnBackdrop class="dialog review" aria-labelledby="review-title" (close)="closed.emit()" data-testid="import-review">
      <div class="head">
        <app-excel-icon [size]="40" />
        <div class="grow">
          <h2 id="review-title">{{ summary().fileName }}</h2>
          <small data-testid="review-meta">{{ size(summary().fileSize) }} · {{ summary().createdAt | date: 'd MMM y, HH:mm' }}</small>
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
              <p class="muted">{{ phase(d.phase) }}@if (d.rowsProcessed > 0) { · {{ count(d.rowsProcessed) }}@if (d.rowsTotal !== null) { de {{ count(d.rowsTotal) }} } filas }</p>
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
              </section>

              <ul class="split" aria-label="Desglose de los viajes" data-testid="review-breakdown">
                <li data-testid="breakdown-real"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.real" /></svg><b>{{ count(r.methods.realConsumption) }}</b><span><strong>Con consumo real.</strong> Usamos el combustible que reportaste</span></li>
                <li data-testid="breakdown-estimated"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.estimated" /></svg><b>{{ count(r.methods.estimatedConsumption) }}</b><span><strong>Con consumo estimado.</strong> Calculado con distancia y rendimiento</span></li>
                <li data-testid="breakdown-pending"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.pending" /></svg><b>{{ count(r.methods.pending) }}</b><span><strong>Por completar datos.</strong> Les falta algún dato</span></li>
              </ul>

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

              <p class="foot" data-testid="counters"><span>{{ plates(r.vehicles.distinctPlates) }}</span><span>·</span><span>{{ trips(r.trips.distinctTripIds) }}</span></p>
              <p class="note" data-testid="honest-note">Esta revisión todavía no guarda viajes ni calcula emisiones.</p>
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
  protected readonly samples = sampleRowsShort;
  protected readonly count = formatCount;
  protected readonly size = formatSize;
  protected readonly trips = tripsCount;
  protected readonly action = pendingAction;
  protected readonly retryError = signal<AppError | null>(null);

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

    return d ? percent(d.rowsProcessed, d.rowsTotal) : null;
  });

  /** Viajes con los datos necesarios: con consumo real más con consumo estimado. */
  protected readonly calculable = computed(() => {
    const m = this.detail()?.review?.methods;

    return m ? m.realConsumption + m.estimatedConsumption : 0;
  });
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
  protected readonly reasons = computed<readonly PendingReason[]>(() => [...(this.detail()?.review?.pendingReasons ?? [])].sort((a, b) => b.rows - a.rows));
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
