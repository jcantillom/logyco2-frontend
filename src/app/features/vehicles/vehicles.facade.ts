import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { VehicleCatalog } from '../../domain/models/emissions';
import { Page } from '../../domain/models/pagination';
import { NewVehicle, Vehicle, VehicleChanges, VehicleDetail, VehicleFilter, VehicleSummary } from '../../domain/models/vehicles';
import { EmissionsRepository } from '../../domain/repositories/emissions.repositories';
import { VehiclesRepository } from '../../domain/repositories/vehicles.repositories';
import { VehicleInventory } from './vehicle-inventory';

/** Registros por página de la tabla. */
export const VEHICLES_PAGE_SIZE = 10;

/**
 * Inventario de vehículos de la empresa activa. Todo lo que muestra lo entrega el servidor; el catálogo de configuraciones sale de la guía
 * de emisiones existente (no se duplica). Cambiar de empresa descarta todo, incluidos filtro y página.
 */
@Injectable({ providedIn: 'root' })
export class VehiclesFacade implements VehicleInventory {
  private readonly repository = inject(VehiclesRepository);
  private readonly emissions = inject(EmissionsRepository);
  private readonly context = inject(OrganizationContext);
  private readonly registry = inject(ContextResetRegistry);

  readonly summary = this.registry.track(new ScopedResource<VehicleSummary>());
  readonly list = this.registry.track(new ScopedResource<Page<Vehicle>>());
  readonly detail = this.registry.track(new ScopedResource<VehicleDetail>());
  readonly catalog = this.registry.track(new ScopedResource<VehicleCatalog>());

  readonly filter = signal<VehicleFilter>({});
  readonly page = signal(1);

  constructor() {
    this.registry.track({
      reset: () => {
        this.filter.set({});
        this.page.set(1);
      },
    });
  }

  loadSummary(): void {
    const id = this.context.activeOrganizationId();

    if (!id) return this.summary.reset();

    this.summary.load(this.repository.summary(id), { keepData: true });
  }

  /** Con `filter` se reemplaza el filtro y se vuelve a la primera página; con `page` solo cambia de página. */
  loadList(options: { filter?: VehicleFilter; page?: number } = {}): void {
    const id = this.context.activeOrganizationId();

    if (!id) return this.list.reset();

    if (options.filter) {
      this.filter.set(options.filter);
      this.page.set(1);
    }

    if (options.page !== undefined) this.page.set(options.page);

    this.list.load(this.repository.list(id, { page: this.page(), pageSize: VEHICLES_PAGE_SIZE }, this.filter()), { keepData: true });
  }

  loadDetail(vehicleId: string): void {
    const id = this.context.activeOrganizationId();

    if (!id) return this.detail.reset();

    this.detail.load(this.repository.get(id, vehicleId));
  }

  loadCatalog(): void {
    this.catalog.load(this.emissions.vehicles(), { keepData: true });
  }

  create(vehicle: NewVehicle): Observable<Vehicle> {
    return this.repository.create(this.organizationId(), vehicle).pipe(tap(() => this.refresh()));
  }

  update(vehicleId: string, changes: VehicleChanges): Observable<Vehicle> {
    return this.repository.update(this.organizationId(), vehicleId, changes).pipe(
      tap(() => {
        this.refresh();
        if (this.detail.data()?.id === vehicleId) this.loadDetail(vehicleId);
      }),
    );
  }

  private refresh(): void {
    this.loadSummary();
    this.loadList();
  }

  private organizationId(): string {
    const id = this.context.activeOrganizationId();

    if (!id) throw new Error('No hay una empresa activa.');

    return id;
  }
}
