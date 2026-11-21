import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';
/** `brand`: colores del Manual de Marca LOGYCA 2025 · `classic`: la paleta verde/petróleo original. */
export type PaletteName = 'brand' | 'classic';

const THEME_KEY = 'logyco2.theme';
const PALETTE_KEY = 'logyco2.palette';
const MOTION_KEY = 'logyco2.reducedMotion';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible: la preferencia vive solo en esta sesión */
  }
}

/**
 * Preferencias de apariencia de la persona (tema y animaciones). Se recuerdan por navegador y
 * no son información sensible. «Automático» sigue el modo claro/oscuro del sistema operativo.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

  private readonly pref = signal<ThemePreference>(this.stored());
  private readonly pal = signal<PaletteName>(read(PALETTE_KEY) === 'classic' ? 'classic' : 'brand');
  private readonly systemDark = signal(this.media?.matches ?? false);
  private readonly motion = signal(read(MOTION_KEY) === '1');

  readonly preference = this.pref.asReadonly();
  readonly palette = this.pal.asReadonly();
  readonly reducedMotion = this.motion.asReadonly();
  /** Tema que realmente se aplica. */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const p = this.pref();
    return p === 'system' ? (this.systemDark() ? 'dark' : 'light') : p;
  });

  constructor() {
    this.media?.addEventListener('change', (e) => {
      this.systemDark.set(e.matches);
      this.apply();
    });
    this.apply();
  }

  setTheme(theme: ThemePreference): void {
    this.pref.set(theme);
    write(THEME_KEY, theme);
    this.apply();
  }

  setPalette(palette: PaletteName): void {
    this.pal.set(palette);
    write(PALETTE_KEY, palette);
    this.apply();
  }

  setReducedMotion(reduced: boolean): void {
    this.motion.set(reduced);
    write(MOTION_KEY, reduced ? '1' : '0');
    this.apply();
  }

  private stored(): ThemePreference {
    const value = read(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  }

  private apply(): void {
    this.root.dataset['theme'] = this.resolved();
    this.root.dataset['palette'] = this.pal();
    if (this.motion()) this.root.dataset['motion'] = 'reduced';
    else delete this.root.dataset['motion'];
  }
}
