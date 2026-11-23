import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { CompanyLinksComponent } from './company-links.component';

const API = 'http://api.test/api/v1';
const ORG = `${API}/organizations/${ORG_ENVIA.id}`;
const paged = (items: unknown[], total = items.length, pageSize = 10) => ({
  data: items,
  meta: { pagination: { page: 1, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)), has_next: total > pageSize, has_previous: false } },
});
const link = (id: string, over: Record<string, unknown> = {}) => ({
  id, status: 'ACTIVE', relationship_type: 'TRANSPORT_SERVICE', our_role: 'PROVIDER', direction: 'SENT',
  counterpart: { id: `c-${id}`, name: `Cliente ${id}`, legal_name: `Cliente ${id} S.A.S.`, tax_id: '900123456-7', types: [{ code: 'SHIPPER', name: 'Generador de carga' }], is_active: true },
  requested_by_organization: 'ENVIA', request_note: null, response_note: null, end_reason: null, start_date: '2026-03-01', end_date: null,
  created_at: '2026-02-01T10:00:00Z', responded_at: '2026-03-01T10:00:00Z', ended_at: null,
  can_accept: false, can_reject: false, can_cancel: false, can_end: true, ...over,
});
const pending = (id: string, over: Record<string, unknown> = {}) => link(id, { status: 'PENDING', responded_at: null, start_date: null, can_end: false, ...over });
const SUMMARY = { data: { active: 2, pending_received: 1, pending_sent: 3, external: 4 } };
const external = (id: string, over: Record<string, unknown> = {}) => ({
  id, name: `Externa ${id}`, tax_id: '700111222-1', counterpart_type: 'CARRIER', country: 'CO', relationship_type: 'SUBCONTRACTING', our_role: 'CONTRACTOR', note: null,
  is_active: true, created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z', ...over,
});

