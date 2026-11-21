import { EMPTY, Observable, expand, reduce } from 'rxjs';
import { Page, PageRequest } from '../../domain/models/pagination';

export interface AllPages<T> {
  readonly items: readonly T[];
  /** Total informado por el backend en la última página leída. */
  readonly total: number;
  /** `true` si se alcanzó el tope de páginas y existen más registros sin cargar. */
  readonly truncated: boolean;
}

/**
 * Lee todas las páginas de un listado (hasta `maxPages`). Se usa en la consola de
 * plataforma porque los endpoints actuales solo paginan: la búsqueda y los
 * filtros se aplican en el cliente sobre lo cargado y la interfaz lo indica.
 */
export function fetchAllPages<T>(
  load: (request: PageRequest) => Observable<Page<T>>,
  maxPages = 20,
  pageSize = 100,
): Observable<AllPages<T>> {
  return load({ page: 1, pageSize }).pipe(
    expand((page) => (page.hasNext && page.page < maxPages ? load({ page: page.page + 1, pageSize }) : EMPTY)),
    reduce<Page<T>, AllPages<T>>(
      (acc, page) => ({ items: [...acc.items, ...page.items], total: page.total, truncated: page.hasNext }),
      { items: [], total: 0, truncated: false },
    ),
  );
}
