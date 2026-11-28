import { ActivatedRoute } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { buildSuperAdmin, buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { PLACES_URL } from '../../../testing/places';
import { SETTINGS_URL, settingsDto } from '../../../testing/vehicle-efficiency';
import { SessionStore } from '../../core/auth/session.store';
import { SettingsComponent } from './settings.component';

const PLACES_CHOICES_URL = `${PLACES_URL}/choices`;

describe('Configuración', () => {
  function render(platform: boolean): HTMLElement {
    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [...provideTestApp(), { provide: ActivatedRoute, useValue: { snapshot: { data: { platform } } } }],
    });
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('en la consola de plataforma solo muestra la cuenta (sin empresas)', () => {
    const el = render(true);
    expect(el.querySelector('#prof')?.textContent).toContain('Mi cuenta');
    expect(el.querySelector('#orgs')).toBeNull();
    expect(el.textContent).not.toContain('No perteneces a ninguna empresa');
  });

  it('en el espacio de empresa conserva sus empresas', () => {
    const el = render(false);
    expect(el.querySelector('#orgs')).not.toBeNull();
  });

  describe('Importación de cargas (ajustes de la empresa)', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<SettingsComponent>>;
    let http: HttpTestingController;
    const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
    const radios = (name: string): HTMLInputElement[] => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));

    function renderAs(roles: string[], settings: object = settingsDto()): void {
      TestBed.configureTestingModule({ imports: [SettingsComponent], providers: [...provideTestApp(), { provide: ActivatedRoute, useValue: { snapshot: { data: { platform: false } } } }] });
      signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
      http = TestBed.inject(HttpTestingController);
      fixture = TestBed.createComponent(SettingsComponent);
      fixture.detectChanges();
      http.expectOne(SETTINGS_URL).flush({ data: settings });
      fixture.detectChanges();
    }

    afterEach(() => http?.match(() => true));

    it('ORG_ADMIN ve las opciones del servidor con la vigente marcada y puede cambiarlas', () => {
      renderAs(['ORG_ADMIN']);

      expect(radios('est-mode').map((r) => r.value)).toEqual(['OFF', 'ASK', 'AUTO']);
      expect(radios('est-mode').find((r) => r.checked)!.value).toBe('ASK');
      expect(radios('cargo-mode').map((r) => r.value)).toEqual(['ASK', 'AUTO_KG']);
      expect(radios('est-mode').every((r) => !r.disabled)).toBeTrue();

      radios('est-mode')[2].click();
      fixture.detectChanges();
      const put = http.expectOne(SETTINGS_URL);

      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ mode: 'AUTO' });
      put.flush({ data: settingsDto({ mode: 'AUTO' }) });
      fixture.detectChanges();

      expect(radios('est-mode').find((r) => r.checked)!.value).toBe('AUTO');
      expect(q('[data-testid="settings-saved"]')!.textContent).toContain('Rendimiento al importar: estimar automáticamente.');
    });

    it('cambiar solo la unidad de la carga envía solo cargo_unit_mode', () => {
      renderAs(['ORG_ADMIN']);
      radios('cargo-mode')[1].click();
      fixture.detectChanges();

      expect(http.expectOne(SETTINGS_URL).request.body).toEqual({ cargo_unit_mode: 'AUTO_KG' });
    });

    it('un lector ve los ajustes en solo lectura, con la nota, y no puede enviar cambios', () => {
      renderAs(['ORG_VIEWER']);

      expect(radios('est-mode').every((r) => r.matches(':disabled'))).toBeTrue();
      expect(radios('cargo-mode').every((r) => r.matches(':disabled'))).toBeTrue();
      expect(q('[data-testid="settings-readonly"]')!.textContent).toContain('Solo un administrador');
    });

    it('«Lugares de tu empresa» sale con imports:create y lee las decisiones; el visor no la ve ni pide nada', () => {
      renderAs(['ORG_ANALYST']);

      expect(q('[data-testid="place-choices-card"] h2')!.textContent).toContain('Lugares de tu empresa');
      http.expectOne({ method: 'GET', url: PLACES_CHOICES_URL }).flush({ data: [] });
      fixture.detectChanges();

      expect(q('[data-testid="place-choices-empty"]')).not.toBeNull();
    });

    it('un lector no ve «Lugares de tu empresa» ni llama al servidor', () => {
      renderAs(['ORG_VIEWER']);

      expect(q('[data-testid="place-choices-card"]')).toBeNull();
      http.expectNone(PLACES_CHOICES_URL);
    });

    it('con la bandera global apagada lo dice', () => {
      renderAs(['ORG_ADMIN'], settingsDto({ platform_enabled: false }));

      expect(q('[data-testid="settings-platform-off"]')).not.toBeNull();
    });

    it('un error al guardar se anuncia con role=alert', () => {
      renderAs(['ORG_ADMIN']);
      radios('est-mode')[0].click();
      http.expectOne(SETTINGS_URL).flush({ error: { code: 'ORGANIZATION_ACCESS_DENIED', message: 'x' } }, { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();

      expect(q('[data-testid="settings-error"]')!.getAttribute('role')).toBe('alert');
      expect(radios('est-mode').find((r) => r.checked)!.value).toBe('ASK');
    });

    it('el CSS de los ajustes usa solo tokens, sin scroll interno', () => {
      renderAs(['ORG_ADMIN']);
      const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '')).filter((c) => c.includes('.opt:has')).join('\n');

      expect(css).toContain('.opt');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      expect(css).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
    });
  });
});
