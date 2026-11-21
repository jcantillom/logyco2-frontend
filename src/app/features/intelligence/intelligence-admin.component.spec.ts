import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ActionFeedbackService } from '../../core/notifications/action-feedback.service';
import { ToastService } from '../../core/notifications/toast.service';
import { IntelligenceAdminComponent } from './intelligence-admin.component';

const API = 'http://api.test/api/v1/intelligence';
const sources = [
  { code: 'DANE_ICTC', name: 'ICTC', publisher: 'DANE', url: 'https://www.dane.gov.co', acquisition: 'AUTOMATIC', provider_available: true, frequency: 'Mensual', license: null, notes: null, last_attempt_at: '2026-11-18T09:00:00Z', last_success_at: '2026-11-18T09:00:00Z', last_error_code: null, last_run_status: 'SUCCESS', last_run_inserted: 1, last_run_revised: 0 },
  { code: 'MINENERGIA_GNCV', name: 'GNCV', publisher: 'MinEnergía', url: 'https://www.datos.gov.co', acquisition: 'AUTOMATIC', provider_available: true, frequency: 'Mensual', license: 'CC BY-SA 4.0', notes: null, last_attempt_at: '2026-11-18T09:00:00Z', last_success_at: '2026-11-17T09:00:00Z', last_error_code: 'GNCV_UNREACHABLE', last_run_status: 'FAILED', last_run_inserted: 0, last_run_revised: 0 },
  { code: 'FUTURA', name: 'Fuente futura', publisher: 'Entidad', url: 'https://example.test', acquisition: 'AUTOMATIC', provider_available: false, frequency: 'Mensual', license: null, notes: 'Pendiente de una fuente automática.', last_attempt_at: null, last_success_at: null, last_error_code: null, last_run_status: null, last_run_inserted: null, last_run_revised: null },
];

describe('IntelligenceAdminComponent (administración de fuentes)', () => {
  let fixture: ComponentFixture<IntelligenceAdminComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const loadAll = (): void => {
    http.match((r) => r.url === `${API}/sources`).forEach((r) => !r.cancelled && r.flush({ data: { items: sources } }));
    ['/summary', '/ictc/groups', '/indicators/FUEL_ACPM_PRICE/areas', '/indicators/FUEL_GASOLINE_PRICE/areas', '/indicators/FUEL_GNCV_PRICE/areas', '/indicators/FUEL_ACPM_PRICE/history', '/indicators/ICTC_TOTAL/history'].forEach((path) => http.match((r) => r.url === `${API}${path}`).forEach((r) => !r.cancelled && r.flush({ error: { code: 'X', message: 'x' } }, { status: 500, statusText: 'x' })));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [IntelligenceAdminComponent], providers: [...provideTestApp(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(IntelligenceAdminComponent);
    fixture.detectChanges();
    loadAll();
  });

  it('lista cada fuente con su estado, su último éxito y su último error', () => {
    const cards = Array.from(el().querySelectorAll('[data-testid="admin-sources"] article'));
    expect(cards.map((c) => c.querySelector('[data-testid="status"]')!.textContent!.trim())).toEqual(['Actualizado', 'Con error', 'Pendiente']);
    expect(cards[1].textContent).toContain('La última actualización falló: datos.gov.co no respondió');
    expect(cards[1].textContent).toContain('Se conservan los últimos datos válidos');
  });

  it('una fuente sin proveedor automático no ofrece actualizar y lo explica', () => {
    const pending = el().querySelector('[data-source="FUTURA"]')!;

    expect(pending.querySelector('[data-testid="refresh"]')).toBeNull();
    expect(pending.textContent).toContain('Sin proveedor automático');
  });

  it('«Actualizar ahora» hace POST a la fuente, avisa el resultado y recarga el tablero', () => {
    const feedback = TestBed.inject(ActionFeedbackService);
    spyOn(feedback, 'finish');
    el().querySelector<HTMLButtonElement>('[data-source="DANE_ICTC"] [data-testid="refresh"]')!.click();
    const post = http.expectOne(`${API}/sources/DANE_ICTC/refresh`);
    expect(post.request.method).toBe('POST');
    post.flush({ data: { source_code: 'DANE_ICTC', status: 'SUCCESS', records_seen: 785, inserted: 3, revised: 0, unchanged: 782, error_code: null } });

    expect(feedback.finish).toHaveBeenCalledWith('Actualización completa: 3 nuevos, 0 revisados, 782 sin cambios');
    expect(http.match((r) => r.url === `${API}/sources`).length).toBeGreaterThan(0); // recarga
  });

  it('si la fuente falla, avisa con el motivo y que se conservan los últimos datos válidos', () => {
    const toast = TestBed.inject(ToastService);
    spyOn(toast, 'warning');
    el().querySelector<HTMLButtonElement>('[data-source="MINENERGIA_GNCV"] [data-testid="refresh"]')!.click();
    http.expectOne(`${API}/sources/MINENERGIA_GNCV/refresh`).flush({ data: { source_code: 'MINENERGIA_GNCV', status: 'FAILED', records_seen: 0, inserted: 0, revised: 0, unchanged: 0, error_code: 'GNCV_UNREACHABLE' } });

    expect(toast.warning).toHaveBeenCalledWith('No se pudo actualizar: datos.gov.co no respondió. Se conservan los últimos datos válidos.');
  });

  it('«Actualizar todas» solo recorre las fuentes con proveedor automático', () => {
    el().querySelector<HTMLButtonElement>('[data-testid="refresh-all"]')!.click();

    http.expectOne(`${API}/sources/DANE_ICTC/refresh`).flush({ data: { source_code: 'DANE_ICTC', status: 'SUCCESS', records_seen: 1, inserted: 0, revised: 0, unchanged: 1, error_code: null } });
    http.expectOne(`${API}/sources/MINENERGIA_GNCV/refresh`).flush({ data: { source_code: 'MINENERGIA_GNCV', status: 'SUCCESS', records_seen: 1, inserted: 0, revised: 0, unchanged: 1, error_code: null } });
    expect(http.match((r) => r.url.endsWith('/refresh')).length).toBe(0);
  });
});
