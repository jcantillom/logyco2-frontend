import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ResourceStatus } from '../../core/org/scoped-resource';
import { FootprintMonthly } from '../../domain/models/footprint';
import { BarChartComponent } from '../../shared/ui/charts/bar-chart.component';
import { HEADER_CHIP_STYLES } from '../../shared/ui/icon-chip.styles';
import { CHART_CARD_STYLES } from './chart-card.styles';
import { NO_CALCULATION, NO_PERIOD_DATA, hasMonthlyData, monthlyBars } from './emissions-charts.view';
import { monthLabel } from '../../domain/models/period';

const BARS = 'M5 20V11M12 20V4M19 20v-6M3 20h18';

/**
 * Tarjeta «Emisiones de CO₂ por mes» (barras con tendencia). Sigue el periodo elegido: el eje X son los meses del periodo (`slots`) y un mes sin dato queda
 * vacío. Presentacional: hoy `monthly` es `null` (no existe el cálculo) y muestra el estado pendiente sin dibujar nada; con cálculo pero sin datos del
 * periodo dice «No hay cálculo para este periodo».
 */
@Component({
  selector: 'app-monthly-emissions-card',
  imports: [BarChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [HEADER_CHIP_STYLES, CHART_CARD_STYLES],
  template: `
    <section class="cc" aria-labelledby="mc-title" data-testid="monthly-card">
      <header class="hdr">
        <span class="ico chip" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon" /></svg></span>
        <div class="ht"><h2 id="mc-title">Emisiones de CO₂ por mes</h2><p>Kg de CO₂ por mes del periodo elegido</p></div>
        @if (periodLabel(); as label) { <span class="pchip" data-testid="chart-period">{{ label }}</span> }
      </header>
      <div class="body">
        @switch (status()) {
          @case ('error') { <p class="err" role="alert" data-testid="chart-error">No se pudo cargar. <button type="button" (click)="retry.emit()">Reintentar</button></p> }
          @case ('ready') {
            @if (state() === 'chart') {
              <app-bar-chart [data]="bars()" title="Emisiones por mes" seriesName="Emisiones (kg CO₂)" trendName="Tendencia" />
            } @else {
              <div class="frame" data-testid="chart-empty">
                <div class="plot" aria-hidden="true" data-testid="bar-frame">
                  <i style="top: 20%"></i><i style="top: 50%"></i><i style="top: 80%"></i>
                  @if (slots().length > 0 && slots().length <= 12) { <div class="slots">@for (slot of slots(); track slot) { <span data-testid="frame-slot">—</span> }</div> }
                </div>
                @if (slotLabels().length > 0) { <div class="months" [class.all]="slots().length <= 6" aria-hidden="true" data-testid="frame-months">@for (label of slotLabels(); track $index) { <span>{{ label }}</span> }</div> }
                <p class="note" role="status" data-testid="chart-message">{{ state() === 'pending' ? pendingText : noPeriodText }}</p>
              </div>
            }
          }
          @default { <span class="skeleton" style="height: 120px" role="status" aria-busy="true" data-testid="chart-skeleton"><span class="sr-only">Cargando…</span></span> }
        }
      </div>
    </section>
  `,
})
export class MonthlyEmissionsCardComponent {
  /** Huella por mes del periodo elegido; `null` mientras no exista el cálculo. */
  readonly monthly = input<FootprintMonthly | null>(null);
  /** Meses del periodo elegido (`YYYY-MM`), uno por ranura del eje X. */
  readonly slots = input<readonly string[]>([]);
  readonly periodLabel = input<string | null>(null);
  readonly status = input<ResourceStatus>('ready');
  readonly retry = output();

  protected readonly icon = BARS;
  protected readonly pendingText = NO_CALCULATION;
  protected readonly noPeriodText = NO_PERIOD_DATA;
  protected readonly bars = computed(() => monthlyBars(this.monthly(), this.slots()));
  /** Etiquetas de mes del marco vacío (solo las del periodo elegido): todas si son pocas, y el primero y el último si son muchas. */
  protected readonly slotLabels = computed(() => {
    const labels = this.slots().map((slot) => monthLabel(slot) ?? slot);

    return labels.length <= 6 ? labels : [labels[0], labels[labels.length - 1]];
  });
  protected readonly state = computed<'pending' | 'empty' | 'chart'>(() => (this.monthly() === null ? 'pending' : hasMonthlyData(this.bars()) ? 'chart' : 'empty'));
}
