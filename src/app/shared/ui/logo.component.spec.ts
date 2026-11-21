import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LogoComponent, LogoMotion, LogoTheme, LogoVariant, LogycaLogoComponent } from './logo.component';

@Component({
  imports: [LogoComponent, LogycaLogoComponent],
  template: `
    <app-logo [variant]="variant" [theme]="theme" [size]="size" [motion]="motion" />
    <app-logyca-logo [theme]="logycaTheme" [height]="22" />
  `,
})
class HostComponent {
  variant: LogoVariant = 'horizontal';
  theme: LogoTheme = 'light';
  size = 40;
  logycaTheme: 'light' | 'dark' = 'dark';
  motion: LogoMotion = 'none';
}

describe('LogoComponent y LogycaLogoComponent', () => {
  function render(config: Partial<HostComponent> = {}): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    Object.assign(fixture.componentInstance, config);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const logo = (el: HTMLElement): SVGElement => el.querySelector('app-logo svg')!;
  const colors = (el: HTMLElement): string[] =>
    Array.from(logo(el).querySelectorAll('path')).map((p) => p.getAttribute('fill') ?? '');
  const totalLength = (size: number): number =>
    Array.from(logo(render({ variant: 'mark', size })).querySelectorAll('path')).reduce((n, p) => n + p.getAttribute('d')!.length, 0);
  const pieces = (size: number): string[] =>
    Array.from(logo(render({ variant: 'mark', size })).querySelectorAll('path')).map((p) => p.getAttribute('class')!);

  it('es SVG nativo: sin <img>, sin <text> ni fuentes (wordmark y lema son trazados)', () => {
    const el = render();
    expect(logo(el).tagName.toLowerCase()).toBe('svg');
    expect(el.querySelector('app-logo img')).toBeNull();
    expect(logo(el).querySelector('text')).toBeNull();
  });

  it('el isotipo vectorizado tiene fondo transparente (sin rectángulo de fondo) y está dividido en piezas', () => {
    const el = render({ variant: 'mark', size: 64 });
    expect(logo(el).querySelector('rect')).toBeNull();
    expect(pieces(64)).toEqual(['swooshW', 'swooshG', 'truck', 'cloud', 'leaf', 'bar1', 'bar2', 'bar3', 'streak1', 'streak2', 'streak3']);
  });

  it('horizontal incluye wordmark y lema (más trazados que la compacta y el isotipo)', () => {
    const count = (variant: LogoVariant): number => logo(render({ variant })).querySelectorAll('path').length;
    expect(count('horizontal')).toBeGreaterThan(count('compact'));
    expect(count('compact')).toBeGreaterThan(count('mark'));
  });

  it('proporciones distintas por variante (viewBox)', () => {
    const vb = (variant: LogoVariant): string => logo(render({ variant })).getAttribute('viewBox')!;
    expect(vb('compact')).not.toBe(vb('horizontal'));
    expect(vb('mark').split(' ')[3]).toBe('64');
  });

  it('el detalle del isotipo depende del tamaño: con nube ≥ 56 px, sin nube ≥ 36 px, sin barras por debajo', () => {
    expect(pieces(64)).toContain('cloud');
    expect(pieces(128)).toContain('cloud');
    expect(pieces(48)).not.toContain('cloud');
    expect(pieces(48)).toContain('bar1');
    expect(pieces(24)).not.toContain('bar1');
    expect(pieces(24)).toContain('leaf');
    expect(pieces(24)).toContain('truck');
    expect(totalLength(64)).toBeGreaterThan(totalLength(48));
    expect(totalLength(48)).toBeGreaterThan(totalLength(24));
    expect(totalLength(36)).toBe(totalLength(48));
  });

  it('el CO₂ va en el verde aguamarina con fondo oscuro y claro; el isotipo, blanco u oscuro según el fondo', () => {
    const dark = colors(render({ theme: 'dark' }));
    expect(dark).toContain('#FFFFFF');
    expect(dark).toContain('#00B398');
    const light = colors(render({ theme: 'light' }));
    expect(light).toContain('#0B2638');
    expect(light).toContain('#00B398');
  });

  it('hoja, barras de la carga, curva y «CO₂» van en el verde aguamarina autorizado (fondo claro y oscuro)', () => {
    for (const theme of ['light', 'dark'] as const) {
      const el = render({ variant: 'mark', size: 64, theme });
      const fill = (piece: string): string | null => logo(el).querySelector(`path.${piece}`)!.getAttribute('fill');

      for (const piece of ['leaf', 'bar1', 'bar2', 'bar3', 'swooshG']) expect(fill(piece)).toBe('#00B398');
    }
    expect(colors(render({ variant: 'horizontal', theme: 'dark' }))).toContain('#00B398');
  });

  it('monocromático usa currentColor (hereda el color del contexto)', () => {
    expect(Array.from(new Set(colors(render({ theme: 'mono' }))))).toEqual(['currentColor']);
  });

  it('es accesible: role img y nombre', () => {
    const svg = logo(render());
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toContain('LoGyCO2');
    expect(svg.querySelector('title')?.textContent).toContain('LoGyCO2');
  });

  it('sin motion el logo es estático', () => {
    const svg = logo(render({ motion: 'none' }));
    expect(['in', 'live', 'hov'].some((c) => svg.classList.contains(c))).toBeFalse();
  });

  it('entrance activa solo la entrada; live añade el movimiento continuo; hover queda en reposo hasta el cursor', () => {
    const entrance = logo(render({ motion: 'entrance' }));
    expect(entrance.classList.contains('in')).toBeTrue();
    expect(entrance.classList.contains('live')).toBeFalse();
    const live = logo(render({ motion: 'live' }));
    expect(live.classList.contains('in') && live.classList.contains('live')).toBeTrue();
    const hover = logo(render({ motion: 'hover' }));
    expect(hover.classList.contains('hov')).toBeTrue();
    expect(hover.classList.contains('in')).toBeFalse();
  });

  it('con movimiento en vivo cada pieza tiene su propia animación (hoja, barras escalonadas, nube, camión)', () => {
    const el = render({ variant: 'mark', size: 64, motion: 'live' });
    const anim = (cls: string): string => getComputedStyle(el.querySelector(`app-logo path.${cls}`)!).animationName;
    expect(anim('leaf')).toContain('lg-sway');
    expect(anim('cloud')).toContain('lg-float');
    expect(anim('truck')).toContain('lg-ride'); // vibración de marcha y cabeceo
    expect(anim('streak1')).toContain('lg-streak'); // rayas de velocidad hacia atrás
    expect(anim('bar1')).toContain('lg-eq');
    const delays = ['bar1', 'bar2', 'bar3'].map((c) => getComputedStyle(el.querySelector(`app-logo path.${c}`)!).animationDelay);
    expect(new Set(delays).size).toBe(3); // las barras se mueven en secuencia, no a la vez
  });

  it('LOGYCA sobre fondo oscuro: sin pastilla blanca; texto en blanco y cuadrado con su color original', () => {
    const host = render({ logycaTheme: 'dark' }).querySelector('app-logyca-logo')!;
    expect(host.querySelector('.chip')).toBeNull();
    const imgs = host.querySelectorAll('img');
    expect(imgs.length).toBe(2);
    imgs.forEach((img) => expect(img.getAttribute('src')).toBe('brand/logyca-logo.png'));
    expect(host.querySelector('img.word')!.getAttribute('alt')).toBe('LOGYCA');
    expect(getComputedStyle(host.querySelector('img.word')!).filter).toContain('invert');
    expect(getComputedStyle(host.querySelector('img.square')!).filter).toBe('none');
    expect(host.querySelector('img.square')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('LOGYCA sobre fondo claro: un solo <img> con los colores originales', () => {
    const host = render({ logycaTheme: 'light' }).querySelector('app-logyca-logo')!;
    expect(host.querySelectorAll('img').length).toBe(1);
    expect(host.querySelector('img')!.alt).toBe('LOGYCA');
  });

  it('las rayas de velocidad permanecen invisibles cuando el logo está estático (fiel al original)', () => {
    const el = render({ variant: 'mark', size: 64, motion: 'none' });
    ['streak1', 'streak2', 'streak3'].forEach((c) => expect(getComputedStyle(el.querySelector(`app-logo path.${c}`)!).opacity).toBe('0'));
  });

  it('las rayas se escalonan para dar sensación de avance continuo', () => {
    const el = render({ variant: 'mark', size: 64, motion: 'live' });
    const delays = ['streak1', 'streak2', 'streak3'].map((c) => getComputedStyle(el.querySelector(`app-logo path.${c}`)!).animationDelay);
    expect(new Set(delays).size).toBe(3);
  });
});
