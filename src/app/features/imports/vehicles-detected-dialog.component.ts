import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { VehiclesDetected } from '../../domain/models/imports';
import { CloseOnBackdropDirective } from '../../shared/ui/close-on-backdrop.directive';
import { ImportVehiclesSectionComponent } from './import-vehicles-section.component';

/**
 * Ventana propia de «Vehículos detectados» de una carga: la lista de nuevos y con cambios y las decisiones del administrador.
 * Es independiente de la revisión del archivo: se abre desde el aviso, la tarjeta de seguimiento, el historial o el enlace de un aviso.
 */
@Component({
  selector: 'app-vehicles-detected-dialog',
  imports: [CloseOnBackdropDirective, ImportVehiclesSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: contents; }
      dialog.vd { width: min(780px, calc(100vw - var(--dlg-left, 0px) - 24px)); max-height: calc(100dvh - 24px); border-radius: 18px; overflow: hidden; }
      dialog.vd[open] { display: flex; flex-direction: column; }
      .head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 24px; background: linear-gradient(180deg, var(--c-ok-soft), var(--c-sf)); border-bottom: 1px solid var(--c-bd); }
      .head h2 { margin: 0; font-size: 1.25rem; color: var(--c-head); }
      .head p { margin: 2px 0 0; color: var(--c-mu); font-size: 0.88rem; overflow-wrap: anywhere; }
      .x { all: unset; box-sizing: border-box; display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 10px; color: var(--c-text2); cursor: pointer; }
      .x:hover { background: var(--c-s2); }
      .x:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .x svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
      .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px 24px 22px; }
      .foot { flex: none; display: flex; justify-content: flex-end; padding: 14px 24px; background: var(--c-s2); border-top: 1px solid var(--c-bd); }
    `,
  ],
  template: `
    <dialog #dialog appCloseOnBackdrop class="dialog vd" aria-labelledby="vd-title" (close)="closed.emit()" data-testid="vehicles-dialog">
      <header class="head">
        <div>
          <h2 id="vd-title">Vehículos detectados</h2>
          <p>{{ fileName() }}</p>
        </div>
        <button type="button" class="x" aria-label="Cerrar" data-testid="vehicles-dialog-x" (click)="close()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </header>
      <div class="body"><app-import-vehicles-section [importId]="importId()" [counts]="counts()" /></div>
      <footer class="foot"><button type="button" class="btn btn-secondary" data-testid="vehicles-dialog-close" (click)="close()">Cerrar</button></footer>
    </dialog>
  `,
})
export class VehiclesDetectedDialogComponent {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly importId = input.required<string>();
  readonly fileName = input.required<string>();
  /** Conteos vigentes de la carga: se renuevan solos al decidir. */
  readonly counts = input.required<VehiclesDetected>();
  readonly closed = output();

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;

      // showModal() mueve el foco al diálogo; al cerrarse el navegador lo devuelve a quien lo abrió.
      if (!element.open) element.showModal();
    });
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }
}
