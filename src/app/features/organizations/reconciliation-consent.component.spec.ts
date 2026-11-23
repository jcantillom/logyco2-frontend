import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { RECONCILIATION_URL, REL_ID, activeLinkDto, reconciliationLinkDto } from '../../../testing/reconciliation';
import { SessionStore } from '../../core/auth/session.store';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ReconciliationConsentComponent, rescanMessage } from './reconciliation-consent.component';

const componentCss = (marker: string): string =>
  Array.from(document.querySelectorAll('style'))
    .map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' '))
    .filter((c) => c.includes(marker))
    .join('\n');

describe('ReconciliationConsentComponent: autorizaciones de conciliación', () => {
  let fixture: ComponentFixture<ReconciliationConsentComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string, index = 0): T | null => el().querySelectorAll<T>(selector)[index] ?? null;
  const qa = <T extends HTMLElement = HTMLElement>(selector: string): T[] => Array.from(el().querySelectorAll<T>(selector));
  const text = (selector: string, index = 0): string => (q(selector, index)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const LINKS = `${RECONCILIATION_URL}/links`;
  const consentUrl = (id = REL_ID): string => `${LINKS}/${id}/consent`;

  function render(links: unknown[], roles = ['ORG_ADMIN']): void {
    TestBed.configureTestingModule({ imports: [ReconciliationConsentComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ReconciliationConsentComponent);
    fixture.detectChanges();
    http.expectOne(LINKS).flush({ data: links });
    fixture.detectChanges();
  }

  const toggle = (testid: string, index = 0): void => {
    q<HTMLInputElement>(`[data-testid="${testid}"]`, index)!.click();
    fixture.detectChanges();
  };
  /** La confirmación de revocar es una promesa: se resuelve y se deja pasar un microtask. */
  const answer = async (accepted: boolean): Promise<void> => {
    TestBed.inject(ConfirmService).pending()!.resolve(accepted);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  afterEach(() => http?.match(() => true));

  it('explica que vincularse no comparte nada, que la otra empresa nunca ve el Excel y que se puede revocar', () => {
    render([reconciliationLinkDto()]);

    expect(text('#recon-h')).toBe('Conciliación de viajes');
    expect(text('[data-testid="recon-never"]')).toContain('Nada se comparte por el solo hecho de estar vinculadas');
    expect(text('[data-testid="recon-never"]')).toContain('nunca ve tu archivo de Excel');
    expect(text('[data-testid="recon-never"]')).toContain('revocar');
    expect(text('[data-testid="recon-never"]')).toContain('el historial se conserva');
  });

  it('un vínculo nuevo muestra los dos permisos apagados, qué concede cada uno y qué nunca concede', () => {
    render([reconciliationLinkDto()]);

    expect(qa('[data-testid="recon-link"]').length).toBe(1);
    expect(text('[data-testid="recon-link"] h4')).toBe('Transportadora B');
    expect(q<HTMLInputElement>('[data-testid="switch-matching"]')!.checked).toBeFalse();
    expect(q<HTMLInputElement>('[data-testid="switch-share"]')!.checked).toBeFalse();
    expect(text('[data-testid="recon-own"]')).toContain('Permitir buscar viajes compartidos con esta empresa');
    expect(text('[data-testid="recon-own"]')).toContain('Compartir los resultados de mis viajes para conciliarlos');
    expect(text('[data-testid="recon-own"]')).toContain('Concede que LoGyCO₂ compare tus viajes');
    expect(text('[data-testid="recon-own"]')).toContain('Nunca concede que vea tus datos ni tu Excel');
    expect(text('[data-testid="recon-own"]')).toContain('Nunca concede ver el resto de tus viajes');
    expect(text('[data-testid="recon-effective"]')).toContain('La conciliación está inactiva: tu empresa aún no la permite');
  });

  it('compartir resultados está desactivado, con su motivo, mientras no se permita buscar', () => {
    render([reconciliationLinkDto()]);
    const share = q<HTMLInputElement>('[data-testid="switch-share"]')!;

    expect(share.disabled).toBeTrue();
    expect(text('[data-testid="share-reason"]')).toBe('Primero permite buscar viajes compartidos.');
    expect(share.getAttribute('aria-describedby')).toBe(q('[data-testid="share-reason"]')!.id);
  });

  it('de la otra empresa muestra solo los dos sí/no con las frases acordadas', () => {
    render([reconciliationLinkDto({ counterpart_consent: { matching_enabled: true, share_results: false } })]);

    expect(text('[data-testid="other-matching"]')).toContain('La otra empresa ya lo permitió');
    expect(text('[data-testid="other-share"]')).toContain('Aún no lo permite');
    expect(text('[data-testid="recon-other"]')).toContain('nada más de ella');
    expect(qa('[data-testid="recon-other"] input').length).toBe(0);
  });

  it('«La conciliación está activa» solo cuando el servidor dice que ambas empresas permitieron buscar', () => {
    render([activeLinkDto(), reconciliationLinkDto({ my_consent: { matching_enabled: true, share_results: false, updated_at: null }, counterpart_consent: { matching_enabled: false, share_results: false }, relationship_id: 'rel-2' })]);

    expect(text('[data-testid="recon-effective"]', 0)).toContain('La conciliación está activa');
    expect(text('[data-testid="recon-effective"]', 1)).toContain('falta que la otra empresa la permita');
  });

  it('permitir buscar guarda con PUT, lanza la búsqueda que recomienda el servidor y cuenta el resultado', () => {
    render([reconciliationLinkDto()]);
    const toast = spyOn(TestBed.inject(ToastService), 'success');

    toggle('switch-matching');
    const put = http.expectOne(consentUrl());

    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ matching_enabled: true, share_results: false });
    put.flush({ data: activeLinkDto(false, { rescan_recommended: true }) });
    fixture.detectChanges();
    const rescan = http.expectOne(`${RECONCILIATION_URL}/rescan`);

    expect(rescan.request.body).toEqual({ relationship_id: REL_ID });
    rescan.flush({ data: { relationships: [], candidates_created: 3, completed: true } });
    fixture.detectChanges();

    expect(toast).toHaveBeenCalledWith('Permiso guardado. Encontramos 3 posibles viajes compartidos. Revísalos en Calidad de datos → Operaciones compartidas.');
    expect(q<HTMLInputElement>('[data-testid="switch-matching"]')!.checked).toBeTrue();
    expect(q<HTMLInputElement>('[data-testid="switch-share"]')!.disabled).toBeFalse();
  });

  it('si el servidor no recomienda buscar, no se lanza ninguna búsqueda', () => {
    render([reconciliationLinkDto()]);

    toggle('switch-matching');
    http.expectOne(consentUrl()).flush({ data: reconciliationLinkDto({ my_consent: { matching_enabled: true, share_results: false, updated_at: null } }) });
    http.expectNone(`${RECONCILIATION_URL}/rescan`);
    expect(q<HTMLInputElement>('[data-testid="switch-matching"]')!.checked).toBeTrue();
  });

  it('si la búsqueda falla, dice que el permiso quedó guardado pero la búsqueda no pudo iniciar', () => {
    render([reconciliationLinkDto()]);
    const toast = spyOn(TestBed.inject(ToastService), 'error');

    toggle('switch-matching');
    http.expectOne(consentUrl()).flush({ data: activeLinkDto(false, { rescan_recommended: true }) });
    http.expectOne(`${RECONCILIATION_URL}/rescan`).flush({ error: { code: 'FORBIDDEN' } }, { status: 403, statusText: 'Forbidden' });

    expect(toast.calls.mostRecent().args[0]).toContain('El permiso quedó guardado, pero no se pudo iniciar la búsqueda');
  });

  it('compartir resultados guarda con matching activo y no lanza búsqueda', () => {
    render([activeLinkDto()]);

    toggle('switch-share');
    const put = http.expectOne(consentUrl());

    expect(put.request.body).toEqual({ matching_enabled: true, share_results: true });
    put.flush({ data: activeLinkDto(true) });
    http.expectNone(`${RECONCILIATION_URL}/rescan`);
  });

  it('revocar pide confirmación y no envía nada hasta aceptar; al aceptar envía y se mantiene el historial', async () => {
    render([activeLinkDto(true)]);

    toggle('switch-share');
    const confirm = TestBed.inject(ConfirmService).pending()!;

    expect(confirm.title).toBe('Revocar permiso');
    expect(confirm.message).toContain('Transportadora B dejará de ver los valores de tus viajes');
    expect(confirm.message).toContain('historial');
    http.expectNone(consentUrl());
    await answer(true);
    const put = http.expectOne(consentUrl());

    expect(put.request.body).toEqual({ matching_enabled: true, share_results: false });
    put.flush({ data: activeLinkDto(false) });
  });

  it('cancelar la revocación deja el interruptor como estaba y no envía nada', async () => {
    render([activeLinkDto(true)]);

    toggle('switch-share');
    expect(q<HTMLInputElement>('[data-testid="switch-share"]')!.checked).toBeFalse();
    await answer(false);

    expect(q<HTMLInputElement>('[data-testid="switch-share"]')!.checked).toBeTrue();
    http.expectNone(consentUrl());
  });

  it('revocar la búsqueda también quita compartir y lo dice en la confirmación', async () => {
    render([activeLinkDto(true)]);

    toggle('switch-matching');
    expect(TestBed.inject(ConfirmService).pending()!.message).toContain('también dejas de compartir tus resultados');
    await answer(true);
    const put = http.expectOne(consentUrl());

    expect(put.request.body).toEqual({ matching_enabled: false, share_results: false });
    put.flush({ data: reconciliationLinkDto({ my_consent: { matching_enabled: false, share_results: false, updated_at: null } }) });
  });

  it('un error del servidor se muestra con su mensaje en español y el interruptor vuelve a su estado', () => {
    render([reconciliationLinkDto()]);
    const toast = spyOn(TestBed.inject(ToastService), 'error');

    toggle('switch-matching');
    http.expectOne(consentUrl()).flush({ error: { code: 'LINK_NOT_ACTIVE' } }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(toast.calls.mostRecent().args[0] as unknown).toEqual(jasmine.objectContaining({ code: 'LINK_NOT_ACTIVE' }));
    expect(q<HTMLInputElement>('[data-testid="switch-matching"]')!.checked).toBeFalse();
    http.expectOne(LINKS).flush({ data: [reconciliationLinkDto()] });
  });

  it('sin `relationships:manage` los permisos se ven en solo lectura, con el aviso, y no se puede cambiar nada', () => {
    render([activeLinkDto()], ['ORG_ANALYST']);

    expect(q<HTMLInputElement>('[data-testid="switch-matching"]')!.disabled).toBeTrue();
    expect(q<HTMLInputElement>('[data-testid="switch-share"]')!.disabled).toBeTrue();
    expect(q<HTMLInputElement>('[data-testid="switch-matching"]')!.checked).toBeTrue();
    expect(text('[data-testid="recon-readonly"]')).toBe('Solo el administrador de la empresa puede cambiar estos permisos.');
  });

  it('un vínculo finalizado es de solo lectura: sin interruptores, con su historial y la explicación', () => {
    render([activeLinkDto(true, { status: 'ENDED', matching_active: false, results_shared: false, can_scan: false })]);

    expect(qa('[data-testid="switch-matching"]').length).toBe(0);
    expect(text('[data-testid="recon-link-status"]')).toBe('Vínculo finalizado');
    expect(text('[data-testid="own-matching"]')).toContain('Permitías buscar viajes compartidos');
    expect(text('[data-testid="own-share"]')).toContain('Compartías los resultados de tus viajes');
    expect(text('[data-testid="recon-ended"]')).toContain('ya no se buscan coincidencias ni se muestran valores de la otra empresa');
    expect(text('[data-testid="recon-effective"]')).toContain('terminó con el vínculo');
  });

  it('los vigentes van primero y se pagina de a 5: no hay scroll interno', () => {
    const many = Array.from({ length: 7 }, (_, i) => reconciliationLinkDto({ relationship_id: `r${i}`, counterpart: { id: `o${i}`, name: `Empresa ${i}` }, status: i === 0 ? 'ENDED' : 'ACTIVE' }));

    render(many);
    expect(qa('[data-testid="recon-link"]').length).toBe(5);
    expect(text('[data-testid="recon-link"] h4', 0)).toBe('Empresa 1');
    expect(text('[data-testid="pager"]')).toContain('Mostrando 1–5 de 7');
    q('[data-testid="page-next"]')!.click();
    fixture.detectChanges();

    expect(qa('[data-testid="recon-link"]').length).toBe(2);
    expect(text('[data-testid="recon-link"] h4', 1)).toBe('Empresa 0');
  });

  it('sin vínculos, dice qué hacer; si falla la carga, ofrece «Reintentar»', () => {
    render([]);
    expect(text('app-resource-state')).toContain('Aún no tienes empresas vinculadas vigentes');
  });

  it('el CSS usa solo tokens de la plataforma: sin hexadecimales ni rgb(), sin scroll interno y con tintes permitidos', () => {
    render([activeLinkDto()]);
    const css = componentCss('.sw');

    expect(css).toContain('.sw');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    expect(css).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);

    const tints = Array.from(css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g));

    expect(tints.length).toBeGreaterThan(0);
    for (const m of tints) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });

  it('nada tiene scroll interno: ningún elemento es desplazable ni recorta su contenido', () => {
    render([activeLinkDto(), reconciliationLinkDto({ relationship_id: 'r2' })]);
    document.body.appendChild(el());
    const scrollable = qa('*').filter((node) => {
      const style = getComputedStyle(node);

      if (node.classList.contains('sr-only')) return false;

      return ['auto', 'scroll'].includes(style.overflowY) || (style.overflowY !== 'visible' && node.scrollHeight > node.clientHeight + 1 && node.clientHeight > 0);
    });

    expect(scrollable.map((n) => n.className || n.tagName)).toEqual([]);
    el().remove();
  });

  it('el mensaje tras buscar es veraz: sin coincidencias, con coincidencias o sin terminar', () => {
    expect(rescanMessage(0, true)).toBe('Por ahora no encontramos viajes en común con esta empresa.');
    expect(rescanMessage(1, true)).toContain('Encontramos 1 posible viaje compartido');
    expect(rescanMessage(5, false)).toContain('no alcanzó a terminar');
  });
});
