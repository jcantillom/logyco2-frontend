import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { buildSuperAdmin, buildUser } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { TrendChartComponent } from '../../shared/ui/charts/trend-chart.component';
import { IntelligenceComponent } from './intelligence.component';

const API = 'http://api.test/api/v1/intelligence';
const dane = { code: 'DANE_ICTC', name: 'ICTC', publisher: 'DANE', url: 'https://www.dane.gov.co', license: null };
const minenergia = { code: 'CREG_FUEL_PRICES', name: 'Precios', publisher: 'CREG', url: 'https://www.minenergia.gov.co', license: null };

const ictcCard = {
  code: 'ICTC_TOTAL', name: 'ICTC · Total nacional', category: 'LOGISTICS_COST', unit: 'Índice (dic. 2015 = 100)', status: 'AVAILABLE', value: 163.81,
  area_code: 'CO', area_name: 'Colombia', reference_period: '2026-09-01', published_at: '2026-10-21', acquired_at: new Date().toISOString(), valid_from: null, valid_to: null,
  kind: 'OFFICIAL', source: dane, variation: { monthly_pct: 0.09, annual_pct: 6.13, year_to_date_pct: 4.2 }, last_success_at: new Date().toISOString(), last_error_code: null,
};
const emptyCard = (code: string, name: string) => ({
  code, name, category: 'ENERGY_MARKET', unit: 'COP/galón', status: 'NO_DATA', value: null, area_code: null, area_name: null, reference_period: null, published_at: null,
  acquired_at: null, valid_from: null, valid_to: null, kind: null, source: minenergia, variation: null, last_success_at: null, last_error_code: null,
});
const history = (code: string, points: number[]) => ({
  code, name: code, unit: 'u', area_code: 'CO', area_name: 'Colombia', source: dane,
  points: points.map((value, i) => ({ reference_period: `2026-0${i + 1}-01`, value, published_at: null, acquired_at: '2026-11-18T10:00:00Z', version: 1, monthly_pct: null, annual_pct: null })),
  areas: [{ code: '11001', name: 'Bogotá' }, { code: '05001', name: 'Medellín' }],
});

