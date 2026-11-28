import { ManualOptionsDto, ManualPlaceDto, ManualTemplateDto, ManualTripOutDto, ManualVehicleDto, RepeatedDataDto, RouteDistanceDto, VoidOutDto } from '../app/infrastructure/dto/manual-trips.dto';
import { ORG_ENVIA } from './builders';
import { tripDetailDto } from './operations';

/** Base de las rutas de Operaciones de la empresa de pruebas (sin query). */
export const OPS = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}/operations`;
export const MANUAL_URLS = {
  options: `${OPS}/manual/options`,
  vehicles: `${OPS}/manual/vehicles`,
  places: `${OPS}/manual/places`,
  route: `${OPS}/manual/route-distance`,
  register: `${OPS}/trips`,
  voidOf: (id: string): string => `${OPS}/trips/${id}/void`,
  template: (id: string): string => `${OPS}/manual/trips/${id}/template`,
} as const;

export const manualOptionsDto = (overrides: Partial<ManualOptionsDto> = {}): ManualOptionsDto => ({
  dates: { min: '2000-01-01', max: '2026-11-25' },
  fuels: [
    { value: 'DIESEL', label: 'Diésel', has_factor: true, consumption_units: [{ value: 'gal', label: 'Galones (gal)' }, { value: 'l', label: 'Litros (l)' }], efficiency_units: [{ value: 'km/gal', label: 'km/gal' }, { value: 'km/l', label: 'km/l' }] },
    { value: 'GASOLINE', label: 'Gasolina', has_factor: true, consumption_units: [{ value: 'gal', label: 'Galones (gal)' }], efficiency_units: [{ value: 'km/gal', label: 'km/gal' }] },
    { value: 'ELECTRIC', label: 'Eléctrico', has_factor: false, consumption_units: [{ value: 'kwh', label: 'kWh' }], efficiency_units: [{ value: 'km/kwh', label: 'km/kWh' }] },
  ],
  ...overrides,
});

export const manualVehicleDto = (overrides: Partial<ManualVehicleDto> = {}): ManualVehicleDto => ({
  plate: 'ABC123',
  configuration: 'C3S3',
  vehicle_type: 'Tractocamión',
  fuel_type: 'DIESEL',
  fuel_label: 'Diésel',
  status: 'ACTIVE',
  last_efficiency: { value: '8.5000', unit: 'km/gal', trip_date: '2026-11-12' },
  ...overrides,
});

export const manualPlaceDto = (overrides: Partial<ManualPlaceDto> = {}): ManualPlaceDto => ({ code: '05001', municipality: 'Medellín', department: 'Antioquia', label: 'Medellín, Antioquia', ...overrides });

export const routeDto = (overrides: Partial<RouteDistanceDto> = {}): RouteDistanceDto => ({ available: true, distance_km: '412.3', source: 'ROUTE', reason: null, ...overrides });

export const manualTemplateDto = (overrides: Partial<ManualTemplateDto> = {}): ManualTemplateDto => ({
  mode: 'duplicate',
  source_trip_id: 'trip-1',
  source_trip_ref: 'M-000123',
  plate: 'ABC123',
  plate_registered: true,
  origin: { code: '05001', label: 'Medellín, Antioquia' },
  destination: { code: '11001', label: 'Bogotá D.C., Bogotá D.C.' },
  fuel_type: 'DIESEL',
  consumption_unit: 'gal',
  efficiency_unit: 'km/gal',
  ...overrides,
});

/** Un viaje manual con su detalle: `identity.source = MANUAL` y anulable. */
export const manualTripDetailDto = (overrides: Parameters<typeof tripDetailDto>[0] = {}): ReturnType<typeof tripDetailDto> => {
  const base = tripDetailDto();

  return tripDetailDto({
    identity: { ...base.identity, id: 'trip-m1', trip_id: 'M-000123', file_name: 'Registros manuales', source: 'MANUAL', registered_by_name: 'Laura Gómez' },
    voidable: true,
    void_blocked_reason: null,
    ...overrides,
  });
};

export const manualTripOutDto = (overrides: Partial<ManualTripOutDto> = {}): ManualTripOutDto => ({
  created: true,
  trip: manualTripDetailDto(),
  result: { status: 'CALCULATED', reason: null, reason_label: null, method_label: 'Estimado', kg_co2: '128.4000', counted: true, counted_note: null, completable: false, missing_fields: [] },
  ...overrides,
});

export const repeatedDataDto = (overrides: Partial<RepeatedDataDto> = {}): RepeatedDataDto => ({
  candidates: [
    {
      id: 'trip-9',
      trip_id: 'M-000099',
      trip_date: '2026-11-20',
      plate: 'ABC123',
      origin: { code: '05001', label: 'MEDELLÍN, ANTIOQUIA' },
      destination: { code: '11001', label: 'BOGOTÁ D.C., BOGOTÁ D.C.' },
      status: 'CALCULATED',
      state_label: 'Calculado',
      source: 'MANUAL',
      kg_co2: '100.0000',
    },
  ],
  ...overrides,
});

export const voidOutDto = (overrides: Partial<VoidOutDto> = {}): VoidOutDto => ({
  already_voided: false,
  trip: manualTripDetailDto({ state_label: 'Anulado', voidable: false, dedup: { status: 'VOIDED', status_label: 'Anulado', rule: 'VOID', rule_label: 'Anulado por la empresa', resolved_by_name: 'Laura Gómez', resolved_at: '2026-11-24T10:00:00Z', duplicate_of: null } }),
  effect: { counted_before: true, counted_after: false, kg_co2_removed: '100.0000' },
  ...overrides,
});
