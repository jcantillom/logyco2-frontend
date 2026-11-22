import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FreightVehicle } from '../../../domain/models/emissions';
import { diagramLabel } from './vehicle-label';
import { Box, DrawnAxle, GROUND_Y, WHEEL_R, layoutVehicle } from './vehicle-layout';

/** Recorte del dibujo: de la parte alta de la caja a la sombra del suelo, y de la defensa delantera al borde trasero (sin márgenes sobrantes). */
const CROP_X = 1;
const CROP_Y = 17;
const CROP_H = 70;
const CROP_RIGHT = 3;
const AXLE_Y = GROUND_Y - WHEEL_R;
const ARCH_R = WHEEL_R + 4;
const RIM_R = 5.8;
const HUB_R = 2.9;
const SPOKE = 5;
const RIB_STEP = 14;

let nextId = 0;

/**
 * Diagrama lateral de un vehículo de carga con volumen: cabina con parabrisas, capó, parrilla, faro, espejo y estribo; caja con nervaduras y
 * puerta trasera; quinta rueda y pata de apoyo en los tractocamiones; chasis, tanque, guardafangos, sombra en el suelo y ruedas con llanta,
 * rin y tuerca naranja. El sombreado usa solo tintes (20/40/60/80 %) del gris y blanco de marca, con la luz arriba a la izquierda. Se dibuja
 * desde los grupos de ejes: cada eje es un par de ruedas (`g.axle` con `data-group`), así que los ejes por grupo y en total coinciden con el
 * catálogo. No es un plano a escala.
 */
