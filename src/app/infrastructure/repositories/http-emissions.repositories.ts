import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { EmissionFactor, Simulation, SimulationInput, VehicleCatalog } from '../../domain/models/emissions';
import { EmissionsRepository } from '../../domain/repositories/emissions.repositories';
import { EmissionFactorDto, SimulationDto, VehicleCatalogDto } from '../dto/emissions.dto';
import { ApiClient } from '../http/api-client';
import { simulationBody, toEmissionFactor, toSimulation, toVehicleCatalog } from '../mappers/emissions.mappers';

const BASE = '/emissions';

@Injectable()
export class HttpEmissionsRepository extends EmissionsRepository {
  private readonly api = inject(ApiClient);

  vehicles(): Observable<VehicleCatalog> {
    return this.api.get<VehicleCatalogDto>(`${BASE}/vehicles`).pipe(map(toVehicleCatalog));
  }

  fuels(): Observable<readonly EmissionFactor[]> {
    return this.api.get<readonly EmissionFactorDto[]>(`${BASE}/reference/fuels`).pipe(map((items) => items.map(toEmissionFactor)));
  }

  simulate(input: SimulationInput): Observable<Simulation> {
    return this.api.post<SimulationDto>(`${BASE}/simulate`, simulationBody(input)).pipe(map(toSimulation));
  }
}
