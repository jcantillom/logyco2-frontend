import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { ServiceHealth } from '../../domain/models/platform';
import { HealthRepository } from '../../domain/repositories/platform.repositories';
import { ApiClient } from '../http/api-client';
import { CorporateServicesDto, LiveDto, ReadinessDto, toApiHealth, toCorporateServices, toDatabaseHealth, unverifiedServices } from '../mappers/health.mappers';

/**
 * Consulta `/health/live` y `/health` (raíz del backend) y `/platform/services` (SSO y directorio, solo lectura en el
 * backend). Un fallo de la API o de la base se interpreta como DOWN, nunca como UP; si no se puede consultar el SSO o el
 * directorio queda «No verificado».
 */
@Injectable()
export class HttpHealthRepository extends HealthRepository {
  private readonly api = inject(ApiClient);

  check(): Observable<readonly ServiceHealth[]> {
    return forkJoin({
      live: this.api.getRoot<LiveDto>('/health/live').pipe(catchError(() => of(null))),
      ready: this.api.getRoot<ReadinessDto>('/health').pipe(catchError(() => of(null))),
      corporate: this.api.get<CorporateServicesDto>('/platform/services').pipe(catchError(() => of(null))),
    }).pipe(
      map(({ live, ready, corporate }) => {
        const now = new Date();
        const api = toApiHealth(live, now);
        return [api, toDatabaseHealth(ready, api.status === 'UP', now), ...toCorporateServices(api.status === 'UP' ? corporate : null), ...unverifiedServices()];
      }),
    );
  }
}
