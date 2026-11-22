import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ImportPeriod } from '../../domain/models/imports';
import { PeriodSelection } from './imports-overview.facade';
import { PeriodSelectorComponent } from './period-selector.component';

const period = (from: string, to: string, imports = 1, rowsRead = 100): ImportPeriod => ({ from, to, imports, rowsRead });
const LIST: ImportPeriod[] = [period('2026-04-01', '2026-06-30', 2, 3_400_000), period('2026-01-05', '2026-03-28', 1, 500)];

describe('PeriodSelectorComponent', () => {
  let fixture: ComponentFixture<PeriodSelectorComponent>;
  let chosen: PeriodSelection[];
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const trigger = (): HTMLButtonElement => q<HTMLButtonElement>('button[role="combobox"]')!;
  const options = (): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>('[role="option"]'));
  const press = (key: string): void => {
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true }));
    fixture.detectChanges();
  };

  function render(inputs: Record<string, unknown> = { periods: LIST }): void {
    TestBed.configureTestingModule({ imports: [PeriodSelectorComponent], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(PeriodSelectorComponent);
    chosen = [];
    fixture.componentInstance.selected.subscribe((s) => chosen.push(s));
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  }

  it('muestra el periodo elegido con su rango, el tipo y un chevron; cerrado no hay panel', () => {
    render({ periods: LIST, selection: { from: '2026-04-01', to: '2026-06-30' } });

    expect(text('.label')).toBe('Periodo · Trimestral');
    expect(text('[data-testid="period-range"]')).toBe('Abr 2026 a Jun 2026');
    expect(text('[data-testid="period-kind"]')).toBe('· Trimestral');
    expect(trigger().getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-label')).toBe('Periodo: Abr 2026 a Jun 2026, Abr 2026 a Jun 2026');
    expect(q('[role="listbox"]')).toBeNull();
    expect(q('.chev')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('con «todos» muestra «Todos los periodos (Ene 2026 a Jun 2026)» y su tipo', () => {
    render();

    expect(text('[data-testid="period-range"]')).toBe('Todos los periodos (Ene 2026 a Jun 2026)');
    // El rango largo ya llena el control: el tipo no se muestra ahí (sigue en el panel).
    expect(q('[data-testid="period-kind"]')).toBeNull();
    trigger().click();
    fixture.detectChanges();
    expect(options()[0].querySelector('.k')!.textContent).toBe('Semestral');
  });

  it('al abrir lista «Todos» y cada periodo con rango, tipo y «N cargas · N viajes», y marca la activa con visto', () => {
    render({ periods: LIST, selection: { from: '2026-04-01', to: '2026-06-30' } });
    trigger().click();
    fixture.detectChanges();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(q('[role="listbox"]')!.getAttribute('aria-label')).toBe('Periodos cargados');
    expect(options().length).toBe(3);
    expect(options().map((o) => o.querySelector('strong')!.textContent)).toEqual(['Todos los periodos', 'Abr 2026 a Jun 2026', 'Ene 2026 a Mar 2026']);
    expect(options().map((o) => o.querySelector('small')!.textContent)).toEqual(['3 cargas · 3.400.500 viajes', '2 cargas · 3.400.000 viajes', '1 carga · 500 viajes']);
    expect(options().map((o) => o.querySelector('.k')!.textContent)).toEqual(['Semestral', 'Trimestral', 'Trimestral']);
    expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(options().map((o) => o.querySelector('.ok')!.classList.contains('off'))).toEqual([true, false, true]);
    expect(trigger().getAttribute('aria-activedescendant')).toBe(options()[1].id);
  });

  it('clic en una opción emite la selección y cierra; «Todos» emite «ALL»', () => {
    render();
    trigger().click();
    fixture.detectChanges();
    options()[2].click();
    fixture.detectChanges();

    expect(chosen).toEqual([{ from: '2026-01-05', to: '2026-03-28' }]);
    expect(q('[role="listbox"]')).toBeNull();

    trigger().click();
    fixture.detectChanges();
    options()[0].click();
    expect(chosen[1]).toBe('ALL');
  });

  describe('teclado', () => {
    it('Enter, Espacio, ↓ y ↑ abren el panel con la opción elegida activa', () => {
      for (const key of ['Enter', ' ', 'ArrowDown', 'ArrowUp']) {
        TestBed.resetTestingModule();
        render({ periods: LIST, selection: { from: '2026-01-05', to: '2026-03-28' } });
        press(key);

        expect(trigger().getAttribute('aria-expanded')).withContext(key).toBe('true');
        expect(trigger().getAttribute('aria-activedescendant')).withContext(key).toBe(options()[2].id);
      }
    });

    it('↑/↓/Inicio/Fin mueven la opción activa sin salir de los extremos y Enter elige', () => {
      render();
      press('ArrowDown');
      expect(q('.opt.active')!.id).toBe(options()[0].id);
      press('ArrowDown');
      press('ArrowDown');
      expect(q('.opt.active')!.id).toBe(options()[2].id);
      press('ArrowDown');
      expect(q('.opt.active')!.id).toBe(options()[2].id);
      press('Home');
      expect(q('.opt.active')!.id).toBe(options()[0].id);
      press('ArrowUp');
      expect(q('.opt.active')!.id).toBe(options()[0].id);
      press('End');
      expect(q('.opt.active')!.id).toBe(options()[2].id);

      press('Enter');
      expect(chosen).toEqual([{ from: '2026-01-05', to: '2026-03-28' }]);
      expect(q('[role="listbox"]')).toBeNull();
    });

    it('Espacio también elige y Escape cierra sin elegir y deja el foco en el botón', () => {
      render();
      trigger().focus();
      press('Enter');
      press('ArrowDown');
      press(' ');
      expect(chosen.length).toBe(1);

      press('Enter');
      press('Escape');
      expect(q('[role="listbox"]')).toBeNull();
      expect(chosen.length).toBe(1);
      expect(document.activeElement).toBe(trigger());
    });
  });

  it('un clic fuera lo cierra; uno dentro no', () => {
    render();
    trigger().click();
    fixture.detectChanges();

    el().querySelector<HTMLElement>('[role="listbox"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(q('[role="listbox"]')).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(q('[role="listbox"]')).toBeNull();
  });

  it('muestra como máximo los 8 periodos más recientes (más «Todos») y lo dice; sin exceso no hay aviso', () => {
    const many = Array.from({ length: 11 }, (_, i) => period(`2026-${String(11 - i).padStart(2, '0')}-01`, `2026-${String(11 - i).padStart(2, '0')}-28`));
    render({ periods: many });
    trigger().click();
    fixture.detectChanges();

    expect(options().length).toBe(9);
    expect(text('[data-testid="period-more"]')).toBe('Mostrando los 8 periodos más recientes');
    expect(options()[1].querySelector('strong')!.textContent).toBe('Nov 2026');
    expect(options()[8].querySelector('strong')!.textContent).toBe('Abr 2026');

    TestBed.resetTestingModule();
    render({ periods: LIST });
    trigger().click();
    fixture.detectChanges();
    expect(q('[data-testid="period-more"]')).toBeNull();
  });

  it('con un solo periodo sigue siendo selector con «Todos» y esa opción', () => {
    render({ periods: [period('2026-11-03', '2026-11-27', 1, 10)] });
    trigger().click();
    fixture.detectChanges();

    expect(options().length).toBe(2);
    expect(options()[1].querySelector('strong')!.textContent).toBe('Nov 2026');
    expect(options()[1].querySelector('.k')!.textContent).toBe('Mensual');
  });

  it('sin periodos es una franja informativa: «—», «Se define al subir tu primer archivo», sin panel; con enlace va a /cargas', () => {
    render({ periods: [] });

    expect(q('button')).toBeNull();
    expect(text('[data-testid="period-range"]')).toBe('—');
    expect(text('[data-testid="period-pending"]')).toBe('Se define al subir tu primer archivo');
    expect(q('[role="group"]')!.getAttribute('aria-label')).toBe('Periodo: sin definir. Se define al subir tu primer archivo');
    expect(q('a')).toBeNull();

    TestBed.resetTestingModule();
    render({ periods: [], link: '/cargas' });
    expect(q('a')!.getAttribute('href')).toBe('/cargas');
  });

  it('muestra un esqueleto al cargar y un error con «Reintentar»', () => {
    render({ status: 'loading' });
    expect(q('.skeleton')).not.toBeNull();
    expect(q('button[role="combobox"]')).toBeNull();

    TestBed.resetTestingModule();
    render({ status: 'error' });
    let retried = false;
    fixture.componentInstance.retry.subscribe(() => (retried = true));
    q<HTMLButtonElement>('[role="alert"] button')!.click();
    expect(retried).toBeTrue();
  });

  it('con cifras de 7 dígitos no desborda ni el botón ni las opciones', () => {
    render({ periods: [period('2026-01-01', '2026-12-31', 120, 3_400_000)] });
    el().style.width = '420px';
    trigger().click();
    fixture.detectChanges();

    for (const node of [trigger(), q('[role="listbox"]')!]) expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth + 1);
    expect(options()[1].querySelector('small')!.textContent).toBe('120 cargas · 3.400.000 viajes');
    expect(getComputedStyle(q('[role="listbox"]')!).overflowY).not.toBe('scroll');
  });

  it('el CSS usa solo tokens: sin hexadecimales ni rgb() y solo las tintas 14/20/40/60/80 %', () => {
    render();
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.panel')).join('\n');

    expect(css).toContain('.opt');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });

  describe('aspecto compacto y panel anclado a la derecha', () => {
    it('es un control corto (≈ 44 px de alto, 260–360 px de ancho), no una franja de todo el ancho', () => {
      render({ periods: LIST, selection: { from: '2026-04-01', to: '2026-06-30' } });
      const wrapper = document.createElement('div');

      wrapper.style.cssText = 'display:flex;justify-content:flex-end;width:1000px';
      wrapper.appendChild(el());
      document.body.appendChild(wrapper);
      const rect = el().getBoundingClientRect();
      const bar = trigger().getBoundingClientRect();

      expect(rect.width).toBeGreaterThanOrEqual(260);
      expect(rect.width).toBeLessThanOrEqual(360);
      expect(bar.height).toBeGreaterThanOrEqual(44);
      expect(bar.height).toBeLessThanOrEqual(50);
      expect(Math.round(rect.right)).toBe(Math.round(wrapper.getBoundingClientRect().right));
      wrapper.remove();
    });

    it('el texto largo se corta con puntos suspensivos y el título trae el texto completo', () => {
      render();
      const range = q('[data-testid="period-range"]')!;

      expect(getComputedStyle(range).textOverflow).toBe('ellipsis');
      expect(getComputedStyle(range).whiteSpace).toBe('nowrap');
      expect(trigger().getAttribute('title')).toBe('Todos los periodos (Ene 2026 a Jun 2026)');
    });

    it('el tipo se ve bajo la etiqueta solo si el rango es corto; en el panel siempre está en cada opción', () => {
      render({ periods: LIST, selection: { from: '2026-04-01', to: '2026-06-30' } });
      expect(q('[data-testid="period-kind"]')).not.toBeNull();

      trigger().click();
      fixture.detectChanges();
      expect(options().every((o) => o.querySelector('.k') !== null)).toBeTrue();
    });

    it('el panel se ancla al borde derecho del control, mide al menos 340 px y se ve completo', () => {
      render();
      el().style.cssText = 'display:block;margin-left:500px';
      trigger().click();
      fixture.detectChanges();
      const panel = q('[data-testid="period-panel"]')!;
      const style = getComputedStyle(panel);

      expect(style.right).toBe('0px');
      expect(parseFloat(style.minWidth)).toBe(340);
      expect(panel.classList).not.toContain('left');
      expect(panel.getBoundingClientRect().width).toBeGreaterThanOrEqual(340);
      expect(panel.getBoundingClientRect().right).toBeCloseTo(el().getBoundingClientRect().right, 0);
    });

    it('si el control está cerca del borde izquierdo, el panel se alinea a la izquierda para no salirse', () => {
      render();
      el().style.cssText = 'display:block;margin-left:0;width:260px';
      trigger().click();
      fixture.detectChanges();

      expect(q('[data-testid="period-panel"]')!.classList).toContain('left');
      expect(q('[data-testid="period-panel"]')!.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    });

    it('al cambiar el tamaño de la ventana el panel se cierra', () => {
      render();
      trigger().click();
      fixture.detectChanges();
      window.dispatchEvent(new Event('resize'));
      fixture.detectChanges();

      expect(q('[role="listbox"]')).toBeNull();
    });

    it('bajo 700 px el control ocupa todo el ancho y el panel también (por CSS)', () => {
      render();
      const css = Array.from(document.querySelectorAll('style')).map((st) => (st.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('.panel')).join('\n');

      expect(css).toMatch(/@media \(max-width: 700px\) \{ \{ width: 100%; max-width: none; \}/);
      expect(css).toMatch(/\.panel, \.panel\.left \{ left: 0; right: 0; min-width: 0;/);
    });
  });
});
