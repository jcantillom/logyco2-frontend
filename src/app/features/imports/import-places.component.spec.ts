import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { IMPORTS_URL, importDetailDto } from '../../../testing/imports';
import { candidateDto, choiceDto, choiceResultDto, counterpartDto, pendingPlaceDto, PLACES_URL, resolutionDto } from '../../../testing/places';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { PlaceResolutionDto } from '../../infrastructure/dto/places.dto';
import { toPlaceResolution } from '../../infrastructure/mappers/places.mappers';
import { ImportPlacesComponent } from './import-places.component';

const URL = `${PLACES_URL}/choices`;

describe('ImportPlacesComponent: lugares por confirmar', () => {
  let fixture: ComponentFixture<ImportPlacesComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = <T extends HTMLElement = HTMLElement>(selector: string): T[] => Array.from(el().querySelectorAll<T>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function render(resolution: Partial<PlaceResolutionDto> = {}, roles = ['ORG_ADMIN']): void {
    TestBed.configureTestingModule({ imports: [ImportPlacesComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ImportPlacesComponent);
    fixture.componentRef.setInput('importId', 'imp-1');
    fixture.componentRef.setInput('resolution', toPlaceResolution(resolutionDto(resolution)));
    fixture.detectChanges();
  }

  const open = (): void => {
    q('[data-testid="place-toggle"]')!.click();
    fixture.detectChanges();
  };

  const radios = (): HTMLInputElement[] => qa<HTMLInputElement>('input[type="radio"]');

  afterEach(() => http?.match(() => true));

  it('sin lugares por confirmar ni resultados no muestra nada', () => {
    render({ pending: [], pending_places: 0, pending_trips: 0 });

    expect(q('[data-testid="places"]')).toBeNull();
  });

  it('lista cada texto con sus viajes y el motivo del servidor, y dice que la elección vale para toda la empresa y se deshace', () => {
    render();

    expect(text('[data-testid="places-summary"]')).toContain('1 lugar del archivo no se pudo reconocer (102 viajes)');
    expect(text('[data-testid="place-san pedro antioquia"]')).toContain('SAN PEDRO, ANTIOQUIA');
    expect(text('[data-testid="place-san pedro antioquia"]')).toContain('Puede ser más de un municipio');
    expect(text('[data-testid="place-san pedro antioquia"]')).toContain('102 viajes');
    expect(text('[data-testid="places-scope"]')).toContain('toda tu empresa');
    expect(text('[data-testid="places-scope"]')).toContain('deshacerlo');
  });

  it('sin imports:create es solo informativo: ni botón ni selector', () => {
    render({}, ['ORG_VIEWER']);

    expect(q('[data-testid="place-toggle"]')).toBeNull();
    expect(text('[data-testid="places-readonly"]')).toContain('permiso para cargar información');
  });

  it('al abrir, los candidatos son un grupo de opciones SIN ninguna marcada y el botón está deshabilitado', () => {
    render();
    open();

    expect(q('[role="radiogroup"]')).not.toBeNull();
    expect(radios().length).toBe(2);
    expect(radios().some((r) => r.checked)).toBeFalse();
    expect(radios().every((r) => r.name === 'place-san pedro antioquia')).toBeTrue();
    expect(q<HTMLButtonElement>('[data-testid="chooser-submit"]')!.disabled).toBeTrue();
    expect(q('[data-testid="place-toggle"]')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('cada candidato muestra nombre, departamento y código del servidor, y la evidencia como dato (rutas, otro extremo, distancia del archivo)', () => {
    render();
    open();

    expect(text('[data-testid="candidate-05664"]')).toContain('San Pedro de los Milagros');
    expect(text('[data-testid="candidate-05664"]')).toContain('Antioquia');
    expect(text('[data-testid="candidate-05664"]')).toContain('05664');
    expect(text('[data-testid="routes-05664"]')).toContain('Ruta a Medellín: 48,3 km');
    expect(text('[data-testid="routes-05665"]')).toContain('Ruta a Medellín: sin ruta guardada');
    expect(text('[data-testid="chooser-evidence"]')).toContain('Medellín');
    expect(text('[data-testid="chooser-evidence"]')).toContain('90 viajes');
    expect(text('[data-testid="chooser-evidence"]')).toContain('el archivo dice 51,2 km en promedio (80 viajes)');
  });

  it('un otro extremo sin distancia del archivo lo dice, sin inventar un 0', () => {
    render({ pending: [pendingPlaceDto({ counterparts_as_origin: [counterpartDto({ avg_file_distance_km: null, trips_with_file_distance: 0 })] })] });
    open();

    expect(text('[data-testid="chooser-evidence"]')).toContain('el archivo no trae distancia');
  });

  it('un centro poblado y un candidato de otro departamento se rotulan', () => {
    render({ pending: [pendingPlaceDto({ candidates: [candidateDto({ kind: 'CENTRO_POBLADO', matched_name: 'La Aldea', in_department: false })] })] });
    open();

    expect(text('[data-testid="candidate-05664"]')).toContain('Centro poblado «La Aldea»');
    expect(text('[data-testid="candidate-05664"]')).toContain('En otro departamento');
  });

  it('elegir un candidato habilita el botón; «Elegir este municipio» hace PUT con el texto, el código, la nota y la carga', () => {
    render();
    open();
    radios()[1].click();
    const note = q<HTMLTextAreaElement>('[data-testid="chooser-note"]')!;

    note.value = '  confirmado con operaciones  ';
    note.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const submit = q<HTMLButtonElement>('[data-testid="chooser-submit"]')!;

    expect(submit.disabled).toBeFalse();
    expect(submit.textContent).toContain('Elegir este municipio');
    expect(note.getAttribute('maxlength')).toBe('200');
    submit.click();
    fixture.detectChanges();

    expect(submit.getAttribute('aria-busy')).toBe('true');
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ place_text: 'SAN PEDRO, ANTIOQUIA', municipality_code: '05665', note: 'confirmado con operaciones', import_file_id: 'imp-1' });
  });

  it('con éxito cierra el selector, vuelve a pedir la carga y cuenta el resultado con las cifras del servidor', () => {
    render();
    open();
    radios()[0].click();
    fixture.detectChanges();
    q('[data-testid="chooser-submit"]')!.click();
    http.expectOne(URL).flush({ data: choiceResultDto({ other_trips_pending: 12 }) });
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` }).flush({ data: importDetailDto() });
    fixture.detectChanges();

    expect(q('[data-testid="chooser"]')).toBeNull();
    const result = text('[data-testid="outcome-san pedro antioquia"]');

    expect(result).toContain('«SAN PEDRO, ANTIOQUIA» quedó como San Pedro de los Milagros (Antioquia) para toda tu empresa.');
    expect(result).toContain('102 viajes actualizados · 95 ahora calculados · 3 siguen pendientes.');
    expect(result).toContain('12 viajes de otras cargas con este texto siguen sin municipio.');
  });

  it('el resultado sigue visible aunque la recarga ya no traiga lugares pendientes', () => {
    render();
    open();
    radios()[0].click();
    fixture.detectChanges();
    q('[data-testid="chooser-submit"]')!.click();
    http.expectOne(URL).flush({ data: choiceResultDto() });
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` });
    fixture.componentRef.setInput('resolution', toPlaceResolution(resolutionDto({ pending: [], pending_places: 0, pending_trips: 0 })));
    fixture.detectChanges();

    expect(q('[data-testid="places"]')).not.toBeNull();
    expect(q('[data-testid="places-list"]')).toBeNull();
    expect(q('[data-testid="outcome-san pedro antioquia"]')).not.toBeNull();
  });

  it('con otros viajes pendientes ofrece repetir sin acotar a la carga (aplica a toda la empresa)', () => {
    render();
    open();
    radios()[0].click();
    fixture.detectChanges();
    q('[data-testid="chooser-submit"]')!.click();
    http.expectOne(URL).flush({ data: choiceResultDto({ other_trips_pending: 12 }) });
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` });
    fixture.detectChanges();
    q('[data-testid="outcome-apply-company"]')!.click();

    expect(http.expectOne(URL).request.body).toEqual({ place_text: 'SAN PEDRO, ANTIOQUIA', municipality_code: '05664' });
  });

  it('«sin cambios» (idempotente) se dice tal cual', () => {
    render();
    open();
    radios()[0].click();
    fixture.detectChanges();
    q('[data-testid="chooser-submit"]')!.click();
    http.expectOne(URL).flush({ data: choiceResultDto({ changed: false, created: false, trips_updated: 0 }) });
    http.expectOne({ method: 'GET', url: `${IMPORTS_URL}/imp-1` });
    fixture.detectChanges();

    expect(text('[data-testid="outcome-san pedro antioquia"]')).toContain('sin cambios');
  });

  it('un error COMPANY_BUSY se anuncia con role=alert, conserva la selección y la nota, y el mismo botón reintenta', () => {
    render();
    open();
    radios()[1].click();
    const note = q<HTMLTextAreaElement>('[data-testid="chooser-note"]')!;

    note.value = 'nota';
    note.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    q('[data-testid="chooser-submit"]')!.click();
    http.expectOne(URL).flush({ error: { code: 'COMPANY_BUSY', message: 'x' } }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(q('[data-testid="chooser-error"]')!.getAttribute('role')).toBe('alert');
    expect(text('[data-testid="chooser-error"]')).toContain('Hay una carga procesándose');
    expect(text('[data-testid="chooser-error"]')).toContain('Tu elección se conserva');
    expect(radios()[1].checked).toBeTrue();
    expect(note.value).toBe('nota');
    q('[data-testid="chooser-submit"]')!.click();
    expect(http.expectOne(URL).request.body.municipality_code).toBe('05665');
  });

  it('tope de 1.000 y municipio inválido muestran su mensaje del catálogo', () => {
    render();
    open();
    radios()[0].click();
    fixture.detectChanges();
    q('[data-testid="chooser-submit"]')!.click();
    http.expectOne(URL).flush({ error: { code: 'PLACE_CHOICES_LIMIT', message: 'x' } }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(text('[data-testid="chooser-error"]')).toContain('máximo de 1.000');
  });

  it('Escape cierra solo el selector y devuelve el foco al botón', async () => {
    render();
    document.body.appendChild(el());
    open();
    const toggle = q<HTMLButtonElement>('[data-testid="place-toggle"]')!;
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

    q('app-place-chooser')!.dispatchEvent(event);
    fixture.detectChanges();
    await Promise.resolve();

    expect(event.defaultPrevented).toBeTrue();
    expect(q('[data-testid="chooser"]')).toBeNull();
    expect(document.activeElement).toBe(toggle);
    el().remove();
  });

  it('a11y: grupo con leyenda, región aria-live y botón con aria-expanded', () => {
    render();
    open();

    expect(q('fieldset legend')!.textContent).toContain('¿Qué municipio es «SAN PEDRO, ANTIOQUIA»?');
    expect(q('[aria-live="polite"]')).not.toBeNull();
  });

  it('los ids de a11y no llevan espacios: aria-labelledby y aria-describedby apuntan a elementos reales', () => {
    render();
    open();
    const form = q('form')!;
    const labelled = form.getAttribute('aria-labelledby')!;
    const described = q('fieldset')!.getAttribute('aria-describedby')!;

    expect(labelled).not.toMatch(/\s/);
    expect(document.getElementById(labelled)?.textContent).toContain('¿Qué municipio es «SAN PEDRO, ANTIOQUIA»?');
    expect(described).not.toMatch(/\s/);
    expect(document.getElementById(described)?.textContent).toContain('toda tu empresa');
  });

  it('si una recarga quita la opción marcada, ya no queda marcada ni se puede enviar', () => {
    render();
    open();
    radios()[1].click();
    fixture.detectChanges();
    fixture.componentRef.setInput('resolution', toPlaceResolution(resolutionDto({ pending: [pendingPlaceDto({ candidates: [candidateDto()] })] })));
    fixture.detectChanges();

    expect(radios().length).toBe(1);
    expect(radios()[0].checked).toBeFalse();
    expect(q<HTMLButtonElement>('[data-testid="chooser-submit"]')!.disabled).toBeTrue();
  });

  it('un lugar sin candidatos no ofrece elegir y dice qué hacer', () => {
    render({ pending: [pendingPlaceDto({ reason: 'UNKNOWN_MUNICIPALITY', candidates: [], counterparts_as_origin: [] })] });

    expect(q('[data-testid="place-toggle"]')).toBeNull();
    expect(text('[data-testid="place-no-candidates"]')).toContain('Corrige el nombre en tu archivo');
  });

  it('un lugar ya elegido con viajes de otra carga pendientes muestra la decisión y ofrece aplicarla a toda la empresa', () => {
    render({ pending: [pendingPlaceDto({ pending_trips: 7, choice: choiceDto({ note: 'ok' }) })] });

    expect(text('[data-testid="place-already"]')).toContain('ya eligió San Pedro de los Milagros (Antioquia)');
    expect(text('[data-testid="place-already"]')).toContain('faltan 7 viajes de otras cargas');
    q('[data-testid="place-apply-company"]')!.click();

    expect(http.expectOne(URL).request.body).toEqual({ place_text: 'SAN PEDRO, ANTIOQUIA', municipality_code: '05664', note: 'ok' });
  });

  it('pagina de a 6 sin scroll interno', () => {
    const many = Array.from({ length: 8 }, (_, i) => pendingPlaceDto({ place_text: `LUGAR ${i}`, place_key: `lugar ${i}` }));

    render({ pending: many, pending_places: 8 });

    expect(qa('[data-testid="places-list"] > li').length).toBe(6);
    expect(text('nav.pg [role="status"]')).toBe('Página 1 de 2');
    expect(q<HTMLButtonElement>('[data-testid="places-prev"]')!.disabled).toBeTrue();
    q('[data-testid="places-next"]')!.click();
    fixture.detectChanges();

    expect(qa('[data-testid="places-list"] > li').length).toBe(2);
    expect(text('nav.pg [role="status"]')).toBe('Página 2 de 2');
    expect(q<HTMLButtonElement>('[data-testid="places-next"]')!.disabled).toBeTrue();
  });

  it('truncated y reprocess_hint salen del servidor', () => {
    render({ truncated: true, reprocess_hint: { places: 2, trips: 9 } });

    expect(text('[data-testid="places-truncated"]')).toContain('con más viajes');
    expect(text('[data-testid="places-reprocess"]')).toContain('2 lugares guardados sin municipio ya los reconoce la plataforma (9 viajes): reprocesar la carga los completa.');
  });

  it('el CSS usa solo tokens (sin hexadecimales ni rgb()), sin scroll interno y con tintes permitidos', () => {
    render();
    open();
    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, ''))
      .filter((c) => c.includes('ul.places') || c.includes('.cand'))
      .join('\n');

    expect(css).toContain('ul.places');
    expect(css).toContain('.cand');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    expect(css).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
    for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });
});
