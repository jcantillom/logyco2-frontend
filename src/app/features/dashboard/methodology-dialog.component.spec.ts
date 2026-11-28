import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { buildFootprint } from '../../../testing/footprint';
import { METHODOLOGY_URL, NOT_CLAIMED, VERIFICATION_TEXT, dataOriginShare, inventoryCoverage, methodology, methodologyDto, methodologyRef } from '../../../testing/methodology';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { Footprint } from '../../domain/models/footprint';
import { MethodologyDialogComponent } from './methodology-dialog.component';
import { MethodologyFacade } from './methodology.facade';

describe('MethodologyDialogComponent', () => {
  let fixture: ComponentFixture<MethodologyDialogComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T | null => el().querySelector<T>(`[data-testid="${id}"]`);
  const text = (id: string): string => (q(id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const click = (id: string): void => {
    q(id)!.click();
    fixture.detectChanges();
  };
  const FULL = (): Footprint => buildFootprint({ methodology: methodologyRef(), dataOriginShare: dataOriginShare(), inventoryCoverage: inventoryCoverage() });

  function render(footprint: Footprint | null = FULL(), respond: 'ok' | 'error' | 'none' = 'ok'): void {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(MethodologyFacade).show();

    if (respond === 'ok') http.expectOne(METHODOLOGY_URL).flush({ data: methodologyDto() });
    else if (respond === 'error') http.expectOne(METHODOLOGY_URL).flush({ error: { code: 'INTERNAL', message: 'Falló' } }, { status: 500, statusText: 'Server Error' });

    fixture = TestBed.createComponent(MethodologyDialogComponent);
    fixture.componentRef.setInput('footprint', footprint);
    fixture.detectChanges();
  }

  afterEach(() => http?.match(() => true));

  it('abre modal con la pestaña «Origen del dato» (no preseleccionada otra) y el título accesible por un id seguro', () => {
    render();
    const dialog = q<HTMLDialogElement>('methodology-dialog')!;

    expect(dialog.open).toBeTrue();
    expect(dialog.getAttribute('aria-labelledby')).toMatch(/^mdl-\d+-title$/);
    expect(el().querySelector(`#${dialog.getAttribute('aria-labelledby')}`)?.textContent).toContain('Metodología y calidad del dato');
    expect(q('methodology-tab-origin')?.getAttribute('aria-selected')).toBe('true');
    expect(q('methodology-tab-coverage')?.getAttribute('aria-selected')).toBe('false');
    expect(q('methodology-tab-origin')?.getAttribute('tabindex')).toBe('0');
    expect(q('methodology-tab-coverage')?.getAttribute('tabindex')).toBe('-1');
  });

  it('el encabezado muestra versión, alcance y unidad del servidor y la advertencia de estimados con su texto', () => {
    render();

    expect(text('methodology-line')).toBe('Versión 1.0.0 · Emisiones directas por combustión (TTW), solo CO₂ · kg de CO₂ (no CO₂e)');
    expect(text('methodology-estimates')).toBe('Parte de las emisiones puede calcularse con consumo estimado y no con consumo real.');
  });

  it('sin estimados no hay advertencia en el encabezado', () => {
    render(buildFootprint({ methodology: methodologyRef({ hasEstimates: false }), dataOriginShare: dataOriginShare(), inventoryCoverage: inventoryCoverage() }));

    expect(q('methodology-estimates')).toBeNull();
  });

  describe('origen del dato', () => {
    it('lista los 4 orígenes con etiqueta, kg, viajes y pct del servidor, y las fuentes del de referencia', () => {
      render();

      expect(el().querySelectorAll('[data-testid="origin-legend"] > li').length).toBe(4);
      expect(text('origin-REAL_CONSUMPTION')).toContain('Consumo real');
      expect(text('origin-REAL_CONSUMPTION')).toContain('50,0 %');
      expect(text('origin-REAL_CONSUMPTION')).toContain('500 kg CO₂');
      expect(text('origin-REAL_CONSUMPTION')).toContain('4 viajes');
      expect(text('origin-DECLARED_EFFICIENCY')).toContain('25,1 %');
      expect(text('origin-MEASURED_EFFICIENCY')).toContain('0,0 %');
      expect(text('origin-REFERENCE_ESTIMATE')).toContain('UPME: 20,0 % · 200 kg CO₂ · 2 viajes');
      expect(text('origin-REFERENCE_ESTIMATE')).toContain('Steer/ANDI: 4,9 %');
      expect(text('origin-total')).toContain('Total contabilizado: 1.000 kg CO₂ · 10 viajes');
    });

    it('muestra el texto `verification` del servidor y la barra no es lo único que identifica cada origen', () => {
      render();

      expect(text('origin-verification')).toBe(VERIFICATION_TEXT);
      expect(q('origin-bar')?.getAttribute('aria-hidden')).toBe('true');
      expect(el().querySelectorAll('[data-testid="origin-bar"] i').length).toBe(3);
    });

    it('pct `null` (sin total contabilizado) se muestra «—» y no dibuja tramos', () => {
      const share = dataOriginShare();

      render(buildFootprint({ methodology: methodologyRef(), dataOriginShare: { ...share, totalKgCo2: 0, totalTrips: 0, buckets: share.buckets.map((b) => ({ ...b, kgCo2: 0, trips: 0, pct: null, sources: [] })) }, inventoryCoverage: inventoryCoverage() }));

      expect(text('origin-REAL_CONSUMPTION')).toContain('—');
      expect(el().querySelectorAll('[data-testid="origin-bar"] i').length).toBe(0);
    });

    it('una clave de origen desconocida se muestra con su etiqueta sin romper', () => {
      const share = dataOriginShare();

      render(buildFootprint({ methodology: methodologyRef(), dataOriginShare: { ...share, buckets: [...share.buckets, { key: 'FUTURE', label: 'Origen nuevo', meaning: '', kgCo2: 1, trips: 1, pct: null, sources: [] }] } }));

      expect(text('origin-FUTURE')).toContain('Origen nuevo');
    });

    it('sin el bloque (servidor antiguo) lo dice sin inventar cifras', () => {
      render(buildFootprint({ methodology: methodologyRef() }));

      expect(q('origin-none')).not.toBeNull();
      expect(q('origin-legend')).toBeNull();
    });
  });

  describe('cobertura del inventario', () => {
    beforeEach(() => {
      render();
      click('methodology-tab-coverage');
    });

    it('muestra calculados, pendientes y bloqueados con el denominador de elegibles y el pct del servidor', () => {
      expect(text('coverage-pct')).toBe('66,7 %');
      expect(text('coverage-calculated')).toBe('12 viajes');
      expect(text('coverage-pending')).toBe('4 viajes');
      expect(text('coverage-blocked')).toBe('2 viajes');
      expect(text('coverage-eligible')).toBe('18 viajes');
    });

    it('retenidos, duplicados y anulados van aparte con sus kg y el texto `denominator` y `basis` del servidor', () => {
      const rows = Array.from(el().querySelectorAll('[data-testid="coverage-excluded"] tbody tr')).map((tr) => Array.from(tr.children).map((c) => c.textContent?.trim()));

      expect(rows).toEqual([['Retenidos', '3 viajes', '120,5 kg CO₂'], ['Duplicados', '1 viaje', '30 kg CO₂'], ['Anulados', '0 viajes', '0 kg CO₂']]);
      expect(text('coverage-counted')).toContain('1.000 kg CO₂');
      expect(text('coverage-denominator')).toBe('Denominador: viajes calculados, pendientes y bloqueados.');
      expect(text('coverage-basis')).toBe('Cobertura por cantidad de viajes, no por emisiones.');
    });

    it('cobertura `null` se muestra «—»', () => {
      fixture.componentRef.setInput('footprint', buildFootprint({ methodology: methodologyRef(), inventoryCoverage: { ...inventoryCoverage(), coveragePct: null } }));
      fixture.detectChanges();

      expect(text('coverage-pct')).toBe('—');
    });
  });

  describe('metodología', () => {
    beforeEach(() => {
      render();
      click('methodology-tab-method');
    });

    it('arranca en «Alcance y unidad»: alcance, exclusiones, gases y la unidad kg de CO₂ (no CO₂e)', () => {
      expect(text('method-scope')).toContain('TTW');
      expect(text('method-excluded')).toContain('Metano (CH₄) y óxido nitroso (N₂O)');
      expect(text('method-gases')).toContain('CO2 · Incluido');
      expect(text('method-gases')).toContain('CH4 · No incluido');
      expect(text('method-unit')).toContain('kg de CO₂ (no CO₂e)');
    });

    it('factores: política y tabla paginada (4 por página) con factor, unidad, fuente, vigencia y estado', () => {
      click('methodology-section-factors');

      expect(text('method-factor-policy')).toContain('Verificado');
      expect(el().querySelectorAll('[data-testid="method-factors"] tbody tr').length).toBe(4);
      const first = Array.from(el().querySelector('[data-testid="method-factors"] tbody tr')!.children).map((c) => c.textContent?.replace(/\s+/g, ' ').trim());

      expect(first).toEqual(['Combustible DIESEL_B2', '10.180', 'kg CO₂/gal', 'UPME FECOC · Tabla 5, p. 31', '2016', 'En uso']);
      click('method-next-factors');
      expect(el().querySelectorAll('[data-testid="method-factors"] tbody tr').length).toBe(1);
      expect(Array.from(el().querySelector('[data-testid="method-factors"] tbody tr')!.children).map((c) => c.textContent?.trim())).toEqual(['Combustible OTHER_B', '—', 'kg CO₂/gal', 'UPME FECOC · Tabla 5, p. 31', '2016', 'Sin uso en el cálculo']);
      expect((q('method-next-factors') as HTMLButtonElement).disabled).toBeTrue();
    });

    it('la columna «Unidad» muestra la etiqueta del servidor y solo cae al código si falta', () => {
      click('methodology-section-factors');
      const units = Array.from(el().querySelectorAll('[data-testid="method-factor-unit"]')).map((c) => c.textContent?.trim());

      expect(units).toEqual(['kg CO₂/gal', 'kg CO₂/gal', 'kg CO₂/gal', 'kg_CO2/gal']);
    });

    it('«Factores usados en el periodo»: combustible, valor, etiqueta de unidad, fuente y viajes del servidor, de 3 en 3', () => {
      click('methodology-section-factors');
      const items = (): string[] => Array.from(el().querySelectorAll('[data-testid="method-used-factors"] li')).map((li) => li.textContent?.replace(/\s+/g, ' ').trim() ?? '');

      expect(items()).toEqual(['Combustible DIESEL_B2 · 10.180 kg CO₂/gal · UPME FECOC 2016 · 7 viajes', 'Combustible DIESEL_B2 · 10.149 kg CO₂/gal · UPME calculadora 2024 · 3 viajes', 'Combustible GASOLINE_MOTOR · 8.150 kg_CO2/gal · UPME FECOC · 1 viaje']);
      click('method-next-used');
      expect(items()).toEqual(['Combustible NATURAL_GAS · 1.9 kg CO₂/m³ · UPME FECOC 2016 · 2 viajes']);
    });

    it('referencias: solo como consultadas, 2 por página', () => {
      click('methodology-section-references');

      expect(el().querySelectorAll('[data-testid="method-references"] .ref').length).toBe(2);
      expect(text('method-references')).toContain('Referencia metodológica consultada');
    });

    it('datos y límites: orígenes, distancia, incertidumbre, limitaciones y advertencia de estimados', () => {
      click('methodology-section-data');
      expect(text('method-origins')).toContain('Consumo real');
      expect(text('method-distance')).toContain('ruta entre municipios');

      click('methodology-section-limits');
      expect(text('method-uncertainty')).toContain('intervalo de incertidumbre');
      expect(text('method-limitations')).toContain('declarados por la empresa');
      expect(text('method-estimates')).toContain('consumo estimado');
    });

    it('muestra el estado «Pendiente de aprobación por LOGYCA», la nota jurídica y el `not_claimed` del servidor al pie', () => {
      expect(text('method-review')).toBe('Pendiente de aprobación por LOGYCA');
      expect(text('method-legal')).toContain('pendiente de revisión jurídica');
      expect(text('method-not-claimed')).toBe(NOT_CLAIMED.join(' '));
    });
  });

  it('la declaración con error muestra «Reintentar», que la vuelve a pedir; Origen y Cobertura siguen disponibles', () => {
    render(FULL(), 'error');
    expect(q('origin-legend')).not.toBeNull();
    click('methodology-tab-method');

    expect(q('method-error')?.getAttribute('role')).toBe('alert');
    click('method-retry');
    http.expectOne(METHODOLOGY_URL).flush({ data: methodologyDto() });
    fixture.detectChanges();

    expect(q('method-scope')).not.toBeNull();
  });

  it('mientras llega la declaración muestra un estado de carga accesible', () => {
    render(FULL(), 'none');
    click('methodology-tab-method');

    expect(q('method-loading')?.getAttribute('role')).toBe('status');
  });

  describe('accesibilidad', () => {
    it('las flechas, Inicio y Fin cambian de pestaña y anuncian la sección en la región viva', () => {
      render();
      q('methodology-tab-origin')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      fixture.detectChanges();

      expect(q('methodology-tab-coverage')?.getAttribute('aria-selected')).toBe('true');
      expect(text('methodology-live')).toBe('Cobertura del inventario');
      q('methodology-tab-coverage')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      fixture.detectChanges();
      expect(q('methodology-tab-method')?.getAttribute('aria-selected')).toBe('true');
      q('methodology-tab-method')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      fixture.detectChanges();
      expect(q('methodology-tab-origin')?.getAttribute('aria-selected')).toBe('true');
    });

    it('el panel se rotula con la pestaña activa y los ids de las pestañas no se repiten entre diálogos', () => {
      render();
      const panel = q('methodology-panel')!;

      expect(panel.getAttribute('aria-labelledby')).toBe(q('methodology-tab-origin')!.id);
      expect(q('methodology-tab-origin')!.getAttribute('aria-controls')).toBe(panel.id);

      const second = TestBed.createComponent(MethodologyDialogComponent);

      second.detectChanges();
      expect((second.nativeElement as HTMLElement).querySelector('[role="tab"]')!.id).not.toBe(q('methodology-tab-origin')!.id);
    });

    it('«Cerrar» cierra el diálogo y avisa con `closed` (el mismo evento `close` nativo que dispara Escape)', async () => {
      render();
      let closed = 0;

      fixture.componentInstance.closed.subscribe(() => closed++);
      const native = new Promise((resolve) => q('methodology-dialog')!.addEventListener('close', resolve, { once: true }));

      click('methodology-close');
      await native;
      expect(q<HTMLDialogElement>('methodology-dialog')!.open).toBeFalse();
      expect(closed).toBe(1);
    });
  });

  describe('lenguaje', () => {
    it('nada de lo que pone la interfaz dice «verificado»: solo las frases del servidor lo contienen', () => {
      render();
      const serverText = new Set<string>();
      const collect = (value: unknown): void => {
        if (typeof value === 'string') serverText.add(value);
        else if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === 'object') Object.values(value).forEach(collect);
      };

      collect(methodology());
      collect(FULL());
      let all = '';

      for (const tab of ['origin', 'coverage', 'method']) {
        click(`methodology-tab-${tab}`);
        for (const section of tab === 'method' ? ['scope', 'factors', 'references', 'data', 'limits'] : [null]) {
          if (section) click(`methodology-section-${section}`);
          all += ' ' + (el().textContent ?? '');
        }
      }

      for (const sentence of [...serverText].sort((a, b) => b.length - a.length)) all = all.split(sentence).join(' ');

      expect(all).not.toMatch(/verificad/i);
      expect(all).not.toMatch(/certificad|cumple|conforme/i);
    });

    it('ningún tooltip del diálogo muestra un código de estado crudo (p. ej. VERIFIED)', () => {
      render();
      for (const tab of ['origin', 'coverage', 'method']) {
        click(`methodology-tab-${tab}`);
        for (const section of tab === 'method' ? ['scope', 'factors', 'references', 'data', 'limits'] : [null]) {
          if (section) click(`methodology-section-${section}`);
          const titles = Array.from(el().querySelectorAll('[title]')).map((n) => n.getAttribute('title') ?? '');

          for (const title of titles) expect(title).not.toMatch(/^[A-Z][A-Z_]+$/);
        }
      }
      expect(el().querySelector('[title="VERIFIED"]')).toBeNull();
    });

    it('el CSS usa solo tokens: sin hexadecimales ni rgb() y solo las tintas 14/20/40/60/80 %', () => {
      render();
      const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' ')).filter((c) => c.includes('dialog.mdl')).join('\n');

      expect(css).toContain('dialog.mdl');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
    });
  });
});
