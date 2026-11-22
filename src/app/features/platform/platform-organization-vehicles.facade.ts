import { Injectable, inject, signal } from '@angular/core';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { ScopedResource } from '../../core/org/scoped-resource';
import { VehicleCatalog } from '../../domain/models/emissions';
import { Page } from '../../domain/models/pagination';
import { Vehicle, VehicleDetail, VehicleFilter, VehicleSummary } from '../../domain/models/vehicles';
import { EmissionsRepository } from '../../domain/repositories/emissions.repositories';
import { PlatformVehiclesRepository } from '../../domain/repositories/vehicles.repositories';
import { VehicleInventory } from '../vehicles/vehicle-inventory';
import { VEHICLES_PAGE_SIZE } from '../vehicles/vehicles.facade';

/**
 * Inventario de vehículos de UNA empresa para la consola de plataforma (solo lectura). La empresa la elige la pantalla de detalle
 * (`open`), no la empresa activa: la consola y el espacio de empresa son contextos separados. Cambiar de empresa descarta todo.
 */
@Injectable({ providedIn: 'root' })
export class PlatformOrganizationVehiclesFacade implements VehicleInventory {
  private readonly repository = inject(PlatformVehiclesRepository);
  private readonly emissions = inject(EmissionsRepository);
  private readonly registry = inject(ContextResetRegistry);

  readonly organizationId = signal<string | null>(null);
  readonly summary = this.registry.track(new ScopedResource<VehicleSummary>());
  readonly list = this.registry.track(new ScopedResource<Page<Vehicle>>());
  readonly detail = this.registry.track(new ScopedResource<VehicleDetail>());
  readonly catalog = this.registry.track(new ScopedResource<VehicleCatalog>());
  readonly filter = signal<VehicleFilter>({});
  private readonly page = signal(1);

  constructor() {
    this.registry.track({ reset: () => this.forget() });
  }

  /** Empieza a mostrar una empresa: si es otra distinta de la anterior descarta lo cargado y pide resumen, lista y catálogo. */
  open(organizationId: string): void {
    if (this.organizationId() !== organizationId) {
      this.forget();
      this.organizationId.set(organizationId);
    }

    this.loadSummary();
    this.loadList();
    this.loadCatalog();
  }

  loadSummary(): void {
    const id = this.organizationId();

    if (!id) return this.summary.reset();

    this.summary.load(this.repository.summary(id), { keepData: true });
  }

  loadList(options: { filter?: VehicleFilter; page?: number } = {}): void {
    const id = this.organizationId();

    if (!id) return this.list.reset();

    if (options.filter) {
      this.filter.set(options.filter);
      this.page.set(1);
    }

    if (options.page !== undefined) this.page.set(options.page);

    this.list.load(this.repository.list(id, { page: this.page(), pageSize: VEHICLES_PAGE_SIZE }, this.filter()), { keepData: true });
  }

  loadDetail(vehicleId: string): void {
    const id = this.organizationId();

    if (!id) return this.detail.reset();

    this.detail.load(this.repository.get(id, vehicleId));
  }

  loadCatalog(): void {
    this.catalog.load(this.emissions.vehicles(), { keepData: true });
  }

  private forget(): void {
    this.organizationId.set(null);
    this.summary.reset();
    this.list.reset();
    this.detail.reset();
    this.filter.set({});
    this.page.set(1);
  }
}
