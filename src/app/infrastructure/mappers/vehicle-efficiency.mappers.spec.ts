import { vehicleDto } from '../../../testing/vehicles';
import { toVehicle } from './vehicles.mappers';
import { declareBody, toVehicleEfficiency } from './vehicle-efficiency.mappers';

describe('vehicle-efficiency.mappers', () => {
  it('el inventario trae el rendimiento vigente del vehículo, o null si no tiene', () => {
    const efficiency = { value: '6.900000', unit: 'km/gal', origin: 'MEASURED', basis: 'REAL', source_kind: 'FICHA', measured_on: '2026-11-01', declared_at: '2026-11-20T15:00:00Z' };

    expect(toVehicle(vehicleDto({ efficiency })).efficiency).toEqual({ value: 6.9, unit: 'km/gal', origin: 'MEASURED', basis: 'REAL', sourceKind: 'FICHA', measuredOn: '2026-11-01', declaredAt: '2026-11-20T15:00:00Z' });
    expect(toVehicle(vehicleDto({ efficiency: null })).efficiency).toBeNull();
    expect(toVehicle(vehicleDto()).efficiency).toBeNull();
    expect(toVehicleEfficiency(undefined)).toBeNull();
  });

  it('declareBody omite lo vacío', () => {
    expect(declareBody({ value: '8', unit: 'km/l', origin: 'DECLARED', basis: null, note: null, measuredOn: null })).toEqual({ value: '8', unit: 'km/l', origin: 'DECLARED' });
  });
});
