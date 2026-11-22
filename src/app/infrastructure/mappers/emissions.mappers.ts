import {
  EmissionFactor, FreightVehicle, Simulation, SimulationInput, VehicleCatalog,
} from '../../domain/models/emissions';
import {
  EmissionFactorDto, FreightVehicleDto, SimulationDto, SimulationRequestDto, VehicleCatalogDto,
} from '../dto/emissions.dto';

/** Sin grupos informados, los ejes de cada parte se dibujan como un solo grupo. */
const groupsOf = (groups: number[] | null | undefined, axles: number): number[] => (groups && groups.length > 0 ? groups : axles > 0 ? [axles] : []);

export function toFreightVehicle(dto: FreightVehicleDto): FreightVehicle {
  return {
    code: dto.code,
    designation: dto.designation,
    name: dto.name,
    shortName: dto.short_name || dto.name,
    family: dto.family,
    truckAxles: dto.truck_axles,
    trailerAxles: dto.trailer_axles,
    truckAxleGroups: groupsOf(dto.truck_axle_groups, dto.truck_axles),
    trailerAxleGroups: groupsOf(dto.trailer_axle_groups, dto.trailer_axles),
    layouts: (dto.layouts ?? []).map((l) => ({ id: l.id, label: l.label, truckAxleGroups: l.truck_axle_groups, note: l.note ?? null })),
    trailerKind: dto.trailer_kind,
    totalAxles: dto.total_axles,
    description: dto.description,
    grossWeightKg: dto.gross_weight_kg,
    toleranceKg: dto.tolerance_kg,
    pbvVariants: dto.pbv_variants.map((v) => ({ grossWeightKg: v.gross_weight_kg, toleranceKg: v.tolerance_kg, note: v.note })),
    maxLengthM: dto.max_length_m,
    citation: dto.citation,
    verified: dto.verified,
    notes: dto.notes,
    featured: dto.featured ?? false,
  };
}

export function toVehicleCatalog(dto: VehicleCatalogDto): VehicleCatalog {
  return {
    regulation: { name: dto.regulation.name, number: dto.regulation.number ?? null, entity: dto.regulation.entity, url: dto.regulation.url, inForce: dto.regulation.in_force, checkedOn: dto.regulation.checked_on },
    generalDimensions: { maxWidthM: dto.general_dimensions.max_width_m, maxHeightM: dto.general_dimensions.max_height_m, citation: dto.general_dimensions.citation },
    tolerance: { description: dto.tolerance.description, citation: dto.tolerance.citation },
    codeGuide: dto.code_guide ? { letters: dto.code_guide.letters, digitRule: dto.code_guide.digit_rule, source: dto.code_guide.source ?? null } : null,
    items: dto.items.map(toFreightVehicle),
  };
}

export function toEmissionFactor(dto: EmissionFactorDto): EmissionFactor {
  return {
    fuelCode: dto.fuel_code,
    name: dto.name,
    value: dto.value,
    unit: dto.unit,
    volumeUnit: dto.volume_unit,
    efficiencyUnit: dto.efficiency_unit,
    gas: dto.gas,
    sourceName: dto.source_name,
    sourceDocument: dto.source_document,
    sourceUrl: dto.source_url,
    referenceYear: dto.reference_year,
    status: dto.verification_status,
    usableForCalculation: dto.usable_for_calculation,
  };
}

export function toSimulation(dto: SimulationDto): Simulation {
  return { fuelCode: dto.fuel_code, volume: dto.volume, volumeUnit: dto.volume_unit, co2Kg: dto.co2_kg, official: dto.official, message: dto.message, factor: toEmissionFactor(dto.factor) };
}

export function simulationBody(input: SimulationInput): SimulationRequestDto {
  return { fuel_code: input.fuelCode, distance_km: input.distanceKm, efficiency: input.efficiency };
}
