import { Injectable, computed, inject, signal } from '@angular/core';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { ScopedResource } from '../../core/org/scoped-resource';
import { EmissionFactor, Simulation, SimulationInput, VehicleCatalog } from '../../domain/models/emissions';
import { EmissionsRepository } from '../../domain/repositories/emissions.repositories';

/**
 * Guía de cálculo de emisiones. Todo lo que se muestra lo entrega el servidor (catálogo de vehículos, factores por combustible y resultado
 * de la simulación); el cliente no calcula emisiones ni guarda simulaciones.
 */
@Injectable({ providedIn: 'root' })
export class EmissionsFacade {
  private readonly repository = inject(EmissionsRepository);
  private readonly registry = inject(ContextResetRegistry);

  readonly vehicles = this.registry.track(new ScopedResource<VehicleCatalog>());
  readonly fuels = this.registry.track(new ScopedResource<readonly EmissionFactor[]>());
  readonly simulation = this.registry.track(new ScopedResource<Simulation>());

  /** Combustible que muestra la tarjeta del factor (y usa el ejemplo de la fórmula 3); sin elección, el primero que informa el servidor. */
  readonly fuelCode = signal<string | null>(null);
  readonly factor = computed<EmissionFactor | null>(() => {
    const fuels = this.fuels.data() ?? [];

    return fuels.find((f) => f.fuelCode === this.fuelCode()) ?? fuels[0] ?? null;
  });

  loadVehicles(): void {
    this.vehicles.load(this.repository.vehicles(), { keepData: true });
  }

  loadFuels(): void {
    this.fuels.load(this.repository.fuels(), { keepData: true });
  }

  simulate(input: SimulationInput): void {
    this.simulation.load(this.repository.simulate(input));
  }
}
