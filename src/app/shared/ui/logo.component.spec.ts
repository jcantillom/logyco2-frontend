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

  it('el isotipo tiene fondo transparente (sin rectángulo) y está dividido en piezas: anillo, tramos y hojas', () => {
    const el = render({ variant: 'mark', size: 64 });
    expect(logo(el).querySelector('rect')).toBeNull();
    expect(pieces(64)).toEqual(['track', 'track', 'seg1', 'seg2', 'leaf', 'leaf', 'leaf', 'leaf']);
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

  it('el detalle del isotipo depende del tamaño: completo ≥ 36 px; por debajo, versión robusta sin aro interior ni nervaduras', () => {
    expect(pieces(64)).toContain('seg2');
    expect(pieces(36)).toEqual(pieces(128));
    expect(pieces(24)).toEqual(['track', 'seg1', 'seg2', 'leaf', 'leaf']);
    expect(totalLength(64)).toBeGreaterThan(totalLength(24));
  });

  it('el CO₂ va en el verde aguamarina con fondo oscuro y claro; el texto, claro u oscuro según el fondo', () => {
    const dark = colors(render({ theme: 'dark' }));
    expect(dark).toContain('#F6F6F5');
    expect(dark).toContain('#00B398');
    const light = colors(render({ theme: 'light' }));
    expect(light).toContain('#51534A');
    expect(light).toContain('#00B398');
  });

  it('el anillo usa teal y naranja de marca y las hojas verdes (fondo claro y oscuro)', () => {
    const fills = (theme: 'light' | 'dark'): Record<string, string | null> => {
      const el = render({ variant: 'mark', size: 64, theme });
      const fill = (piece: string): string | null => logo(el).querySelector(`path.${piece}`)!.getAttribute('fill');
      return { seg1: fill('seg1'), seg2: fill('seg2') };
    };
    expect(fills('light')).toEqual({ seg1: '#00B398', seg2: '#FC4C02' });
    expect(fills('dark')).toEqual({ seg1: '#00B398', seg2: '#FD7035' });
    expect(colors(render({ variant: 'horizontal', theme: 'dark' }))).toContain('#00B398');
  });

  it('monocromático usa currentColor (hereda el color del contexto)', () => {
    expect(Array.from(new Set(colors(render({ theme: 'mono' }))))).toEqual(['currentColor']);
  });

  it('es accesible: role img y nombre', () => {
    const svg = logo(render());
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toContain('LoGyCO₂');
    expect(svg.querySelector('title')?.textContent).toContain('LoGyCO₂');
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

  it('con movimiento en vivo las hojas se mecen y el anillo se traza al entrar', () => {
    const el = render({ variant: 'mark', size: 64, motion: 'live' });
    const anim = (cls: string): string => getComputedStyle(el.querySelector(`app-logo path.${cls}`)!).animationName;
    expect(anim('leaf')).toContain('lg-sway');
    expect(anim('seg1')).toContain('lg-ring');
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
});
