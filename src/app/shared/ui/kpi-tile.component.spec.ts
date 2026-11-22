import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { KpiTileComponent } from './kpi-tile.component';

describe('KpiTileComponent', () => {
  let fixture: ComponentFixture<KpiTileComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function render(inputs: Record<string, unknown> = {}): void {
    TestBed.configureTestingModule({ imports: [KpiTileComponent], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(KpiTileComponent);
    fixture.componentRef.setInput('label', 'Vehículos registrados');
    fixture.componentRef.setInput('icon', 'M0 0');
    fixture.componentRef.setInput('value', 3_400_000);
    fixture.componentRef.setInput('caption', 'Inventario de tu empresa');
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  }

  it('por defecto conserva el tamaño de siempre (sin clase sm): lo usa «Mis vehículos»', () => {
    render({ link: '/vehiculos' });
    const tile = el().querySelector<HTMLElement>('.kpi')!;

    expect(tile.classList).not.toContain('sm');
    expect(tile.getBoundingClientRect().height).toBeGreaterThanOrEqual(96);
    expect(getComputedStyle(tile.querySelector('.value')!).fontSize).toBe('32px');
    expect(getComputedStyle(tile.querySelector('.ico')!).width).toBe('52px');
  });

  it('con size="sm" es compacta: ≈ 80 px, ícono de 40 px, cifra de 1,5 rem, etiqueta de 0,8 rem y pie de 0,74 rem en una línea', () => {
    render({ size: 'sm', link: '/vehiculos' });
    const tile = el().querySelector<HTMLElement>('.kpi')!;

    expect(tile.classList).toContain('sm');
    expect(tile.getBoundingClientRect().height).toBeLessThanOrEqual(90);
    expect(getComputedStyle(tile).paddingTop).toBe('10px');
    expect(getComputedStyle(tile).paddingLeft).toBe('14px');
    expect(getComputedStyle(tile.querySelector('.ico')!).width).toBe('40px');
    expect(getComputedStyle(tile.querySelector('.ico svg')!).width).toBe('20px');
    expect(getComputedStyle(tile.querySelector('.label')!).fontSize).toBe('12.8px');
    expect(getComputedStyle(tile.querySelector('.value')!).fontSize).toBe('24px');
    expect(getComputedStyle(tile.querySelector('.cap')!).fontSize).toBe('11.84px');
    expect(getComputedStyle(tile.querySelector('.cap')!).whiteSpace).toBe('nowrap');
  });

  it('el pie lleva su texto completo en el atributo title por si se corta con puntos suspensivos', () => {
    render({ size: 'sm', caption: 'viajes a los que les falta algún dato en el periodo elegido' });

    expect(el().querySelector('.cap')!.getAttribute('title')).toBe('viajes a los que les falta algún dato en el periodo elegido');
  });

  it('una cifra de 7 dígitos no desborda la versión compacta en una columna angosta', () => {
    render({ size: 'sm' });
    el().style.width = '200px';
    const tile = el().querySelector<HTMLElement>('.kpi')!;

    expect(tile.scrollWidth).toBeLessThanOrEqual(tile.clientWidth + 1);
  });

  it('en la versión compacta el esqueleto y el error caben en la misma altura', () => {
    render({ size: 'sm', status: 'loading' });
    expect(el().querySelector<HTMLElement>('.kpi')!.getBoundingClientRect().height).toBeLessThanOrEqual(90);

    TestBed.resetTestingModule();
    render({ size: 'sm', status: 'error' });
    expect(el().querySelector('[role="alert"]')).not.toBeNull();
  });

  describe('ícono', () => {
    const chip = (): HTMLElement => el().querySelector<HTMLElement>('.ico')!;
    const glyph = (): SVGElement => chip().querySelector('svg')!;

    it('en la versión compacta el chip es el de la tarjeta de huella: 40 px, radio 12, fondo claro, aro fino y glifo de 20 px con trazo 1,6', () => {
      render({ size: 'sm' });
      const style = getComputedStyle(chip());

      expect(chip().classList).toContain('chip');
      expect(style.width).toBe('40px');
      expect(style.height).toBe('40px');
      expect(style.borderRadius).toBe('12px');
      expect(style.boxShadow).toContain('inset');
      expect(getComputedStyle(glyph()).width).toBe('20px');
      expect(getComputedStyle(glyph()).strokeWidth).toBe('1.6px');
      expect(getComputedStyle(glyph()).strokeLinecap).toBe('round');
    });

    it('el tono solo cambia el color del chip, no su forma', () => {
      render({ size: 'sm' });
      const base = getComputedStyle(chip());
      const shape = [base.width, base.borderRadius];
      const color = base.color;

      fixture.componentRef.setInput('tone', 'warn');
      fixture.detectChanges();
      const warn = getComputedStyle(chip());

      expect([warn.width, warn.borderRadius]).toEqual(shape);
      expect(warn.color).not.toBe(color);
    });

    it('el tamaño normal no usa el chip compacto (sigue de 52 px)', () => {
      render();

      expect(chip().classList).not.toContain('chip');
      expect(getComputedStyle(chip()).width).toBe('52px');
    });

    it('iconSolid pinta el glifo con relleno y sin trazo; por defecto es de trazo con relleno suave', () => {
      render({ size: 'sm' });
      expect(chip().classList).not.toContain('solid');
      expect(getComputedStyle(glyph()).stroke).not.toBe('none');

      fixture.componentRef.setInput('iconSolid', true);
      fixture.detectChanges();
      const style = getComputedStyle(glyph());

      expect(chip().classList).toContain('solid');
      expect(style.stroke).toBe('none');
      expect(style.fill).toBe(getComputedStyle(chip()).color);
      expect(style.fillRule).toBe('evenodd');
    });

    it('iconSolid también funciona en el tamaño normal sin cambiarlo', () => {
      render({ iconSolid: true });

      expect(getComputedStyle(glyph()).stroke).toBe('none');
      expect(getComputedStyle(chip()).width).toBe('52px');
    });

    it('el CSS del chip usa solo tokens: sin hexadecimales ni rgb() y solo las tintas 14/20/40/60/80 %', () => {
      render({ size: 'sm' });
      const css = Array.from(document.querySelectorAll('style')).map((st) => (st.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '')).filter((c) => c.includes('.ico.chip')).join('\n');

      expect(css).toContain('.ico.chip');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
    });
  });
});
