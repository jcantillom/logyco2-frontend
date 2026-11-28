import { ManualFuel, ManualOptions, ManualPlace, ManualTemplate, ManualTripInput, ManualTripOutcome, ManualVehicle, RepeatedTrip, RouteDistance, VoidInput, VoidOutcome } from '../../domain/models/manual-trips';
import { TripPlace, TripStatus } from '../../domain/models/operations';
import { ManualOptionsDto, ManualPlaceDto, ManualTemplateDto, ManualTripBodyDto, ManualTripOutDto, ManualVehicleDto, RepeatedDataDto, RouteDistanceDto, VoidBodyDto, VoidOutDto } from '../dto/manual-trips.dto';
import { OperationPlaceDto } from '../dto/operations.dto';
import { toTripDetail } from './operations.mappers';
import { efficiencyBasis, efficiencyOrigin } from './vehicle-efficiency.mappers';

/** Un decimal que llega como texto («412.3»); vacío o no numérico es «sin dato», nunca 0. */
const decimal = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const place = (dto: OperationPlaceDto): TripPlace => ({ code: dto.code ?? null, label: dto.label ?? null });

export const toManualOptions = (dto: ManualOptionsDto): ManualOptions => ({
  minDate: dto.dates.min,
  maxDate: dto.dates.max,
  fuels: dto.fuels.map(
    (fuel): ManualFuel => ({ value: fuel.value, label: fuel.label, hasFactor: fuel.has_factor, consumptionUnits: fuel.consumption_units, efficiencyUnits: fuel.efficiency_units }),
  ),
});

export const toManualVehicle = (dto: ManualVehicleDto): ManualVehicle => ({
  plate: dto.plate,
  configuration: dto.configuration ?? null,
  vehicleType: dto.vehicle_type ?? null,
  fuelType: dto.fuel_type ?? null,
  fuelLabel: dto.fuel_label ?? null,
  active: dto.status === 'ACTIVE',
  lastEfficiency: dto.last_efficiency ? { value: dto.last_efficiency.value, unit: dto.last_efficiency.unit, tripDate: dto.last_efficiency.trip_date ?? null } : null,
  vehicleEfficiency: dto.vehicle_efficiency
    ? { value: dto.vehicle_efficiency.value, unit: dto.vehicle_efficiency.unit, origin: efficiencyOrigin(dto.vehicle_efficiency.origin), basis: efficiencyBasis(dto.vehicle_efficiency.basis), declaredAt: dto.vehicle_efficiency.declared_at }
    : null,
});

export const toManualPlace = (dto: ManualPlaceDto): ManualPlace => ({ code: dto.code, label: dto.label });

export const toRouteDistance = (dto: RouteDistanceDto): RouteDistance => ({ available: dto.available, distanceKm: decimal(dto.distance_km), reason: dto.reason ?? null });

export const toManualTemplate = (dto: ManualTemplateDto): ManualTemplate => ({
  mode: dto.mode,
  sourceTripRef: dto.source_trip_ref ?? null,
  plate: dto.plate ?? null,
  plateRegistered: dto.plate_registered,
  origin: place(dto.origin),
  destination: place(dto.destination),
  fuelType: dto.fuel_type ?? null,
  consumptionUnit: dto.consumption_unit ?? null,
  efficiencyUnit: dto.efficiency_unit ?? null,
});

/** El cuerpo del registro: solo viaja lo escrito; el valor por ruta nunca (el servidor lo vuelve a resolver). */
export const toManualTripBody = (input: ManualTripInput): ManualTripBodyDto => ({
  trip_date: input.tripDate,
  plate: input.plate,
  origin: input.origin,
  destination: input.destination,
  ...(input.distanceKm ? { distance_km: input.distanceKm } : {}),
  ...(input.consumption ? { consumption: input.consumption.value, consumption_unit: input.consumption.unit } : {}),
  ...(input.efficiency ? { efficiency: input.efficiency.value, efficiency_unit: input.efficiency.unit } : {}),
  ...(input.fuelType ? { fuel_type: input.fuelType } : {}),
  ...(input.cargoTon ? { cargo_ton: input.cargoTon } : {}),
  ...(input.confirmDistinct ? { confirm_distinct: true } : {}),
});

export const toManualTripOutcome = (dto: ManualTripOutDto): ManualTripOutcome => ({
  created: dto.created,
  trip: toTripDetail(dto.trip),
  result: {
    status: dto.result.status as TripStatus,
    reasonLabel: dto.result.reason_label ?? null,
    methodLabel: dto.result.method_label ?? null,
    kgCo2: decimal(dto.result.kg_co2),
    counted: dto.result.counted,
    countedNote: dto.result.counted_note ?? null,
    completable: dto.result.completable,
  },
});

export const toRepeatedTrips = (dto: RepeatedDataDto): readonly RepeatedTrip[] =>
  (dto.candidates ?? []).map((c) => ({
    id: c.id,
    tripId: c.trip_id ?? null,
    tripDate: c.trip_date ?? null,
    plate: c.plate ?? null,
    origin: place(c.origin),
    destination: place(c.destination),
    stateLabel: c.state_label,
    source: c.source === 'MANUAL' ? 'MANUAL' : 'FILE',
    kgCo2: decimal(c.kg_co2),
  }));

export const toVoidBody = (input: VoidInput): VoidBodyDto => ({
  ...(input.reason ? { reason: input.reason } : {}),
  ...(input.expectedVersion !== undefined ? { expected_version: input.expectedVersion } : {}),
});

export const toVoidOutcome = (dto: VoidOutDto): VoidOutcome => ({ alreadyVoided: dto.already_voided, trip: toTripDetail(dto.trip), kgCo2Removed: decimal(dto.effect.kg_co2_removed) });
