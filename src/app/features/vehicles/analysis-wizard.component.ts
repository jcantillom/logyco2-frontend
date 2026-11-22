import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { AnalysisCounts } from '../../domain/models/vehicles';
import { CloseOnBackdropDirective } from '../../shared/ui/close-on-backdrop.directive';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { AnalysisFacade } from './analysis.facade';
import { ANALYSIS_STATUS_LABELS, phaseLabel } from './analysis.labels';
import { ConflictsStepComponent } from './conflicts-step.component';
import { NewVehiclesStepComponent } from './new-vehicles-step.component';

export type WizardStep = 'upload' | 'summary' | 'new' | 'conflicts';

export const UPLOAD_NETWORK_MESSAGE = 'No se pudo subir el archivo: puede superar el tamaño permitido o se perdió la conexión.';

const ICON_UPLOAD = 'M12 16V4M7 9l5-5 5 5M4 20h16';

const TILES: readonly { readonly key: keyof AnalysisCounts; readonly label: string; readonly tone: '' | 'warn' | 'bad' | 'neutral' }[] = [
  { key: 'detected', label: 'Detectados', tone: '' },
  { key: 'known', label: 'Conocidos', tone: 'neutral' },
  { key: 'new', label: 'Nuevos', tone: '' },
  { key: 'conflict', label: 'Con conflictos', tone: 'bad' },
  { key: 'incomplete', label: 'Incompletos', tone: 'warn' },
  { key: 'invalid', label: 'Inválidos', tone: 'neutral' },
];

/**
 * Asistente «Analizar archivo Excel»: cargar → resumen → vehículos nuevos → vehículos con información diferente. El estado se
 * restaura desde la URL (`?analysis=<id>`): la página le pasa el id y recibe los cambios.
 */
