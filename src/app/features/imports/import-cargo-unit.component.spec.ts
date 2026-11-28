import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, cargoAppliedDto, cargoProposalDto, importDetailDto, reviewDto } from '../../../testing/imports';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ImportReviewDto } from '../../infrastructure/dto/imports.dto';
import { toImportDetail } from '../../infrastructure/mappers/imports.mappers';
import { ImportCargoUnitComponent } from './import-cargo-unit.component';

const URL = `${IMPORTS_URL}/imp-1/cargo-unit`;

describe('ImportCargoUnitComponent: unidad de la carga', () => {
  let fixture: ComponentFixture<ImportCargoUnitComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function render(review: Partial<ImportReviewDto>, roles = ['ORG_ADMIN']): void {
    TestBed.configureTestingModule({ imports: [ImportCargoUnitComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ImportCargoUnitComponent);
    fixture.componentRef.setInput('importId', 'imp-1');
    fixture.componentRef.setInput('review', toImportDetail(importDetailDto({ review: reviewDto(review) })).review!);
    fixture.detectChanges();
  }

  afterEach(() => http?.match(() => true));

  it('sin propuesta ni unidad aplicada no se muestra nada (la carga está en toneladas, como siempre)', () => {
    render({});

    expect(q('[data-testid="cargo-unit"]')).toBeNull();
  });

  it('con una propuesta KG_LIKELY muestra el texto y la evidencia del servidor y las dos acciones', () => {
    render({ cargo_unit_proposal: cargoProposalDto() });

    expect(text('[data-testid="cargo-unit-message"]')).toContain('La columna parece estar en kilogramos');
    const evidence = text('[data-testid="cargo-unit-evidence"]');
    expect(evidence).toContain('178 de 180');
    expect(evidence).toContain('34.440 → 34,44 t si son kg');
    expect(evidence).toContain('98,4 % de 35 t');
    expect(evidence).toContain('6.199,2 t en 178 filas');
    expect(evidence).toContain('2 filas');
    expect(text('[data-testid="cargo-unit-kg"]')).toBe('Usar kilogramos y convertir a toneladas');
    expect(text('[data-testid="cargo-unit-keep"]')).toBe('Mantener como está');
  });

  it('confirmar kilogramos envía KG, muestra el resultado del servidor y pide la carga de nuevo', () => {
    render({ cargo_unit_proposal: cargoProposalDto() });
    q('[data-testid="cargo-unit-kg"]')!.click();
    fixture.detectChanges();

    expect(q('[data-testid="cargo-unit-kg"]')!.hasAttribute('disabled')).toBeTrue();
    expect(q('[data-testid="cargo-unit-keep"]')!.hasAttribute('disabled')).toBeTrue();
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ unit: 'KG' });
    req.flush({ data: { unit: 'KG', confirmed_at: '2026-03-02T09:30:00Z', rows_updated: 180, rows_converted: 178, unchanged: false } });
    fixture.detectChanges();

    expect(text('[data-testid="cargo-unit-result"]')).toContain('178 de 180 viajes quedaron convertidos a toneladas');
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` });
  });

  it('«Mantener como está» envía TON y lo dice', () => {
    render({ cargo_unit_proposal: cargoProposalDto() });
    q('[data-testid="cargo-unit-keep"]')!.click();
    fixture.detectChanges();
    const req = http.expectOne(URL);

    expect(req.request.body).toEqual({ unit: 'TON' });
    req.flush({ data: { unit: 'TON', confirmed_at: '2026-03-02T09:30:00Z', rows_updated: 0, rows_converted: 0, unchanged: false } });
    fixture.detectChanges();

    expect(text('[data-testid="cargo-unit-result"]')).toBe('Listo: la carga se mantiene en toneladas.');
  });

  it('una propuesta AMBIGUOUS solo informa: texto y evidencia, sin acciones', () => {
    render({ cargo_unit_proposal: cargoProposalDto({ status: 'AMBIGUOUS', proposed_unit: null, message: 'Hay valores muy altos pero no es seguro que sean kilogramos.' }) });

    expect(text('[data-testid="cargo-unit-message"]')).toContain('no es seguro');
    expect(q('[data-testid="cargo-unit-evidence"]')).not.toBeNull();
    expect(q('[data-testid="cargo-unit-kg"]')).toBeNull();
    expect(q('[data-testid="cargo-unit-keep"]')).toBeNull();
  });

  it('quien no puede cargar información ve la propuesta sin acciones y con la nota de quién confirma', () => {
    render({ cargo_unit_proposal: cargoProposalDto() }, ['ORG_VIEWER']);

    expect(q('[data-testid="cargo-unit-kg"]')).toBeNull();
    expect(text('[data-testid="cargo-unit-readonly"]')).toContain('permiso para cargar información');
  });

  it('el encabezado declara kilogramos: nota automática con el encabezado y el original intacto, sin acciones', () => {
    render({ cargo_unit_applied: cargoAppliedDto({ source: 'HEADER', confirmed_by: null, header: 'peso_carga_kg' }) });

    expect(text('[data-testid="cargo-unit-applied"]')).toContain('El archivo declara kilogramos');
    expect(text('[data-testid="cargo-unit-applied"]')).toContain('«peso_carga_kg»');
    expect(text('[data-testid="cargo-unit-original"]')).toContain('no se modifican');
    expect(q('[data-testid="cargo-unit-kg"]')).toBeNull();
  });

  it('el ajuste de la empresa convirtió la carga: lo dice', () => {
    render({ cargo_unit_applied: cargoAppliedDto({ source: 'COMPANY_SETTING', confirmed_by: null }) });

    expect(text('[data-testid="cargo-unit-applied"]')).toContain('Tu empresa convierte los kilogramos a toneladas');
  });

  it('confirmada por una persona: estado de resultado con la fecha y sin volver a ofrecer la conversión', () => {
    render({ cargo_unit_proposal: cargoProposalDto(), cargo_unit_applied: cargoAppliedDto() });

    expect(text('[data-testid="cargo-unit-applied"]')).toContain('Una persona confirmó los kilogramos');
    expect(q('[data-testid="cargo-unit-kg"]')).toBeNull();
    expect(q('[data-testid="cargo-unit-keep"]')).toBeNull();
  });

  it('si el usuario eligió mantener toneladas, puede cambiar a kilogramos pero no se le ofrece «Mantener»', () => {
    render({ cargo_unit_proposal: cargoProposalDto(), cargo_unit_applied: cargoAppliedDto({ unit: 'TON' }) });

    expect(text('[data-testid="cargo-unit-applied"]')).toContain('se mantiene en toneladas');
    expect(q('[data-testid="cargo-unit-kg"]')).not.toBeNull();
    expect(q('[data-testid="cargo-unit-keep"]')).toBeNull();
  });

  it('un error (409 CARGO_UNIT_NOT_PROPOSED) se anuncia con role=alert y vuelve a pedir la revisión', () => {
    render({ cargo_unit_proposal: cargoProposalDto() });
    q('[data-testid="cargo-unit-kg"]')!.click();
    http.expectOne(URL).flush({ error: { code: 'CARGO_UNIT_NOT_PROPOSED', message: 'x' } }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(q('[data-testid="cargo-unit-error"]')!.getAttribute('role')).toBe('alert');
    expect(text('[data-testid="cargo-unit-error"]')).toContain('ya no tiene una conversión');
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` });
  });

  it('la región de resultados es aria-live y los botones son alcanzables con el teclado', () => {
    render({ cargo_unit_proposal: cargoProposalDto() });

    expect(q('[aria-live="polite"]')).not.toBeNull();
    expect(q('[data-testid="cargo-unit-kg"]')!.tabIndex).toBe(0);
    expect(q('section')!.getAttribute('aria-labelledby')).toBe('cu-title');
  });

  it('el CSS usa solo tokens (sin hexadecimales ni rgb()), sin scroll interno y con tintes permitidos', () => {
    render({ cargo_unit_proposal: cargoProposalDto() });
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '')).filter((c) => c.includes('dl.ev')).join('\n');

    expect(css).toContain('dl.ev');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    expect(css).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
    for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });
});
