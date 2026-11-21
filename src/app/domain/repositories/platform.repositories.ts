import { Observable } from 'rxjs';
import { PlatformAdminMetrics, ServiceHealth } from '../models/platform';

/** Estado de servicios: ÚNICO contrato con implementación real (endpoints `/health/*` del backend). */
export abstract class HealthRepository {
  abstract check(): Observable<readonly ServiceHealth[]>;
}

/** Métricas administrativas REALES, agregadas por el backend en PostgreSQL. */
export abstract class AdminMetricsRepository {
  abstract get(): Observable<PlatformAdminMetrics>;
}
