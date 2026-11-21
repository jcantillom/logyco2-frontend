import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { PlatformStatusComponent } from './platform-status.component';

const processing = (over: Record<string, unknown> = {}) => ({
  runs: 10, completed: 8, failed: 1, running: 1, records_seen: 1200, inserted: 100, revised: 20, unchanged: 1080,
  duration_p95_seconds: 38.5, duration_avg_seconds: 25, ...over,
});
const source = (code: string, name: string, status: string, error: string | null = null, success: string | null = '2026-11-18T10:00:00Z') => ({
  code, name, status, last_attempt_at: '2026-11-18T10:00:00Z', last_success_at: success, last_error_code: error,
});
const operations = (over: Record<string, unknown> = {}, previous: Record<string, unknown> = {}, comparable = true, blocked = 0, sources = [source('A', 'Combustibles', 'OK'), source('B', 'Gas natural', 'FAILING', 'GNCV_UNEXPECTED_RESPONSE')]) => ({
  period: { date_from: '2026-10-20', date_to: '2026-11-18', days: 30, previous_date_from: '2026-09-20', previous_date_to: '2026-10-19', previous_comparable: comparable, data_since: '2026-08-01T00:00:00Z' },
  processing: processing(over),
  previous: processing({ runs: 4, completed: 4, failed: 0, running: 0, records_seen: 500, ...previous }),
  series: [], sources,
  blocked: { count: blocked, oldest_started_at: null }, blocked_after_minutes: 60, generated_at: '2026-11-18T15:30:00Z',
});

const corporate: unknown[] = [
  { id: 'sso', status: 'UP', checked_at: '2026-11-18T10:00:00Z', detail: 'Login de la cuenta de servicio exitoso.' },
  { id: 'directory', status: 'DEGRADED', checked_at: '2026-11-18T10:00:00Z', detail: 'El directorio rechazó la cuenta de servicio.' },
];

