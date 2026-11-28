import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  LOGO_COMPACT,
  LOGO_HORIZONTAL,
  LOGO_MARK,
  LOGO_MARK_TINY,
  LogoRole,
  LogoShape,
} from './logo-shapes';

/**
 * - `horizontal`: isotipo + wordmark «LoGyCO₂» + lema (login y pantallas de marca).
 * - `compact`: isotipo + wordmark (sidebar).
 * - `mark`: solo isotipo. Por debajo de 36 px usa la versión robusta (anillo grueso, sin aro interior ni nervaduras).
 */
export type LogoVariant = 'horizontal' | 'compact' | 'mark';
/**
 * `light`: para fondos claros · `dark`: para fondos oscuros ·
 * `mono`: un solo color, el del texto circundante (`currentColor`).
 */
export type LogoTheme = 'light' | 'dark' | 'mono';
/**
 * Movimiento del logo:
 * - `none`: estático.
 * - `entrance`: animación de entrada (los tramos del anillo se trazan y las hojas brotan).
 * - `live`: entrada + hojas que se mecen con suavidad.
 * - `hover`: estático hasta pasar el cursor por encima.
 * Todo se desactiva con `prefers-reduced-motion`.
 */
export type LogoMotion = 'none' | 'entrance' | 'live' | 'hover';

type Colors = Record<LogoRole, string>;

/* Colores derivados de los tokens de styles.scss: --c-secondary, --c-primary, --c-success, --c-secondary-200/-soft, --c-gray, --c-gray-50/-600. */
const COLORS: Record<LogoTheme, Colors> = {
  dark: { ringTrack: '#6B6D66', markAccent: '#00B398', markOrange: '#FD7035', markLeafA: '#66D1C1', markLeafB: '#00B398', base: '#F6F6F5', accent: '#00B398', sub: '#DCDDDB', divider: '#6B6D66' },
  light: { ringTrack: '#CCF0EA', markAccent: '#00B398', markOrange: '#FC4C02', markLeafA: '#00B398', markLeafB: '#00705F', base: '#51534A', accent: '#00B398', sub: '#6B6D66', divider: '#DCDDDB' },
  mono: { ringTrack: 'currentColor', markAccent: 'currentColor', markOrange: 'currentColor', markLeafA: 'currentColor', markLeafB: 'currentColor', base: 'currentColor', accent: 'currentColor', sub: 'currentColor', divider: 'currentColor' },
};

/**
 * Logo LoGyCO₂ en SVG nativo: anillo con tramo teal y tramo naranja y doble hoja al centro, con fondo
 * transparente. Wordmark y lema son trazados de Inter (SIL OFL): no dependen de fuentes instaladas y se
 * ven nítidos a cualquier tamaño.
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: inline-flex; line-height: 0; flex: none; }
      svg { display: block; width: auto; max-width: 100%; overflow: visible; shape-rendering: geometricPrecision; }
      svg path { transform-box: fill-box; }
      /* ── Entrada ── */
      .in .seg1, .in .seg2 { animation: lg-ring 0.7s 0.1s ease-out both; }
      .in .seg2 { animation-delay: 0.3s; }
      .in .leaf { transform-origin: 50% 95%; animation: lg-grow 0.8s 0.4s cubic-bezier(.34, 1.3, .64, 1) both; }
      .in .base, .in .accent, .in .sub, .in .divider { opacity: 0; animation: lg-rise 0.7s 0.7s ease-out forwards; }
      .in .accent { animation-delay: 0.85s; } .in .sub { animation-delay: 1.05s; }

      /* ── Movimiento continuo (sutil) ── */
      .live .leaf { animation: lg-grow 0.8s 0.4s cubic-bezier(.34, 1.3, .64, 1) both, lg-sway 6s 1.4s ease-in-out infinite; }

      /* ── Solo al pasar el cursor ── */
      :host(:hover) .hov .leaf { transform-origin: 50% 95%; animation: lg-sway 1.6s ease-in-out infinite; }

      @keyframes lg-ring { from { opacity: 0; } to { opacity: 1; } }
      @keyframes lg-grow { from { opacity: 0; transform: scale(0.5) rotate(-12deg); } to { opacity: 1; transform: none; } }
      @keyframes lg-rise { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
      @keyframes lg-sway { 0%, 100% { transform: rotate(-2.5deg); } 50% { transform: rotate(2.5deg); } }

      @media (prefers-reduced-motion: reduce) {
        .in path, .live path, :host(:hover) .hov path { animation: none !important; opacity: 1; transform: none; }
      }
    `,
  ],
  template: `
    <svg
      [attr.viewBox]="shape().viewBox"
      [style.height.px]="size()"
      [class.in]="motion() === 'entrance' || motion() === 'live'"
      [class.live]="motion() === 'live'"
      [class.hov]="motion() === 'hover'"
      role="img"
      [attr.aria-label]="label()"
    >
      <title>{{ label() }}</title>
      @for (part of shape().parts; track $index) {
        <path [class]="part.part ?? part.role" [attr.d]="part.d" [attr.fill]="colors()[part.role]" />
      }
    </svg>
  `,
})
export class LogoComponent {
  readonly variant = input<LogoVariant>('horizontal');
  readonly theme = input<LogoTheme>('light');
  /** Alto del SVG en px. */
  readonly size = input(40);
  readonly motion = input<LogoMotion>('none');

  protected readonly colors = computed(() => COLORS[this.theme()]);
  protected readonly shape = computed<LogoShape>(() => {
    switch (this.variant()) {
      case 'horizontal':
        return LOGO_HORIZONTAL;
      case 'compact':
        return LOGO_COMPACT;
      default: {
        const size = this.size();
        return size >= 36 ? LOGO_MARK : LOGO_MARK_TINY;
      }
    }
  });
  protected readonly label = computed(() =>
    this.variant() === 'horizontal' ? 'LoGyCO₂, mide, analiza y reduce tu huella de carbono' : 'LoGyCO₂',
  );
}

/**
 * Logo institucional de LOGYCA (`public/brand/logyca-logo.png`), sin fondo.
 * `light`: tal cual, para fondos claros. `dark`: el texto se muestra en blanco
 * (versión invertida) y el cuadrado naranja conserva su color original. El PNG
 * tiene márgenes transparentes que se recortan con CSS.
 */
@Component({
  selector: 'app-logyca-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: inline-flex; line-height: 0; flex: none; }
      .crop { position: relative; display: block; overflow: hidden; aspect-ratio: 1399 / 395; }
      img { position: absolute; display: block; width: 139.31%; left: -19.66%; top: -69.62%; max-width: none; }
      /* Capa del texto en blanco: solo hasta el borde izquierdo del cuadrado (74,5 % del PNG). */
      img.word { filter: brightness(0) invert(1); clip-path: inset(0 26% 0 0); }
      /* Capa del cuadrado: color original. */
      img.square { clip-path: inset(0 0 0 74%); }
    `,
  ],
  template: `
    <span class="crop" [style.height.px]="height()">
      @if (theme() === 'dark') {
        <img class="word" src="brand/logyca-logo.png" alt="LOGYCA" />
        <img class="square" src="brand/logyca-logo.png" alt="" aria-hidden="true" />
      } @else {
        <img src="brand/logyca-logo.png" alt="LOGYCA" />
      }
    </span>
  `,
})
export class LogycaLogoComponent {
  /** Alto visible del logo en px. */
  readonly height = input(24);
  readonly theme = input<'light' | 'dark'>('light');
}
