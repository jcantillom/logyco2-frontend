import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExcelIconComponent } from './excel-icon.component';

describe('ExcelIconComponent', () => {
  let fixture: ComponentFixture<ExcelIconComponent>;
  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(ExcelIconComponent);
    fixture.detectChanges();
  });

  it('es decorativo: oculto para lectores de pantalla y sin foco', () => {
    expect(host().getAttribute('aria-hidden')).toBe('true');
    expect(host().querySelector('svg')!.getAttribute('focusable')).toBe('false');
  });

  it('dibuja la página, la cuadrícula y la «X»', () => {
    for (const c of ['.page', '.grid', '.tab', '.x']) expect(host().querySelector(c)).not.toBeNull();
  });

  it('el tamaño sale de la entrada (34 px por defecto) y las esquinas lo acompañan', () => {
    expect(host().style.width).toBe('34px');

    fixture.componentRef.setInput('size', 40);
    fixture.detectChanges();

    expect(host().style.width).toBe('40px');
    expect(host().style.height).toBe('40px');
    expect(host().style.borderRadius).toBe('14px');
  });

  it('el CSS usa solo tokens y tintas de marca permitidas', () => {
    const css = Array.from(document.querySelectorAll('style')).map((s) => (s.textContent ?? '').replace(/\s+/g, ' ')).filter((c) => c.includes('.tab')).join('\n');

    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
    expect(css).not.toMatch(/rgb\(/);
    for (const m of css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g)) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
  });
});
