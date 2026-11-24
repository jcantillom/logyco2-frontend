import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { ORG_ENVIA, buildUser, membership } from '../../../testing/builders';
import { EXPORTS_URL, exportJobDto, exportsBody, runningExportDto } from '../../../testing/operations';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { OperationExportsComponent } from './operation-exports.component';
import { OperationExportsFacade } from './operation-exports.facade';

describe('OperationExportsComponent: panel «Reportes»', () => {
  let fixture: ComponentFixture<OperationExportsComponent>;
  let http: HttpTestingController;
  let facade: OperationExportsFacade;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = <T extends HTMLElement = HTMLElement>(selector: string): T[] => Array.from(el().querySelectorAll<T>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const list = (): TestRequest => http.expectOne((r) => r.url === EXPORTS_URL && r.method === 'GET');

  function render(...jobs: ReturnType<typeof exportJobDto>[]): void {
    TestBed.configureTestingModule({ imports: [OperationExportsComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_VIEWER'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(OperationExportsFacade);
    fixture = TestBed.createComponent(OperationExportsComponent);
    fixture.detectChanges();
    list().flush(exportsBody(...jobs));
    fixture.detectChanges();
  }

  const open = (): void => {
    q<HTMLButtonElement>('[data-testid="exports-button"]')!.click();
    fixture.detectChanges();
  };

  afterEach(() => {
    fixture?.destroy();
    http.verify();
  });

  it('el botón «Reportes» trae la insignia con los reportes en marcha y listos, y el panel empieza cerrado', () => {
    render(runningExportDto(50000), exportJobDto(), exportJobDto({ id: 'old', status: 'EXPIRED', downloadable: false }));

    expect(text('[data-testid="exports-button"]')).toContain('Reportes');
    expect(text('[data-testid="exports-count"]')).toBe('2');
    expect(q('[data-testid="exports-count"]')!.getAttribute('aria-label')).toBe('2 reportes activos o listos');
    expect(q('[data-testid="exports-panel"]')).toBeNull();
    expect(q('[data-testid="exports-button"]')!.getAttribute('aria-expanded')).toBe('false');
    expect(q('[data-testid="exports-button"]')!.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('sin reportes no hay insignia y el panel lo dice', () => {
    render();
    expect(q('[data-testid="exports-count"]')).toBeNull();
    open();

    expect(text('[data-testid="exports-empty"]')).toContain('Todavía no hay reportes');
  });

  it('cada estado se dice con texto (no solo color): En cola, Generando n %, Listo, Falló, Cancelado y Vencido', () => {
    render(
      exportJobDto({ id: 'q', status: 'QUEUED', progress: 0, downloadable: false, size_bytes: null }), runningExportDto(125000), exportJobDto({ id: 'ok' }),
      exportJobDto({ id: 'bad', status: 'FAILED', error_code: 'EXPORT_FAILED', downloadable: false, progress: null, size_bytes: null }),
      exportJobDto({ id: 'cx', status: 'CANCELED', downloadable: false, progress: null, size_bytes: null }), exportJobDto({ id: 'ex', status: 'EXPIRED', downloadable: false, progress: null }),
    );
    open();

    expect(qa('[data-testid="export-status"]').map((chip) => chip.textContent!.trim())).toEqual(['En cola', 'Generando 50 %', 'Listo', 'Falló', 'Cancelado']);  // máximo 5 a la vez
    expect(text('[data-testid="exports-more"]')).toBe('Ver más (1)');
    expect(q('[data-testid="exports-more"]')!.getAttribute('aria-expanded')).toBe('false');

    q<HTMLButtonElement>('[data-testid="exports-more"]')!.click();
    fixture.detectChanges();

    expect(qa('[data-testid="export-status"]').map((chip) => chip.textContent!.trim()).at(-1)).toBe('Vencido');
    expect(text('[data-testid="exports-more"]')).toBe('Ver menos');
  });

  it('un reporte generándose muestra una barra determinada con valores accesibles; el listo, tamaño, quién lo pidió y vencimiento', () => {
    render(runningExportDto(125000), exportJobDto());
    open();
    const bar = q('[data-testid="export-progress"]')!;

    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('50%');
    const done = q('[data-testid="export-job-1"]')!;

    expect(done.textContent).toContain('Laura Gómez');
    expect(done.textContent).toContain('hace 5 min');
    expect(done.textContent).toContain('31,5 MB');
    expect(done.textContent).toContain('vence en 70 h');
    expect(done.querySelector('[data-testid="export-progress"]')).toBeNull();
  });

  it('un reporte fallido muestra el motivo en español del catálogo, sin el texto del servidor', () => {
    render(exportJobDto({ status: 'FAILED', error_code: 'EXPORT_FAILED', downloadable: false, progress: null, size_bytes: null }));
    open();

    expect(text('[data-testid="export-failure"]')).toContain('No se pudo generar el reporte');
    expect(q('[data-testid="export-download"]')).toBeNull();
    expect(q('[data-testid="export-cancel"]')).toBeNull();
  });

  it('«Descargar» solo en los listos y «Cancelar» solo en los activos', () => {
    render(runningExportDto(1000), exportJobDto(), exportJobDto({ id: 'ex', status: 'EXPIRED', downloadable: false }));
    open();

    expect(qa('[data-testid="export-download"]').length).toBe(1);
    expect(qa('[data-testid="export-cancel"]').length).toBe(1);
    expect(text('[data-testid="export-job-run"] [data-testid="export-cancel"]')).toBe('Cancelar');
  });

  it('«Descargar» baja el archivo por la sesión (blob) y mientras tanto el botón dice «Descargando…» y se desactiva', () => {
    render(exportJobDto());
    open();
    spyOn(URL, 'createObjectURL').and.returnValue('blob:x');
    spyOn(URL, 'revokeObjectURL');
    const click = spyOn(HTMLAnchorElement.prototype, 'click').and.stub();
    q<HTMLButtonElement>('[data-testid="export-download"]')!.click();
    fixture.detectChanges();

    expect(text('[data-testid="export-download"]')).toBe('Descargando…');
    expect(q<HTMLButtonElement>('[data-testid="export-download"]')!.disabled).toBeTrue();
    http.expectOne((r) => r.url === `${EXPORTS_URL}/job-1/download`).flush(new Blob(['x']), { headers: { 'Content-Disposition': 'attachment; filename="r.xlsx"' } });
    fixture.detectChanges();

    expect(click).toHaveBeenCalledTimes(1);
    expect(text('[data-testid="export-download"]')).toBe('Descargar');
  });

  it('«Cancelar» pide la cancelación y el trabajo pasa a Cancelado sin recargar', () => {
    render(runningExportDto(1000));
    open();
    q<HTMLButtonElement>('[data-testid="export-cancel"]')!.click();
    http.expectOne((r) => r.url === `${EXPORTS_URL}/job-run/cancel`).flush({ data: exportJobDto({ id: 'job-run', status: 'CANCELED', downloadable: false, progress: null, size_bytes: null }), meta: {} });
    fixture.detectChanges();

    expect(text('[data-testid="export-status"]')).toBe('Cancelado');
    expect(q('[data-testid="export-cancel"]')).toBeNull();
    expect(text('[data-testid="exports-live"]')).toBe('Reporte cancelado.');
  });

  it('un error de acción (p. ej. vencido) se dice en español dentro del panel con role=alert', () => {
    render(exportJobDto());
    open();
    facade.actionError.set({ message: 'El reporte venció y su archivo ya no está disponible. Genéralo de nuevo.' } as never);
    fixture.detectChanges();

    expect(q('[data-testid="exports-action-error"]')!.getAttribute('role')).toBe('alert');
    expect(text('[data-testid="exports-action-error"]')).toContain('venció');
  });

  it('el estado de error de la primera carga ofrece «Reintentar»', () => {
    TestBed.configureTestingModule({ imports: [OperationExportsComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_VIEWER'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(OperationExportsFacade);
    fixture = TestBed.createComponent(OperationExportsComponent);
    fixture.detectChanges();
    list().flush({ error: { code: 'X', message: 'x' } }, { status: 500, statusText: 'Server Error' });
    open();

    expect(q('[data-testid="exports-error"]')!.getAttribute('role')).toBe('alert');
    q<HTMLButtonElement>('[data-testid="exports-retry"]')!.click();
    list().flush(exportsBody());
  });

  it('accesibilidad: el panel es un diálogo con nombre, el foco va a su título al abrir, Escape lo cierra y el foco vuelve al botón', fakeAsync(() => {
    render(exportJobDto());
    q<HTMLButtonElement>('[data-testid="exports-button"]')!.click();
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    const panel = q('[data-testid="exports-panel"]')!;

    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-labelledby')).toBe('ops-exports-title');
    expect(q('#ops-exports-title')!.textContent).toContain('Reportes recientes');
    expect(document.activeElement).toBe(q('#ops-exports-title'));
    expect(q('[data-testid="exports-button"]')!.getAttribute('aria-expanded')).toBe('true');
    expect(q('[data-testid="exports-button"]')!.getAttribute('aria-controls')).toBe('ops-exports-panel');

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(q('[data-testid="exports-panel"]')).toBeNull();
    expect(document.activeElement).toBe(q('[data-testid="exports-button"]'));
    flush();
  }));

  it('un clic fuera del panel lo cierra; dentro no', () => {
    render(exportJobDto());
    open();
    q('#ops-exports-title')!.click();
    fixture.detectChanges();
    expect(q('[data-testid="exports-panel"]')).not.toBeNull();

    document.body.click();
    fixture.detectChanges();
    expect(q('[data-testid="exports-panel"]')).toBeNull();
  });

  it('los cambios de estado se anuncian en una región aria-live educada y atómica', () => {
    render(runningExportDto(1000));
    const live = q('[data-testid="exports-live"]')!;

    expect(live.getAttribute('role')).toBe('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.getAttribute('aria-atomic')).toBe('true');
  });

  it('no añade altura a la página ni scroll interno: el panel flota (position absolute) y la lista no tiene overflow propio', () => {
    render(exportJobDto());
    document.body.appendChild(el());
    open();
    const panel = q('[data-testid="exports-panel"]')!;
    const list = q('[data-testid="exports-list"]')!;

    expect(getComputedStyle(panel).position).toBe('absolute');
    expect(['visible', 'clip']).toContain(getComputedStyle(list).overflowY);
    expect(['visible', 'clip']).toContain(getComputedStyle(panel).overflowY);
    el().remove();
  });

  it('al destruir el componente deja de consultar (los trabajos siguen en el servidor)', fakeAsync(() => {
    TestBed.configureTestingModule({ imports: [OperationExportsComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_VIEWER'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OperationExportsComponent);
    fixture.detectChanges();
    list().flush(exportsBody(runningExportDto(1000)));
    fixture.destroy();
    tick(60_000);

    expect(http.match((r) => r.url === EXPORTS_URL).length).toBe(0);
    flush();
  }));
});
