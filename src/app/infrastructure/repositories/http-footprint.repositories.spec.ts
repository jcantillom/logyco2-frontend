import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ORG_ENVIA } from '../../../testing/builders';
import { FOOTPRINT_URL, footprintDto } from '../../../testing/footprint';
import { provideTestApp } from '../../../testing/providers';
import { Footprint } from '../../domain/models/footprint';
import { FootprintRepository } from '../../domain/repositories/footprint.repositories';

describe('HttpFootprintRepository', () => {
  let http: HttpTestingController;
  let repository: FootprintRepository;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    repository = TestBed.inject(FootprintRepository);
  });
  afterEach(() => http.verify());

  it('con periodo envía from y to juntos a GET /organizations/{org}/emissions/footprint y entrega el modelo de dominio', () => {
    let result: Footprint | null = null;
    repository.footprint(ORG_ENVIA.id, { from: '2026-10-01', to: '2026-11-30' }).subscribe((f) => (result = f));
    const request = http.expectOne((r) => r.url === FOOTPRINT_URL);

    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('from')).toBe('2026-10-01');
    expect(request.request.params.get('to')).toBe('2026-11-30');
    request.flush({ data: footprintDto() });
    expect((result as Footprint | null)?.totals.kgCo2).toBe(5588.4016);
  });

  it('sin periodo no envía ni from ni to (todas las cargas)', () => {
    repository.footprint(ORG_ENVIA.id).subscribe();
    const request = http.expectOne((r) => r.url === FOOTPRINT_URL);

    expect(request.request.params.has('from')).toBeFalse();
    expect(request.request.params.has('to')).toBeFalse();
    request.flush({ data: footprintDto() });
  });
});
