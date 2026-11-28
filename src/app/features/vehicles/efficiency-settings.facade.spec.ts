import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SETTINGS_URL, settingsDto } from '../../../testing/vehicle-efficiency';
import { SessionStore } from '../../core/auth/session.store';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { EfficiencySettingsFacade } from './efficiency-settings.facade';

describe('EfficiencySettingsFacade', () => {
  let facade: EfficiencySettingsFacade;
  let http: HttpTestingController;

  function setup(roles: string[]): void {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(EfficiencySettingsFacade);
    http = TestBed.inject(HttpTestingController);
  }

  afterEach(() => http.match(() => true));

  it('ORG_ADMIN lee y puede cambiar; un cambio reemplaza lo mostrado con lo que responde el servidor', () => {
    setup(['ORG_ADMIN']);
    facade.load();
    http.expectOne(SETTINGS_URL).flush({ data: settingsDto() });

    expect(facade.canManage()).toBeTrue();
    expect(facade.asksConsent()).toBeTrue();

    facade.update({ mode: 'AUTO' }, 'Listo');
    expect(facade.saving()).toBeTrue();
    const put = http.expectOne(SETTINGS_URL);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ mode: 'AUTO' });
    put.flush({ data: settingsDto({ mode: 'AUTO' }) });

    expect(facade.saving()).toBeFalse();
    expect(facade.settings.data()!.mode).toBe('AUTO');
    expect(facade.asksConsent()).toBeFalse();
    expect(facade.announcement()).toBe('Listo');
  });

  it('con la bandera global apagada no se pide consentimiento aunque el modo sea ASK', () => {
    setup(['ORG_ADMIN']);
    facade.load();
    http.expectOne(SETTINGS_URL).flush({ data: settingsDto({ platform_enabled: false }) });

    expect(facade.asksConsent()).toBeFalse();
  });

  it('un lector (ORG_VIEWER) lee pero no cambia: no se envía ningún PUT', () => {
    setup(['ORG_VIEWER']);
    facade.load();
    http.expectOne(SETTINGS_URL).flush({ data: settingsDto() });
    facade.update({ mode: 'OFF' }, 'x');

    expect(facade.canRead()).toBeTrue();
    expect(facade.canManage()).toBeFalse();
    http.expectNone(SETTINGS_URL);
  });

  it('un error al guardar muestra el texto del catálogo y deja lo anterior', () => {
    setup(['ORG_ADMIN']);
    facade.load();
    http.expectOne(SETTINGS_URL).flush({ data: settingsDto() });
    facade.update({ mode: 'OFF' }, 'x');
    http.expectOne(SETTINGS_URL).flush({ error: { code: 'ORGANIZATION_ACCESS_DENIED', message: 'x' } }, { status: 403, statusText: 'Forbidden' });

    expect(facade.saveError()!.message).toContain('No tienes acceso');
    expect(facade.settings.data()!.mode).toBe('ASK');
    expect(facade.saving()).toBeFalse();
  });

  it('al cambiar de empresa se descarta todo', () => {
    setup(['ORG_ADMIN']);
    facade.load();
    http.expectOne(SETTINGS_URL).flush({ data: settingsDto() });
    TestBed.inject(ContextResetRegistry).resetAll();

    expect(facade.settings.data()).toBeNull();
    expect(facade.announcement()).toBe('');
  });
});
