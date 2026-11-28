import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { FICHA_APPLY_URL, FICHA_PREVIEW_URL, FICHA_TEMPLATE_URL, apiError, appliedDto, fichaApplyDto, fichaPreviewDto, xlsxFile } from '../../../testing/vehicle-efficiency';
import { pagedBody, vehicleDto, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { EfficiencyFichaFacade, FICHA_MAX_BYTES, FICHA_PAGE_SIZE } from './efficiency-ficha.facade';

describe('EfficiencyFichaFacade', () => {
  let facade: EfficiencyFichaFacade;
  let http: HttpTestingController;

  function setup(roles: string[] = ['ORG_ADMIN']): void {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(EfficiencyFichaFacade);
    http = TestBed.inject(HttpTestingController);
  }

  const preview = (body = fichaPreviewDto()): void => {
    facade.show();
    facade.choose(xlsxFile('ficha.xlsx'));
    http.expectOne(FICHA_PREVIEW_URL).flush({ data: body });
  };
  const applyCall = () => http.expectOne(FICHA_APPLY_URL);
  const reloadsList = (): void => {
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([vehicleDto()]));
  };

  afterEach(() => http.verify());

  it('vista previa: sube el archivo elegido, pasa a la revisión y no guarda nada (no pide la lista ni aplica)', () => {
    setup();
    facade.show();
    facade.choose(xlsxFile('ficha.xlsx'));

    expect(facade.busy()).toBe('preview');
    http.expectOne(FICHA_PREVIEW_URL).flush({ data: fichaPreviewDto() });

    expect(facade.busy()).toBeNull();
    expect(facade.step()).toBe('review');
    expect(facade.preview()?.counts.valid).toBe(9);
    expect(facade.canApply()).toBeTrue();
  });

  it('solo acepta .xlsx, no vacío y dentro del tope: lo demás se avisa sin llamar al servidor', () => {
    setup();
    facade.show();

    facade.choose(xlsxFile('datos.csv'));
    expect(facade.problem()).toContain('.xlsx');
    facade.choose(xlsxFile('vacio.xlsx', 0));
    expect(facade.problem()).toContain('vacío');
    const big = xlsxFile('grande.xlsx');

    Object.defineProperty(big, 'size', { value: FICHA_MAX_BYTES + 1 });
    facade.choose(big);
    expect(facade.problem()).toContain('10 MB');
    facade.choose(undefined);
    http.expectNone(FICHA_PREVIEW_URL);
    expect(facade.step()).toBe('file');
  });

  it('sin permiso de administrar no se abre ni se sube', () => {
    setup(['ORG_ANALYST']);
    facade.show();
    facade.choose(xlsxFile());

    expect(facade.open()).toBeFalse();
    http.expectNone(FICHA_PREVIEW_URL);
  });

  it('aplicar: envía el MISMO archivo con el token, muestra el resultado y refresca el inventario', () => {
    setup();
    preview();
    facade.apply();
    const req = applyCall();
    const body = req.request.body as FormData;

    expect((body.get('file') as File).name).toBe('ficha.xlsx');
    expect(body.get('token')).toBe('tok-secreto');
    req.flush({ data: fichaApplyDto({ applied_to_pending: appliedDto({ trips_recalculated: 300, stale_calculated_trips: 4 }) }) });
    reloadsList();

    expect(facade.step()).toBe('result');
    expect(facade.outcome()).toEqual(jasmine.objectContaining({ recordsCreated: 8, recordsReplaced: 2, unchanged: 1, recalculated: 300 }));
    expect(facade.outcome()?.applied.staleCalculatedTrips).toBe(4);
  });

  it('continuar repite la misma aplicación (mismo archivo y token) y acumula lo recalculado hasta que no quede nada', () => {
    setup();
    preview();
    facade.apply();
    applyCall().flush({ data: fichaApplyDto({ applied_to_pending: appliedDto({ trips_recalculated: 20000, remaining: 3000 }) }) });
    reloadsList();

    facade.continue();
    const again = applyCall();

    expect((again.request.body as FormData).get('token')).toBe('tok-secreto');
    again.flush({ data: fichaApplyDto({ records_created: 0, records_replaced: 0, unchanged: 11, applied_to_pending: appliedDto({ trips_recalculated: 3000, remaining: 0 }) }) });
    reloadsList();

    expect(facade.outcome()).toEqual(jasmine.objectContaining({ recalculated: 23000, recordsCreated: 8, unchanged: 1 }));
    expect(facade.outcome()?.applied.remaining).toBe(0);
  });

  it('«Continuar» sin avance (0 recalculados y el mismo remaining) se marca como estancado', () => {
    setup();
    preview();
    facade.apply();
    applyCall().flush({ data: fichaApplyDto({ applied_to_pending: appliedDto({ trips_recalculated: 5, remaining: 90 }) }) });
    reloadsList();
    facade.continue();
    applyCall().flush({ data: fichaApplyDto({ applied_to_pending: appliedDto({ trips_recalculated: 0, remaining: 90 }) }) });
    reloadsList();

    expect(facade.outcome()?.stalled).toBeTrue();
  });

  it('volver a aplicar el mismo archivo no crea nada: lo dice el servidor con ceros', () => {
    setup();
    preview(fichaPreviewDto({ counts: { rows: 5, valid: 5, with_issues: 0, unchanged: 5, to_create: 0, to_replace: 0, pending_trips: 12 } }));
    facade.apply();
    applyCall().flush({ data: fichaApplyDto({ records_created: 0, records_replaced: 0, unchanged: 5 }) });
    reloadsList();

    expect(facade.outcome()).toEqual(jasmine.objectContaining({ recordsCreated: 0, recordsReplaced: 0, unchanged: 5 }));
  });

  it('no se aplica si no hay nada válido que declarar ni recalcular', () => {
    setup();
    preview(fichaPreviewDto({ counts: { rows: 3, valid: 0, with_issues: 3, unchanged: 0, to_create: 0, to_replace: 0, pending_trips: 0 } }));

    expect(facade.canApply()).toBeFalse();
    facade.apply();
    http.expectNone(FICHA_APPLY_URL);
  });

  it('FICHA_TOKEN_EXPIRED y FICHA_PREVIEW_STALE: descartan el token y piden revisar de nuevo con el mismo archivo, sin elegirlo otra vez', () => {
    for (const code of ['FICHA_TOKEN_EXPIRED', 'FICHA_PREVIEW_STALE', 'FICHA_TOKEN_INVALID']) {
      TestBed.resetTestingModule();
      setup();
      preview();
      facade.apply();
      applyCall().flush(apiError(code), { status: code === 'FICHA_TOKEN_INVALID' ? 422 : 409, statusText: 'x' });

      expect(facade.stale()).toBeTrue();
      expect(facade.error()?.code).toBe(code);
      expect(facade.canApply()).toBeFalse();

      facade.reviewAgain();
      const req = http.expectOne(FICHA_PREVIEW_URL);

      expect(((req.request.body as FormData).get('file') as File).name).toBe('ficha.xlsx');
      req.flush({ data: fichaPreviewDto({ token: 'tok-nuevo' }) });

      expect(facade.stale()).toBeFalse();
      expect(facade.error()).toBeNull();
      facade.apply();
      const second = applyCall();

      expect((second.request.body as FormData).get('token')).toBe('tok-nuevo');
      second.flush({ data: fichaApplyDto() });
      reloadsList();
      http.verify();
    }
  });

  it('COMPANY_BUSY al aplicar: conserva el archivo y el token y «Reintentar» repite lo mismo', () => {
    setup();
    preview();
    facade.apply();
    applyCall().flush(apiError('COMPANY_BUSY'), { status: 409, statusText: 'x' });

    expect(facade.error()?.code).toBe('COMPANY_BUSY');
    expect(facade.step()).toBe('review');
    expect(facade.canApply()).toBeTrue();

    facade.retry();
    applyCall().flush({ data: fichaApplyDto() });
    reloadsList();

    expect(facade.step()).toBe('result');
  });

  it('errores de la vista previa (archivo ilegible, demasiado grande, demasiadas filas) dejan el paso del archivo con el error', () => {
    for (const [code, status] of [['INVALID_FILE', 422], ['FILE_TOO_LARGE', 413], ['UNSUPPORTED_FILE', 415], ['FICHA_TOO_LARGE', 422]] as const) {
      TestBed.resetTestingModule();
      setup();
      facade.show();
      facade.choose(xlsxFile());
      http.expectOne(FICHA_PREVIEW_URL).flush(apiError(code), { status, statusText: 'x' });

      expect(facade.step()).toBe('file');
      expect(facade.error()?.code).toBe(code);
      expect(facade.busy()).toBeNull();
      http.verify();
    }
  });

  it('los problemas se pagan de a 6 y no se pasa del final', () => {
    setup();
    const issues = Array.from({ length: 50 }, (_, n) => ({ row: n + 4, plate: `AAA${n}`, field: 'unit', message: 'Unidad incompatible' }));

    preview(fichaPreviewDto({ issues, issues_truncated: true }));

    expect(facade.pageIssues().length).toBe(FICHA_PAGE_SIZE);
    expect(facade.issuePages()).toBe(9);
    facade.setIssuesPage(8);
    expect(facade.pageIssues().length).toBe(2);
    facade.setIssuesPage(9);
    expect(facade.issuesPage()).toBe(8);
    facade.setIssuesPage(-1);
    expect(facade.issuesPage()).toBe(8);
  });

  it('descargar la plantilla guarda el archivo con la sesión y un error llega con su mensaje', () => {
    setup();
    const click = spyOn(HTMLAnchorElement.prototype, 'click');

    facade.downloadTemplate();
    expect(facade.downloading()).toBeTrue();
    http.expectOne(FICHA_TEMPLATE_URL).flush(new Blob(['x']), { headers: { 'Content-Disposition': 'attachment; filename="ficha.xlsx"' } });

    expect(facade.downloading()).toBeFalse();
    expect(click).toHaveBeenCalledTimes(1);

    facade.downloadTemplate();
    http.expectOne(FICHA_TEMPLATE_URL).flush(new Blob([JSON.stringify(apiError('SERVICE_UNAVAILABLE'))]), { status: 503, statusText: 'x' });
  });

  it('cerrar o cambiar de empresa descarta archivo, token y revisión: no se puede aplicar después', () => {
    setup();
    preview();
    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.open()).toBeFalse();
    expect(facade.preview()).toBeNull();
    facade.apply();
    http.expectNone(FICHA_APPLY_URL);
  });
});
