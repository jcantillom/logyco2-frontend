import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Page, PageRequest } from '../../domain/models/pagination';
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
} from '../../domain/models/reconciliation';
import { ReconciliationRepository } from '../../domain/repositories/reconciliation.repositories';
import { ConsentBodyDto, DecideBodyDto, DecideResultDto, ReconciliationLinkDto, RescanResultDto, SelectBodyDto, SelectResultDto, SharedCandidateDto } from '../dto/reconciliation.dto';
import { ApiClient } from '../http/api-client';
import { toPage } from '../mappers/identity.mappers';
import { toDecisionResult, toReconciliationLink, toRescanResult, toSelectionResult, toSharedCandidate } from '../mappers/reconciliation.mappers';

const base = (organizationId: string): string => `/organizations/${encodeURIComponent(organizationId)}/reconciliation`;

@Injectable()
export class HttpReconciliationRepository extends ReconciliationRepository {
  private readonly api = inject(ApiClient);

  listLinks(organizationId: string): Observable<readonly ReconciliationLink[]> {
    return this.api.get<ReconciliationLinkDto[]>(`${base(organizationId)}/links`).pipe(map((items) => items.map(toReconciliationLink)));
  }

  changeConsent(organizationId: string, relationshipId: string, change: ConsentChange): Observable<ReconciliationLink> {
    const body: ConsentBodyDto = { matching_enabled: change.matchingEnabled, share_results: change.shareResults };

    return this.api.put<ReconciliationLinkDto>(`${base(organizationId)}/links/${encodeURIComponent(relationshipId)}/consent`, body).pipe(map(toReconciliationLink));
  }

  rescan(organizationId: string, relationshipId: string): Observable<RescanResult> {
    return this.api.post<RescanResultDto>(`${base(organizationId)}/rescan`, { relationship_id: relationshipId }).pipe(map(toRescanResult));
  }

  listCandidates(organizationId: string, request: PageRequest, filter: SharedCandidateFilter): Observable<Page<SharedCandidate>> {
    return this.api
      .getPage<SharedCandidateDto>(`${base(organizationId)}/candidates`, { relationship_id: filter.relationshipId, status: filter.status, page: request.page, page_size: request.pageSize })
      .pipe(map((response) => toPage(response, toSharedCandidate)));
  }

  decide(organizationId: string, candidateIds: readonly string[], decision: SharedDecision): Observable<SharedDecisionResult> {
    const body: DecideBodyDto = { candidate_ids: candidateIds, decision };

    return this.api.post<DecideResultDto>(`${base(organizationId)}/candidates/decide`, body).pipe(map(toDecisionResult));
  }

  select(organizationId: string, operationIds: readonly string[], selection: Side): Observable<SelectionResult> {
    const body: SelectBodyDto = { operation_ids: operationIds, selection };

    return this.api.post<SelectResultDto>(`${base(organizationId)}/operations/select`, body).pipe(map(toSelectionResult));
  }
}
