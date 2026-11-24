import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, importDetailDto, importSummaryDto, vehiclesDetectedDto } from '../../../testing/imports';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { pagedBody } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { toImportSummary } from '../../infrastructure/mappers/imports.mappers';
import { VehiclesFoundModalComponent } from './vehicles-found-modal.component';

const DECISIONS = `${IMPORTS_URL}/imp-1/vehicles/decisions`;

describe('VehiclesFoundModalComponent: aviso de vehículos detectados', () => {
  let fixture: ComponentFixture<VehiclesFoundModalComponent>;
  let http: HttpTestingController;
  let reviews: number;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const click = (selector: string): void => {
    q(selector)!.click();
    fixture.detectChanges();
  };

  function render(options: { roles?: string[]; counts?: Parameters<typeof vehiclesDetectedDto>[0] } = {}): void {
    TestBed.configureTestingModule({ imports: [VehiclesFoundModalComponent], providers: [...provideTestApp(), provideRouter([])] });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, options.roles ?? ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    reviews = 0;
    fixture = TestBed.createComponent(VehiclesFoundModalComponent);
    fixture.componentRef.setInput('summary', toImportSummary(importSummaryDto({ vehicles_detected: vehiclesDetectedDto(options.counts) })));
    fixture.componentInstance.review.subscribe(() => reviews++);
    fixture.detectChanges();
  }

  /** Atiende lo que sigue a una decisión: el detalle de la carga y el historial. */
  function flushRefresh(): void {
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` }).flush({ data: importDetailDto({ vehicles_detected: vehiclesDetectedDto({ new: 0 }) }) });
    http.expectOne((r) => r.url === IMPORTS_URL && r.method === 'GET').flush(pagedBody([]));
    fixture.detectChanges();
  }

  const accepted = (count: number, extra: object = {}): object => ({ data: { accepted: count, rejected: 0, skipped: 0, skipped_reasons: [], remaining: 0, ...extra } });

  afterEach(() => http?.match(() => true));

  it('se abre como diálogo modal con el título, el archivo y los conteos', () => {
    render({ counts: { new: 3, changed: 2 } });

    expect(q<HTMLDialogElement>('dialog')!.open).toBeTrue();
    expect(text('#vf-title')).toBe('Encontramos 3 vehículos nuevos');
    expect(text('[data-testid="modal-text"]')).toContain('operaciones-marzo.xlsx');
    expect(Array.from(el().querySelectorAll('.chip')).map((c) => c.textContent!.trim())).toEqual(['3 nuevos', '2 con cambios']);
    expect(text('[data-testid="modal-register"]')).toBe('Registrar 3 vehículos');
  });

  it('con un solo vehículo nuevo usa el singular', () => {
    render({ counts: { new: 1, changed: 0 } });

    expect(text('#vf-title')).toBe('Encontramos 1 vehículo nuevo');
    expect(text('[data-testid="modal-register"]')).toBe('Registrar 1 vehículo');
  });

  it('se centra en el área de contenido: respeta el ancho del menú lateral que publica el shell', () => {
    const root = document.documentElement.style;

    root.setProperty('--dlg-left', '240px', 'important'); // gana a la regla móvil (< 900 px) de styles.scss, que es la del navegador de pruebas
    render();

    try {
      const style = getComputedStyle(q<HTMLDialogElement>('dialog')!);

      expect(style.left).toBe('240px');
      expect(parseFloat(style.width)).toBeLessThanOrEqual(window.innerWidth - 240 - 32 + 1);
    } finally {
      root.removeProperty('--dlg-left');
    }
  });

  it('dibuja la escena del camión, decorativa para los lectores de pantalla', () => {
    render();

    expect(q('.scene')!.getAttribute('aria-hidden')).toBe('true');
    expect(q('.scene app-truck-art')).not.toBeNull();
  });

  it('«Registrar» acepta solo los nuevos, muestra el camión avanzando y luego el resultado', () => {
    render({ counts: { new: 2, changed: 1 } });

    click('[data-testid="modal-register"]');
    const request = http.expectOne({ method: 'POST', url: DECISIONS });

    expect(request.request.body).toEqual({ decision: 'ACCEPT', kind: 'NEW' });
    expect(text('#vf-title')).toBe('Registrando vehículos');
    expect(q('app-truck-progress [role="progressbar"]')).not.toBeNull();

    request.flush(accepted(2));
    fixture.detectChanges();

    expect(text('#vf-title')).toBe('¡Listo! 2 vehículos registrados');
    expect(text('[data-testid="modal-done-text"]')).toBe('Ya aparecen en Mis vehículos.');
    flushRefresh();
  });

  it('tras registrar, si quedan cambios por revisar, los ofrece sin cerrar el aviso', () => {
    render({ counts: { new: 2, changed: 1 } });

    click('[data-testid="modal-register"]');
    http.expectOne({ method: 'POST', url: DECISIONS }).flush(accepted(2));
    fixture.detectChanges();
    flushRefresh();

    expect(text('[data-testid="modal-review-changes"]')).toBe('Revisar 1 cambio');
    click('[data-testid="modal-review-changes"]');

    expect(reviews).toBe(1);
    expect(q<HTMLDialogElement>('dialog')!.open).toBeTrue();
  });

  it('cuando se omitió alguno explica el motivo con su etiqueta', () => {
    render({ counts: { new: 2, changed: 0 } });

    click('[data-testid="modal-register"]');
    http.expectOne({ method: 'POST', url: DECISIONS }).flush(accepted(1, { skipped: 1, skipped_reasons: [{ code: 'ALREADY_REGISTERED', rows: 1 }] }));
    fixture.detectChanges();

    expect(text('[data-testid="modal-skipped"]')).toBe('La placa ya estaba registrada: 1');
    flushRefresh();
  });

  it('si el servidor falla muestra el error y deja reintentar', () => {
    render({ counts: { new: 2, changed: 0 } });

    click('[data-testid="modal-register"]');
    http.expectOne({ method: 'POST', url: DECISIONS }).flush({ error: { code: 'INTERNAL', message: 'Falló' } }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    flushRefresh();  // tras un error también se recarga la carga: los conteos no quedan viejos

    expect(text('#vf-title')).toBe('No se completó el registro');
    expect(text('[data-testid="modal-error"]')).toBe('Ocurrió un error inesperado. Inténtalo de nuevo. No se registró ninguno; reintenta cuando quieras.');

    click('[data-testid="modal-retry"]');
    http.expectOne({ method: 'POST', url: DECISIONS }).flush(accepted(2));
    fixture.detectChanges();

    expect(text('#vf-title')).toBe('¡Listo! 2 vehículos registrados');
    flushRefresh();
  });

  it('con 1.926 nuevos lo dice y los registra en UNA sola petición por tipo', () => {
    render({ counts: { new: 1926, changed: 0 } });

    click('[data-testid="modal-register"]');

    expect(text('[data-testid="modal-working"]')).toContain('Registrando 1.926 vehículos…');
    const request = http.expectOne({ method: 'POST', url: DECISIONS });
    expect(request.request.body).toEqual({ decision: 'ACCEPT', kind: 'NEW' });
    http.expectNone((r) => r.method === 'GET' && r.url.endsWith('/vehicles'));  // sin recolectar ids
    request.flush(accepted(1926));
    fixture.detectChanges();

    expect(text('#vf-title')).toBe('¡Listo! 1926 vehículos registrados');
    flushRefresh();
  });

  it('si falla tras registrar parte, dice cuántos quedaron registrados y deja reintentar', () => {
    render({ counts: { new: 1926, changed: 0 } });

    click('[data-testid="modal-register"]');
    http.expectOne({ method: 'POST', url: DECISIONS }).flush({ error: { code: 'INTERNAL', message: 'Falló' } }, { status: 500, statusText: 'Server Error' });
    flushRefresh();
    fixture.componentRef.setInput('summary', toImportSummary(importSummaryDto({ vehicles_detected: vehiclesDetectedDto({ new: 926, changed: 0 }) })));
    fixture.detectChanges();

    expect(text('[data-testid="modal-error"]')).toBe('Se registraron 1.000 de 1.926 vehículos; reintenta para completar el resto.');
    expect(q('[data-testid="modal-retry"]')).not.toBeNull();
  });

  it('«Revisar uno por uno» pide abrir la revisión sin decidir nada', () => {
    render();

    click('[data-testid="modal-review"]');

    expect(reviews).toBe(1);
    http.expectNone({ method: 'POST', url: DECISIONS });
  });

  it('«Más tarde» cierra el diálogo', () => {
    render();

    click('[data-testid="modal-close"]');

    expect(q<HTMLDialogElement>('dialog')!.open).toBeFalse();
  });

  it('solo con cambios ofrece revisarlos en vez de registrar', () => {
    render({ counts: { new: 0, changed: 2 } });

    expect(text('#vf-title')).toBe('2 vehículos cambiaron sus datos');
    expect(q('[data-testid="modal-register"]')).toBeNull();
    expect(text('[data-testid="modal-review-changes"]')).toBe('Revisar cambios');
  });

  it('quien no administra vehículos solo ve el aviso: sin registrar y con la nota del administrador', () => {
    render({ roles: ['ORG_ANALYST'], counts: { new: 2, changed: 0 } });

    expect(q('[data-testid="modal-register"]')).toBeNull();
    expect(text('[data-testid="modal-text"]')).toBe('Un administrador de tu empresa debe aprobar su registro.');
    expect(text('[data-testid="modal-view"]')).toBe('Ver vehículos');
    expect(text('[data-testid="modal-close"]')).toBe('Entendido');
  });
});
