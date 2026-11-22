import { analysisDto, analysisSummaryDto, findingDto, notificationDto, summaryDto, vehicleDetailDto, vehicleDto } from '../../../testing/vehicles';
import {
  confirmBody,
  resolveBody,
  toAnalysis,
  toAnalysisSummary,
  toAnalysisCreated,
  toConfirmResult,
  toFinding,
  toNotification,
  toVehicle,
  toVehicleDetail,
  toVehicleSummary,
  vehicleBody,
  vehiclePatchBody,
} from './vehicles.mappers';

describe('vehicles.mappers', () => {
  it('toVehicle pasa a camelCase y conserva la placa original y la normalizada', () => {
    expect(toVehicle(vehicleDto())).toEqual({
      id: 'veh-1', plate: 'ABC123', plateOriginal: 'abc 123', country: 'CO', configurationCode: 'C2', configurationRecognized: true, vehicleType: 'Camión',
      fuelType: 'DIESEL', modelYear: 2018, technology: null, capacityTons: 8, ownership: 'UNKNOWN', status: 'ACTIVE', source: 'IMPORT',
      firstSeenAt: '2026-03-01T10:00:00Z', lastSeenAt: '2026-05-02T10:00:00Z', createdAt: '2026-03-02T10:00:00Z',
    });
  });

  it('la propiedad nunca se infiere: un valor desconocido queda «sin declarar» y un estado desconocido, inactivo', () => {
    const vehicle = toVehicle(vehicleDto({ ownership: 'ALGO_NUEVO', status: 'ALGO_NUEVO' }));

    expect(vehicle.ownership).toBe('UNKNOWN');
    expect(vehicle.status).toBe('INACTIVE');
    expect(toVehicle(vehicleDto({ ownership: 'OWN', source: 'MANUAL' }))).toEqual(jasmine.objectContaining({ ownership: 'OWN', source: 'MANUAL' }));
  });

  it('toVehicleDetail mapea el historial (valores a texto o null), los archivos y el actor', () => {
    const detail = toVehicleDetail(vehicleDetailDto({ history: [{ id: 'h', event: 'UPDATED', at: 'x', actor_name: null, changes: [{ field: 'model_year', before: 2017, after: null }], run_id: 'r' }] }));

    expect(detail.history).toEqual([{ id: 'h', event: 'UPDATED', at: 'x', actorName: null, changes: [{ field: 'model_year', before: '2017', after: null }], runId: 'r' }]);
    expect(detail.runs).toEqual([{ runId: 'run-1', fileName: 'operaciones-marzo.xlsx', at: '2026-03-01T10:00:00Z', occurrences: 4 }]);
  });

  it('toVehicleSummary entrega los conteos del servidor', () => {
    expect(toVehicleSummary(summaryDto)).toEqual({ registered: 12, pendingNew: 3, conflicts: 2, inactive: 1 });
  });

  it('vehicleBody recorta la placa y omite lo que no se informó', () => {
    expect(vehicleBody({ plate: ' abc123 ', configurationCode: 'C2', modelYear: 2020 })).toEqual({ plate: 'abc123', configuration_code: 'C2', model_year: 2020 });
    expect('ownership' in vehicleBody({ plate: 'ABC123' })).toBeFalse();
    expect(vehicleBody({ plate: 'ABC123', country: 'EC' }).country).toBe('EC');
  });

  it('vehiclePatchBody envía solo los cambios y confirm_structural cuando se pide', () => {
    expect(vehiclePatchBody({ fuelType: 'DIESEL' })).toEqual({ fuel_type: 'DIESEL' });
    expect(vehiclePatchBody({ status: 'INACTIVE', ownership: 'OWN' })).toEqual({ status: 'INACTIVE', ownership: 'OWN' });
    expect(vehiclePatchBody({ configurationCode: 'C3', confirmStructural: true })).toEqual({ configuration_code: 'C3', confirm_structural: true });
  });

  it('toAnalysis y toAnalysisCreated: un estado desconocido no se presenta como terminado', () => {
    expect(toAnalysis(analysisDto())).toEqual(jasmine.objectContaining({ id: 'run-1', fileName: 'operaciones-marzo.xlsx', status: 'COMPLETED', rowsProcessed: 100, rowsTotal: 100, finishedAt: '2026-03-01T10:05:00Z' }));
    expect(toAnalysis(analysisDto()).counts).toEqual({ detected: 10, known: 5, new: 3, conflict: 1, incomplete: 1, invalid: 0 });
    expect(toAnalysis(analysisDto({ status: '???' })).status).toBe('FAILED');
    expect(toAnalysisCreated({ id: 'a', status: 'QUEUED', duplicate: true })).toEqual({ id: 'a', status: 'QUEUED', duplicate: true });
  });

  it('toAnalysisSummary mapea conteos y pendientes; un estado desconocido es FAILED', () => {
    expect(toAnalysisSummary(analysisSummaryDto())).toEqual({
      id: 'run-1', fileName: 'operaciones-marzo.xlsx', status: 'COMPLETED', createdAt: '2026-03-01T10:00:00Z', finishedAt: '2026-03-01T10:05:00Z',
      counts: { detected: 10, known: 5, new: 3, conflict: 1, incomplete: 1, invalid: 0 }, pending: { new: 3, conflict: 1, incomplete: 1, invalid: 0 },
    });
    expect(toAnalysisSummary(analysisSummaryDto({ status: '???', finished_at: null })).status).toBe('FAILED');
  });

  it('toFinding mapea lo detectado, lo actual y las diferencias; sin severidad reconocible muestra la más alta', () => {
    const finding = toFinding(findingDto());

    expect(finding.state).toBe('CONFLICT');
    expect(finding.detected.configurationCode).toBe('C3');
    expect(finding.current?.configurationCode).toBe('C2');
    expect(finding.differences).toEqual([{ field: 'configuration_code', current: 'C2', incoming: 'C3', kind: 'STRUCTURAL', severity: 'HIGH', recommendedAction: 'KEEP_CURRENT' }]);
    expect(finding.sampleRows).toEqual([2, 9]);
    expect(finding.configurationRecognized).toBeTrue();
    expect(finding.inFileConflicts).toEqual([{ field: 'configuration_code', overflow: false, values: [{ value: 'C2', count: 5, rows: [2, 3] }, { value: 'C3', count: 2, rows: [9] }] }]);
    const bare = toFinding({ ...findingDto(), in_file_conflicts: undefined, configuration_recognized: undefined });
    expect(bare.inFileConflicts).toEqual([]);
    expect(bare.configurationRecognized).toBeNull();
    expect(bare.unreadableFields).toEqual([]);
    expect(finding.inFileConflicts[0].overflow).toBeFalse();
    const flagged = toFinding({ ...findingDto(), unreadable_fields: ['fuel_type', 'model_year'], in_file_conflicts: [{ field: 'fuel_type', overflow: true, values: [] }] });
    expect(flagged.unreadableFields).toEqual(['fuel_type', 'model_year']);
    expect(flagged.inFileConflicts[0].overflow).toBeTrue();
    expect(toFinding(findingDto({ current: null })).current).toBeNull();
    expect(toFinding(findingDto({ differences: [{ field: 'f', current: null, incoming: 1, kind: 'X', severity: 'X', recommended_action: 'a' }] })).differences[0]).toEqual(jasmine.objectContaining({ severity: 'HIGH', kind: 'CHANGEABLE', incoming: '1' }));
  });

  it('confirmBody, resolveBody y toConfirmResult', () => {
    expect(confirmBody({ allNew: true })).toEqual({ all_new: true });
    expect(confirmBody({ findingIds: ['f-1'] })).toEqual({ finding_ids: ['f-1'] });
    expect(resolveBody({ action: 'ACCEPT_INCOMING', fields: ['configuration_code'], confirmStructural: true })).toEqual({ action: 'ACCEPT_INCOMING', fields: ['configuration_code'], confirm_structural: true });
    expect(resolveBody({ action: 'DEFER' })).toEqual({ action: 'DEFER' });
    expect(toConfirmResult({ registered: 2, already_registered: 1, skipped: 0 })).toEqual({ registered: 2, alreadyRegistered: 1, skipped: 0 });
  });

  it('toNotification mapea el enlace profundo; sin query queda vacío y una severidad desconocida es informativa', () => {
    expect(toNotification(notificationDto())).toEqual({
      id: 'n-1', type: 'vehicles.new', severity: 'INFO', title: 'Vehículos nuevos por confirmar', description: 'Se detectaron 3 vehículos nuevos.',
      createdAt: '2026-03-01T10:05:00Z', read: false, runId: 'run-1', deepLink: { path: '/vehiculos', query: { analysis: 'run-1' } },
    });
    expect(toNotification(notificationDto({ deep_link: { path: '/vehiculos', query: null }, severity: 'RARA' })).deepLink.query).toEqual({});
    expect(toNotification(notificationDto({ severity: 'RARA' })).severity).toBe('INFO');
  });
});
