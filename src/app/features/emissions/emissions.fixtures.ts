import { CodeGuideDto, EmissionFactorDto, FreightVehicleDto, SimulationDto, VehicleCatalogDto } from '../../infrastructure/dto/emissions.dto';

export const API = 'http://api.test/api/v1/emissions';

export const vehicleDto = (overrides: Partial<FreightVehicleDto> = {}): FreightVehicleDto => ({
  code: 'C2', designation: '2', name: 'Camión rígido de dos ejes (uno delantero y uno trasero)', short_name: 'Camión rígido', family: 'RIGID', truck_axles: 2, trailer_axles: 0, truck_axle_groups: [1, 1], trailer_axle_groups: [], layouts: [], trailer_kind: null, total_axles: 2,
  description: 'Camión de dos ejes.', gross_weight_kg: 17000, tolerance_kg: 500, pbv_variants: [], max_length_m: 12.2, citation: 'Art. 8', verified: true, notes: null,
  ...overrides,
});

/** Un vehículo de cada familia y forma que el catálogo puede devolver. */
export const VEHICLES: FreightVehicleDto[] = [
  vehicleDto({ featured: true }),
  vehicleDto({ featured: true, code: 'C3', designation: '3', name: 'Camión rígido de tres ejes (uno delantero y un tándem trasero)', truck_axles: 3, total_axles: 3, truck_axle_groups: [1, 2], layouts: [{ id: 'tandem_steering', label: 'Tándem direccional', truck_axle_groups: [2, 1], note: 'Dos ejes delanteros direccionales.' }], gross_weight_kg: 28000 }),
  vehicleDto({
    featured: true, code: 'C4', designation: '4', truck_axles: 4, total_axles: 4, truck_axle_groups: [2, 2], gross_weight_kg: null,
    pbv_variants: [{ gross_weight_kg: 31000, tolerance_kg: 500, note: 'Disposición A' }, { gross_weight_kg: 36000, tolerance_kg: 500, note: 'Disposición B' }],
  }),
  vehicleDto({ featured: true, code: 'C2S1', designation: '2S1', name: 'Tractocamión', family: 'TRACTOR', truck_axles: 2, trailer_axles: 1, truck_axle_groups: [1, 1], trailer_axle_groups: [1], trailer_kind: 'S', total_axles: 3, gross_weight_kg: 27000 }),
  vehicleDto({ featured: true, code: 'C3S3', designation: '3S3', name: 'Tractocamión', family: 'TRACTOR', truck_axles: 3, trailer_axles: 3, truck_axle_groups: [1, 2], trailer_axle_groups: [3], trailer_kind: 'S', total_axles: 6, gross_weight_kg: 52000 }),
  vehicleDto({ code: 'C2R2', designation: '2R2', name: 'Camión con remolque', family: 'TRAILER', truck_axles: 2, trailer_axles: 2, truck_axle_groups: [1, 1], trailer_axle_groups: [1, 1], trailer_kind: 'R', total_axles: 4, gross_weight_kg: 40000 }),
  vehicleDto({ code: 'R2', designation: 'R2', name: 'Remolque', family: 'TRAILER', truck_axles: 0, trailer_axles: 2, truck_axle_groups: [], trailer_axle_groups: [1, 1], trailer_kind: 'R', total_axles: 2, gross_weight_kg: 20000 }),
  vehicleDto({ code: 'C2B1', designation: '2B1', name: 'Camión con remolque balanceado', family: 'BALANCED_TRAILER', truck_axles: 2, trailer_axles: 1, truck_axle_groups: [1, 1], trailer_axle_groups: [1], trailer_kind: 'B', total_axles: 3, gross_weight_kg: 28000 }),
  vehicleDto({ code: 'B1', designation: 'B1', name: 'Remolque balanceado', family: 'BALANCED_TRAILER', truck_axles: 0, trailer_axles: 1, truck_axle_groups: [], trailer_axle_groups: [1], trailer_kind: 'B', total_axles: 1, gross_weight_kg: 11000 }),
  vehicleDto({ code: 'C3R3', designation: '3R3', name: 'Camión con remolque', family: 'TRAILER', truck_axles: 3, trailer_axles: 3, truck_axle_groups: [1, 2], trailer_axle_groups: [1, 2], trailer_kind: 'R', total_axles: 6, gross_weight_kg: null, verified: false, notes: 'Pendiente de verificación.' }),
];

export const CODE_GUIDE: CodeGuideDto = {
  letters: [{ symbol: 'C', meaning: 'Camión' }, { symbol: 'S', meaning: 'Semirremolque' }, { symbol: 'R', meaning: 'Remolque' }, { symbol: 'B', meaning: 'Remolque balanceado' }],
  digit_rule: 'El número indica los ejes de esa parte.',
  source: 'Resolución de prueba',
};

export const catalogDto = (items: FreightVehicleDto[] = VEHICLES): VehicleCatalogDto => ({
  regulation: { name: 'Resolución de pesos y dimensiones', number: '20223040045295', entity: 'MinTransporte', url: 'https://example.test/norma', in_force: true, checked_on: '2026-11-20' },
  general_dimensions: { max_width_m: 2.6, max_height_m: 4.4, citation: 'Art. 5' },
  tolerance: { description: 'Tolerancia de pesaje descrita en la norma.', citation: 'Art. 9' },
  code_guide: CODE_GUIDE,
  items,
});

export const factorDto = (overrides: Partial<EmissionFactorDto> = {}): EmissionFactorDto => ({
  fuel_code: 'DIESEL_B2', name: 'Diésel B2', value: '10.1000', unit: 'kg_CO2/gal', volume_unit: 'gal', efficiency_unit: 'km/gal', gas: 'CO2',
  source_name: 'Fuente de prueba', source_document: 'Documento de prueba', source_url: 'https://example.test/fuente', reference_year: 2023,
  verification_status: 'VERIFIED', usable_for_calculation: true,
  ...overrides,
});

export const GASOLINE = (overrides: Partial<EmissionFactorDto> = {}): EmissionFactorDto => factorDto({ fuel_code: 'GASOLINE_MOTOR', name: 'Gasolina motor (sin mezcla)', value: '8.2000', source_name: 'Fuente gasolina', source_document: 'Documento gasolina', ...overrides });
export const NATURAL_GAS = (overrides: Partial<EmissionFactorDto> = {}): EmissionFactorDto => factorDto({
  fuel_code: 'NATURAL_GAS', name: 'Gas natural (m³ estándar)', value: '1.9000', unit: 'kg_CO2/m3', volume_unit: 'm3', efficiency_unit: 'km/m3', source_name: 'Fuente gas', source_document: 'Documento gas', ...overrides,
});

/** Los tres combustibles en el orden del servidor. */
export const fuelsDto = (): EmissionFactorDto[] => [factorDto(), GASOLINE(), NATURAL_GAS()];

export const simulationDto = (overrides: Partial<SimulationDto> = {}): SimulationDto => ({
  fuel_code: 'DIESEL_B2', volume: '30.0000', volume_unit: 'gal', co2_kg: '303.0000', official: true, message: null, factor: factorDto(), ...overrides,
});
