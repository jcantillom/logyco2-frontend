import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { CompanyProfileComponent } from './company-profile.component';

const API = 'http://api.test/api/v1';
const org = (over: Record<string, unknown> = {}) => ({
  data: {
    id: ORG_ENVIA.id, name: 'ENVIA', legal_name: 'Envía Logística S.A.S.', tax_id: '900123456-1', contact_email: null, contact_phone: null, address: null, city: null, website: null, is_active: true,
    created_at: '2026-01-15T00:00:00Z', updated_at: '2026-03-02T00:00:00Z', types: [{ code: 'CARRIER', name: 'Transportador' }],
    active_admins: 1, pending_invitations: 0, ...over,
  },
});

describe('CompanyProfileComponent: Datos de mi empresa', () => {
  let fixture: ComponentFixture<CompanyProfileComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function render(roles = ['ORG_ADMIN']): void {
    TestBed.configureTestingModule({ imports: [CompanyProfileComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CompanyProfileComponent);
    fixture.detectChanges();
  }

  function answer(organization = org(), relationships: unknown[] = []): void {
    http.expectOne(`${API}/organizations/${ORG_ENVIA.id}`).flush(organization);
    http.expectOne(`${API}/organizations/${ORG_ENVIA.id}/relationships`).flush({ data: relationships });
    fixture.detectChanges();
  }

  function goTo(tab: string): void {
    el().querySelector<HTMLButtonElement>(`[data-testid="tab-${tab}"]`)!.click();
    fixture.detectChanges();
  }

  /** Pide también el catálogo de tipos que carga la vista. */
  function answerAll(organization = org(), relationships: unknown[] = []): void {
    answer(organization, relationships);
    http.match(`${API}/organizations/${ORG_ENVIA.id}/logo`).forEach((r) => r.flush(new Blob([]), { status: 404, statusText: 'Not Found' }));
    http.match(`${API}/organization-types`).forEach((r) => r.flush({ data: [{ code: 'CARRIER', name: 'Transportador', description: 'Mueve carga de terceros' }] }));
    fixture.detectChanges();
  }

  it('muestra las 3 pestañas y la información general con contacto', () => {
    render();
    answerAll(org({ contact_email: 'info@envia.co', contact_phone: '(601) 123 45 67', address: 'Cra 7 # 71-21', city: 'Bogotá', website: 'https://envia.co' }));

    expect(Array.from(el().querySelectorAll('[role=tab]')).map((t) => t.textContent!.trim())).toEqual(['Información general', 'Empresas vinculadas', 'Configuración']);
    expect(el().querySelector('[data-testid="tab-general"]')!.getAttribute('aria-selected')).toBe('true');
    const text = el().textContent!;
    ['Envía Logística S.A.S.', '900123456-1', 'Transportador', 'info@envia.co', '(601) 123 45 67', 'Cra 7 # 71-21, Bogotá', 'https://envia.co'].forEach((x) => expect(text).toContain(x));
    expect(el().querySelector('[data-testid="incomplete"]')).toBeNull();
  });

  it('avisa de lo que falta (razón social / NIT) y que lo completa la plataforma', () => {
    render();
    answerAll(org({ legal_name: null, tax_id: null }));

    const alert = el().querySelector('[data-testid="incomplete"]')!.textContent!;
    expect(alert).toContain('la razón social y el NIT');
    expect(alert).toContain('administrador de la plataforma');
    expect(el().textContent).toContain('No registrada');
    expect(el().textContent).toContain('Teléfono no registrado');
  });

  it('«Actividad y sector» integra la completitud real del perfil y los tipos con su descripción (sin pestaña aparte)', () => {
    render();
    answerAll(org({ legal_name: null, city: 'Cali' })); // 9 datos: faltan razón social, correo, teléfono, dirección y sitio web

    expect(el().querySelector('[data-testid="tab-activity"]')).toBeNull();
    expect(el().querySelector('[data-testid="completeness"]')!.textContent).toContain('4 de 9 datos completos');
    expect(el().querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')).toBe('44');
    expect(el().querySelector('[data-testid="pending-mine"]')!.textContent).toContain('correo de contacto');
    expect(el().querySelector('[data-testid="pending-platform"]')!.textContent).toContain('razón social');
    expect(el().querySelector('[data-testid="types"]')!.textContent).toContain('Mueve carga de terceros'); // descripción del catálogo
  });

  it('sin empresas vinculadas muestra un estado vacío (resumen y pestaña)', () => {
    render();
    answerAll();
    expect(el().querySelector('[data-testid="links-summary-empty"]')).not.toBeNull();
    goTo('links');
    // La pestaña es ahora la gestión de vínculos (componente propio): pide conteos y la lista de vigentes.
    http.match(`${API}/organizations/${ORG_ENVIA.id}/links/summary`).forEach((r) => !r.cancelled && r.flush({ data: { active: 0, pending_received: 0, pending_sent: 0, external: 0 } })); // el Resumen y la pestaña lo piden (la primera petición se cancela al repetirse)
    http.expectOne((r) => r.url === `${API}/organizations/${ORG_ENVIA.id}/links` && r.params.get('view') === 'active').flush({ data: [], meta: { pagination: { page: 1, page_size: 10, total: 0, total_pages: 1, has_next: false, has_previous: false } } });
    fixture.detectChanges();
    expect(el().querySelector('app-company-links')).not.toBeNull();
    expect(el().querySelector('[data-testid="links-empty"]')).not.toBeNull();
  });

  it('lista las empresas vinculadas: si la tuya es proveedora, la otra es cliente', () => {
    render();
    answerAll(org(), [
      { id: 'r1', counterpart: { id: 'c1', name: 'Cliente Uno' }, role: 'PROVIDER', relationship_type: 'TRANSPORT_SERVICE', start_date: '2026-02-01', end_date: null, is_active: true },
      { id: 'r2', counterpart: { id: 'c2', name: 'Proveedor Dos' }, role: 'CLIENT', relationship_type: 'FUEL_SUPPLY', start_date: null, end_date: '2026-12-31', is_active: false },
    ]);

    const summary = el().querySelector('[data-testid="links-summary"]')!.textContent!;
    expect(summary).toContain('Cliente Uno');
    expect(summary).toContain('Proveedor Dos');

    goTo('links');
    expect(el().querySelector('app-company-links')).not.toBeNull(); // el detalle completo vive en la gestión de vínculos
  });

  it('«Configuración» explica el rol propio y quién puede cambiar qué', () => {
    render();
    answerAll();
    goTo('config');

    expect(el().querySelector('[data-testid="my-role"]')!.textContent).toContain('Administrador de empresa');
    const who = el().querySelector('[data-testid="who-changes"]')!.textContent!;
    expect(who).toContain('Plataforma LoGyCO₂');
    expect(who).toContain('Administrador de la empresa');
    // Los vínculos los gestiona la propia empresa (`relationships:manage`); la plataforma solo supervisa.
    const owner = (label: string): string | undefined =>
      Array.from(el().querySelectorAll('[data-testid="who-changes"] > div')).find((row) => row.querySelector('dt')!.textContent === label)?.querySelector('dd')?.textContent?.trim();
    expect(owner('Empresas vinculadas')).toBe('Administrador de la empresa');
    expect(owner('Nombre y contacto')).toBe('Administrador de la empresa');
    expect(owner('Razón social y NIT')).toBe('Plataforma LoGyCO₂');
    expect(owner('Estado y tipos de actividad')).toBe('Plataforma LoGyCO₂');
  });

  it('las pestañas se recorren con las flechas del teclado', () => {
    render();
    answerAll();
    const first = el().querySelector<HTMLButtonElement>('[data-testid="tab-general"]')!;

    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="tab-links"]')!.getAttribute('aria-selected')).toBe('true');
  });

  it('el administrador ve «Editar datos»; quien solo consulta no, y la identidad legal se declara bloqueada', () => {
    render();
    answerAll();
    expect(el().querySelector('[data-testid="edit-profile"]')).not.toBeNull();
    expect(el().querySelector('[data-testid="edit-contact"]')).not.toBeNull();
    expect(el().querySelector('[data-testid="lock-note"]')!.textContent).toContain('Razón social, NIT, estado y tipos de actividad');
    TestBed.resetTestingModule();

    render(['ORG_ANALYST']);
    answerAll();
    expect(el().querySelector('[data-testid="edit-profile"]')).toBeNull();
    expect(el().querySelector('[data-testid="edit-contact"]')).toBeNull();
  });

  function openEdit(): HTMLFormElement {
    el().querySelector<HTMLButtonElement>('[data-testid="edit-profile"]')!.click();
    fixture.detectChanges();

    return el().querySelector('dialog form')!;
  }

  function type(selector: string, value: string): void {
    const input = el().querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('al guardar envía SOLO lo que cambió a /profile, nunca razón social ni NIT, y refresca la vista', () => {
    render();
    answerAll();
    const form = openEdit();
    expect((form.querySelector('#pf-legal') as HTMLInputElement).readOnly).toBeTrue();
    expect((form.querySelector('#pf-tax') as HTMLInputElement).readOnly).toBeTrue();

    type('#pf-city', '  Bogotá ');
    type('#pf-email', 'contacto@envia.co');
    form.dispatchEvent(new Event('submit'));

    const request = http.expectOne(`${API}/organizations/${ORG_ENVIA.id}/profile`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ city: 'Bogotá', contact_email: 'contacto@envia.co' });
    request.flush(org({ city: 'Bogotá', contact_email: 'contacto@envia.co' }));
    fixture.detectChanges();

    expect(el().textContent).toContain('Bogotá');
    expect(el().textContent).toContain('contacto@envia.co');
  });

  it('un valor vacío borra el dato (null) y sin cambios no se envía nada', () => {
    render();
    answerAll(org({ city: 'Cali' }));
    let form = openEdit();
    form.dispatchEvent(new Event('submit')); // sin cambios
    http.expectNone(`${API}/organizations/${ORG_ENVIA.id}/profile`);

    form = openEdit();
    type('#pf-city', '   ');
    form.dispatchEvent(new Event('submit'));

    expect(http.expectOne(`${API}/organizations/${ORG_ENVIA.id}/profile`).request.body).toEqual({ city: null });
  });

  it('valida nombre, correo, teléfono y sitio web antes de enviar', () => {
    render();
    answerAll();
    const form = openEdit();

    type('#pf-name', '');
    type('#pf-email', 'no-es-correo');
    type('#pf-phone', 'abc');
    type('#pf-web', 'empresa.co');
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    http.expectNone(`${API}/organizations/${ORG_ENVIA.id}/profile`);
    expect(Array.from(form.querySelectorAll('.field-error')).length).toBe(4);
  });

  it('si el servidor rechaza (p. ej. nombre repetido) no cierra el diálogo ni cambia la vista', () => {
    render();
    answerAll();
    const form = openEdit();
    type('#pf-name', 'Otra empresa');
    form.dispatchEvent(new Event('submit'));

    http.expectOne(`${API}/organizations/${ORG_ENVIA.id}/profile`).flush({ error: { code: 'ORGANIZATION_NAME_DUPLICATE', message: 'Ya existe una organización con ese nombre' } }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(el().querySelector<HTMLDialogElement>('dialog')!.open).toBeTrue();
    expect(el().querySelector('#panel-general dl.rows')!.textContent).toContain('ENVIA');
    expect(el().querySelector('#panel-general dl.rows')!.textContent).not.toContain('Otra empresa');
  });

  // ------------------------------------------------------------------ logo

  const png = (size = 100, type = 'image/png'): File => new File([new Uint8Array(size)], 'logo.png', { type });

  function pick(file: File): void {
    const input = el().querySelector<HTMLInputElement>('[data-testid="logo-input"]')!;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('sin logo el formulario ofrece «Subir imagen» (con las iniciales como vista previa)', () => {
    render();
    answerAll();
    openEdit();

    expect(el().querySelector('[data-testid="logo-preview"]')!.textContent!.trim()).toBe('E');
    expect(el().querySelector('label[for="pf-logo"]')!.textContent).toContain('Subir imagen');
    expect(el().querySelector('[data-testid="logo-remove"]')).toBeNull();
    expect(el().querySelector<HTMLInputElement>('#pf-logo')!.accept).toBe('image/png,image/jpeg,image/webp');
  });

  it('un archivo que no es PNG/JPG/WebP o pesa más de 512 KB se rechaza sin enviar nada', () => {
    render();
    answerAll();
    const form = openEdit();

    pick(png(100, 'image/svg+xml'));
    expect(el().querySelector('[data-testid="logo-error"]')!.textContent).toContain('PNG, JPG o WebP');

    pick(png(512 * 1024 + 1));
    expect(el().querySelector('[data-testid="logo-error"]')!.textContent).toContain('512 KB');

    form.dispatchEvent(new Event('submit'));
    http.expectNone(`${API}/organizations/${ORG_ENVIA.id}/logo`);
    expect(el().querySelector('[data-testid="logo-preview"] img')).toBeNull();
  });

  it('al guardar sube el logo como cuerpo binario (PUT) y lo muestra en la tarjeta', () => {
    render();
    answerAll();
    const form = openEdit();

    pick(png(200));
    expect(el().querySelector('[data-testid="logo-preview"] img')).not.toBeNull(); // vista previa antes de guardar
    expect(el().querySelector('[data-testid="logo-remove"]')).not.toBeNull();
    expect(el().querySelector('[data-testid="edit-dirty"]')).not.toBeNull();
    form.dispatchEvent(new Event('submit'));

    const request = http.expectOne(`${API}/organizations/${ORG_ENVIA.id}/logo`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.headers.get('Content-Type')).toBe('image/png');
    expect(request.request.body instanceof Blob).toBeTrue();
    http.expectNone(`${API}/organizations/${ORG_ENVIA.id}/profile`); // no cambió ningún dato: solo viaja el logo
    request.flush({ data: { content_type: 'image/png', size_bytes: 200, sha256: 'x', updated_at: '2026-11-19T00:00:00Z' } });
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="company-logo"] img')).not.toBeNull();
  });

  it('cambia datos y logo en una misma acción: primero los datos y después el logo', () => {
    render();
    answerAll();
    const form = openEdit();

    type('#pf-city', 'Cali');
    pick(png(50));
    form.dispatchEvent(new Event('submit'));

    http.expectOne(`${API}/organizations/${ORG_ENVIA.id}/profile`).flush(org({ city: 'Cali' }));
    http.expectOne(`${API}/organizations/${ORG_ENVIA.id}/logo`).flush({ data: { content_type: 'image/png', size_bytes: 50, sha256: 'x', updated_at: '2026-11-19T00:00:00Z' } });
    fixture.detectChanges();

    expect(el().textContent).toContain('Cali');
    expect(el().querySelector('[data-testid="company-logo"]')).not.toBeNull();
  });

  it('«Quitar logo» borra el logo existente (DELETE) y vuelve al ícono', () => {
    render();
    answer();
    http.expectOne(`${API}/organizations/${ORG_ENVIA.id}/logo`).flush(new Blob([new Uint8Array(10)], { type: 'image/png' }));
    http.match(`${API}/organization-types`).forEach((r) => r.flush({ data: [] }));
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="company-logo"]')).not.toBeNull();

    const form = openEdit();
    el().querySelector<HTMLButtonElement>('[data-testid="logo-remove"]')!.click();
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="logo-preview"] img')).toBeNull();
    form.dispatchEvent(new Event('submit'));

    const request = http.expectOne(`${API}/organizations/${ORG_ENVIA.id}/logo`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="company-logo"]')).toBeNull();
  });

  it('si el servidor rechaza el logo avisa y no cambia el que había', () => {
    render();
    answerAll();
    const form = openEdit();
    pick(png(50));
    form.dispatchEvent(new Event('submit'));

    http.expectOne(`${API}/organizations/${ORG_ENVIA.id}/logo`).flush({ error: { code: 'LOGO_FORMAT_INVALID', message: 'El logo debe ser una imagen PNG, JPEG o WebP' } }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();

    expect(el().querySelector<HTMLDialogElement>('dialog')!.open).toBeTrue();
    expect(el().querySelector('[data-testid="company-logo"]')).toBeNull();
  });
});
