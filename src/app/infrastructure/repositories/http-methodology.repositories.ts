import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Methodology } from '../../domain/models/methodology';
import { MethodologyRepository } from '../../domain/repositories/methodology.repositories';
import { MethodologyDto } from '../dto/methodology.dto';
import { ApiClient } from '../http/api-client';
import { toMethodology } from '../mappers/methodology.mappers';

@Injectable()
export class HttpMethodologyRepository extends MethodologyRepository {
  private readonly api = inject(ApiClient);

  methodology(organizationId: string): Observable<Methodology> {
    return this.api.get<MethodologyDto>(`/organizations/${encodeURIComponent(organizationId)}/emissions/methodology`).pipe(map(toMethodology));
  }
}
