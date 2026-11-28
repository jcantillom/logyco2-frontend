import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, importDetailDto } from '../../../testing/imports';
import { choiceResultDto, PLACES_URL } from '../../../testing/places';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { ImportPlacesFacade, PlaceSelection } from './import-places.facade';

const URL = `${PLACES_URL}/choices`;
const selection = (overrides: Partial<PlaceSelection> = {}): PlaceSelection => ({ importId: 'imp-1', placeKey: 'k', placeText: 'SAN PEDRO, ANTIOQUIA', municipalityCode: '05664', note: null, scope: 'IMPORT', ...overrides });

describe('ImportPlacesFacade', () => {
  let facade: ImportPlacesFacade;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(ImportPlacesFacade);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.match(() => true));

  const flushReload = (): void => {
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` }).flush({ data: importDetailDto() });
  };

  it('elegir envía el texto tal cual, el municipio y la carga; guarda el resultado y vuelve a pedir la carga', () => {
    let done = false;
    facade.choose(selection({ note: 'confirmado' }), () => (done = true));

    expect(facade.busy()).toBe('k');
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ place_text: 'SAN PEDRO, ANTIOQUIA', municipality_code: '05664', note: 'confirmado', import_file_id: 'imp-1' });
    req.flush({ data: choiceResultDto() });
    flushReload();

    expect(done).toBeTrue();
    expect(facade.busy()).toBeNull();
    expect(facade.outcomes()[0]).toEqual(jasmine.objectContaining({ importId: 'imp-1', placeKey: 'k', result: jasmine.objectContaining({ tripsUpdated: 102, nowCalculated: 95, stillPending: 3 }) }));
    expect(facade.error()).toBeNull();
  });

  it('con alcance de toda la empresa no envía import_file_id', () => {
    facade.choose(selection({ scope: 'COMPANY' }));

    expect(http.expectOne(URL).request.body).toEqual({ place_text: 'SAN PEDRO, ANTIOQUIA', municipality_code: '05664' });
  });

  it('repetir lo mismo es idempotente: el servidor responde changed:false y se muestra tal cual', () => {
    facade.choose(selection());
    http.expectOne(URL).flush({ data: choiceResultDto({ changed: false, created: false, trips_updated: 0 }) });
    flushReload();

    expect(facade.outcomes()[0].result).toEqual(jasmine.objectContaining({ changed: false, tripsUpdated: 0 }));
  });

  it('un segundo clic mientras se envía no repite la llamada', () => {
    facade.choose(selection());
    facade.choose(selection());

    expect(http.match(URL).length).toBe(1);
  });

  it('el resultado de un mismo lugar reemplaza al anterior, no se acumula', () => {
    facade.choose(selection());
    http.expectOne(URL).flush({ data: choiceResultDto() });
    flushReload();
    facade.choose(selection({ scope: 'COMPANY' }));
    http.expectOne(URL).flush({ data: choiceResultDto({ scope: 'COMPANY', trips_updated: 5 }) });
    flushReload();

    expect(facade.outcomes().length).toBe(1);
    expect(facade.outcomes()[0].result.tripsUpdated).toBe(5);
  });

  it('un error (409 COMPANY_BUSY) queda en su lugar, no cierra nada y permite reintentar', () => {
    let done = false;
    facade.choose(selection(), () => (done = true));
    http.expectOne(URL).flush({ error: { code: 'COMPANY_BUSY', message: 'x' } }, { status: 409, statusText: 'Conflict' });

    expect(done).toBeFalse();
    expect(facade.busy()).toBeNull();
    expect(facade.error()).toEqual({ placeKey: 'k', error: jasmine.objectContaining({ code: 'COMPANY_BUSY' }) });
    facade.choose(selection());
    expect(facade.error()).toBeNull();
    http.expectOne(URL);
  });

  it('tope de 1.000 y municipio inválido: mensajes propios del catálogo', () => {
    facade.choose(selection());
    http.expectOne(URL).flush({ error: { code: 'PLACE_CHOICES_LIMIT', message: 'x' } }, { status: 409, statusText: 'Conflict' });
    expect(facade.error()?.error.message).toContain('1.000');

    facade.choose(selection());
    http.expectOne(URL).flush({ error: { code: 'UNKNOWN_MUNICIPALITY_CODE', message: 'x' } }, { status: 422, statusText: 'Unprocessable' });
    expect(facade.error()?.error.message).toContain('catálogo oficial');
  });

  it('al cambiar de empresa se limpia todo', () => {
    facade.choose(selection());
    http.expectOne(URL).flush({ data: choiceResultDto() });
    flushReload();
    TestBed.inject(ContextResetRegistry).resetAll();

    expect(facade.outcomes()).toEqual([]);
    expect(facade.busy()).toBeNull();
  });
});
