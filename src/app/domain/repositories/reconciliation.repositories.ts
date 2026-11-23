import { Observable } from 'rxjs';
import { Page, PageRequest } from '../models/pagination';
import {
  ConsentChange,
  ReconciliationLink,
  RescanResult,
  SelectionResult,
  Side,
  SharedCandidate,
  SharedCandidateFilter,
  SharedDecision,
  SharedDecisionResult,
} from '../models/reconciliation';

/** Puerto de la conciliación entre empresas vinculadas (`/organizations/{id}/reconciliation…`). */
export abstract class ReconciliationRepository {
  /** Vínculos vigentes y finalizados con las autorizaciones de ambas empresas. */
  abstract listLinks(organizationId: string): Observable<readonly ReconciliationLink[]>;
  /** Cambia las autorizaciones de la propia empresa en un vínculo (solo `relationships:manage`); revocar se permite siempre. */
  abstract changeConsent(organizationId: string, relationshipId: string, change: ConsentChange): Observable<ReconciliationLink>;
  /** Lanza la búsqueda de coincidencias del vínculo (idempotente). */
  abstract rescan(organizationId: string, relationshipId: string): Observable<RescanResult>;
  abstract listCandidates(organizationId: string, request: PageRequest, filter: SharedCandidateFilter): Observable<Page<SharedCandidate>>;
  /** Decisión de la propia empresa sobre uno o varios candidatos (hasta 500); es atómica: si uno falla no cambia ninguno. */
  abstract decide(organizationId: string, candidateIds: readonly string[], decision: SharedDecision): Observable<SharedDecisionResult>;
  /** Elige la declaración vigente de una operación en conflicto (`A`/`B` del par canónico); solo se aplica con acuerdo de ambas empresas. */
  abstract select(organizationId: string, operationIds: readonly string[], selection: Side): Observable<SelectionResult>;
}
