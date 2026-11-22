import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, columnDto, importDetailDto, importSummaryDto, reviewDto, vehiclesDetectedDto } from '../../../testing/imports';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { toImportSummary } from '../../infrastructure/mappers/imports.mappers';
import { ImportDetailDto } from '../../infrastructure/dto/imports.dto';
import { ImportReviewDialogComponent } from './import-review-dialog.component';

describe('ImportReviewDialogComponent: revisión de una carga', () => {
  let fixture: ComponentFixture<ImportReviewDialogComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>(selector));
  const flat = (e: HTMLElement): string => e.innerText.replace(/\s+/g, ' ').trim();
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function open(detail: ImportDetailDto | null = importDetailDto(), summary = importSummaryDto()): void {
    TestBed.configureTestingModule({ imports: [ImportReviewDialogComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ImportReviewDialogComponent);
    fixture.componentRef.setInput('summary', toImportSummary(summary));
    fixture.detectChanges();

    if (detail) {
      http.expectOne(`${IMPORTS_URL}/${summary.id}`).flush({ data: detail });
      fixture.detectChanges();
    }
  }

  afterEach(() => http?.match(() => true));

  it('es un diálogo modal con el archivo y la fecha como cabecera y un esqueleto mientras carga', () => {
    open(null);

    expect(q<HTMLDialogElement>('dialog')!.open).toBeTrue();
    expect(q('dialog')!.getAttribute('aria-labelledby')).toBe('review-title');
    expect(text('#review-title')).toBe('operaciones-marzo.xlsx');
    expect(q('[role="status"][aria-busy="true"]')).not.toBeNull();
  });

  const reason = (code: string, rows: number, sample: number[] = [4, 9]) => ({ code, label: `Motivo ${code}`, rows, sample_rows: sample });

  it('la cabecera trae archivo, tamaño y fecha en una línea, el ícono de Excel, el chip del formato y el botón cerrar', () => {
    open();

    expect(text('[data-testid="review-meta"]')).toMatch(/^20 KB · 1 Mar 2026/);
    expect(q('app-excel-icon')).not.toBeNull();
    expect(text('[data-testid="review-format"]')).toBe('Plantilla LOGYCA');
    expect(q('[data-testid="close-review"]')!.getAttribute('aria-label')).toBe('Cerrar');
    q('[data-testid="close-review"]')!.click();
    expect(q<HTMLDialogElement>('dialog')!.open).toBeFalse();
  });

  it('el veredicto dice el porcentaje de viajes calculables con una barra con su texto y la línea de apoyo', () => {
    open();

    expect(text('[data-testid="verdict-title"]')).toBe('El 85 % de tus viajes se puede calcular');
    expect(q('[data-testid="verdict-bar"]')!.getAttribute('role')).toBe('img');
    expect(q('[data-testid="verdict-bar"]')!.getAttribute('aria-label')).toBe('El 85 % de tus viajes se puede calcular');
    expect(text('[data-testid="verdict-support"]')).toBe('170 de 200 viajes tienen los datos necesarios.');
    expect(q('[data-testid="review-tiles"]')).toBeNull();
  });

  it('bajo el veredicto va «Periodo de los viajes: … (Trimestral)» con el periodo de esa carga', () => {
    open(importDetailDto({ review: { ...reviewDto(), period: { from: '2026-01-05', to: '2026-03-28' } } }));

    expect(text('[data-testid="review-period"]')).toBe('Periodo de los viajes: Ene 2026 a Mar 2026 (Trimestral)');
    expect(q('[data-testid="review-verdict"] [data-testid="review-period"]')).not.toBeNull();
  });

  it('un mes o varios meses sueltos se rotulan «Mensual» o «N meses»; sin periodo no hay línea', () => {
    open(importDetailDto({ review: { ...reviewDto(), period: { from: '2026-11-03', to: '2026-11-27' } } }));
    expect(text('[data-testid="review-period"]')).toBe('Periodo de los viajes: Nov 2026 (Mensual)');

    TestBed.resetTestingModule();
    open(importDetailDto({ review: { ...reviewDto(), period: { from: '2026-01-01', to: '2026-05-31' } } }));
    expect(text('[data-testid="review-period"]')).toBe('Periodo de los viajes: Ene 2026 a May 2026 (5 meses)');

    TestBed.resetTestingModule();
    open(importDetailDto({ review: { ...reviewDto(), period: null } }));
    expect(q('[data-testid="review-period"]')).toBeNull();
  });

  it('con 3.400.000 filas las cifras llevan separador de miles y el informe no desborda', () => {
    open(importDetailDto({ review: reviewDto({ rows_read: 3_400_000, methods: { real_consumption: 1_645_000, estimated_consumption: 1_000_000, pending: 755_000 }, pending_reasons: [reason('MISSING_UNIT', 755_000)] }) }));

    expect(text('[data-testid="verdict-title"]')).toBe('El 78 % de tus viajes se puede calcular');
    expect(text('[data-testid="verdict-support"]')).toBe('2.645.000 de 3.400.000 viajes tienen los datos necesarios.');
    expect(text('[data-testid="breakdown-real"]')).toContain('1.645.000');
    expect(text('[data-testid="reasons"]')).toContain('755.000 viajes');
    const body = q('.body')!;

    expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);
  });

  it('el porcentaje es 100 % cuando todo se puede calcular y nunca 0 % cuando algo sí se puede', () => {
    open(importDetailDto({ review: reviewDto({ rows_read: 200, methods: { real_consumption: 200, estimated_consumption: 0, pending: 0 }, pending_reasons: [] }) }));
    expect(text('[data-testid="verdict-title"]')).toBe('El 100 % de tus viajes se puede calcular');
    expect(q('[data-testid="review-todo"]')).toBeNull();
  });

  it('menos de 1 % se muestra como 1 % y sin ningún viaje calculable lo dice directo', () => {
    open(importDetailDto({ review: reviewDto({ rows_read: 1_000_000, methods: { real_consumption: 1, estimated_consumption: 0, pending: 999_999 } }) }));
    expect(text('[data-testid="verdict-title"]')).toBe('El 1 % de tus viajes se puede calcular');
  });

  it('sin viajes calculables no dice 0 %', () => {
    open(importDetailDto({ review: reviewDto({ methods: { real_consumption: 0, estimated_consumption: 0, pending: 200 } }) }));
    expect(text('[data-testid="verdict-title"]')).toBe('Todavía no se puede calcular ningún viaje');
  });

  it('el desglose son tres filas con la cifra del servidor y una línea cada una', () => {
    open();

    expect(qa('[data-testid="review-breakdown"] li').map(flat)).toEqual([
      '120 Con consumo real. Usamos el combustible que reportaste',
      '50 Con consumo estimado. Calculado con distancia y rendimiento',
      '30 Por completar datos. Les falta algún dato',
    ]);
  });

  it('el formato CARITRANS se rotula «Formato CARITRANS»', () => {
    open(importDetailDto({ format: 'CARITRANS', review: reviewDto({ format: 'CARITRANS' }) }));

    expect(text('[data-testid="review-format"]')).toBe('Formato CARITRANS');
    expect(q('[data-testid="review-verdict"]')).not.toBeNull();
  });

  it('«Qué hacer» ordena los motivos por cantidad, con la acción según el código y las filas de ejemplo', () => {
    open(importDetailDto({ review: reviewDto({ pending_reasons: [reason('MISSING_UNIT', 5, [2]), reason('MISSING_DISTANCE_WITH_ROUTE', 20), reason('OTRO', 9, [])] }) }));
    const items = qa('[data-testid="reasons"] > li').map(flat);

    expect(items).toEqual([
      '20 viajes Motivo MISSING_DISTANCE_WITH_ROUTE Ej.: filas 4 y 9 Qué hacer: Agrega la distancia en km de cada viaje.',
      '9 viajes Motivo OTRO',
      '5 viajes Motivo MISSING_UNIT Ej.: fila 2 Qué hacer: Indica la unidad correcta (gal, l, m3 o kWh).',
    ]);
    expect(q('[data-testid="reasons"] li strong')!.textContent).toBe('20 viajes');
    expect(q('[data-testid="more-reasons"]')).toBeNull();
  });

  it('muestra 3 motivos y el resto va en un <details> «Ver los N motivos restantes»', () => {
    open(importDetailDto({ review: reviewDto({ pending_reasons: [reason('A', 50), reason('B', 40), reason('C', 30), reason('D', 20), reason('INVALID_VALUES', 10)] }) }));
    const more = q<HTMLDetailsElement>('[data-testid="more-reasons"]')!;

    expect(qa('[data-testid="reasons"] > li').length).toBe(3);
    expect(more.tagName).toBe('DETAILS');
    expect(more.open).toBeFalse();
    expect(more.querySelector('summary')!.textContent).toBe('Ver los 2 motivos restantes');
    expect(qa('[data-testid="more-reasons-list"] > li').map((li) => li.querySelector('strong')!.textContent)).toEqual(['20 viajes', '10 viajes']);
    expect(more.textContent).toContain('Corrige los valores que no son números o están fuera de rango.');
  });

  it('con un solo motivo restante usa el singular', () => {
    open(importDetailDto({ review: reviewDto({ pending_reasons: [reason('A', 4), reason('B', 3), reason('C', 2), reason('D', 1)] }) }));

    expect(text('[data-testid="more-reasons"] summary')).toBe('Ver el motivo restante');
  });

  it('los avisos van colapsados, con los errores primero, severidad, viajes y ejemplos', () => {
    open();
    const details = q<HTMLDetailsElement>('[data-testid="review-issues"]')!;
    const items = qa('[data-testid="issues"] > li');

    expect(details.open).toBeFalse();
    expect(details.querySelector('summary')!.textContent).toBe('Avisos del archivo (3)');
    expect(items.length).toBe(3);
    expect(items[0].querySelector('.badge-danger')!.textContent).toBe('Error');
    expect(items[1].querySelector('.badge-warning')!.textContent).toBe('Aviso');
    expect(items[2].querySelector('.badge-info')!.textContent).toBe('Información');
    expect(items[1].textContent).toContain('Hay placas con formato inválido.');
    expect(items[1].textContent).toContain('3 viajes');
    expect(items[1].textContent).toContain('Ej.: filas 7, 8 y 12');
    expect(items[0].textContent).toContain('1 viaje');
  });

  it('sin avisos no muestra esa sección', () => {
    open(importDetailDto({ review: reviewDto({ issues: [] }) }));

    expect(q('[data-testid="review-issues"]')).toBeNull();
  });

  it('las columnas van colapsadas con un resumen visible y la tabla completa dentro', () => {
    open();
    const details = q<HTMLDetailsElement>('[data-testid="review-columns"]')!;

    expect(details.open).toBeFalse();
    expect(text('[data-testid="columns-summary"]')).toBe('· 3 de 4 columnas reconocidas');
    expect(details.contains(q('[data-testid="columns"]'))).toBeTrue();
  });

  it('las columnas obligatorias o condicionales que faltan salen como chips con su nombre; las opcionales no', () => {
    open(importDetailDto({ review: reviewDto({ columns: [columnDto(), columnDto({ field: 'd', label: 'Distancia (km)', requirement: 'CONDITIONAL', found: false, source_header: null, filled_rows: 0 }), columnDto({ field: 'o', label: 'Opcional X', requirement: 'OPTIONAL', found: false, source_header: null, filled_rows: 0 })] }) }));

    expect(qa('[data-testid="missing-columns"] li').map((c) => c.textContent)).toEqual(['Falta: Distancia (km)']);
    expect(text('[data-testid="columns-summary"]')).toBe('· 1 de 3 columnas reconocidas');
  });

  it('sin columnas que falten no hay chips', () => {
    open(importDetailDto({ review: reviewDto({ columns: [columnDto()] }) }));

    expect(q('[data-testid="missing-columns"]')).toBeNull();
  });

  it('la tabla de columnas trae etiqueta, tipo, encontrada o no y el % diligenciado calculado con los números del servidor', () => {
    open();
    const rows = qa('[data-testid="columns"] tbody tr').map((r) => r.textContent!.replace(/\s+/g, ' ').trim());

    expect(rows.length).toBe(4);
    expect(rows[0]).toContain('Placa del vehículo');
    expect(rows[0]).toContain('Obligatoria');
    expect(rows[0]).toContain('100 %');
    expect(rows[1]).toContain('75 %');
    expect(rows[2]).toContain('No encontrada');
    expect(rows[2]).not.toContain('%');
    expect(rows[3]).toContain('Encabezado: ID servicio');
    expect(rows[3]).toContain('20 %');
  });

  it('el % diligenciado no divide por cero cuando no se leyó ninguna fila', () => {
    open(importDetailDto({ review: reviewDto({ rows_read: 0, columns: [columnDto({ filled_rows: 0 })] }) }));

    expect(text('[data-testid="columns"] tbody tr')).toContain('0 %');
    expect(text('[data-testid="verdict-title"]')).toBe('No encontramos viajes en el archivo');
  });

  it('el pie es una línea con placas y viajes distintos y la nota honesta', () => {
    open();

    expect(flat(q('[data-testid="counters"]')!)).toBe('18 placas distintas · 190 viajes');
    expect(text('[data-testid="honest-note"]')).toBe('Esta revisión todavía no guarda viajes ni calcula emisiones.');
  });

  it('en el caso típico el informe cabe sin scroll interno y a menos de 640 px con los <details> cerrados', () => {
    open(importDetailDto({ review: reviewDto({ pending_reasons: [reason('MISSING_DISTANCE_WITH_ROUTE', 20), reason('MISSING_UNIT', 6), reason('INVALID_VALUES', 4)] }) }));
    const dialog = q<HTMLDialogElement>('dialog')!;
    const body = q('.body')!;

    // La ventana de pruebas es baja y recorta el diálogo: se mide el contenido completo (cabecera + cuerpo).
    expect(q('.head')!.getBoundingClientRect().height + body.scrollHeight).toBeLessThan(640);
    expect(dialog.querySelector('details[open]')).toBeNull();
  });

  it('un formato no reconocido muestra solo la explicación y el atajo para descargar la plantilla', () => {
    open(importDetailDto({ format: 'UNRECOGNIZED', error: 'Encabezados hallados: A, B, C.', review: reviewDto({ format: 'UNRECOGNIZED', columns: [], issues: [] }) }));

    expect(text('[data-testid="review-format"]')).toBe('No reconocido');
    expect(text('[data-testid="unrecognized"]')).toContain('Encabezados hallados: A, B, C.');
    expect(q('[data-testid="review-verdict"]')).toBeNull();
    expect(q('[data-testid="columns"]')).toBeNull();
    expect(q('[data-testid="honest-note"]')).toBeNull();

    const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:x');
    spyOn(HTMLAnchorElement.prototype, 'click');
    q('[data-testid="download-template"]')!.click();
    http.expectOne(`${IMPORTS_URL}/template`).flush(new Blob(['x']));

    expect(create).toHaveBeenCalled();
  });

  it('un formato no reconocido dice qué hacer', () => {
    open(importDetailDto({ format: 'UNRECOGNIZED', review: reviewDto({ format: 'UNRECOGNIZED', columns: [], issues: [] }) }));

    expect(text('[data-testid="unrecognized"]')).toContain('Qué hacer: usa la plantilla oficial');
  });

  it('una revisión en curso muestra el avance con el camión y la fase', () => {
    open(importDetailDto({ status: 'RUNNING', phase: 'REVIEWING', rows_processed: 50, rows_total: 200, review: null, format: null }));

    expect(q('app-truck-progress [role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('25');
    expect(q('[data-testid="review-verdict"]')).toBeNull();
    expect(text('[data-testid="review-progress"]')).toContain('Revisando los datos');
    expect(text('[data-testid="review-progress"]')).toContain('50 de 200 filas');
  });

  it('una carga fallida muestra el motivo del servidor y «Reintentar», que la encola de nuevo', () => {
    open(importDetailDto({ status: 'FAILED', error: 'El archivo no tiene filas.', review: null }));

    expect(text('[data-testid="review-failed"]')).toContain('El archivo no tiene filas.');
    expect(text('[data-testid="review-failed"]')).toContain('Qué hacer');
    expect(q('[data-testid="review-verdict"]')).toBeNull();
    q('[data-testid="retry-import"]')!.click();
    http.expectOne({ method: 'POST', url: `${IMPORTS_URL}/imp-1/retry` }).flush({ error: { code: 'IMPORT_NOT_RETRYABLE' } }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(text('[data-testid="retry-error"]')).toContain('no se puede reintentar');
  });

  it('si no se puede cargar el detalle muestra el error con «Reintentar»', () => {
    open(null);
    http.expectOne(`${IMPORTS_URL}/imp-1`).flush({ error: { code: 'IMPORT_NOT_FOUND' } }, { status: 404, statusText: 'x' });
    fixture.detectChanges();

    expect(text('[role="alert"]')).toContain('La carga no existe');
    q('[data-testid="reload-review"]')!.click();
    http.expectOne(`${IMPORTS_URL}/imp-1`).flush({ data: importDetailDto() });
    fixture.detectChanges();
    expect(q('[data-testid="review-verdict"]')).not.toBeNull();
  });

  it('el CSS del diálogo usa solo tokens de la plataforma: sin hexadecimales ni rgb()', () => {
    open();
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('dialog.review')).join('\n');

    expect(css).toContain('dialog.review');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });

  describe('vehículos detectados', () => {
    it('la revisión no incrusta la lista de vehículos: tiene su propia ventana', () => {
      open(importDetailDto({ vehicles_detected: vehiclesDetectedDto() }));

      expect(q('app-import-vehicles-section')).toBeNull();
      expect(q('[data-testid="detected-vehicles"]')).toBeNull();
    });
  });
});
