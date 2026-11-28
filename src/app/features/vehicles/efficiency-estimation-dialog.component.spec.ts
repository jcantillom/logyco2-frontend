import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { ESTIMATE_APPLY_URL, ESTIMATE_PREVIEW_URL, SETTINGS_URL, settingsDto, apiError, appliedDto, estimateApplyDto, estimatePreviewDto } from '../../../testing/vehicle-efficiency';
import { pagedBody, vehicleDto, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { EfficiencyEstimationDialogComponent } from './efficiency-estimation-dialog.component';
import { EfficiencyEstimationFacade } from './efficiency-estimation.facade';

describe('EfficiencyEstimationDialogComponent', () => {
  let fixture: ComponentFixture<EfficiencyEstimationDialogComponent>;
  let http: HttpTestingController;
  let facade: EfficiencyEstimationFacade;
  let closed: number;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const testId = <T extends HTMLElement = HTMLElement>(id: string): T | null => el().querySelector<T>(`[data-testid="${id}"]`);
  const text = (id: string): string => (testId(id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const settle = (): void => fixture.detectChanges();
  const reloadsList = (): void => {
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([vehicleDto()]));
  };

  function render(preview: unknown = estimatePreviewDto()): void {
    TestBed.configureTestingModule({ imports: [EfficiencyEstimationDialogComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(EfficiencyEstimationFacade);
    facade.learn(true);
    http.expectOne(SETTINGS_URL).flush({ data: settingsDto() });
    facade.show();
    closed = 0;
    fixture = TestBed.createComponent(EfficiencyEstimationDialogComponent);
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
    http.expectOne(ESTIMATE_PREVIEW_URL).flush({ data: preview });
    settle();
  }

  afterEach(() => http.verify());

  it('muestra el aviso de teórico, los conteos del servidor y el plan, sin aplicar nada todavía', () => {
    render();

    expect(text('estimation-warning')).toContain('Estimado con referencia UPME (teórico)');
    expect(text('estimation-counts')).toContain('Revisados40');
    expect(text('estimation-to-create')).toBe('25');
    expect(text('estimation-plan')).toBe('Se estimará el rendimiento de 25 vehículos. Hasta 900 viajes pendientes se recalcularán.');
    expect(text('estimation-reasons')).toContain('El combustible no tiene referencia: 8 vehículos');
    expect(el().querySelector('dialog')!.open).toBeTrue();
    expect(testId<HTMLButtonElement>('estimation-apply')!.disabled).toBeFalse();
  });

  it('licencia sin confirmar: muestra el aviso del servidor solo cuando la vista previa lo trae', () => {
    render(estimatePreviewDto({ licence_notice: 'Fuente con licencia sin confirmar: solo para pruebas' }));

    expect(text('estimation-licence')).toBe('Fuente con licencia sin confirmar: solo para pruebas.');
  });

  it('sin aviso de licencia en la vista previa no hay párrafo de licencia', () => {
    render();

    expect(testId('estimation-licence')).toBeNull();
  });

  it('Aplicar envía el token, muestra el resultado y el aviso de viajes con valor anterior; ya no ofrece Aplicar', () => {
    render();
    testId('estimation-apply')!.click();
    settle();
    expect(testId('estimation-busy')).not.toBeNull();
    const req = http.expectOne(ESTIMATE_APPLY_URL);

    expect(req.request.body).toEqual({ all_pending: true, token: 'tok-estimar' });
    req.flush({ data: estimateApplyDto({ applied_to_pending: appliedDto({ trips_recalculated: 300, stale_calculated_trips: 4 }) }) });
    reloadsList();
    settle();

    expect(text('estimation-result')).toContain('25 estimados guardados');
    expect(text('estimation-result')).toContain('300 viajes pendientes ahora calculados');
    expect(text('estimation-stale')).toContain('4 viajes ya calculados usaron un rendimiento anterior');
    expect(testId('estimation-apply')).toBeNull();
  });

  it('«Continuar» y detenido; «Revisar el siguiente lote» solo cuando no quedan viajes y hay cursor', () => {
    render(estimatePreviewDto({ next_cursor: 'cur-2' }));
    expect(text('estimation-more')).toContain('lote de hasta 500');
    testId('estimation-apply')!.click();
    http.expectOne(ESTIMATE_APPLY_URL).flush({ data: estimateApplyDto({ next_cursor: 'cur-2', applied_to_pending: appliedDto({ remaining: 7, trips_recalculated: 2 }) }) });
    reloadsList();
    settle();
    expect(testId('estimation-next')).toBeNull();
    testId('estimation-continue')!.click();
    http.expectOne(ESTIMATE_APPLY_URL).flush({ data: estimateApplyDto({ next_cursor: 'cur-2', applied_to_pending: appliedDto({ remaining: 7, trips_recalculated: 0 }) }) });
    reloadsList();
    settle();
    expect(testId('estimation-stalled')).not.toBeNull();
    expect(testId('estimation-continue')).toBeNull();
  });

  it('siguiente lote: cuando termina con cursor ofrece revisar el siguiente', () => {
    render(estimatePreviewDto({ next_cursor: 'cur-2' }));
    testId('estimation-apply')!.click();
    http.expectOne(ESTIMATE_APPLY_URL).flush({ data: estimateApplyDto({ next_cursor: 'cur-2' }) });
    reloadsList();
    settle();
    testId('estimation-next')!.click();
    expect(http.expectOne(ESTIMATE_PREVIEW_URL).request.body).toEqual({ all_pending: true, after: 'cur-2' });
  });

  it('token vencido: alerta con «Revisar de nuevo» y Aplicar deshabilitado', () => {
    render();
    testId('estimation-apply')!.click();
    http.expectOne(ESTIMATE_APPLY_URL).flush(apiError('FICHA_TOKEN_EXPIRED'), { status: 409, statusText: 'x' });
    settle();

    expect(testId('estimation-error')!.getAttribute('role')).toBe('alert');
    expect(text('estimation-error')).toContain('La vista previa venció');
    expect(testId<HTMLButtonElement>('estimation-apply')!.disabled).toBeTrue();
    testId('estimation-review-again')!.click();
    http.expectOne(ESTIMATE_PREVIEW_URL).flush({ data: estimatePreviewDto() });
  });

  it('sin nada que estimar, Aplicar queda deshabilitado', () => {
    render(estimatePreviewDto({ counts: { ...estimatePreviewDto().counts, to_create: 0 } }));

    expect(text('estimation-plan')).toBe('Ningún vehículo recibiría un estimado nuevo.');
    expect(testId<HTMLButtonElement>('estimation-apply')!.disabled).toBeTrue();
  });

  it('accesibilidad: diálogo nativo con título asociado, región viva y Escape bloqueado mientras trabaja', () => {
    render();
    const dialog = el().querySelector('dialog')!;

    expect(dialog.getAttribute('aria-labelledby')).toBe('est-title');
    expect(el().querySelector('#est-title')!.textContent).toContain('Estimar rendimiento de pendientes');
    expect(testId('estimation-live')!.getAttribute('aria-live')).toBe('polite');
    testId('estimation-apply')!.click();
    settle();
    const cancel = new Event('cancel', { cancelable: true });

    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBeTrue();
    http.expectOne(ESTIMATE_APPLY_URL).flush(apiError('COMPANY_BUSY'), { status: 409, statusText: 'x' });
    settle();
    expect(text('estimation-error')).toContain('carga procesándose');
    expect(testId('estimation-retry')).not.toBeNull();
  });

  it('cerrar descarta todo y avisa al contenedor', async () => {
    render();
    el().querySelector('dialog')!.close();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(closed).toBe(1);
    expect(facade.open()).toBeFalse();
    expect(facade.preview()).toBeNull();
  });

  it('solo tokens y sin scroll interno en escritorio', () => {
    render();
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('dialog.est')).join('\n');
    const at = css.indexOf('@media (max-width: 719px)');

    expect(at).toBeGreaterThan(0);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    expect(css.slice(0, at)).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
  });
});
