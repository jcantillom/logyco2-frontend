import { Observable } from 'rxjs';
import { EmissionFactor, Simulation, SimulationInput, VehicleCatalog } from '../models/emissions';

/** Puerto de la guía de cálculo de emisiones (`/emissions`): solo lectura y simulación, nada se guarda. */
export abstract class EmissionsRepository {
  abstract vehicles(): Observable<VehicleCatalog>;
  /** Factores de los combustibles disponibles, en el orden que define el servidor. */
  abstract fuels(): Observable<readonly EmissionFactor[]>;
  abstract simulate(input: SimulationInput): Observable<Simulation>;
}