describe('IntelligenceComponent (LoGyCO₂ Intelligence)', () => {
  let fixture: ComponentFixture<IntelligenceComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = (selector: string): HTMLElement => el().querySelector<HTMLElement>(selector)!;
  const requests = (path: string): TestRequest[] => http.match((r) => r.url === `${API}${path}`).filter((r) => !r.cancelled);

  function create(user = buildSuperAdmin(), section?: string): void {
    TestBed.configureTestingModule({ imports: [IntelligenceComponent], providers: [...provideTestApp(), { provide: ActivatedRoute, useValue: { data: of(section ? { section } : {}) } }] });
    http = TestBed.inject(HttpTestingController);
    signInAs(user, TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(IntelligenceComponent);
    fixture.detectChanges();
  }

  function answer(options: { featured?: unknown[]; energy?: number[]; costs?: number[]; sourceError?: string | null; cities?: unknown[]; gasolineCities?: unknown[]; gncvCities?: unknown[]; gncv?: number[]; groups?: unknown[] } = {}): void {
    const { featured = [emptyCard('FUEL_ACPM_PRICE', 'Precio del ACPM'), emptyCard('FUEL_GASOLINE_PRICE', 'Precio de la gasolina corriente'), ictcCard], energy = [], costs = [160, 161, 163.81] } = options;
    requests('/summary').forEach((r) => r.flush({ data: { generated_at: new Date().toISOString(), featured } }));
    requests('/sources').forEach((r) => r.flush({ data: { items: [
      { code: 'DANE_ICTC', name: 'ICTC', publisher: 'DANE', url: 'https://www.dane.gov.co', acquisition: 'AUTOMATIC', provider_available: true, frequency: 'Mensual', license: null, notes: null, last_attempt_at: null, last_success_at: '2026-11-18T09:00:00Z', last_error_code: options.sourceError ?? null, last_run_status: 'SUCCESS', last_run_inserted: 1, last_run_revised: 0 },
      { code: 'FUTURA', name: 'Fuente futura', publisher: 'Entidad', url: 'https://example.test', acquisition: 'AUTOMATIC', provider_available: false, frequency: 'Mensual', license: null, notes: null, last_attempt_at: null, last_success_at: null, last_error_code: null, last_run_status: null, last_run_inserted: null, last_run_revised: null },
    ] } }));
    requests('/indicators/FUEL_ACPM_PRICE/history').forEach((r) => r.flush({ data: history('FUEL_ACPM_PRICE', energy) }));
    const areas = (code: string, rows: unknown[]) => ({ data: { code, name: code, unit: 'COP/galón', reference_period: rows.length ? '2026-10-01' : null, source: minenergia, rows } });
    requests('/indicators/FUEL_ACPM_PRICE/areas').forEach((r) => r.flush(areas('FUEL_ACPM_PRICE', options.cities ?? [])));
    requests('/indicators/FUEL_GASOLINE_PRICE/areas').forEach((r) => r.flush(areas('FUEL_GASOLINE_PRICE', options.gasolineCities ?? [])));
    requests('/indicators/FUEL_GNCV_PRICE/areas').forEach((r) => r.flush(areas('FUEL_GNCV_PRICE', options.gncvCities ?? [])));
    requests('/indicators/FUEL_GNCV_PRICE/history').forEach((r) => r.flush({ data: history('FUEL_GNCV_PRICE', options.gncv ?? [3000, 3100, 3200]) }));
    requests('/ictc/groups').forEach((r) => r.flush({ data: { reference_period: '2026-09-01', source: dane, items: options.groups ?? [] } }));
    requests('/indicators/ICTC_TOTAL/history').forEach((r) => r.flush({ data: history('ICTC_TOTAL', costs) }));
    fixture.detectChanges();
  }
  it('muestra el nombre oficial y el subtítulo', () => {
    create(); answer();

    expect(q('h1').textContent!.replace(/\s+/g, ' ')).toContain('LoGyCO2 Intelligence');
    expect(el().textContent).toContain('Inteligencia logística, energética y ambiental para el transporte de carga en Colombia.');
    expect(el().textContent).not.toMatch(/observatori/i);
  });

  it('cada KPI con datos muestra valor, unidad, variaciones, período, fuente y fecha de adquisición', () => {
    create(); answer();

    const card = q('[data-indicator="ICTC_TOTAL"]');
    expect(card.querySelector('[data-testid="value"]')!.textContent).toContain('163,81');
    const text = card.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Índice (dic. 2015 = 100)');
    expect(text).toContain('Sep 2026');
    expect(text).toContain('DANE');
    expect(text).toContain('Adq.');
    expect(text).toContain('Anual');
    expect(card.querySelector('.vstats')!.textContent!.replace(/\s+/g, ' ')).toContain('Mensual↑ +0,09%');
    expect(card.querySelector('.mean')!.textContent).toContain('63,8 % por encima de la base');
    expect(card.textContent).toContain('Período septiembre de 2026');
    expect(text).toContain('6,13%');
  });

  it('un indicador sin datos muestra un estado vacío y NINGÚN número', () => {
    create(); answer();

    const card = q('[data-indicator="FUEL_ACPM_PRICE"]');
    expect(card.querySelector('[data-testid="no-data"]')!.textContent).toContain('Sin información disponible');
    expect(card.querySelector('[data-testid="value"]')).toBeNull();
    expect(card.textContent).not.toMatch(/\d{2,}/);
  });

  it('si la última actualización falló, avisa y conserva el último dato válido', () => {
    create(); answer({ featured: [{ ...ictcCard, last_error_code: 'ICTC_UNREACHABLE' }] });

    const card = q('[data-indicator="ICTC_TOTAL"]');
    expect(card.querySelector('[data-testid="value"]')!.textContent).toContain('163,81');
    expect(card.querySelector('.stale')!.textContent).toContain('Se muestra el último dato válido');
  });

  it('el histórico de costos usa el gráfico', () => {
    create(buildSuperAdmin(), 'costs'); answer();

    expect(el().querySelectorAll('[data-testid="costs"] app-trend-chart').length).toBe(1);
    const chart = fixture.debugElement.query(By.css('[data-testid="costs"] app-trend-chart')).componentInstance as TrendChartComponent;
    expect(chart.series()[0].values).toEqual([160, 161, 163.81]);
  });
  it('el histórico de combustibles sin datos muestra su estado vacío, sin gráfico', () => {
    create(); answer();

    expect(el().querySelector('[data-testid="energy-overview"] app-trend-chart')).toBeNull();
    expect(q('[data-testid="energy-empty"]').textContent).toContain('Sin información disponible');
  });

  describe('Mercado energético: lectura del precio y comparación entre ciudades', () => {
    const city = (code: string, name: string, value: number, previous: number | null = 0) => ({ area_code: code, area_name: name, value, monthly_pct: null, previous_pct: previous });
    const text = (id: string): string => q(`[data-testid="${id}"]`).textContent!.replace(/\s+/g, ' ').trim();

    it('«Lectura» resume el precio actual, el cambio, el período y la posición frente al promedio de ciudades', () => {
      create(buildSuperAdmin(), 'energy'); answer({ energy: [11600, 11616, 11616], cities: [city('CO', 'Colombia', 11616), city('05001', 'Medellín', 11000)] });

      expect(text('energy-price')).toBe('$ 11.616');
      expect(text('energy-change')).toBe('—'); // sin variación publicada en los datos
      expect(text('energy-window')).toBe('↑ +0,14%'); // 11.616 / 11.600 − 1
      expect(text('energy-vs-average')).toBe('↑ +2,72%'); // 11.616 / promedio 11.308 − 1
      expect(text('energy-sentence')).toContain('es $ 11.616 por unidad');
      expect(text('energy-sentence')).toContain('no ha cambiado desde el'); // los dos últimos precios son iguales
    });

    it('si el precio cambió, la frase lo dice con su variación en vez de «no ha cambiado»', () => {
      create(buildSuperAdmin(), 'energy'); answer({ energy: [11500, 11616] });

      expect(text('energy-sentence')).not.toContain('no ha cambiado');
      expect(text('energy-sentence')).toMatch(/es \$ 11\.616 por unidad\.$/);
    });

    it('el ranking resume la más barata, la más cara y la diferencia, y escala las barras entre ciudades (no desde cero)', () => {
      create(buildSuperAdmin(), 'energy'); answer({ energy: [11600, 11616], cities: [city('CO', 'Colombia', 11616), city('05001', 'Medellín', 11000, 0.5), city('76001', 'Cali', 12000)] });

      expect(text('city-priciest')).toBe('Cali');
      expect(text('city-cheapest')).toBe('Medellín');
      expect(text('city-spread')).toBe('9,09 %'); // 12.000 / 11.000 − 1
      const widths = Array.from(el().querySelectorAll<HTMLElement>('[data-testid="cities"] .rank .bar i')).map((i) => i.style.width);
      expect(widths).toEqual(['100%', '73%', '30%']); // la más cara 100 %, la más barata 30 %
    });

    it('la ciudad que se está viendo queda resaltada y elegir otra pide su histórico a la API', () => {
      create(buildSuperAdmin(), 'energy'); answer({ energy: [11600, 11616], cities: [city('CO', 'Colombia', 11616), city('05001', 'Medellín', 11000, 0.5)] });

      expect(Array.from(el().querySelectorAll('[data-testid="cities"] .rank li.sel .name')).map((n) => n.textContent!.trim())).toEqual(['Colombia']);
      Array.from(el().querySelectorAll<HTMLButtonElement>('[data-testid="cities"] .r-row')).find((b) => b.textContent!.includes('Medellín'))!.click();

      expect(requests('/indicators/FUEL_ACPM_PRICE/history').some((r) => r.request.params.get('area_code') === '05001')).toBeTrue();
    });

    it('cada ciudad se compara con el promedio y solo muestra el cambio si lo hubo; sin cambios lo dice una sola vez', () => {
      create(buildSuperAdmin(), 'energy'); answer({ energy: [11600, 11616], cities: [city('CO', 'Colombia', 11616), city('05001', 'Medellín', 11000, 0.5), city('76001', 'Cali', 12000)] });
      const rowText = (name: string): string => Array.from(el().querySelectorAll('[data-testid="cities"] .rank li')).find((li) => li.textContent!.includes(name))!.textContent!.replace(/\s+/g, ' ');

      expect(rowText('Medellín')).toContain('vs. promedio');
      expect(rowText('Medellín')).toContain('↑ +0,5% frente a la publicación anterior');
      expect(rowText('Cali')).not.toContain('frente a la publicación anterior');
      expect(text('city-note')).not.toContain('Ninguna ciudad cambió');

      TestBed.resetTestingModule();
      create(buildSuperAdmin(), 'energy'); answer({ energy: [11600, 11616], cities: [city('CO', 'Colombia', 11616), city('05001', 'Medellín', 11000)] });

      expect(text('city-note')).toContain('Ninguna ciudad cambió frente a la publicación anterior');
      expect(el().querySelector('[data-testid="cities"]')!.textContent).not.toContain('frente a la publicación anterior 0');
    });

    it('avisa que el eje del gráfico no parte de cero, y solo cuando hay gráfico', () => {
      create(buildSuperAdmin(), 'energy'); answer({ energy: [11600, 11616] });

      expect(text('energy-axis-note')).toContain('no parte de cero');

      TestBed.resetTestingModule();
      create(buildSuperAdmin(), 'energy'); answer({ energy: [] });

      expect(el().querySelector('[data-testid="energy-axis-note"]')).toBeNull();
      expect(el().querySelector('[data-testid="energy-reading"]')).toBeNull();
    });
  });

  it('cambiar de combustible o de grupo de costos vuelve a pedir el histórico a la API (no se agrega en Angular)', () => {
    create(buildSuperAdmin(), 'energy'); answer();

    Array.from(el().querySelectorAll<HTMLButtonElement>('[data-testid="energy"] .seg button')).find((b) => b.textContent!.includes('Gasolina'))!.click();
    expect(requests('/indicators/FUEL_GASOLINE_PRICE/history').length).toBe(1);

    TestBed.resetTestingModule();
    create(buildSuperAdmin(), 'costs'); answer();
    Array.from(el().querySelectorAll<HTMLButtonElement>('[data-testid="costs"] .seg button')).find((b) => b.textContent!.includes('Combustibles'))!.click();
    expect(requests('/indicators/ICTC_FUEL/history').length).toBe(1);
  });

  it('la tabla de fuentes muestra el tipo de adquisición y el estado; la importación manual figura como tal', () => {
    create(); answer({ sourceError: 'ICTC_UNREACHABLE' });

    const rows = Array.from(el().querySelectorAll('[data-testid="sources"] tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' '));
    expect(rows[0]).toContain('Automática');
    expect(rows[0]).toContain('Falló: La fuente del DANE no respondió');
    expect(rows[1]).toContain('Pendiente de fuente automática');
    expect(rows[1]).toContain('Sin datos aún');
  });

  it('solo el administrador de la plataforma ve actualizar e importar', () => {
    create(); answer();
    expect(el().querySelector('[data-testid="intelligence-admin"]')).not.toBeNull();
    expect(el().querySelector('[data-testid="import-fuel"]')).toBeNull(); // la importación manual no existe
    expect(el().querySelector('input[type="file"]')).toBeNull();
    expect(el().textContent).not.toMatch(/importar precios|plantilla/i);
    TestBed.resetTestingModule();

    create(buildUser({ memberships: [] })); answer();
    expect(el().querySelector('[data-testid="intelligence-admin"]')).toBeNull();
  });

  const fail = (path: string, status = 500): void =>
    requests(path).forEach((r) => r.flush({ error: { code: 'INTERNAL_ERROR', message: 'x', request_id: 'req-1' } }, { status, statusText: 'Error' }));

  it('si todo falla por la misma causa muestra UN solo aviso general (con su identificador) y no cinco alertas', () => {
    create();
    ['/summary', '/sources', '/indicators/FUEL_ACPM_PRICE/history', '/indicators/FUEL_ACPM_PRICE/areas', '/indicators/ICTC_TOTAL/history'].forEach((path) => fail(path));
    fixture.detectChanges();

    expect(el().querySelectorAll('.alert-danger').length).toBe(1);
    expect(q('[data-testid="shared-error"]').textContent).toContain('req-1');
    expect(el().querySelectorAll('[data-testid="section-unavailable"]').length).toBe(1);
  });

  it('«Reintentar» vuelve a pedir todo y, si responde bien, el aviso desaparece y se muestran los datos', () => {
    create();
    ['/summary', '/sources', '/indicators/FUEL_ACPM_PRICE/history', '/indicators/FUEL_ACPM_PRICE/areas', '/indicators/ICTC_TOTAL/history'].forEach((path) => fail(path));
    fixture.detectChanges();

    q('[data-testid="shared-retry"]').click();
    answer();

    expect(el().querySelector('[data-testid="shared-error"]')).toBeNull();
    expect(q('[data-indicator="ICTC_TOTAL"] [data-testid="value"]').textContent).toContain('163,81');
  });

  it('un único fallo se explica en su propia sección y el resto sigue funcionando', () => {
    create();
    fail('/indicators/ICTC_TOTAL/history');
    answer();

    expect(el().querySelector('[data-testid="shared-error"]')).toBeNull();
    expect(q('[data-testid="costs-overview"] .alert-danger')).not.toBeNull();
    expect(q('[data-indicator="ICTC_TOTAL"] [data-testid="value"]').textContent).toContain('163,81');
  });

  it('una respuesta 403 se explica con el mensaje del catálogo, una sola vez', () => {
    create(buildUser({ memberships: [] }));
    ['/summary', '/sources', '/indicators/FUEL_ACPM_PRICE/history', '/indicators/FUEL_ACPM_PRICE/areas', '/indicators/ICTC_TOTAL/history'].forEach((path) =>
      requests(path).forEach((r) => r.flush({ error: { code: 'SECTOR_DATA_FORBIDDEN', message: 'x', request_id: 'req-9' } }, { status: 403, statusText: 'Forbidden' })),
    );
    fixture.detectChanges();

    expect(el().querySelectorAll('.alert-danger').length).toBe(1);
    expect(q('[data-testid="shared-error"]').textContent).toContain('No tienes acceso a los indicadores sectoriales');
  });

  it('cada sección es una ruta: la ruta decide qué panel se dibuja, sin pestañas internas', () => {
    const visible = (section?: string): { shown: string[]; title: string } => {
      TestBed.resetTestingModule();
      create(buildSuperAdmin(), section); answer();

      return {
        shown: ['overview', 'energy', 'costs'].filter((id) => el().querySelector(`#panel-${id}`) !== null),
        title: q('h1').textContent!.replace(/\s+/g, ' ').trim(),
      };
    };

    expect(visible()).toEqual({ shown: ['overview'], title: 'LoGyCO2 Intelligence' });
    expect(visible('energy')).toEqual({ shown: ['energy'], title: 'Mercado energético' });
    expect(visible('costs')).toEqual({ shown: ['costs'], title: 'Costos de transporte' });
    expect(el().querySelector('.ig-tabs, [role="tablist"]')).toBeNull();
  });

  it('los accesos del resumen enlazan a las rutas de energía y de costos', () => {
    create(); answer();

    const hrefs = Array.from(el().querySelectorAll<HTMLAnchorElement>('a.link')).map((a) => a.getAttribute('href'));
    // La vista general vive en el espacio de la empresa: sus enlaces de detalle no pueden salir a la consola de plataforma (solo SUPER_ADMIN).
    expect(hrefs).toContain('/intelligence/energia');
    expect(hrefs).toContain('/intelligence/costos');
    expect(hrefs.some((href) => href?.startsWith('/plataforma'))).toBeFalse();
  });

  it('«Lectura del índice» calcula último, máximo, mínimo y cambio de la ventana con la serie cargada', () => {
    create(buildSuperAdmin(), 'costs'); answer({ costs: [160, 170, 150, 163.81] });
    const text = (id: string): string => q(`[data-testid="${id}"]`).textContent!.trim();

    expect(text('cost-last')).toBe('163,81');
    expect(text('cost-max')).toBe('170');
    expect(text('cost-min')).toBe('150');
    expect(text('cost-window')).toBe('↑ +2,38%'); // 163,81 / 160 − 1
  });

  it('«Lectura del índice» explica el índice en palabras: cuánto está por encima de la base (dic. 2015 = 100)', () => {
    create(buildSuperAdmin(), 'costs'); answer({ costs: [160, 170, 150, 163.81] });

    expect(q('[data-testid="cost-sentence"]').textContent).toContain('Los costos del transporte de carga están 63,81 % por encima de diciembre de 2015');
    expect(q('[data-testid="cost-stats"]').textContent).toContain('Base: diciembre de 2015 = 100');
    expect(q('[data-testid="cost-stats"]').textContent).toContain('Último mes');
    expect(q('[data-testid="cost-stats"]').textContent).toContain('Últimos 12 meses');
  });

  it('«Lectura del índice» dice dónde está el último dato dentro del período: cerca del máximo, del mínimo o en la zona media', () => {
    const where = (costs: number[]): string => {
      TestBed.resetTestingModule();
      create(buildSuperAdmin(), 'costs'); answer({ costs });

      return q('[data-testid="cost-where"]').textContent!;
    };

    expect(where([150, 160, 170, 169])).toContain('cerca del máximo');
    expect(where([170, 160, 150, 151])).toContain('cerca del mínimo');
    expect(where([160, 170, 150, 160])).toContain('zona media');
  });

  it('la frase de lectura nombra el grupo de costos elegido y no habla de «los costos» en general', () => {
    create(buildSuperAdmin(), 'costs'); answer({ costs: [160, 170, 150, 163.81] });
    Array.from(el().querySelectorAll<HTMLButtonElement>('[data-testid="costs"] .seg button')).find((b) => b.textContent!.includes('Combustibles'))!.click();

    fixture.detectChanges();

    expect(q('[data-testid="cost-sentence"]').textContent).toContain('El grupo «Combustibles» está');
  });

  it('el gráfico de costos ajusta el eje a los datos y lo avisa, y su subtítulo dice el grupo y el período', () => {
    create(buildSuperAdmin(), 'costs'); answer();
    const chart = fixture.debugElement.query(By.css('[data-testid="costs"] app-trend-chart')).componentInstance as TrendChartComponent;

    expect(chart.fitRange()).toBeTrue();
    expect(q('[data-testid="axis-note"]').textContent).toContain('no parte de cero');
    expect(q('[data-testid="cost-context"]').textContent).toContain('Total nacional · últimos 12 meses');
  });

  it('muestra cuándo se actualizaron por última vez los datos', () => {
    create(); answer();

    expect(q('[data-testid="last-update"]').textContent).toContain('Última actualización general');
  });

  it('el resumen une ACPM y gasolina por ciudad (Bogotá primero) y muestra la variación del ACPM', () => {
    create();
    answer({
      cities: [{ area_code: '05001', area_name: 'Medellín', value: 11394, monthly_pct: -0.3 }, { area_code: '11001', area_name: 'Bogotá', value: 11427, monthly_pct: -0.2 }],
      gasolineCities: [{ area_code: '11001', area_name: 'Bogotá', value: 15856, monthly_pct: -0.1 }],
    });

    const rows = Array.from(el().querySelectorAll('[data-testid="city-table"] tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toBe('Bogotá$ 11.427$ 15.856↓ -0,2%');
    expect(rows[1]).toContain('Medellín');
    expect(rows[1]).toContain('—'); // sin precio de gasolina en esa ciudad: no se inventa
  });

  it('«ICTC por grupo de costos» lista cada grupo con su variación mensual', () => {
    create();
    answer({ groups: [
      { code: 'ICTC_TOTAL', name: 'Total nacional', value: 163.81, monthly_pct: 0.56, annual_pct: 6.1 },
      { code: 'ICTC_FUEL', name: 'Combustibles', value: 150, monthly_pct: -0.42, annual_pct: 2 },
    ] });

    const rows = Array.from(el().querySelectorAll('[data-testid="groups"] li')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['Total nacional↑ +0,56%', 'Combustibles↓ -0,42%']);
  });

  it('los precios en pesos se muestran con «$» y sin decimales; los índices con dos decimales', () => {
    create();
    answer({ featured: [{ ...emptyCard('FUEL_ACPM_PRICE', 'x'), status: 'AVAILABLE', value: 11427.0, area_name: 'Bogotá', reference_period: '2026-10-01', kind: 'OFFICIAL', variation: { monthly_pct: -0.2, annual_pct: 1, year_to_date_pct: 2 }, acquired_at: new Date().toISOString() }, ictcCard] });

    expect(q('[data-indicator="FUEL_ACPM_PRICE"] [data-testid="value"]').textContent).toBe('$ 11.427');
    expect(q('[data-indicator="ICTC_TOTAL"] [data-testid="value"]').textContent).toBe('163,81');
    expect(q('[data-indicator="FUEL_ACPM_PRICE"] h3').textContent).toContain('ACPM (referencia)');
  });

  it('si el combustible por defecto no tiene datos y otro sí, abre con el que tiene datos (no con un gráfico vacío)', () => {
    create();
    answer({ featured: [emptyCard('FUEL_ACPM_PRICE', 'ACPM'), { ...emptyCard('FUEL_GNCV_PRICE', 'GNCV'), status: 'AVAILABLE', value: 3777, area_name: 'Colombia', reference_period: '2026-11-01', kind: 'OFFICIAL', unit: 'COP/m³', variation: { monthly_pct: 2, annual_pct: 5, year_to_date_pct: 4 }, acquired_at: new Date().toISOString() }, ictcCard] });

    const pressed = Array.from(el().querySelectorAll('[data-testid="energy-overview"] .seg button[aria-pressed="true"]')).map((b) => b.textContent!.trim());
    expect(pressed).toEqual(['GNCV']);
    expect(requests('/indicators/FUEL_GNCV_PRICE/history').length).toBe(0); // ya se pidió y respondió
    expect(el().querySelector('[data-testid="energy-overview"] app-trend-chart')).not.toBeNull();
  });

  it('si ningún combustible tiene datos, la tarjeta se compacta y el ICTC aprovecha el espacio', () => {
    create(); answer({ gncv: [] });

    expect(q('.duo').classList.contains('lean')).toBeTrue();
    expect(q('[data-testid="energy-overview"] [data-testid="energy-empty"]').textContent).toContain('Sin información disponible');
    expect(el().querySelector('[data-testid="energy-overview"] app-trend-chart')).toBeNull();
    expect(el().querySelector('[data-testid="costs-overview"] app-trend-chart')).not.toBeNull();
  });

  it('sin precios de ACPM ni gasolina por ciudad, la tarjeta muestra el GNCV por departamento (lo que sí hay)', () => {
    create();
    answer({ gncvCities: [{ area_code: '05', area_name: 'Antioquia', value: 3493.95, monthly_pct: 3.01 }, { area_code: '66', area_name: 'Risaralda', value: 3390, monthly_pct: -1 }] });

    expect(q('[data-testid="city-table"] h3').textContent).toContain('GNCV por departamento');
    const rows = Array.from(el().querySelectorAll('[data-testid="gncv-table"] tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['Antioquia$ 3.494↑ +3,01%', 'Risaralda$ 3.390↓ -1%']);
  });

  it('el tablero ya no ejecuta procesos técnicos: solo enlaza a la administración (solo administradores)', () => {
    create(); answer();

    expect(el().querySelector('[data-testid="refresh-sources"]')).toBeNull();
    expect(q('[data-testid="intelligence-admin"]').getAttribute('href')).toBe('/plataforma/intelligence/fuentes');
  });

  const acpmCard = {
    ...emptyCard('FUEL_ACPM_PRICE', 'Precio del ACPM'), status: 'AVAILABLE', value: 11616, area_code: '11001', area_name: 'Bogotá', reference_period: '2026-11-01', published_at: '2026-10-30',
    valid_from: '2026-11-01', kind: 'OFFICIAL', acquired_at: new Date().toISOString(),
    source_url: 'https://gestornormativo.creg.gov.co/gestor/entorno/docs/originales/Circular_CREG_371_2026/', source_reference: 'Circular CREG 371 de 2026',
    source: { ...minenergia, url: 'https://gestornormativo.creg.gov.co/' },
    variation: { monthly_pct: null, annual_pct: 3.1, year_to_date_pct: null, previous_pct: -0.2, previous_date: '2026-10-02' },
  };

  it('el KPI de ACPM muestra la ciudad, el precio en COP/galón, la vigencia, la variación vs. la publicación anterior y el enlace a la circular', () => {
    create(); answer({ featured: [acpmCard, emptyCard('FUEL_GASOLINE_PRICE', 'g'), ictcCard] });

    const card = q('[data-indicator="FUEL_ACPM_PRICE"]');
    expect(card.querySelector('[data-testid="value"]')!.textContent).toBe('$ 11.616');
    const text = card.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Bogotá');
    expect(text).toContain('COP/galón');
    expect(text).toContain('Vigente desde 1 nov 2026');
    expect(card.querySelector('.vstats')!.textContent!.replace(/\s+/g, ' ')).toContain('vs. anterior↓ -0,2%');
    expect(card.querySelector('.vstats')!.textContent).not.toContain('Mensual'); // no hay «mes anterior» con vigencias irregulares
    const link = card.querySelector<HTMLAnchorElement>('.foot a')!;
    expect(link.textContent).toContain('Circular CREG 371 de 2026');
    expect(link.getAttribute('href')).toContain('Circular_CREG_371_2026');
  });

  it('la gráfica de precios CREG ubica las publicaciones por su fecha de vigencia (día y mes, y el año debajo)', () => {
    create();
    answer({ featured: [acpmCard, emptyCard('FUEL_GASOLINE_PRICE', 'g'), ictcCard], energy: [11600, 11616, 11616] });

    const chart = fixture.debugElement.query(By.css('[data-testid="energy-overview"] app-trend-chart')).componentInstance as TrendChartComponent;
    expect(chart.labels().every((label) => /^\d{1,2} [A-Z][a-z]{2}\n\d{4}$/.test(label))).toBeTrue();
    expect(chart.markLast()).toBe('$ 11.616');
  });

  it('la tabla por ciudad usa la variación frente a la publicación anterior del ACPM', () => {
    create();
    answer({
      cities: [{ area_code: '11001', area_name: 'Bogotá', value: 11616, monthly_pct: null, previous_pct: -0.2 }],
      gasolineCities: [{ area_code: '11001', area_name: 'Bogotá', value: 16331, monthly_pct: null, previous_pct: 0 }],
    });

    const row = q('[data-testid="city-table"] tbody tr').textContent!.replace(/\s+/g, ' ').trim();
    expect(row).toBe('Bogotá$ 11.616$ 16.331↓ -0,2%');
  });

  it('la tabla por ciudad se ordena por ACPM, gasolina y variación, y se filtra por ciudad sin distinguir tildes', () => {
    create();
    answer({
      cities: [
        { area_code: '11001', area_name: 'Bogotá', value: 11616, monthly_pct: null, previous_pct: -0.2 },
        { area_code: '05001', area_name: 'Medellín', value: 11641, monthly_pct: null, previous_pct: 0.5 },
        { area_code: '76001', area_name: 'Cali', value: 11763, monthly_pct: null, previous_pct: 0.1 },
      ],
      gasolineCities: [
        { area_code: '11001', area_name: 'Bogotá', value: 16331, monthly_pct: null, previous_pct: 0 },
        { area_code: '05001', area_name: 'Medellín', value: 16251, monthly_pct: null, previous_pct: 0 },
        { area_code: '76001', area_name: 'Cali', value: 16339, monthly_pct: null, previous_pct: 0 },
      ],
    });
    const names = () => Array.from(el().querySelectorAll('[data-testid="city-table"] tbody tr td:first-child')).map((td) => td.textContent!.trim());
    const click = (text: string) => {
      Array.from(el().querySelectorAll<HTMLButtonElement>('.sortbtn')).find((b) => b.textContent!.includes(text))!.click();
      fixture.detectChanges();
    };

    expect(names()).toEqual(['Bogotá', 'Cali', 'Medellín']);
    click('ACPM'); expect(names()).toEqual(['Cali', 'Medellín', 'Bogotá']);
    click('Gasolina'); expect(names()).toEqual(['Cali', 'Bogotá', 'Medellín']);
    click('Var. ACPM'); expect(names()).toEqual(['Medellín', 'Cali', 'Bogotá']);

    const input = q('[data-testid="city-filter"]') as HTMLInputElement;
    input.value = 'medellin'; input.dispatchEvent(new Event('input')); fixture.detectChanges();
    expect(names()).toEqual(['Medellín']);
  });

  it('el GNCV aclara que es un promedio simple y no un precio nacional oficial', () => {
    create(); answer({ featured: [emptyCard('FUEL_ACPM_PRICE', 'a'), emptyCard('FUEL_GASOLINE_PRICE', 'g'), ictcCard, { ...emptyCard('FUEL_GNCV_PRICE', 'GNCV'), status: 'AVAILABLE', value: 3777, area_code: 'CO', area_name: 'Colombia', reference_period: '2026-11-01', acquired_at: new Date().toISOString(), kind: 'OFFICIAL', variation: { monthly_pct: 0.1, annual_pct: 2, year_to_date_pct: 1 } }] });

    expect(q('[data-indicator="FUEL_GNCV_PRICE"] .mean').textContent).toContain('no es un precio nacional oficial único');
  });
});
