import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { analysisDto, findingDto, pagedBody, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { FindingDto } from '../../infrastructure/dto/vehicles.dto';
import { AnalysisWizardComponent } from './analysis-wizard.component';

const RUN = `${VEHICLES_ORG_URL}/vehicle-analyses/run-1`;
const BASE = `${VEHICLES_ORG_URL}/vehicle-analyses`;

const newFinding = (id: string, plate: string, over: Partial<FindingDto> = {}): FindingDto =>
  findingDto({ id, plate, plate_original: plate, state: 'NEW', current: null, differences: [], in_file_conflicts: [], detected: { configuration_code: 'C2', vehicle_type: 'Camión', fuel_type: 'DIESEL', model_year: 2020, technology: null, capacity_tons: null }, ...over });

const structural = findingDto({ in_file_conflicts: [] });

describe('AnalysisWizardComponent: Analizar archivo Excel', () => {
  let fixture: ComponentFixture<AnalysisWizardComponent>;
  let http: HttpTestingController;
  let changes: (string | null)[];
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const click = (selector: string): void => {
    q(selector)!.click();
    fixture.detectChanges();
  };
  const settle = (): void => {
    fixture.detectChanges();
    fixture.detectChanges();
  };

  function open(roles = ['ORG_ADMIN'], id: string | null = null, initialStep: 'new' | 'conflicts' | null = null): void {
    TestBed.configureTestingModule({ imports: [AnalysisWizardComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AnalysisWizardComponent);
    changes = [];
    fixture.componentInstance.analysisChange.subscribe((v) => changes.push(v));
    fixture.componentRef.setInput('analysisId', id);
    fixture.componentRef.setInput('initialStep', initialStep);
    fixture.detectChanges();
  }

  const analysisRequest = (): TestRequest => http.expectOne({ method: 'GET', url: RUN });
  const findings = (state: string): TestRequest => http.expectOne((r) => r.url === `${RUN}/findings` && r.params.get('state') === state);

  /** Corrida completada: responde el análisis y los hallazgos de cada estado. */
  function complete(lists: Partial<Record<'NEW' | 'CONFLICT' | 'INCOMPLETE' | 'INVALID', FindingDto[]>> = {}, counts?: Partial<ReturnType<typeof analysisDto>['counts']>): void {
    analysisRequest().flush({ data: analysisDto({ counts: { detected: 12, known: 4, new: 3, conflict: 2, incomplete: 1, invalid: 1, ...counts } }) });
    for (const state of ['NEW', 'CONFLICT', 'INCOMPLETE', 'INVALID'] as const) findings(state).flush(pagedBody(lists[state] ?? []));
    settle();
  }

  const pick = (file: File, selector = '[data-testid="file-input"]'): void => {
    const input = q<HTMLInputElement>(selector)!;
    const transfer = new DataTransfer();

    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  afterEach(() => fixture.destroy());

  describe('paso 1: cargar archivo', () => {
    it('es un diálogo modal con 4 pasos; sin corrida solo está activo «Cargar archivo» y la zona acepta .xlsx', () => {
      open();

      expect(q<HTMLDialogElement>('dialog')!.open).toBeTrue();
      expect(qa('.steps button').map((b) => b.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['1Cargar archivo', '2Resumen', '3Vehículos nuevos', '4Información diferente']);
      expect(qa('.steps button').map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, true, true, true]);
      expect(q('[data-testid="step-upload"]')!.getAttribute('aria-current')).toBe('step');
      expect(q<HTMLInputElement>('[data-testid="file-input"]')!.accept).toContain('.xlsx');
    });

    it('rechaza en el cliente un archivo que no es .xlsx, sin llamar al servidor', () => {
      open();
      pick(new File(['x'], 'datos.csv'));

      expect(text('[data-testid="upload-error"]')).toBe('El archivo debe ser un libro de Excel con extensión .xlsx.');
      http.expectNone({ method: 'POST', url: BASE });
    });

    it('sube el archivo con Idempotency-Key, avisa el id y sigue el avance real con la fase en español', () => {
      open();
      pick(new File(['x'], 'operaciones.xlsx'));
      const req = http.expectOne({ method: 'POST', url: BASE });

      expect(req.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
      expect((req.request.body as FormData).get('file')).toEqual(jasmine.any(File));
      req.flush({ data: { id: 'run-1', status: 'QUEUED', duplicate: false } }, { status: 202, statusText: 'Accepted' });
      http.expectOne((r) => r.params.get('page_size') === '5').flush(pagedBody([]));
      http.expectOne((r) => r.params.get('has_pending') === 'true').flush(pagedBody([]));
      expect(changes).toEqual(['run-1']);

      fixture.componentRef.setInput('analysisId', 'run-1');
      fixture.detectChanges();
      analysisRequest().flush({ data: analysisDto({ status: 'RUNNING', phase: 'READING', rows_processed: 40, rows_total: 100 }) });
      settle();

      const bar = q('[role="progressbar"]')!;
      expect(bar.getAttribute('aria-valuenow')).toBe('40');
      expect(bar.classList).not.toContain('indeterminate');
      expect(text('[data-testid="phase"]')).toBe('Leyendo el archivo · 40 de 100 filas');
      expect(q('[data-testid="phase"]')!.parentElement!.querySelector('[aria-live="polite"]')).not.toBeNull();
    });

    it('sin total de filas la barra es indeterminada y la fase de comparación se traduce', () => {
      open(['ORG_ADMIN'], 'run-1');
      analysisRequest().flush({ data: analysisDto({ status: 'RUNNING', phase: 'COMPARING', rows_processed: 0, rows_total: null }) });
      settle();

      expect(q('[role="progressbar"]')!.classList).toContain('indeterminate');
      expect(q('[role="progressbar"]')!.hasAttribute('aria-valuenow')).toBeFalse();
      expect(text('[data-testid="phase"]')).toBe('Comparando con tu inventario');
    });

    it('un archivo demasiado grande o de un tipo no admitido muestra el mensaje del catálogo', () => {
      open();
      pick(new File(['x'], 'grande.xlsx'));
      http.expectOne({ method: 'POST', url: BASE }).flush({ error: { code: 'FILE_TOO_LARGE' } }, { status: 413, statusText: 'Payload Too Large' });
      fixture.detectChanges();

      expect(text('[data-testid="upload-error"]')).toContain('El archivo supera el tamaño permitido');

      pick(new File(['x'], 'raro.xlsx'));
      http.expectOne({ method: 'POST', url: BASE }).flush({ error: { code: 'UNSUPPORTED_FILE' } }, { status: 415, statusText: 'Unsupported' });
      fixture.detectChanges();

      expect(text('[data-testid="upload-error"]')).toContain('.xlsx');
      expect(changes).toEqual([]);
    });

    it('un corte de red al subir (posible archivo demasiado grande) lo explica y deja reintentar con una clave nueva', () => {
      open();
      pick(new File(['x'], 'grande.xlsx'));
      const first = http.expectOne({ method: 'POST', url: BASE });

      first.error(new ProgressEvent('error'), { status: 0 });
      fixture.detectChanges();

      expect(text('[data-testid="upload-error"]')).toBe('No se pudo subir el archivo: puede superar el tamaño permitido o se perdió la conexión.');
      click('[data-testid="retry-upload"]');
      const second = http.expectOne({ method: 'POST', url: BASE });

      expect(second.request.headers.get('Idempotency-Key')).not.toBe(first.request.headers.get('Idempotency-Key'));
      second.flush({ data: { id: 'run-1', status: 'QUEUED', duplicate: false } }, { status: 202, statusText: 'Accepted' });
      expect(changes).toEqual(['run-1']);
    });

    it('un archivo ya analizado lo dice y abre su resultado', () => {
      open();
      pick(new File(['x'], 'operaciones.xlsx'));
      http.expectOne({ method: 'POST', url: BASE }).flush({ data: { id: 'run-1', status: 'COMPLETED', duplicate: true } }, { status: 200, statusText: 'OK' });
      http.expectOne((r) => r.params.get('page_size') === '5').flush(pagedBody([]));
      http.expectOne((r) => r.params.get('has_pending') === 'true').flush(pagedBody([]));
      fixture.componentRef.setInput('analysisId', 'run-1');
      fixture.detectChanges();
      complete();

      expect(text('[data-testid="duplicate"]')).toBe('Este archivo ya fue analizado: te mostramos su resultado.');
      expect(q('[data-testid="step-summary"]')!.getAttribute('aria-current')).toBe('step');
    });

    it('una corrida fallida muestra el motivo y «Reintentar» (imports:create) que la vuelve a encolar', () => {
      open(['ORG_ADMIN'], 'run-1');
      analysisRequest().flush({ data: analysisDto({ status: 'FAILED', error: 'El archivo no tiene la columna de placas.' }) });
      settle();

      expect(text('[data-testid="analysis-failed"]')).toContain('El archivo no tiene la columna de placas.');
      click('[data-testid="retry-analysis"]');
      http.expectOne({ method: 'POST', url: `${RUN}/retry` }).flush({ error: { code: 'ANALYSIS_NOT_RETRYABLE' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(text('[data-testid="retry-error"]')).toContain('no se puede reintentar');
    });

    it('sin imports:create no hay zona de carga ni «Reintentar»', () => {
      open(['ORG_VIEWER']);
      expect(q('[data-testid="dropzone"]')).toBeNull();
      expect(text('[data-testid="no-upload"]')).toContain('no permite cargar archivos');

      TestBed.resetTestingModule();
      open(['ORG_VIEWER'], 'run-1');
      analysisRequest().flush({ data: analysisDto({ status: 'FAILED', error: 'x' }) });
      settle();
      expect(q('[data-testid="retry-analysis"]')).toBeNull();
    });

    it('si no se puede consultar la corrida muestra el error con «Reintentar»', () => {
      open(['ORG_ADMIN'], 'run-1');
      analysisRequest().flush({ error: { code: 'ANALYSIS_NOT_FOUND' } }, { status: 404, statusText: 'x' });
      settle();

      expect(text('[role="alert"]')).toContain('El análisis no existe');
      click('[data-testid="reload-analysis"]');
      analysisRequest().flush({ data: analysisDto({ status: 'RUNNING' }) });
      settle();
      expect(q('[role="progressbar"]')).not.toBeNull();
    });

    it('«Cargar archivo» con una corrida abierta avisa que se vuelve al inicio (id nulo)', () => {
      open(['ORG_ADMIN'], 'run-1');
      complete();

      click('[data-testid="step-upload"]');

      expect(changes).toEqual([null]);
    });
  });

  describe('paso 2: resumen', () => {
    it('al terminar la corrida muestra los conteos reales del servidor', () => {
      open(['ORG_ADMIN'], 'run-1');
      complete();

      expect(q('[data-testid="step-summary"]')!.getAttribute('aria-current')).toBe('step');
      expect(['detected', 'known', 'new', 'conflict', 'incomplete', 'invalid'].map((k) => text(`[data-testid="count-${k}"]`))).toEqual(['12', '4', '3', '2', '1', '1']);
      expect(qa('.tiles .label').map((l) => l.textContent)).toEqual(['Detectados', 'Conocidos', 'Nuevos', 'Con conflictos', 'Incompletos', 'Inválidos']);
      expect(qa('.steps button').every((b) => !(b as HTMLButtonElement).disabled)).toBeTrue();
    });

    it('ofrece ir a los nuevos o a las diferencias solo si hay', () => {
      open(['ORG_ADMIN'], 'run-1');
      complete({}, { new: 0, conflict: 0 });

      expect(q('[data-testid="go-new"]')).toBeNull();
      expect(q('[data-testid="go-conflicts"]')).toBeNull();
    });

    it('restaurada desde la URL con un paso pedido (tarjetas «Nuevos pendientes») abre ese paso', () => {
      open(['ORG_ADMIN'], 'run-1', 'new');
      complete({ NEW: [newFinding('n-1', 'AAA111')] });

      expect(q('[data-testid="step-new"]')!.getAttribute('aria-current')).toBe('step');
      expect(q('[data-testid="new-table"]')).not.toBeNull();
    });
  });

  describe('paso 3: vehículos nuevos', () => {
    const nuevos = [newFinding('n-1', 'AAA111'), newFinding('n-2', 'BBB222', { detected: { configuration_code: 'C3', vehicle_type: null, fuel_type: 'GASOLINE', model_year: null, technology: null, capacity_tons: null } })];

    function toNew(roles = ['ORG_ADMIN']): void {
      open(roles, 'run-1');
      complete({ NEW: nuevos });
      click('[data-testid="go-new"]');
    }

    it('lista los nuevos con placa, configuración, combustible, modelo, fuente y estado', () => {
      toNew();

      expect(qa('[data-testid="new-table"] thead th').map((th) => th.textContent!.trim()).slice(1)).toEqual(['Placa', 'Configuración', 'Combustible', 'Modelo', 'Fuente', 'Estado']);
      const [first, second] = qa('[data-testid="new-table"] tbody tr').map((r) => r.textContent!.replace(/\s+/g, ' '));
      expect(first).toContain('AAA111');
      expect(first).toContain('C2');
      expect(first).toContain('Diésel');
      expect(first).toContain('2020');
      expect(first).toContain('operaciones-marzo.xlsx');
      expect(first).toContain('Nuevo');
      expect(second).toContain('Gasolina');
      expect(text('[data-testid="new-total"]')).toBe('2 vehículos nuevos · 0 seleccionados');
    });

    it('«Registrar seleccionados» envía los finding_ids y muestra el resultado', () => {
      toNew();
      expect(q<HTMLButtonElement>('[data-testid="register-selected"]')!.disabled).toBeTrue();

      click('input[aria-label="Seleccionar AAA111"]');
      expect(text('[data-testid="new-total"]')).toContain('1 seleccionados');
      click('[data-testid="register-selected"]');

      const req = http.expectOne({ method: 'POST', url: `${RUN}/confirm` });
      expect(req.request.body).toEqual({ finding_ids: ['n-1'] });
      req.flush({ data: { registered: 1, already_registered: 1, skipped: 0 } });
      findings('NEW').flush(pagedBody([nuevos[1]]));
      http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ data: { registered: 1, pending_new: 1, conflicts: 0, inactive: 0 } });
      http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([]));
      http.expectOne((r) => r.params.get('page_size') === '5').flush(pagedBody([]));
      http.expectOne((r) => r.params.get('has_pending') === 'true').flush(pagedBody([]));
      fixture.detectChanges();

      expect(text('[data-testid="confirm-result"]')).toBe('1 vehículo registrado · 1 ya estaban registrados');
      expect(qa('[data-testid="new-table"] tbody tr').length).toBe(1);
    });

    it('«Registrar todos los nuevos» pide confirmar diciendo cuántos y envía all_new', async () => {
      toNew();
      const confirm = spyOn(TestBed.inject(ConfirmService), 'confirm').and.resolveTo(true);

      click('[data-testid="register-all"]');
      await fixture.whenStable();

      expect(confirm.calls.mostRecent().args[0].message).toContain('Se registrarán 2 vehículos nuevos');
      expect(http.expectOne({ method: 'POST', url: `${RUN}/confirm` }).request.body).toEqual({ all_new: true });
    });

    it('si se cancela la confirmación no envía nada', async () => {
      toNew();
      spyOn(TestBed.inject(ConfirmService), 'confirm').and.resolveTo(false);

      click('[data-testid="register-all"]');
      await fixture.whenStable();

      http.expectNone({ method: 'POST', url: `${RUN}/confirm` });
      expect(q('[data-testid="confirm-result"]')).toBeNull();
    });

    it('un error al confirmar se muestra y no pierde la selección', () => {
      toNew();
      click('input[aria-label="Seleccionar AAA111"]');
      click('[data-testid="register-selected"]');
      http.expectOne({ method: 'POST', url: `${RUN}/confirm` }).flush({ error: { code: 'ANALYSIS_NOT_COMPLETED' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(text('[data-testid="confirm-error"]')).toContain('aún no termina');
      expect(q<HTMLButtonElement>('[data-testid="register-selected"]')!.disabled).toBeFalse();
    });

    it('muestra los campos ilegibles bajo la placa y en el detalle', () => {
      open(['ORG_ADMIN'], 'run-1', 'new');
      complete({ NEW: [newFinding('n-1', 'AAA111', { unreadable_fields: ['fuel_type'] })] });

      expect(text('[data-testid="new-table"] [data-testid="unreadable"]')).toBe('Valor ilegible en el archivo: Combustible');
      click('[data-testid="review-one"]');
      expect(text('dialog[data-testid="finding-detail"] [data-testid="unreadable"]')).toBe('Valor ilegible en el archivo: Combustible');
    });

    it('«Revisar individualmente» abre el detalle del hallazgo y permite registrarlo', () => {
      toNew();
      click('[data-testid="review-one"]');

      const dialog = q<HTMLDialogElement>('dialog[data-testid="finding-detail"]')!;
      expect(dialog.open).toBeTrue();
      expect(text('#finding-title')).toBe('AAA111');

      click('[data-testid="register-one"]');
      expect(http.expectOne({ method: 'POST', url: `${RUN}/confirm` }).request.body).toEqual({ finding_ids: ['n-1'] });
    });

    it('«Dejar pendientes» cierra el asistente sin decidir', async () => {
      toNew();
      const closed = jasmine.createSpy('closed');
      fixture.componentInstance.closed.subscribe(closed);

      click('[data-testid="leave-pending"]');
      await new Promise((resolve) => setTimeout(resolve, 25));

      expect(closed).toHaveBeenCalled();
      http.expectNone({ method: 'POST', url: `${RUN}/confirm` });
    });

    it('sin vehicles:manage es de solo lectura con una nota y sin acciones de registro', () => {
      toNew(['ORG_VIEWER']);

      expect(text('[data-testid="read-only"]')).toContain('Solo quien administra');
      expect(q('[data-testid="register-selected"]')).toBeNull();
      expect(q('[data-testid="register-all"]')).toBeNull();
      expect(qa('[data-testid="new-table"] input[type="checkbox"]').every((c) => (c as HTMLInputElement).disabled)).toBeTrue();
      expect(q('[data-testid="review-one"]')).not.toBeNull();
    });

    it('sin nuevos pendientes lo dice', () => {
      open(['ORG_ADMIN'], 'run-1');
      complete();
      click('[data-testid="step-new"]');

      expect(text('[data-testid="new-empty"]')).toBe('No hay vehículos nuevos por decidir.');
    });
  });

  describe('paso 4: información diferente', () => {
    function toConflicts(list: FindingDto[], roles = ['ORG_ADMIN'], extra: Partial<Record<'INCOMPLETE' | 'INVALID', FindingDto[]>> = {}): void {
      open(roles, 'run-1');
      complete({ CONFLICT: list, ...extra });
      click('[data-testid="step-conflicts"]');
    }

    const resolveRequest = (id = 'f-1'): TestRequest => http.expectOne({ method: 'POST', url: `${VEHICLES_ORG_URL}/vehicle-findings/${id}/resolve` });
    const refresh = (): void => {
      http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ data: { registered: 1, pending_new: 0, conflicts: 0, inactive: 0 } });
      http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([]));
      http.expectOne((r) => r.params.get('page_size') === '5').flush(pagedBody([]));
      http.expectOne((r) => r.params.get('has_pending') === 'true').flush(pagedBody([]));
    };

    it('una tarjeta por inconsistencia con la frase armada con los datos y la tabla de diferencias', () => {
      toConflicts([structural]);

      expect(qa('[data-testid="conflict-card"]').length).toBe(1);
      expect(text('[data-testid="sentence"]')).toBe('Esta placa ya está registrada como C2, pero el archivo la identifica como C3. Revisa cuál información es correcta.');
      expect(qa('[data-testid="differences"] thead th').map((th) => th.textContent)).toEqual(['Campo', 'Dato actual', 'Dato recibido', 'Importancia', 'Qué hacer']);
      const row = text('[data-testid="differences"] tbody tr');
      expect(row).toContain('Configuración');
      expect(row).toContain('C2');
      expect(row).toContain('C3');
      expect(row).toContain('Alta');
      expect(row).toContain('KEEP_CURRENT');
      expect(q('[data-testid="differences"] .badge-danger')).not.toBeNull();
    });

    it('un conflicto dentro del archivo muestra cada valor con su número de veces y sus filas', () => {
      toConflicts([findingDto()]);

      expect(text('[data-testid="sentence"]')).toBe('El archivo trae valores distintos para esta placa.');
      const values = qa('[data-testid="in-file"] li').map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
      expect(values).toEqual(['Configuración: C2 · 5 veces (filas 2, 3)', 'Configuración: C3 · 2 veces (filas 9)']);
    });

    it('muestra los campos ilegibles y el aviso de más valores distintos cuando hay desbordamiento', () => {
      toConflicts([findingDto({ unreadable_fields: ['model_year'], in_file_conflicts: [{ field: 'configuration_code', overflow: true, values: [{ value: 'C2', count: 5, rows: [2] }] }] })]);

      expect(text('[data-testid="unreadable"]')).toBe('Valor ilegible en el archivo: Modelo');
      expect(text('[data-testid="overflow"]')).toBe('Hay más valores distintos de los que se muestran');

      TestBed.resetTestingModule();
      toConflicts([findingDto()]);
      expect(q('[data-testid="overflow"]')).toBeNull();
      expect(q('[data-testid="unreadable"]')).toBeNull();
    });

    it('FINDING_STALE: avisa en la tarjeta, ofrece «Actualizar» que recarga los hallazgos y conserva «Mantener información actual»', () => {
      toConflicts([structural]);
      click('[data-testid="keep-current"]');
      resolveRequest().flush({ error: { code: 'FINDING_STALE', details: [{ field: 'configuration_code' }] } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(text('[data-testid="resolve-error"]')).toBe('El vehículo cambió después del análisis. Vuelve a analizar el archivo o revisa los datos actuales.');
      expect(q('[data-testid="keep-current"]')).not.toBeNull();

      click('[data-testid="refresh-findings"]');
      findings('CONFLICT').flush(pagedBody([findingDto({ in_file_conflicts: [], differences: [{ field: 'configuration_code', current: 'C3', incoming: 'C3S3', kind: 'STRUCTURAL', severity: 'HIGH', recommended_action: 'x' }] })]));
      findings('INCOMPLETE').flush(pagedBody([]));
      fixture.detectChanges();

      expect(q('[data-testid="resolve-error"]')).toBeNull();
      expect(q('[data-testid="refresh-findings"]')).toBeNull();
      expect(text('[data-testid="sentence"]')).toContain('registrada como C3');
    });

    it('«Mantener información actual» envía KEEP_CURRENT y deja la tarjeta resuelta, sin acciones', () => {
      toConflicts([structural]);
      click('[data-testid="keep-current"]');

      expect(text('[data-testid="conflict-card"]')).toContain('Se mantuvo la información actual');
      const req = resolveRequest();
      expect(req.request.body).toEqual({ action: 'KEEP_CURRENT' });
      req.flush({ data: findingDto({ decision: 'REJECTED' }) });
      refresh();
      fixture.detectChanges();

      expect(q('[data-testid="keep-current"]')).toBeNull();
      expect(q('[data-testid="conflict-card"]')!.classList).toContain('done');
    });

    it('usar la información del archivo en un campo estructural exige la confirmación específica y la envía', () => {
      toConflicts([structural]);
      const accept = (): HTMLButtonElement => q<HTMLButtonElement>('[data-testid="accept-incoming"]')!;

      expect(accept().disabled).toBeTrue();
      click('[data-testid="confirm-structural"]');
      expect(accept().disabled).toBeFalse();
      click('[data-testid="accept-incoming"]');

      const req = resolveRequest();
      expect(req.request.body).toEqual({ action: 'ACCEPT_INCOMING', confirm_structural: true });
      req.flush({ data: findingDto({ decision: 'CONFIRMED' }) });
      refresh();
      fixture.detectChanges();

      expect(text('[data-testid="conflict-card"]')).toContain('Se usó la información del archivo');
    });

    it('un campo que no es estructural no pide confirmación y envía solo la acción', () => {
      toConflicts([findingDto({ in_file_conflicts: [], differences: [{ field: 'fuel_type', current: 'DIESEL', incoming: 'GASOLINE', kind: 'CHANGEABLE', severity: 'MEDIUM', recommended_action: 'Posible conversión' }] })]);

      expect(q('[data-testid="confirm-structural"]')).toBeNull();
      expect(text('[data-testid="sentence"]')).toContain('Puede ser un cambio real');
      expect(q('[data-testid="differences"] .badge-warning')).not.toBeNull();
      click('[data-testid="accept-incoming"]');

      expect(resolveRequest().request.body).toEqual({ action: 'ACCEPT_INCOMING' });
    });

    it('sin un valor recibido «Usar la información del archivo» queda deshabilitado y lo explica', () => {
      toConflicts([findingDto({ differences: [{ field: 'configuration_code', current: 'C2', incoming: null, kind: 'MISSING', severity: 'INFO', recommended_action: 'x' }] })]);

      expect(q<HTMLButtonElement>('[data-testid="accept-incoming"]')!.disabled).toBeTrue();
      expect(text('[data-testid="why-disabled"]')).toContain('no trae un valor definido');
      expect(q('[data-testid="accept-incoming"]')!.getAttribute('aria-describedby')).toBe(q('[data-testid="why-disabled"]')!.id);
    });

    it('«Dejar pendiente» envía DEFER y la tarjeta conserva sus acciones para decidir después', () => {
      toConflicts([structural]);
      click('[data-testid="defer"]');

      const req = resolveRequest();
      expect(req.request.body).toEqual({ action: 'DEFER' });
      req.flush({ data: findingDto({ decision: 'DEFERRED' }) });
      refresh();
      fixture.detectChanges();

      expect(text('[data-testid="conflict-card"]')).toContain('Pendiente');
      expect(q('[data-testid="keep-current"]')).not.toBeNull();
    });

    it('si el servidor rechaza la decisión se revierte y se muestra el motivo', () => {
      toConflicts([structural]);
      click('[data-testid="keep-current"]');
      resolveRequest().flush({ error: { code: 'FINDING_ALREADY_RESOLVED' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(text('[data-testid="resolve-error"]')).toContain('ya se resolvió con otra decisión');
      expect(q('[data-testid="keep-current"]')).not.toBeNull();
      expect(text('[data-testid="conflict-card"]')).not.toContain('Se mantuvo la información actual');
    });

    it('sin vehicles:manage es de solo lectura', () => {
      toConflicts([structural], ['ORG_VIEWER']);

      expect(text('[data-testid="read-only"]')).toContain('Solo quien administra');
      expect(q('[data-testid="keep-current"]')).toBeNull();
      expect(q('[data-testid="accept-incoming"]')).toBeNull();
      expect(q('[data-testid="differences"]')).not.toBeNull();
    });

    it('sin inconsistencias lo dice', () => {
      toConflicts([]);

      expect(text('[data-testid="conflicts-empty"]')).toContain('no trae información distinta');
    });

    it('los incompletos y los inválidos van en secciones discretas: qué se completaría y el motivo con las filas', () => {
      toConflicts([], ['ORG_ADMIN'], {
        INCOMPLETE: [findingDto({ id: 'i-1', plate: 'CCC333', state: 'INCOMPLETE', in_file_conflicts: [], differences: [{ field: 'fuel_type', current: null, incoming: 'DIESEL', kind: 'MISSING', severity: 'INFO', recommended_action: 'Completar' }] })],
        INVALID: [findingDto({ id: 'x-1', plate: '', plate_original: 'A-1', state: 'INVALID', invalid_reason: 'La placa no tiene un formato válido.', sample_rows: [4, 8], differences: [], in_file_conflicts: [] })],
      });

      expect(q('[data-testid="incomplete-section"]')!.tagName).toBe('DETAILS');
      expect(text('[data-testid="incomplete-card"]')).toContain('Se completaría: Combustible Diésel.');
      expect(text('[data-testid="invalid-card"]')).toContain('A-1');
      expect(text('[data-testid="invalid-card"]')).toContain('La placa no tiene un formato válido.');
      expect(text('[data-testid="invalid-card"]')).toContain('Filas del archivo: 4, 8');

      click('[data-testid="complete"]');
      expect(resolveRequest('i-1').request.body).toEqual({ action: 'ACCEPT_INCOMING' });
    });
  });

  it('el CSS del asistente y de sus pasos usa solo tokens: sin hexadecimales ni rgb()', () => {
    open(['ORG_ADMIN'], 'run-1');
    complete({ NEW: [newFinding('n-1', 'AAA111')], CONFLICT: [structural] });
    click('[data-testid="go-new"]');
    click('[data-testid="review-one"]');
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('dialog.wizard') || c.includes('.card-f') || c.includes('dialog.panel')).join('\n');

    expect(css).toContain('.card-f');
    expect(css).toContain('dialog.wizard');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).withContext(`color-mix ${m[1]}%`).toContain(Number(m[1]));
  });
});
