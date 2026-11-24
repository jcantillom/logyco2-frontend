import { Observable } from 'rxjs';
import { ImportCounts, ImportPeriod, ImportCreated, ImportDetail, ImportFilter, ImportNotCalculable, ImportSummary, TemplateFile, VehicleCandidate, VehicleCandidateKind, VehicleDecisionRequest, VehicleDecisionResult } from '../models/imports';
import { Page, PageRequest } from '../models/pagination';
import { PeriodRange } from '../models/period';

/** Puerto de las cargas de la empresa (`/organizations/{id}/imports…`): plantilla, subida, historial y revisión. */
export abstract class ImportsRepository {
  abstract template(organizationId: string): Observable<TemplateFile>;
  /** Sube el Excel; `idempotencyKey` identifica el intento para que un reintento no cree otra carga. */
  abstract upload(organizationId: string, file: File, idempotencyKey: string): Observable<ImportCreated>;
  /** Historial paginado; `filter` lo aplica el servidor. */
  abstract list(organizationId: string, request: PageRequest, filter: ImportFilter): Observable<Page<ImportSummary>>;
  /** Conteos por estado de todas las cargas de la empresa (alimentan las pestañas y la ruta). */
  /** Con `period`, las sumas de filas (`rowsRead`, `rowsCalculable`, `rowsPending`, `rowsReal`, `rowsEstimated`) son solo de las cargas de ese periodo. */
  abstract counts(organizationId: string, period?: PeriodRange): Observable<ImportCounts>;
  /** Periodos distintos de las cargas terminadas, los más recientes primero (máximo 100). */
  abstract periods(organizationId: string): Observable<ImportPeriod[]>;
  abstract get(organizationId: string, importId: string): Observable<ImportDetail>;
  /** Reintenta una carga fallida (409 si no se puede). */
  abstract retry(organizationId: string, importId: string): Observable<ImportCreated>;
  /** Confirma conservar una carga sin viajes calculables; idempotente (409 `IMPORT_CALCULABLE` si sí tiene viajes calculables). */
  abstract acknowledgeNotCalculable(organizationId: string, importId: string): Observable<ImportNotCalculable>;
  /** Vehículos que propone una carga terminada, de un tipo y por página. */
  abstract vehicleCandidates(organizationId: string, importId: string, kind: VehicleCandidateKind, request: PageRequest): Observable<Page<VehicleCandidate>>;
  /** Registra, actualiza u omite candidatos (409 `IMPORT_NOT_REVIEWED` si la carga no terminó; máximo 500 por petición). */
  abstract decideVehicles(organizationId: string, importId: string, request: VehicleDecisionRequest): Observable<VehicleDecisionResult>;
}
