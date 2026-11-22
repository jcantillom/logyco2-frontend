import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { reloadOnContextChange } from '../../core/org/organization-context';
import { Vehicle, VehicleDetail } from '../../domain/models/vehicles';
import { PageHeroComponent } from '../../shared/ui/page-hero.component';
import { VehicleDetailComponent } from './vehicle-detail.component';
import { VehicleFormComponent } from './vehicle-form.component';
import { VehicleInventoryComponent } from './vehicle-inventory.component';
import { VehiclesFacade } from './vehicles.facade';

/** «Mis vehículos»: inventario de la empresa activa, con detalle, registro manual y edición. */
@Component({
  selector: 'app-vehicles',
  imports: [PageHeroComponent, VehicleInventoryComponent, VehicleDetailComponent, VehicleFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: block; }'],
  template: `
    <div class="page">
      <app-page-hero title="Mis vehículos" subtitle="Los vehículos de tu empresa y sus características." />

      <app-vehicle-inventory [source]="facade" (view)="openDetail($event.event, $event.vehicle)" (register)="openForm($event, null)" />
    </div>

    @if (selected(); as vehicle) {
      <app-vehicle-detail [vehicle]="vehicle" (closed)="closeDetail()" (edit)="editFrom($event)" />
    }
    @if (form(); as f) {
      <app-vehicle-form [vehicle]="f.vehicle" (closed)="closeForm()" />
    }
  `,
})
export class VehiclesComponent {
  protected readonly facade = inject(VehiclesFacade);

  protected readonly selected = signal<Vehicle | null>(null);
  protected readonly form = signal<{ readonly vehicle: VehicleDetail | null } | null>(null);

  /** Quien abrió el diálogo recupera el foco al cerrarse (también al pasar del detalle a la edición). */
  private opener: HTMLElement | null = null;

  constructor() {
    reloadOnContextChange(() => {
      this.facade.loadSummary();
      this.facade.loadList();
      this.facade.loadCatalog();
      this.selected.set(null);
      this.form.set(null);
    });
  }

  protected openDetail(event: Event, vehicle: Vehicle): void {
    this.opener = event.currentTarget as HTMLElement;
    this.selected.set(vehicle);
  }

  protected closeDetail(): void {
    this.selected.set(null);
    this.restoreFocus();
  }

  protected openForm(event: Event, vehicle: VehicleDetail | null): void {
    this.opener = event.currentTarget as HTMLElement;
    this.form.set({ vehicle });
  }

  /** De «Editar» en el detalle: se cierra el detalle y se abre el formulario sin perder a quién devolver el foco. */
  protected editFrom(vehicle: VehicleDetail): void {
    this.selected.set(null);
    this.form.set({ vehicle });
  }

  protected closeForm(): void {
    this.form.set(null);
    this.restoreFocus();
  }

  private restoreFocus(): void {
    queueMicrotask(() => this.opener?.isConnected && this.opener.focus());
  }
}
