import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Page, PageRequest } from '../../domain/models/pagination';
import { NewVehicle, Vehicle, VehicleChanges, VehicleDetail, VehicleFilter, VehicleSummary } from '../../domain/models/vehicles';
import { PlatformVehiclesRepository, VehiclesRepository } from '../../domain/repositories/vehicles.repositories';
import { VehicleDetailDto, VehicleDto, VehicleSummaryDto } from '../dto/vehicles.dto';
import { ApiClient } from '../http/api-client';
import { toPage } from '../mappers/identity.mappers';
import { toVehicle, toVehicleDetail, toVehicleSummary, vehicleBody, vehiclePatchBody } from '../mappers/vehicles.mappers';

const base = (organizationId: string): string => `/organizations/${encodeURIComponent(organizationId)}`;
const platformBase = (organizationId: string): string => `/platform/organizations/${encodeURIComponent(organizationId)}/vehicles`;
const id = (value: string): string => encodeURIComponent(value);

@Injectable()
export class HttpVehiclesRepository extends VehiclesRepository {
  private readonly api = inject(ApiClient);

  summary(organizationId: string): Observable<VehicleSummary> {
    return this.api.get<VehicleSummaryDto>(`${base(organizationId)}/vehicles/summary`).pipe(map(toVehicleSummary));
  }

  list(organizationId: string, request: PageRequest, filter: VehicleFilter): Observable<Page<Vehicle>> {
    return this.api
      .getPage<VehicleDto>(`${base(organizationId)}/vehicles`, {
        page: request.page,
        page_size: request.pageSize,
        search: filter.search?.trim() || undefined,
        status: filter.status,
        configuration: filter.configuration,
        fuel: filter.fuel,
      })
      .pipe(map((response) => toPage(response, toVehicle)));
  }

  get(organizationId: string, vehicleId: string): Observable<VehicleDetail> {
    return this.api.get<VehicleDetailDto>(`${base(organizationId)}/vehicles/${id(vehicleId)}`).pipe(map(toVehicleDetail));
  }

  create(organizationId: string, vehicle: NewVehicle): Observable<Vehicle> {
    return this.api.post<VehicleDto>(`${base(organizationId)}/vehicles`, vehicleBody(vehicle)).pipe(map(toVehicle));
  }

  update(organizationId: string, vehicleId: string, changes: VehicleChanges): Observable<Vehicle> {
    return this.api.patch<VehicleDto>(`${base(organizationId)}/vehicles/${id(vehicleId)}`, vehiclePatchBody(changes)).pipe(map(toVehicle));
  }
}

/** Misma forma que el inventario de la empresa, bajo `/platform/organizations/{id}/vehicles` (solo lectura). */
@Injectable()
export class HttpPlatformVehiclesRepository extends PlatformVehiclesRepository {
  private readonly api = inject(ApiClient);

  summary(organizationId: string): Observable<VehicleSummary> {
    return this.api.get<VehicleSummaryDto>(`${platformBase(organizationId)}/summary`).pipe(map(toVehicleSummary));
  }

  list(organizationId: string, request: PageRequest, filter: VehicleFilter): Observable<Page<Vehicle>> {
    return this.api
      .getPage<VehicleDto>(platformBase(organizationId), {
        page: request.page,
        page_size: request.pageSize,
        search: filter.search?.trim() || undefined,
        status: filter.status,
        configuration: filter.configuration,
        fuel: filter.fuel,
      })
      .pipe(map((response) => toPage(response, toVehicle)));
  }

  get(organizationId: string, vehicleId: string): Observable<VehicleDetail> {
    return this.api.get<VehicleDetailDto>(`${platformBase(organizationId)}/${id(vehicleId)}`).pipe(map(toVehicleDetail));
  }
}
