import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, output, signal, untracked, viewChild } from '@angular/core';
import { ExcelIconComponent } from '../../shared/ui/excel-icon.component';
import { EfficiencyFichaFacade, FICHA_MAX_BYTES } from './efficiency-ficha.facade';
import { appliedText, efficiencyErrorText, fichaPlanText, plural, rawEfficiencyText, dayText, remainingText, STALLED_TEXT, staleText } from './vehicle-efficiency.view';

const UPLOAD = 'M12 16V4M7 9l5-5 5 5M4 20h16';

/** Nombre de cada campo de la ficha tal como lo ve la persona en la hoja. */
const FIELD_LABELS: Readonly<Record<string, string>> = { plate: 'Placa', value: 'Rendimiento', unit: 'Unidad', type: 'Tipo', note: 'Fuente o nota', measured_on: 'Fecha de medición' };

/**
 * «Ficha de rendimiento»: carga el rendimiento de muchos vehículos desde un Excel. Paso 1: descargar la plantilla y elegir o soltar el .xlsx
 * (el servidor lo revisa sin guardar nada). Paso 2: la revisión, con los números y los problemas que entrega el servidor (6 por página, sin
 * scroll interno) y «Aplicar». Paso 3: el resultado, con «Continuar» si quedan viajes por examinar. La pantalla no calcula nada.
 */
