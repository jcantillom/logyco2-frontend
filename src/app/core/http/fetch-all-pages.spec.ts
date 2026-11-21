import { Observable, of } from 'rxjs';
import { Page, PageRequest } from '../../domain/models/pagination';
import { fetchAllPages } from './fetch-all-pages';

function pageOf(items: number[], page: number, totalPages: number, total: number): Page<number> {
  return { items, page, pageSize: 2, total, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 };
}

describe('fetchAllPages', () => {
  const source = (pages: Page<number>[]) => (request: PageRequest): Observable<Page<number>> => of(pages[request.page - 1]);

  it('concatena todas las páginas en orden', async () => {
    let result: { items: readonly number[]; total: number; truncated: boolean } | undefined;
    fetchAllPages<number>(source([pageOf([1, 2], 1, 3, 5), pageOf([3, 4], 2, 3, 5), pageOf([5], 3, 3, 5)])).subscribe((r) => (result = r));
    expect(result).toEqual({ items: [1, 2, 3, 4, 5], total: 5, truncated: false });
  });

  it('una sola página no pide más', () => {
    const spy = jasmine.createSpy<(r: PageRequest) => Observable<Page<number>>>('load').and.callFake(source([pageOf([1], 1, 1, 1)]));
    fetchAllPages(spy).subscribe();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('respeta el tope de páginas y avisa que quedan registros sin cargar', () => {
    let result: { items: readonly number[]; total: number; truncated: boolean } | undefined;
    const spy = jasmine.createSpy<(r: PageRequest) => Observable<Page<number>>>('load').and.callFake(source([pageOf([1, 2], 1, 9, 18), pageOf([3, 4], 2, 9, 18), pageOf([5, 6], 3, 9, 18)]));
    fetchAllPages(spy, 2).subscribe((r) => (result = r));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result?.items).toEqual([1, 2, 3, 4]);
    expect(result?.truncated).toBeTrue();
    expect(result?.total).toBe(18);
  });
});
