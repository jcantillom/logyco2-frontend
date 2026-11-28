import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SETTINGS_URL, settingsDto } from '../../../testing/vehicle-efficiency';
import { EFFICIENCY_URL, ESTIMATE_APPLY_URL, ESTIMATE_PREVIEW_URL, apiError, appliedDto, estimateApplyDto, estimatePreviewDto, suggestionView, viewDto } from '../../../testing/vehicle-efficiency';
import { pagedBody, vehicleDto, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { VehicleEfficiencyFacade } from './vehicle-efficiency.facade';
import { EfficiencyEstimationFacade } from './efficiency-estimation.facade';

describe('EfficiencyEstimationFacade', () => {
  let facade: EfficiencyEstimationFacade;
  let http: HttpTestingController;

  function setup(roles: string[] = ['ORG_ADMIN'], enabled: boolean | null = true, mode = 'ASK'): void {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(EfficiencyEstimationFacade);
    http = TestBed.inject(HttpTestingController);

    if (enabled !== null) facade.learn(enabled);
    http.match(SETTINGS_URL).forEach((r) => r.flush({ data: settingsDto({ mode }) }));
  }

  const reloadsList = (): void => {
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([vehicleDto()]));
  };
  const previewCall = () => http.expectOne(ESTIMATE_PREVIEW_URL);
  const applyCall = () => http.expectOne(ESTIMATE_APPLY_URL);

  afterEach(() => http.verify());

  it('permisos y bandera: solo ORG_ADMIN con la función encendida puede estimar; analista, lector o apagada no llaman al servidor', () => {
    setup(['ORG_ANALYST']);
    expect(facade.canEstimate()).toBeFalse();
    facade.show();
    facade.useReference('veh-1');
    http.expectNone(ESTIMATE_PREVIEW_URL);
    expect(facade.open()).toBeFalse();
  });

  it('con la función apagada o sin saberla, no se puede estimar', () => {
    setup(['ORG_ADMIN'], false);
    expect(facade.canEstimate()).toBeFalse();
    facade.show();
    http.expectNone(ESTIMATE_PREVIEW_URL);
    facade.enabled.set(null);
    expect(facade.canEstimate()).toBeFalse();
  });

  it('probe: pregunta el rendimiento del primer vehículo (página de 1) y aprende la bandera; no repite una vez sabida', () => {
    setup(['ORG_ADMIN'], null);
    facade.probe('veh-1');
    facade.probe('veh-1');
    const req = http.expectOne((r) => r.url === EFFICIENCY_URL());

    expect(req.request.params.get('page_size')).toBe('1');
    req.flush({ data: suggestionView() });
    http.expectOne(SETTINGS_URL).flush({ data: settingsDto() });
    expect(facade.enabled()).toBeTrue();
    facade.probe('veh-1');
    http.expectNone((r) => r.url === EFFICIENCY_URL());
  });

  it('probe: con la función apagada queda oculta; un fallo no la enciende (y puede reintentarse)', () => {
    setup(['ORG_ADMIN'], null);
    facade.probe('veh-1');
    http.expectOne((r) => r.url === EFFICIENCY_URL()).flush(apiError('INTERNAL'), { status: 500, statusText: 'x' });
    expect(facade.enabled()).toBeNull();
    facade.probe('veh-1');
    http.expectOne((r) => r.url === EFFICIENCY_URL()).flush({ data: viewDto() });
    expect(facade.enabled()).toBeFalse();
    expect(facade.canEstimate()).toBeFalse();
  });

  it('probe: el analista no pregunta nada', () => {
    setup(['ORG_ANALYST'], null);
    facade.probe('veh-1');
    http.expectNone((r) => r.url === EFFICIENCY_URL());
  });

  it('pendientes: abrir pide solo la vista previa (no guarda nada)', () => {
    setup();
    facade.show();
    expect(facade.busy()).toBe('preview');
    expect(previewCall().request.body).toEqual({ all_pending: true });
    http.expectNone(ESTIMATE_APPLY_URL);
  });

  it('pendientes: tras la vista previa se confirma con Aplicar; el token nunca va a la URL', () => {
    setup();
    facade.show();
    previewCall().flush({ data: estimatePreviewDto() });
    expect(facade.canApply()).toBeTrue();
    expect(facade.outcome()).toBeNull();
    facade.apply();
    const req = applyCall();

    expect(req.request.url).not.toContain('tok-estimar');
    expect(req.request.body).toEqual({ all_pending: true, token: 'tok-estimar' });
    req.flush({ data: estimateApplyDto({ applied_to_pending: appliedDto({ trips_recalculated: 300, stale_calculated_trips: 4 }) }) });
    reloadsList();
    expect(facade.outcome()?.recalculated).toBe(300);
    expect(facade.outcome()?.result.applied.staleCalculatedTrips).toBe(4);
  });

  it('sin nada que estimar no se puede aplicar', () => {
    setup();
    facade.show();
    previewCall().flush({ data: estimatePreviewDto({ counts: { ...estimatePreviewDto().counts, to_create: 0, to_retire: 0 } }) });
    expect(facade.canApply()).toBeFalse();
    facade.apply();
    http.expectNone(ESTIMATE_APPLY_URL);
  });

  it('«Continuar» repite la MISMA llamada y acumula; sin avance queda detenido (stalled)', () => {
    setup();
    facade.show();
    previewCall().flush({ data: estimatePreviewDto() });
    facade.apply();
    applyCall().flush({ data: estimateApplyDto({ applied_to_pending: appliedDto({ trips_recalculated: 100, remaining: 50 }) }) });
    reloadsList();
    expect(facade.outcome()?.stalled).toBeFalse();
    facade.continue();
    const again = applyCall();

    expect(again.request.body).toEqual({ all_pending: true, token: 'tok-estimar' });
    again.flush({ data: estimateApplyDto({ applied_to_pending: appliedDto({ trips_recalculated: 30, remaining: 20 }) }) });
    reloadsList();
    expect(facade.outcome()?.recalculated).toBe(130);
    facade.continue();
    applyCall().flush({ data: estimateApplyDto({ applied_to_pending: appliedDto({ trips_recalculated: 0, remaining: 20 }) }) });
    reloadsList();
    expect(facade.outcome()?.stalled).toBeTrue();
  });

  it('lotes: con next_cursor se pide otra vista previa con after y el token anterior se descarta', () => {
    setup();
    facade.show();
    previewCall().flush({ data: estimatePreviewDto({ next_cursor: 'cur-2' }) });
    facade.apply();
    applyCall().flush({ data: estimateApplyDto({ next_cursor: 'cur-2' }) });
    reloadsList();
    facade.nextBatch();
    expect(previewCall().request.body).toEqual({ all_pending: true, after: 'cur-2' });
    expect(facade.outcome()).toBeNull();
  });

  it('token vencido: se descarta, se pide revisar de nuevo y no se aplica con el viejo; revisar de nuevo pide otra vista previa', () => {
    setup();
    facade.show();
    previewCall().flush({ data: estimatePreviewDto() });
    facade.apply();
    applyCall().flush(apiError('FICHA_TOKEN_EXPIRED'), { status: 409, statusText: 'x' });
    expect(facade.stale()).toBeTrue();
    expect(facade.canApply()).toBeFalse();
    facade.apply();
    http.expectNone(ESTIMATE_APPLY_URL);
    facade.reviewAgain();
    expect(previewCall().request.body).toEqual({ all_pending: true });
    expect(facade.stale()).toBeFalse();
  });

  it('vista previa desactualizada (ESTIMATE_PREVIEW_STALE) también obliga a revisar de nuevo', () => {
    setup();
    facade.show();
    previewCall().flush({ data: estimatePreviewDto() });
    facade.apply();
    applyCall().flush(apiError('ESTIMATE_PREVIEW_STALE'), { status: 409, statusText: 'x' });
    expect(facade.stale()).toBeTrue();
    expect(facade.error()?.code).toBe('ESTIMATE_PREVIEW_STALE');
  });

  it('ESTIMATION_DISABLED: la bandera pasa a apagada y se oculta la acción', () => {
    setup();
    facade.show();
    previewCall().flush(apiError('ESTIMATION_DISABLED'), { status: 404, statusText: 'x' });
    expect(facade.enabled()).toBeFalse();
    expect(facade.canEstimate()).toBeFalse();
    expect(facade.error()?.code).toBe('ESTIMATION_DISABLED');
  });

  it('COMPANY_BUSY al aplicar: Reintentar repite la aplicación con el mismo token', () => {
    setup();
    facade.show();
    previewCall().flush({ data: estimatePreviewDto() });
    facade.apply();
    applyCall().flush(apiError('COMPANY_BUSY'), { status: 409, statusText: 'x' });
    expect(facade.error()?.code).toBe('COMPANY_BUSY');
    expect(facade.stale()).toBeFalse();
    facade.retry();
    expect(applyCall().request.body).toEqual({ all_pending: true, token: 'tok-estimar' });
  });

  describe('un vehículo desde su diálogo', () => {
    const openVehicle = (): void => {
      TestBed.inject(VehicleEfficiencyFacade).open('veh-1');
      http.expectOne((r) => r.url === EFFICIENCY_URL()).flush({ data: suggestionView() });
    };

    it('vista previa y, si hay algo que guardar, aplica solo con el token; refresca la historia y el inventario', () => {
      setup();
      openVehicle();
      facade.useReference('veh-1');
      expect(previewCall().request.body).toEqual({ vehicle_ids: ['veh-1'] });
      http.expectNone(ESTIMATE_APPLY_URL);
    });

    it('la pulsación confirma: tras la vista previa se aplica con el mismo alcance y el token, y se refresca', () => {
      setup();
      openVehicle();
      facade.useReference('veh-1');
      previewCall().flush({ data: estimatePreviewDto() });
      const req = applyCall();

      expect(req.request.body).toEqual({ vehicle_ids: ['veh-1'], token: 'tok-estimar' });
      req.flush({ data: estimateApplyDto() });
      http.expectOne((r) => r.url === EFFICIENCY_URL() && r.method === 'GET').flush({ data: suggestionView() });
      reloadsList();
      expect(facade.outcome()?.result.recordsCreated).toBe(25);
    });

    it('sin nada que guardar (ya tiene valor propio o no hay referencia) no se aplica y la vista previa explica el motivo', () => {
      setup();
      openVehicle();
      facade.useReference('veh-1');
      previewCall().flush({ data: estimatePreviewDto({ counts: { ...estimatePreviewDto().counts, to_create: 0 } }) });
      http.expectNone(ESTIMATE_APPLY_URL);
      expect(facade.outcome()).toBeNull();
      expect(facade.preview()?.rejectedByReason.length).toBe(1);
    });

    it('token vencido: se descarta, se ofrece revisar de nuevo y no se reutiliza', () => {
      setup();
      openVehicle();
      facade.useReference('veh-1');
      previewCall().flush({ data: estimatePreviewDto() });
      applyCall().flush(apiError('FICHA_TOKEN_EXPIRED'), { status: 409, statusText: 'x' });
      expect(facade.stale()).toBeTrue();
      facade.reviewAgain();
      previewCall().flush({ data: estimatePreviewDto({ token: 'tok-nuevo' }) });
      expect(applyCall().request.body).toEqual({ vehicle_ids: ['veh-1'], token: 'tok-nuevo' });
    });
  });

  it('cambiar de empresa descarta el token, la vista previa y la bandera', () => {
    setup();
    facade.show();
    previewCall().flush({ data: estimatePreviewDto() });
    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);
    TestBed.flushEffects();
    expect(facade.preview()).toBeNull();
    expect(facade.open()).toBeFalse();
    expect(facade.enabled()).toBeNull();
    facade.apply();
    http.expectNone(ESTIMATE_APPLY_URL);
  });

  it('modo de la empresa OFF: no se puede estimar (ni pendientes ni un vehículo) y no se llama al servidor; el 409 queda como respaldo', () => {
    setup(['ORG_ADMIN'], true, 'OFF');

    expect(facade.modeOff()).toBeTrue();
    expect(facade.canEstimate()).toBeTrue();
    expect(facade.canRun()).toBeFalse();
    facade.show();
    facade.useReference('veh-1');
    http.expectNone(ESTIMATE_PREVIEW_URL);
    expect(facade.open()).toBeFalse();
  });

  it('modo ASK o AUTO: se puede estimar', () => {
    setup(['ORG_ADMIN'], true, 'AUTO');

    expect(facade.modeOff()).toBeFalse();
    expect(facade.canRun()).toBeTrue();
  });
});