@Component({
  selector: 'app-vehicle-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.spinning]': 'spin()' },
  styles: [`
    :host { display: block; }
    svg { display: block; width: 100%; height: auto; max-height: var(--diagram-max-h, 140px); }
    .s0 { stop-color: var(--c-sf); }
    .s20 { stop-color: color-mix(in srgb, var(--c-head) 20%, var(--c-sf)); }
    .s40 { stop-color: color-mix(in srgb, var(--c-head) 40%, var(--c-sf)); }
    .s60 { stop-color: color-mix(in srgb, var(--c-head) 60%, var(--c-sf)); }
    .s80 { stop-color: color-mix(in srgb, var(--c-head) 80%, var(--c-sf)); }
    .sw { stop-color: var(--c-gray-50); }
    .ground { stroke: color-mix(in srgb, var(--c-head) 20%, var(--c-sf)); stroke-width: 1.2; }
    .cab { stroke: var(--c-head); stroke-width: 1.5px; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
    .window { stroke: var(--c-head); stroke-width: 1px; vector-effect: non-scaling-stroke; }
    .glint { fill: var(--c-gray-50); opacity: 0.85; }
    .accent { fill: var(--c-primary); }
    .light { fill: var(--c-primary); }
    .detail { fill: none; stroke: color-mix(in srgb, var(--c-head) 40%, var(--c-sf)); stroke-width: 1; stroke-linecap: round; }
    .solid { fill: var(--c-head); }
    .metal { stroke: var(--c-head); stroke-width: 1px; vector-effect: non-scaling-stroke; }
    .body { stroke: var(--c-head); stroke-width: 1.5px; vector-effect: non-scaling-stroke; }
    .rib { stroke: color-mix(in srgb, var(--c-head) 20%, var(--c-sf)); stroke-width: 1px; vector-effect: non-scaling-stroke; }
    .edge { stroke: var(--c-gray-50); stroke-width: 1.2; stroke-linecap: round; opacity: 0.9; }
    .drawbar, .gear { stroke: var(--c-head); stroke-width: 3; stroke-linecap: round; }
    .flap { fill: color-mix(in srgb, var(--c-head) 80%, var(--c-sf)); }
    .arch { stroke: var(--c-head); stroke-width: 1px; vector-effect: non-scaling-stroke; }
    .tire { fill: var(--c-head); }
    .tire-back { fill: color-mix(in srgb, var(--c-head) 60%, var(--c-sf)); }
    .rim { fill: color-mix(in srgb, var(--c-head) 20%, var(--c-sf)); stroke: var(--c-head); stroke-width: 1px; vector-effect: non-scaling-stroke; }
    .spoke { stroke: color-mix(in srgb, var(--c-head) 60%, var(--c-sf)); stroke-width: 1; stroke-linecap: round; }
    .hub { fill: var(--c-primary); }
    .spin { transform-box: fill-box; transform-origin: center; }
    @media (prefers-reduced-motion: no-preference) {
      :host(.spinning) .spin { animation: wheel-spin 0.7s cubic-bezier(.2, .7, .2, 1) 1; }
    }
    @keyframes wheel-spin { to { transform: rotate(360deg); } }
  `],
  template: `
    @if (layout(); as l) {
      <svg [attr.viewBox]="viewBox()" role="img" [attr.aria-label]="label()" preserveAspectRatio="xMidYMid meet" data-testid="vehicle-diagram">
        <defs>
          <linearGradient [attr.id]="uid + '-body'" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" class="s0" /><stop offset="1" class="s20" /></linearGradient>
          <linearGradient [attr.id]="uid + '-cab'" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0" class="s20" /><stop offset="1" class="s60" /></linearGradient>
          <linearGradient [attr.id]="uid + '-glass'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="s40" /><stop offset="1" class="s80" /></linearGradient>
          <linearGradient [attr.id]="uid + '-metal'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s40" /><stop offset="1" class="s80" /></linearGradient>
          <linearGradient [attr.id]="uid + '-arch'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s80" /><stop offset="1" class="s60" /></linearGradient>
          <radialGradient [attr.id]="uid + '-shadow'"><stop offset="0" class="s60" stop-opacity="0.55" /><stop offset="1" class="s60" stop-opacity="0" /></radialGradient>
        </defs>
        <ellipse class="shadow" [attr.cx]="(l.width + 1 - 3) / 2" [attr.cy]="ground + 3" [attr.rx]="(l.width - 4) * 0.5" ry="4" [attr.fill]="url('shadow')" />
        <line class="ground" x1="0" [attr.x2]="l.width" [attr.y1]="ground" [attr.y2]="ground" />
        @for (frame of l.frames; track $index) { <rect class="frame metal" [attr.x]="frame.x1" y="63" [attr.width]="frame.x2 - frame.x1" height="4" rx="2" [attr.fill]="url('metal')" /> }
        @if (l.drawbar; as bar) { <line class="drawbar" [attr.x1]="bar.x1" [attr.x2]="bar.x2" y1="60" y2="60" /> }
        @if (l.cab; as c) { <rect class="tank metal" [attr.x]="c.x + c.w + 2" y="55" width="15" height="9" rx="3" [attr.fill]="url('metal')" /> }
        @for (b of boxes(); track $index) {
          <rect class="body" [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="3" [attr.fill]="url('body')" />
          @for (x of ribs(b); track x) { <line class="rib" [attr.x1]="x" [attr.x2]="x" [attr.y1]="b.y + 4" [attr.y2]="b.y + b.h - 4" /> }
          <line class="edge" [attr.x1]="b.x + 4" [attr.x2]="b.x + b.w - 4" [attr.y1]="b.y + 2" [attr.y2]="b.y + 2" />
          <line class="rib" [attr.x1]="b.x + b.w - 5" [attr.x2]="b.x + b.w - 5" [attr.y1]="b.y + 3" [attr.y2]="b.y + b.h - 3" />
          <rect class="metal" [attr.x]="b.x + b.w - 8" [attr.y]="b.y + b.h / 2" width="2.4" height="5" rx="1" [attr.fill]="url('metal')" />
        }
        @if (l.cab; as c) {
          <g [attr.transform]="'translate(' + c.x + ' ' + c.y + ')'">
            <path class="cab" d="M0 32V17H13L19 0H35Q40 0 40 5V32Z" [attr.fill]="url('cab')" />
            <path class="window" d="M17 14L21 4H32V14Z" [attr.fill]="url('glass')" />
            <path class="glint" d="M21.5 4.8H27.5L23.5 13.6H19Z" />
            <rect class="accent" x="13" y="21.5" width="27" height="3.6" />
            <path class="detail" d="M26 15V30" />
            <rect class="metal" x="21" y="17" width="3.5" height="1.3" rx="0.6" [attr.fill]="url('metal')" />
            <rect class="solid" x="12" y="7.5" width="2.5" height="6" rx="1" />
            <rect class="metal" x="-1.2" y="19" width="3.6" height="9" rx="1" [attr.fill]="url('metal')" />
            <path class="detail" d="M-0.5 22H2M-0.5 25H2" />
            <rect class="light" x="-0.8" y="16.4" width="2.8" height="3" rx="1" />
            <rect class="metal" x="-3" y="28" width="7.5" height="4" rx="1.5" [attr.fill]="url('metal')" />
            <rect class="metal" x="24" y="30.5" width="12" height="2" rx="1" [attr.fill]="url('metal')" />
          </g>
        }
        @if (l.fifthWheel !== null) { <rect class="fifth metal" [attr.x]="l.fifthWheel - 8" y="60.5" width="16" height="5" rx="1.5" [attr.fill]="url('metal')" /> }
        @if (l.landingGear !== null) {
          <line class="gear" [attr.x1]="l.landingGear" [attr.x2]="l.landingGear" y1="66" [attr.y2]="ground - 2" />
          <rect class="metal" [attr.x]="l.landingGear - 4" [attr.y]="ground - 3" width="8" height="2.5" rx="1" [attr.fill]="url('metal')" />
        }
        @for (a of flaps(); track $index) { <rect class="flap" [attr.x]="a.x + wheelR + 2" y="63" width="2.4" height="10" rx="0.8" /> }
        @for (item of axles(); track $index) {
          <g class="axle" [attr.data-axle]="item.part" [attr.data-group]="item.a.group">
            <path class="arch" [attr.d]="arch(item.a.x)" [attr.fill]="url('arch')" />
            <circle class="tire-back" [attr.cx]="item.a.x - 4" [attr.cy]="axleY" [attr.r]="wheelR" />
            <circle class="tire" [attr.cx]="item.a.x" [attr.cy]="axleY" [attr.r]="wheelR" />
            <circle class="rim" [attr.cx]="item.a.x" [attr.cy]="axleY" [attr.r]="rimR" />
            <g class="spin">
              <path class="spoke" [attr.d]="spokes(item.a.x)" />
              <circle class="hub" [attr.cx]="item.a.x" [attr.cy]="axleY" [attr.r]="hubR" />
            </g>
          </g>
        }
      </svg>
    }
  `,
})
export class VehicleDiagramComponent {
  readonly vehicle = input.required<FreightVehicle>();
  /** Grupos de ejes del camión que reemplazan a los del vehículo (disposición alternativa elegida en el detalle). */
  readonly truckGroups = input<readonly number[] | null>(null);
  /** Hace girar las ruedas una vuelta (p. ej. al pasar el cursor por la tarjeta). */
  readonly spin = input(false);

