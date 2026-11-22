import { Observable } from 'rxjs';
import { Page, PageRequest } from '../models/pagination';
import {
  AnalysisCreated,
  AnalysisSummary,
  ConfirmResult,
  ConfirmSelection,
  Finding,
  FindingFilter,
  NewVehicle,
  NotificationItem,
  ResolveRequest,
  Vehicle,
  VehicleAnalysis,
  VehicleChanges,
  VehicleDetail,
  VehicleFilter,
  VehicleSummary,
} from '../models/vehicles';

/** Puerto del inventario de vehículos de una empresa (`/organizations/{id}/vehicles…`) y de sus análisis de archivos. */
export abstract class VehiclesRepository {
  abstract summary(organizationId: string): Observable<VehicleSummary>;
  abstract list(organizationId: string, request: PageRequest, filter: VehicleFilter): Observable<Page<Vehicle>>;
  abstract get(organizationId: string, vehicleId: string): Observable<VehicleDetail>;
  abstract create(organizationId: string, vehicle: NewVehicle): Observable<Vehicle>;
  abstract update(organizationId: string, vehicleId: string, changes: VehicleChanges): Observable<Vehicle>;
  /** Sube el Excel; `idempotencyKey` identifica la solicitud para que un reintento no cree otra corrida. */
  abstract createAnalysis(organizationId: string, file: File, idempotencyKey: string): Observable<AnalysisCreated>;
  /** Reintenta una corrida fallida (409 si no se puede reintentar). */
  abstract retryAnalysis(organizationId: string, analysisId: string): Observable<AnalysisCreated>;
  /** Corridas de la empresa, las más recientes primero; `hasPending` deja solo las que tienen algo por decidir. */
  abstract listAnalyses(organizationId: string, request: PageRequest, hasPending?: boolean): Observable<Page<AnalysisSummary>>;
  abstract getAnalysis(organizationId: string, analysisId: string): Observable<VehicleAnalysis>;
  abstract listFindings(organizationId: string, analysisId: string, request: PageRequest, filter: FindingFilter): Observable<Page<Finding>>;
  abstract confirm(organizationId: string, analysisId: string, selection: ConfirmSelection): Observable<ConfirmResult>;
  abstract resolve(organizationId: string, findingId: string, request: ResolveRequest): Observable<Finding>;
}

/** Puerto de las notificaciones de la campana de la empresa activa. */
export abstract class NotificationsRepository {
  abstract list(organizationId: string, request: PageRequest, unreadOnly: boolean): Observable<Page<NotificationItem>>;
  abstract unreadCount(organizationId: string): Observable<number>;
  abstract markRead(organizationId: string, notificationId: string): Observable<NotificationItem>;
  /** Cantidad de notificaciones que se marcaron (las visibles que seguían sin leer). */
  abstract markAllRead(organizationId: string): Observable<number>;
}

/** Puerto de la consola de plataforma para supervisar el inventario de cualquier empresa: solo lectura. */
export abstract class PlatformVehiclesRepository {
  abstract summary(organizationId: string): Observable<VehicleSummary>;
  abstract list(organizationId: string, request: PageRequest, filter: VehicleFilter): Observable<Page<Vehicle>>;
  abstract get(organizationId: string, vehicleId: string): Observable<VehicleDetail>;
}
