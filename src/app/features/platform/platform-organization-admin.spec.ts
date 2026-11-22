import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { PlatformOrganizationDetailComponent } from './platform-organization-detail.component';
import { PlatformOrganizationsComponent } from './platform-organizations.component';

const API = 'http://api.test/api/v1';
const ORG_ID = '44444444-4444-4444-8444-444444444444';
const pag = (total: number) => ({ page: 1, page_size: 100, total, total_pages: 1, has_next: false, has_previous: false });
const orgDto = (over: Record<string, unknown> = {}) => ({
  id: ORG_ID, name: 'Acme', legal_name: 'Acme S.A.S.', tax_id: null, is_active: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', types: [], ...over,
});
const TYPES = [{ code: 'CARRIER', name: 'Transportador', description: null }, { code: 'SHIPPER', name: 'Generador de carga', description: null }];

describe('Consola Super Admin: operaciones sobre empresas', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
  });
  describe('detalle', () => {
    let fixture: ComponentFixture<PlatformOrganizationDetailComponent>;
    const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
    const click = (testId: string): void => { el().querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click(); fixture.detectChanges(); };
    const openTab = (name: string): void => {
      Array.from(el().querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((t) => t.textContent!.includes(name))!.click();
      fixture.detectChanges();
    };

    function render(org = orgDto()): void {
      fixture = TestBed.createComponent(PlatformOrganizationDetailComponent);
      fixture.componentRef.setInput('id', ORG_ID);
      fixture.detectChanges();
      http.match(`${API}/organizations/${ORG_ID}`).forEach((r) => r.flush({ data: org, meta: {} }));
      http.match(`${API}/organizations/${ORG_ID}/relationships`).forEach((r) => r.flush({ data: [], meta: {} }));
      http.match(`${API}/organization-types`).forEach((r) => r.flush({ data: TYPES, meta: {} }));
      http.match((r) => r.url === `${API}/users`).forEach((r) => r.flush({ data: [], meta: { pagination: pag(0) } }));
      http.match((r) => r.url === `${API}/users/invitations`).forEach((r) => r.flush({ data: [], meta: { pagination: pag(0) } }));
      fixture.detectChanges();
    }
    const answerConfirm = async (accepted: boolean): Promise<void> => {
      TestBed.inject(ConfirmService).pending()!.resolve(accepted);
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('desactivar pide confirmación y, si se acepta, hace PATCH /status', async () => {
      render();
      click('toggle-org');
      expect(TestBed.inject(ConfirmService).pending()?.title).toBe('Desactivar empresa');
      await answerConfirm(true);
      const req = http.expectOne(`${API}/organizations/${ORG_ID}/status`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ is_active: false });
      req.flush({ data: orgDto({ is_active: false }), meta: {} });
      http.match((r) => r.url === `${API}/organizations`).forEach((r) => r.flush({ data: [], meta: { pagination: pag(0) } }));
      fixture.detectChanges();
      expect(el().textContent).toContain('Activar empresa');
    });

    it('si se rechaza la confirmación no se envía ninguna petición', async () => {
      render();
      click('toggle-org');
      await answerConfirm(false);
      http.expectNone(`${API}/organizations/${ORG_ID}/status`);
    });

    const dialog = (): HTMLDialogElement => el().querySelector<HTMLDialogElement>('dialog')!;
    const editTypes = (): HTMLInputElement[] => Array.from(el().querySelectorAll<HTMLInputElement>('[data-testid="edit-types"] input[type="checkbox"]'));
    const submitEdit = (): void => { dialog().querySelector('form')!.dispatchEvent(new Event('submit')); fixture.detectChanges(); };

    it('los tipos ya no son una pestaña: se editan dentro del formulario «Editar datos»', () => {
      render(orgDto({ types: [{ code: 'CARRIER', name: 'Transportador' }] }));
      const tabs = Array.from(el().querySelectorAll('[role="tab"]')).map((t) => t.textContent!.trim());

      expect(tabs).not.toContain('Tipos y clasificación');
      expect(tabs).toEqual(['Información general', 'Administrador y equipo', 'Relaciones comerciales', 'Vehículos', 'Actividad']);
      click('edit-org');
      expect(editTypes().map((c) => c.checked)).toEqual([true, false]); // parte de los tipos reales de la empresa
      expect(el().querySelector('legend:not(.sr-only)')).not.toBeNull();
      expect(dialog().textContent).toContain('Tipo de empresa (obligatorio)');
    });

    it('cambiar solo los tipos envía únicamente PUT /types (sin PATCH de datos)', () => {
      render(orgDto({ types: [{ code: 'CARRIER', name: 'Transportador' }] }));
      click('edit-org');
      editTypes()[1].click();
      fixture.detectChanges();
      submitEdit();

      http.expectNone((r) => r.method === 'PATCH' && r.url === `${API}/organizations/${ORG_ID}`);
      const req = http.expectOne(`${API}/organizations/${ORG_ID}/types`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ type_codes: ['CARRIER', 'SHIPPER'] });
      req.flush({ data: orgDto({ types: [{ code: 'CARRIER', name: 'Transportador' }, { code: 'SHIPPER', name: 'Generador de carga' }] }), meta: {} });
    });

    it('cambiar datos y tipos envía PATCH y luego PUT, y sin cambios no envía nada', () => {
      render(orgDto({ types: [{ code: 'CARRIER', name: 'Transportador' }] }));
      click('edit-org');
      submitEdit();
      http.expectNone((r) => r.method !== 'GET' && r.url.startsWith(`${API}/organizations/${ORG_ID}`));

      click('edit-org');
      const name = dialog().querySelector<HTMLInputElement>('#edit-name')!;
      name.value = 'Acme Nueva'; name.dispatchEvent(new Event('input'));
      editTypes()[0].click(); editTypes()[1].click(); // CARRIER → SHIPPER
      fixture.detectChanges();
      submitEdit();

      const patch = http.expectOne((r) => r.method === 'PATCH' && r.url === `${API}/organizations/${ORG_ID}`);
      expect(patch.request.body).toEqual({ name: 'Acme Nueva', legal_name: 'Acme S.A.S.', tax_id: null });
      patch.flush({ data: orgDto({ name: 'Acme Nueva', types: [{ code: 'CARRIER', name: 'Transportador' }] }), meta: {} });
      const put = http.expectOne(`${API}/organizations/${ORG_ID}/types`);
      expect(put.request.body).toEqual({ type_codes: ['SHIPPER'] });
      put.flush({ data: orgDto({ name: 'Acme Nueva', types: [{ code: 'SHIPPER', name: 'Generador de carga' }] }), meta: {} });
    });

    it('una empresa no puede quedarse sin tipo: se avisa y no se envía nada', () => {
      render(); // empresa anterior a la regla, sin tipos
      click('edit-org');
      submitEdit();

      expect(dialog().querySelector('[data-testid="types-error"]')!.textContent).toContain('al menos un tipo');
      http.expectNone((r) => r.method !== 'GET' && r.url.startsWith(`${API}/organizations/${ORG_ID}`));

      editTypes()[1].click();
      fixture.detectChanges();
      expect(dialog().querySelector('[data-testid="types-error"]')).toBeNull();
      editTypes()[1].click(); // quitarlo de nuevo
      fixture.detectChanges();
      expect(dialog().querySelector('[data-testid="types-error"]')).not.toBeNull();
    });

    const member = (id: string, name: string, roles: string[], status = 'ACTIVE') => ({
      id, full_name: name, email: `${id}@acme.co`, is_active: true,
      memberships: [{ membership_id: `m-${id}`, organization: { id: ORG_ID, name: 'Acme' }, status, roles }],
    });
    const renderWith = (users: unknown[], invitations: unknown[] = []): void => {
      fixture = TestBed.createComponent(PlatformOrganizationDetailComponent);
      fixture.componentRef.setInput('id', ORG_ID);
      fixture.detectChanges();
      http.match(`${API}/organizations/${ORG_ID}`).forEach((r) => r.flush({ data: orgDto({ types: [{ code: 'CARRIER', name: 'Transportador' }] }), meta: {} }));
      http.match(`${API}/organizations/${ORG_ID}/relationships`).forEach((r) => r.flush({ data: [], meta: {} }));
      http.match(`${API}/organization-types`).forEach((r) => r.flush({ data: TYPES, meta: {} }));
      http.match((r) => r.url === `${API}/users`).forEach((r) => r.flush({ data: users, meta: { pagination: pag(users.length) } }));
      http.match((r) => r.url === `${API}/users/invitations`).forEach((r) => r.flush({ data: invitations, meta: { pagination: pag(invitations.length) } }));
      fixture.detectChanges();
      openTab('Administrador y equipo');
    };
    const invitationDto = (over: Record<string, unknown> = {}) => ({
      id: 'i1', organization: { id: ORG_ID, name: 'Acme' }, email: 'nuevo@acme.co', invitee_name: 'Nuevo Admin', role_code: 'ORG_ADMIN', status: 'PENDING',
      expires_at: '2099-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', accepted_at: null, ...over,
    });

    it('pide al servidor solo las personas de ESTA empresa (organization_id) en vez de descargar a toda la plataforma', () => {
      fixture = TestBed.createComponent(PlatformOrganizationDetailComponent);
      fixture.componentRef.setInput('id', ORG_ID);
      fixture.detectChanges();
      const requests = http.match((r) => r.url === `${API}/users`);

      expect(requests.length).toBeGreaterThan(0);
      expect(requests.every((r) => r.request.params.get('organization_id') === ORG_ID)).toBeTrue();
    });

    it('con administrador: lo muestra como único, sin formulario para asignar otro, y explica cómo cambiarlo', () => {
      renderWith([member('ana', 'Ana Admin', ['ORG_ADMIN']), member('lu', 'Luis Analista', ['ORG_ANALYST'])]);
      const admin = el().querySelector('[data-testid="admin-person"]')!;

      expect(admin.textContent).toContain('Ana Admin');
      expect(admin.textContent).toContain('ana@acme.co');
      expect(admin.querySelector('a')!.getAttribute('href')).toBe('/plataforma/usuarios/ana');
      expect(el().querySelector('[data-testid="invite-admin"]')).toBeNull();
      expect(el().querySelector('#adm-email')).toBeNull();
      expect(el().querySelector('[data-testid="admin-change-hint"]')!.textContent).toContain('primero revoca el acceso del actual');
      expect(el().querySelector('[data-testid="no-admin"]')).toBeNull();
    });

    it('el equipo solo lista a las demás personas con su rol, y el administrador no se repite ahí', () => {
      renderWith([member('ana', 'Ana Admin', ['ORG_ADMIN']), member('lu', 'Luis Analista', ['ORG_ANALYST'])]);
      const team = el().querySelector('[data-testid="team-section"]')!.textContent!.replace(/\s+/g, ' ');

      expect(team).toContain('Luis Analista');
      expect(team).toContain('Analista');
      expect(team).not.toContain('Ana Admin');
    });

    it('el estado de las personas va en masculino («Activo») y Rol y Estado quedan centrados bajo su encabezado', () => {
      renderWith([member('ana', 'Ana Admin', ['ORG_ADMIN']), member('lu', 'Luis Analista', ['ORG_ANALYST'])]);
      const team = el().querySelector('[data-testid="team-section"]')!;
      const heads = Array.from(team.querySelectorAll('thead th'));
      const cells = Array.from(team.querySelectorAll('tbody tr:first-child td'));

      expect(el().querySelector('[data-testid="admin-person"]')!.textContent).toContain('Activo');
      expect(el().querySelector('[data-testid="admin-person"]')!.textContent).not.toContain('Activa');
      expect(cells[3].textContent).toContain('Activo');
      for (const index of [2, 3]) {
        expect(heads[index].classList.contains('c')).withContext(`encabezado ${index}`).toBeTrue();
        expect(cells[index].classList.contains('c')).withContext(`celda ${index}`).toBeTrue();
        expect(getComputedStyle(cells[index]).textAlign).withContext(`alineación ${index}`).toBe('center');
      }
    });

    it('un administrador pendiente de aprobación o suspendido sigue ocupando el cupo; uno revocado no', () => {
      renderWith([member('ana', 'Ana Admin', ['ORG_ADMIN'], 'SUSPENDED')]);
      expect(el().querySelector('[data-testid="admin-person"]')!.textContent).toContain('Suspendido');
      expect(el().querySelector('#adm-email')).toBeNull();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: provideTestApp() });
      http = TestBed.inject(HttpTestingController);
      signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
      renderWith([member('ana', 'Ana Admin', ['ORG_ADMIN'], 'REVOKED')]);
      expect(el().querySelector('[data-testid="admin-person"]')).toBeNull();
      expect(el().querySelector('[data-testid="no-admin"]')).not.toBeNull(); // la membresía revocada es historia
      expect(el().querySelector('#adm-email')).not.toBeNull();
    });

    it('sin administrador pero con una invitación vigente: la muestra y no deja asignar a otra persona', () => {
      renderWith([], [invitationDto()]);
      const pending = el().querySelector('[data-testid="admin-pending"]')!;

      expect(pending.textContent).toContain('Nuevo Admin');
      expect(pending.textContent).toContain('Invitación pendiente');
      expect(el().querySelector('[data-testid="invite-admin"]')).toBeNull();
      expect(pending.querySelector('a')!.getAttribute('href')).toBe('/plataforma/usuarios?tab=invitaciones');
    });

    it('una invitación de administrador revocada o vencida no ocupa el cupo y las revocadas no se listan', () => {
      renderWith([], [invitationDto({ status: 'REVOKED' }), invitationDto({ id: 'i2', status: 'PENDING', expires_at: '2000-01-01T00:00:00Z', created_at: '1999-01-01T00:00:00Z' })]);

      expect(el().querySelector('[data-testid="admin-pending"]')).toBeNull();
      expect(el().querySelector('[data-testid="no-admin"]')!.textContent).toContain('aún no tiene administrador');
      expect(el().querySelector('[data-testid="invite-admin"]')!.textContent).toContain('Asignar administrador');
      expect(el().querySelector('[data-testid="org-invitations"]')!.textContent).not.toContain('Revocada');
    });

    it('las invitaciones se muestran con su estado en español', () => {
      renderWith([member('ana', 'Ana Admin', ['ORG_ADMIN'])], [invitationDto({ id: 'i3', role_code: 'ORG_ANALYST', email: 'x@acme.co' })]);

      expect(el().querySelector('[data-testid="org-invitations"]')!.textContent).toContain('Pendiente');
      expect(el().querySelector('[data-testid="org-invitations"]')!.textContent).not.toContain('PENDING');
    });

    it('incorporar al primer administrador usa el caso de uso de onboarding (sin código) y muestra el estado real', () => {
      render();
      openTab('Administrador y equipo');
      const email = el().querySelector<HTMLInputElement>('#adm-email')!;
      email.value = 'Admin@Acme.co'; email.dispatchEvent(new Event('input'));
      const name = el().querySelector<HTMLInputElement>('#adm-name')!;
      name.value = 'Ana Admin'; name.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      click('invite-admin');
      const req = http.expectOne(`${API}/onboarding/members`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ organization_id: ORG_ID, email: 'admin@acme.co', full_name: 'Ana Admin', role_code: 'ORG_ADMIN' });
      req.flush({
        data: {
          invitation_id: 'i1', organization: { id: ORG_ID, name: 'Acme' }, email: 'admin@acme.co', full_name: 'Ana Admin', role_code: 'ORG_ADMIN', invitation_status: 'PENDING',
          identity_status: 'CREATED', delivery_status: 'FAILED', delivery_error_code: 'MAIL_DISABLED', activation: 'PENDING', first_admin: true, send_count: 0,
          last_sent_at: null, expires_at: '2026-12-01T00:00:00Z', next_step: 'RESEND_EMAIL',
        },
        meta: {},
      });
      http.match((r) => r.url === `${API}/users/invitations`).forEach((r) => r.flush({ data: [], meta: { pagination: pag(0) } }));
      fixture.detectChanges();
      expect(el().querySelector('[data-step="delivery"]')!.textContent).toContain('Falló'); // no se afirma «enviado»
      expect(el().querySelector('[data-testid="onboarding-error"]')!.textContent).toContain('no está habilitado');
      expect(el().querySelector('[data-testid="invitation-code"]')).toBeNull();
    });

    const PLAN = { organization_id: ORG_ID, organization_name: 'Acme', is_active: false, deleted: false, users_to_delete: 3, users_kept: 1, memberships: 4, invitations: 2, relationships: 0 };

    it('«Eliminar empresa» solo aparece si la empresa está desactivada', () => {
      render(orgDto({ is_active: true }));
      expect(el().querySelector('[data-testid="delete-org"]')).toBeNull();
    });

    it('eliminar es LÓGICO: explica que la empresa queda oculta y restaurable, exige el nombre exacto y solo entonces elimina', () => {
      render(orgDto({ is_active: false }));
      el().querySelector<HTMLButtonElement>('[data-testid="delete-org"]')!.click();
      http.expectOne(`${API}/organizations/${ORG_ID}/deletion-preview`).flush({ data: PLAN, meta: {} });
      fixture.detectChanges();

      const plan = el().querySelector('[data-testid="delete-plan"]')!.textContent!.replace(/\s+/g, ' ');
      expect(el().querySelector('dialog[aria-labelledby="del-title"]')!.textContent).toContain('quedará oculta, no borrada');
      expect(plan).toContain('3 usuario(s) que pertenecen solo a esta empresa (no podrán iniciar sesión)');
      expect(plan).toContain('se conservan intactas');
      expect(plan).toContain('1 usuario(s) con otras empresas o rol global: no se tocan');
      const confirm = (): HTMLButtonElement => el().querySelector<HTMLButtonElement>('[data-testid="delete-confirm"]')!;
      expect(confirm().disabled).toBeTrue();

      const input = el().querySelector<HTMLInputElement>('#del-name')!;
      input.value = 'otra empresa'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
      expect(confirm().disabled).toBeTrue();
      input.value = 'Acme'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
      expect(confirm().disabled).toBeFalse();

      confirm().click();
      const req = http.expectOne(`${API}/organizations/${ORG_ID}/delete`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ confirm_name: 'Acme' });
      req.flush({ data: { permanent: false, organization_id: ORG_ID, organization_name: 'Acme', users_deleted: 3, users_kept: 1, memberships_deleted: 0, invitations_deleted: 0, relationships_deleted: 0 }, meta: {} });
    });

    it('una empresa eliminada muestra el aviso y solo permite restaurarla o eliminarla definitivamente', () => {
      render(orgDto({ is_active: false, deleted_at: '2026-11-18T10:00:00Z' }));

      expect(el().querySelector('[data-testid="deleted-banner"]')!.textContent).toContain('Esta empresa está eliminada');
      expect(el().querySelector('[data-testid="restore-org"]')).not.toBeNull();
      expect(el().querySelector('[data-testid="purge-org"]')).not.toBeNull();
      expect(el().querySelector('[data-testid="edit-org"]')).toBeNull();
      expect(el().querySelector('[data-testid="toggle-org"]')).toBeNull();
      expect(el().querySelector('[data-testid="delete-org"]')).toBeNull();
    });

    it('la eliminación definitiva se pide aparte, advierte que es irreversible y llama a /purge con el nombre exacto', () => {
      render(orgDto({ is_active: false, deleted_at: '2026-11-18T10:00:00Z' }));
      el().querySelector<HTMLButtonElement>('[data-testid="purge-org"]')!.click();
      http.expectOne(`${API}/organizations/${ORG_ID}/deletion-preview`).flush({ data: { ...PLAN, deleted: true }, meta: {} });
      fixture.detectChanges();

      expect(el().querySelector('dialog[aria-labelledby="del-title"]')!.textContent).toContain('Esta acción es irreversible');
      const input = el().querySelector<HTMLInputElement>('#del-name')!;
      input.value = 'Acme'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
      el().querySelector<HTMLButtonElement>('[data-testid="delete-confirm"]')!.click();

      const req = http.expectOne(`${API}/organizations/${ORG_ID}/purge`);
      expect(req.request.body).toEqual({ confirm_name: 'Acme' });
      req.flush({ data: { permanent: true, organization_id: ORG_ID, organization_name: 'Acme', users_deleted: 3, users_kept: 1, memberships_deleted: 4, invitations_deleted: 2, relationships_deleted: 0 }, meta: {} });
    });

    it('si el backend rechaza la eliminación se muestra el error y no se navega', () => {
      render(orgDto({ is_active: false }));
      el().querySelector<HTMLButtonElement>('[data-testid="delete-org"]')!.click();
      http.expectOne(`${API}/organizations/${ORG_ID}/deletion-preview`).flush({ error: { code: 'ORGANIZATION_ACTIVE', message: 'Desactiva la empresa antes de eliminarla' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(el().querySelector('[data-testid="delete-error"]')!.textContent).toContain('entra en conflicto con el estado actual');
      expect(el().querySelector<HTMLButtonElement>('[data-testid="delete-confirm"]')!.disabled).toBeTrue();
    });

    it('no permite invitar con un correo inválido ni a una empresa inactiva', () => {
      render();
      openTab('Administrador y equipo');
      click('invite-admin');
      http.expectNone(`${API}/onboarding/members`);
      expect(el().textContent).toContain('Ingresa un correo válido');
    });

    it('empresa inactiva: el botón de invitar está deshabilitado', () => {
      render(orgDto({ is_active: false }));
      openTab('Administrador y equipo');
      expect(el().querySelector<HTMLButtonElement>('[data-testid="invite-admin"]')!.disabled).toBeTrue();
    });
  });

  describe('listado', () => {
    const STATUS = {
      invitation_id: 'inv-1', organization: { id: 'o1', name: 'Nueva SAS' }, email: 'ana@nueva.co', full_name: 'Ana Gómez', role_code: 'ORG_ADMIN', invitation_status: 'PENDING',
      identity_status: 'CREATED', delivery_status: 'SENT', delivery_error_code: null, activation: 'PENDING', first_admin: true, send_count: 1,
      last_sent_at: '2026-11-18T10:00:00Z', expires_at: '2026-11-25T10:00:00Z', next_step: 'WAIT_ACTIVATION',
    };
    const fill = (el: HTMLElement, id: string, value: string): void => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value; input.dispatchEvent(new Event('input'));
    };

    function openAndFill(): { fixture: ReturnType<typeof TestBed.createComponent<PlatformOrganizationsComponent>>; el: HTMLElement } {
      const fixture = TestBed.createComponent(PlatformOrganizationsComponent);
      fixture.detectChanges();
      http.match((r) => r.url === `${API}/organizations`).forEach((r) => r.flush({ data: [orgDto({ types: [{ code: 'CARRIER', name: 'Transportador' }] })], meta: { pagination: pag(1) } }));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('tbody')!.textContent).toContain('Transportador');

      el.querySelector<HTMLButtonElement>('[data-testid="new-org"]')!.click();
      http.expectOne(`${API}/organization-types`).flush({ data: TYPES, meta: {} });
      fixture.detectChanges();
      fill(el, 'neworg-name', '  Nueva SAS ');
      fill(el, 'neworg-admin-name', ' Ana Gómez ');
      fill(el, 'neworg-admin-email', ' ANA@Nueva.co ');
      el.querySelectorAll<HTMLInputElement>('dialog fieldset input[type="checkbox"]')[0].click();

      return { fixture, el };
    }

    it('crear empresa incorpora al primer administrador en una sola operación y muestra el estado real de cada paso', () => {
      const { fixture, el } = openAndFill();

      el.querySelector<HTMLFormElement>('dialog form')!.dispatchEvent(new Event('submit'));
      const req = http.expectOne(`${API}/onboarding/organizations`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Nueva SAS', type_codes: ['CARRIER'], admin_email: 'ana@nueva.co', admin_full_name: 'Ana Gómez' });
      req.flush({ data: { organization: orgDto({ name: 'Nueva SAS' }), onboarding: STATUS, onboarding_error_code: null }, meta: {} });
      http.match((r) => r.url === `${API}/organizations`).forEach((r) => r.flush({ data: [], meta: { pagination: pag(0) } }));
      fixture.detectChanges();

      const text = el.querySelector('[data-testid="onboarding-result"]')!.textContent!.replace(/\s+/g, ' ');
      expect(text).toContain('Cuenta creada');
      expect(text).toContain('Enviado');
      expect(text).toContain('Pendiente de la persona');
      expect(text).toContain('Primer administrador');
      expect(el.querySelector('[data-testid="onboarding-result"]')!.textContent).not.toMatch(/#codigo|contraseña temporal/i);
    });

    it('el tipo de empresa es obligatorio al crear: sin tipo se avisa y no se envía nada; al elegirlo se crea', () => {
      const { fixture, el } = openAndFill();
      el.querySelectorAll<HTMLInputElement>('dialog fieldset input[type="checkbox"]')[0].click(); // quita el tipo elegido por el helper
      fixture.detectChanges();

      expect(el.querySelector('dialog')!.textContent).toContain('Tipo de empresa (obligatorio)');
      el.querySelector<HTMLFormElement>('dialog form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      http.expectNone(`${API}/onboarding/organizations`);
      expect(el.querySelector('[data-testid="types-error"]')!.textContent).toContain('al menos un tipo');

      el.querySelectorAll<HTMLInputElement>('dialog fieldset input[type="checkbox"]')[1].click();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="types-error"]')).toBeNull();
      el.querySelector<HTMLFormElement>('dialog form')!.dispatchEvent(new Event('submit'));
      expect(http.expectOne(`${API}/onboarding/organizations`).request.body.type_codes).toEqual(['SHIPPER']);
    });

    it('si el correo falla no se afirma «enviado»: se muestra el error y se puede reenviar sin recrear la identidad', () => {
      const { fixture, el } = openAndFill();

      el.querySelector<HTMLFormElement>('dialog form')!.dispatchEvent(new Event('submit'));
      http.expectOne(`${API}/onboarding/organizations`).flush({ data: {
        organization: orgDto({ name: 'Nueva SAS' }),
        onboarding: { ...STATUS, delivery_status: 'FAILED', delivery_error_code: 'MAIL_TIMEOUT', next_step: 'RESEND_EMAIL' }, onboarding_error_code: null }, meta: {} });
      http.match((r) => r.url === `${API}/organizations`).forEach((r) => r.flush({ data: [], meta: { pagination: pag(0) } }));
      fixture.detectChanges();

      expect(el.querySelector('[data-step="delivery"]')!.textContent).toContain('Falló');
      expect(el.querySelector('[data-testid="onboarding-error"]')!.textContent).toContain('no respondió');
      el.querySelector<HTMLButtonElement>('[data-testid="onboarding-resend"]')!.click();
      const resend = http.expectOne(`${API}/onboarding/invitations/inv-1/resend`);
      expect(resend.request.method).toBe('POST');
      resend.flush({ data: STATUS, meta: {} });
      fixture.detectChanges();

      expect(el.querySelector('[data-step="delivery"]')!.textContent).toContain('Enviado');
      expect(el.querySelector('[data-testid="onboarding-error"]')).toBeNull();
    });

    it('si la empresa se creó pero el administrador no pudo incorporarse, lo dice y ofrece abrir la empresa', () => {
      const { fixture, el } = openAndFill();

      el.querySelector<HTMLFormElement>('dialog form')!.dispatchEvent(new Event('submit'));
      http.expectOne(`${API}/onboarding/organizations`).flush({ data: { organization: orgDto({ name: 'Nueva SAS' }), onboarding: null, onboarding_error_code: 'MEMBERSHIP_ALREADY_EXISTS' }, meta: {} });
      http.match((r) => r.url === `${API}/organizations`).forEach((r) => r.flush({ data: [], meta: { pagination: pag(0) } }));
      fixture.detectChanges();

      expect(el.querySelector('[data-testid="onboarding-failed"]')!.textContent).toContain('La empresa se creó, pero no se pudo incorporar');
      expect(el.querySelector('[data-testid="onboarding-open"]')).not.toBeNull();
    });

    it('el administrador es obligatorio: sin correo válido no se envía nada', () => {
      const { fixture, el } = openAndFill();
      fill(el, 'neworg-admin-email', 'no-es-correo');

      el.querySelector<HTMLFormElement>('dialog form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      http.expectNone(`${API}/onboarding/organizations`);
      expect(el.querySelector('dialog')!.textContent).toContain('Ingresa un correo válido');
    });

    it('un nombre vacío no envía la petición', () => {
      const fixture = TestBed.createComponent(PlatformOrganizationsComponent);
      fixture.detectChanges();
      http.match((r) => r.url === `${API}/organizations`).forEach((r) => r.flush({ data: [], meta: { pagination: pag(0) } }));
      const el = fixture.nativeElement as HTMLElement;
      el.querySelector<HTMLFormElement>('dialog form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      http.expectNone({ method: 'POST', url: `${API}/organizations` });
    });
  });
});
