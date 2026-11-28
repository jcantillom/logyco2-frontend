import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { choiceDto, choiceResultDto, PLACES_URL, resolutionDto, undoResultDto } from '../../../testing/places';
import { provideTestApp } from '../../../testing/providers';
import { ORG_ENVIA } from '../../../testing/builders';
import { PlacesRepository } from '../../domain/repositories/places.repositories';

const ORG = ORG_ENVIA.id;

describe('HttpPlacesRepository', () => {
  let repo: PlacesRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    repo = TestBed.inject(PlacesRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pending: GET con import_file_id y sin él (toda la empresa)', () => {
    repo.pending(ORG, 'imp-1').subscribe();
    const a = http.expectOne((r) => r.url === `${PLACES_URL}/pending`);
    expect(a.request.method).toBe('GET');
    expect(a.request.params.get('import_file_id')).toBe('imp-1');
    a.flush({ data: resolutionDto() });

    repo.pending(ORG).subscribe();
    const b = http.expectOne((r) => r.url === `${PLACES_URL}/pending`);
    expect(b.request.params.has('import_file_id')).toBeFalse();
    b.flush({ data: resolutionDto() });
  });

  it('choices: lista las decisiones de la empresa', () => {
    let names: string[] = [];
    repo.choices(ORG).subscribe((items) => (names = items.map((i) => i.municipalityName)));
    http.expectOne(`${PLACES_URL}/choices`).flush({ data: [choiceDto()] });

    expect(names).toEqual(['San Pedro de los Milagros']);
  });

  it('choose: PUT con el cuerpo del contrato', () => {
    let changed: boolean | undefined;
    repo.choose(ORG, { placeText: 'SAN PEDRO, ANTIOQUIA', municipalityCode: '05664', note: 'nota', importFileId: 'imp-1' }).subscribe((r) => (changed = r.changed));
    const req = http.expectOne(`${PLACES_URL}/choices`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ place_text: 'SAN PEDRO, ANTIOQUIA', municipality_code: '05664', note: 'nota', import_file_id: 'imp-1' });
    req.flush({ data: choiceResultDto() });

    expect(changed).toBeTrue();
  });

  it('undo: DELETE de la decisión y lee el resultado', () => {
    let reverted: number | undefined;
    repo.undo(ORG, 'ch-1').subscribe((r) => (reverted = r.tripsReverted));
    const req = http.expectOne(`${PLACES_URL}/choices/ch-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: undoResultDto() });

    expect(reverted).toBe(102);
  });
});
