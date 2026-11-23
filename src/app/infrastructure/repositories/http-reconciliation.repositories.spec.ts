import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp } from '../../../testing/providers';
import { RECONCILIATION_URL, REL_ID, activeLinkDto, candidatesBody, sharedCandidateDtos } from '../../../testing/reconciliation';
import { ReconciliationRepository } from '../../domain/repositories/reconciliation.repositories';

describe('HttpReconciliationRepository', () => {
  let http: HttpTestingController;
  let repository: ReconciliationRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    repository = TestBed.inject(ReconciliationRepository);
  });
  afterEach(() => http.verify());

  it('GET /reconciliation/links entrega los vínculos de dominio', () => {
    let names: string[] = [];

    repository.listLinks(ORG_ENVIA.id).subscribe((links) => (names = links.map((l) => l.counterpart.name)));
    const request = http.expectOne(`${RECONCILIATION_URL}/links`);

    expect(request.request.method).toBe('GET');
    request.flush({ data: [activeLinkDto()] });
    expect(names).toEqual(['Transportadora B']);
  });

  it('PUT /links/{id}/consent envía solo los dos interruptores con los nombres del servidor y entrega el vínculo actualizado', () => {
    let recommended = false;

    repository.changeConsent(ORG_ENVIA.id, REL_ID, { matchingEnabled: true, shareResults: false }).subscribe((link) => (recommended = link.rescanRecommended));
    const request = http.expectOne(`${RECONCILIATION_URL}/links/${REL_ID}/consent`);

    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ matching_enabled: true, share_results: false });
    request.flush({ data: activeLinkDto(false, { rescan_recommended: true }) });
    expect(recommended).toBeTrue();
  });

  it('POST /rescan lleva el vínculo y entrega cuántos candidatos se crearon', () => {
    let result: unknown = null;

    repository.rescan(ORG_ENVIA.id, REL_ID).subscribe((value) => (result = value));
    const request = http.expectOne(`${RECONCILIATION_URL}/rescan`);

    expect(request.request.body).toEqual({ relationship_id: REL_ID });
    request.flush({ data: { relationships: [], candidates_created: 4, completed: true } });
    expect(result).toEqual({ candidatesCreated: 4, completed: true });
  });

  it('GET /candidates envía página, tamaño y estado (si hay) y entrega la página de dominio', () => {
    let total = 0;

    repository.listCandidates(ORG_ENVIA.id, { page: 2, pageSize: 5 }, { status: 'CONFLICTING_DATA' }).subscribe((page) => (total = page.total));
    const request = http.expectOne((r) => r.url === `${RECONCILIATION_URL}/candidates`);

    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('page_size')).toBe('5');
    expect(request.request.params.get('status')).toBe('CONFLICTING_DATA');
    request.flush(candidatesBody(sharedCandidateDtos(2), 12, 5, 2));
    expect(total).toBe(12);
  });

  it('sin filtro no envía status ni relationship_id', () => {
    repository.listCandidates(ORG_ENVIA.id, { page: 1, pageSize: 5 }, {}).subscribe();
    const request = http.expectOne((r) => r.url === `${RECONCILIATION_URL}/candidates`);

    expect(request.request.params.has('status')).toBeFalse();
    expect(request.request.params.has('relationship_id')).toBeFalse();
    request.flush(candidatesBody([]));
  });

  it('POST /candidates/decide y /operations/select usan los nombres del servidor', () => {
    repository.decide(ORG_ENVIA.id, ['c1', 'c2'], 'SAME').subscribe();
    const decide = http.expectOne(`${RECONCILIATION_URL}/candidates/decide`);

    expect(decide.request.body).toEqual({ candidate_ids: ['c1', 'c2'], decision: 'SAME' });
    decide.flush({ data: { updated: 2, unchanged: 0, confirmed: 0, conflicting: 0, items: [] } });

    repository.select(ORG_ENVIA.id, ['op-1'], 'B').subscribe();
    const select = http.expectOne(`${RECONCILIATION_URL}/operations/select`);

    expect(select.request.body).toEqual({ operation_ids: ['op-1'], selection: 'B' });
    select.flush({ data: { updated: 1, unchanged: 0, effective: 0, operations: [] } });
  });
});
