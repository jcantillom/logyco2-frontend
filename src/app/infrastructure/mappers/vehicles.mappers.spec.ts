import { summaryDto, vehicleDetailDto, vehicleDto } from '../../../testing/vehicles';
import { toVehicle, toVehicleDetail, toVehicleSummary, vehicleBody, vehiclePatchBody } from './vehicles.mappers';

describe('vehicles.mappers', () => {
  it('toVehicle pasa a camelCase y conserva la placa original y la normalizada', () => {
    expect(toVehicle(vehicleDto())).toEqual({
      id: 'veh-1', plate: 'ABC123', plateOriginal: 'abc 123', country: 'CO', configurationCode: 'C2', configurationRecognized: true, vehicleType: 'Camión',
      fuelType: 'DIESEL', modelYear: 2018, technology: null, capacityTons: 8, ownership: 'UNKNOWN', status: 'ACTIVE', source: 'MANUAL',
      createdAt: '2026-03-02T10:00:00Z',
    });
  });

  it('la propiedad nunca se infiere: un valor desconocido queda «sin declarar» y un estado desconocido, inactivo', () => {
    const vehicle = toVehicle(vehicleDto({ ownership: 'ALGO_NUEVO', status: 'ALGO_NUEVO' }));

    expect(vehicle.ownership).toBe('UNKNOWN');
    expect(vehicle.status).toBe('INACTIVE');
    expect(toVehicle(vehicleDto({ ownership: 'OWN' }))).toEqual(jasmine.objectContaining({ ownership: 'OWN', source: 'MANUAL' }));
  });

  it('toVehicleDetail mapea el historial (valores a texto o null) y el actor', () => {
    const detail = toVehicleDetail(vehicleDetailDto({ history: [{ id: 'h', event: 'UPDATED', at: 'x', actor_name: null, changes: [{ field: 'model_year', before: 2017, after: null }] }] }));

    expect(detail.history).toEqual([{ id: 'h', event: 'UPDATED', at: 'x', actorName: null, changes: [{ field: 'model_year', before: '2017', after: null }]}]);
    expect('runs' in detail).toBeFalse();
  });

  it('toVehicleSummary entrega los conteos del servidor', () => {
    expect(toVehicleSummary(summaryDto)).toEqual({ registered: 12, inactive: 1 });
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
});
