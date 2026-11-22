import { Observable } from 'rxjs';
import { Page, PageRequest } from '../models/pagination';
import { NewVehicle, Vehicle, VehicleChanges, VehicleDetail, VehicleFilter, VehicleSummary } from '../models/vehicles';

/** Puerto del inventario de vehículos de una empresa (`/organizations/{id}/vehicles…`). */
export abstract class VehiclesRepository {
  abstract summary(organizationId: string): Observable<VehicleSummary>;
  abstract list(organizationId: string, request: PageRequest, filter: VehicleFilter): Observable<Page<Vehicle>>;
  abstract get(organizationId: string, vehicleId: string): Observable<VehicleDetail>;
  abstract create(organizationId: string, vehicle: NewVehicle): Observable<Vehicle>;
  abstract update(organizationId: string, vehicleId: string, changes: VehicleChanges): Observable<Vehicle>;
}

/** Puerto de la consola de plataforma para supervisar el inventario de cualquier empresa: solo lectura. */
export abstract class PlatformVehiclesRepository {
  abstract summary(organizationId: string): Observable<VehicleSummary>;
  abstract list(organizationId: string, request: PageRequest, filter: VehicleFilter): Observable<Page<Vehicle>>;
  abstract get(organizationId: string, vehicleId: string): Observable<VehicleDetail>;
}
