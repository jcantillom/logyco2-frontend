import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { METHODOLOGY_URL, methodologyDto } from '../../../testing/methodology';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { MethodologyFacade } from './methodology.facade';

describe('MethodologyFacade', () => {
  let facade: MethodologyFacade;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(MethodologyFacade);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.match(() => true));

  it('abrir pide la declaración una vez: pasa por «cargando» y deja el dominio', () => {
    facade.show();
    expect(facade.open()).toBeTrue();
    expect(facade.methodology.status()).toBe('loading');
    http.expectOne(METHODOLOGY_URL).flush({ data: methodologyDto() });
    expect(facade.methodology.status()).toBe('ready');
    expect(facade.methodology.data()?.declaration.id).toBe('LGC-CO2-TTW');

    facade.hide();
    facade.show();
    http.expectNone(METHODOLOGY_URL);
  });

  it('un error queda en `error` y «load» lo reintenta', () => {
    facade.show();
    http.expectOne(METHODOLOGY_URL).flush({ error: { code: 'INTERNAL', message: 'Falló' } }, { status: 500, statusText: 'Server Error' });
    expect(facade.methodology.status()).toBe('error');

    facade.load();
    expect(facade.methodology.status()).toBe('loading');
    http.expectOne(METHODOLOGY_URL).flush({ data: methodologyDto() });
    expect(facade.methodology.status()).toBe('ready');
  });

  it('cambiar de empresa o cerrar sesión cierra el diálogo y descarta los datos', () => {
    facade.show();
    http.expectOne(METHODOLOGY_URL).flush({ data: methodologyDto() });
    TestBed.inject(ContextResetRegistry).resetAll();

    expect(facade.open()).toBeFalse();
    expect(facade.methodology.data()).toBeNull();
  });
});
