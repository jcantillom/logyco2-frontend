import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  LOGO_COMPACT,
  LOGO_HORIZONTAL,
  LOGO_MARK,
  LOGO_MARK_SIMPLE,
  LOGO_MARK_TINY,
  LogoRole,
  LogoShape,
} from './logo-shapes';

/**
 * - `horizontal`: isotipo completo + wordmark + lema (login y pantallas de marca).
 * - `compact`: isotipo (sin nube) + wordmark (sidebar).
 * - `mark`: solo isotipo. El detalle depende del tamaño: ≥ 56 px completo (con
 *   nube de CO₂), 36–55 px sin nube y < 36 px además sin barras.
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
 * - `entrance`: animación de entrada (el camión llega, la hoja brota, las barras suben).
 * - `live`: entrada + movimiento continuo y sutil (hoja que se mece, barras, nube que flota, camión en marcha con rayas de velocidad).
 * - `hover`: estático hasta pasar el cursor por encima.
 * Todo se desactiva con `prefers-reduced-motion`.
 */
export type LogoMotion = 'none' | 'entrance' | 'live' | 'hover';

type Colors = Record<LogoRole, string>;

const COLORS: Record<LogoTheme, Colors> = {
  dark: { markBase: '#FFFFFF', markAccent: '#00B398', base: '#FFFFFF', accent: '#00B398', sub: '#D5DEE5', divider: '#3B5568' },
  light: { markBase: '#0B2638', markAccent: '#00B398', base: '#0B2638', accent: '#00B398', sub: '#3A4A58', divider: '#C5D1DB' },
  mono: { markBase: 'currentColor', markAccent: 'currentColor', base: 'currentColor', accent: 'currentColor', sub: 'currentColor', divider: 'currentColor' },
};

