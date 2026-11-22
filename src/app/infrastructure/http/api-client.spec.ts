import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTestApp } from '../../../testing/providers';
import { ApiClient, fileNameOf } from './api-client';

describe('ApiClient', () => {
  let api: ApiClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    api = TestBed.inject(ApiClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('post sin cabeceras propias envía el cuerpo JSON y entrega `data`', () => {
    let result: unknown;
    api.post<{ ok: boolean }>('/algo', { a: 1 }).subscribe((r) => (result = r));

    const req = http.expectOne('http://api.test/api/v1/algo');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ a: 1 });
    expect(req.request.headers.has('Idempotency-Key')).toBeFalse();
    req.flush({ data: { ok: true } });

    expect(result).toEqual({ ok: true });
  });

  it('post con cabeceras propias las envía y admite FormData sin fijar el Content-Type', () => {
    const body = new FormData();
    body.append('file', new File(['x'], 'a.xlsx'));
    api.post<unknown>('/subida', body, { 'Idempotency-Key': 'k-1' }).subscribe();

    const req = http.expectOne('http://api.test/api/v1/subida');
    expect(req.request.headers.get('Idempotency-Key')).toBe('k-1');
    expect(req.request.body instanceof FormData).toBeTrue();
    expect(req.request.headers.has('Content-Type')).toBeFalse();
    req.flush({ data: {} });
  });

  it('getFile entrega el archivo y el nombre de Content-Disposition', () => {
    let name: string | null = '';
    let size = 0;
    api.getFile('/archivo').subscribe((f) => {
      name = f.fileName;
      size = f.blob.size;
    });

    const req = http.expectOne('http://api.test/api/v1/archivo');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['abc']), { headers: { 'Content-Disposition': 'attachment; filename="plantilla.xlsx"' } });

    expect(name).toBe('plantilla.xlsx');
    expect(size).toBe(3);
  });

  it('getFile: el cuerpo JSON de un error (que llega como Blob) se lee para conservar el código estable', async () => {
    let failure: HttpErrorResponse | undefined;
    api.getFile('/archivo').subscribe({ error: (e: HttpErrorResponse) => (failure = e) });

    http.expectOne('http://api.test/api/v1/archivo').flush(new Blob([JSON.stringify({ error: { code: 'ORGANIZATION_ACCESS_DENIED' } })]), { status: 403, statusText: 'Forbidden' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(failure!.status).toBe(403);
    expect(failure!.error).toEqual({ error: { code: 'ORGANIZATION_ACCESS_DENIED' } });
  });

  it('getFile: un error cuyo cuerpo no es JSON conserva el estado y el cuerpo nulo', async () => {
    let failure: HttpErrorResponse | undefined;
    api.getFile('/archivo').subscribe({ error: (e: HttpErrorResponse) => (failure = e) });

    http.expectOne('http://api.test/api/v1/archivo').flush(new Blob(['no es json']), { status: 500, statusText: 'x' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(failure!.status).toBe(500);
    expect(failure!.error).toBeNull();
  });

  it('getFile sin Content-Disposition entrega nombre nulo', () => {
    let name: string | null = 'x';
    api.getFile('/archivo').subscribe((f) => (name = f.fileName));

    http.expectOne('http://api.test/api/v1/archivo').flush(new Blob(['abc']));

    expect(name).toBeNull();
  });
});

describe('fileNameOf', () => {
  it('lee filename, filename sin comillas y filename* codificado', () => {
    expect(fileNameOf('attachment; filename="plantilla_cargas_logyco2.xlsx"')).toBe('plantilla_cargas_logyco2.xlsx');
    expect(fileNameOf('attachment; filename=reporte.xlsx')).toBe('reporte.xlsx');
    expect(fileNameOf("attachment; filename*=UTF-8''plantilla%20gu%C3%ADa.xlsx")).toBe('plantilla guía.xlsx');
  });

  it('sin nombre utilizable devuelve null', () => {
    expect(fileNameOf(null)).toBeNull();
    expect(fileNameOf('attachment')).toBeNull();
    expect(fileNameOf("attachment; filename*=UTF-8''%E0%A4%A")).toBeNull();
  });
});
