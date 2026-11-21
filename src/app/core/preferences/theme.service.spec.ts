import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = document.documentElement;
  beforeEach(() => {
    localStorage.removeItem('logyco2.theme');
    localStorage.removeItem('logyco2.reducedMotion');
    localStorage.removeItem('logyco2.palette');
  });
  afterEach(() => {
    localStorage.removeItem('logyco2.theme');
    localStorage.removeItem('logyco2.reducedMotion');
    delete root.dataset['theme'];
    delete root.dataset['motion'];
    delete root.dataset['palette'];
    localStorage.removeItem('logyco2.palette');
  });

  it('aplica y recuerda el tema elegido', () => {
    const service = TestBed.inject(ThemeService);
    service.setTheme('dark');
    expect(root.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('logyco2.theme')).toBe('dark');
    service.setTheme('light');
    expect(root.dataset['theme']).toBe('light');
  });

  it('recupera la preferencia guardada al iniciar', () => {
    localStorage.setItem('logyco2.theme', 'dark');
    TestBed.inject(ThemeService);
    expect(root.dataset['theme']).toBe('dark');
  });

  it('ignora valores guardados inválidos y vuelve a «Automático»', () => {
    localStorage.setItem('logyco2.theme', 'neon');
    expect(TestBed.inject(ThemeService).preference()).toBe('system');
  });

  it('«Reducir animaciones» marca el documento y se recuerda', () => {
    const service = TestBed.inject(ThemeService);
    service.setReducedMotion(true);
    expect(root.dataset['motion']).toBe('reduced');
    expect(localStorage.getItem('logyco2.reducedMotion')).toBe('1');
    service.setReducedMotion(false);
    expect(root.dataset['motion']).toBeUndefined();
  });

  it('usa la paleta de marca por defecto y recuerda la clásica', () => {
    const service = TestBed.inject(ThemeService);
    expect(root.dataset['palette']).toBe('brand');
    service.setPalette('classic');
    expect(root.dataset['palette']).toBe('classic');
    expect(localStorage.getItem('logyco2.palette')).toBe('classic');
    service.setPalette('brand');
    expect(root.dataset['palette']).toBe('brand');
  });

  it('recupera la paleta guardada al iniciar', () => {
    localStorage.setItem('logyco2.palette', 'classic');
    TestBed.inject(ThemeService);
    expect(root.dataset['palette']).toBe('classic');
  });
});