describe('PlatformStatusComponent: estado técnico de la plataforma', () => {
  let fixture: ComponentFixture<PlatformStatusComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function render(health: 'ok' | 'down', ops: object = operations()): void {
    TestBed.configureTestingModule({ imports: [PlatformStatusComponent], providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(PlatformStatusComponent);
    fixture.detectChanges();
    http.match('http://api.test/health/live').forEach((r) => (health === 'ok' ? r.flush({ status: 'alive' }) : r.error(new ProgressEvent('error'))));
    http.match('http://api.test/health').forEach((r) => (health === 'ok' ? r.flush({ status: 'ready', database: 'connected' }) : r.error(new ProgressEvent('error'))));
    http.match('http://api.test/api/v1/platform/services').forEach((r) => r.flush({ data: { items: corporate } }));
    http.match((r) => r.url === 'http://api.test/api/v1/platform/operations').filter((r) => !r.cancelled).forEach((r) => r.flush({ data: ops }));
    fixture.detectChanges();
  }
  const status = (name: string): string =>
    Array.from(el().querySelectorAll('.svc')).find((c) => c.textContent!.includes(name))!.querySelector('.pill')!.textContent!.trim();
  it('solo lo confirmado es "Operativo"; lo demás queda "No verificado"', () => {
    render('ok');

    expect(status('API de LoGyCO₂')).toBe('Operativo');
    expect(status('Base de datos')).toBe('Operativo');
    expect(status('Autenticación SSO')).toBe('Operativo');
    expect(status('Directorio corporativo')).toBe('Degradado');
    expect(status('Procesamiento de archivos')).toBe('No verificado');
  });

  it('si la API no responde, no se presenta como operativa', () => {
    render('down');

    expect(el().textContent).toContain('No disponible');
    expect(Array.from(el().querySelectorAll('.svc .pill')).map((p) => p.textContent!.trim())).not.toContain('Operativo');
    expect(el().querySelector('[data-testid="status-summary"]')!.textContent).toContain('Hay servicios no disponibles');
  });

  it('aclara que la disponibilidad de la API no implica la del proveedor de autenticación', () => {
    render('ok');

    expect(el().textContent).toContain('no implica la del SSO');
  });

  it('agrupa los servicios y resume el estado global sin dar por operativo lo degradado ni lo no verificado', () => {
    render('ok');

    expect(Array.from(el().querySelectorAll('.group h2')).map((h) => h.textContent!.trim())).toEqual(['Aplicación', 'Identidad corporativa', 'Procesamiento', 'Actualización de datos de referencia']);
    expect(el().querySelector('[data-testid="status-summary"] h2')!.textContent).toContain('Algunos servicios están degradados');
    const counts = Array.from(el().querySelectorAll('[data-testid="status-summary"] .count')).map((c) => c.textContent!.replace(/\s+/g, ' ').trim());
    expect(counts).toEqual(['3Operativos', '1Degradados', '0No disponibles', '1Sin verificar']);
  });

  it('explica qué comprueba cada servicio y qué no', () => {
    render('ok');

    const method = el().querySelector('[data-testid="status-method"]')!.textContent!;
    expect(method).toContain('No prueba el inicio de sesión de cada persona');
    expect(method).toContain('No crea ni modifica usuarios');
  });

  const source_ = (code: string): HTMLElement => el().querySelector<HTMLElement>(`[data-source="${code}"]`)!;
  const refs = (): string => el().querySelector('[data-testid="data-operation"]')!.textContent!.replace(/\s+/g, ' ');

  it('«Actualización de datos de referencia» explica qué son los trabajos y muestra totales reales del período', () => {
    render('ok');
    const totals = el().querySelector('[data-testid="data-operation-totals"]')!.textContent!.replace(/\s+/g, ' ');

    expect(refs()).toContain('combustibles, costos del transporte y tráfico portuario');
    expect(refs()).toContain('No son archivos de las empresas');
    expect(el().querySelector('[data-testid="data-operation-period"]')!.textContent).toBe('Últimos 30 días');
    expect(totals).toContain('8completados');
    expect(totals).toContain('1fallidos');
    expect(totals).toContain('38,5 s');
    expect(totals).toContain('1.200registros leídos');
    expect(totals).toContain('120 nuevos o revisados');
  });

  it('cada fuente indica si quedó al día o si su último intento falló, con el código del error', () => {
    render('ok');

    expect(source_('A').querySelector('.pill')!.textContent).toBe('Al día');
    expect(source_('A').classList.contains('tone-up')).toBeTrue();
    expect(source_('B').querySelector('.pill')!.textContent).toBe('Falló');
    expect(source_('B').classList.contains('tone-down')).toBeTrue();
    expect(source_('B').textContent).toContain('GNCV_UNEXPECTED_RESPONSE');
  });

  it('una fuente sin intentos no se presenta como al día', () => {
    render('ok', operations({}, {}, true, 0, [source('N', 'Puertos', 'NEVER_RUN', null, null)]));

    expect(source_('N').querySelector('.pill')!.textContent).toBe('Sin intentos');
    expect(source_('N').textContent).toContain('Aún no se ha ejecutado ningún trabajo');
  });

  it('la variación solo aparece frente a un período anterior completo y mayor que cero', () => {
    render('ok');
    expect(el().querySelector('[data-testid="do-delta"]')!.textContent).toContain('▲ 100 %'); // 4 → 8

    TestBed.resetTestingModule();
    render('ok', operations({}, {}, false));
    expect(el().querySelector('[data-testid="do-delta"]')).toBeNull();

    TestBed.resetTestingModule();
    render('ok', operations({}, { completed: 0 }, true));
    expect(el().querySelector('[data-testid="do-delta"]')).toBeNull();
  });

  it('señala los trabajos bloqueados y no inventa cifras sin trabajos', () => {
    render('ok', operations({}, {}, true, 2));
    expect(el().querySelector('[data-testid="do-blocked"]')!.textContent).toContain('más de 60 min');

    TestBed.resetTestingModule();
    render('ok', operations({ runs: 0, completed: 0, failed: 0, running: 0, records_seen: 0, inserted: 0, revised: 0, unchanged: 0, duration_p95_seconds: null, duration_avg_seconds: null }));
    expect(el().querySelector('[data-testid="do-blocked"]')).toBeNull();
    expect(el().querySelector('[data-testid="data-operation-totals"]')!.textContent).toContain('—');
  });

  it('un error al consultar los trabajos no afecta el estado global de los servicios', () => {
    TestBed.configureTestingModule({ imports: [PlatformStatusComponent], providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(PlatformStatusComponent);
    fixture.detectChanges();
    http.match('http://api.test/health/live').forEach((r) => r.flush({ status: 'alive' }));
    http.match('http://api.test/health').forEach((r) => r.flush({ status: 'ready', database: 'connected' }));
    http.match('http://api.test/api/v1/platform/services').forEach((r) => r.flush({ data: { items: corporate } }));
    http.match((r) => r.url === 'http://api.test/api/v1/platform/operations').filter((r) => !r.cancelled).forEach((r) => r.flush({ error: { code: 'X', message: 'falló' } }, { status: 500, statusText: 'Error' }));
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="status-summary"] h2')!.textContent).toContain('Algunos servicios están degradados');
    expect(el().querySelector('[data-testid="data-operation"] app-resource-state button')).not.toBeNull();
  });
});
