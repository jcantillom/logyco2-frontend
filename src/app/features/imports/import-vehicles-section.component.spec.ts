import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, candidateDto, changedCandidateDto, importDetailDto, vehiclesDetectedDto } from '../../../testing/imports';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { pagedBody } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { ImportVehiclesSectionComponent } from './import-vehicles-section.component';

const VEHICLES = `${IMPORTS_URL}/imp-1/vehicles`;
const DECISIONS = `${VEHICLES}/decisions`;

describe('ImportVehiclesSectionComponent: vehículos detectados', () => {
  let fixture: ComponentFixture<ImportVehiclesSectionComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = <T extends HTMLElement = HTMLElement>(selector: string): T[] => Array.from(el().querySelectorAll<T>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const kindRequest = (kind: string) => http.expectOne((r) => r.url === VEHICLES && r.params.get('kind') === kind);

  function render(options: { roles?: string[]; counts?: Parameters<typeof vehiclesDetectedDto>[0]; items?: unknown[]; flush?: boolean } = {}): void {
    TestBed.configureTestingModule({ imports: [ImportVehiclesSectionComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, options.roles ?? ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ImportVehiclesSectionComponent);
    const counts = vehiclesDetectedDto(options.counts);
    fixture.componentRef.setInput('importId', 'imp-1');
    fixture.componentRef.setInput('counts', { new: counts.new, changed: counts.changed, unchanged: counts.unchanged, pendingDecision: counts.pending_decision });
    fixture.detectChanges();

    if (options.flush !== false) {
      kindRequest(options.counts && options.counts.new === 0 && (options.counts.changed ?? 1) > 0 ? 'CHANGED' : 'NEW').flush(pagedBody(options.items ?? [candidateDto(), candidateDto({ id: 'cand-3', plate: 'DEF456', plate_original: 'DEF456', proposed: { configuration_code: null, model_year: null, fuel_type: null, vehicle_type: 'Tractocamión' } })]));
      fixture.detectChanges();
    }
  }

  /** Atiende lo que sigue a una decisión: lista, detalle de la carga e historial. */
  function flushRefresh(kind = 'NEW'): void {
    kindRequest(kind).flush(pagedBody([]));
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` }).flush({ data: importDetailDto({ vehicles_detected: vehiclesDetectedDto({ new: 0 }) }) });
    http.expectOne((r) => r.url === IMPORTS_URL && r.method === 'GET').flush(pagedBody([]));
    fixture.detectChanges();
  }

  afterEach(() => http?.match(() => true));

  it('muestra las pestañas con sus conteos, el contador de sin cambios y la lista paginada de nuevos', () => {
    render();

    expect(qa('[role="tab"]').map((t) => t.textContent!.trim())).toEqual(['Nuevos (2)', 'Con cambios (1)']);
    expect(q('[data-testid="tab-NEW"]')!.getAttribute('aria-selected')).toBe('true');
    expect(text('[data-testid="unchanged-count"]')).toBe('5 vehículos sin cambios');
    const rows = qa('[data-testid="candidate"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('ABC123');
    expect(rows[0].textContent).toContain('Como llegó: abc 123');
    expect(rows[0].textContent).toContain('C3');
    expect(rows[0].textContent).toContain('2019');
    expect(rows[0].textContent).toContain('Diésel');
    expect(rows[0].textContent).not.toContain('DIESEL');
    expect(rows[0].textContent).toContain('Filas del archivo');
    expect(rows[0].textContent).toContain('12');
    expect(rows[1].textContent).toContain('Tractocamión');
    expect(rows[1].textContent).toContain('—');
  });

  it('la pestaña «Con cambios» pide kind=CHANGED y cada campo muestra «antes → después» con etiquetas del servidor', () => {
    render();

    q<HTMLButtonElement>('[data-testid="tab-CHANGED"]')!.click();
    fixture.detectChanges();
    kindRequest('CHANGED').flush(pagedBody([changedCandidateDto()]));
    fixture.detectChanges();

    const diff = qa('[data-testid="changes"] li').map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(diff).toEqual(['Combustible:GasolinaDiésel', 'Modelo:20152016']);
    expect(q('[data-testid="tab-CHANGED"]')!.getAttribute('aria-selected')).toBe('true');
    expect(text('[data-testid="accept"]')).toBe('Actualizar');
  });

  it('con 0 nuevos y cambios abre directamente «Con cambios»', () => {
    render({ counts: { new: 0, changed: 2 }, items: [changedCandidateDto()] });

    expect(q('[data-testid="tab-CHANGED"]')!.getAttribute('aria-selected')).toBe('true');
    expect(text('[data-testid="decide-all"]')).toBe('Actualizar todos');
  });

  it('las flechas pasan de una pestaña a la otra', () => {
    render();

    q('[data-testid="tab-NEW"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    kindRequest('CHANGED').flush(pagedBody([changedCandidateDto()]));
    expect(q('[data-testid="tab-CHANGED"]')!.getAttribute('aria-selected')).toBe('true');
  });

  it('explica los conflictos, indica el inactivo y muestra la decisión ya tomada sin botones', () => {
    render({
      items: [
        candidateDto({ conflicts: [{ field: 'fuel_type', label: 'Combustible' }], inactive: true }),
        candidateDto({ id: 'cand-3', plate: 'DEF456', decision: 'ACCEPTED' }),
        candidateDto({ id: 'cand-4', plate: 'GHI789', decision: 'REJECTED' }),
      ],
    });

    const rows = qa('[data-testid="candidate"]');
    expect(rows[0].querySelector('[data-testid="conflict"]')!.textContent).toBe('El archivo trae valores distintos para Combustible. Revisa este vehículo para mantener limpio tu inventario; tus viajes se calculan igual con los datos de cada fila.');
    expect(rows[0].querySelector('[data-testid="conflict"]')!.textContent).not.toMatch(/bloque|no se calcula|impide/i);
    expect(rows[0].querySelector('[data-testid="inactive"]')).not.toBeNull();
    expect(rows[0].querySelector('[data-testid="inactive-note"]')!.textContent).toContain('no lo reactiva');
    expect(rows[1].querySelector('[data-testid="decision"]')!.textContent!.trim()).toBe('Aprobado');
    expect(rows[2].querySelector('[data-testid="decision"]')!.textContent!.trim()).toBe('Omitido');
    expect(rows[1].querySelector('[data-testid="accept"]')).toBeNull();
    expect(rows[2].querySelector('[data-testid="reject"]')).toBeNull();
    expect(rows[0].querySelector('[data-testid="accept"]')).not.toBeNull();
  });

  it('quien no tiene vehicles:manage ve la lista y la nota, sin botones', () => {
    render({ roles: ['ORG_ANALYST'] });

    expect(text('[data-testid="admin-note"]')).toBe('Un administrador debe aprobar estos vehículos.');
    expect(qa('[data-testid="candidate"]').length).toBe(2);
    expect(q('[data-testid="accept"]')).toBeNull();
    expect(q('[data-testid="reject"]')).toBeNull();
    expect(q('[data-testid="decide-all"]')).toBeNull();
  });

  it('quien administra no ve la nota y ve los botones por fila', () => {
    render();

    expect(q('[data-testid="admin-note"]')).toBeNull();
    expect(qa('[data-testid="accept"]').map((b) => b.textContent!.trim())).toEqual(['Registrar', 'Registrar']);
    expect(qa('[data-testid="reject"]').length).toBe(2);
  });

  it('«Registrar» una fila envía ACCEPT con su id, muestra el resultado y refresca lista, detalle e historial', () => {
    render();

    qa('[data-testid="accept"]')[0].click();
    const req = http.expectOne({ method: 'POST', url: DECISIONS });
    expect(req.request.body).toEqual({ decision: 'ACCEPT', candidate_ids: ['cand-1'] });
    req.flush({ data: { accepted: 1, rejected: 0, skipped: 0, skipped_reasons: [] } });
    fixture.detectChanges();

    expect(text('[data-testid="decision-result"]')).toBe('1 aprobado · 0 omitidos · 0 sin aplicar');
    flushRefresh();
  });

  it('«Omitir» una fila envía REJECT con su id', () => {
    render();

    qa('[data-testid="reject"]')[1].click();
    const req = http.expectOne({ method: 'POST', url: DECISIONS });
    expect(req.request.body).toEqual({ decision: 'REJECT', candidate_ids: ['cand-3'] });
    req.flush({ data: { accepted: 0, rejected: 1, skipped: 0, skipped_reasons: [] } });
    flushRefresh();
  });

  it('el resultado lista los motivos de lo no aplicado', () => {
    render();

    qa('[data-testid="accept"]')[0].click();
    http.expectOne({ method: 'POST', url: DECISIONS }).flush({ data: { accepted: 0, rejected: 0, skipped: 3, skipped_reasons: [{ code: 'ALREADY_REGISTERED', rows: 2 }, { code: 'ALGO_NUEVO', rows: 1 }] } });
    fixture.detectChanges();

    expect(qa('[data-testid="skipped-reasons"] li').map((li) => li.textContent!.trim())).toEqual(['La placa ya estaba registrada: 2', 'Otro motivo: 1']);
    flushRefresh();
  });

  it('«Registrar todos los nuevos» confirma antes y luego envía kind=NEW sin candidate_ids', async () => {
    render();
    const confirm = spyOn(TestBed.inject(ConfirmService), 'confirm').and.resolveTo(true);

    q<HTMLButtonElement>('[data-testid="decide-all"]')!.click();
    await fixture.whenStable();

    expect(confirm).toHaveBeenCalledWith(jasmine.objectContaining({ title: 'Registrar vehículos nuevos', message: 'Se registrarán 2 vehículos nuevos en tu empresa. ¿Continuar?' }));
    const req = http.expectOne({ method: 'POST', url: DECISIONS });
    expect(req.request.body).toEqual({ decision: 'ACCEPT', kind: 'NEW' });
    req.flush({ data: { accepted: 2, rejected: 0, skipped: 0, skipped_reasons: [] } });
    flushRefresh();
  });

  it('si se cancela la confirmación no se envía nada', async () => {
    render();
    spyOn(TestBed.inject(ConfirmService), 'confirm').and.resolveTo(false);

    q<HTMLButtonElement>('[data-testid="decide-all"]')!.click();
    await fixture.whenStable();

    http.expectNone({ method: 'POST', url: DECISIONS });
  });

  it('«Actualizar todos» confirma y envía kind=CHANGED', async () => {
    render();
    q<HTMLButtonElement>('[data-testid="tab-CHANGED"]')!.click();
    fixture.detectChanges();
    kindRequest('CHANGED').flush(pagedBody([changedCandidateDto()]));
    fixture.detectChanges();
    const confirm = spyOn(TestBed.inject(ConfirmService), 'confirm').and.resolveTo(true);

    q<HTMLButtonElement>('[data-testid="decide-all"]')!.click();
    await fixture.whenStable();

    expect(confirm).toHaveBeenCalledWith(jasmine.objectContaining({ message: 'Se actualizarán 1 vehículo con los datos del archivo. ¿Continuar?' }));
    expect(http.expectOne({ method: 'POST', url: DECISIONS }).request.body).toEqual({ decision: 'ACCEPT', kind: 'CHANGED' });
  });

  it('un error al decidir se muestra con el mensaje del catálogo y los botones vuelven a estar disponibles', () => {
    render();

    qa('[data-testid="accept"]')[0].click();
    fixture.detectChanges();
    expect(qa<HTMLButtonElement>('[data-testid="accept"]').every((b) => b.disabled)).toBeTrue();
    http.expectOne({ method: 'POST', url: DECISIONS }).flush({ error: { code: 'IMPORT_NOT_REVIEWED' } }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(q('[data-testid="decision-error"]')!.getAttribute('role')).toBe('alert');
    expect(text('[data-testid="decision-error"]')).toContain('revisión de esta carga aún no termina');
    expect(qa<HTMLButtonElement>('[data-testid="accept"]').every((b) => !b.disabled)).toBeTrue();
  });

  it('una pestaña sin vehículos dice que no hay y no ofrece acciones en lote', () => {
    render({ counts: { new: 0, changed: 0 }, items: [] });

    expect(text('[data-testid="vehicles-empty"]')).toContain('no trae vehículos');
    expect(q('[data-testid="decide-all"]')).toBeNull();
  });

  it('mientras carga muestra un estado de carga y si falla, el error con reintento', () => {
    render({ flush: false });
    expect(q('[role="status"][aria-busy="true"]')).not.toBeNull();

    kindRequest('NEW').flush({ error: { code: 'SERVICE_UNAVAILABLE' } }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(q('[role="alert"]')).not.toBeNull();

    q<HTMLButtonElement>('.alert .btn')!.click();
    kindRequest('NEW').flush(pagedBody([candidateDto()]));
    fixture.detectChanges();
    expect(qa('[data-testid="candidate"]').length).toBe(1);
  });

  it('pagina: «Siguiente» pide la página 2 del mismo tipo', () => {
    render({ items: [candidateDto()] });
    // Se reemplaza la lista por una página con más resultados.
    q<HTMLButtonElement>('[data-testid="tab-CHANGED"]')!.click();
    fixture.detectChanges();
    kindRequest('CHANGED').flush(pagedBody([changedCandidateDto()], 25, 10, 1));
    fixture.detectChanges();

    qa('app-pagination button').find((b) => b.textContent!.includes('Siguiente'))!.click();

    const next = http.expectOne((r) => r.url === VEHICLES && r.params.get('kind') === 'CHANGED' && r.params.get('page') === '2');
    expect(next.request.params.get('page_size')).toBe('10');
  });

  it('con más de 500 pendientes decide por kind en UNA sola petición, sin reunir ids, y muestra el avance en el botón', async () => {
    render({ counts: { new: 1926, changed: 0 } });
    spyOn(TestBed.inject(ConfirmService), 'confirm').and.resolveTo(true);

    q<HTMLButtonElement>('[data-testid="decide-all"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text('[data-testid="decide-all"]')).toBe('Registrando 1.926…');
    expect(q<HTMLButtonElement>('[data-testid="decide-all"]')!.disabled).toBeTrue();
    http.expectNone((r) => r.url === VEHICLES);
    const one = http.expectOne({ method: 'POST', url: DECISIONS });
    expect(one.request.body).toEqual({ decision: 'ACCEPT', kind: 'NEW' });
    one.flush({ data: { accepted: 1924, rejected: 0, skipped: 2, skipped_reasons: [{ code: 'ALREADY_REGISTERED', rows: 2 }], remaining: 0 } });
    fixture.detectChanges();

    expect(text('[data-testid="decision-result"]')).toContain('1924 aprobados · 0 omitidos · 2 sin aplicar');
    flushRefresh();
  });

  it('si falla la decisión masiva recarga la lista y la carga, y dice que se puede reintentar sin repetir lo hecho', async () => {
    render({ counts: { new: 1926, changed: 0 } });
    spyOn(TestBed.inject(ConfirmService), 'confirm').and.resolveTo(true);

    q<HTMLButtonElement>('[data-testid="decide-all"]')!.click();
    await fixture.whenStable();
    http.expectOne({ method: 'POST', url: DECISIONS }).flush({ error: { code: 'INTERNAL', message: 'Falló' } }, { status: 500, statusText: 'Server Error' });
    flushRefresh();

    expect(text('[data-testid="decision-error"]')).toContain('Reintenta para completar lo que falte');
    expect(q<HTMLButtonElement>('[data-testid="decide-all"]')!.disabled).toBeFalse();
  });

  it('la lista siempre se pide de 10 en 10: nunca hay miles de filas en el DOM', () => {
    render({ counts: { new: 1926, changed: 0 }, flush: false });

    expect(kindRequest('NEW').request.params.get('page_size')).toBe('10');
  });

  it('el motivo NO_CHANGES se rotula en español', () => {
    render();

    qa('[data-testid="accept"]')[0].click();
    http.expectOne({ method: 'POST', url: DECISIONS }).flush({ data: { accepted: 0, rejected: 0, skipped: 1, skipped_reasons: [{ code: 'NO_CHANGES', rows: 1 }] } });
    fixture.detectChanges();

    expect(text('[data-testid="skipped-reasons"]')).toBe('No tenían cambios: 1');
  });
});
