import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, importDetailDto, importSummaryDto, reviewDto } from '../../../testing/imports';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { pagedBody } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { toImportSummary } from '../../infrastructure/mappers/imports.mappers';
import { NotCalculableDialogComponent } from './not-calculable-dialog.component';

const ACK = `${IMPORTS_URL}/imp-1/acknowledge-not-calculable`;
const SUMMARY = importSummaryDto({ headline: { rows_read: 40, real_consumption: 0, estimated_consumption: 0, pending: 40 }, not_calculable: { acknowledged_at: null } });
const REVIEW = reviewDto({
  methods: { real_consumption: 0, estimated_consumption: 0, pending: 40 },
  pending_reasons: [
    { code: 'MISSING_FUEL_DATA', label: 'Falta el consumo o la distancia', rows: 30, sample_rows: [2] },
    { code: 'MISSING_DISTANCE', label: 'Falta la distancia', rows: 10, sample_rows: [5] },
  ],
  issues: [
    { code: 'EMPTY_COLUMN', severity: 'ERROR', field: 'tipo_combustible', message: 'La columna «Tipo de combustible» está vacía en las 40 filas del archivo', rows: 40, sample_rows: [] },
    { code: 'NO_CALCULABLE_TRIPS', severity: 'ERROR', field: null, message: 'Ningún viaje se puede calcular con este archivo', rows: 40, sample_rows: [] },
  ],
});

