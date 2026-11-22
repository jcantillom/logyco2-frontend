import { Signal } from '@angular/core';
import { ScopedResource } from '../../core/org/scoped-resource';
import { VehicleCatalog } from '../../domain/models/emissions';
import { Page } from '../../domain/models/pagination';
import { Vehicle, VehicleDetail, VehicleFilter, VehicleSummary } from '../../domain/models/vehicles';

/**
 * Lo que necesitan la tabla y el detalle de vehículos para mostrar un inventario. Lo implementan la facade de la empresa activa y la de
 * la consola de plataforma (una empresa elegida, solo lectura), de modo que los componentes se comparten sin copiarse.
 */
export interface VehicleInventory {
  readonly summary: ScopedResource<VehicleSummary>;
  readonly list: ScopedResource<Page<Vehicle>>;
  readonly detail: ScopedResource<VehicleDetail>;
  readonly catalog: ScopedResource<VehicleCatalog>;
  readonly filter: Signal<VehicleFilter>;
  loadSummary(): void;
  loadList(options?: { filter?: VehicleFilter; page?: number }): void;
  loadDetail(vehicleId: string): void;
  loadCatalog(): void;
}
