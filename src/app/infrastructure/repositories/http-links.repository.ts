import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  ExternalCounterpart,
  ExternalCounterpartChanges,
  Link,
  LinkCandidate,
  LinkDetail,
  LinkListFilter,
  LinkSummary,
  NewExternalCounterpart,
  NewLink,
} from '../../domain/models/links';
import { Page, PageRequest } from '../../domain/models/pagination';
import { LinksRepository } from '../../domain/repositories/links.repository';
import { ExternalCounterpartDto, LinkCandidateDto, LinkDetailDto, LinkDto, LinkSummaryDto } from '../dto/links.dto';
import { ApiClient } from '../http/api-client';
import { toCandidate, toExternal, toLink, toLinkDetail, toLinkSummary } from '../mappers/links.mappers';
import { toPage } from '../mappers/identity.mappers';

const base = (organizationId: string): string => `/organizations/${encodeURIComponent(organizationId)}`;

@Injectable()
export class HttpLinksRepository extends LinksRepository {
  private readonly api = inject(ApiClient);

  summary(organizationId: string): Observable<LinkSummary> {
    return this.api.get<LinkSummaryDto>(`${base(organizationId)}/links/summary`).pipe(map(toLinkSummary));
  }

  list(organizationId: string, request: PageRequest, filter: LinkListFilter): Observable<Page<Link>> {
    return this.api
      .getPage<LinkDto>(`${base(organizationId)}/links`, {
        page: request.page,
        page_size: request.pageSize,
        view: filter.view,
        search: filter.search?.trim() || undefined,
        relationship_type: filter.relationshipType,
      })
      .pipe(map((response) => toPage(response, toLink)));
  }

  get(organizationId: string, linkId: string): Observable<LinkDetail> {
    return this.api.get<LinkDetailDto>(`${base(organizationId)}/links/${encodeURIComponent(linkId)}`).pipe(map(toLinkDetail));
  }

  search(organizationId: string, query: string): Observable<readonly LinkCandidate[]> {
    return this.api.get<readonly LinkCandidateDto[]>(`${base(organizationId)}/links/candidates`, { q: query.trim() }).pipe(map((rows) => rows.map(toCandidate)));
  }

  request(organizationId: string, link: NewLink): Observable<Link> {
    return this.api
      .post<LinkDto>(`${base(organizationId)}/links`, {
        counterpart_organization_id: link.counterpartOrganizationId,
        relationship_type: link.relationshipType,
        our_role: link.ourRole,
        note: link.note?.trim() || null,
      })
      .pipe(map(toLink));
  }

  respond(organizationId: string, linkId: string, action: 'accept' | 'reject' | 'cancel' | 'end', note?: string): Observable<Link> {
    return this.api
      .post<LinkDto>(`${base(organizationId)}/links/${encodeURIComponent(linkId)}/${action}`, note?.trim() ? { note: note.trim() } : {})
      .pipe(map(toLink));
  }

  listExternal(organizationId: string, request: PageRequest, search?: string): Observable<Page<ExternalCounterpart>> {
    return this.api
      .getPage<ExternalCounterpartDto>(`${base(organizationId)}/external-counterparts`, { page: request.page, page_size: request.pageSize, search: search?.trim() || undefined })
      .pipe(map((response) => toPage(response, toExternal)));
  }

  createExternal(organizationId: string, counterpart: NewExternalCounterpart): Observable<ExternalCounterpart> {
    return this.api.post<ExternalCounterpartDto>(`${base(organizationId)}/external-counterparts`, this.body(counterpart)).pipe(map(toExternal));
  }

  updateExternal(organizationId: string, counterpartId: string, changes: ExternalCounterpartChanges): Observable<ExternalCounterpart> {
    return this.api
      .patch<ExternalCounterpartDto>(`${base(organizationId)}/external-counterparts/${encodeURIComponent(counterpartId)}`, this.body(changes))
      .pipe(map(toExternal));
  }

  removeExternal(organizationId: string, counterpartId: string): Observable<void> {
    return this.api.delete(`${base(organizationId)}/external-counterparts/${encodeURIComponent(counterpartId)}`);
  }

  private body(value: ExternalCounterpartChanges): Record<string, string | null> {
    const body: Record<string, string | null> = {};
    if (value.name !== undefined) body['name'] = value.name;
    if (value.taxId !== undefined) body['tax_id'] = value.taxId?.trim() || null;
    if (value.counterpartType !== undefined) body['counterpart_type'] = value.counterpartType;
    if (value.country !== undefined) body['country'] = value.country;
    if (value.relationshipType !== undefined) body['relationship_type'] = value.relationshipType;
    if (value.ourRole !== undefined) body['our_role'] = value.ourRole;
    if (value.note !== undefined) body['note'] = value.note?.trim() || null;

    return body;
  }
}
