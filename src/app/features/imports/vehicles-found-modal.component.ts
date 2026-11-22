import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccessPolicy } from '../../core/auth/access-policy';
import { ImportSummary, VehiclesDetected } from '../../domain/models/imports';
import { TruckArtComponent } from '../../shared/ui/truck-art.component';
import { TruckProgressComponent } from '../../shared/ui/truck-progress.component';
import { ImportVehiclesFacade, MAX_DECISION_BATCH } from './import-vehicles.facade';
import { ImportsFacade } from './imports.facade';
import { skippedReasonLabel } from './imports.labels';

type Phase = 'ask' | 'working' | 'done' | 'error';

/** Lo que dura la llegada del camión: durante ese tiempo giran las ruedas; después queda estacionado. */
const ARRIVAL_MS = 1200;

/**
 * Alerta modal que aparece cuando una carga termina y propone vehículos: se anima la llegada de un camión, se ofrece registrar los
 * nuevos con un clic y se muestra el resultado. Quien no tiene `vehicles:manage` solo ve el aviso. Los cambios de vehículos ya
 * registrados se revisan uno por uno en la revisión de la carga (`review`).
 */
@Component({
  selector: 'app-vehicles-found-modal',
  imports: [RouterLink, TruckArtComponent, TruckProgressComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      dialog.vf { border: 0; padding: 0; border-radius: 22px; left: var(--dlg-left, 0px); width: min(460px, calc(100vw - var(--dlg-left, 0px) - 32px)); background: var(--c-sf); color: var(--c-head); box-shadow: 0 24px 60px color-mix(in srgb, var(--c-head) 30%, transparent); overflow: hidden; animation: pop-in 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2); }
      dialog.vf::backdrop { background: color-mix(in srgb, var(--c-head) 45%, transparent); backdrop-filter: blur(2px); }
      .scene { position: relative; height: 150px; overflow: hidden; container-type: inline-size; background: linear-gradient(180deg, var(--c-ok-soft), var(--c-sf)); }
      .road { position: absolute; left: 0; right: 0; bottom: 26px; height: 3px; background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--c-head) 35%, transparent) 0 16px, transparent 16px 32px); }
      .vehicle { position: absolute; left: calc(50% - 62px); bottom: 28px; width: 124px; animation: arrive 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
      .marker { position: absolute; left: calc(50% - 22px); top: 14px; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: var(--c-primary); color: var(--c-sf); animation: drop 0.5s 1.1s cubic-bezier(0.2, 0.9, 0.3, 1.3) both, bob 2.2s 1.7s ease-in-out infinite; }
      .marker svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
      .done .marker { animation: pop 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.4) both; }
      .done .marker::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 2px solid var(--c-primary); animation: ring 0.9s 0.2s ease-out both; }
      .body { padding: 22px 28px 26px; text-align: center; display: grid; gap: 12px; }
      h2 { margin: 0; font-size: 1.4rem; line-height: 1.25; }
      p { margin: 0; color: var(--c-text2); font-size: 1rem; line-height: 1.5; }
      .chips { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
      .chip { padding: 5px 12px; border-radius: 999px; background: var(--c-ok-soft); color: var(--c-head); font-size: 0.9rem; font-weight: 600; }
      .chip.soft { background: var(--c-s2); color: var(--c-text2); }
      .actions { display: grid; gap: 8px; margin-top: 6px; }
      .actions .btn { justify-content: center; font-size: 1rem; padding: 12px 18px; }
      .link { background: none; border: 0; color: var(--c-mu); font: inherit; cursor: pointer; padding: 8px; border-radius: 8px; }
      .link:hover { color: var(--c-head); }
      .link:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .err { color: var(--c-danger); font-weight: 600; }
      .work { padding: 8px 4px 0; }
      @keyframes pop-in { from { opacity: 0; transform: translateY(14px) scale(0.96); } }
      @keyframes arrive { from { transform: translateX(-70cqw); } }
      @keyframes drop { from { opacity: 0; transform: translateY(-26px) scale(0.5); } }
      @keyframes bob { 50% { transform: translateY(-5px); } }
      @keyframes pop { from { opacity: 0; transform: scale(0.3); } }
      @keyframes ring { from { opacity: 0.9; transform: scale(0.8); } to { opacity: 0; transform: scale(1.7); } }
      @media (prefers-reduced-motion: reduce) {
        dialog.vf, .vehicle, .marker, .done .marker, .done .marker::after { animation: none; }
        .done .marker::after { display: none; }
      }
    `,
  ],
  template: `
    <dialog #dialog class="vf" aria-labelledby="vf-title" aria-describedby="vf-text" (cancel)="onCancel($event)" (close)="closed.emit()" data-testid="vehicles-modal">
      <div class="scene" [class.done]="phase() === 'done'" aria-hidden="true">
        <div class="road"></div>
        <div class="vehicle"><app-truck-art [spinning]="arriving()" /></div>
        <span class="marker">
          @if (phase() === 'done') { <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> }
          @else { <svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg> }
        </span>
      </div>

      <div class="body" aria-live="polite">
        <h2 id="vf-title">{{ title() }}</h2>
        @switch (phase()) {
          @case ('working') {
            <p id="vf-text">Estamos registrando tus vehículos…</p>
            <div class="work"><app-truck-progress label="Registrando vehículos" /></div>
          }
          @case ('error') {
            <p id="vf-text" class="err" role="alert" data-testid="modal-error">{{ errorMessage() }}</p>
            <div class="actions">
              <button type="button" class="btn btn-primary" data-testid="modal-retry" (click)="register()">Reintentar</button>
              <button type="button" class="link" (click)="close()">Cerrar</button>
            </div>
          }
          @case ('done') {
            <p id="vf-text" data-testid="modal-done-text">{{ doneText() }}</p>
            @if (reasons().length > 0) {
              <p data-testid="modal-skipped">{{ reasons().join(' · ') }}</p>
            }
            <div class="actions">
              @if (counts().changed > 0) {
                <button type="button" class="btn btn-primary" data-testid="modal-review-changes" (click)="review.emit()">Revisar {{ counts().changed }} {{ counts().changed === 1 ? 'cambio' : 'cambios' }}</button>
                <a class="btn btn-secondary" routerLink="/vehiculos" data-testid="modal-go-vehicles" (click)="close()">Ver mis vehículos</a>
              } @else {
                <a class="btn btn-primary" routerLink="/vehiculos" data-testid="modal-go-vehicles" (click)="close()">Ver mis vehículos</a>
              }
              <button type="button" class="link" data-testid="modal-close" (click)="close()">Cerrar</button>
            </div>
          }
          @default {
            <p id="vf-text" data-testid="modal-text">{{ askText() }}</p>
            <div class="chips">
              @if (counts().new > 0) { <span class="chip">{{ counts().new }} {{ counts().new === 1 ? 'nuevo' : 'nuevos' }}</span> }
              @if (counts().changed > 0) { <span class="chip soft">{{ counts().changed }} con cambios</span> }
            </div>
            <div class="actions">
              @if (!canManage()) {
                <button type="button" class="btn btn-primary" data-testid="modal-view" (click)="review.emit()">Ver vehículos</button>
                <button type="button" class="link" data-testid="modal-close" (click)="close()">Entendido</button>
              } @else if (counts().new > 0) {
                <button type="button" class="btn btn-primary" data-testid="modal-register" (click)="register()">Registrar {{ counts().new }} {{ counts().new === 1 ? 'vehículo' : 'vehículos' }}</button>
                <button type="button" class="btn btn-secondary" data-testid="modal-review" (click)="review.emit()">Revisar uno por uno</button>
                <button type="button" class="link" data-testid="modal-close" (click)="close()">Más tarde</button>
              } @else {
                <button type="button" class="btn btn-primary" data-testid="modal-review-changes" (click)="review.emit()">Revisar cambios</button>
                <button type="button" class="link" data-testid="modal-close" (click)="close()">Más tarde</button>
              }
            </div>
          }
        }
      </div>
    </dialog>
  `,
})
export class VehiclesFoundModalComponent {
  private readonly vehicles = inject(ImportVehiclesFacade);
  private readonly imports = inject(ImportsFacade);
  private readonly access = inject(AccessPolicy);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly summary = input.required<ImportSummary>();
  /** Cierra el aviso (con «Más tarde», «Cerrar» o Escape). */
  readonly closed = output();
  /** Pide abrir la revisión de la carga en su sección de vehículos. */
  readonly review = output();

  protected readonly phase = signal<Phase>('ask');
  protected readonly arriving = signal(true);
  protected readonly canManage = computed(() => this.access.can('vehicles:manage'));
  protected readonly counts = computed<VehiclesDetected>(() => this.summary().vehiclesDetected ?? { new: 0, changed: 0, unchanged: 0, pendingDecision: 0 });
  protected readonly errorMessage = computed(() => this.vehicles.decisionError()?.message ?? 'No se pudieron registrar los vehículos.');
  protected readonly reasons = computed(() => this.vehicles.result()?.skippedReasons.map((r) => `${skippedReasonLabel(r.code)}: ${r.rows}`) ?? []);
  protected readonly title = computed(() => {
    const { new: added, changed } = this.counts();
    const accepted = this.vehicles.result()?.accepted ?? 0;

    switch (this.phase()) {
      case 'working': return 'Registrando vehículos';
      case 'error': return 'No pudimos registrarlos';
      case 'done': return accepted > 0 ? `¡Listo! ${accepted} ${accepted === 1 ? 'vehículo registrado' : 'vehículos registrados'}` : 'No se registró ningún vehículo';
      default: return added > 0 ? `Encontramos ${added} ${added === 1 ? 'vehículo nuevo' : 'vehículos nuevos'}` : `${changed} ${changed === 1 ? 'vehículo cambió sus datos' : 'vehículos cambiaron sus datos'}`;
    }
  });
  protected readonly askText = computed(() => {
    if (!this.canManage()) return 'Un administrador de tu empresa debe aprobar su registro.';

    return this.counts().new > 0 ? `«${this.summary().fileName}» trae vehículos que aún no están en tu inventario.` : 'Revisa lo que cambió respecto a tu inventario.';
  });
  protected readonly doneText = computed(() => ((this.vehicles.result()?.accepted ?? 0) > 0 ? 'Ya aparecen en Mis vehículos.' : 'Los vehículos ya estaban registrados o ya tenían una decisión.'));

  constructor() {
    const timer = setTimeout(() => this.arriving.set(false), ARRIVAL_MS);

    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    afterNextRender(() => {
      const element = this.dialog().nativeElement;

      if (!element.open) element.showModal();
    });
  }

  /** Registra los vehículos nuevos; con más de los que admite una petición se decide por ids en lotes. */
  protected register(): void {
    if (this.phase() === 'working') return;

    const id = this.summary().id;
    const added = this.counts().new;
    const call$ = added > MAX_DECISION_BATCH ? this.vehicles.decideInBatches(id, 'NEW') : this.vehicles.decide(id, { decision: 'ACCEPT', kind: 'NEW' });

    this.phase.set('working');
    call$.subscribe({
      next: () => {
        this.phase.set('done');
        this.imports.reloadImport(id);
      },
      error: () => this.phase.set('error'),
    });
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  /** Escape cierra el aviso, salvo mientras se registra (no se interrumpe a medias). */
  protected onCancel(event: Event): void {
    if (this.phase() === 'working') event.preventDefault();
  }
}
