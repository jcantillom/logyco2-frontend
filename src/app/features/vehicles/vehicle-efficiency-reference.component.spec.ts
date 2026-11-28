import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { EFFICIENCY_URL, SETTINGS_URL, settingsDto, ESTIMATE_APPLY_URL, ESTIMATE_PREVIEW_URL, apiError, appliedDto, estimateApplyDto, estimateDto, estimatePreviewDto, recordDto, suggestionView, viewDto } from '../../../testing/vehicle-efficiency';
import { pagedBody, vehicleDto, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { toVehicle } from '../../infrastructure/mappers/vehicles.mappers';
import { VehicleEfficiencyDialogComponent } from './vehicle-efficiency-dialog.component';

describe('VehicleEfficiencyDialogComponent · referencia UPME', () => {
  let fixture: ComponentFixture<VehicleEfficiencyDialogComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const testId = <T extends HTMLElement = HTMLElement>(id: string): T | null => el().querySelector<T>(`[data-testid="${id}"]`);
  const text = (id: string): string => (testId(id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const settle = (): void => fixture.detectChanges();

  function render(view: ReturnType<typeof viewDto>, roles: string[] = ['ORG_ADMIN'], mode = 'ASK'): void {
    TestBed.configureTestingModule({ imports: [VehicleEfficiencyDialogComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(VehicleEfficiencyDialogComponent);
    fixture.componentRef.setInput('vehicle', toVehicle(vehicleDto()));
    fixture.detectChanges();
    http.expectOne((r) => r.url === EFFICIENCY_URL()).flush({ data: view });
    settle();
    http.match(SETTINGS_URL).forEach((r) => r.flush({ data: settingsDto({ mode }) }));
    settle();
  }

  afterEach(() => http.verify());

  it('con la función encendida y una sugerencia: «Referencia UPME: 6,9 km/gal (rango 5,6–9,2) · Tabla 2.8, PDF p. 32», teórico y evidencia baja', () => {
    render(suggestionView());

    expect(text('efficiency-reference-text')).toBe('Referencia UPME: 6,9 km/gal (rango 5,6–9,2) · Tabla 2.8, PDF p. 32');
    expect(text('efficiency-reference-note')).toContain('Estimado con referencia UPME (teórico)');
    expect(text('efficiency-reference-note')).toContain('evidencia baja');
    expect(testId('efficiency-use-reference')?.textContent?.trim()).toBe('Usar como estimado');
    expect(el().querySelector('section.ref')!.getAttribute('aria-labelledby')).toBe('eff-ref-title');
  });

  it('fuente con licencia sin confirmar: nombre corto, rango y el aviso del servidor «solo para pruebas», en el mismo bloque', () => {
    render(suggestionView({
      estimate: estimateDto({
        value: '10.010000', uncertainty_low: '7.810000', uncertainty_high: '12.700000', table_ref: 'Tabla 6.1', page_ref: 'p. 72 (impresa)',
        source_short_name: 'Steer/ANDI', licence_status: 'UNVERIFIED_TEST_ONLY', licence_notice: 'Fuente con licencia sin confirmar: solo para pruebas',
      }),
    }));

    expect(text('efficiency-reference-text')).toBe('Referencia Steer/ANDI: 10,01 km/gal (rango 7,81–12,7) · Tabla 6.1, p. 72 (impresa)');
    expect(text('efficiency-reference-licence')).toBe('Fuente con licencia sin confirmar: solo para pruebas.');
    expect(text('efficiency-reference-note')).toContain('Estimado con referencia Steer/ANDI (teórico)');
  });

  it('modo de la empresa OFF: no hay «Usar como estimado» y se dice por qué (con el camino para activarla al administrador)', () => {
    render(suggestionView(), ['ORG_ADMIN'], 'OFF');

    expect(testId('efficiency-use-reference')).toBeNull();
    expect(text('efficiency-estimation-off')).toBe('La estimación está desactivada para tu empresa. Actívala en Configuración.');
  });

  it('modo OFF para quien no administra: nota de solo lectura, sin la invitación a Configuración', () => {
    render(suggestionView(), ['ORG_ANALYST'], 'OFF');

    expect(testId('efficiency-use-reference')).toBeNull();
    expect(text('efficiency-estimation-off')).toBe('La estimación está desactivada para tu empresa.');
  });

  it('una fuente sin aviso de licencia no lo muestra', () => {
    render(suggestionView());

    expect(testId('efficiency-reference-licence')).toBeNull();
  });

  it('sin rango en la fuente no se inventa uno', () => {
    render(suggestionView({ estimate: estimateDto({ uncertainty_low: null, uncertainty_high: null }) }));

    expect(text('efficiency-reference-text')).toBe('Referencia UPME: 6,9 km/gal · Tabla 2.8, PDF p. 32');
  });

  it('función apagada: no hay bloque ni botón ni motivo, aunque el servidor mande una sugerencia', () => {
    render(suggestionView({ estimation_enabled: false }));

    expect(testId('efficiency-reference')).toBeNull();
    expect(testId('efficiency-use-reference')).toBeNull();
    expect(testId('efficiency-reference-reason')).toBeNull();
  });

  it('sin sugerencia: el motivo cerrado sale con el texto del servidor; con valor declarado no se dice nada', () => {
    render(suggestionView({ estimate: null, estimate_reason: 'FUEL_NOT_COVERED', estimate_reason_label: 'El combustible no tiene referencia' }));

    expect(text('efficiency-reference-reason')).toBe('Sin referencia técnica: El combustible no tiene referencia');
    expect(testId('efficiency-reference')).toBeNull();
    fixture.destroy();
    TestBed.resetTestingModule();
    render(suggestionView({ estimate: null, estimate_reason: 'HAS_VEHICLE_EFFICIENCY', estimate_reason_label: 'Ya tiene un rendimiento declarado' }));
    expect(testId('efficiency-reference-reason')).toBeNull();
  });

  it('un valor declarado o medido sigue siendo el visible y nunca se ofrece reemplazarlo desde la interfaz', () => {
    render(suggestionView({ current: recordDto(), history: [recordDto()] }));

    expect(text('efficiency-current')).toContain('6,9 km/gal');
    expect(text('efficiency-current')).toContain('Declarado');
    expect(testId('efficiency-reference')).not.toBeNull();
    expect(testId('efficiency-use-reference')).toBeNull();
  });

  it('analista y lector ven la referencia pero no el botón', () => {
    render(suggestionView(), ['ORG_ANALYST']);

    expect(testId('efficiency-reference')).not.toBeNull();
    expect(testId('efficiency-use-reference')).toBeNull();
  });

  it('«Usar como estimado»: vista previa, aplicación con el token, resultado, aviso de teórico y refresco', () => {
    render(suggestionView());
    testId('efficiency-use-reference')!.click();
    settle();
    http.expectOne(ESTIMATE_PREVIEW_URL).flush({ data: estimatePreviewDto() });
    const apply = http.expectOne(ESTIMATE_APPLY_URL);

    expect(apply.request.body).toEqual({ vehicle_ids: ['veh-1'], token: 'tok-estimar' });
    apply.flush({ data: estimateApplyDto({ records_created: 1, applied_to_pending: appliedDto({ trips_recalculated: 40, still_pending: 0 }) }) });
    http.expectOne((r) => r.url === EFFICIENCY_URL() && r.method === 'GET').flush({ data: suggestionView() });
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([vehicleDto()]));
    settle();

    expect(text('efficiency-reference-result')).toContain('1 estimado guardado');
    expect(text('efficiency-reference-result')).toContain('40 viajes pendientes ahora calculados');
    expect(testId('efficiency-reference-note')).not.toBeNull();
  });

  it('si quedan viajes: «Continuar» repite lo mismo; sin avance muestra el aviso de detenido', () => {
    render(suggestionView());
    testId('efficiency-use-reference')!.click();
    http.expectOne(ESTIMATE_PREVIEW_URL).flush({ data: estimatePreviewDto() });
    http.expectOne(ESTIMATE_APPLY_URL).flush({ data: estimateApplyDto({ applied_to_pending: appliedDto({ remaining: 10, trips_recalculated: 5 }) }) });
    http.expectOne((r) => r.url === EFFICIENCY_URL() && r.method === 'GET').flush({ data: suggestionView() });
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([vehicleDto()]));
    settle();
    expect(text('efficiency-reference-remaining')).toContain('10 viajes');

    testId('efficiency-reference-continue')!.click();
    http.expectOne(ESTIMATE_APPLY_URL).flush({ data: estimateApplyDto({ applied_to_pending: appliedDto({ remaining: 10, trips_recalculated: 0 }) }) });
    http.expectOne((r) => r.url === EFFICIENCY_URL() && r.method === 'GET').flush({ data: suggestionView() });
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([vehicleDto()]));
    settle();

    expect(testId('efficiency-reference-stalled')).not.toBeNull();
    expect(testId('efficiency-reference-continue')).toBeNull();
  });

  it('token vencido: avisa y ofrece «Revisar de nuevo»; el texto del servidor nunca se muestra', () => {
    render(suggestionView());
    testId('efficiency-use-reference')!.click();
    http.expectOne(ESTIMATE_PREVIEW_URL).flush({ data: estimatePreviewDto() });
    http.expectOne(ESTIMATE_APPLY_URL).flush(apiError('FICHA_TOKEN_EXPIRED'), { status: 409, statusText: 'x' });
    settle();

    expect(text('efficiency-reference-error')).toContain('La vista previa venció');
    expect(text('efficiency-reference-error')).not.toContain('servidor');
    expect(testId('efficiency-reference-retry')?.textContent?.trim()).toBe('Revisar de nuevo');
  });

  it('sin nada que guardar explica por qué con el texto del servidor y no aplica', () => {
    render(suggestionView());
    testId('efficiency-use-reference')!.click();
    http.expectOne(ESTIMATE_PREVIEW_URL).flush({ data: estimatePreviewDto({ counts: { ...estimatePreviewDto().counts, to_create: 0 } }) });
    settle();

    expect(text('efficiency-reference-nothing')).toBe('No se puede estimar: El combustible no tiene referencia.');
  });

  it('accesibilidad: el resultado se anuncia con role=status y los errores con role=alert; el botón es nativo y se deshabilita mientras trabaja', () => {
    render(suggestionView());
    const button = testId<HTMLButtonElement>('efficiency-use-reference')!;

    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    button.click();
    settle();
    expect(testId<HTMLButtonElement>('efficiency-use-reference')!.disabled).toBeTrue();
    http.expectOne(ESTIMATE_PREVIEW_URL).flush(apiError('COMPANY_BUSY'), { status: 409, statusText: 'x' });
    settle();
    expect(testId('efficiency-reference-error')!.getAttribute('role')).toBe('alert');
    expect(testId('efficiency-reference-retry')?.textContent?.trim()).toBe('Reintentar');
  });

  it('solo tokens: el bloque nuevo no usa colores literales', () => {
    render(suggestionView());
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('dialog.eff')).join('\n');

    expect(css).toContain('.ref {');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
  });
});
