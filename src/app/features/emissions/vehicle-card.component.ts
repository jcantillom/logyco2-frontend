import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { FreightVehicle } from '../../domain/models/emissions';
import { axlesLabel, formatKg, pbvMax } from './emissions.format';
import { GlyphComponent } from './glyph.component';
import { VehicleDiagramComponent } from '../../shared/ui/vehicle-diagram/vehicle-diagram.component';

/** Inclinación máxima (grados) del vehículo al seguir el puntero. */
const MAX_TILT = 6;

/**
 * Tarjeta de un vehículo con volumen: sombra en capas, borde superior iluminado y un «escenario» sobre el que se apoya el dibujo. Al pasar el
 * cursor (o con el foco) sube unos píxeles, el vehículo se inclina con perspectiva siguiendo el puntero y las ruedas dan una vuelta. Solo
 * transform, opacity y box-shadow; sin movimiento (preferencia del sistema) y en pantallas táctiles no hay inclinación ni elevación.
 */
@Component({
  selector: 'app-vehicle-card',
  imports: [VehicleDiagramComponent, GlyphComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; min-width: 0; height: 100%; perspective: 640px; }
    button { position: relative; display: flex; flex-direction: column; gap: 2px; width: 100%; height: 100%; padding: clamp(4px, 0.6vh, 7px) 8px clamp(5px, 0.8vh, 8px); border: 1px solid var(--c-bd); border-radius: 14px; background: linear-gradient(180deg, var(--c-sf), color-mix(in srgb, var(--c-head) 20%, var(--c-sf)) 260%); color: inherit; font: inherit; text-align: left; cursor: pointer; transform: translateY(var(--lift, 0px)); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--c-gray-50) 80%, transparent), 0 1px 2px color-mix(in srgb, var(--c-head) 20%, transparent), var(--shadow); transition: transform 0.2s ease-out, box-shadow 0.2s ease-out, border-color 0.2s; }
    button[aria-pressed='true'] { border-color: var(--c-primary); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--c-gray-50) 80%, transparent), 0 0 0 1px var(--c-primary), 0 10px 22px color-mix(in srgb, var(--c-head) 20%, transparent); }
    .code { position: absolute; z-index: 1; top: clamp(6px, 1vh, 9px); left: 9px; padding: 0 8px; border-radius: 6px; border-left: 3px solid var(--c-primary); background: color-mix(in srgb, var(--c-primary) 20%, var(--c-sf)); color: var(--c-head); font-size: 0.72rem; font-weight: 700; line-height: 1.5; }
    .stage { position: relative; flex: 1 1 auto; display: flex; align-items: center; min-height: clamp(40px, 5.6vh, 64px); }
    app-vehicle-diagram { position: relative; z-index: 1; width: 100%; --diagram-max-h: clamp(40px, 5.6vh, 64px); transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transform-origin: 50% 90%; transition: transform 0.15s ease-out; }
    h3 { overflow: hidden; margin: 1px 0 0; font-size: 0.82rem; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; color: var(--c-head); }
    ul { display: flex; flex-direction: column; gap: 1px; margin: 0; padding: 0 18px 0 0; list-style: none; font-size: 0.72rem; color: var(--c-text); }
    li { display: flex; align-items: center; gap: 6px; min-width: 0; }
    li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    li app-glyph { font-size: 13px; color: var(--c-mu); }
    .chev { position: absolute; right: 7px; bottom: 8px; font-size: 16px; color: var(--c-mu); }
    @media (hover: hover) {
      button:hover, button:focus-visible { --lift: -4px; border-color: var(--c-gray-300); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--c-gray-50) 80%, transparent), 0 12px 24px color-mix(in srgb, var(--c-head) 20%, transparent), var(--shadow); }
      button[aria-pressed='true']:hover { border-color: var(--c-primary); }
    }
    @media (prefers-reduced-motion: reduce), (hover: none) {
      button { transition: none; transform: none; }
      app-vehicle-diagram { transition: none; transform: none; }
    }
  `],
  template: `
    <button type="button" [attr.aria-pressed]="selected()" [attr.aria-label]="vehicle().code + ' · ' + vehicle().shortName + '. Ver características'" data-testid="vehicle-card"
      (click)="chosen.emit($event)" (pointermove)="tilt($event)" (pointerenter)="spinning.set(true)" (pointerleave)="rest()" (focus)="spinning.set(true)" (blur)="rest()">
      <span class="code" data-testid="vehicle-code">{{ vehicle().code }}</span>
      <div class="stage"><app-vehicle-diagram [vehicle]="vehicle()" [spin]="spinning()" /></div>
      <h3 [attr.title]="vehicle().name">{{ vehicle().shortName }}</h3>
      <ul>
        <li><app-glyph name="axle" /><span data-testid="vehicle-axles">{{ axles() }}</span></li>
        <li><app-glyph name="weight" /><span data-testid="vehicle-pbv">{{ pbv() }}</span></li>
      </ul>
      <app-glyph class="chev" name="chevronRight" />
    </button>
  `,
})
export class VehicleCardComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly vehicle = input.required<FreightVehicle>();
  readonly selected = input(false);
  /** Emite el clic para que quien abre el detalle pueda devolver el foco al botón al cerrarlo. */
  readonly chosen = output<Event>();

  protected readonly spinning = signal(false);
  protected readonly axles = computed(() => axlesLabel(this.vehicle()));
  protected readonly pbv = computed(() => {
    const max = pbvMax(this.vehicle());

    return max === null ? 'PBV: sin dato verificado' : `PBV máx: ${formatKg(max)}`;
  });

  /** Inclina el vehículo según la posición del puntero (solo ratón y sin «reducir movimiento»). */
  protected tilt(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;

    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;

    this.host.style.setProperty('--ry', `${(x * 2 * MAX_TILT).toFixed(1)}deg`);
    this.host.style.setProperty('--rx', `${(-y * 2 * MAX_TILT).toFixed(1)}deg`);
  }

  protected rest(): void {
    this.spinning.set(false);
    this.host.style.removeProperty('--ry');
    this.host.style.removeProperty('--rx');
  }
}
