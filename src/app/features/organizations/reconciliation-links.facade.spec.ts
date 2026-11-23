import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { RECONCILIATION_URL, REL_ID, activeLinkDto, reconciliationLinkDto } from '../../../testing/reconciliation';
import { SessionStore } from '../../core/auth/session.store';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { OrganizationContext } from '../../core/org/organization-context';
import { ReconciliationLinksFacade } from './reconciliation-links.facade';

describe('ReconciliationLinksFacade', () => {
  let http: HttpTestingController;
  let facade: ReconciliationLinksFacade;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(ReconciliationLinksFacade);
  });
  afterEach(() => http.verify());

  it('lista los vínculos y un error se puede reintentar', () => {
    facade.load();
    http.expectOne(`${RECONCILIATION_URL}/links`).flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'Server Error' });
    expect(facade.links.status()).toBe('error');

    facade.load();
    http.expectOne(`${RECONCILIATION_URL}/links`).flush({ data: [reconciliationLinkDto()] });
    expect(facade.links.data()?.length).toBe(1);
  });

  it('cambiar una autorización envía los dos interruptores y reemplaza el vínculo con la respuesta, sin tocar a los demás', () => {
    facade.load();
    http.expectOne(`${RECONCILIATION_URL}/links`).flush({ data: [reconciliationLinkDto(), reconciliationLinkDto({ relationship_id: 'rel-2', counterpart: { id: 'org-c', name: 'Otra' } })] });

    facade.changeConsent(REL_ID, { matchingEnabled: true, shareResults: false }).subscribe();
    expect(facade.busyId()).toBe(REL_ID);
    const put = http.expectOne(`${RECONCILIATION_URL}/links/${REL_ID}/consent`);

    expect(put.request.body).toEqual({ matching_enabled: true, share_results: false });
    put.flush({ data: activeLinkDto(false, { rescan_recommended: true }) });

    expect(facade.busyId()).toBeNull();
    expect(facade.links.data()![0].myConsent.matchingEnabled).toBeTrue();
    expect(facade.links.data()![1].myConsent.matchingEnabled).toBeFalse();
  });

  it('un error al cambiar (p. ej. 422 SHARE_REQUIRES_MATCHING) llega con su mensaje y no cambia la lista', () => {
    facade.load();
    http.expectOne(`${RECONCILIATION_URL}/links`).flush({ data: [reconciliationLinkDto()] });
    let error: AppError | null = null;

    facade.changeConsent(REL_ID, { matchingEnabled: false, shareResults: true }).subscribe({ error: (e: unknown) => (error = toAppError(e)) });
    http.expectOne(`${RECONCILIATION_URL}/links/${REL_ID}/consent`).flush({ error: { code: 'SHARE_REQUIRES_MATCHING' } }, { status: 422, statusText: 'Unprocessable' });

    expect((error as AppError | null)?.message).toContain('primero hay que permitir la búsqueda');
    expect(facade.busyId()).toBeNull();
    expect(facade.links.data()![0].myConsent.shareResults).toBeFalse();
  });

  it('la búsqueda tras autorizar envía el vínculo y suelta el «ocupado» al terminar o fallar', () => {
    let created = -1;

    facade.rescan(REL_ID).subscribe((r) => (created = r.candidatesCreated));
    expect(facade.busyId()).toBe(REL_ID);
    http.expectOne(`${RECONCILIATION_URL}/rescan`).flush({ data: { relationships: [], candidates_created: 2, completed: true } });
    expect([created, facade.busyId()]).toEqual([2, null]);

    facade.rescan(REL_ID).subscribe({ error: () => undefined });
    http.expectOne(`${RECONCILIATION_URL}/rescan`).flush({ error: { code: 'FORBIDDEN' } }, { status: 403, statusText: 'Forbidden' });
    expect(facade.busyId()).toBeNull();
  });

  it('cambiar de empresa descarta los vínculos', () => {
    facade.load();
    http.expectOne(`${RECONCILIATION_URL}/links`).flush({ data: [reconciliationLinkDto()] });

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.links.data()).toBeNull();
  });
});
