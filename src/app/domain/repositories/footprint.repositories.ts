import { Observable } from 'rxjs';
import { Footprint } from '../models/footprint';
import { PeriodRange } from '../models/period';

/** Puerto de la huella de CO₂ de la empresa (solo lectura): totales, por mes y por combustible de un periodo. */
export abstract class FootprintRepository {
  /** Sin `period` se calcula sobre todas las cargas; con `period`, `from` y `to` viajan juntos. */
  abstract footprint(organizationId: string, period?: PeriodRange): Observable<Footprint>;
}
