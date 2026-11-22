import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EmissionsFacade } from './emissions.facade';
import { FactorCardComponent } from './factor-card.component';
import { FormulasComponent } from './formulas.component';
import { KeyConceptsComponent } from './key-concepts.component';
import { SimulatorComponent } from './simulator.component';
import { VehicleCatalogComponent } from './vehicle-catalog.component';

/** Guía de cálculo y vehículos de carga: un solo tablero con todas las tarjetas visibles (vehículos; fórmulas y factor; calculadora y conceptos). */
@Component({
  selector: 'app-emissions',
  imports: [VehicleCatalogComponent, FormulasComponent, FactorCardComponent, SimulatorComponent, KeyConceptsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; }
    .page { gap: clamp(8px, 1.4vh, 16px); }
    .head h1 { margin: 0; font-size: clamp(1.3rem, 2.2vw, 1.8rem); line-height: 1.2; letter-spacing: -0.03em; color: var(--c-head); }
    .head p { margin: 2px 0 0; color: var(--c-mu); font-size: clamp(0.8rem, 0.9vw, 0.95rem); }
    .rows { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; align-items: stretch; }
    @media (max-width: 1199px) { .rows { grid-template-columns: minmax(0, 1fr); } }
    /* Pantalla completa sin scroll de página: ventana ancha y alta. El encabezado y la fila de vehículos toman el alto de su contenido y las dos filas inferiores se reparten el resto; si el
       contenido no cabe (ventana corta), la fila crece y la página se desplaza como en el diseño apilado. */
    @media (min-width: 1200px) and (min-height: 700px) {
      :host { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
      .page { flex: 1 1 auto; min-height: 0; display: grid; grid-template-rows: auto auto repeat(2, minmax(min-content, 1fr)); }
      .rows { min-height: 0; }
      .head { min-height: min-content; }
    }
  `],
  template: `
    <div class="page">
      <header class="head">
        <h1>Guía de cálculo y vehículos de carga</h1>
        <p>Conoce los tipos de camiones y cómo LoGyCO₂ calcula las emisiones de CO₂ del transporte de carga</p>
      </header>

      <app-vehicle-catalog />
      <div class="rows">
        <app-formulas />
        <app-factor-card />
      </div>
      <div class="rows">
        <app-emissions-simulator />
        <app-key-concepts />
      </div>
    </div>
  `,
})
export class EmissionsComponent {
  private readonly facade = inject(EmissionsFacade);

  constructor() {
    this.facade.loadVehicles();
    this.facade.loadFuels();
  }
}
