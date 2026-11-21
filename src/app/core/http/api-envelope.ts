/**
 * Sobres de respuesta del backend FastAPI (`src/core/responses/schemas.py` y
 * `src/core/errors/schemas.py`).
 */
export interface ResponseMetaDto {
  readonly request_id?: string | null;
}

export interface PaginationMetaDto {
  readonly page: number;
  readonly page_size: number;
  readonly total: number;
  readonly total_pages: number;
  readonly has_next: boolean;
  readonly has_previous: boolean;
}

export interface ApiResponseDto<T> {
  readonly data: T;
  readonly meta: ResponseMetaDto;
}

export interface PaginatedResponseDto<T> {
  readonly data: readonly T[];
  readonly meta: ResponseMetaDto & { readonly pagination: PaginationMetaDto };
}

export interface ErrorDetailDto {
  readonly field?: string | null;
  readonly message?: string;
  readonly type?: string | null;
}

export interface ErrorResponseDto {
  readonly error: {
    readonly code: string;
    readonly message?: string;
    readonly details?: readonly ErrorDetailDto[] | null;
    readonly request_id?: string | null;
  };
}