/**
 * Logo LoGyCO₂ en SVG nativo. El isotipo es la vectorización del logo de marca
 * (`public/brand/logo.png`: hoja, camión con barras, nube de CO₂ y curva), con
 * fondo transparente y dividido en piezas (hoja, tres barras, nube, camión,
 * curvas) para poder animarlas por separado. Wordmark y lema son trazados de
 * Inter (SIL OFL): no dependen de fuentes instaladas y se ven nítidos a
 * cualquier tamaño.
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: inline-flex; line-height: 0; flex: none; }
      svg { display: block; width: auto; max-width: 100%; overflow: visible; shape-rendering: geometricPrecision; }
      svg path { transform-box: fill-box; }
      /* Rayas de velocidad: invisibles salvo en movimiento (el logo estático es fiel al original). */
      .streak1, .streak2, .streak3 { opacity: 0; }

      /* ── Entrada ── */
      .in .truck { animation: lg-drive 0.9s 0.05s cubic-bezier(.2, .8, .2, 1) both; }
      .in .swooshW, .in .swooshG { transform-origin: 0 50%; animation: lg-sweep 0.8s 0.15s ease-out both; }
      .in .leaf { transform-origin: 10% 95%; animation: lg-grow 0.8s 0.4s cubic-bezier(.34, 1.3, .64, 1) both; }
      .in .cloud { transform-origin: 50% 80%; animation: lg-pop 0.6s 0.9s cubic-bezier(.34, 1.56, .64, 1) both; }
      .in .bar1, .in .bar2, .in .bar3 { transform-origin: 50% 100%; animation: lg-bar 0.5s ease-out both; }
      .in .bar1 { animation-delay: 0.6s; } .in .bar2 { animation-delay: 0.72s; } .in .bar3 { animation-delay: 0.84s; }
      .in .base, .in .accent, .in .sub, .in .divider { opacity: 0; animation: lg-rise 0.7s 0.7s ease-out forwards; }
      .in .accent { animation-delay: 0.85s; } .in .sub { animation-delay: 1.05s; }

      /* ── Movimiento continuo (sutil) ── */
      .live .leaf { animation: lg-grow 0.8s 0.4s cubic-bezier(.34, 1.3, .64, 1) both, lg-sway 6s 1.4s ease-in-out infinite; }
      .live .cloud { animation: lg-pop 0.6s 0.9s cubic-bezier(.34, 1.56, .64, 1) both, lg-float 4.5s 1.6s ease-in-out infinite; }
      .live .truck { transform-origin: 50% 100%; animation: lg-drive 0.9s 0.05s cubic-bezier(.2, .8, .2, 1) both, lg-ride 0.6s 1.1s ease-in-out infinite; }
      .live .streak1, .live .streak2, .live .streak3 { animation: lg-streak 0.9s 1.2s linear infinite; }
      .live .streak2 { animation-delay: 1.5s; } .live .streak3 { animation-delay: 1.8s; }
      .live .bar1 { animation: lg-bar 0.5s 0.6s ease-out both, lg-eq 3s 1.4s ease-in-out infinite; }
      .live .bar2 { animation: lg-bar 0.5s 0.72s ease-out both, lg-eq 3s 1.65s ease-in-out infinite; }
      .live .bar3 { animation: lg-bar 0.5s 0.84s ease-out both, lg-eq 3s 1.9s ease-in-out infinite; }

      /* ── Solo al pasar el cursor ── */
      :host(:hover) .hov .leaf { transform-origin: 10% 95%; animation: lg-sway 1.6s ease-in-out infinite; }
      :host(:hover) .hov .cloud { animation: lg-float 1.4s ease-in-out infinite; }
      :host(:hover) .hov .truck { transform-origin: 50% 100%; animation: lg-ride 0.45s ease-in-out infinite; }
      :host(:hover) .hov .streak1, :host(:hover) .hov .streak2, :host(:hover) .hov .streak3 { animation: lg-streak 0.7s linear infinite; }
      :host(:hover) .hov .streak2 { animation-delay: 0.23s; } :host(:hover) .hov .streak3 { animation-delay: 0.46s; }
      :host(:hover) .hov .bar1, :host(:hover) .hov .bar2, :host(:hover) .hov .bar3 { transform-origin: 50% 100%; animation: lg-eq 1.2s ease-in-out infinite; }
      :host(:hover) .hov .bar2 { animation-delay: 0.15s; } :host(:hover) .hov .bar3 { animation-delay: 0.3s; }

      @keyframes lg-drive { from { opacity: 0; transform: translateX(-9px); } to { opacity: 1; transform: none; } }
      @keyframes lg-sweep { from { transform: scaleX(0); } to { transform: none; } }
      @keyframes lg-grow { from { opacity: 0; transform: scale(0.5) rotate(-12deg); } to { opacity: 1; transform: none; } }
      @keyframes lg-pop { from { opacity: 0; transform: scale(0.2); } to { opacity: 1; transform: none; } }
      @keyframes lg-bar { from { transform: scaleY(0); } to { transform: none; } }
      @keyframes lg-rise { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
      @keyframes lg-sway { 0%, 100% { transform: rotate(-2.5deg); } 50% { transform: rotate(2.5deg); } }
      @keyframes lg-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.2px); } }
      /* Marcha: vibración corta y cabeceo leve sobre el eje trasero. */
      @keyframes lg-ride { 0%, 100% { transform: translateY(0) rotate(0); } 25% { transform: translateY(-0.5px) rotate(-0.6deg); } 50% { transform: translateY(0.1px) rotate(0.2deg); } 75% { transform: translateY(-0.35px) rotate(0.6deg); } }
      /* Las rayas nacen junto a la caja y corren hacia atrás mientras se desvanecen. */
      @keyframes lg-streak { 0% { opacity: 0; transform: translateX(3px); } 25% { opacity: 0.9; } 100% { opacity: 0; transform: translateX(-11px); } }
      @keyframes lg-eq { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.6); } }

      @media (prefers-reduced-motion: reduce) {
        .in path:not(.streak1):not(.streak2):not(.streak3), .live path:not(.streak1):not(.streak2):not(.streak3), :host(:hover) .hov path:not(.streak1):not(.streak2):not(.streak3) { animation: none !important; opacity: 1; transform: none; }
        .in .streak1, .in .streak2, .in .streak3, .hov .streak1, .hov .streak2, .hov .streak3 { animation: none !important; opacity: 0; }
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
        return size >= 56 ? LOGO_MARK : size >= 36 ? LOGO_MARK_SIMPLE : LOGO_MARK_TINY;
      }
    }
  });
  protected readonly label = computed(() =>
    this.variant() === 'horizontal' ? 'LoGyCO2, mide, analiza y reduce tu huella de carbono' : 'LoGyCO2',
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
