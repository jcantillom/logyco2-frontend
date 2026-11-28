import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ResourceStatus } from '../../core/org/scoped-resource';
import { FootprintByFuel } from '../../domain/models/footprint';
import { ShareDonutComponent } from '../../shared/ui/charts/share-donut.component';
import { HEADER_CHIP_STYLES } from '../../shared/ui/icon-chip.styles';
import { CHART_CARD_STYLES } from './chart-card.styles';
import { NO_CALCULATION, NO_PERIOD_DATA, fuelSlices } from './emissions-charts.view';

const DROP = 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z';

/**
 * Tarjeta «Emisiones por tipo de combustible» (dona con leyenda). Solo cuenta los combustibles del periodo elegido y el total del centro es el de ese
 * periodo. Presentacional: `byFuel` es `null` si aún no se pidió la huella (estado pendiente, sin dibujar nada); con huella pero sin viajes calculados dice por qué
 * (`emptyText`) o «No hay cálculo para este periodo». Un resultado parcial lleva el marcador «Parcial».
 */
@Component({
  selector: 'app-fuel-share-card',
  imports: [ShareDonutComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [HEADER_CHIP_STYLES, CHART_CARD_STYLES],
  template: `
    <section class="cc" aria-labelledby="fc-title" data-testid="fuel-share-card">
      <header class="hdr">
        <span class="ico chip" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon" /></svg></span>
        <div class="ht"><h2 id="fc-title">Emisiones por tipo de combustible</h2><p>Participación de cada combustible en el periodo elegido</p></div>
        @if (periodLabel(); as label) { <span class="pchip" data-testid="chart-period">{{ label }}</span> }
        @if (partial()) { <span class="pchip partial" data-testid="chart-partial" [attr.title]="partialHint()">Parcial</span> }
        @if (partialHint()) { <span class="sr-only" data-testid="chart-partial-hint">{{ partialHint() }}</span> }
      </header>
      <div class="body">
        @switch (status()) {
          @case ('error') { <p class="err" role="alert" data-testid="chart-error">No se pudo cargar. <button type="button" (click)="retry.emit()">Reintentar</button></p> }
          @case ('ready') {
            @if (slices().length > 0) {
              <app-share-donut [slices]="slices()" unit="kg CO₂" title="Emisiones por tipo de combustible" />
            } @else {
              <div class="donut-frame" data-testid="chart-empty">
                <svg class="ring" viewBox="0 0 112 112" aria-hidden="true" data-testid="donut-frame">
                  <circle class="track" cx="56" cy="56" r="40" />
                  <circle class="edge" cx="56" cy="56" r="47" />
                  <circle class="edge" cx="56" cy="56" r="33" />
                  <text class="dash" x="56" y="57">—</text>
                  <text class="sub" x="56" y="70">Sin cálculo</text>
                </svg>
                <div class="legend-frame">
                  <div class="lines" aria-hidden="true" data-testid="legend-frame"><b style="width: 82%"></b><b style="width: 64%"></b><b style="width: 48%"></b></div>
                  <p class="note" role="status" data-testid="chart-message">{{ byFuel() === null ? pendingText : (emptyText() ?? noPeriodText) }}</p>
                </div>
              </div>
            }
          }
          @default { <span class="skeleton" style="height: 150px" role="status" aria-busy="true" data-testid="chart-skeleton"><span class="sr-only">Cargando…</span></span> }
        }
      </div>
    </section>
  `,
})
export class FuelShareCardComponent {
  /** Huella por combustible del periodo elegido; `null` mientras no se haya pedido. */
  readonly byFuel = input<FootprintByFuel | null>(null);
  readonly periodLabel = input<string | null>(null);
  /** El resultado es parcial (hay viajes sin calcular): se marca junto al periodo. */
  readonly partial = input(false);
  /** Aclaración del resultado parcial (cobertura por viajes), para `title` y lectores de pantalla. */
  readonly partialHint = input<string | null>(null);
  /** Texto del estado vacío cuando hay huella pero ningún viaje calculado (explica por qué); `null` = el genérico. */
  readonly emptyText = input<string | null>(null);
  readonly status = input<ResourceStatus>('ready');
  readonly retry = output();

  protected readonly icon = DROP;
  protected readonly pendingText = NO_CALCULATION;
  protected readonly noPeriodText = NO_PERIOD_DATA;
  protected readonly slices = computed(() => fuelSlices(this.byFuel()));
}
