import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp } from '../../../testing/providers';
import { EFFICIENCY_URL, ESTIMATE_APPLY_URL, ESTIMATE_PREVIEW_URL, apiError, estimateApplyDto, estimateDto, estimatePreviewDto, suggestionView, viewDto } from '../../../testing/vehicle-efficiency';
import { toAppError } from '../../core/errors/http-error-mapper';
import { EfficiencyView, EstimateApplyResult, EstimatePreview } from '../../domain/models/vehicle-efficiency';
import { VehicleEfficiencyRepository } from '../../domain/repositories/vehicle-efficiency.repositories';

const ORG = ORG_ENVIA.id;

describe('HttpVehicleEfficiencyRepository · estimación por referencia', () => {
  let repo: VehicleEfficiencyRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    repo = TestBed.inject(VehicleEfficiencyRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('view: mapea la sugerencia (decimales de texto a número, rango y fuente) solo con la función encendida', () => {
    let result: EfficiencyView | undefined;

    repo.view(ORG, 'veh-1', { page: 1, pageSize: 5 }).subscribe((v) => (result = v));
    http.expectOne((r) => r.url === EFFICIENCY_URL()).flush({ data: suggestionView() });

    expect(result?.estimationEnabled).toBeTrue();
    expect(result?.estimate).toEqual(jasmine.objectContaining({ value: 6.9, unit: 'km/gal', uncertaintyLow: 5.6, uncertaintyHigh: 9.2, tableRef: 'Tabla 2.8', pageRef: 'PDF p. 32', evidenceLevel: 'LOW' }));
  });

  it('view: sin los campos nuevos (servidor anterior) o con la función apagada no hay sugerencia', () => {
    const results: EfficiencyView[] = [];

    repo.view(ORG, 'veh-1', { page: 1, pageSize: 5 }).subscribe((v) => results.push(v));
    http.expectOne((r) => r.url === EFFICIENCY_URL()).flush({ data: viewDto() });
    repo.view(ORG, 'veh-1', { page: 1, pageSize: 5 }).subscribe((v) => results.push(v));
    http.expectOne((r) => r.url === EFFICIENCY_URL()).flush({ data: suggestionView({ estimation_enabled: false, estimate: estimateDto() }) });

    expect(results.map((v) => [v.estimationEnabled, v.estimate])).toEqual([[false, null], [false, null]]);
  });

  it('view: sin rango no se inventa uno y el motivo cerrado llega con su texto del servidor', () => {
    let result: EfficiencyView | undefined;

    repo.view(ORG, 'veh-1', { page: 1, pageSize: 5 }).subscribe((v) => (result = v));
    http.expectOne((r) => r.url === EFFICIENCY_URL()).flush({
      data: suggestionView({ estimate: null, estimate_reason: 'FUEL_NOT_COVERED', estimate_reason_label: 'El combustible no tiene referencia' }),
    });

    expect(result?.estimate).toBeNull();
    expect([result?.estimateReason, result?.estimateReasonLabel]).toEqual(['FUEL_NOT_COVERED', 'El combustible no tiene referencia']);
  });

  it('previewEstimate: POST con los ids o con all_pending (y el cursor), sin token; mapea conteos, motivos y cursor', () => {
    let result: EstimatePreview | undefined;

    repo.previewEstimate(ORG, { kind: 'vehicles', vehicleIds: ['veh-1'] }).subscribe((p) => (result = p));
    const first = http.expectOne(ESTIMATE_PREVIEW_URL);

    expect(first.request.body).toEqual({ vehicle_ids: ['veh-1'] });
    first.flush({ data: estimatePreviewDto({ next_cursor: 'cur-9' }) });

    expect(result?.counts).toEqual(jasmine.objectContaining({ toCreate: 25, rejected: 8, pendingTrips: 900, keptVehicleEfficiency: 5 }));
    expect(result?.rejectedByReason).toEqual([{ reason: 'FUEL_NOT_COVERED', label: 'El combustible no tiene referencia', vehicles: 8 }]);
    expect(result?.nextCursor).toBe('cur-9');

    repo.previewEstimate(ORG, { kind: 'pending', after: null }).subscribe();
    expect(http.expectOne(ESTIMATE_PREVIEW_URL).request.body).toEqual({ all_pending: true });
    repo.previewEstimate(ORG, { kind: 'pending', after: 'cur-9' }).subscribe();
    expect(http.expectOne(ESTIMATE_PREVIEW_URL).request.body).toEqual({ all_pending: true, after: 'cur-9' });
  });

  it('applyEstimate: el MISMO alcance más el token; mapea lo guardado y el efecto sobre los pendientes', () => {
    let result: EstimateApplyResult | undefined;

    repo.applyEstimate(ORG, { kind: 'pending', after: 'cur-9' }, 'tok-estimar').subscribe((r) => (result = r));
    const req = http.expectOne(ESTIMATE_APPLY_URL);

    expect(req.request.body).toEqual({ all_pending: true, after: 'cur-9', token: 'tok-estimar' });
    req.flush({ data: estimateApplyDto() });

    expect(result).toEqual(jasmine.objectContaining({ recordsCreated: 25, recordsRetired: 0, alreadyEstimated: 2, keptVehicleEfficiency: 5, nextCursor: null }));
    expect(result?.applied.tripsRecalculated).toBe(120);
  });

  it('errores nuevos: ESTIMATION_DISABLED y ESTIMATE_PREVIEW_STALE salen con mensaje propio en español, sin el texto del servidor', () => {
    const codes: string[] = [];
    const messages: string[] = [];

    for (const [code, status] of [['ESTIMATION_DISABLED', 404], ['ESTIMATE_PREVIEW_STALE', 409], ['ESTIMATE_TOO_LARGE', 422], ['INVALID_ESTIMATE_SCOPE', 422]] as const) {
      repo.previewEstimate(ORG, { kind: 'pending', after: null }).subscribe({
        error: (e: unknown) => {
          codes.push(toAppError(e).code);
          messages.push(toAppError(e).message);
        },
      });
      http.expectOne(ESTIMATE_PREVIEW_URL).flush(apiError(code), { status, statusText: 'x' });
    }

    expect(codes).toEqual(['ESTIMATION_DISABLED', 'ESTIMATE_PREVIEW_STALE', 'ESTIMATE_TOO_LARGE', 'INVALID_ESTIMATE_SCOPE']);
    expect(messages.every((m) => m.length > 20 && !m.includes('servidor'))).toBeTrue();
  });
});
