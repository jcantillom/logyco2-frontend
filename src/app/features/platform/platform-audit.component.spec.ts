import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { PlatformAuditComponent } from './platform-audit.component';

const API = 'http://api.test/api/v1';
const ORG = '33333333-3333-4333-8333-333333333333';
const event = (action: string, channel = 'api', extra: Record<string, unknown> = {}) => ({
  id: action, occurred_at: new Date().toISOString(), action, actor_name: 'Ana Gómez', target_name: 'Luis Pérez', organization_name: 'ENVIA', channel, details: { role: 'SUPER_ADMIN' }, ...extra,
});
/** Una página por cursor: `next` es el cursor de la siguiente (null = no hay más); `total` solo viene en la primera página. */
const page = (items: unknown[], next: string | null = null, total: number | null = items.length, capped = false, size = 25) => ({
  data: items, meta: { page_size: size, has_more: next !== null, next_cursor: next, total, total_capped: capped },
});

describe('PlatformAuditComponent: actividad y auditoría reales, con filtros y páginas del servidor', () => {
  let fixture: ComponentFixture<PlatformAuditComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = (selector: string): HTMLElement => el().querySelector<HTMLElement>(selector)!;
  /** Los `effect` corren al detectar cambios: se ejecuta antes de buscar la petición que dispara un clic o un evento. */
  const audit = (): TestRequest => {
    fixture.detectChanges();

    return http.expectOne((r) => r.url === `${API}/platform/audit`);
  };
  const flush = (items: unknown[], next: string | null = null, total: number | null = items.length, capped = false): TestRequest => {
    const request = audit();
    request.flush(page(items, next, total, capped));
    fixture.detectChanges();

    return request;
  };
  const click = (testId: string): void => {
    (q(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();
  };
  const choose = (testId: string, value: string): void => {
    const select = q(`[data-testid="${testId}"]`) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  /** Crea la pantalla (con `query` como parámetros de la URL), contesta la primera petición y la devuelve. */
  function render(items: unknown[], query: Record<string, string> = {}, next: string | null = null, total: number | null = items.length, capped = false): TestRequest {
    localStorage.removeItem('logyco2.platform.audit.pageSize');
    TestBed.configureTestingModule({
      imports: [PlatformAuditComponent],
      providers: [...provideTestApp(), { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } }],
    });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(PlatformAuditComponent);
    fixture.detectChanges();

    return flush(items, next, total, capped);
  }
  afterEach(() => {
    localStorage.removeItem('logyco2.platform.audit.pageSize');
  });

  it('lista las acciones registradas en español, distingue las hechas por un operador y cuenta el total', () => {
    render([event('global_role.grant'), event('organization.create', 'provisioning_cli')]);

    const text = el().textContent!;
    expect(text).toContain('Ana Gómez concedió el rol Superadministrador a Luis Pérez');
    const table = q('[data-testid="activity-table"]').textContent!;
    expect(table.match(/Operador/g)?.length).toBe(1); // solo la acción hecha por un operador lleva la marca
    expect(table).not.toContain('Consola');
    const legend = q('.legend').textContent!;
    ['Alta, activación o aceptación', 'Modificación o invitación', 'Desactivación, eliminación o cancelación', 'Revocación de un rol o borrado definitivo'].forEach((meaning) => expect(legend).toContain(meaning));
    expect(el().querySelectorAll('tbody .tone').length).toBe(2); // cada registro lleva su punto
    expect((q('tbody .tone') as HTMLElement).title).toBe('Alta, activación o aceptación'); // y su significado
    expect(q('[data-testid="audit-total"]').textContent).toBe('2');
  });

  it('por defecto pide la primera página de 25 con el período de 30 días', () => {
    const request = render([event('organization.create')]);

    expect(request.request.params.get('page_size')).toBe('25');
    expect(request.request.params.get('days')).toBe('30');
    ['cursor', 'page', 'category', 'channel', 'q', 'organization_id', 'date_from', 'date_to'].forEach((key) => expect(request.request.params.has(key)).withContext(key).toBeFalse());
  });

  it('sin eventos y sin filtros muestra un estado vacío, no datos de ejemplo', () => {
    render([]);

    expect(el().textContent).toContain('Sin actividad en este período');
    expect(q('[data-testid="empty-state"]').textContent).not.toContain('Limpiar filtros');
    expect(el().querySelector('[data-testid="activity-table"] tbody tr')).toBeNull();
  });

  it('con filtros y sin coincidencias dice «Sin resultados» y permite limpiarlos', () => {
    render([event('organization.create')]);
    choose('category-filter', 'invitations');
    flush([]);

    expect(q('[data-testid="empty-state"]').textContent).toContain('Ningún evento coincide con los filtros');
    (q('[data-testid="empty-state"] button') as HTMLButtonElement).click();
    const request = audit();

    expect(request.request.params.has('category')).toBeFalse();
    request.flush(page([event('organization.create')]));
  });

  it('el tipo de acción y el origen se piden al servidor y vuelven a la primera página (sin cursor)', () => {
    render([event('organization.create')], {}, 'c1', 80);
    click('page-next');
    const second = audit();
    expect(second.request.params.get('cursor')).toBe('c1');
    second.flush(page([event('organization.create')], null, null));
    fixture.detectChanges();

    choose('category-filter', 'relationships');
    const byCategory = flush([event('organization_link.requested')], null, 6);
    expect(byCategory.request.params.get('category')).toBe('relationships');
    expect(byCategory.request.params.has('cursor')).toBeFalse();

    choose('channel-filter', 'operator');
    const byChannel = flush([]);
    expect(byChannel.request.params.get('channel')).toBe('operator');
    expect(byChannel.request.params.get('category')).toBe('relationships'); // se combinan
  });

  it('el período: 7 días, todo el historial (sin filtro de días ni fechas) y un rango de fechas', () => {
    render([event('organization.create')]);

    choose('period-filter', '7');
    expect(flush([]).request.params.get('days')).toBe('7');

    choose('period-filter', 'all');
    const all = flush([]);
    expect(all.request.params.has('days')).toBeFalse();
    expect(all.request.params.has('date_from')).toBeFalse();

    choose('period-filter', 'range');
    const range = flush([]);
    expect(range.request.params.has('days')).toBeFalse(); // sin fechas aún: equivale a todo el historial
    const date = (testId: string, value: string): void => {
      const input = q(`[data-testid="${testId}"]`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    date('date-from', '2026-11-01');
    expect(flush([]).request.params.get('date_from')).toBe('2026-11-01');
    date('date-to', '2026-11-15');
    const both = flush([]);
    expect([both.request.params.get('date_from'), both.request.params.get('date_to')]).toEqual(['2026-11-01', '2026-11-15']);
  });

  it('un rango invertido avisa y no consulta al servidor', () => {
    render([event('organization.create')], { periodo: 'rango', desde: '2026-11-20', hasta: '2026-11-25' });
    const date = (testId: string, value: string): void => {
      const input = q(`[data-testid="${testId}"]`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };

    date('date-to', '2026-11-10');

    expect(q('[data-testid="range-error"]').textContent).toContain('anterior o igual');
    http.expectNone((r) => r.url === `${API}/platform/audit`);

    date('date-to', '2026-11-30');
    flush([]);

    expect(el().querySelector('[data-testid="range-error"]')).toBeNull();
  });

  it('la búsqueda espera a que se termine de escribir y se envía al servidor', fakeAsync(() => {
    render([event('organization.create')]);
    const input = q('[data-testid="audit-search"]') as HTMLInputElement;
    input.value = 'laura';
    input.dispatchEvent(new Event('input'));
    tick(100);
    http.expectNone((r) => r.url === `${API}/platform/audit`);

    tick(300);
    fixture.detectChanges();
    const request = audit();

    expect(request.request.params.get('q')).toBe('laura');
    request.flush(page([]));
    tick();
  }));

  it('el filtro de empresa llega por la URL, se muestra como etiqueta con su nombre y «×» lo quita', () => {
    render([event('organization.update')], { empresa: ORG });

    expect(q('[data-testid="company-tag"]').textContent).toContain('Empresa: ENVIA');
    (q('[data-testid="clear-company"]') as HTMLButtonElement).click();
    const request = audit();

    expect(request.request.params.has('organization_id')).toBeFalse();
    request.flush(page([]));
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="company-tag"]')).toBeNull();
  });

  it('el id de empresa de la URL se manda al servidor; un valor que no es un id se ignora', () => {
    const valid = render([], { empresa: ORG });
    expect(valid.request.params.get('organization_id')).toBe(ORG);

    TestBed.resetTestingModule();
    const invalid = render([], { empresa: 'no-es-un-id' });
    expect(invalid.request.params.has('organization_id')).toBeFalse();
  });

  it('restaura de la URL tipo, origen, período, búsqueda, página y tamaño; ignora valores inválidos', () => {
    const request = render([], { tipo: 'invitations', origen: 'operator', periodo: '90', q: 'ana', pagina: '3', tam: '50' });
    const params = request.request.params;

    expect([params.get('category'), params.get('channel'), params.get('days'), params.get('q'), params.get('page_size')]).toEqual(['invitations', 'operator', '90', 'ana', '50']);
    expect(params.has('page') || params.has('cursor')).toBeFalse(); // «pagina» ya no existe: con un cursor no se puede saltar a una página

    TestBed.resetTestingModule();
    const ignored = render([], { tipo: 'inventada', origen: 'otro', periodo: 'siempre', tam: '7' }).request.params;

    expect([ignored.has('category'), ignored.has('channel'), ignored.get('days'), ignored.get('page_size')]).toEqual([false, false, '30', '25']);
  });

  it('navega por cursor: «Siguiente» envía el cursor recibido y «Anterior» vuelve a la página anterior', () => {
    render([event('organization.create')], {}, 'c-page-2', 60);
    const prev = q('[data-testid="page-prev"]') as HTMLButtonElement;
    expect(prev.disabled).toBeTrue(); // primera página
    expect(el().querySelector('[aria-current="page"]')).toBeNull(); // sin páginas numeradas

    click('page-next');
    const second = flush([event('organization.update')], 'c-page-3', null);
    expect(second.request.params.get('cursor')).toBe('c-page-2');
    expect(q('[data-testid="pager"]').textContent).toContain('26–26'); // segunda página de 25: empieza en el 26

    click('page-next');
    const third = flush([event('organization.update')], null, null);
    expect(third.request.params.get('cursor')).toBe('c-page-3');
    expect((q('[data-testid="page-next"]') as HTMLButtonElement).disabled).toBeTrue(); // última página: no hay más

    click('page-prev');
    expect(flush([event('organization.update')], 'c-page-3', null).request.params.get('cursor')).toBe('c-page-2');
    click('page-prev');
    const first = flush([event('organization.create')], 'c-page-2', 60);
    expect(first.request.params.has('cursor')).toBeFalse();
  });

  it('el total llega con la primera página, se conserva al navegar y se muestra «10.000+» si está acotado', () => {
    render([event('organization.create')], {}, 'c2', 10000, true);
    expect(q('[data-testid="audit-total"]').textContent).toBe('10.000+');
    expect(q('[data-testid="pager-total"]').textContent).toBe('10.000+');

    click('page-next');
    flush([event('organization.update')], null, null); // la página 2 no trae total
    expect(q('[data-testid="audit-total"]').textContent).toBe('10.000+');

    choose('category-filter', 'access'); // otros filtros: el total anterior ya no vale
    expect(q('[data-testid="audit-total"]').textContent).toBe('…');
    flush([event('user.update')], null, 7);
    expect(q('[data-testid="audit-total"]').textContent).toBe('7');
  });

  it('cambiar el tamaño de página vuelve a la primera y lo recuerda', () => {
    render([event('organization.create')], {}, 'c2', 80);
    click('page-next');
    flush([event('organization.update')], null, null);

    choose('page-size', '50');
    const resized = flush([event('organization.create')], null, 80);

    expect([resized.request.params.get('page_size'), resized.request.params.has('cursor')]).toEqual(['50', false]);
    expect(localStorage.getItem('logyco2.platform.audit.pageSize')).toBe('50');
    expect(q('[data-testid="page-size"]').querySelectorAll('option').length).toBe(3); // 25, 50 y 100
  });

  it('una petición obsoleta se cancela y su respuesta tardía nunca se muestra', () => {
    render([event('organization.create')]);
    choose('category-filter', 'access');
    choose('channel-filter', 'operator');
    const [stale, current] = http.match((r) => r.url === `${API}/platform/audit`);

    expect(stale.cancelled).toBeTrue();
    expect(current.cancelled).toBeFalse();
    current.flush(page([event('user.update', 'provisioning_cli')]));
    fixture.detectChanges();

    expect(q('[data-testid="activity-table"]').textContent).toContain('Operador');
  });

  it('el detalle se pide solo al abrir un evento y muestra los metadatos permitidos con sus rótulos', () => {
    render([event('membership.status_change')]);
    http.expectNone((r) => r.url.includes('/platform/audit/'));

    (q('[data-testid="activity-row"]') as HTMLElement).click();
    fixture.detectChanges();
    const detail = http.expectOne(`${API}/platform/audit/membership.status_change`);
    detail.flush({ data: { ...event('membership.status_change'), target_id: null, details: { to_status: 'ACTIVE', role: 'SUPER_ADMIN', changes: { full_name: 'updated' } } }, meta: {} });
    fixture.detectChanges();

    const panel = q('[data-testid="audit-detail"]');
    expect(panel.textContent).toContain('Ana Gómez');
    expect(q('[data-testid="audit-metadata"]').textContent).toContain('Nuevo estado');
    expect(q('[data-testid="audit-metadata"]').textContent).not.toContain('ACTIVE'); // sin códigos técnicos
    expect(q('[data-testid="audit-metadata"]').textContent).not.toContain('SUPER_ADMIN');
    expect(q('[data-testid="audit-metadata"]').textContent).toContain('full_name: updated');
    (q('[data-testid="close-detail"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="audit-detail"]')).toBeNull();
  });

  it('el detalle cierra con Escape, avisa si no hay metadatos y permite reintentar un error', () => {
    render([event('organization.create')]);
    const open = (): void => { (q('[data-testid="activity-row"]') as HTMLElement).click(); fixture.detectChanges(); };

    open();
    http.expectOne(`${API}/platform/audit/organization.create`).flush({ data: { ...event('organization.create'), target_id: null, details: {} }, meta: {} });
    fixture.detectChanges();
    expect(q('[data-testid="no-metadata"]').textContent).toContain('no tiene información adicional');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="audit-detail"]')).toBeNull();

    open();
    http.expectOne(`${API}/platform/audit/organization.create`).flush({ error: { message: 'x' } }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(q('[data-testid="audit-detail"] [role="alert"]')).not.toBeNull();
    (q('[data-testid="audit-detail"] [role="alert"] button') as HTMLButtonElement).click();
    http.expectOne(`${API}/platform/audit/organization.create`).flush({ data: { ...event('organization.create'), target_id: null, details: { role: 'ADMIN' } }, meta: {} });
    fixture.detectChanges();
    expect(q('[data-testid="audit-metadata"]').textContent).toContain('Rol');
  });

  it('«Limpiar filtros» solo aparece si hay algo que limpiar y vuelve al estado inicial', () => {
    render([event('organization.create')]);
    expect(el().querySelector('[data-testid="clear-filters"]')).toBeNull();

    choose('category-filter', 'access');
    flush([]);
    choose('channel-filter', 'console');
    flush([]);
    (q('[data-testid="clear-filters"]') as HTMLButtonElement).click();
    const request = audit();

    expect(['category', 'channel', 'q'].some((key) => request.request.params.has(key))).toBeFalse();
    expect(request.request.params.get('days')).toBe('30');
    request.flush(page([]));
  });

  it('nunca muestra contraseñas, tokens ni códigos de invitación', () => {
    render([event('super_admin.invite', 'api', { details: { invitee: 'lu***@x.co' } })]);

    const table = q('[data-testid="activity-table"]').textContent!.toLowerCase();

    ['password', 'contraseña', 'token', 'sa_'].forEach((word) => expect(table).not.toContain(word));
  });
});
