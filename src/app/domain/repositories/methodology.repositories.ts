import { Observable } from 'rxjs';
import { Methodology } from '../models/methodology';

/** Puerto de la declaración metodológica vigente de la empresa (solo lectura, `indicators:read`). */
export abstract class MethodologyRepository {
  abstract methodology(organizationId: string): Observable<Methodology>;
}
