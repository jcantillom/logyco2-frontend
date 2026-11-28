import { Observable } from 'rxjs';
import { Granularity } from '../models/granularity';
import { BulkApplyResult, BulkPreview, BulkScope, CompletionInput, CompletionPlatesPage, CompletionPlatesRequest, CompletionOutcome, CompletionState, ExportJob, OperationsFilter, OperationsListRequest, OperationsPage, OperationsView, ReportFile, TabCounts, TripDetail } from '../models/operations';

/** Puerto de Operaciones logísticas (`/organizations/{id}/operations/trips…`): listado por cursor, conteos de pestañas y detalle bajo demanda. */
export abstract class OperationsRepository {
  /** Una página de viajes; el cursor solo vale con los mismos filtros (si no, 400 `INVALID_CURSOR`). */
  abstract list(organizationId: string, filter: OperationsFilter, request: OperationsListRequest): Observable<OperationsPage>;
  /** Conteos acotados de las pestañas con los mismos filtros (sin vista ni cursor). */
  abstract summary(organizationId: string, filter: OperationsFilter): Observable<TabCounts>;
  /** Reporte Excel de los viajes con los mismos filtros y la misma pestaña (sin cursor ni límite) y la serie «Evolución de emisiones» con `granularity`. 422 `INVALID_GRANULARITY`/`GRANULARITY_TOO_FINE`/`INVALID_PERIOD` o `EXPORT_TOO_LARGE` si supera el tope del servidor. */
  abstract exportReport(organizationId: string, filter: OperationsFilter, view: OperationsView, granularity: Granularity): Observable<ReportFile>;
  /** Pide un reporte Excel en segundo plano con los mismos filtros y pestaña (202 con el trabajo; 200 si ya había uno idéntico activo). */
  abstract createExport(organizationId: string, filter: OperationsFilter, view: OperationsView, granularity: Granularity): Observable<ExportJob>;
  /** Los reportes recientes de la empresa (más nuevo primero, hasta 20). */
  abstract listExports(organizationId: string): Observable<ExportJob[]>;
  /** Cancela un reporte en cola o generándose (409 `EXPORT_NOT_ACTIVE` si ya terminó). */
  abstract cancelExport(organizationId: string, exportId: string): Observable<ExportJob>;
  /** Descarga el archivo de un reporte listo (409 `EXPORT_NOT_READY` / `EXPORT_EXPIRED`). */
  abstract downloadExport(organizationId: string, exportId: string): Observable<ReportFile>;
  /** Lo guardado de un viaje (404 `TRIP_NOT_FOUND` si no es de la empresa). */
  abstract detail(organizationId: string, tripId: string): Observable<TripDetail>;
  /** Qué falta y qué se puede completar en un viaje (permiso `imports:create`). */
  abstract completionState(organizationId: string, tripId: string): Observable<CompletionState>;
  /** Completa y recalcula en el servidor. 409 `TRIP_VERSION_CONFLICT` trae el estado vigente en `AppError.data` (ya como `CompletionState`). */
  abstract complete(organizationId: string, tripId: string, input: CompletionInput): Observable<CompletionOutcome>;
  /** Placas con viajes sin rendimiento, de a una página por cursor, con su combustible y la unidad ya declarada (permiso `imports:create`). */
  abstract completionPlates(organizationId: string, request: CompletionPlatesRequest): Observable<CompletionPlatesPage>;
  /** Vista previa en bloque por placa: no escribe. */
  abstract previewCompletion(organizationId: string, scope: BulkScope): Observable<BulkPreview>;
  /** Aplica lo previsualizado con su token (idempotente). */
  abstract applyCompletion(organizationId: string, scope: BulkScope, token: string): Observable<BulkApplyResult>;
}
