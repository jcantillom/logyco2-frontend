import { DataOriginShare, InventoryCoverage, Methodology, MethodologyRef } from '../app/domain/models/methodology';
import { DataOriginShareDto, InventoryCoverageDto, MethodologyDto } from '../app/infrastructure/dto/methodology.dto';
import { toMethodology } from '../app/infrastructure/mappers/methodology.mappers';
import { ORG_ENVIA } from './builders';

/** URL de la declaración metodológica de la empresa de pruebas. */
export const METHODOLOGY_URL = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}/emissions/methodology`;

export const VERIFICATION_TEXT = 'Dato declarado por la empresa; no verificado por un tercero';
export const NOT_CLAIMED = ['No se declara conformidad ni certificación con ISO 14083.', 'No se declara conformidad ni certificación con el Marco GLEC.'];

export const methodologyRef = (overrides: Partial<MethodologyRef> = {}): MethodologyRef => ({ id: 'LGC-CO2-TTW', version: '1.0.0', scopeLabel: 'Emisiones directas por combustión (TTW), solo CO₂', unit: 'kg de CO₂ (no CO₂e)', hasEstimates: true, ...overrides });

export const dataOriginShareDto = (): DataOriginShareDto => ({
  verification: VERIFICATION_TEXT,
  has_verified_data: false,
  total_kg_co2: 1000,
  total_trips: 10,
  rounding: 'Porcentajes a un decimal por mayor resto; suman 100,0.',
  buckets: [
    { key: 'REAL_CONSUMPTION', label: 'Consumo real', meaning: 'El archivo trae el combustible consumido.', kg_co2: 500, trips: 4, pct: 50 },
    { key: 'DECLARED_EFFICIENCY', label: 'Rendimiento declarado', meaning: 'Distancia ÷ rendimiento declarado.', kg_co2: 250.5, trips: 3, pct: 25.1 },
    { key: 'MEASURED_EFFICIENCY', label: 'Rendimiento medido por la empresa', meaning: 'Distancia ÷ rendimiento medido.', kg_co2: 0, trips: 0, pct: 0 },
    {
      key: 'REFERENCE_ESTIMATE', label: 'Estimado por referencia técnica', meaning: 'Distancia ÷ rendimiento de referencia.', kg_co2: 249.5, trips: 3, pct: 24.9,
      sources: [{ source: 'UPME', kg_co2: 200, trips: 2, pct: 20 }, { source: 'Steer/ANDI', kg_co2: 49.5, trips: 1, pct: 4.9 }],
    },
  ],
});

export const dataOriginShare = (): DataOriginShare => ({
  verification: VERIFICATION_TEXT,
  hasVerifiedData: false,
  totalKgCo2: 1000,
  totalTrips: 10,
  rounding: 'Porcentajes a un decimal por mayor resto; suman 100,0.',
  buckets: [
    { key: 'REAL_CONSUMPTION', label: 'Consumo real', meaning: 'El archivo trae el combustible consumido.', kgCo2: 500, trips: 4, pct: 50, sources: [] },
    { key: 'DECLARED_EFFICIENCY', label: 'Rendimiento declarado', meaning: 'Distancia ÷ rendimiento declarado.', kgCo2: 250.5, trips: 3, pct: 25.1, sources: [] },
    { key: 'MEASURED_EFFICIENCY', label: 'Rendimiento medido por la empresa', meaning: 'Distancia ÷ rendimiento medido.', kgCo2: 0, trips: 0, pct: 0, sources: [] },
    {
      key: 'REFERENCE_ESTIMATE', label: 'Estimado por referencia técnica', meaning: 'Distancia ÷ rendimiento de referencia.', kgCo2: 249.5, trips: 3, pct: 24.9,
      sources: [{ source: 'UPME', kgCo2: 200, trips: 2, pct: 20 }, { source: 'Steer/ANDI', kgCo2: 49.5, trips: 1, pct: 4.9 }],
    },
  ],
});

export const inventoryCoverageDto = (): InventoryCoverageDto => ({
  eligible_trips: 18,
  calculated_trips: 12,
  pending_trips: 4,
  blocked_trips: 2,
  coverage_pct: 66.7,
  excluded: { held_trips: 3, duplicate_trips: 1, voided_trips: 0 },
  kg: { counted_kg_co2: 1000, held_kg_co2: 120.5, duplicate_kg_co2: 30, voided_kg_co2: 0 },
  denominator: 'Denominador: viajes calculados, pendientes y bloqueados.',
  basis: 'Cobertura por cantidad de viajes, no por emisiones.',
});

export const inventoryCoverage = (): InventoryCoverage => ({
  eligibleTrips: 18,
  calculatedTrips: 12,
  pendingTrips: 4,
  blockedTrips: 2,
  coveragePct: 66.7,
  excluded: { heldTrips: 3, duplicateTrips: 1, voidedTrips: 0 },
  kg: { countedKgCo2: 1000, heldKgCo2: 120.5, duplicateKgCo2: 30, voidedKgCo2: 0 },
  denominator: 'Denominador: viajes calculados, pendientes y bloqueados.',
  basis: 'Cobertura por cantidad de viajes, no por emisiones.',
});

const REFERENCES = ['GHG_PROTOCOL_CORPORATE', 'GHG_PROTOCOL_SCOPE3', 'ISO_14064_1', 'ISO_14083', 'GLEC_FRAMEWORK'];

export const methodologyDto = (): MethodologyDto => ({
  current: {
    declaration: {
      id: 'LGC-CO2-TTW',
      name: 'Metodología LoGyCO₂ de cálculo de CO₂ por combustión',
      version: '1.0.0',
      valid_from: '2026-11-27',
      valid_to: null,
      review_status: 'PENDING_LOGYCA_APPROVAL',
      approval_note: 'Pendiente de aprobación por LOGYCA. Esta versión no debe presentarse como aprobada.',
      reference_standards: REFERENCES.map((code) => ({ code, name: `Norma ${code}`, role: 'Referencia metodológica consultada', alignment: `Qué se tomó de ${code} y qué no.` })),
      conformity_claims: [],
      not_claimed: NOT_CLAIMED,
      emission_scope: { boundary: 'TTW', label: 'Emisiones directas por combustión (TTW), solo CO₂', description: 'Solo el CO₂ de la combustión en el vehículo.', included: ['CO₂ de la combustión'], excluded: ['Emisiones aguas arriba del combustible', 'Metano (CH₄) y óxido nitroso (N₂O)'] },
      gases: [{ gas: 'CO2', included: true, note: 'Único gas calculado.' }, { gas: 'CH4', included: false, note: 'No incluido.' }],
      unit: { code: 'kg_CO2', label: 'kg de CO₂ (no CO₂e)', statement: 'Las cifras están en kilogramos de CO₂, no en CO₂ equivalente.' },
      factor_policy: 'El CO₂ de cada viaje es el volumen por el factor. «Verificado», para un factor, significa que una persona lo comparó con el documento.',
      activity_data_origins: [{ key: 'REAL_CONSUMPTION', label: 'Consumo real', meaning: 'El archivo trae el combustible consumido.' }],
      distance_method: ['La distancia puede venir del archivo o de la ruta entre municipios.'],
      uncertainty: ['Las cifras totales no incluyen un intervalo de incertidumbre.'],
      limitations: ['Todos los datos de actividad son declarados por la empresa.'],
      estimates_warning: 'Parte de las emisiones puede calcularse con consumo estimado y no con consumo real.',
      data_verification_statement: VERIFICATION_TEXT,
      legal_review_note: 'Nota para el responsable: pendiente de revisión jurídica.',
    },
    factors: ['DIESEL_B2', 'GASOLINE_MOTOR', 'NATURAL_GAS', 'OTHER_A', 'OTHER_B'].map((fuel, i) => ({
      fuel_code: fuel, name: `Combustible ${fuel}`, gas: 'CO2', value: i === 4 ? null : '10.180', unit: 'kg_CO2/gal', unit_label: i === 3 ? null : 'kg CO₂/gal', source_name: 'UPME FECOC', source_document: 'Tabla 5, p. 31', source_url: null, reference_year: 2016, verification_status: 'VERIFIED', usable_for_calculation: i !== 4,
    })),
    used_factors: [
      { fuel_code: 'DIESEL_B2', value: '10.180', unit: 'kg_CO2/gal', unit_label: 'kg CO₂/gal', source_name: 'UPME FECOC', source_document: 'Tabla 5, p. 31', reference_year: 2016, trips: 7, kg_co2: '1000.5' },
      { fuel_code: 'DIESEL_B2', value: '10.149', unit: 'kg_CO2/gal', unit_label: 'kg CO₂/gal', source_name: 'UPME calculadora', source_document: null, reference_year: 2024, trips: 3, kg_co2: '200' },
      { fuel_code: 'GASOLINE_MOTOR', value: '8.150', unit: 'kg_CO2/gal', unit_label: null, source_name: 'UPME FECOC', source_document: null, reference_year: null, trips: 1, kg_co2: '10' },
      { fuel_code: 'NATURAL_GAS', value: '1.9', unit: 'kg_CO2/m3', unit_label: 'kg CO₂/m³', source_name: 'UPME FECOC', source_document: null, reference_year: 2016, trips: 2, kg_co2: '5' },
    ],
  },
});

export const methodology = (): Methodology => toMethodology(methodologyDto());
