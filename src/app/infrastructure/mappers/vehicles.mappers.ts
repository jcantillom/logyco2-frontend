import {
  NewVehicle,
  Vehicle,
  VehicleChange,
  VehicleChanges,
  VehicleDetail,
  VehicleHistoryEntry,
  VehicleOwnership,
  VehicleStatus,
  VehicleSummary,
} from '../../domain/models/vehicles';
import {
  VehicleChangeDto,
  VehicleCreateDto,
  VehicleDetailDto,
  VehicleDto,
  VehicleHistoryEntryDto,
  VehiclePatchDto,
  VehicleSummaryDto,
} from '../dto/vehicles.dto';
import { toVehicleEfficiency } from './vehicle-efficiency.mappers';

const OWNERSHIPS: readonly VehicleOwnership[] = ['UNKNOWN', 'OWN', 'CONTRACTED', 'THIRD_PARTY', 'SUBCONTRACTED'];

const known = <T extends string>(options: readonly T[], value: string, fallback: T): T => options.find((option) => option === value) ?? fallback;

/** Cuerpo JSON solo con los campos informados (el servidor distingue «no enviado» de «vacío»). */
const defined = <T extends object>(body: T): T => Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)) as T;

/** Valor de un campo en el historial: siempre texto o `null`, venga como venga del servidor. */
const text = (value: unknown): string | null => (value === null || value === undefined || value === '' ? null : String(value));

/** La propiedad nunca se infiere: un valor fuera del catálogo se trata como «sin declarar». */
const ownership = (value: string): VehicleOwnership => known(OWNERSHIPS, value, 'UNKNOWN');

/** Un estado desconocido se trata como el más restrictivo (inactivo), nunca como activo. */
const vehicleStatus = (value: string): VehicleStatus => (value === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE');

export function toVehicle(dto: VehicleDto): Vehicle {
  return {
    id: dto.id,
    plate: dto.plate,
    plateOriginal: dto.plate_original,
    country: dto.country,
    configurationCode: dto.configuration_code,
    configurationRecognized: dto.configuration_recognized,
    vehicleType: dto.vehicle_type,
    fuelType: dto.fuel_type,
    modelYear: dto.model_year,
    technology: dto.technology,
    technologyOriginal: dto.technology_original ?? null,
    capacityTons: dto.capacity_tons,
    ownership: ownership(dto.ownership),
    status: vehicleStatus(dto.status),
    // Un origen que el cliente no conoce se muestra como registro manual, el de siempre.
    source: dto.source === 'IMPORT' ? 'IMPORT' : 'MANUAL',
    createdAt: dto.created_at,
    efficiency: toVehicleEfficiency(dto.efficiency),
  };
}

const toChange = (dto: VehicleChangeDto): VehicleChange => ({ field: dto.field, before: text(dto.before), after: text(dto.after) });

const toHistoryEntry = (dto: VehicleHistoryEntryDto): VehicleHistoryEntry => ({
  id: dto.id,
  event: dto.event,
  at: dto.at,
  actorName: dto.actor_name,
  changes: dto.changes.map(toChange),
});

export function toVehicleDetail(dto: VehicleDetailDto): VehicleDetail {
  return { ...toVehicle(dto), history: dto.history.map(toHistoryEntry) };
}

export const toVehicleSummary = (dto: VehicleSummaryDto): VehicleSummary => ({
  registered: dto.registered,
  inactive: dto.inactive,
});

/** La placa se envía tal como se escribió (recortada): el servidor la normaliza y valida. */
export function vehicleBody(vehicle: NewVehicle): VehicleCreateDto {
  return defined({
    plate: vehicle.plate.trim(),
    country: vehicle.country,
    configuration_code: vehicle.configurationCode,
    vehicle_type: vehicle.vehicleType,
    fuel_type: vehicle.fuelType,
    model_year: vehicle.modelYear,
    technology: vehicle.technology,
    capacity_tons: vehicle.capacityTons,
    ownership: vehicle.ownership,
  });
}

export function vehiclePatchBody(changes: VehicleChanges): VehiclePatchDto {
  return defined({
    configuration_code: changes.configurationCode,
    vehicle_type: changes.vehicleType,
    fuel_type: changes.fuelType,
    model_year: changes.modelYear,
    technology: changes.technology,
    capacity_tons: changes.capacityTons,
    ownership: changes.ownership,
    status: changes.status,
    confirm_structural: changes.confirmStructural,
  });
}
