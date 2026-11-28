import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { PlaceChoice, PlaceChoiceRequest, PlaceChoiceResult, PlaceChoiceUndoResult, PlaceResolution } from '../../domain/models/places';
import { PlacesRepository } from '../../domain/repositories/places.repositories';
import { PlaceChoiceDto, PlaceChoiceResultDto, PlaceChoiceUndoResultDto, PlaceResolutionDto } from '../dto/places.dto';
import { ApiClient } from '../http/api-client';
import { toPlaceChoice, toPlaceChoiceBody, toPlaceChoiceResult, toPlaceChoiceUndoResult, toPlaceResolution } from '../mappers/places.mappers';

const base = (organizationId: string): string => `/organizations/${encodeURIComponent(organizationId)}/places`;

@Injectable()
export class HttpPlacesRepository extends PlacesRepository {
  private readonly api = inject(ApiClient);

  pending(organizationId: string, importFileId?: string): Observable<PlaceResolution> {
    return this.api.get<PlaceResolutionDto>(`${base(organizationId)}/pending`, { import_file_id: importFileId }).pipe(map(toPlaceResolution));
  }

  choices(organizationId: string): Observable<PlaceChoice[]> {
    return this.api.get<PlaceChoiceDto[]>(`${base(organizationId)}/choices`).pipe(map((items) => items.map(toPlaceChoice)));
  }

  choose(organizationId: string, request: PlaceChoiceRequest): Observable<PlaceChoiceResult> {
    return this.api.put<PlaceChoiceResultDto>(`${base(organizationId)}/choices`, toPlaceChoiceBody(request)).pipe(map(toPlaceChoiceResult));
  }

  undo(organizationId: string, choiceId: string): Observable<PlaceChoiceUndoResult> {
    return this.api.deleteData<PlaceChoiceUndoResultDto>(`${base(organizationId)}/choices/${encodeURIComponent(choiceId)}`).pipe(map(toPlaceChoiceUndoResult));
  }
}
