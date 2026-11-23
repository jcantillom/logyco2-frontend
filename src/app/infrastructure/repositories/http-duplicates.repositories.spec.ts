import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ORG_ENVIA } from '../../../testing/builders';
import { DUPLICATES_URL, duplicateDtos, duplicatesBody } from '../../../testing/duplicates';
import { provideTestApp } from '../../../testing/providers';
import { DuplicatesRepository } from '../../domain/repositories/duplicates.repositories';

describe('HttpDuplicatesRepository', () => {
  let http: HttpTestingController;
  let repository: DuplicatesRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    repository = TestBed.inject(DuplicatesRepository);
  });
  afterEach(() => http.verify());

  it('GET /organizations/{org}/emissions/trips/duplicates con página, tamaño y carga (si hay) y entrega la página de dominio', () => {
    let total = 0;
    let first: unknown = null;

    repository.list(ORG_ENVIA.id, { page: 2, pageSize: 5 }, { importFileId: 'imp-2' }).subscribe((page) => {
      total = page.total;
      first = page.items[0].a.distanceKm;
    });
    const request = http.expectOne((r) => r.url === DUPLICATES_URL);

    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('page_size')).toBe('5');
    expect(request.request.params.get('import_file_id')).toBe('imp-2');
    request.flush(duplicatesBody(duplicateDtos(2), 12, 5, 2));
    expect(total).toBe(12);
    expect(first).toBe(415.5);
  });

  it('sin carga no envía import_file_id', () => {
    repository.list(ORG_ENVIA.id, { page: 1, pageSize: 5 }, {}).subscribe();
    const request = http.expectOne((r) => r.url === DUPLICATES_URL);

    expect(request.request.params.has('import_file_id')).toBeFalse();
    request.flush(duplicatesBody([]));
  });

  it('POST .../duplicates/resolve con trip_ids, decision y keep, y entrega resueltos y omitidos', () => {
    let result: unknown = null;

    repository.resolve(ORG_ENVIA.id, { tripIds: ['trip-a1', 'trip-a2'], decision: 'SAME_TRIP', keep: 'NEW' }).subscribe((r) => (result = r));
    const request = http.expectOne(`${DUPLICATES_URL}/resolve`);

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ trip_ids: ['trip-a1', 'trip-a2'], decision: 'SAME_TRIP', keep: 'NEW' });
    request.flush({ data: { resolved: 2, skipped: 0, without_result: 1 } });
    expect(result).toEqual({ resolved: 2, skipped: 0, withoutResult: 1 });
  });
});
