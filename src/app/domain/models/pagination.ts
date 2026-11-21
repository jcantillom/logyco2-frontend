export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

export const DEFAULT_PAGE_REQUEST: PageRequest = { page: 1, pageSize: 20 };

export function emptyPage<T>(request: PageRequest = DEFAULT_PAGE_REQUEST): Page<T> {
  return {
    items: [],
    page: request.page,
    pageSize: request.pageSize,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false,
  };
}
