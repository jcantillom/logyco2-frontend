import { Observable } from 'rxjs';
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
} from '../models/links';
import { Page, PageRequest } from '../models/pagination';

/** Empresas vinculadas y contrapartes externas de UNA empresa. El servidor aplica los permisos; esta capa solo transporta. */
export abstract class LinksRepository {
  abstract summary(organizationId: string): Observable<LinkSummary>;
  abstract list(organizationId: string, request: PageRequest, filter: LinkListFilter): Observable<Page<Link>>;
  abstract get(organizationId: string, linkId: string): Observable<LinkDetail>;
  abstract search(organizationId: string, query: string): Observable<readonly LinkCandidate[]>;
  abstract request(organizationId: string, link: NewLink): Observable<Link>;
  abstract respond(organizationId: string, linkId: string, action: 'accept' | 'reject' | 'cancel' | 'end', note?: string): Observable<Link>;

  abstract listExternal(organizationId: string, request: PageRequest, search?: string): Observable<Page<ExternalCounterpart>>;
  abstract createExternal(organizationId: string, counterpart: NewExternalCounterpart): Observable<ExternalCounterpart>;
  abstract updateExternal(organizationId: string, counterpartId: string, changes: ExternalCounterpartChanges): Observable<ExternalCounterpart>;
  abstract removeExternal(organizationId: string, counterpartId: string): Observable<void>;
}
