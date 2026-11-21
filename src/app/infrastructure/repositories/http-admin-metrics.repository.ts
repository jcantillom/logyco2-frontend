import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { PlatformAdminMetrics } from '../../domain/models/platform';
import { AdminMetricsRepository } from '../../domain/repositories/platform.repositories';
import { PlatformMetricsDto } from '../dto/identity.dto';
import { ApiClient } from '../http/api-client';
import { toPlatformMetrics } from '../mappers/identity.mappers';

/** `GET /platform/metrics`: agregados calculados por el backend en PostgreSQL (solo rol global). */
@Injectable()
export class HttpAdminMetricsRepository extends AdminMetricsRepository {
  private readonly api = inject(ApiClient);

  get(): Observable<PlatformAdminMetrics> {
    return this.api.get<PlatformMetricsDto>('/platform/metrics').pipe(map(toPlatformMetrics));
  }
}
