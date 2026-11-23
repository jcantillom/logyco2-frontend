import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { DuplicateFilter, DuplicateResolution, DuplicateResolutionResult, PossibleDuplicate } from '../../domain/models/duplicates';
import { Page, PageRequest } from '../../domain/models/pagination';
import { DuplicatesRepository } from '../../domain/repositories/duplicates.repositories';
import { DuplicateResolutionResultDto, PossibleDuplicateDto } from '../dto/duplicates.dto';
import { ApiClient } from '../http/api-client';
import { toPossibleDuplicate, toResolutionBody, toResolutionResult } from '../mappers/duplicates.mappers';
import { toPage } from '../mappers/identity.mappers';

const base = (organizationId: string): string => `/organizations/${encodeURIComponent(organizationId)}/emissions/trips/duplicates`;

@Injectable()
export class HttpDuplicatesRepository extends DuplicatesRepository {
  private readonly api = inject(ApiClient);

  list(organizationId: string, request: PageRequest, filter: DuplicateFilter): Observable<Page<PossibleDuplicate>> {
    return this.api
      .getPage<PossibleDuplicateDto>(base(organizationId), { import_file_id: filter.importFileId, page: request.page, page_size: request.pageSize })
      .pipe(map((response) => toPage(response, toPossibleDuplicate)));
  }

  resolve(organizationId: string, resolution: DuplicateResolution): Observable<DuplicateResolutionResult> {
    return this.api.post<DuplicateResolutionResultDto>(`${base(organizationId)}/resolve`, toResolutionBody(resolution)).pipe(map(toResolutionResult));
  }
}
