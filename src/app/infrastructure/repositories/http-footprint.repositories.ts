import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Footprint } from '../../domain/models/footprint';
import { PeriodRange } from '../../domain/models/period';
import { FootprintRepository } from '../../domain/repositories/footprint.repositories';
import { FootprintDto } from '../dto/footprint.dto';
import { ApiClient } from '../http/api-client';
import { toFootprint } from '../mappers/footprint.mappers';

@Injectable()
export class HttpFootprintRepository extends FootprintRepository {
  private readonly api = inject(ApiClient);

  footprint(organizationId: string, period?: PeriodRange): Observable<Footprint> {
    return this.api.get<FootprintDto>(`/organizations/${encodeURIComponent(organizationId)}/emissions/footprint`, { from: period?.from, to: period?.to }).pipe(map(toFootprint));
  }
}
