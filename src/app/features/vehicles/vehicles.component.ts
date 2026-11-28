import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { reloadOnContextChange } from '../../core/org/organization-context';
import { Vehicle, VehicleDetail } from '../../domain/models/vehicles';
import { PageHeroComponent } from '../../shared/ui/page-hero.component';
import { EfficiencyEstimationDialogComponent } from './efficiency-estimation-dialog.component';
import { EfficiencyEstimationFacade } from './efficiency-estimation.facade';
import { EfficiencyFichaDialogComponent } from './efficiency-ficha-dialog.component';
import { EfficiencyFichaFacade } from './efficiency-ficha.facade';
import { VehicleDetailComponent } from './vehicle-detail.component';
import { VehicleEfficiencyDialogComponent } from './vehicle-efficiency-dialog.component';
import { VehicleFormComponent } from './vehicle-form.component';
import { VehicleInventoryComponent } from './vehicle-inventory.component';
import { VehiclesFacade } from './vehicles.facade';

/** «Mis vehículos»: inventario de la empresa activa, con detalle, registro manual y edición. */
@Component({
  selector: 'app-vehicles',
  imports: [PageHeroComponent, VehicleInventoryComponent, VehicleDetailComponent, VehicleFormComponent, VehicleEfficiencyDialogComponent, EfficiencyFichaDialogComponent, EfficiencyEstimationDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: block; }'],
  template: `
    <div class="page">
      <app-page-hero title="Mis vehículos" subtitle="Los vehículos de tu empresa y sus características." />

      <app-vehicle-inventory [source]="facade" (view)="openDetail($event.event, $event.vehicle)" (register)="openForm($event, null)" (efficiency)="openEfficiency($event.event, $event.vehicle)" (ficha)="openFicha($event)" [canEstimate]="estimation.canEstimate()" [estimateOff]="estimation.modeOff()" (estimate)="openEstimation($event)" />
    </div>

    @if (selected(); as vehicle) {
      <app-vehicle-detail [vehicle]="vehicle" (closed)="closeDetail()" (edit)="editFrom($event)" />
    }
    @if (form(); as f) {
      <app-vehicle-form [vehicle]="f.vehicle" (closed)="closeForm()" />
    }
    @if (efficiency(); as vehicle) {
      <app-vehicle-efficiency-dialog [vehicle]="vehicle" (closed)="closeEfficiency()" />
    }
    @if (fichaFacade.open()) {
      <app-efficiency-ficha-dialog (closed)="restoreFocus()" />
    }
    @if (estimation.open()) {
      <app-efficiency-estimation-dialog (closed)="restoreFocus()" />
    }
  `,
})
export class VehiclesComponent {
  protected readonly facade = inject(VehiclesFacade);
  protected readonly fichaFacade = inject(EfficiencyFichaFacade);
  protected readonly estimation = inject(EfficiencyEstimationFacade);

  protected readonly selected = signal<Vehicle | null>(null);
  protected readonly form = signal<{ readonly vehicle: VehicleDetail | null } | null>(null);
  protected readonly efficiency = signal<Vehicle | null>(null);

  /** Quien abrió el diálogo recupera el foco al cerrarse (también al pasar del detalle a la edición). */
  private opener: HTMLElement | null = null;

  constructor() {
    // El servidor solo dice si la estimación está encendida junto con el rendimiento de un vehículo: se pregunta con el primero de la lista.
    effect(() => {
      const first = this.facade.list.data()?.items[0];

      if (first) untracked(() => this.estimation.probe(first.id));
    });

    reloadOnContextChange(() => {
      this.facade.loadSummary();
      this.facade.loadList();
      this.facade.loadCatalog();
      this.selected.set(null);
      this.form.set(null);
      this.efficiency.set(null);
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

  protected openEfficiency(event: Event, vehicle: Vehicle): void {
    this.opener = event.currentTarget as HTMLElement;
    this.efficiency.set(vehicle);
  }

  protected closeEfficiency(): void {
    this.efficiency.set(null);
    this.restoreFocus();
  }

  protected openFicha(event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.fichaFacade.show();
  }

  protected openEstimation(event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.estimation.show();
  }

  protected closeForm(): void {
    this.form.set(null);
    this.restoreFocus();
  }

  protected restoreFocus(): void {
    queueMicrotask(() => this.opener?.isConnected && this.opener.focus());
  }
}
