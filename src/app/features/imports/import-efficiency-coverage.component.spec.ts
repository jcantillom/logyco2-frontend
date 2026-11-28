import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, coverageDto, importDetailDto, reviewDto } from '../../../testing/imports';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { EfficiencyCoverageDto } from '../../infrastructure/dto/imports.dto';
import { toImportDetail } from '../../infrastructure/mappers/imports.mappers';
import { COVERAGE_THEORETICAL, ImportEfficiencyCoverageComponent } from './import-efficiency-coverage.component';

const URL = `${IMPORTS_URL}/imp-1/efficiency-estimation`;

describe('ImportEfficiencyCoverageComponent: rendimiento de los vehículos', () => {
  let fixture: ComponentFixture<ImportEfficiencyCoverageComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function render(coverage: Partial<EfficiencyCoverageDto> = {}, roles = ['ORG_ADMIN']): void {
    TestBed.configureTestingModule({ imports: [ImportEfficiencyCoverageComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ImportEfficiencyCoverageComponent);
    fixture.componentRef.setInput('importId', 'imp-1');
    fixture.componentRef.setInput('coverage', toImportDetail(importDetailDto({ review: reviewDto({ efficiency_coverage: coverageDto(coverage) }) })).review!.efficiencyCoverage);
    fixture.detectChanges();
  }

  const estimation = (overrides: Partial<EfficiencyCoverageDto['estimation']>): Partial<EfficiencyCoverageDto> => ({ estimation: { ...coverageDto().estimation, ...overrides } });

  afterEach(() => http?.match(() => true));

  it('muestra las cuentas del servidor: propios, ya estimados, sin rendimiento, estimables con fuente, valor y rango', () => {
    render();

    expect(text('[data-testid="coverage-summary"]')).toBe('18 vehículos en el archivo: 4 con rendimiento propio · 2 ya estimados · 12 sin rendimiento');
    expect(text('[data-testid="coverage-estimable"]')).toContain('8 vehículos (80 viajes) se pueden estimar con una referencia técnica.');
    expect(text('[data-testid="coverage-estimable"]')).toContain('3 aún sin registrar: se estiman al registrarlos.');
    expect(text('[data-testid="coverage-references"]')).toContain('UPME');
    expect(text('[data-testid="coverage-references"]')).toContain('7,5 km/gal (rango 6,1 a 9,4)');
    expect(text('[data-testid="coverage-licence"]')).toBe('Licencia sin confirmar: solo para pruebas');
  });

  it('los bloqueados por licencia usan el texto del servidor; los sin referencia, sus motivos del servidor; y los sin distancia van aparte', () => {
    render();

    expect(text('[data-testid="coverage-blocked"]')).toBe('1 vehículo (10 viajes): La fuente de estos vehículos no tiene la licencia confirmada.');
    expect(text('[data-testid="coverage-no-reference"]')).toContain('3 vehículos sin referencia técnica (20 viajes)');
    expect(text('[data-testid="coverage-no-reference"]')).toContain('El vehículo no tiene configuración: 3 vehículos, 20 viajes');
    expect(text('[data-testid="coverage-no-distance"]')).toBe('14 viajes de 5 vehículos no traen distancia: estimar el rendimiento no los calcula.');
  });

  it('avisa que lo estimado es teórico', () => {
    render();

    expect(text('[data-testid="coverage-theoretical"]')).toBe(COVERAGE_THEORETICAL);
    expect(COVERAGE_THEORETICAL).toContain('teórico');
  });

  it('modo apagado (OFF) o bandera global apagada: no se muestra nada', () => {
    render(estimation({ mode: 'OFF', requires_consent: false, can_estimate: false }));
    expect(q('[data-testid="efficiency-coverage"]')).toBeNull();

    TestBed.resetTestingModule();
    render(estimation({ platform_enabled: false, can_estimate: false }));
    expect(q('[data-testid="efficiency-coverage"]')).toBeNull();
  });

  it('modo AUTO: explica que se estima solo y no ofrece botones de consentimiento', () => {
    render(estimation({ mode: 'AUTO', requires_consent: false }));

    expect(text('[data-testid="coverage-auto"]')).toContain('estima el rendimiento automáticamente');
    expect(q('[data-testid="coverage-actions"]')).toBeNull();
  });

  it('modo ASK sin consentimiento: dos acciones; «Estimar con referencia técnica (teórico)» envía true y muestra lo que estimó el servidor', () => {
    render();

    expect(text('[data-testid="coverage-estimate"]')).toBe('Estimar con referencia técnica (teórico)');
    expect(text('[data-testid="coverage-skip"]')).toBe('No estimar');
    q('[data-testid="coverage-estimate"]')!.click();
    fixture.detectChanges();
    expect(q('[data-testid="coverage-skip"]')!.hasAttribute('disabled')).toBeTrue();
    const req = http.expectOne(URL);

    expect(req.request.body).toEqual({ estimate_efficiency: true });
    req.flush({ data: { mode: 'ASK', estimate_efficiency: true, vehicles_estimated: 5, trips_calculated: 60, trips_still_pending: 20, next_cursor: null } });
    fixture.detectChanges();

    expect(text('[data-testid="coverage-result"]')).toBe('Estimamos el rendimiento de 5 vehículos: 60 viajes calculados y 20 siguen pendientes.');
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` });
  });

  it('«No estimar» envía false (queda registrado) y lo dice', () => {
    render();
    q('[data-testid="coverage-skip"]')!.click();
    const req = http.expectOne(URL);

    expect(req.request.body).toEqual({ estimate_efficiency: false });
    req.flush({ data: { mode: 'ASK', estimate_efficiency: false, vehicles_estimated: 0, trips_calculated: 0, trips_still_pending: 110, next_cursor: null } });
    fixture.detectChanges();

    expect(text('[data-testid="coverage-result"]')).toBe('Listo: no se estimará el rendimiento de esta carga.');
  });

  it('con un consentimiento ya registrado lo dice y ofrece solo la elección contraria', () => {
    render(estimation({ consent: { estimate: true, mode: 'ASK' } }));

    expect(text('[data-testid="coverage-consent"]')).toBe('Autorizaste estimar con referencia técnica (teórico).');
    expect(q('[data-testid="coverage-estimate"]')).toBeNull();
    expect(q('[data-testid="coverage-skip"]')).not.toBeNull();
  });

  it('quien no administra vehículos ve el estado sin controles y con la nota', () => {
    render({}, ['ORG_ANALYST']);

    expect(q('[data-testid="coverage-actions"]')).toBeNull();
    expect(text('[data-testid="coverage-readonly"]')).toContain('Un administrador decide');
  });

  it('sin vehículos estimables no se piden consentimientos que no cambiarían nada', () => {
    render({ without_efficiency: { ...coverageDto().without_efficiency, estimable: { vehicles: 0, trips: 0, unregistered_vehicles: 0, references: [] } } });

    expect(q('[data-testid="coverage-actions"]')).toBeNull();
    expect(q('[data-testid="coverage-estimable"]')).toBeNull();
  });

  it('un error (409 ESTIMATION_MODE_OFF) se anuncia con role=alert, con el texto del catálogo', () => {
    render();
    q('[data-testid="coverage-estimate"]')!.click();
    http.expectOne(URL).flush({ error: { code: 'ESTIMATION_MODE_OFF', message: 'x' } }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(q('[data-testid="coverage-error"]')!.getAttribute('role')).toBe('alert');
    expect(text('[data-testid="coverage-error"]')).toContain('apagada en los ajustes');
  });

  it('el CSS usa solo tokens (sin hexadecimales ni rgb()), sin scroll interno y con tintes permitidos', () => {
    render();
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '')).filter((c) => c.includes('coverage') || c.includes('ul.refs')).join('\n');

    expect(css).toContain('ul.refs');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    expect(css).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
  });
});