@Component({
  selector: 'app-efficiency-ficha-dialog',
  imports: [ExcelIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: contents; }
      dialog.ficha { width: min(720px, calc(100vw - var(--dlg-left, 0px) - 32px)); max-height: calc(100dvh - 24px); overflow: visible; border-radius: 16px; background: var(--c-sf); }
      dialog.ficha[open] { display: block; }
      .hd { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--c-bd); border-radius: 16px 16px 0 0; background: radial-gradient(120% 140% at 0 0, var(--c-ok-soft), var(--c-sf) 70%); }
      .hd h2 { margin: 0; font-size: 1.1rem; letter-spacing: -0.01em; color: var(--c-head); }
      .hd h2:focus { outline: none; }
      .hd p { margin: 2px 0 0; font-size: 0.82rem; color: var(--c-mu); }
      .bd { display: grid; gap: 12px; padding: 14px 20px; }
      .ico { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
      .steps { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
      .steps li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 12px; }
      .steps strong { font-size: 0.88rem; color: var(--c-head); }
      .steps small { display: block; font-size: 0.78rem; color: var(--c-mu); }
      .drop { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 2px 14px; padding: 14px 18px; border: 2px dashed color-mix(in srgb, var(--c-head) 40%, var(--c-sf)); border-radius: 14px; background: var(--c-s2); cursor: pointer; transition: border-color 0.15s, background 0.15s; }
      .drop:hover, .drop.over { border-color: var(--c-primary); background: var(--c-ok-soft); }
      .drop:focus-within { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .drop .big { grid-row: 1 / span 2; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--c-sf); color: var(--c-accent); }
      .drop .big svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .drop strong { font-size: 0.9rem; color: var(--c-head); }
      .drop span.h { font-size: 0.78rem; color: var(--c-mu); }
      .file { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 0.86rem; font-weight: 650; color: var(--c-head); }
      .file span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .busy { display: grid; gap: 6px; font-size: 0.84rem; color: var(--c-text2); }
      .bar { height: 6px; border-radius: 999px; background: var(--c-s3); overflow: hidden; }
      .bar i { display: block; width: 40%; height: 100%; border-radius: 999px; background: var(--c-primary); animation: slide 1.2s ease-in-out infinite; }
      @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
      .counts { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin: 0; }
      .counts div { display: grid; gap: 1px; padding: 6px 10px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); }
      .counts dt { font-size: 0.72rem; color: var(--c-mu); }
      .counts dd { margin: 0; font-size: 1.05rem; font-weight: 750; color: var(--c-head); font-variant-numeric: tabular-nums; }
      .counts .bad dd { color: var(--c-danger); }
      .plan { margin: 0; padding: 8px 12px; border-radius: 10px; background: var(--c-ok-soft); font-size: 0.86rem; font-weight: 650; color: var(--c-head); }
      .res { display: grid; gap: 6px; }
      .alert { margin: 0; padding: 8px 12px; font-size: 0.84rem; }
      .alert p { margin: 0; }
      .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
      h3 { margin: 0 0 4px; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-accent); }
      ol.issues { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
      ol.issues li { display: grid; grid-template-columns: auto auto auto minmax(0, 1fr); align-items: center; gap: 2px 10px; padding: 4px 10px; border: 1px solid var(--c-bd); border-radius: 10px; font-size: 0.82rem; }
      ol.issues b { color: var(--c-head); white-space: nowrap; }
      ol.issues .f { color: var(--c-mu); white-space: nowrap; }
      ol.issues .m { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-danger); }
      .prot { display: grid; gap: 6px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--c-warning) 40%, var(--c-bd)); border-radius: 12px; background: var(--c-warning-bg); }
      .prot p { margin: 0; font-size: 0.84rem; color: var(--c-text); }
      .prot ul { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
      .prot li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; padding: 4px 10px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); font-size: 0.82rem; }
      .prot li b { color: var(--c-head); }
      .prot .cur { color: var(--c-mu); }
      .prot label.sw { display: flex; align-items: flex-start; gap: 8px; font-weight: 650; color: var(--c-head); font-size: 0.86rem; cursor: pointer; }
      .prot label.sw input { margin-top: 3px; flex: none; }
      .prot label.sw:has(input:focus-visible) { outline: 3px solid var(--c-focus); outline-offset: 2px; border-radius: 6px; }
      .pg { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; font-size: 0.78rem; color: var(--c-mu); }
      .ft { display: flex; justify-content: flex-end; gap: 10px; padding: 10px 20px; border-top: 1px solid var(--c-bd); border-radius: 0 0 16px 16px; background: var(--c-s2); }
      @media (max-width: 719px) {
        dialog.ficha { width: 100vw; max-width: 100vw; height: auto; max-height: 100dvh; margin: 0; border-radius: 0; overflow: hidden; }
        dialog.ficha[open] { display: flex; flex-direction: column; }
        .bd { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
        .hd, .ft { flex: none; border-radius: 0; }
        .counts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .steps li { grid-template-columns: 1fr; }
        ol.issues li { grid-template-columns: auto minmax(0, 1fr); }
        ol.issues .m { grid-column: 1 / -1; white-space: normal; }
      }
      @media (prefers-reduced-motion: reduce) { .bar i { animation: none; width: 100%; } .drop { transition: none; } }
    `,
  ],
  template: `
    <dialog #dialog class="dialog ficha" aria-labelledby="ficha-title" (close)="onClosed()" (cancel)="onCancel($event)" data-testid="ficha-dialog">
      <header class="hd">
        <div>
          <h2 id="ficha-title" tabindex="-1" #title>Ficha de rendimiento</h2>
          <p>Declara el rendimiento de muchos vehículos con un Excel.</p>
        </div>
      </header>

      <div class="bd">
        @switch (facade.step()) {
          @case ('file') {
            <ol class="steps" data-testid="ficha-step-file">
              <li>
                <span><strong>1. Descarga la plantilla</strong><small>Una fila por vehículo: placa, rendimiento y unidad.</small></span>
                <button type="button" class="btn btn-secondary" data-testid="ficha-template" [disabled]="facade.downloading() || facade.busy() !== null" (click)="facade.downloadTemplate()">
                  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>{{ facade.downloading() ? 'Descargando…' : 'Descargar plantilla' }}
                </button>
              </li>
              <li>
                <span><strong>2. Sube la ficha completa</strong><small>Solo .xlsx, hasta {{ maxMb }} MB. Se revisa antes de guardar nada.</small></span>
              </li>
            </ol>
            <!-- Atajo para el ratón: el teclado y los lectores usan el campo de archivo de esta misma zona. -->
            <label class="drop" [class.over]="over()" data-testid="ficha-drop" (dragover)="onDragOver($event)" (dragleave)="over.set(false)" (drop)="onDrop($event)">
              <span class="big" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="upload" /></svg></span>
              <strong>Arrastra la ficha aquí o selecciónala</strong>
              <span class="h">Solo se acepta un archivo .xlsx</span>
              <input class="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-testid="ficha-input" [disabled]="facade.busy() !== null" (change)="onPick($event)" />
            </label>
            @if (facade.busy() === 'preview') {
              <div class="busy" role="status" data-testid="ficha-busy"><span>Revisando {{ facade.fileName() }}…</span><span class="bar" aria-hidden="true"><i></i></span></div>
            }
          }
          @case ('review') {
            @if (facade.preview(); as p) {
              <div class="file" data-testid="ficha-file"><app-excel-icon [size]="28" /><span [attr.title]="facade.fileName()">{{ facade.fileName() }}</span></div>
              <dl class="counts" data-testid="ficha-counts">
                <div><dt>Filas</dt><dd>{{ p.counts.rows }}</dd></div>
                <div><dt>Válidas</dt><dd data-testid="ficha-valid">{{ p.counts.valid }}</dd></div>
                <div [class.bad]="p.counts.withIssues > 0"><dt>Con problemas</dt><dd data-testid="ficha-issues-count">{{ p.counts.withIssues }}</dd></div>
                <div><dt>Sin cambios</dt><dd>{{ p.counts.unchanged }}</dd></div>
                <div><dt>Por declarar</dt><dd>{{ p.counts.toCreate }}</dd></div>
                <div><dt>Reemplazan</dt><dd>{{ p.counts.toReplace }}</dd></div>
              </dl>
              <p class="plan" data-testid="ficha-plan">{{ plan(p.counts) }}</p>
              @if (p.counts.measuredProtected > 0) {
                <section class="prot" aria-labelledby="ficha-prot-title" data-testid="ficha-protected">
                  <h3 id="ficha-prot-title" data-testid="ficha-protected-count">{{ plural(p.counts.measuredProtected, 'vehículo con rendimiento medido vigente', 'vehículos con rendimiento medido vigente') }}</h3>
                  <p id="ficha-prot-note" data-testid="ficha-protected-note">Por defecto NO se reemplazan: un rendimiento medido se conserva y estas filas se omiten. El resto de la ficha se aplica igual.</p>
                  <ul aria-label="Filas con rendimiento medido vigente" data-testid="ficha-protected-rows">
                    @for (r of facade.pageProtected(); track $index) {
                      <li><b>Fila {{ r.row }}</b><span>{{ r.plate ?? '—' }}</span><span class="cur">Medido: {{ raw(r.currentValue, r.currentUnit) }}{{ r.currentMeasuredOn ? ' del ' + day(r.currentMeasuredOn) : '' }}</span><span>Nuevo: {{ raw(r.newValue, r.newUnit) }}</span></li>
                    }
                  </ul>
                  @if (p.protectedTruncated) { <p class="small" data-testid="ficha-protected-truncated">Se muestran las primeras {{ p.protectedRows.length }} filas.</p> }
                  @if (facade.protectedPages() > 1) {
                    <nav class="pg" aria-label="Páginas de las filas con medido vigente">
                      <button type="button" class="btn btn-secondary btn-sm" data-testid="ficha-prot-prev" [disabled]="facade.protectedPage() === 0" (click)="facade.setProtectedPage(facade.protectedPage() - 1)">Anterior</button>
                      <span role="status">Página {{ facade.protectedPage() + 1 }} de {{ facade.protectedPages() }}</span>
                      <button type="button" class="btn btn-secondary btn-sm" data-testid="ficha-prot-next" [disabled]="facade.protectedPage() + 1 >= facade.protectedPages()" (click)="facade.setProtectedPage(facade.protectedPage() + 1)">Siguiente</button>
                    </nav>
                  }
                  <label class="sw"><input type="checkbox" id="ficha-replace-measured" data-testid="ficha-replace-measured" aria-describedby="ficha-prot-note" [checked]="facade.replaceMeasured()" [disabled]="facade.busy() !== null" (change)="facade.setReplaceMeasured($any($event.target).checked)" /><span>Reemplazar también los rendimientos medidos</span></label>
                </section>
              }
              @if (facade.stale()) {
                <div class="alert alert-warning" role="alert" data-testid="ficha-stale">
                  <div class="row"><p>La revisión ya no sirve. Vuelve a revisar el mismo archivo para aplicarlo.</p><button type="button" class="btn btn-secondary btn-sm" data-testid="ficha-review-again" [disabled]="facade.busy() !== null" (click)="facade.reviewAgain()">Revisar de nuevo</button></div>
                </div>
              }
              @if (p.issues.length > 0) {
                <section aria-labelledby="ficha-issues-title">
                  <h3 id="ficha-issues-title">Problemas por corregir{{ p.issuesTruncated ? ' (los primeros ' + p.issues.length + ')' : '' }}</h3>
                  <ol class="issues" data-testid="ficha-issues">
                    @for (i of facade.pageIssues(); track $index) {
                      <li><b>Fila {{ i.row }}</b><span class="f">{{ i.plate ?? '—' }}</span><span class="f">{{ fieldLabel(i.field) }}</span><span class="m" [attr.title]="i.message">{{ i.message }}</span></li>
                    }
                  </ol>
                  @if (facade.issuePages() > 1) {
                    <nav class="pg" aria-label="Páginas de los problemas">
                      <button type="button" class="btn btn-secondary btn-sm" data-testid="ficha-prev" [disabled]="facade.issuesPage() === 0" (click)="facade.setIssuesPage(facade.issuesPage() - 1)">Anterior</button>
                      <span role="status">Página {{ facade.issuesPage() + 1 }} de {{ facade.issuePages() }}</span>
                      <button type="button" class="btn btn-secondary btn-sm" data-testid="ficha-next" [disabled]="facade.issuesPage() + 1 >= facade.issuePages()" (click)="facade.setIssuesPage(facade.issuesPage() + 1)">Siguiente</button>
                    </nav>
                  }
                </section>
              }
            }
          }
          @case ('result') {
            @if (facade.outcome(); as o) {
              <div class="alert alert-success" role="status" data-testid="ficha-result">
                <div class="stack" style="gap: 2px">
                  <p><strong>{{ o.recordsCreated + o.recordsReplaced === 0 ? 'La ficha ya estaba aplicada: no se creó ningún registro.' : 'Ficha aplicada.' }}</strong>
                    {{ plural(o.recordsCreated, 'registro nuevo', 'registros nuevos') }}, {{ plural(o.recordsReplaced, 'reemplazado', 'reemplazados') }} y {{ plural(o.unchanged, 'fila sin cambios', 'filas sin cambios') }}.</p>
                  @if (o.recordsReplacedMeasured > 0) { <p data-testid="ficha-replaced-measured">{{ plural(o.recordsReplacedMeasured, 'rendimiento medido reemplazado', 'rendimientos medidos reemplazados') }} por confirmación.</p> }
                  @if (o.skippedMeasuredProtected > 0) { <p data-testid="ficha-skipped-protected">{{ plural(o.skippedMeasuredProtected, 'fila omitida', 'filas omitidas') }} por tener un rendimiento medido vigente (se conservó).</p> }
                  <p data-testid="ficha-applied">{{ applied(o.applied, o.recalculated) }}</p>
                  @if (o.applied.remaining > 0 && o.stalled) {
                    <p data-testid="ficha-stalled">{{ stalledText }}</p>
                  } @else if (o.applied.remaining > 0) {
                    <div class="row"><p data-testid="ficha-remaining">{{ remaining(o.applied.remaining) }}</p><button type="button" class="btn btn-secondary btn-sm" data-testid="ficha-continue" [disabled]="facade.busy() !== null" (click)="facade.continue()">{{ facade.busy() === 'apply' ? 'Continuando…' : 'Continuar' }}</button></div>
                  }
                  @if (o.applied.staleCalculatedTrips > 0) { <p data-testid="ficha-stale-trips">{{ stale(o.applied.staleCalculatedTrips) }}</p> }
                </div>
              </div>
            }
          }
        }

        @if (facade.busy() === 'apply' && facade.step() === 'review') {
          <div class="busy" role="status" data-testid="ficha-applying"><span>Aplicando la ficha…</span><span class="bar" aria-hidden="true"><i></i></span></div>
        }
        <div class="res">
          @if (facade.problem(); as message) { <p class="alert alert-danger" role="alert" data-testid="ficha-problem">{{ message }}</p> }
          @if (facade.error(); as e) {
            <div class="alert alert-danger" role="alert" data-testid="ficha-error">
              <div class="row"><p>{{ errorText(e) }}</p>@if (retryable()) { <button type="button" class="btn btn-secondary btn-sm" data-testid="ficha-retry" [disabled]="facade.busy() !== null" (click)="facade.retry()">Reintentar</button> }</div>
            </div>
          }
        </div>
        <p class="sr-only" role="status" aria-live="polite" data-testid="ficha-live">{{ facade.announcement() }}</p>
      </div>

      <footer class="ft">
        @if (facade.step() === 'review') {
          <button type="button" class="btn btn-secondary" data-testid="ficha-back" [disabled]="facade.busy() !== null" (click)="facade.backToFile()">Elegir otro archivo</button>
          <button type="button" class="btn btn-primary" data-testid="ficha-apply" [disabled]="!facade.canApply() || facade.busy() !== null" (click)="facade.apply()">{{ facade.busy() === 'apply' ? 'Aplicando…' : 'Aplicar' }}</button>
        } @else {
          <button type="button" class="btn btn-primary" data-testid="ficha-close" (click)="dialog.close()">Cerrar</button>
        }
      </footer>
    </dialog>
  `,
})
export class EfficiencyFichaDialogComponent {
  protected readonly facade = inject(EfficiencyFichaFacade);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  readonly closed = output();

  protected readonly upload = UPLOAD;
  protected readonly maxMb = FICHA_MAX_BYTES / (1024 * 1024);
  protected readonly over = signal(false);
  /** «Reintentar» solo donde repetir lo mismo tiene sentido: hay una carga procesándose o no hubo conexión. */
  protected readonly retryable = computed(() => ['COMPANY_BUSY', 'EFFICIENCY_APPLY_TOO_LARGE'].includes(this.facade.error()?.code ?? '') || this.facade.error()?.kind === 'network');

  protected readonly plan = fichaPlanText;
  protected readonly applied = appliedText;
  protected readonly remaining = remainingText;
  protected readonly stalledText = STALLED_TEXT;
  protected readonly stale = staleText;
  protected readonly plural = plural;
  protected readonly raw = rawEfficiencyText;
  protected readonly day = dayText;
  protected readonly errorText = efficiencyErrorText;
  protected readonly fieldLabel = (field: string): string => FIELD_LABELS[field] ?? field;

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;

      // showModal() mueve el foco al diálogo; al cerrarse el navegador lo devuelve a quien lo abrió.
      if (!dialog.open) dialog.showModal();
    });
    // Al cambiar de paso el foco va al título: quien usa lector de pantalla oye dónde está.
    let first = true;

    effect(() => {
      this.facade.step();

      if (first) {
        first = false;

        return;
      }

      untracked(() => queueMicrotask(() => this.title().nativeElement.focus()));
    });
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.over.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.over.set(false);
    this.facade.choose(event.dataTransfer?.files[0]);
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';
    this.facade.choose(file);
  }

  /** Mientras revisa o aplica no se cierra con Escape: la petición sigue y la persona perdería el resultado. */
  protected onCancel(event: Event): void {
    if (this.facade.busy() !== null) event.preventDefault();
  }

  protected onClosed(): void {
    this.facade.close();
    this.closed.emit();
  }
}
