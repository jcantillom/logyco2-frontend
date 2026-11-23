import { Observable } from 'rxjs';
import { DuplicateFilter, DuplicateResolution, DuplicateResolutionResult, PossibleDuplicate } from '../models/duplicates';
import { Page, PageRequest } from '../models/pagination';

/** Puerto de los posibles duplicados de viajes de la empresa (`/organizations/{id}/emissions/trips/duplicates…`). */
export abstract class DuplicatesRepository {
  /** Pares por revisar, paginados; `filter` lo aplica el servidor. */
  abstract list(organizationId: string, request: PageRequest, filter: DuplicateFilter): Observable<Page<PossibleDuplicate>>;
  /** Registra la decisión sobre los viajes retenidos (404 `TRIP_NOT_FOUND` si alguno es de otra empresa: no cambia nada; los ya resueltos se omiten). */
  abstract resolve(organizationId: string, resolution: DuplicateResolution): Observable<DuplicateResolutionResult>;
}
