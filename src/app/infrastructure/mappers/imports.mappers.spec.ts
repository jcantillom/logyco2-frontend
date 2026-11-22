import { columnDto, importDetailDto, importSummaryDto, reviewDto } from '../../../testing/imports';
import { importStatus, toImportCounts, toImportPeriod, toImportCreated, toImportDetail, toImportSummary } from './imports.mappers';

describe('imports.mappers', () => {
  it('toImportSummary pasa a camelCase y mapea la cifra del historial', () => {
    expect(toImportSummary(importSummaryDto())).toEqual({
      id: 'imp-1', fileName: 'operaciones-marzo.xlsx', fileSize: 20480, status: 'COMPLETED', phase: 'DONE', format: 'LOGYCO2_TEMPLATE', rowsTotal: 200, rowsProcessed: 200,
      createdAt: '2026-03-01T10:00:00Z', finishedAt: '2026-03-01T10:02:00Z', createdByName: 'Ana Prueba',
      headline: { rowsRead: 200, realConsumption: 120, estimatedConsumption: 50, pending: 30 }, error: null,
    });
  });

  it('sin cifra, sin formato o sin total los conserva nulos', () => {
    const summary = toImportSummary(importSummaryDto({ headline: null, format: null, rows_total: null, finished_at: null, created_by_name: null, status: 'RUNNING', phase: 'READING' }));

    expect(summary.headline).toBeNull();
    expect(summary.format).toBeNull();
    expect(summary.rowsTotal).toBeNull();
    expect(summary.status).toBe('RUNNING');
  });

  it('toImportCounts pasa a camelCase', () => {
    expect(toImportCounts({ total: 4, in_progress: 1, completed: 2, failed: 1, vehicles_pending: 2, rows_read: 100, rows_calculable: 80, rows_pending: 20, rows_real: 50, rows_estimated: 30, vehicles_new_pending: 3, vehicles_changed_pending: 1, period_from: '2026-01-05', period_to: '2026-03-28', distance_km: 1234.5, cargo_ton: 56.7, rows_with_distance: 90, rows_with_cargo: 80 })).toEqual({ total: 4, inProgress: 1, completed: 2, failed: 1, vehiclesPending: 2, rowsRead: 100, rowsCalculable: 80, rowsPending: 20, rowsReal: 50, rowsEstimated: 30, vehiclesNewPending: 3, vehiclesChangedPending: 1, periodFrom: '2026-01-05', periodTo: '2026-03-28', distanceKm: 1234.5, cargoTon: 56.7, rowsWithDistance: 90, rowsWithCargo: 80 });
  });

  it('toImportCounts tolera que falten las sumas de filas (cuentan 0)', () => {
    expect(toImportCounts({ total: 1, in_progress: 0, completed: 1, failed: 0, vehicles_pending: 0 })).toEqual(jasmine.objectContaining({ rowsRead: 0, rowsCalculable: 0, rowsPending: 0, periodFrom: null, periodTo: null, rowsReal: 0, rowsEstimated: 0, vehiclesNewPending: 0, vehiclesChangedPending: 0, distanceKm: 0, cargoTon: 0, rowsWithDistance: 0, rowsWithCargo: 0 }));
  });

  it('un estado desconocido no se presenta como terminado bien y un formato desconocido es «no reconocido»', () => {
    expect(importStatus('RARO')).toBe('FAILED');
    expect(toImportSummary(importSummaryDto({ status: 'RARO', format: 'OTRO' }))).toEqual(jasmine.objectContaining({ status: 'FAILED', format: 'UNRECOGNIZED' }));
    expect(toImportCreated({ id: 'a', status: 'QUEUED', duplicate: true })).toEqual({ id: 'a', status: 'QUEUED', duplicate: true });
  });

  it('toImportDetail mapea columnas, métodos, motivos, hallazgos y contadores', () => {
    const { review } = toImportDetail(importDetailDto());

    expect(review!.format).toBe('LOGYCO2_TEMPLATE');
    expect(review!.rowsRead).toBe(200);
    expect(review!.columns[1]).toEqual({ field: 'distancia_km', label: 'Distancia (km)', requirement: 'CONDITIONAL', found: true, sourceHeader: 'distancia_km', filledRows: 150 });
    expect(review!.columns[2]).toEqual(jasmine.objectContaining({ found: false, sourceHeader: null, filledRows: 0 }));
    expect(review!.methods).toEqual({ realConsumption: 120, estimatedConsumption: 50, pending: 30 });
    expect(review!.pendingReasons).toEqual([{ code: 'MISSING_DISTANCE_WITH_ROUTE', label: 'Hay origen y destino pero falta la distancia', rows: 20, sampleRows: [4, 9] }]);
    expect(review!.issues[0]).toEqual({ code: 'INVALID_PLATE', severity: 'WARNING', field: 'placa', message: 'Hay placas con formato inválido.', rows: 3, sampleRows: [7, 8, 12] });
    expect(review!.vehicles).toEqual({ distinctPlates: 18, invalidPlates: 3 });
    expect(review!.trips).toEqual({ distinctTripIds: 190, repeatedTripIds: 5 });
  });

  it('una obligatoriedad desconocida es opcional y una severidad desconocida es la más alta', () => {
    const { review } = toImportDetail(importDetailDto({ review: reviewDto({ columns: [columnDto({ requirement: 'RARA' })], issues: [{ code: 'X', severity: 'RARA', field: null, message: 'm', rows: 1, sample_rows: [] }] }) }));

    expect(review!.columns[0].requirement).toBe('OPTIONAL');
    expect(review!.issues[0].severity).toBe('ERROR');
  });

  it('un detalle sin revisión (en curso o fallido) tiene review nula', () => {
    expect(toImportDetail(importDetailDto({ review: null, status: 'RUNNING' })).review).toBeNull();
    expect(toImportDetail(importDetailDto({ review: reviewDto({ format: 'CARITRANS' }) })).review!.format).toBe('CARITRANS');
    expect(toImportDetail(importDetailDto({ review: reviewDto({ format: 'NUEVO' }) })).review!.format).toBe('UNRECOGNIZED');
  });

  it('el periodo de la revisión sale de period.from y period.to; sin uno de los dos o sin periodo es null', () => {
    const period = (value: { from: string | null; to: string | null } | null | undefined) => toImportDetail(importDetailDto({ review: { ...reviewDto(), period: value } })).review!.period;

    expect(period({ from: '2026-01-05', to: '2026-03-28' })).toEqual({ from: '2026-01-05', to: '2026-03-28' });
    expect(period({ from: '2026-01-05', to: null })).toBeNull();
    expect(period(null)).toBeNull();
    expect(period(undefined)).toBeNull();
  });

  it('toImportPeriod pasa a camelCase y tolera que falten las cifras (0)', () => {
    expect(toImportPeriod({ period_from: '2026-01-05', period_to: '2026-03-28', imports: 2, rows_read: 500 })).toEqual({ from: '2026-01-05', to: '2026-03-28', imports: 2, rowsRead: 500 });
    expect(toImportPeriod({ period_from: '2026-01-05', period_to: '2026-03-28' })).toEqual({ from: '2026-01-05', to: '2026-03-28', imports: 0, rowsRead: 0 });
  });
});
