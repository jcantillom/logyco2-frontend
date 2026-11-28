import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { choiceDto, PLACES_URL, undoResultDto } from '../../../testing/places';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { toPlaceChoice } from '../../infrastructure/mappers/places.mappers';
import { CompanyPlaceChoicesFacade, PLACE_CHOICES_LIMIT } from './company-place-choices.facade';

const LIST = `${PLACES_URL}/choices`;

describe('CompanyPlaceChoicesFacade', () => {
  let facade: CompanyPlaceChoicesFacade;
  let http: HttpTestingController;

  function setup(roles: string[]): void {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(CompanyPlaceChoicesFacade);
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => http?.match(() => true));

  it('carga las decisiones de la empresa y cuenta contra el tope de 1.000', () => {
    setup(['ORG_ANALYST']);
    facade.load();
    http.expectOne(LIST).flush({ data: [choiceDto(), choiceDto({ id: 'ch-2' })] });

    expect(facade.canManage()).toBeTrue();
    expect(facade.total()).toBe(2);
    expect(PLACE_CHOICES_LIMIT).toBe(1000);
  });

  it('el visor no pide nada: sin imports:create no se llama al servidor', () => {
    setup(['ORG_VIEWER']);
    facade.load();

    expect(facade.canManage()).toBeFalse();
    http.expectNone(LIST);
  });

  it('deshacer llama DELETE, guarda el resultado y vuelve a leer la lista', () => {
    setup(['ORG_ADMIN']);
    const choice = toPlaceChoice(choiceDto());
    facade.undo(choice);

    expect(facade.busy()).toBe('ch-1');
    http.expectOne({ method: 'DELETE', url: `${LIST}/ch-1` }).flush({ data: undoResultDto() });
    http.expectOne({ method: 'GET', url: LIST }).flush({ data: [] });

    expect(facade.busy()).toBeNull();
    expect(facade.outcome()).toEqual({ choice, result: { removed: true, tripsReverted: 102, tripsRecalculated: 95 } });
    expect(facade.total()).toBe(0);
  });

  it('un segundo «Deshacer» mientras se envía no repite la llamada', () => {
    setup(['ORG_ADMIN']);
    facade.undo(toPlaceChoice(choiceDto()));
    facade.undo(toPlaceChoice(choiceDto()));

    expect(http.match(`${LIST}/ch-1`).length).toBe(1);
  });

  it('404 PLACE_CHOICE_NOT_FOUND (otra persona ya la deshizo): mensaje propio y se vuelve a leer la lista', () => {
    setup(['ORG_ADMIN']);
    facade.undo(toPlaceChoice(choiceDto()));
    http.expectOne(`${LIST}/ch-1`).flush({ error: { code: 'PLACE_CHOICE_NOT_FOUND', message: 'x' } }, { status: 404, statusText: 'Not Found' });

    expect(facade.error()?.message).toContain('ya no existe');
    expect(facade.outcome()).toBeNull();
    http.expectOne({ method: 'GET', url: LIST });
  });

  it('al cambiar de empresa se limpia el estado', () => {
    setup(['ORG_ADMIN']);
    facade.undo(toPlaceChoice(choiceDto()));
    TestBed.inject(ContextResetRegistry).resetAll();

    expect(facade.busy()).toBeNull();
    expect(facade.outcome()).toBeNull();
  });
});
