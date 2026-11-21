import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { buildUser, FAKE_TOKEN } from '../../../testing/builders';
import { provideTestApp } from '../../../testing/providers';
import { AppError } from '../../core/errors/app-error';
import { AuthToken, CurrentUser } from '../../domain/models/identity';
import { AuthRepository } from '../../domain/repositories/identity.repositories';
import { LoginComponent, SUCCESS_MS } from './login.component';

class FakeAuthRepository extends AuthRepository {
  login = jasmine.createSpy('login').and.returnValue(of(FAKE_TOKEN) as Observable<AuthToken>);
  getCurrentUser = jasmine.createSpy('me').and.returnValue(of(buildUser()) as Observable<CurrentUser>);
}

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let repo: FakeAuthRepository;
  let router: Router;

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

  beforeEach(() => {
    repo = new FakeAuthRepository();
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [...provideTestApp(), { provide: AuthRepository, useValue: repo }],
    });
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
  });

  it('valida los campos antes de llamar al backend', () => {
    submit();
    expect(repo.login).not.toHaveBeenCalled();
    expect(el().textContent).toContain('Ingresa tu correo electrónico.');
    expect(el().textContent).toContain('Ingresa tu contraseña.');
  });

  it('rechaza un correo con formato inválido', () => {
    type('email', 'no-es-correo');
    type('password', 'x');
    submit();
    expect(repo.login).not.toHaveBeenCalled();
    expect(el().textContent).toContain('El correo no tiene un formato válido.');
  });

  it('login correcto: muestra la transición y navega al inicio al terminar; la contraseña ya no está en pantalla', fakeAsync(() => {
    type('email', ' ana@example.com ');
    type('password', 'secreto');
    submit();

    expect(repo.login).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'secreto' });
    expect(router.navigateByUrl).not.toHaveBeenCalled(); // espera a que termine la animación
    expect(el().querySelector('[data-testid="login-success"]')).not.toBeNull();
    expect(el().querySelector('#password')).toBeNull();

    tick(SUCCESS_MS);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/resumen');
  }));

  it('credenciales incorrectas: muestra el mensaje del catálogo en un alert', () => {
    repo.login.and.returnValue(throwError(() => new AppError('unauthenticated', 'INVALID_CREDENTIALS', 401, 'El correo o la contraseña no son correctos.')));
    type('email', 'ana@example.com');
    type('password', 'mala');
    submit();

    const alert = el().querySelector('[data-testid="login-error"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('El correo o la contraseña no son correctos.');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('usuario no registrado: deriva al flujo de aceptar invitación', () => {
    repo.getCurrentUser.and.returnValue(throwError(() => new AppError('forbidden', 'USER_NOT_REGISTERED', 403, 'x')));
    type('email', 'nuevo@example.com');
    type('password', 'secreto');
    submit();

    expect(router.navigate).toHaveBeenCalledWith(['/aceptar-invitacion']);
  });

  it('limita el reintento mostrando Retry-After', () => {
    repo.login.and.returnValue(throwError(() => new AppError('rate-limited', 'LOGIN_RATE_LIMITED', 429, 'Demasiados intentos.', null, [], 45)));
    type('email', 'ana@example.com');
    type('password', 'x');
    submit();

    expect(el().textContent).toContain('Reintenta en 45 s.');
  });
});
