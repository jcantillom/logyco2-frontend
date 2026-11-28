import { catalogDto, factorDto, NATURAL_GAS, simulationDto, vehicleDto } from '../../features/emissions/emissions.fixtures';
import { simulationBody, toEmissionFactor, toFreightVehicle, toSimulation, toVehicleCatalog } from './emissions.mappers';

describe('mapeadores de la guía de emisiones', () => {
  it('un vehículo conserva ejes, familia, PBV y variantes del contrato', () => {
    const vehicle = toFreightVehicle(vehicleDto({ code: 'C4', truck_axles: 4, total_axles: 4, gross_weight_kg: null, pbv_variants: [{ gross_weight_kg: 31000, tolerance_kg: 500, note: 'A' }] }));

    expect(vehicle).toEqual(jasmine.objectContaining({ code: 'C4', truckAxles: 4, trailerAxles: 0, trailerKind: null, totalAxles: 4, grossWeightKg: null, verified: true, maxLengthM: 12.2, featured: false }));
    expect(vehicle.pbvVariants).toEqual([{ grossWeightKg: 31000, toleranceKg: 500, note: 'A' }]);
  });

  it('el catálogo trae la norma, las dimensiones generales y la tolerancia', () => {
    const catalog = toVehicleCatalog(catalogDto([vehicleDto()]));

    expect(catalog.regulation).toEqual({ name: 'Resolución de pesos y dimensiones', number: '20223040045295', entity: 'MinTransporte', url: 'https://example.test/norma', inForce: true, checkedOn: '2026-11-20' });
    expect(catalog.generalDimensions).toEqual({ maxWidthM: 2.6, maxHeightM: 4.4, citation: 'Art. 5' });
    expect(catalog.tolerance.description).toContain('Tolerancia');
    expect(catalog.items.length).toBe(1);
  });

  it('el factor deja el valor como texto decimal y mapea el estado', () => {
    expect(toEmissionFactor(factorDto())).toEqual({
      fuelCode: 'DIESEL_B2', name: 'Diésel B2', value: '10.1000', unit: 'kg_CO2/gal', unitLabel: null, volumeUnit: 'gal', efficiencyUnit: 'km/gal', gas: 'CO2', sourceName: 'Fuente de prueba', sourceDocument: 'Documento de prueba',
      sourceUrl: 'https://example.test/fuente', referenceYear: 2023, status: 'VERIFIED', usableForCalculation: true,
    });
    expect(toEmissionFactor(factorDto({ value: null, verification_status: 'NOT_CONFIGURED', usable_for_calculation: false })).value).toBeNull();
  });

  it('la etiqueta de unidad del servidor se conserva y, si falta, queda `null`', () => {
    expect(toEmissionFactor(factorDto({ unit_label: 'kg CO₂/gal' })).unitLabel).toBe('kg CO₂/gal');
    expect(toEmissionFactor(factorDto()).unitLabel).toBeNull();
  });

  it('el gas natural conserva sus unidades de volumen y rendimiento', () => {
    const gas = toEmissionFactor(NATURAL_GAS());

    expect(gas).toEqual(jasmine.objectContaining({ fuelCode: 'NATURAL_GAS', unit: 'kg_CO2/m3', volumeUnit: 'm3', efficiencyUnit: 'km/m3', value: '1.9000' }));
  });

  it('la simulación conserva los decimales en texto, el volumen con su unidad y el CO₂ nulo', () => {
    const result = toSimulation(simulationDto({ co2_kg: null, official: false, message: 'Factor pendiente de validación' }));

    expect(result).toEqual(jasmine.objectContaining({ fuelCode: 'DIESEL_B2', volume: '30.0000', volumeUnit: 'gal', co2Kg: null, official: false, message: 'Factor pendiente de validación' }));
    expect(toSimulation(simulationDto({ fuel_code: 'NATURAL_GAS', volume: '12.5', volume_unit: 'm3' })).volumeUnit).toBe('m3');
    expect(result.factor.status).toBe('VERIFIED');
  });

  it('featured y el número de la resolución son opcionales: si faltan, false y null', () => {
    const dto = catalogDto([vehicleDto({ featured: true }), vehicleDto()]);
    delete (dto.regulation as { number?: string | null }).number;
    const catalog = toVehicleCatalog(dto);

    expect(catalog.items.map((v) => v.featured)).toEqual([true, false]);
    expect(catalog.regulation.number).toBeNull();
  });

  it('los grupos de ejes, el nombre corto, las disposiciones y la guía del código llegan al modelo', () => {
    const catalog = toVehicleCatalog(catalogDto());
    const c3 = catalog.items.find((v) => v.code === 'C3')!;

    expect(c3.shortName).toBe('Camión rígido');
    expect(c3.truckAxleGroups).toEqual([1, 2]);
    expect(c3.layouts).toEqual([{ id: 'tandem_steering', label: 'Tándem direccional', truckAxleGroups: [2, 1], note: 'Dos ejes delanteros direccionales.' }]);
    expect(catalog.items.find((v) => v.code === 'C3S3')!.trailerAxleGroups).toEqual([3]);
    expect(catalog.codeGuide!.letters[0]).toEqual({ symbol: 'C', meaning: 'Camión' });
    expect(catalog.codeGuide!.digitRule).toContain('número');
  });

  it('sin grupos, sin nombre corto, sin disposiciones y sin guía se usan los respaldos', () => {
    const dto = catalogDto([vehicleDto({ code: 'C3S3', name: 'Tractocamión largo', short_name: undefined, truck_axles: 3, trailer_axles: 3, truck_axle_groups: undefined, trailer_axle_groups: undefined, layouts: undefined, trailer_kind: 'S', family: 'TRACTOR', total_axles: 6 })]);
    delete dto.code_guide;
    const catalog = toVehicleCatalog(dto);
    const v = catalog.items[0];

    expect(v.shortName).toBe('Tractocamión largo');
    expect(v.truckAxleGroups).toEqual([3]);
    expect(v.trailerAxleGroups).toEqual([3]);
    expect(v.layouts).toEqual([]);
    expect(catalog.codeGuide).toBeNull();
  });

  it('el cuerpo de la simulación usa los nombres del contrato', () => {
    expect(simulationBody({ fuelCode: 'NATURAL_GAS', distanceKm: 300, efficiency: 10 })).toEqual({ fuel_code: 'NATURAL_GAS', distance_km: 300, efficiency: 10 });
  });
});