describe('CompanyLinksComponent: Empresas vinculadas', () => {
  let fixture: ComponentFixture<CompanyLinksComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = (selector: string): HTMLElement | null => el().querySelector(selector);

  function render(roles = ['ORG_ADMIN'], query = ''): void {
    TestBed.configureTestingModule({
      imports: [CompanyLinksComponent],
      providers: [...provideTestApp(), { provide: 'noop', useValue: null }],
    });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    void query;
    fixture = TestBed.createComponent(CompanyLinksComponent);
    fixture.detectChanges();
  }

  const listRequest = (view: string): TestRequest => http.expectOne((r) => r.url === `${ORG}/links` && r.params.get('view') === view);

  function init(items: unknown[] = [], roles = ['ORG_ADMIN']): void {
    render(roles);
    http.expectOne(`${ORG}/links/summary`).flush(SUMMARY);
    listRequest('active').flush(paged(items));
    fixture.detectChanges();
  }

  const click = (selector: string): void => {
    (q(selector) as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  it('muestra los 4 conteos reales del backend y las subpestañas', () => {
    init([link('1')]);

    const tiles = Array.from(el().querySelectorAll('[data-testid="link-tiles"] .tile')).map((t) => t.textContent!.replace(/\s+/g, ' ').trim());
    expect(tiles).toEqual(['2Empresas vinculadas activas', '1Solicitudes recibidas pendientes', '3Solicitudes enviadas pendientes', '4Contrapartes externas']);
    expect(Array.from(el().querySelectorAll('[role=tab]')).map((t) => t.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Vinculadas', 'Solicitudes 1', 'Contrapartes externas']);
    expect(el().textContent).toContain('Gestiona las empresas con las que compartes operaciones logísticas o servicios de transporte.');
  });

  it('en «Vinculadas» muestra la conciliación de viajes con sus permisos y no en «Solicitudes»', () => {
    init([link('1')]);
    http.expectOne(`${ORG}/reconciliation/links`).flush({ data: [{ relationship_id: 'r1', status: 'ACTIVE', relationship_type: 'TRANSPORT_SERVICE', our_role: 'CONTRACTOR', counterpart: { id: 'c-1', name: 'Cliente 1' }, my_consent: { matching_enabled: false, share_results: false, updated_at: null }, counterpart_consent: { matching_enabled: false, share_results: false }, matching_active: false, results_shared: false, can_scan: false }] });
    fixture.detectChanges();

    expect(q('[data-testid="recon-section"]')).not.toBeNull();
    expect(q('[data-testid="switch-matching"]')).not.toBeNull();

    click('[data-testid="sub-requests"]');
    http.match((r) => r.url === `${ORG}/links`);

    expect(q('[data-testid="recon-section"]')).toBeNull();
  });

  it('lista las vinculadas con empresa, tipo, nuestra relación y estado', () => {
    init([link('1'), link('2', { our_role: 'CONTRACTOR', relationship_type: 'SUBCONTRACTING' })]);

    const rows = Array.from(el().querySelectorAll('[data-testid="links-table"] tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('Cliente 1');
    expect(rows[0]).toContain('Generador de carga');
    expect(rows[0]).toContain('Prestamos el transporte');
    expect(rows[0]).toContain('Vigente');
    expect(rows[1]).toContain('Subcontratación');
    expect(rows[1]).toContain('Subcontratamos');
    expect(rows[0]).toContain('Finalizar');
  });

  it('sin vinculadas muestra un estado vacío discreto', () => {
    init([]);
    expect(q('[data-testid="links-empty"]')!.textContent).toContain('Aún no tienes empresas vinculadas');
  });

  it('quien solo consulta no ve acciones de gestión', () => {
    init([link('1')], ['ORG_ANALYST']);

    expect(q('[data-testid="link-new"]')).toBeNull();
    expect(el().textContent).not.toContain('Finalizar');
    expect(el().textContent).toContain('Ver detalle');
  });

  it('Solicitudes: recibidas con Aceptar/Rechazar, enviadas con Cancelar y acciones solo según el estado', () => {
    init();
    click('[data-testid="sub-requests"]');
    listRequest('received').flush(paged([pending('r1', { direction: 'RECEIVED', can_accept: true, can_reject: true, our_role: 'CONTRACTOR' })]));
    fixture.detectChanges();

    let buttons = Array.from(el().querySelectorAll('[data-testid="links-table"] tbody button')).map((b) => b.textContent!.trim());
    expect(buttons).toEqual(['Aceptar', 'Rechazar', 'Ver detalle']);
    expect(el().querySelector('[data-testid="links-table"] tbody')!.textContent).toContain('Pendiente · recibida');

    click('[data-testid="view-sent"]');
    listRequest('sent').flush(paged([pending('s1', { can_cancel: true })]));
    fixture.detectChanges();
    buttons = Array.from(el().querySelectorAll('[data-testid="links-table"] tbody button')).map((b) => b.textContent!.trim());
    expect(buttons).toEqual(['Cancelar', 'Ver detalle']);

    click('[data-testid="view-history"]');
    listRequest('history').flush(paged([link('h1', { status: 'REJECTED', can_end: false })]));
    fixture.detectChanges();
    buttons = Array.from(el().querySelectorAll('[data-testid="links-table"] tbody button')).map((b) => b.textContent!.trim());
    expect(buttons).toEqual(['Ver detalle']); // un vínculo rechazado no ofrece acciones
  });

  it('aceptar pide confirmación, llama a /accept y refresca conteos y lista', async () => {
    init();
    click('[data-testid="sub-requests"]');
    listRequest('received').flush(paged([pending('r1', { direction: 'RECEIVED', can_accept: true, can_reject: true })]));
    fixture.detectChanges();

    const accept = Array.from(el().querySelectorAll<HTMLButtonElement>('[data-testid="links-table"] tbody button')).find((b) => b.textContent!.trim() === 'Aceptar')!;
    accept.click();
    await fixture.whenStable();
    http.expectNone(`${ORG}/links/r1/accept`); // todavía no: falta confirmar
    TestBed.inject(ConfirmService).pending()!.resolve(true);
    await fixture.whenStable();

    const request = http.expectOne(`${ORG}/links/r1/accept`);
    expect(request.request.method).toBe('POST');
    request.flush({ data: link('r1') });
    http.expectOne(`${ORG}/links/summary`).flush({ data: { active: 3, pending_received: 0, pending_sent: 3, external: 4 } });
    listRequest('received').flush(paged([]));
    fixture.detectChanges();

    expect(q('[data-testid="links-empty"]')).not.toBeNull();
  });

  it('cancelar la confirmación no envía nada', async () => {
    init();
    click('[data-testid="sub-requests"]');
    listRequest('received').flush(paged([pending('r1', { direction: 'RECEIVED', can_accept: true, can_reject: true })]));
    fixture.detectChanges();

    (Array.from(el().querySelectorAll<HTMLButtonElement>('[data-testid="links-table"] tbody button')).find((b) => b.textContent!.trim() === 'Rechazar')!).click();
    await fixture.whenStable();
    TestBed.inject(ConfirmService).pending()!.resolve(false);
    await fixture.whenStable();

    http.expectNone(`${ORG}/links/r1/reject`);
  });

  it('el detalle muestra el historial y las acciones permitidas con motivo opcional', () => {
    init([link('1')]);
    click('[data-testid="links-table"] tbody button:last-of-type');
    http.expectOne(`${ORG}/links/1`).flush({
      data: { ...link('1'), events: [
        { at: '2026-02-01T10:00:00Z', action: 'REQUESTED', by_organization: 'ENVIA', actor_name: 'Ana Prueba' },
        { at: '2026-03-01T10:00:00Z', action: 'ACCEPTED', by_organization: 'Cliente 1', actor_name: null },
      ] },
    });
    fixture.detectChanges();

    const detail = q('[data-testid="link-detail"]')!.textContent!;
    expect(detail).toContain('Cliente 1');
    expect(detail).toContain('Prestamos el transporte');
    expect(detail).toContain('Iniciada por');
    const events = Array.from(el().querySelectorAll('[data-testid="link-events"] li')).map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(events[0]).toContain('Solicitud enviada');
    expect(events[0]).toContain('Ana Prueba');
    expect(events[1]).toContain('Solicitud aceptada');
    expect(events[1]).not.toContain('Ana');
    expect(el().querySelector('.dr-foot')!.textContent).toContain('Finalizar vínculo');
    expect(el().querySelector('#det-note')).not.toBeNull();
  });

  it('el detalle se cierra con un clic fuera del panel y con el botón Cerrar', () => {
    init([link('1')]);
    click('[data-testid="links-table"] tbody button:last-of-type');
    http.expectOne(`${ORG}/links/1`).flush({ data: { ...link('1'), events: [] } });
    fixture.detectChanges();
    const drawer = q('dialog.drawer') as HTMLDialogElement;
    expect(drawer.open).toBeTrue();

    drawer.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 2, clientY: 2 })); // el fondo oscurecido
    expect(drawer.open).toBeFalse();

    click('[data-testid="links-table"] tbody button:last-of-type');
    http.expectOne(`${ORG}/links/1`).flush({ data: { ...link('1'), events: [] } });
    fixture.detectChanges();
    (q('.dr-x') as HTMLButtonElement).click();
    expect(drawer.open).toBeFalse();
  });

  // ------------------------------------------------------------------ vincular empresa

  function openRequest(): void {
    init();
    click('[data-testid="link-new"]');
  }

  it('Paso 1: ofrece buscar una empresa registrada o registrar una contraparte externa', () => {
    openRequest();

    expect(q('#req-title')!.textContent).toContain('Vincular empresa');
    expect(el().querySelector('dialog .dp-head p')!.textContent).toContain('¿La empresa está registrada en LoGyCO₂?');
    expect(q('[data-testid="mode-registered"]')!.textContent).toContain('Buscar empresa registrada');
    expect(q('[data-testid="mode-external"]')!.textContent).toContain('Registrar contraparte externa');
    expect(q('[data-testid="rq-submit"]')).toBeNull(); // aún no hay nada que enviar
  });

  it('antes de buscar no hay marcadores de carga ni resultados: solo el buscador', () => {
    openRequest();
    click('[data-testid="mode-registered"]');

    expect(q('dialog.dialog .skeleton')).toBeNull();
    expect(q('dialog.dialog [aria-busy="true"]')).toBeNull();
    expect(q('[data-testid="rq-none"]')).toBeNull();
    expect(q('#rq-search')).not.toBeNull();
  });

  it('busca (mínimo 3 caracteres), marca las ya relacionadas y envía la solicitud con el rol elegido', () => {
    openRequest();
    click('[data-testid="mode-registered"]');
    const input = q('#rq-search') as HTMLInputElement;
    input.value = 'ab';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect((q('[data-testid="rq-find"]') as HTMLButtonElement).disabled).toBeTrue();

    input.value = 'Transp';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click('[data-testid="rq-find"]');
    const search = http.expectOne((r) => r.url === `${ORG}/links/candidates`);
    expect(search.request.params.get('q')).toBe('Transp');
    search.flush({ data: [
      { id: 'o1', name: 'Transportes Uno', legal_name: null, tax_id: '•••567', types: [{ code: 'CARRIER', name: 'Transportador' }], relation: 'NONE', link_id: null },
      { id: 'o2', name: 'Transportes Dos', legal_name: null, tax_id: null, types: [], relation: 'PENDING_SENT', link_id: 'x' },
    ] });
    fixture.detectChanges();

    expect((q('[data-testid="hit-o2"]') as HTMLButtonElement).disabled).toBeTrue();
    expect(q('[data-testid="hit-o2"]')!.textContent).toContain('Solicitud enviada');
    click('[data-testid="hit-o1"]');
    expect(q('[data-testid="picked"]')!.textContent).toContain('Transportes Uno');

    (el().querySelector('input[value="CONTRACTOR"]') as HTMLInputElement).click();
    const note = q('#rq-note') as HTMLTextAreaElement;
    note.value = 'Contrato marco';
    note.dispatchEvent(new Event('input'));
    (q('dialog form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    const post = http.expectOne(`${ORG}/links`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ counterpart_organization_id: 'o1', relationship_type: 'TRANSPORT_SERVICE', our_role: 'CONTRACTOR', note: 'Contrato marco' });
    post.flush({ data: pending('n1', { can_cancel: true }) });
    http.expectOne(`${ORG}/links/summary`).flush(SUMMARY);
    listRequest('active').flush(paged([]));
    fixture.detectChanges();

    expect((q('dialog.dialog') as HTMLDialogElement).open).toBeFalse();
  });

  it('una búsqueda sin resultados sugiere registrarla como contraparte externa', () => {
    openRequest();
    click('[data-testid="mode-registered"]');
    (q('#rq-search') as HTMLInputElement).value = 'Nadie';
    (q('#rq-search') as HTMLInputElement).dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click('[data-testid="rq-find"]');
    http.expectOne((r) => r.url === `${ORG}/links/candidates`).flush({ data: [] });
    fixture.detectChanges();

    expect(q('[data-testid="rq-none"]')!.textContent).toContain('contraparte externa');
  });

  it('sin elegir una empresa no se envía nada', () => {
    openRequest();
    click('[data-testid="mode-registered"]');
    (q('dialog form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    http.expectNone(`${ORG}/links`);
  });

  it('una solicitud inversa pendiente se explica dentro del diálogo y lleva a la solicitud existente, sin perder lo escrito', () => {
    openRequest();
    click('[data-testid="mode-registered"]');
    (q('#rq-search') as HTMLInputElement).value = 'Transp';
    (q('#rq-search') as HTMLInputElement).dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click('[data-testid="rq-find"]');
    http.expectOne((r) => r.url === `${ORG}/links/candidates`).flush({ data: [{ id: 'o1', name: 'Transportes Uno', legal_name: null, tax_id: null, types: [], relation: 'NONE', link_id: null }] });
    fixture.detectChanges();
    click('[data-testid="hit-o1"]');
    (q('#rq-note') as HTMLTextAreaElement).value = 'Mi nota';
    (q('#rq-note') as HTMLTextAreaElement).dispatchEvent(new Event('input'));
    (q('dialog form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    http.expectOne(`${ORG}/links`).flush(
      { error: { code: 'LINK_INVERSE_PENDING', message: 'x', details: [{ field: 'link_id', message: 'abc-123' }] } },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(q('[data-testid="link-conflict"]')!.textContent).toContain('ya te envió una solicitud');
    expect((q('#rq-note') as HTMLTextAreaElement).value).toBe('Mi nota'); // no se pierde lo escrito
    expect((q('dialog.dialog') as HTMLDialogElement).open).toBeTrue();

    click('[data-testid="link-conflict"] button');
    http.expectOne((r) => r.url === `${ORG}/links` && r.params.get('view') === 'received').flush(paged([]));
    http.expectOne(`${ORG}/links/abc-123`).flush({ data: { ...pending('abc-123', { direction: 'RECEIVED', can_accept: true, can_reject: true }), events: [] } });
    fixture.detectChanges();

    expect(q('#det-title')!.textContent).toContain('Cliente abc-123');
    expect(q('[data-testid="link-detail"]')).not.toBeNull();
  });

  it('no permite el doble envío mientras se procesa', () => {
    openRequest();
    click('[data-testid="mode-registered"]');
    (q('#rq-search') as HTMLInputElement).value = 'Transp';
    (q('#rq-search') as HTMLInputElement).dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click('[data-testid="rq-find"]');
    http.expectOne((r) => r.url === `${ORG}/links/candidates`).flush({ data: [{ id: 'o1', name: 'Transportes Uno', legal_name: null, tax_id: null, types: [], relation: 'NONE', link_id: null }] });
    fixture.detectChanges();
    click('[data-testid="hit-o1"]');
    const form = q('dialog form') as HTMLFormElement;

    form.dispatchEvent(new Event('submit'));
    form.dispatchEvent(new Event('submit'));
    form.dispatchEvent(new Event('submit'));

    expect(http.match(`${ORG}/links`).length).toBe(1);
  });

  // ------------------------------------------------------------------ contrapartes externas

  function openExternal(): void {
    init();
    click('[data-testid="sub-external"]');
    http.expectOne((r) => r.url === `${ORG}/external-counterparts`).flush(paged([external('e1')]));
    fixture.detectChanges();
  }

  it('lista las contrapartes externas como «Externa / No registrada», sin acción de activar cuenta', () => {
    openExternal();

    const row = q('[data-testid="ext-table"] tbody tr')!.textContent!.replace(/\s+/g, ' ');
    expect(row).toContain('Externa e1');
    expect(row).toContain('Transportador');
    expect(row).toContain('Colombia');
    expect(row).toContain('Externa / No registrada');
    expect(el().textContent).not.toMatch(/Activar cuenta|Invitar/);
  });

  it('registra una contraparte externa: valida el nombre y envía el cuerpo esperado', () => {
    openExternal();
    click('[data-testid="ext-new"]');
    expect(el().querySelector('dialog .dp-head p')!.textContent).toContain('Contraparte externa');
    const form = q('dialog form') as HTMLFormElement;

    form.dispatchEvent(new Event('submit')); // sin nombre
    fixture.detectChanges();
    http.expectNone(`${ORG}/external-counterparts`);
    expect(el().querySelector('dialog .field-error')!.textContent).toContain('obligatorio');

    (q('#ex-name') as HTMLInputElement).value = '  Transportes Lejanos  ';
    (q('#ex-name') as HTMLInputElement).dispatchEvent(new Event('input'));
    (q('#ex-tax') as HTMLInputElement).value = '901.222.333-4';
    (q('#ex-tax') as HTMLInputElement).dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));

    const post = http.expectOne((r) => r.method === 'POST' && r.url === `${ORG}/external-counterparts`);
    expect(post.request.body).toEqual({ name: 'Transportes Lejanos', tax_id: '901.222.333-4', counterpart_type: 'CARRIER', country: 'CO', relationship_type: 'TRANSPORT_SERVICE', our_role: 'PROVIDER', note: null });
    post.flush({ data: external('e2') });
    http.expectOne(`${ORG}/links/summary`).flush(SUMMARY);
    http.expectOne((r) => r.method === 'GET' && r.url === `${ORG}/external-counterparts`).flush(paged([external('e1'), external('e2')]));
    fixture.detectChanges();

    expect(el().querySelectorAll('[data-testid="ext-table"] tbody tr').length).toBe(2);
  });

  it('si el NIT ya es de una empresa registrada propone vincularla en lugar de duplicarla', () => {
    openExternal();
    click('[data-testid="ext-new"]');
    (q('#ex-name') as HTMLInputElement).value = 'Ya registrada';
    (q('#ex-name') as HTMLInputElement).dispatchEvent(new Event('input'));
    (q('#ex-tax') as HTMLInputElement).value = '800555666-7';
    (q('#ex-tax') as HTMLInputElement).dispatchEvent(new Event('input'));
    (q('dialog form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    http.expectOne((r) => r.method === 'POST' && r.url === `${ORG}/external-counterparts`).flush(
      { error: { code: 'COUNTERPART_REGISTERED', message: 'x', details: [{ field: 'organization_id', message: 'org-1' }] } },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(q('[data-testid="link-conflict"]')!.textContent).toContain('ya está registrada en LoGyCO₂');
    click('[data-testid="link-conflict"] button');
    const search = http.expectOne((r) => r.url === `${ORG}/links/candidates`);
    expect(search.request.params.get('q')).toBe('800555666-7'); // lleva a buscarla por su NIT
    search.flush({ data: [] });
  });

  it('quitar una contraparte pide confirmación y la desactiva (DELETE)', async () => {
    openExternal();
    (Array.from(el().querySelectorAll<HTMLButtonElement>('[data-testid="ext-table"] button')).find((b) => b.textContent!.trim() === 'Quitar')!).click();
    await fixture.whenStable();
    TestBed.inject(ConfirmService).pending()!.resolve(true);
    await fixture.whenStable();

    const request = http.expectOne((r) => r.method === 'DELETE');
    expect(request.request.url).toBe(`${ORG}/external-counterparts/e1`);
    request.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('errores de la lista permiten reintentar', () => {
    render();
    http.expectOne(`${ORG}/links/summary`).flush(SUMMARY);
    listRequest('active').flush({ error: { code: 'INTERNAL_ERROR', message: 'x' } }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(q('[role=alert]')).not.toBeNull();
    click('[role=alert] button');
    expect(http.match((r) => r.url === `${ORG}/links`).length).toBe(1);
  });
});
