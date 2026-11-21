import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { buildUser, FAKE_TOKEN, ORG_ENVIA } from '../../../testing/builders';
import { AppError } from '../errors/app-error';
import { SessionStore } from '../auth/session.store';
import { APP_CONFIG } from '../config/app-config';
import { OrganizationContext } from '../org/organization-context';
import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';

const API = 'http://api.test/api/v1';

describe('interceptores HTTP', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let session: SessionStore;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate'], { url: '/usuarios' });
    router.navigate.and.resolveTo(true);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1' } },
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
  });

  afterEach(() => controller.verify());

  it('adjunta el Bearer token a peticiones de la API', () => {
    session.setToken(FAKE_TOKEN);
    http.get(`${API}/auth/me`).subscribe();
    expect(controller.expectOne(`${API}/auth/me`).request.headers.get('Authorization')).toBe('Bearer token-de-prueba');
  });

  it('NO envía el token a otros orígenes', () => {
    session.setToken(FAKE_TOKEN);
    http.get('https://tercero.example.com/datos').subscribe();
    expect(controller.expectOne('https://tercero.example.com/datos').request.headers.has('Authorization')).toBeFalse();
  });

  it('no agrega cabecera sin sesión', () => {
    http.get(`${API}/organizations`).subscribe();
    expect(controller.expectOne(`${API}/organizations`).request.headers.has('Authorization')).toBeFalse();
  });

  it('convierte los errores en AppError', () => {
    let error: unknown;
    http.get(`${API}/organizations`).subscribe({ error: (e) => (error = e) });
    controller.expectOne(`${API}/organizations`).flush({ error: { code: 'FORBIDDEN' } }, { status: 403, statusText: 'Forbidden' });

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).kind).toBe('forbidden');
  });

  it('401 con sesión activa: cierra la sesión local y redirige a /login (sesión caducada)', () => {
    session.setToken(FAKE_TOKEN);
    session.setUser(buildUser());
    http.get(`${API}/users`).subscribe({ error: () => undefined });
    controller.expectOne(`${API}/users`).flush({ error: { code: 'INVALID_TOKEN' } }, { status: 401, statusText: 'Unauthorized' });

    expect(session.hasToken()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'expired', returnUrl: '/usuarios' } });
  });

  it('401 durante el login (sin sesión) no se trata como sesión caducada', () => {
    http.post(`${API}/auth/login`, {}).subscribe({ error: () => undefined });
    controller.expectOne(`${API}/auth/login`).flush({ error: { code: 'INVALID_CREDENTIALS' } }, { status: 401, statusText: 'Unauthorized' });

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('403 por empresa inactiva marca el acceso como perdido sin cerrar sesión', () => {
    session.setToken(FAKE_TOKEN);
    session.setUser(buildUser());
    const context = TestBed.inject(OrganizationContext);
    expect(context.activeAccessLost()).toBeFalse();

    http.get(`${API}/organizations/${ORG_ENVIA.id}`).subscribe({ error: () => undefined });
    controller.expectOne(`${API}/organizations/${ORG_ENVIA.id}`).flush({ error: { code: 'ORGANIZATION_INACTIVE' } }, { status: 403, statusText: 'Forbidden' });

    expect(context.activeAccessLost()).toBeTrue();
    expect(session.isAuthenticated()).toBeTrue();
  });

  it('404 no se reinterpreta como pérdida de acceso (el backend oculta la existencia)', () => {
    session.setToken(FAKE_TOKEN);
    session.setUser(buildUser());
    const context = TestBed.inject(OrganizationContext);

    http.get(`${API}/organizations/${ORG_ENVIA.id}`).subscribe({ error: () => undefined });
    controller.expectOne(`${API}/organizations/${ORG_ENVIA.id}`).flush({ error: { code: 'RESOURCE_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });

    expect(context.activeAccessLost()).toBeFalse();
  });
});
