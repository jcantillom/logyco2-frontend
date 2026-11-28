import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { buildUser, ORG_ENVIA } from '../../../testing/builders';
import { AppError } from '../errors/app-error';
import { SessionStore } from '../auth/session.store';
import { APP_CONFIG } from '../config/app-config';
import { OrganizationContext } from '../org/organization-context';
import { CSRF_HEADER, CSRF_VALUE, authInterceptor } from './auth.interceptor';
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

  it('las peticiones de lectura a la API viajan con credenciales (cookie) y sin cabecera anti-CSRF', () => {
    http.get(`${API}/auth/me`).subscribe();
    const request = controller.expectOne(`${API}/auth/me`).request;
    expect(request.withCredentials).toBeTrue();
    expect(request.headers.has(CSRF_HEADER)).toBeFalse();
  });

  it('las peticiones que cambian estado añaden la cabecera anti-CSRF', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      http.request(method, `${API}/organizations`).subscribe();
      const request = controller.expectOne(`${API}/organizations`).request;
      expect(request.headers.get(CSRF_HEADER)).withContext(method).toBe(CSRF_VALUE);
      expect(request.withCredentials).withContext(method).toBeTrue();
    }
  });

  it('NO envía credenciales ni cabecera a otros orígenes', () => {
    http.post('https://tercero.example.com/datos', {}).subscribe();
    const request = controller.expectOne('https://tercero.example.com/datos').request;
    expect(request.withCredentials).toBeFalse();
    expect(request.headers.has(CSRF_HEADER)).toBeFalse();
    expect(request.headers.has('Authorization')).toBeFalse();
  });

  it('nunca adjunta un token: la aplicación no lo conoce', () => {
    session.markIdentity();
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
    session.markIdentity();
    session.setUser(buildUser());
    http.get(`${API}/users`).subscribe({ error: () => undefined });
    controller.expectOne(`${API}/users`).flush({ error: { code: 'INVALID_TOKEN' } }, { status: 401, statusText: 'Unauthorized' });

    expect(session.hasIdentity()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'expired', returnUrl: '/usuarios' } });
  });

  it('401 durante el login (sin sesión) no se trata como sesión caducada', () => {
    http.post(`${API}/auth/login`, {}).subscribe({ error: () => undefined });
    controller.expectOne(`${API}/auth/login`).flush({ error: { code: 'INVALID_CREDENTIALS' } }, { status: 401, statusText: 'Unauthorized' });

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('403 por empresa inactiva marca el acceso como perdido sin cerrar sesión', () => {
    session.markIdentity();
    session.setUser(buildUser());
    const context = TestBed.inject(OrganizationContext);
    expect(context.activeAccessLost()).toBeFalse();

    http.get(`${API}/organizations/${ORG_ENVIA.id}`).subscribe({ error: () => undefined });
    controller.expectOne(`${API}/organizations/${ORG_ENVIA.id}`).flush({ error: { code: 'ORGANIZATION_INACTIVE' } }, { status: 403, statusText: 'Forbidden' });

    expect(context.activeAccessLost()).toBeTrue();
    expect(session.isAuthenticated()).toBeTrue();
  });

  it('404 no se reinterpreta como pérdida de acceso (el backend oculta la existencia)', () => {
    session.markIdentity();
    session.setUser(buildUser());
    const context = TestBed.inject(OrganizationContext);

    http.get(`${API}/organizations/${ORG_ENVIA.id}`).subscribe({ error: () => undefined });
    controller.expectOne(`${API}/organizations/${ORG_ENVIA.id}`).flush({ error: { code: 'RESOURCE_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });

    expect(context.activeAccessLost()).toBeFalse();
  });
});

describe('authInterceptor con la API en el mismo origen (URL relativa, proxy de desarrollo)', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: '', apiPrefix: '/api/v1' } },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('las URLs relativas de la API viajan con credenciales y cabecera anti-CSRF', () => {
    http.post('/api/v1/auth/login', {}).subscribe();
    const request = controller.expectOne('/api/v1/auth/login').request;
    expect(request.withCredentials).toBeTrue();
    expect(request.headers.get(CSRF_HEADER)).toBe(CSRF_VALUE);
  });

  it('con query string también cuenta como API', () => {
    http.get('/api/v1?x=1').subscribe();
    expect(controller.expectOne('/api/v1?x=1').request.withCredentials).toBeTrue();
  });

  it('rutas parecidas, terceros y URLs protocolo-relativas NO reciben credenciales', () => {
    for (const url of ['/api/v1evil/x', '/api/v2/x', '//evil.example/api/v1/x', 'https://tile.openstreetmap.org/1/1/1.png', '/assets/logo.svg']) {
      http.post(url, {}).subscribe();
      const request = controller.expectOne(url).request;
      expect(request.withCredentials).withContext(url).toBeFalse();
      expect(request.headers.has(CSRF_HEADER)).withContext(url).toBeFalse();
    }
  });
});
