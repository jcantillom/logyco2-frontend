import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Vehicle } from '../../domain/models/vehicles';
import { VehicleDetailComponent } from '../vehicles/vehicle-detail.component';
import { VehicleInventoryComponent } from '../vehicles/vehicle-inventory.component';
import { PlatformOrganizationVehiclesFacade } from './platform-organization-vehicles.facade';

/** Pestaña «Vehículos» del detalle de una empresa (Super Admin): el inventario de esa empresa, solo para supervisión. */
@Component({
  selector: 'app-platform-organization-vehicles',
  imports: [VehicleInventoryComponent, VehicleDetailComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: flex; flex-direction: column; gap: 16px; }
      .banner { display: flex; align-items: center; gap: 10px; margin: 0; padding: 10px 14px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-ok-soft); color: var(--c-head); font-size: 0.88rem; }
      .banner svg { width: 18px; height: 18px; flex: none; fill: none; stroke: var(--c-primary); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
    `,
  ],
  template: `
    <p class="banner" data-testid="read-only-banner">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /></svg>
      Vista de solo lectura para supervisión. Cada empresa administra su propio inventario de vehículos.
    </p>
    <app-vehicle-inventory [source]="facade" [readOnly]="true" (view)="open($event.event, $event.vehicle)" />
    @if (selected(); as vehicle) {
      <app-vehicle-detail [vehicle]="vehicle" [source]="facade" [readOnly]="true" (closed)="close()" />
    }
  `,
})
export class PlatformOrganizationVehiclesComponent {
  protected readonly facade = inject(PlatformOrganizationVehiclesFacade);

  /** Empresa cuyo inventario se supervisa. */
  readonly organizationId = input.required<string>();
  protected readonly selected = signal<Vehicle | null>(null);
  private opener: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const id = this.organizationId();

      untracked(() => {
        this.selected.set(null);
        this.facade.open(id);
      });
    });
  }

  protected open(event: Event, vehicle: Vehicle): void {
    this.opener = event.currentTarget as HTMLElement;
    this.selected.set(vehicle);
  }

  protected close(): void {
    this.selected.set(null);
    queueMicrotask(() => this.opener?.isConnected && this.opener.focus());
  }
}
