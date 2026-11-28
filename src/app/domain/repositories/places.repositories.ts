import { Observable } from 'rxjs';
import { PlaceChoice, PlaceChoiceRequest, PlaceChoiceResult, PlaceChoiceUndoResult, PlaceResolution } from '../models/places';

/** Puerto de los lugares por empresa (`/organizations/{id}/places`). */
export abstract class PlacesRepository {
  /** Lugares por resolver de una carga, o de toda la empresa si no se indica. */
  abstract pending(organizationId: string, importFileId?: string): Observable<PlaceResolution>;
  abstract choices(organizationId: string): Observable<PlaceChoice[]>;
  abstract choose(organizationId: string, request: PlaceChoiceRequest): Observable<PlaceChoiceResult>;
  abstract undo(organizationId: string, choiceId: string): Observable<PlaceChoiceUndoResult>;
}