  protected readonly uid = `vd${nextId++}`;
  /** Recorte ajustado al vehículo: el dibujo llena el ancho disponible. */
  protected readonly viewBox = computed(() => `${CROP_X} ${CROP_Y} ${this.layout().width - CROP_X - CROP_RIGHT} ${CROP_H}`);
  protected readonly ground = GROUND_Y;
  protected readonly axleY = AXLE_Y;
  protected readonly wheelR = WHEEL_R;
  protected readonly rimR = RIM_R;
  protected readonly hubR = HUB_R;
  protected readonly layout = computed(() => layoutVehicle(this.vehicle(), this.truckGroups() ?? this.vehicle().truckAxleGroups));
  protected readonly label = computed(() => diagramLabel(this.vehicle()));
  protected readonly boxes = computed<Box[]>(() => {
    const l = this.layout();

    return [l.truckBody, l.trailerBody].filter((b): b is Box => !!b);
  });
  protected readonly axles = computed(() => {
    const l = this.layout();

    return [...l.truckAxles.map((a) => ({ a, part: 'truck' })), ...l.trailerAxles.map((a) => ({ a, part: 'trailer' }))];
  });
  /** Guardafangos tras el último eje de cada parte. */
  protected readonly flaps = computed<DrawnAxle[]>(() => {
    const l = this.layout();

    return [l.truckAxles.at(-1), l.trailerAxles.at(-1)].filter((a): a is DrawnAxle => !!a);
  });

  protected url(name: string): string {
    return `url(#${this.uid}-${name})`;
  }

  /** Nervaduras verticales de la caja. */
  protected ribs(box: Box): number[] {
    return Array.from({ length: Math.max(0, Math.floor((box.w - 16) / RIB_STEP)) }, (_, i) => box.x + 10 + i * RIB_STEP);
  }

  /** Paso de rueda: semicírculo sobre el eje, que deja la rueda «metida» en la carrocería. */
  protected arch(x: number): string {
    return `M${x - ARCH_R - 2} ${AXLE_Y}A${ARCH_R + 2} ${ARCH_R} 0 0 1 ${x + ARCH_R - 2} ${AXLE_Y}Z`;
  }

  /** Radios del rin (giran con el efecto de la tarjeta). */
  protected spokes(x: number): string {
    return `M${x - SPOKE} ${AXLE_Y}H${x + SPOKE}M${x} ${AXLE_Y - SPOKE}V${AXLE_Y + SPOKE}`;
  }
}
