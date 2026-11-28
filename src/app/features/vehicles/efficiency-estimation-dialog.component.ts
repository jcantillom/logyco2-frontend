import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, output, untracked, viewChild } from '@angular/core';
import { EfficiencyEstimationFacade } from './efficiency-estimation.facade';
import {
  ESTIMATE_THEORETICAL,
  STALLED_TEXT,
  appliedText,
  estimateErrorText,
  estimatePlanText,
  estimateResultText,
  plural,
  remainingText,
  staleText,
} from './vehicle-efficiency.view';

/**
 * «Estimar rendimiento de pendientes»: la referencia técnica (UPME, teórica) para los vehículos con viajes pendientes y sin rendimiento. La vista
 * previa del servidor no guarda nada (solo conteos); «Aplicar» envía el MISMO alcance con su token; «Continuar» examina los viajes que faltaron y
 * «Revisar el siguiente lote» sigue con el cursor del servidor. La pantalla no calcula nada.
 */
@Component({
  selector: 'app-efficiency-estimation-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: contents; }
      dialog.est { width: min(640px, calc(100vw - var(--dlg-left, 0px) - 32px)); max-height: calc(100dvh - 24px); overflow: visible; border-radius: 16px; background: var(--c-sf); }
      dialog.est[open] { display: block; }
      .hd { padding: 14px 20px; border-bottom: 1px solid var(--c-bd); border-radius: 16px 16px 0 0; background: radial-gradient(120% 140% at 0 0, var(--c-ok-soft), var(--c-sf) 70%); }
      .hd h2 { margin: 0; font-size: 1.1rem; letter-spacing: -0.01em; color: var(--c-head); }
      .hd h2:focus { outline: none; }
      .hd p { margin: 2px 0 0; font-size: 0.82rem; color: var(--c-mu); }
      .bd { display: grid; gap: 12px; padding: 14px 20px; }
      .warn { margin: 0; padding: 8px 12px; border-radius: 10px; background: var(--c-s2); font-size: 0.84rem; color: var(--c-text2); }
      .counts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; }
      .counts div { display: grid; gap: 1px; padding: 6px 10px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); }
      .counts dt { font-size: 0.72rem; color: var(--c-mu); }
      .counts dd { margin: 0; font-size: 1.05rem; font-weight: 750; color: var(--c-head); font-variant-numeric: tabular-nums; }
      .plan { margin: 0; padding: 8px 12px; border-radius: 10px; background: var(--c-ok-soft); font-size: 0.86rem; font-weight: 650; color: var(--c-head); }
      .busy { display: grid; gap: 6px; font-size: 0.84rem; color: var(--c-text2); }
      .bar { height: 6px; border-radius: 999px; background: var(--c-s3); overflow: hidden; }
      .bar i { display: block; width: 40%; height: 100%; border-radius: 999px; background: var(--c-primary); animation: slide 1.2s ease-in-out infinite; }
      @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
      .alert { margin: 0; padding: 8px 12px; font-size: 0.84rem; }
      .alert p, .reasons { margin: 0; }
      .reasons { padding-left: 18px; font-size: 0.82rem; color: var(--c-text2); }
      .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
      .ft { display: flex; justify-content: flex-end; gap: 10px; padding: 10px 20px; border-top: 1px solid var(--c-bd); border-radius: 0 0 16px 16px; background: var(--c-s2); }
      @media (max-width: 719px) {
        dialog.est { width: 100vw; max-width: 100vw; height: auto; max-height: 100dvh; margin: 0; border-radius: 0; overflow: hidden; }
        dialog.est[open] { display: flex; flex-direction: column; }
        .bd { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
        .hd, .ft { flex: none; border-radius: 0; }
        .counts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (prefers-reduced-motion: reduce) { .bar i { animation: none; width: 100%; } }
    `,
  ],
  template: `
    <dialog #dialog class="dialog est" aria-labelledby="est-title" (close)="onClosed()" (cancel)="onCancel($event)" data-testid="estimation-dialog">
      <header class="hd">
        <h2 id="est-title" tabindex="-1" #title>Estimar rendimiento de pendientes</h2>
        <p>Referencia UPME para los vehículos con viajes pendientes y sin rendimiento.</p>
      </header>

      <div class="bd">
        <p class="warn" data-testid="estimation-warning">{{ theoretical }} Un rendimiento declarado o medido nunca se reemplaza.</p>

        @if (facade.outcome(); as o) {
          <div class="alert alert-success" role="status" data-testid="estimation-result">
            <div class="stack" style="gap: 2px">
              <p><strong>{{ resultText(o.result) }}</strong> {{ applied(o.result.applied, o.recalculated) }}</p>
              @if (o.result.applied.remaining > 0 && o.stalled) {
                <p data-testid="estimation-stalled">{{ stalledText }}</p>
              } @else if (o.result.applied.remaining > 0) {
                <div class="row"><p data-testid="estimation-remaining">{{ remaining(o.result.applied.remaining) }}</p><button type="button" class="btn btn-secondary btn-sm" data-testid="estimation-continue" [disabled]="facade.busy() !== null" (click)="facade.continue()">{{ facade.busy() === 'apply' ? 'Continuando…' : 'Continuar' }}</button></div>
              }
              @if (o.result.applied.staleCalculatedTrips > 0) { <p data-testid="estimation-stale">{{ stale(o.result.applied.staleCalculatedTrips) }}</p> }
              @if (o.result.nextCursor && o.result.applied.remaining === 0) {
                <div class="row"><p>Hay más vehículos por revisar.</p><button type="button" class="btn btn-secondary btn-sm" data-testid="estimation-next" [disabled]="facade.busy() !== null" (click)="facade.nextBatch()">Revisar el siguiente lote</button></div>
              }
            </div>
          </div>
        } @else if (facade.preview(); as p) {
          <dl class="counts" data-testid="estimation-counts">
            <div><dt>Revisados</dt><dd>{{ p.counts.considered }}</dd></div>
            <div><dt>Por estimar</dt><dd data-testid="estimation-to-create">{{ p.counts.toCreate }}</dd></div>
            <div><dt>Con valor propio</dt><dd>{{ p.counts.keptVehicleEfficiency }}</dd></div>
            <div><dt>Sin referencia</dt><dd>{{ p.counts.rejected }}</dd></div>
          </dl>
          <p class="plan" data-testid="estimation-plan">{{ plan(p.counts) }}</p>
          @if (p.rejectedByReason.length > 0) {
            <ul class="reasons" data-testid="estimation-reasons">
              @for (r of p.rejectedByReason; track r.reason) { <li>{{ r.label }}: {{ plural(r.vehicles, 'vehículo', 'vehículos') }}</li> }
            </ul>
          }
          @if (p.licenceNotice) { <p class="warn" data-testid="estimation-licence">{{ p.licenceNotice }}.</p> }
          @if (p.nextCursor) { <p class="warn" data-testid="estimation-more">Hay más vehículos: este es un lote de hasta {{ p.maxVehicles }}. Al terminar podrás revisar el siguiente.</p> }
        }

        @if (facade.busy() !== null) {
          <div class="busy" role="status" data-testid="estimation-busy"><span>{{ facade.busy() === 'preview' ? 'Revisando los vehículos…' : 'Aplicando la estimación…' }}</span><span class="bar" aria-hidden="true"><i></i></span></div>
        }
        @if (facade.error(); as e) {
          <div class="alert alert-danger" role="alert" data-testid="estimation-error">
            <div class="row"><p>{{ errorText(e) }}</p>
              @if (facade.stale()) { <button type="button" class="btn btn-secondary btn-sm" data-testid="estimation-review-again" [disabled]="facade.busy() !== null" (click)="facade.reviewAgain()">Revisar de nuevo</button> }
              @else if (retryable()) { <button type="button" class="btn btn-secondary btn-sm" data-testid="estimation-retry" [disabled]="facade.busy() !== null" (click)="facade.retry()">Reintentar</button> }
            </div>
          </div>
        }
        <p class="sr-only" role="status" aria-live="polite" data-testid="estimation-live">{{ facade.announcement() }}</p>
      </div>

      <footer class="ft">
        <button type="button" class="btn btn-secondary" data-testid="estimation-close" [disabled]="facade.busy() !== null" (click)="dialog.close()">Cerrar</button>
        @if (!facade.outcome()) {
          <button type="button" class="btn btn-primary" data-testid="estimation-apply" [disabled]="!facade.canApply() || facade.busy() !== null" (click)="facade.apply()">{{ facade.busy() === 'apply' ? 'Aplicando…' : 'Aplicar' }}</button>
        }
      </footer>
    </dialog>
  `,
})
export class EfficiencyEstimationDialogComponent {
  protected readonly facade = inject(EfficiencyEstimationFacade);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  readonly closed = output();

  /** «Reintentar» solo donde repetir lo mismo tiene sentido: hay una carga procesándose o no hubo conexión. */
  protected readonly retryable = computed(() => ['COMPANY_BUSY', 'EFFICIENCY_APPLY_TOO_LARGE'].includes(this.facade.error()?.code ?? '') || this.facade.error()?.kind === 'network');

  protected readonly theoretical = ESTIMATE_THEORETICAL;
  protected readonly plan = estimatePlanText;
  protected readonly resultText = estimateResultText;
  protected readonly applied = appliedText;
  protected readonly remaining = remainingText;
  protected readonly stalledText = STALLED_TEXT;
  protected readonly stale = staleText;
  protected readonly plural = plural;
  protected readonly errorText = estimateErrorText;

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;

      // showModal() mueve el foco al diálogo; al cerrarse el navegador lo devuelve a quien lo abrió.
      if (!dialog.open) dialog.showModal();
    });
    // Al llegar la vista previa o el resultado el foco va al título: quien usa lector de pantalla oye dónde está.
    effect(() => {
      this.facade.outcome();

      untracked(() => queueMicrotask(() => this.title().nativeElement.focus()));
    });
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
