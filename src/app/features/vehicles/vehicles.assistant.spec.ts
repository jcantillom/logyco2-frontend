import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { analysisDto, analysisSummaryDto, findingDto, pagedBody, summaryDto, vehicleDto, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { AnalysisSummaryDto } from '../../infrastructure/dto/vehicles.dto';
import { catalogDto } from '../emissions/emissions.fixtures';
import { VehiclesComponent } from './vehicles.component';

const BASE = `${VEHICLES_ORG_URL}/vehicle-analyses`;
const RUN = `${BASE}/run-1`;

describe('VehiclesComponent: asistente, cargas recientes y enlace profundo', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let router: Router;
  const el = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const settle = (): void => {
    harness.detectChanges();
    harness.detectChanges();
  };

  async function open(url: string, roles = ['ORG_ADMIN'], runs: AnalysisSummaryDto[] = [], pendingRuns: AnalysisSummaryDto[] = []): Promise<void> {
    TestBed.configureTestingModule({ providers: provideTestApp({ routes: [{ path: 'vehiculos', component: VehiclesComponent }] }) });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, VehiclesComponent);
    harness.detectChanges();
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/summary`).flush({ data: summaryDto });
    http.expectOne((r) => r.url === `${VEHICLES_ORG_URL}/vehicles`).flush(pagedBody([vehicleDto()]));
    http.expectOne('http://api.test/api/v1/emissions/vehicles').flush({ data: catalogDto() });
    http.expectOne((r) => r.url === BASE && r.params.get('page_size') === '5').flush(pagedBody(runs));
    http.expectOne((r) => r.url === BASE && r.params.get('has_pending') === 'true').flush(pagedBody(pendingRuns));
    settle();
  }

  const completeRun = (): void => {
    http.expectOne({ method: 'GET', url: RUN }).flush({ data: analysisDto() });
    for (const state of ['NEW', 'CONFLICT', 'INCOMPLETE', 'INVALID']) {
      http.expectOne((r) => r.url === `${RUN}/findings` && r.params.get('state') === state).flush(pagedBody(state === 'CONFLICT' ? [findingDto()] : []));
    }
    settle();
  };

  const pendingRun = analysisSummaryDto({ pending: { new: 3, conflict: 1, incomplete: 0, invalid: 0 } });

  afterEach(() => TestBed.inject(HttpTestingController).match(() => true));

  it('«Analizar archivo Excel» (imports:create) abre el asistente en el paso de carga', async () => {
    await open('/vehiculos');
    q('[data-testid="analyze-top"]')!.click();
    settle();

    expect(q<HTMLDialogElement>('dialog[data-testid="analysis-wizard"]')!.open).toBeTrue();
    expect(q('[data-testid="dropzone"]')).not.toBeNull();
  });

  it('sin imports:create no hay botón para analizar', async () => {
    await open('/vehiculos', ['ORG_VIEWER']);

    expect(q('[data-testid="analyze-top"]')).toBeNull();
  });

  it('el enlace profundo ?analysis=<id> abre el asistente en el resumen de esa corrida', async () => {
    await open('/vehiculos?analysis=run-1');
    completeRun();

    expect(q<HTMLDialogElement>('dialog[data-testid="analysis-wizard"]')!.open).toBeTrue();
    expect(q('[data-testid="step-summary"]')!.getAttribute('aria-current')).toBe('step');
    expect(text('[data-testid="count-detected"]')).toBe('10');
  });

  it('subir un archivo escribe la corrida en la URL (?analysis=) sin apilar historial', async () => {
    await open('/vehiculos');
    q('[data-testid="analyze-top"]')!.click();
    settle();
    const input = q<HTMLInputElement>('[data-testid="file-input"]')!;
    const transfer = new DataTransfer();

    transfer.items.add(new File(['x'], 'a.xlsx'));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    http.expectOne({ method: 'POST', url: BASE }).flush({ data: { id: 'run-1', status: 'QUEUED', duplicate: false } }, { status: 202, statusText: 'Accepted' });
    http.expectOne((r) => r.url === BASE && r.params.get('page_size') === '5').flush(pagedBody([]));
    http.expectOne((r) => r.url === BASE && r.params.get('has_pending') === 'true').flush(pagedBody([]));
    await harness.fixture.whenStable();
    settle();

    expect(router.url).toBe('/vehiculos?analysis=run-1');
    http.expectOne({ method: 'GET', url: RUN }).flush({ data: analysisDto({ status: 'RUNNING' }) });
  });

  it('cerrar el asistente quita ?analysis= de la URL y devuelve el foco al botón', async () => {
    await open('/vehiculos');
    const opener = q<HTMLButtonElement>('[data-testid="analyze-top"]')!;

    opener.focus();
    opener.click();
    settle();
    const dialog = q<HTMLDialogElement>('dialog[data-testid="analysis-wizard"]')!;
    const closed = new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));

    dialog.close();
    await closed;
    await harness.fixture.whenStable();
    settle();

    expect(q('dialog[data-testid="analysis-wizard"]')).toBeNull();
    expect(router.url).toBe('/vehiculos');
    expect(document.activeElement).toBe(opener);
  });

  it('«Cargas recientes» lista la última con estado, conteos y pendientes, y «Abrir» la lleva al resumen', async () => {
    await open('/vehiculos', ['ORG_ADMIN'], [pendingRun], [pendingRun]);

    expect(text('[data-testid="recent-analyses"] h2')).toBe('Cargas recientes');
    const item = text('[data-testid="recent-item"]');
    expect(item).toContain('operaciones-marzo.xlsx');
    expect(item).toContain('Listo');
    expect(item).toContain('10 detectados · 3 nuevos · 1 con conflictos');
    expect(text('[data-testid="pending-new"]')).toBe('3 nuevos');
    expect(text('[data-testid="pending-conflict"]')).toBe('1 con conflictos');

    q('[data-testid="open-analysis"]')!.click();
    await harness.fixture.whenStable();
    settle();
    completeRun();

    expect(router.url).toBe('/vehiculos?analysis=run-1');
    expect(q('[data-testid="step-summary"]')!.getAttribute('aria-current')).toBe('step');
  });

  it('sin cargas no se muestra la sección', async () => {
    await open('/vehiculos');

    expect(q('[data-testid="recent-analyses"]')).toBeNull();
  });

  it('las tarjetas «Nuevos pendientes» y «Con inconsistencias» se habilitan si la última corrida con pendientes tiene de eso, y abren ese paso', async () => {
    await open('/vehiculos', ['ORG_ADMIN'], [pendingRun], [pendingRun]);

    expect(q<HTMLButtonElement>('[data-testid="tile-pending"]')!.disabled).toBeFalse();
    expect(q<HTMLButtonElement>('[data-testid="tile-conflicts"]')!.disabled).toBeFalse();
    expect(q('[data-testid="tile-pending"]')!.hasAttribute('title')).toBeFalse();

    q('[data-testid="tile-conflicts"]')!.click();
    await harness.fixture.whenStable();
    settle();
    completeRun();

    expect(router.url).toBe('/vehiculos?analysis=run-1');
    expect(q('[data-testid="step-conflicts"]')!.getAttribute('aria-current')).toBe('step');
    expect(q('[data-testid="conflict-card"]')).not.toBeNull();
  });

  it('sin corridas con pendientes las tarjetas siguen deshabilitadas con la explicación', async () => {
    await open('/vehiculos');

    for (const id of ['tile-pending', 'tile-conflicts']) {
      expect(q<HTMLButtonElement>(`[data-testid="${id}"]`)!.disabled).withContext(id).toBeTrue();
      expect(q(`[data-testid="${id}"]`)!.getAttribute('title')).toBe('Disponible al analizar un archivo');
    }
  });

  it('si la corrida más reciente solo tiene incompletos, la tarjeta de nuevos no se habilita', async () => {
    const onlyIncomplete = analysisSummaryDto({ pending: { new: 0, conflict: 0, incomplete: 2, invalid: 0 } });
    await open('/vehiculos', ['ORG_ADMIN'], [onlyIncomplete], [onlyIncomplete]);

    expect(q<HTMLButtonElement>('[data-testid="tile-pending"]')!.disabled).toBeTrue();
  });

  it('al cambiar de empresa se cierra el asistente y se quita la corrida de la URL', async () => {
    await open('/vehiculos?analysis=run-1');
    completeRun();

    TestBed.inject(SessionStore).setUser(buildUser({ memberships: [membership({ id: '33333333-3333-4333-8333-333333333333', name: 'Otra' }, ['ORG_ADMIN'])] }));
    harness.detectChanges();
    await harness.fixture.whenStable();
    settle();

    expect(q('dialog[data-testid="analysis-wizard"]')).toBeNull();
    expect(router.url).toBe('/vehiculos');
  });
});
