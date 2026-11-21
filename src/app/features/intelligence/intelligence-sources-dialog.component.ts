import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { PANEL_STYLES } from './intelligence.styles';
import { IntelligenceFacade } from './intelligence.facade';
import { statusLabel, statusOf } from './intelligence.labels';

/** Diálogo «Fuentes y actualización»: estado, frecuencia y licencia de cada fuente de LoGyCO₂ Intelligence. */
@Component({
  selector: 'app-intelligence-sources-dialog',
  imports: [DatePipe, ResourceStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    PANEL_STYLES,
    `
      :host { display: contents; }
      dialog table { min-width: 640px; }
    `,
  ],
  template: `
    <dialog #sourcesDialog class="dialog dialog-pro" aria-labelledby="sources-title" style="width: min(900px, calc(100vw - 32px))">
      <header class="dp-head">
        <span class="dp-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6zM14 2v6h6M9 15l2 2 4-4" /></svg></span>
        <div><h2 id="sources-title">Fuentes y actualización</h2><p>Cada indicador conserva su fuente, su fecha de publicación y la de adquisición.</p></div>
      </header>
      <div class="dialog-body" data-testid="sources" style="overflow-x: auto">
        @if (facade.sharedError()) { <p class="nodata"><strong>No disponible</strong>Consulta el aviso superior.</p> } @else {
        <app-resource-state [status]="facade.sources.status()" [error]="facade.sources.error()" (retry)="facade.loadAll()">
          <table class="table">
            <caption class="sr-only">Fuentes de LoGyCO₂ Intelligence</caption>
            <thead><tr><th scope="col">Fuente</th><th scope="col">Adquisición</th><th scope="col">Frecuencia</th><th scope="col">Último éxito</th><th scope="col">Estado</th><th scope="col">Licencia</th></tr></thead>
            <tbody>
              @for (s of facade.sources.data() ?? []; track s.code) {
                <tr [attr.data-source]="s.code">
                  <th scope="row" style="text-transform: none; letter-spacing: 0; font-size: inherit; background: transparent"><a [href]="s.url" target="_blank" rel="noopener noreferrer">{{ s.name }}</a><br /><span class="muted small">{{ s.publisher }}</span></th>
                  <td>{{ s.providerAvailable ? 'Automática' : 'Pendiente de fuente automática' }}</td>
                  <td>{{ s.frequency }}</td>
                  <td>{{ s.lastSuccessAt ? (s.lastSuccessAt | date: 'medium') : 'Sin datos aún' }}</td>
                  <td><span class="pill" [class.ok]="statusOf(s) === 'ok'" [class.err]="statusOf(s) === 'err'">{{ statusLabel(s) }}</span></td>
                  <td class="muted small">{{ s.license ?? 'Por confirmar' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </app-resource-state>
        }
      </div>
      <div class="dialog-actions"><button type="button" class="btn btn-primary" (click)="close()">Cerrar</button></div>
    </dialog>
  `,
})
export class IntelligenceSourcesDialogComponent {
  protected readonly facade = inject(IntelligenceFacade);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('sourcesDialog');
  protected readonly statusOf = statusOf;
  protected readonly statusLabel = statusLabel;

  open(): void {
    this.dialog().nativeElement.showModal();
  }
  protected close(): void {
    this.dialog().nativeElement.close();
  }
}
