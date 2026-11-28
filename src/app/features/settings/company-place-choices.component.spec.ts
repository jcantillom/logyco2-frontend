import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { choiceDto, PLACES_URL, undoResultDto } from '../../../testing/places';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { PlaceChoiceDto } from '../../infrastructure/dto/places.dto';
import { CompanyPlaceChoicesComponent } from './company-place-choices.component';

const LIST = `${PLACES_URL}/choices`;

describe('CompanyPlaceChoicesComponent: lugares de tu empresa', () => {
  let fixture: ComponentFixture<CompanyPlaceChoicesComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = (selector: string): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function render(choices: PlaceChoiceDto[], userId = 'usr-1'): void {
    TestBed.configureTestingModule({ imports: [CompanyPlaceChoicesComponent], providers: provideTestApp() });
    signInAs(buildUser({ id: userId, memberships: [membership(ORG_ENVIA, ['ORG_ANALYST'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CompanyPlaceChoicesComponent);
    fixture.detectChanges();
    http.expectOne(LIST).flush({ data: choices });
    fixture.detectChanges();
  }

  const answer = async (accepted: boolean): Promise<void> => {
    TestBed.inject(ConfirmService).pending()!.resolve(accepted);
    await Promise.resolve();
  };

  afterEach(() => http?.match(() => true));

  it('muestra texto → municipio, quién y cuándo, la nota y el contador contra el tope', () => {
    render([choiceDto({ note: 'confirmado' })]);

    expect(text('[data-testid="place-choices-counter"]')).toBe('1 de 1.000 lugares elegidos');
    const row = text('[data-testid="choice-ch-1"]');

    expect(row).toContain('SAN PEDRO, ANTIOQUIA');
    expect(row).toContain('San Pedro de los Milagros');
    expect(row).toContain('Antioquia');
    expect(row).toContain('05664');
    expect(row).toContain('Elegido por ti');
    expect(row).toContain('2 Mar 2026');
    expect(text('[data-testid="choice-note"]')).toBe('Nota: confirmado');
    expect(q('time')!.getAttribute('datetime')).toBe('2026-03-02T09:30:00Z');
  });

  it('otra persona o una persona que ya no existe: no se inventa un nombre', () => {
    render([choiceDto({ chosen_by: 'usr-9' }), choiceDto({ id: 'ch-2', chosen_by: null })]);

    expect(text('[data-testid="choice-ch-1"]')).toContain('Elegido por otra persona de tu empresa');
    expect(text('[data-testid="choice-ch-2"]')).toContain('Elegido por una persona que ya no está');
  });

  it('sin decisiones: estado vacío y contador en 0', () => {
    render([]);

    expect(text('[data-testid="place-choices-empty"]')).toContain('aún no ha elegido ningún lugar');
    expect(text('[data-testid="place-choices-counter"]')).toBe('0 de 1.000 lugares elegidos');
  });

  it('«Deshacer» pide confirmar con el alcance de toda la empresa y no envía nada si se cancela', async () => {
    render([choiceDto()]);
    q('[data-testid="choice-undo"]')!.click();
    const pending = TestBed.inject(ConfirmService).pending()!;

    expect(pending.message).toContain('para toda tu empresa');
    expect(pending.message).toContain('volverán a quedar sin municipio');
    expect(pending.confirmLabel).toBe('Deshacer');
    expect(pending.danger).toBeTrue();
    await answer(false);
    http.expectNone(`${LIST}/ch-1`);
  });

  it('al confirmar hace DELETE, cuenta el resultado con las cifras del servidor y vuelve a leer la lista', async () => {
    render([choiceDto()]);
    q('[data-testid="choice-undo"]')!.click();
    await answer(true);
    http.expectOne({ method: 'DELETE', url: `${LIST}/ch-1` }).flush({ data: undoResultDto() });
    http.expectOne({ method: 'GET', url: LIST }).flush({ data: [] });
    fixture.detectChanges();

    expect(text('[data-testid="choices-undone"]')).toContain('«SAN PEDRO, ANTIOQUIA» ya no significa San Pedro de los Milagros. 102 viajes volvieron a quedar sin municipio y 95 se volvieron a evaluar.');
    expect(text('[data-testid="place-choices-counter"]')).toBe('0 de 1.000 lugares elegidos');
  });

  it('tras deshacer con éxito el foco pasa a la región de resultado', async () => {
    render([choiceDto()]);
    document.body.appendChild(el());
    q('[data-testid="choice-undo"]')!.click();
    await answer(true);
    http.expectOne(`${LIST}/ch-1`).flush({ data: undoResultDto() });
    http.expectOne({ method: 'GET', url: LIST }).flush({ data: [] });
    fixture.detectChanges();
    await Promise.resolve();

    expect(document.activeElement).toBe(q('[data-testid="choices-outcome"]'));
    el().remove();
  });

  it('un 404 (ya deshecha) se anuncia con role=alert', async () => {
    render([choiceDto()]);
    q('[data-testid="choice-undo"]')!.click();
    await answer(true);
    http.expectOne(`${LIST}/ch-1`).flush({ error: { code: 'PLACE_CHOICE_NOT_FOUND', message: 'x' } }, { status: 404, statusText: 'Not Found' });
    http.expectOne({ method: 'GET', url: LIST }).flush({ data: [] });
    fixture.detectChanges();

    expect(q('[data-testid="choices-error"]')!.getAttribute('role')).toBe('alert');
    expect(text('[data-testid="choices-error"]')).toContain('ya no existe');
  });

  it('pagina de a 6 sin scroll interno', () => {
    render(Array.from({ length: 8 }, (_, i) => choiceDto({ id: `ch-${i}`, place_text: `LUGAR ${i}` })));

    expect(qa('ul.choices > li').length).toBe(6);
    expect(text('nav.pg [role="status"]')).toBe('Página 1 de 2');
    q('[data-testid="choices-next"]')!.click();
    fixture.detectChanges();

    expect(qa('ul.choices > li').length).toBe(2);
    expect(q<HTMLButtonElement>('[data-testid="choices-next"]')!.disabled).toBeTrue();
  });

  it('a11y: cada «Deshacer» nombra su lugar y la región de resultados es aria-live', () => {
    render([choiceDto()]);

    expect(q('[data-testid="choice-undo"]')!.getAttribute('aria-label')).toBe('Deshacer la elección de SAN PEDRO, ANTIOQUIA');
    expect(q('[aria-live="polite"]')).not.toBeNull();
  });

  it('el CSS usa solo tokens (sin hexadecimales ni rgb()), sin scroll interno y con tintes permitidos', () => {
    render([choiceDto()]);
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '')).filter((c) => c.includes('ul.choices')).join('\n');

    expect(css).toContain('ul.choices');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    expect(css).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
    for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });
});
