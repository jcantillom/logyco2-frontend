import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { AppError } from '../../core/errors/app-error';
import { buildSuperAdmin, buildUser } from '../../../testing/builders';
import { provideTestApp } from '../../../testing/providers';
import { CurrentUser } from '../../domain/models/identity';
import { AuthRepository } from '../../domain/repositories/identity.repositories';
import { LoginComponent, SUCCESS_MS } from './login.component';

class FakeAuthRepository extends AuthRepository {
  logout = jasmine.createSpy('logout').and.returnValue(of(undefined) as Observable<void>);
  login = jasmine.createSpy('login').and.returnValue(of(undefined) as Observable<void>);
  getCurrentUser = jasmine.createSpy('me').and.returnValue(of(buildUser()) as Observable<CurrentUser>);
}

describe('LoginComponent: textos, accesibilidad y estados', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let repo: FakeAuthRepository;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const input = (id: string): HTMLInputElement => el().querySelector<HTMLInputElement>(`#${id}`)!;
  const type = (id: string, value: string): void => {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
  };
  const submit = (): void => {
    el().querySelector<HTMLButtonElement>('[data-testid="login-submit"]')!.click();
    fixture.detectChanges();
  };

  function setup(queryParams: Record<string, string> = {}): void {
    repo = new FakeAuthRepository();
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        ...provideTestApp(),
        { provide: AuthRepository, useValue: repo },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
      ],
    });
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
  }

  it('comunica el propósito real de la plataforma, con los textos definidos', () => {
    setup();
    const text = el().textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Transformamos datos logísticos en decisiones para reducir emisiones.');
    expect(text).toContain('permite medir la huella de carbono del transporte de carga, analizar operaciones, comparar indicadores');
    expect(text).toContain('Medimos el transporte. Impulsamos la descarbonización.');
    expect(text).toContain('Una plataforma de');
    expect(el().querySelector('h1')?.textContent).toContain('Bienvenido a LoGyCO2');
    expect(text).toContain('Ingresa con tu cuenta autorizada para consultar y gestionar la huella de carbono de tu empresa.');
    expect(text).toContain('Acceso seguro mediante el servicio de autenticación de LOGYCA.');
    expect(el().querySelector('[data-testid="login-submit"]')?.textContent?.trim()).toBe('Iniciar sesión');
  });

  it('muestra el logo del CLI con su nombre accesible, solo en el formulario', () => {
    setup();
    const img = el().querySelector<HTMLImageElement>('[data-testid="login-cli-logo"] img');
    expect(img?.getAttribute('src')).toBe('brand/logo-cli.svg');
    expect(img?.getAttribute('alt')).toBe('Centro Latinoamericano de Innovación en Logística (CLI)');
  });

  it('no promete funcionalidades pendientes ni muestra explicaciones técnicas de sesión', () => {
    setup();
    const text = el().textContent!.toLowerCase();
    expect(text).not.toContain('al recargar');
    expect(text).not.toContain('esta pestaña');
    expect(text).not.toContain('conciliación');
    expect(text).not.toContain('evidencia');
  });

  it('el CO₂ del título lleva subíndice real (<sub>)', () => {
    setup();
    expect(el().querySelector('h1 .co2 sub')?.textContent).toBe('2');
  });

  it('mostrar/ocultar contraseña: alterna el tipo y el estado accesible', () => {
    setup();
    const toggle = el().querySelector<HTMLButtonElement>('[data-testid="toggle-password"]')!;
    expect(input('password').type).toBe('password');
    expect(toggle.getAttribute('aria-label')).toBe('Mostrar contraseña');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    toggle.click();
    fixture.detectChanges();

    expect(input('password').type).toBe('text');
    expect(toggle.getAttribute('aria-label')).toBe('Ocultar contraseña');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('campos inválidos: aria-invalid y aria-describedby apuntan al mensaje', () => {
    setup();
    submit();
    expect(input('email').getAttribute('aria-invalid')).toBe('true');
    const describedBy = input('email').getAttribute('aria-describedby')!;
    expect(el().querySelector(`#${describedBy}`)?.textContent).toContain('Ingresa tu correo electrónico.');
  });

  it('un envío inválido lleva el foco al primer campo con error', async () => {
    setup();
    document.body.appendChild(el());
    submit();
    await new Promise((resolve) => setTimeout(resolve));
    expect(document.activeElement).toBe(input('email'));
    el().remove();
  });

  it('durante la carga: botón deshabilitado, aria-busy y un solo envío aunque se insista', () => {
    setup();
    repo.login.and.returnValue(NEVER);
    type('email', 'ana@example.com');
    type('password', 'secreto');

    submit();
    submit();
    submit();

    const button = el().querySelector<HTMLButtonElement>('[data-testid="login-submit"]')!;
    expect(repo.login).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBeTrue();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toContain('Iniciando sesión');
  });

  it('si se llegó por una ruta protegida, invita a iniciar sesión para continuar', () => {
    setup({ returnUrl: '/reportes' });
    expect(el().querySelector('[data-testid="continue-notice"]')?.textContent).toContain('Inicia sesión para continuar.');
  });

  it('sesión caducada: muestra el aviso específico', () => {
    setup({ reason: 'expired', returnUrl: '/usuarios' });
    expect(el().querySelector('[data-testid="expired-notice"]')).not.toBeNull();
    expect(el().querySelector('[data-testid="continue-notice"]')).toBeNull();
  });

  it('el logo de marca y la firma institucional están presentes', () => {
    setup();
    expect(el().querySelector('app-logo svg[role="img"]')).not.toBeNull();
    expect(el().querySelector('app-logyca-logo img[alt="LOGYCA"]')).not.toBeNull();
    expect(el().querySelector('app-logyca-logo .chip')).toBeNull(); // sin fondo blanco
  });

  it('el lockup del login es grande (alto 92 px en escritorio o 62 px en pantalla estrecha, cabe en su ancho)', () => {
    setup();
    const svg = el().querySelector<SVGSVGElement>('app-logo svg')!;
    const height = parseFloat(svg.style.height);
    expect([62, 92]).toContain(height);
    expect(matchMedia('(max-width: 860px)').matches ? height === 62 : height === 92).toBeTrue();
  });

  it('muestra el recorrido de la plataforma (Registra, Mide, Compara, Reduce) y el lema que explica su propósito', () => {
    setup();
    const labels = Array.from(el().querySelectorAll('.step')).map((n) => n.textContent?.trim());
    expect(labels).toEqual(['Registra', 'Mide', 'Compara', 'Reduce']);
    expect(el().querySelector('app-logo svg')!.getAttribute('aria-label')).toContain('mide, analiza y reduce tu huella de carbono');
    expect(el().textContent).not.toContain('Inteligencia de carbono para la logística');
  });

  it('los elementos decorativos animados están ocultos a tecnologías de asistencia', () => {
    setup();
    expect(el().querySelector('svg.visual')!.getAttribute('aria-hidden')).toBe('true');
    el().querySelectorAll('.blob').forEach((blob) => expect(blob.getAttribute('aria-hidden')).toBe('true'));
  });

  it('el foco de luz sigue al cursor (variables CSS) sin romper el layout', async () => {
    setup();
    const panel = el().querySelector<HTMLElement>('.brand-panel')!;
    panel.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 80, bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      expect(panel.style.getPropertyValue('--mx')).toMatch(/px$/);
    }
  });

  it('avisa cuando Bloq Mayús está activo al escribir la contraseña y lo oculta al salir del campo', () => {
    setup();
    const pass = input('password');
    pass.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', modifierCapsLock: true }));
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="caps-lock"]')?.textContent).toContain('Bloq Mayús');

    pass.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="caps-lock"]')).toBeNull();
  });

  describe('transición animada al iniciar sesión', () => {
    function loginOk(): Router {
      type('email', 'ana@example.com');
      type('password', 'secreto');
      submit();
      return TestBed.inject(Router);
    }

    it('sustituye el formulario por un estado de éxito accesible (role=status) con onda de transición', fakeAsync(() => {
      setup();
      loginOk();

      const success = el().querySelector('[data-testid="login-success"]')!;
      expect(success.getAttribute('role')).toBe('status');
      expect(success.textContent).toContain('Acceso verificado');
      expect(success.textContent).toContain('Preparando tu espacio de trabajo');
      expect(el().querySelector('.wipe')!.getAttribute('aria-hidden')).toBe('true');
      expect(el().querySelector('.brand-panel')!.classList.contains('leaving')).toBeTrue();
      expect(el().querySelector('[data-testid="login-submit"]')).toBeNull(); // sin doble envío posible
      tick(SUCCESS_MS);
    }));

    it('la animación dura lo suficiente para apreciarse y el telón arranca al final, no encima del mensaje', fakeAsync(() => {
      setup();
      loginOk();

      expect(SUCCESS_MS).toBeGreaterThanOrEqual(3000);
      const wrap = el().querySelector<HTMLElement>('.wrap')!;
      expect(wrap.style.getPropertyValue('--t')).toBe(`${SUCCESS_MS}ms`);
      expect(el().querySelectorAll('.milestones li').length).toBe(3);
      expect(el().querySelector('.mini-truck')).not.toBeNull();
      tick(SUCCESS_MS);
    }));

    it('saluda por el primer nombre y anuncia el destino según el rol', fakeAsync(() => {
      setup();
      repo.getCurrentUser.and.returnValue(of(buildSuperAdmin()));
      loginOk();

      const text = el().querySelector('[data-testid="login-success"]')!.textContent!;
      expect(el().querySelector('[data-testid="login-greeting"]')!.textContent).toMatch(/^¡Hola, \S+!$/);
      expect(text).toContain('Abriendo la consola de plataforma');
      expect(text).toContain('Consola de plataforma lista');
      tick(SUCCESS_MS);
    }));

    it('«Entrar ahora» navega de inmediato y no navega dos veces', fakeAsync(() => {
      setup({ returnUrl: '/reportes' });
      const router = loginOk();

      el().querySelector<HTMLButtonElement>('[data-testid="login-skip"]')!.click();
      expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/reportes');
      tick(SUCCESS_MS);
      expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
    }));

    it('navega solo cuando termina la animación y respeta returnUrl', fakeAsync(() => {
      setup({ returnUrl: '/reportes' });
      const router = loginOk();

      tick(SUCCESS_MS - 500);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
      tick(600);
      expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/reportes');
    }));

    it('un returnUrl externo se ignora también con la transición', fakeAsync(() => {
      setup({ returnUrl: 'https://evil.example' });
      const router = loginOk();
      tick(SUCCESS_MS + 100);
      expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/resumen');
    }));

    it('si el usuario sale de la pantalla durante la animación, no se navega después', fakeAsync(() => {
      setup();
      const router = loginOk();
      fixture.destroy();
      tick(SUCCESS_MS + 500);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    }));

    it('un login fallido NO muestra la transición', fakeAsync(() => {
      setup();
      repo.login.and.returnValue(throwError(() => new AppError('unauthenticated', 'INVALID_CREDENTIALS', 401, 'x')));
      loginOk();
      tick(SUCCESS_MS + 500);
      expect(el().querySelector('[data-testid="login-success"]')).toBeNull();
      expect(el().querySelector('[data-testid="login-error"]')).not.toBeNull();
    }));
  });

  describe('destino tras iniciar sesión según el rol global', () => {
    it('un SUPER_ADMIN sin ruta solicitada aterriza en la consola de plataforma', fakeAsync(() => {
      setup();
      repo.getCurrentUser.and.returnValue(of(buildSuperAdmin()));
      type('email', 'admin@example.com'); type('password', 'secreto'); submit();
      tick(SUCCESS_MS + 100);
      expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledOnceWith('/plataforma/resumen');
    }));

    it('un ORG_ADMIN aterriza en su espacio, nunca en la consola global', fakeAsync(() => {
      setup();
      type('email', 'ana@example.com'); type('password', 'secreto'); submit();
      tick(SUCCESS_MS + 100);
      expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledOnceWith('/resumen');
    }));

    it('una ruta solicitada se respeta también para un SUPER_ADMIN', fakeAsync(() => {
      setup({ returnUrl: '/plataforma/usuarios' });
      repo.getCurrentUser.and.returnValue(of(buildSuperAdmin()));
      type('email', 'admin@example.com'); type('password', 'secreto'); submit();
      tick(SUCCESS_MS + 100);
      expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledOnceWith('/plataforma/usuarios');
    }));
  });
});