describe('NotCalculableDialogComponent: confirmar una carga sin viajes calculables', () => {
  let fixture: ComponentFixture<NotCalculableDialogComponent>;
  let http: HttpTestingController;
  let closed: number;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function render(review = REVIEW): void {
    TestBed.configureTestingModule({ imports: [NotCalculableDialogComponent], providers: [...provideTestApp()] });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    closed = 0;
    fixture = TestBed.createComponent(NotCalculableDialogComponent);
    fixture.componentRef.setInput('summary', toImportSummary(SUMMARY));
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` }).flush({ data: importDetailDto({ review, not_calculable: { acknowledged_at: null } }) });
    fixture.detectChanges();
  }

  /** El evento `close` del diálogo nativo es asíncrono. */
  const closing = (): Promise<unknown> => new Promise((resolve) => q<HTMLDialogElement>('dialog')!.addEventListener('close', resolve, { once: true }));

  afterEach(() => http?.match(() => true));

  it('nunca se dibuja ni se abre el diálogo mientras carga el detalle, ni cuando el detalle dice que se puede calcular estimando; no se confirma nada', async () => {
    TestBed.configureTestingModule({ imports: [NotCalculableDialogComponent], providers: [...provideTestApp()] });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    closed = 0;
    fixture = TestBed.createComponent(NotCalculableDialogComponent);
    fixture.componentRef.setInput('summary', toImportSummary(SUMMARY));
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    expect(q('dialog')).toBeNull();

    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` }).flush({ data: { ...importDetailDto({ review: REVIEW }), not_calculable: null, calculable_with_estimation: { trips: 40, vehicles: 2, already_estimated_trips: 0, mode: 'ASK', requires_consent: true, pending_without_distance_or_reference: 0 } } });
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await Promise.resolve();
      expect(q('dialog')).toBeNull();
    }

    expect(closed).toBe(1);
    http.expectNone(ACK);
  });

  it('una carga sin not_calculable en el detalle tampoco abre el aviso', () => {
    TestBed.configureTestingModule({ imports: [NotCalculableDialogComponent], providers: [...provideTestApp()] });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(NotCalculableDialogComponent);
    fixture.componentRef.setInput('summary', toImportSummary(SUMMARY));
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` }).flush({ data: importDetailDto({ review: REVIEW }) });
    fixture.detectChanges();

    expect(q('dialog')).toBeNull();
  });

  it('es un diálogo modal con rol alertdialog, nombre y descripción accesibles y el foco inicial en «Cancelar»', () => {
    render();
    const dialog = q<HTMLDialogElement>('dialog')!;

    expect(dialog.open).toBeTrue();
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(text('#' + dialog.getAttribute('aria-labelledby'))).toBe('Con este archivo no se puede calcular ningún viaje');
    expect(text('#' + dialog.getAttribute('aria-describedby'))).toContain('operaciones-marzo.xlsx');
    expect(text('#' + dialog.getAttribute('aria-describedby'))).toContain('40 viajes');
    expect(document.activeElement).toBe(q('[data-testid="nc-cancel"]'));
  });

  it('lista las columnas vacías y los motivos con sus filas, con el texto del servidor', () => {
    render();

    expect(Array.from(el().querySelectorAll('[data-testid="nc-reasons"] li')).map((li) => li.textContent!.trim())).toEqual([
      'La columna «Tipo de combustible» está vacía en las 40 filas del archivo',
      'Falta el consumo o la distancia: 30 filas',
      'Falta la distancia: 10 filas',
    ]);
    expect(text('[data-testid="nc-todo"]')).toContain('descarga la plantilla oficial');
    expect(text('[data-testid="nc-cancel"]')).toBe('Cancelar');
    expect(text('[data-testid="nc-confirm"]')).toBe('Entiendo, conservar el archivo');
  });

  it('con más de cuatro motivos resume el resto para no necesitar scroll', () => {
    const reasons = Array.from({ length: 6 }, (_, n) => ({ code: `R${n}`, label: `Motivo ${n}`, rows: n + 1, sample_rows: [] }));

    render(reviewDto({ ...REVIEW, pending_reasons: reasons, issues: [] }));

    expect(el().querySelectorAll('[data-testid="nc-reasons"] li').length).toBe(5);
    expect(text('[data-testid="nc-more"]')).toBe('y 2 más en la revisión');
  });

  it('«Cancelar» cierra sin enviar nada', async () => {
    render();
    const done = closing();

    q('[data-testid="nc-cancel"]')!.click();
    await done;

    http.expectNone((r) => r.method === 'POST');
    expect(q<HTMLDialogElement>('dialog')!.open).toBeFalse();
    expect(closed).toBe(1);
  });

  it('Escape equivale a «Cancelar»: cierra sin enviar nada', async () => {
    render();
    const done = closing();
    const cancel = new Event('cancel', { cancelable: true });

    q<HTMLDialogElement>('dialog')!.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBeFalse(); // sin confirmación en curso, Escape no se bloquea
    q<HTMLDialogElement>('dialog')!.close();
    await done;

    http.expectNone((r) => r.method === 'POST');
    expect(closed).toBe(1);
  });

  it('«Entiendo, conservar el archivo» envía la confirmación una vez, renueva el historial y cierra', async () => {
    render();
    const done = closing();

    q('[data-testid="nc-confirm"]')!.click();
    q('[data-testid="nc-confirm"]')!.click(); // un doble clic no duplica la petición
    fixture.detectChanges();

    expect(q<HTMLButtonElement>('[data-testid="nc-confirm"]')!.disabled).toBeTrue();
    http.expectOne({ method: 'POST', url: ACK }).flush({ data: { acknowledged_at: '2026-03-01T10:05:00Z' } });
    http.expectOne((r) => r.url === IMPORTS_URL && r.method === 'GET').flush(pagedBody([]));
    await done;

    expect(closed).toBe(1);
  });

  it('si la confirmación falla muestra el error en español, sigue abierto y permite reintentar', () => {
    render();
    q('[data-testid="nc-confirm"]')!.click();
    http.expectOne({ method: 'POST', url: ACK }).flush({ error: { code: 'IMPORT_CALCULABLE' } }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(text('[data-testid="nc-error"]')).toContain('sí tiene viajes que se pueden calcular');
    expect(q('[data-testid="nc-error"]')!.getAttribute('role')).toBe('alert');
    expect(q<HTMLDialogElement>('dialog')!.open).toBeTrue();
    expect(q<HTMLButtonElement>('[data-testid="nc-confirm"]')!.disabled).toBeFalse();
    expect(closed).toBe(0);
  });
});
