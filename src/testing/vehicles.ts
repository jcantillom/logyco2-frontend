import { VehicleDetailDto, VehicleDto } from '../app/infrastructure/dto/vehicles.dto';
import { ORG_ENVIA } from './builders';

/** URL base de la empresa de pruebas para los endpoints de vehículos. */
export const VEHICLES_ORG_URL = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}`;

/** Respuesta paginada con el sobre del backend. */
export const pagedBody = <T>(items: readonly T[], total = items.length, pageSize = 10, page = 1) => ({
  data: items,
  meta: { pagination: { page, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)), has_next: page * pageSize < total, has_previous: page > 1 } },
});

export const vehicleDto = (overrides: Partial<VehicleDto> = {}): VehicleDto => ({
  id: 'veh-1',
  plate: 'ABC123',
  plate_original: 'abc 123',
  country: 'CO',
  configuration_code: 'C2',
  configuration_recognized: true,
  vehicle_type: 'Camión',
  fuel_type: 'DIESEL',
  model_year: 2018,
  technology: null,
  capacity_tons: 8,
  ownership: 'UNKNOWN',
  status: 'ACTIVE',
  source: 'MANUAL',
  created_at: '2026-03-02T10:00:00Z',
  ...overrides,
});

export const vehicleDetailDto = (overrides: Partial<VehicleDetailDto> = {}): VehicleDetailDto => ({
  ...vehicleDto(),
  history: [
    {
      id: 'h-2',
      event: 'UPDATED',
      at: '2026-04-01T09:30:00Z',
      actor_name: 'Ana Prueba',
      changes: [{ field: 'fuel_type', before: 'GASOLINE', after: 'DIESEL' }],
    },
    { id: 'h-1', event: 'CREATED', at: '2026-03-02T10:00:00Z', actor_name: 'Ana Prueba', changes: [] },
  ],
  ...overrides,
});

export const summaryDto = { registered: 12, inactive: 1 };
