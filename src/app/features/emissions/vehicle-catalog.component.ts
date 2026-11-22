import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FreightVehicle } from '../../domain/models/emissions';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { CardHeadComponent } from './card-head.component';
import { EmissionsFacade } from './emissions.facade';
import { GlyphComponent } from './glyph.component';
import { VehicleCardComponent } from './vehicle-card.component';
import { VehicleDetailComponent } from './vehicle-detail.component';
import { VehicleTableComponent } from './vehicle-table.component';

/** Cuántos vehículos se destacan cuando el servidor no marca ninguno como `featured`. */
const FALLBACK_COUNT = 5;

/** Tarjeta «Tipos de vehículos de carga»: una fila con los vehículos destacados, el detalle de cada uno y la tabla completa en un diálogo. */
@Component({
  selector: 'app-vehicle-catalog',
  imports: [ResourceStateComponent, CardHeadComponent, GlyphComponent, VehicleCardComponent, VehicleDetailComponent, VehicleTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; }
    .full { white-space: nowrap; }
    section { display: flex; flex-direction: column; height: 100%; padding: clamp(10px, 1.6vh, 16px) clamp(12px, 1.3vw, 18px); border-radius: 16px; }
    .row { flex: 0 0 auto; align-items: stretch; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: clamp(8px, 1vw, 12px); margin: clamp(6px, 1vh, 10px) 0 0; padding: 4px 0 6px; list-style: none; }
    .row > li { display: flex; min-width: 0; }
    .row > li > app-vehicle-card { flex: 1 1 auto; }
    @media (max-width: 1199px) { .row { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 767px) {
      .row { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: minmax(200px, 72%); overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 6px; }
      .row > li { scroll-snap-align: start; }
    }
  `],
  template: `
    <section class="card" aria-labelledby="vehicles-title" data-testid="section-vehicles">
      <app-card-head icon="truck" titleId="vehicles-title" title="Tipos de vehículos de carga" [subtitle]="subtitle()">
        <button type="button" class="btn btn-secondary btn-sm full" data-testid="open-table" [disabled]="!facade.vehicles.data()" (click)="openTable($event)"><app-glyph name="table" />Ver tabla completa</button>
      </app-card-head>
      <app-resource-state [fill]="true" [status]="facade.vehicles.status()" [error]="facade.vehicles.error()" (retry)="facade.loadVehicles()">
        @if (facade.vehicles.data(); as catalog) {
          <ul class="row" aria-label="Vehículos de carga destacados">
            @for (v of featured(); track v.code) {
              <li><app-vehicle-card [vehicle]="v" [selected]="selected()?.code === v.code" (chosen)="open(v, $event)" /></li>
            }
          </ul>
          @if (tableOpen()) { <app-vehicle-table [vehicles]="catalog.items" [regulation]="catalog.regulation" [guide]="catalog.codeGuide" (closed)="closeTable()" (chosen)="open($event.vehicle, $event.event)" /> }
          @if (selected(); as vehicle) { <app-vehicle-detail [vehicle]="vehicle" [catalog]="catalog" (closed)="close()" /> }
        }
      </app-resource-state>
    </section>
  `,
})
export class VehicleCatalogComponent {
  protected readonly facade = inject(EmissionsFacade);
  protected readonly selected = signal<FreightVehicle | null>(null);
  protected readonly tableOpen = signal(false);
  private opener: HTMLElement | null = null;
  private tableOpener: HTMLElement | null = null;

  protected readonly featured = computed(() => {
    const items = this.facade.vehicles.data()?.items ?? [];
    const marked = items.filter((v) => v.featured);

    return marked.length > 0 ? marked : items.slice(0, FALLBACK_COUNT);
  });
  protected readonly subtitle = computed(() => {
    const regulation = this.facade.vehicles.data()?.regulation;
    const name = regulation ? (regulation.number ? `la Resolución ${regulation.number}` : regulation.name) : 'la norma vigente';

    return `Algunas configuraciones según ${name}. Consulta la tabla completa para ver todas.`;
  });

  protected open(vehicle: FreightVehicle, event: Event): void {
    this.opener = event.currentTarget instanceof HTMLElement ? event.currentTarget : event.target instanceof HTMLElement ? event.target : null;
    this.selected.set(vehicle);
  }

  protected close(): void {
    this.selected.set(null);
    this.opener?.focus();
    this.opener = null;
  }

  protected openTable(event: Event): void {
    this.tableOpener = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.tableOpen.set(true);
  }

  protected closeTable(): void {
    this.tableOpen.set(false);
    this.tableOpener?.focus();
    this.tableOpener = null;
  }
}
