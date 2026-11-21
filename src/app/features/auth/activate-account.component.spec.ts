import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideTestApp } from '../../../testing/providers';
import { ActivateAccountComponent, PENDING_INVITATION_KEY } from './activate-account.component';

const API = 'http://api.test/api/v1/onboarding';
const CODE = 'c'.repeat(43);

describe('ActivateAccountComponent (primer acceso con enlace de un solo uso)', () => {
  let fixture: ComponentFixture<ActivateAccountComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = (selector: string): HTMLElement => el().querySelector<HTMLElement>(selector)!;
  const type = (id: string, value: string): void => { const input = q(`#${id}`) as HTMLInputElement; input.value = value; input.dispatchEvent(new Event('input')); };

  function create(fragment: string | null = `codigo=${CODE}`): void {
    sessionStorage.removeItem(PENDING_INVITATION_KEY);
    TestBed.configureTestingModule({ imports: [ActivateAccountComponent], providers: [...provideTestApp(), provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { fragment } } }] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ActivateAccountComponent);
    fixture.detectChanges();
  }
  const check = (state: string): void => {
    http.expectOne(`${API}/activation/check`).flush({ data: { state, organization_name: 'Nueva SAS', email: state === 'VALID' ? 'ana@nueva.co' : null }, meta: {} });
    fixture.detectChanges();
  };

  it('valida el enlace antes de mostrar el formulario y no envía el código en la URL', () => {
    create();

    const req = http.expectOne(`${API}/activation/check`);
    expect(req.request.method).toBe('POST');
    expect(req.request.url).not.toContain(CODE); // el código viaja en el cuerpo, nunca en la URL
    expect(req.request.body).toEqual({ code: CODE });
    req.flush({ data: { state: 'VALID', organization_name: 'Nueva SAS', email: 'ana@nueva.co' }, meta: {} });
    fixture.detectChanges();

    expect(q('[data-testid="activation-org"]').textContent).toContain('Nueva SAS');
    expect((q('#act-email') as HTMLInputElement).value).toBe('ana@nueva.co');
  });

  it('exige confirmar la contraseña y no llama al backend si no coincide o es corta', () => {
    create(); check('VALID');

    type('act-pass', 'Clave-Segura-2026!'); type('act-confirm', 'otra'); fixture.detectChanges();
    q('form').dispatchEvent(new Event('submit')); fixture.detectChanges();
    http.expectNone(`${API}/activation`);
    expect(el().textContent).toContain('no coinciden');

    type('act-pass', 'corta'); type('act-confirm', 'corta'); fixture.detectChanges();
    q('form').dispatchEvent(new Event('submit')); fixture.detectChanges();
    http.expectNone(`${API}/activation`);
  });

  it('activa con la contraseña elegida, muestra el resultado y conserva el código solo para aceptar la invitación', () => {
    create(); check('VALID');
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    type('act-pass', 'Clave-Segura-2026!'); type('act-confirm', 'Clave-Segura-2026!'); fixture.detectChanges();
    q('form').dispatchEvent(new Event('submit'));
    const req = http.expectOne(`${API}/activation`);
    expect(req.request.body).toEqual({ code: CODE, password: 'Clave-Segura-2026!' });
    req.flush({ data: { email: 'ana@nueva.co', organization_name: 'Nueva SAS' }, meta: {} });
    fixture.detectChanges();

    expect(q('[data-testid="activation-done"]').textContent).toContain('Cuenta activada');
    expect(el().textContent).not.toContain('Clave-Segura-2026!'); // la contraseña no se vuelve a mostrar
    expect(el().querySelector('form')).toBeNull(); // el formulario desaparece: la contraseña no queda en pantalla
    q('[data-testid="activation-login"]').click();
    expect(sessionStorage.getItem(PENDING_INVITATION_KEY)).toBe(CODE);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/aceptar-invitacion' } });
  });

  it('si el proveedor rechaza la contraseña, se explica la política y el formulario sigue disponible', () => {
    create(); check('VALID');

    type('act-pass', 'Clave-Segura-2026!'); type('act-confirm', 'Clave-Segura-2026!'); fixture.detectChanges();
    q('form').dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/activation`).flush({ error: { code: 'DIRECTORY_PASSWORD_REJECTED', message: 'rechazada' } }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();

    expect(q('[data-testid="activation-error"]').textContent).toContain('política corporativa');
    expect(q('[data-testid="activation-submit"]')).not.toBeNull();
  });

  for (const [state, text] of [['EXPIRED', 'expiró'], ['USED', 'ya fue activada'], ['NOT_APPLICABLE', 'credenciales actuales'], ['INVALID', 'no es válido']] as const) {
    it(`un enlace ${state} no muestra el formulario y explica qué hacer`, () => {
      create(); check(state);

      expect(q('[data-testid="activation-blocked"]').textContent).toContain(text);
      expect(el().querySelector('form')).toBeNull();
    });
  }

  it('sin código en el enlace no consulta al backend', () => {
    create(null);

    http.expectNone(`${API}/activation/check`);
    expect(q('[data-testid="activation-blocked"]').textContent).toContain('no es válido');
  });
});