@Component({
  selector: 'app-analysis-wizard',
  imports: [DatePipe, CloseOnBackdropDirective, StatusBadgeComponent, NewVehiclesStepComponent, ConflictsStepComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: contents; }
      dialog.wizard { width: min(980px, calc(100vw - var(--dlg-left, 0px) - 24px)); max-height: calc(100dvh - 24px); border-radius: 18px; overflow: hidden; }
      dialog.wizard[open] { display: flex; flex-direction: column; }
      .head { display: flex; align-items: center; gap: 12px; padding: 16px 22px; border-bottom: 1px solid var(--c-bd); background: radial-gradient(120% 140% at 0 0, var(--c-ok-soft), var(--c-sf) 70%); }
      .head h2 { margin: 0; flex: 1 1 auto; font-size: 1.15rem; color: var(--c-head); }
      .steps { display: flex; gap: 6px; margin: 0; padding: 10px 22px 0; list-style: none; border-bottom: 1px solid var(--c-bd); overflow-x: auto; }
      .steps button { display: inline-flex; align-items: center; gap: 8px; border: 0; border-bottom: 3px solid transparent; background: none; padding: 8px 12px; font: inherit; font-size: 0.88rem; font-weight: 600; color: var(--c-mu); cursor: pointer; white-space: nowrap; }
      .steps button:disabled { cursor: not-allowed; opacity: 0.55; }
      .steps button[aria-current='step'] { color: var(--c-head); border-bottom-color: var(--c-primary); }
      .steps button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: -2px; }
      .steps .n { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--c-s3); color: var(--c-head); font-size: 0.74rem; font-weight: 800; }
      .steps [aria-current='step'] .n { background: var(--c-primary); color: var(--c-sf); }
      .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px 22px; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 22px; border-top: 1px solid var(--c-bd); background: var(--c-s2); }
      .drop { display: grid; justify-items: center; gap: 6px; padding: 34px 16px; border: 2px dashed color-mix(in srgb, var(--c-head) 40%, var(--c-sf)); border-radius: 16px; background: var(--c-s2); text-align: center; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
      .drop:hover, .drop.over { border-color: var(--c-primary); background: var(--c-ok-soft); }
      .drop:focus-within { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .drop .ico { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--c-ok-soft); color: var(--c-primary); }
      .drop .ico svg { width: 24px; height: 24px; fill: color-mix(in srgb, currentColor 14%, transparent); stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
      .drop strong { color: var(--c-head); }
      .drop span { color: var(--c-mu); font-size: 0.86rem; }
      .progress.indeterminate > span { width: 35%; animation: slide 1.4s ease-in-out infinite alternate; }
      @keyframes slide { from { margin-left: 0; } to { margin-left: 65%; } }
      @media (prefers-reduced-motion: reduce) { .progress.indeterminate > span { animation: none; width: 100%; } }
      .prog { display: flex; flex-direction: column; gap: 10px; }
      .prog p { margin: 0; }
      .notice { margin: 0 0 12px; padding: 8px 12px; border-radius: 10px; background: var(--c-info-bg); color: var(--c-info); font-size: 0.88rem; font-weight: 600; }
      .tiles { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin: 12px 0; }
      .tile { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-sf); box-shadow: var(--shadow); }
      .tile .label { font-size: 0.76rem; font-weight: 600; color: var(--c-mu); }
      .tile .value { font-size: 1.5rem; font-weight: 750; line-height: 1.1; color: var(--c-head); }
      .tile.warn .value { color: var(--c-warning); }
      .tile.bad .value { color: var(--c-danger); }
      .tile.neutral .value { color: var(--c-text2); }
      .meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; color: var(--c-mu); font-size: 0.86rem; }
      .meta strong { color: var(--c-head); }
      .go { display: flex; gap: 8px; flex-wrap: wrap; }
      @media (max-width: 900px) { .tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @media (max-width: 520px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    `,
  ],
  template: `
    <dialog #dialog appCloseOnBackdrop class="dialog wizard" aria-labelledby="wizard-title" (close)="closed.emit()" data-testid="analysis-wizard">
      <div class="head">
        <h2 id="wizard-title">Analizar archivo Excel</h2>
        <button type="button" class="btn btn-ghost btn-sm" aria-label="Cerrar el asistente" (click)="dialog.close()">Cerrar</button>
      </div>
      <ol class="steps" aria-label="Pasos del asistente">
        @for (s of steps(); track s.id; let i = $index) {
          <li><button type="button" [attr.data-testid]="'step-' + s.id" [attr.aria-current]="step() === s.id ? 'step' : null" [disabled]="s.disabled" (click)="go(s.id)"><span class="n" aria-hidden="true">{{ i + 1 }}</span>{{ s.label }}</button></li>
        }
      </ol>
      <div class="body" data-testid="wizard-body">
        @switch (step()) {
          @case ('upload') {
            @if (!analysisId()) {
              @if (!canImport()) {
                <p class="note" data-testid="no-upload">Tu rol no permite cargar archivos. Puedes abrir un análisis desde «Cargas recientes».</p>
              } @else {
                <label class="drop" [class.over]="over()" data-testid="dropzone" (dragover)="onDragOver($event)" (dragleave)="over.set(false)" (drop)="onDrop($event)">
                  <input class="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-testid="file-input" [disabled]="facade.uploading()" (change)="onPick($event)" />
                  <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="iconUpload" /></svg></span>
                  <strong>{{ facade.uploading() ? 'Subiendo el archivo…' : 'Arrastra tu archivo Excel aquí' }}</strong>
                  <span>o haz clic para elegirlo (.xlsx)</span>
                </label>
                <div aria-live="assertive">
                  @if (uploadMessage(); as message) { <p class="err" role="alert" data-testid="upload-error" style="margin-top: 10px; color: var(--c-danger)">{{ message }}</p> }
                  @if (uploadFailedOffline()) { <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 8px" data-testid="retry-upload" (click)="retryUpload()">Reintentar</button> }
                </div>
              }
            } @else if (facade.analysis.status() === 'error') {
              <div class="alert alert-danger" role="alert">
                <div class="stack" style="gap: 4px; flex: 1"><strong>{{ facade.analysis.error()?.message }}</strong></div>
                <button type="button" class="btn btn-secondary btn-sm" data-testid="reload-analysis" (click)="facade.watch(analysisId()!)">Reintentar</button>
              </div>
            } @else if (facade.analysis.data(); as a) {
              @if (a.status === 'FAILED') {
                <div class="alert alert-danger" role="alert" data-testid="analysis-failed">
                  <div class="stack" style="gap: 4px; flex: 1"><strong>El análisis falló</strong><span>{{ a.error ?? 'No se pudo procesar el archivo.' }}</span>@if (retryError(); as e) { <span data-testid="retry-error">{{ e.message }}</span> }</div>
                  @if (canImport()) { <button type="button" class="btn btn-secondary btn-sm" data-testid="retry-analysis" (click)="retry(a.id)">Reintentar</button> }
                </div>
              } @else {
                <div class="prog" data-testid="progress">
                  @if (facade.duplicate()) { <p class="notice" role="status" data-testid="duplicate">Este archivo ya fue analizado: te mostramos su resultado.</p> }
                  <div class="meta"><strong>{{ a.fileName }}</strong><app-status-badge [label]="statusLabels[a.status]" /></div>
                  <div class="progress" [class.indeterminate]="percent() === null" role="progressbar" aria-label="Avance del análisis" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="percent()">
                    <span [style.width.%]="percent()"></span>
                  </div>
                  <p aria-live="polite" data-testid="phase">{{ phase(a.phase) }}@if (a.rowsProcessed > 0) { · {{ a.rowsProcessed }}@if (a.rowsTotal !== null) { de {{ a.rowsTotal }} } filas }</p>
                </div>
              }
            } @else {
              <div class="stack" role="status" aria-busy="true"><span class="sr-only">Cargando…</span><span class="skeleton" style="height: 24px; width: 40%"></span><span class="skeleton" style="height: 12px"></span></div>
            }
          }
          @case ('summary') {
            @if (facade.analysis.data(); as a) {
              @if (facade.duplicate()) { <p class="notice" role="status" data-testid="duplicate">Este archivo ya fue analizado: te mostramos su resultado.</p> }
              <div class="meta"><strong>{{ a.fileName }}</strong><span>{{ a.createdAt | date: 'd MMM y, HH:mm' }}</span></div>
              <div class="tiles" data-testid="summary-tiles" aria-live="polite">
                @for (t of tiles; track t.key) {
                  <div class="tile" [class]="t.tone"><span class="label">{{ t.label }}</span><b class="value" [attr.data-testid]="'count-' + t.key">{{ a.counts[t.key] }}</b></div>
                }
              </div>
              <div class="go">
                @if (a.counts.new > 0) { <button type="button" class="btn btn-primary btn-sm" data-testid="go-new" (click)="step.set('new')">Revisar vehículos nuevos</button> }
                @if (a.counts.conflict > 0) { <button type="button" class="btn btn-secondary btn-sm" data-testid="go-conflicts" (click)="step.set('conflicts')">Revisar información diferente</button> }
              </div>
            }
          }
          @case ('new') { <app-new-vehicles-step (leave)="dialog.close()" /> }
          @case ('conflicts') { <app-conflicts-step /> }
        }
      </div>
      <div class="actions"><button type="button" class="btn btn-primary" (click)="dialog.close()">Cerrar</button></div>
    </dialog>
  `,
})
export class AnalysisWizardComponent {
  protected readonly facade = inject(AnalysisFacade);
  private readonly access = inject(AccessPolicy);
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** Corrida abierta (de `?analysis=`); `null` muestra el paso de carga. */
  readonly analysisId = input<string | null>(null);
  /** Paso al que ir cuando la corrida está lista (desde las tarjetas «Nuevos pendientes» y «Con inconsistencias»). */
  readonly initialStep = input<'new' | 'conflicts' | null>(null);
  readonly analysisChange = output<string | null>();
  readonly closed = output();

  protected readonly statusLabels = ANALYSIS_STATUS_LABELS;
  protected readonly iconUpload = ICON_UPLOAD;
  protected readonly tiles = TILES;
  protected readonly step = signal<WizardStep>('upload');
  protected readonly over = signal(false);
  protected readonly localError = signal<string | null>(null);
  protected readonly retryError = signal<AppError | null>(null);
  protected readonly canImport = computed(() => this.access.can('imports:create'));
  protected readonly phase = phaseLabel;
  /** Un corte durante la subida (estado 0) suele ser el servidor cerrando la conexión por tamaño: se dice con ese motivo y se deja reintentar. */
  protected readonly uploadFailedOffline = computed(() => this.facade.uploadError()?.kind === 'network');
  protected readonly uploadMessage = computed(() => this.localError() ?? (this.uploadFailedOffline() ? UPLOAD_NETWORK_MESSAGE : (this.facade.uploadError()?.message ?? null)));
  private lastFile: File | null = null;

  private readonly completed = computed(() => this.facade.analysis.data()?.status === 'COMPLETED');
  protected readonly steps = computed<readonly { id: WizardStep; label: string; disabled: boolean }[]>(() => [
    { id: 'upload', label: 'Cargar archivo', disabled: false },
    { id: 'summary', label: 'Resumen', disabled: !this.completed() },
    { id: 'new', label: 'Vehículos nuevos', disabled: !this.completed() },
    { id: 'conflicts', label: 'Información diferente', disabled: !this.completed() },
  ]);
  /** Avance de 0 a 100; `null` (barra indeterminada) cuando el servidor aún no estima el total de filas. */
  protected readonly percent = computed(() => {
    const a = this.facade.analysis.data();

    if (!a || a.rowsTotal === null || a.rowsTotal <= 0) return null;

    return Math.min(100, Math.round((a.rowsProcessed / a.rowsTotal) * 100));
  });

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;

      // showModal() lleva el foco al diálogo; al cerrarse el navegador lo devuelve a quien lo abrió.
      if (!dialog.open) dialog.showModal();
    });
    effect(() => {
      const id = this.analysisId();

      untracked(() => {
        if (id) this.facade.watch(id);
        else {
          this.facade.clear();
          this.step.set('upload');
        }
      });
    });
    // Cuando la corrida termina bien se pasa al resumen (o al paso pedido); el resto de las veces el usuario elige el paso.
    effect(() => {
      if (this.completed() && untracked(() => this.step()) === 'upload') this.step.set(untracked(() => this.initialStep()) ?? 'summary');
    });
    inject(DestroyRef).onDestroy(() => this.facade.clear());
  }

  protected go(step: WizardStep): void {
    if (step === 'upload') {
      this.localError.set(null);
      this.analysisChange.emit(null);
    }

    this.step.set(step);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.over.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.over.set(false);
    const file = event.dataTransfer?.files?.[0];

    if (file) this.upload(file);
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (file) this.upload(file);
  }

  protected retryUpload(): void {
    if (this.lastFile) this.upload(this.lastFile);
  }

  protected retry(id: string): void {
    this.retryError.set(null);
    this.facade.retry(id).subscribe({ error: (e: unknown) => this.retryError.set(toAppError(e)) });
  }

  private upload(file: File): void {
    if (!/\.xlsx$/i.test(file.name)) {
      this.localError.set('El archivo debe ser un libro de Excel con extensión .xlsx.');

      return;
    }

    this.localError.set(null);
    this.lastFile = file;
    this.facade.upload(file).subscribe({ next: (created) => this.analysisChange.emit(created.id), error: () => undefined });
  }
}
