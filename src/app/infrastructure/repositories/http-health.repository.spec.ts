import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTestApp } from '../../../testing/providers';
import { ServiceHealth } from '../../domain/models/platform';
import { HealthRepository } from '../../domain/repositories/platform.repositories';

const ROOT = 'http://api.test';
const SERVICES = `${ROOT}/api/v1/platform/services`;
const UP_ITEMS = [
  { id: 'sso', status: 'UP', checked_at: '2026-11-18T10:00:00Z', detail: 'Login de la cuenta de servicio exitoso.' },
  { id: 'directory', status: 'UP', checked_at: '2026-11-18T10:00:00Z', detail: 'El directorio respondió.' },
];

describe('HttpHealthRepository (estado de servicios real)', () => {
  let http: HttpTestingController;
  let result: readonly ServiceHealth[] = [];

  beforeEach(() => {
    result = [];
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(HealthRepository).check().subscribe((r) => (result = r));
  });

  const byId = (id: string): ServiceHealth => result.find((s) => s.id === id)!;
  type Body = Record<string, unknown>;
  const answer = (opts: { live?: Body | 'error'; ready?: Body | 'error' | 503; corporate?: Body[] | 'error' } = {}): void => {
    const { live = { status: 'alive' }, ready = { status: 'ready', database: 'connected' }, corporate = UP_ITEMS } = opts;
    const liveRequest = http.expectOne(`${ROOT}/health/live`);
    if (live === 'error') liveRequest.error(new ProgressEvent('error'));
    else liveRequest.flush(live);
    const readyRequest = http.expectOne(`${ROOT}/health`);
    if (ready === 'error') readyRequest.error(new ProgressEvent('error'));
    else if (ready === 503) readyRequest.flush({ detail: 'Database unavailable' }, { status: 503, statusText: 'Service Unavailable' });
    else readyRequest.flush(ready);
    const corporateRequest = http.expectOne(SERVICES);
    if (corporate === 'error') corporateRequest.error(new ProgressEvent('error'));
    else corporateRequest.flush({ data: { items: corporate } });
  };

  it('consulta /health/live y /health en la RAÍZ del backend y /platform/services bajo /api/v1', () => {
    answer();
    expect(http.match(() => true).length).toBe(0);
  });

  it('API y base de datos confirmadas → operativas, con fecha de verificación', () => {
    answer();
    expect(byId('api').status).toBe('UP');
    expect(byId('db').status).toBe('UP');
    expect(byId('db').checkedAt).toBeInstanceOf(Date);
  });

  it('un 503 de /health deja la base de datos como DOWN (nunca operativa)', () => {
    answer({ ready: 503 });
    expect(byId('api').status).toBe('UP');
    expect(byId('db').status).toBe('DOWN');
  });

  it('si la API no responde: API DOWN y base de datos NO VERIFICADA', () => {
    answer({ live: 'error', ready: 'error', corporate: 'error' });
    expect(byId('api').status).toBe('DOWN');
    expect(byId('db').status).toBe('UNVERIFIED');
    expect(byId('db').checkedAt).toBeNull();
  });

  it('un cuerpo inesperado no se interpreta como operativo', () => {
    answer({ live: { status: 'otra cosa' }, ready: { status: 'ready' } });
    expect(byId('api').status).toBe('DOWN');
    expect(byId('db').status).toBe('UNVERIFIED');
  });

  it('SSO y directorio toman el estado que informa el backend (no se deduce de /auth/me ni de la API)', () => {
    answer({ corporate: [
      { id: 'sso', status: 'UP', checked_at: '2026-11-18T10:00:00Z', detail: 'ok' },
      { id: 'directory', status: 'DEGRADED', checked_at: '2026-11-18T10:00:00Z', detail: 'rechazó la cuenta de servicio' },
    ] });
    expect(byId('sso').status).toBe('UP');
    expect(byId('sso').checkedAt).toBeInstanceOf(Date);
    expect(byId('directory').status).toBe('DEGRADED');
    expect(byId('directory').detail).toContain('rechazó');
  });

  it('si no se puede consultar /platform/services, SSO y directorio quedan «no verificados» (no «no disponibles»)', () => {
    answer({ corporate: 'error' });
    expect(byId('sso').status).toBe('UNVERIFIED');
    expect(byId('directory').status).toBe('UNVERIFIED');
    expect(byId('sso').checkedAt).toBeNull();
  });

  it('un estado desconocido del backend no se interpreta como operativo', () => {
    answer({ corporate: [{ id: 'sso', status: 'FUNCIONA', checked_at: null, detail: '' }] });
    expect(byId('sso').status).toBe('UNVERIFIED');
    expect(byId('directory').status).toBe('UNVERIFIED');
  });

  it('el procesamiento de archivos siempre queda «no verificado» (no existe comprobación)', () => {
    answer();
    expect(byId('imports').status).toBe('UNVERIFIED');
    expect(result.filter((s) => s.status === 'UP').map((s) => s.id)).toEqual(['api', 'db', 'sso', 'directory']);
  });

  it('un error HTTP del backend en /platform/services no rompe la verificación del resto', () => {
    http.expectOne(`${ROOT}/health/live`).flush({ status: 'alive' });
    http.expectOne(`${ROOT}/health`).flush({ status: 'ready', database: 'connected' });
    http.expectOne(SERVICES).flush({ detail: 'x' }, { status: 403, statusText: 'Forbidden' });
    expect(byId('api').status).toBe('UP');
    expect(byId('sso').status).toBe('UNVERIFIED');
  });
});
