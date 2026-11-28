import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { FICHA_APPLY_URL, FICHA_PREVIEW_URL, FICHA_TEMPLATE_URL, protectedRowDto, apiError, appliedDto, fichaApplyDto, fichaPreviewDto, xlsxFile } from '../../../testing/vehicle-efficiency';
import { pagedBody, vehicleDto, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { FichaPreviewDto } from '../../infrastructure/dto/vehicle-efficiency.dto';
import { EfficiencyFichaDialogComponent } from './efficiency-ficha-dialog.component';
import { EfficiencyFichaFacade } from './efficiency-ficha.facade';

const componentCss = (marker: string): string =>
  Array.from(document.querySelectorAll('style'))
    .map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' '))
    .filter((c) => c.includes(marker))
    .join('\n');

describe('EfficiencyFichaDialogComponent', () => {
  let fixture: ComponentFixture<EfficiencyFichaDialogComponent>;
  let http: HttpTestingController;
  let facade: EfficiencyFichaFacade;
  let closed: number;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>(selector));
  const testId = <T extends HTMLElement = HTMLElement>(id: string): T | null => q<T>(`[data-testid="${id}"]`);
  const text = (id: string): string => (testId(id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const settle = (): void => fixture.detectChanges();

  function render(roles: string[] = ['ORG_ADMIN']): void {
    TestBed.configureTestingModule({ imports: [EfficiencyFichaDialogComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(EfficiencyFichaFacade);
    closed = 0;
    facade.show();
    fixture = TestBed.createComponent(EfficiencyFichaDialogComponent);
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
  }

  /** Elige el archivo con el campo real de la zona (como lo haría una persona) y responde la vista previa. */
  function pick(file: File = xlsxFile(), body: FichaPreviewDto = fichaPreviewDto()): void {
    const input = testId<HTMLInputElement>('ficha-input')!;
    const transfer = new DataTransfer();

    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    settle();
    http.expectOne(FICHA_PREVIEW_URL).flush({ data: body });
    settle();
  }
  const apply = (): void => {
    testId('ficha-apply')!.click();
    settle();
  };
  const refreshList = (): void => {
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([vehicleDto()]));
    settle();
  };

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('abre como diálogo modal con la plantilla, la zona para soltar el .xlsx y «Cerrar»', () => {
    render();
    const dialog = q<HTMLDialogElement>('dialog')!;

    expect(dialog.open).toBeTrue();
    expect(dialog.getAttribute('aria-labelledby')).toBe('ficha-title');
    expect(text('ficha-template')).toBe('Descargar plantilla');
    expect(testId<HTMLInputElement>('ficha-input')!.accept).toContain('.xlsx');
    expect(testId<HTMLInputElement>('ficha-input')!.multiple).toBeFalse();
    expect(q('label.drop')!.contains(testId('ficha-input'))).toBeTrue();
    expect(text('ficha-close')).toBe('Cerrar');
  });

  it('descargar la plantilla pide el archivo con la sesión', () => {
    render();
    spyOn(HTMLAnchorElement.prototype, 'click');
    testId('ficha-template')!.click();
    settle();

    expect(testId<HTMLButtonElement>('ficha-template')!.disabled).toBeTrue();
    http.expectOne(FICHA_TEMPLATE_URL).flush(new Blob(['x']));
    settle();
    expect(text('ficha-template')).toBe('Descargar plantilla');
  });

  it('muestra un progreso mientras sube y revisa el archivo', () => {
    render();
    const input = testId<HTMLInputElement>('ficha-input')!;
    const transfer = new DataTransfer();

    transfer.items.add(xlsxFile('mi-ficha.xlsx'));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    settle();

    expect(q('[role="status"][data-testid="ficha-busy"]')).not.toBeNull();
    expect(text('ficha-busy')).toContain('mi-ficha.xlsx');
    expect(testId<HTMLInputElement>('ficha-input')!.disabled).toBeTrue();
    http.expectOne(FICHA_PREVIEW_URL).flush({ data: fichaPreviewDto() });
  });

  it('un archivo que no es .xlsx se avisa sin llamar al servidor, también al soltarlo', () => {
    render();
    const drop = new DragEvent('drop', { dataTransfer: new DataTransfer(), cancelable: true });

    drop.dataTransfer!.items.add(xlsxFile('datos.csv'));
    testId('ficha-drop')!.dispatchEvent(drop);
    settle();

    expect(drop.defaultPrevented).toBeTrue();
    expect(q('[role="alert"][data-testid="ficha-problem"]')!.textContent).toContain('.xlsx');
    http.expectNone(FICHA_PREVIEW_URL);
  });

  it('soltar un .xlsx lo sube', () => {
    render();
    const drop = new DragEvent('drop', { dataTransfer: new DataTransfer(), cancelable: true });

    drop.dataTransfer!.items.add(xlsxFile('soltado.xlsx'));
    testId('ficha-drop')!.dispatchEvent(drop);
    settle();

    expect((http.expectOne(FICHA_PREVIEW_URL).request.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('la revisión muestra solo los números del servidor, los problemas de a 6 y lo que se hará al aplicar', () => {
    render();
    const issues = Array.from({ length: 50 }, (_, n) => ({ row: n + 4, plate: `AAA${100 + n}`, field: 'unit', message: 'Unidad incompatible con el combustible' }));

    pick(xlsxFile(), fichaPreviewDto({ issues, issues_truncated: true }));

    expect(qa('[data-testid="ficha-counts"] div').map((d) => (d.textContent ?? '').replace(/\s+/g, ' ').trim())).toEqual(['Filas12', 'Válidas9', 'Con problemas3', 'Sin cambios1', 'Por declarar8', 'Reemplazan2']);
    expect(text('ficha-plan')).toBe('Se declarará el rendimiento de 8 vehículos. Hasta 340 viajes pendientes se recalcularán.');
    expect(qa('[data-testid="ficha-issues"] li').length).toBe(6);
    expect(text('ficha-issues')).toContain('Fila 4');
    expect(text('ficha-issues')).toContain('Unidad');
    expect(q('#ficha-issues-title')!.textContent).toContain('los primeros 50');

    testId('ficha-next')!.click();
    settle();
    expect(qa('[data-testid="ficha-issues"] li')[0].textContent).toContain('Fila 10');
    expect(q('nav.pg [role="status"]')!.textContent).toContain('Página 2 de 9');
    expect(testId<HTMLButtonElement>('ficha-prev')!.disabled).toBeFalse();
  });

  it('una ficha sin problemas no muestra la lista', () => {
    render();
    pick(xlsxFile(), fichaPreviewDto({ issues: [], counts: { rows: 2, valid: 2, with_issues: 0, unchanged: 0, to_create: 2, to_replace: 0, pending_trips: 0 } }));

    expect(testId('ficha-issues')).toBeNull();
    expect(text('ficha-plan')).toContain('Se declarará el rendimiento de 2 vehículos. Hasta 0 viajes');
  });

  it('el token no se muestra en pantalla y «Aplicar» envía el mismo archivo con el token, con progreso', () => {
    render();
    pick(xlsxFile('ficha.xlsx'));

    expect(el().textContent).not.toContain('tok-secreto');
    apply();
    expect(text('ficha-applying')).toContain('Aplicando');
    expect(testId<HTMLButtonElement>('ficha-apply')!.disabled).toBeTrue();
    const req = http.expectOne(FICHA_APPLY_URL);

    expect((req.request.body as FormData).get('token')).toBe('tok-secreto');
    req.flush({ data: fichaApplyDto({ applied_to_pending: appliedDto({ trips_recalculated: 300, still_pending: 4, stale_calculated_trips: 5 }) }) });
    refreshList();

    expect(q('[role="status"][data-testid="ficha-result"]')).not.toBeNull();
    expect(text('ficha-result')).toContain('Ficha aplicada.');
    expect(text('ficha-result')).toContain('8 registros nuevos, 2 reemplazados y 1 fila sin cambios.');
    expect(text('ficha-applied')).toBe('300 viajes pendientes ahora calculados; 4 siguen pendientes.');
    expect(text('ficha-stale-trips')).toBe('5 viajes ya calculados usaron un rendimiento anterior; no se recalculan solos.');
    expect(text('ficha-close')).toBe('Cerrar');
  });

  it('con viajes por examinar ofrece «Continuar» hasta que no quede ninguno', () => {
    render();
    pick();
    apply();
    http.expectOne(FICHA_APPLY_URL).flush({ data: fichaApplyDto({ applied_to_pending: appliedDto({ trips_recalculated: 20000, remaining: 100 }) }) });
    refreshList();

    expect(text('ficha-remaining')).toContain('Hasta 100 viajes por revisar');
    testId('ficha-continue')!.click();
    settle();
    http.expectOne(FICHA_APPLY_URL).flush({ data: fichaApplyDto({ records_created: 0, records_replaced: 0, unchanged: 11, applied_to_pending: appliedDto({ trips_recalculated: 100, remaining: 0, still_pending: 0 }) }) });
    refreshList();

    expect(testId('ficha-continue')).toBeNull();
    expect(text('ficha-applied')).toBe('20.100 viajes pendientes ahora calculados.');
  });

  it('si «Continuar» no avanza, deja de ofrecerlo y lo explica', () => {
    render();
    pick();
    apply();
    http.expectOne(FICHA_APPLY_URL).flush({ data: fichaApplyDto({ applied_to_pending: appliedDto({ trips_recalculated: 5, remaining: 40 }) }) });
    refreshList();
    testId('ficha-continue')!.click();
    settle();
    http.expectOne(FICHA_APPLY_URL).flush({ data: fichaApplyDto({ applied_to_pending: appliedDto({ trips_recalculated: 0, remaining: 40 }) }) });
    refreshList();

    expect(testId('ficha-continue')).toBeNull();
    expect(text('ficha-stalled')).toContain('ya no avanza');
  });

  it('aplicar otra vez el mismo archivo lo dice: no se creó ningún registro', () => {
    render();
    pick(xlsxFile(), fichaPreviewDto({ counts: { rows: 5, valid: 5, with_issues: 0, unchanged: 5, to_create: 0, to_replace: 0, pending_trips: 0 }, issues: [] }));

    expect(text('ficha-plan')).toContain('no hay nada nuevo que aplicar');
    expect(testId<HTMLButtonElement>('ficha-apply')!.disabled).toBeTrue();
  });

  it('una revisión vencida o desactualizada se explica y se vuelve a revisar con el mismo archivo', () => {
    render();
    pick();
    apply();
    http.expectOne(FICHA_APPLY_URL).flush(apiError('FICHA_TOKEN_EXPIRED'), { status: 409, statusText: 'x' });
    settle();

    expect(q('[role="alert"][data-testid="ficha-stale"]')).not.toBeNull();
    expect(text('ficha-error')).toContain('La vista previa venció');
    expect(testId<HTMLButtonElement>('ficha-apply')!.disabled).toBeTrue();

    testId('ficha-review-again')!.click();
    settle();
    http.expectOne(FICHA_PREVIEW_URL).flush({ data: fichaPreviewDto({ token: 'tok-nuevo' }) });
    settle();

    expect(testId('ficha-stale')).toBeNull();
    expect(testId('ficha-error')).toBeNull();
    expect(testId<HTMLButtonElement>('ficha-apply')!.disabled).toBeFalse();
  });

  it('COMPANY_BUSY al aplicar: avisa y «Reintentar» repite sin volver a elegir el archivo', () => {
    render();
    pick();
    apply();
    http.expectOne(FICHA_APPLY_URL).flush(apiError('COMPANY_BUSY'), { status: 409, statusText: 'x' });
    settle();

    expect(text('ficha-error')).toContain('carga procesándose');
    testId('ficha-retry')!.click();
    settle();
    http.expectOne(FICHA_APPLY_URL).flush({ data: fichaApplyDto() });
    refreshList();

    expect(testId('ficha-result')).not.toBeNull();
  });

  it('cada error de la vista previa sale en español y deja elegir otro archivo', () => {
    const cases: readonly [string, number, string][] = [
      ['INVALID_FILE', 422, 'No se pudo leer el archivo'],
      ['FILE_TOO_LARGE', 413, 'supera el tamaño'],
      ['UNSUPPORTED_FILE', 415, '.xlsx'],
      ['FICHA_TOO_LARGE', 422, 'más filas de las permitidas'],
    ];

    for (const [code, status, message] of cases) {
      render();
      const input = testId<HTMLInputElement>('ficha-input')!;
      const transfer = new DataTransfer();

      transfer.items.add(xlsxFile());
      input.files = transfer.files;
      input.dispatchEvent(new Event('change'));
      http.expectOne(FICHA_PREVIEW_URL).flush(apiError(code), { status, statusText: 'x' });
      settle();

      expect(q('[role="alert"][data-testid="ficha-error"]')!.textContent).withContext(code).toContain(message);
      expect(testId<HTMLInputElement>('ficha-input')!.disabled).toBeFalse();
      http.verify();
      TestBed.resetTestingModule();
    }

    render();
  });

  it('«Elegir otro archivo» vuelve al primer paso y descarta la revisión', () => {
    render();
    pick();
    testId('ficha-back')!.click();
    settle();

    expect(testId('ficha-step-file')).not.toBeNull();
    expect(facade.preview()).toBeNull();
  });

  it('el foco pasa al título al cambiar de paso (lector de pantalla)', async () => {
    render();
    document.body.appendChild(el());
    pick();
    await Promise.resolve();

    expect(document.activeElement).toBe(q('#ficha-title'));
    document.body.removeChild(el());
  });

  it('Escape y «Cerrar» cierran y avisan; Escape se ignora mientras sube', async () => {
    render();
    const dialog = q<HTMLDialogElement>('dialog')!;
    const input = testId<HTMLInputElement>('ficha-input')!;
    const transfer = new DataTransfer();

    transfer.items.add(xlsxFile());
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    const cancel = new Event('cancel', { cancelable: true });

    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBeTrue();
    http.expectOne(FICHA_PREVIEW_URL).flush({ data: fichaPreviewDto() });
    settle();

    const free = new Event('cancel', { cancelable: true });

    dialog.dispatchEvent(free);
    expect(free.defaultPrevented).toBeFalse();
    dialog.close();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(closed).toBe(1);
    expect(facade.open()).toBeFalse();
  });

  describe('presentación', () => {
    it('el CSS usa solo tokens, tintes 14/20/40/60/80, sin scroll interno en escritorio y con cuerpo desplazable y pie fijo en teléfono', () => {
      render();
      const css = componentCss('dialog.ficha');
      const at = css.indexOf('@media (max-width: 719px)');
      const desktop = css.slice(0, at);
      const phone = css.slice(at, css.indexOf('@media (prefers-reduced-motion'));

      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      expect(at).toBeGreaterThan(0);
      expect(desktop).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
      expect(phone).toMatch(/\.bd \{[^}]*overflow-y: auto/);
      expect(phone).toMatch(/\.hd, \.ft \{ flex: none;/);
      expect(phone).toMatch(/max-height: 100dvh/);

      for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
    });

    it('la revisión con 6 problemas cabe en 1280×800 sin scroll', () => {
      render();
      pick(xlsxFile(), fichaPreviewDto({ issues: Array.from({ length: 50 }, (_, n) => ({ row: n + 4, plate: `AAA${n}`, field: 'unit', message: 'Unidad incompatible con el combustible' })), issues_truncated: true }));
      apply();
      http.expectOne(FICHA_APPLY_URL).flush(apiError('FICHA_PREVIEW_STALE'), { status: 409, statusText: 'x' });
      settle();
      document.body.appendChild(el());
      const dialog = q<HTMLDialogElement>('dialog')!;

      expect(getComputedStyle(dialog).overflow).toBe('visible');
      expect(dialog.scrollHeight).toBeLessThanOrEqual(740);

      if (window.innerWidth >= 720) {
        for (const node of qa('*')) {
          const style = getComputedStyle(node);

          expect(style.overflowY === 'auto' || style.overflowY === 'scroll').withContext(node.tagName + '.' + node.className).toBeFalse();
        }
      }

      document.body.removeChild(el());
    });

    it('el archivo se elige con un campo real dentro de una etiqueta (teclado y lectores de pantalla) y los botones tienen nombre', () => {
      render();

      expect(q('label.drop input[type="file"]')).not.toBeNull();
      expect(qa('button').every((b) => (b.textContent ?? '').trim().length > 0)).toBeTrue();
    });
  });

  describe('rendimientos medidos vigentes (MEASURED_PROTECTED)', () => {
    const protectedPreview = (rows = 8): FichaPreviewDto => {
      const base = fichaPreviewDto();

      return { ...base, counts: { ...base.counts, measured_protected: rows }, protected_rows: Array.from({ length: rows }, (_, i) => protectedRowDto({ row: i + 2, plate: `AB${i}123` })), protected_truncated: false };
    };

    it('sin protegidos no hay bloque ni casilla', () => {
      render();
      pick();

      expect(testId('ficha-protected')).toBeNull();
      expect(testId('ficha-replace-measured')).toBeNull();
    });

    it('muestra el conteo aparte, que por defecto NO se reemplazan y la casilla SIN marcar; la lista es de 6 por página con valores del servidor', () => {
      render();
      pick(xlsxFile(), protectedPreview());

      expect(text('ficha-protected-count')).toBe('8 vehículos con rendimiento medido vigente');
      expect(text('ficha-protected-note')).toContain('Por defecto NO se reemplazan');
      const box = testId<HTMLInputElement>('ficha-replace-measured')!;

      expect(box.checked).toBeFalse();
      expect(box.getAttribute('aria-describedby')).toBe('ficha-prot-note');
      expect(text('ficha-protected-rows')).toContain('Medido: 7.200000 km/gal');
      expect(text('ficha-protected-rows')).toContain('Nuevo: 6.900000 km/gal');
      expect(qa('[data-testid="ficha-protected-rows"] li').length).toBe(6);
      testId('ficha-prot-next')!.click();
      settle();
      expect(qa('[data-testid="ficha-protected-rows"] li').length).toBe(2);
      expect(text('ficha-protected')).toContain('Página 2 de 2');
    });

    it('sin marcar, aplicar NO envía confirm_replace_measured y muestra las omitidas', () => {
      render();
      pick(xlsxFile(), protectedPreview());
      apply();
      const req = http.expectOne(FICHA_APPLY_URL);

      expect((req.request.body as FormData).has('confirm_replace_measured')).toBeFalse();
      req.flush({ data: { ...fichaApplyDto(), skipped_measured_protected: 8 } });
      refreshList();

      expect(text('ficha-skipped-protected')).toContain('8 filas omitidas');
    });

    it('marcada, envía confirm_replace_measured=true y muestra cuántos medidos se reemplazaron', () => {
      render();
      pick(xlsxFile(), protectedPreview());
      testId('ficha-replace-measured')!.click();
      settle();
      apply();
      const req = http.expectOne(FICHA_APPLY_URL);

      expect((req.request.body as FormData).get('confirm_replace_measured')).toBe('true');
      req.flush({ data: { ...fichaApplyDto(), records_replaced_measured: 8 } });
      refreshList();

      expect(text('ficha-replaced-measured')).toContain('8 rendimientos medidos reemplazados por confirmación');
    });

    it('si todas las filas válidas están protegidas, Aplicar solo se habilita al marcar la casilla', () => {
      const base = fichaPreviewDto();

      render();
      pick(xlsxFile(), { ...protectedPreview(3), counts: { ...base.counts, valid: 3, to_create: 0, to_replace: 0, pending_trips: 0, measured_protected: 3 } });

      expect(testId('ficha-apply')!.hasAttribute('disabled')).toBeTrue();
      testId('ficha-replace-measured')!.click();
      settle();
      expect(testId('ficha-apply')!.hasAttribute('disabled')).toBeFalse();
    });

    it('409 MEASURED_PROTECTED al aplicar: dice qué hacer y no deja resultado', () => {
      render();
      pick(xlsxFile(), protectedPreview());
      apply();
      http.expectOne(FICHA_APPLY_URL).flush(apiError('MEASURED_PROTECTED'), { status: 409, statusText: 'Conflict' });
      settle();

      expect(text('ficha-error')).toContain('Marca «Reemplazar también los rendimientos medidos»');
      expect(testId('ficha-result')).toBeNull();
    });

    it('409 FICHA_PREVIEW_STALE (más protegidas que en la vista previa): ofrece «Revisar de nuevo» y la casilla vuelve a empezar sin marcar', () => {
      render();
      pick(xlsxFile(), protectedPreview());
      testId('ficha-replace-measured')!.click();
      settle();
      apply();
      http.expectOne(FICHA_APPLY_URL).flush(apiError('FICHA_PREVIEW_STALE'), { status: 409, statusText: 'Conflict' });
      settle();

      expect(testId('ficha-stale')).not.toBeNull();
      testId('ficha-review-again')!.click();
      settle();
      http.expectOne(FICHA_PREVIEW_URL).flush({ data: protectedPreview() });
      settle();

      expect(testId<HTMLInputElement>('ficha-replace-measured')!.checked).toBeFalse();
    });

    it('el CSS del bloque usa solo tokens, sin scroll interno y con tintes permitidos', () => {
      render();
      pick(xlsxFile(), protectedPreview());
      const css = componentCss('.prot').split('}').filter((rule) => rule.includes('.prot')).join('}');

      expect(css).toContain('.prot');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
      for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
    });
  });
});
