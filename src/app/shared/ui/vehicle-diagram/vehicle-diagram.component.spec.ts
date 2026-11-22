import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { toFreightVehicle } from '../../../infrastructure/mappers/emissions.mappers';
import { FreightVehicleDto } from '../../../infrastructure/dto/emissions.dto';
import { VEHICLES, vehicleDto } from '../../../features/emissions/emissions.fixtures';
import { VehicleDiagramComponent } from './vehicle-diagram.component';
import { FreightVehicle } from '../../../domain/models/emissions';

@Component({ imports: [VehicleDiagramComponent], template: '<app-vehicle-diagram [vehicle]="vehicle" [truckGroups]="groups" />' })
class HostComponent { vehicle!: FreightVehicle; groups: readonly number[] | null = null; }

const byCode = (code: string) => VEHICLES.find((v) => v.code === code)!;

function render(dto: FreightVehicleDto = vehicleDto()): { svg: SVGSVGElement; html: string } {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.vehicle = toFreightVehicle(dto);
  fixture.detectChanges();
  const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;

  return { svg, html: svg.innerHTML };
}

describe('VehicleDiagramComponent', () => {
  it('dibuja exactamente total_axles ejes en todas las familias del catálogo', () => {
    for (const dto of VEHICLES) {
      const { svg } = render(dto);

      expect(svg.querySelectorAll('g.axle').length).withContext(dto.code).toBe(dto.total_axles);
      expect(svg.querySelectorAll('g.axle[data-axle="truck"]').length).withContext(dto.code).toBe(dto.truck_axles);
      expect(svg.querySelectorAll('g.axle[data-axle="trailer"]').length).withContext(dto.code).toBe(dto.trailer_axles);
    }
  });

  it('los ejes de cada grupo se dibujan juntos y con el tamaño exacto que indican los grupos', () => {
    for (const dto of VEHICLES) {
      const { svg } = render(dto);
      const groups = (part: 'truck' | 'trailer', index: number): number => svg.querySelectorAll(`g.axle[data-axle="${part}"][data-group="${index}"]`).length;

      (dto.truck_axle_groups ?? []).forEach((size, i) => expect(groups('truck', i)).withContext(`${dto.code} camión grupo ${i}`).toBe(size));
      (dto.trailer_axle_groups ?? []).forEach((size, i) => expect(groups('trailer', i)).withContext(`${dto.code} remolque grupo ${i}`).toBe(size));
    }
  });

  it('un tándem queda más junto que dos ejes sueltos y el C4 pone un tándem al frente y otro atrás', () => {
    const xs = (code: string): number[] => Array.from(render(byCode(code)).svg.querySelectorAll('g.axle[data-axle="truck"] circle.tire')).map((c) => Number(c.getAttribute('cx')));
    const c2 = xs('C2');
    const c3 = xs('C3');
    const c4 = xs('C4');

    expect(c3[2] - c3[1]).toBeLessThan(c2[1] - c2[0]);
    expect(c4[1] - c4[0]).toBe(c3[2] - c3[1]);
    expect(c4[1] - c4[0]).toBeLessThan(c4[2] - c4[1]);
    expect(c4[3] - c4[2]).toBe(c4[1] - c4[0]);
  });

  it('el tándem direccional del C3 mueve el grupo de dos ejes al frente', () => {
    const dto = byCode('C3');
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.vehicle = toFreightVehicle(dto);
    fixture.componentInstance.groups = dto.layouts![0].truck_axle_groups;
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;

    expect(svg.querySelectorAll('g.axle[data-group="0"]').length).toBe(2);
    expect(svg.querySelectorAll('g.axle[data-group="1"]').length).toBe(1);
    expect(svg.querySelectorAll('g.axle').length).toBe(3);
  });

  it('cada eje es un par de ruedas', () => {
    const axle = render(vehicleDto({ code: 'C3', truck_axles: 3, total_axles: 3, truck_axle_groups: [1, 2] })).svg.querySelector('g.axle')!;

    expect(axle.querySelectorAll('circle.tire, circle.tire-back').length).toBe(2);
  });

  it('vehículos distintos no se ven idénticos', () => {
    const drawings = VEHICLES.map((dto) => render(dto).html);

    expect(new Set(drawings).size).toBe(VEHICLES.length);
  });

  it('el camión rígido lleva cabina y caja; el remolque solo no lleva cabina', () => {
    const rigid = render(vehicleDto()).svg;
    const alone = render(byCode('R2')).svg;

    expect(rigid.querySelectorAll('path.cab').length).toBe(1);
    expect(rigid.querySelectorAll('rect.body').length).toBe(1);
    expect(alone.querySelectorAll('path.cab').length).toBe(0);
    expect(alone.querySelectorAll('line.drawbar').length).toBe(1);
  });

  it('el tractocamión tiene quinta rueda y semirremolque; el balanceado no tiene barra de tiro; el de remolque sí', () => {
    const tractor = render(byCode('C2S1')).svg;
    const balanced = render(byCode('C2B1')).svg;
    const drawbar = render(byCode('C2R2')).svg;

    expect(tractor.querySelectorAll('rect.fifth').length).toBe(1);
    expect(tractor.querySelectorAll('rect.body').length).toBe(1);
    expect(balanced.querySelectorAll('line.drawbar').length).toBe(0);
    expect(balanced.querySelectorAll('rect.body').length).toBe(2);
    expect(drawbar.querySelectorAll('line.drawbar').length).toBe(1);
    expect(drawbar.querySelectorAll('rect.body').length).toBe(2);
  });

  it('el SVG es una imagen con nombre accesible', () => {
    expect(render(vehicleDto()).svg.getAttribute('role')).toBe('img');
    expect(render(vehicleDto()).svg.getAttribute('aria-label')).toBe('Camión rígido de 2 ejes');
    expect(render(byCode('C3S3')).svg.getAttribute('aria-label')).toBe('Tractocamión de 3 ejes con 3 ejes de remolque');
    expect(render(byCode('B1')).svg.getAttribute('aria-label')).toBe('Remolque balanceado de 1 eje');
  });

  it('es un solo <svg role="img"> con nombre accesible, con volumen: sombra en el suelo, cabina con detalles y rines con tuerca naranja', () => {
    const rigid = render(vehicleDto({ code: 'C3', truck_axles: 3, total_axles: 3, truck_axle_groups: [1, 2] })).svg;
    const host = rigid.parentElement!;

    expect(host.querySelectorAll('svg').length).toBe(1);
    expect(rigid.getAttribute('role')).toBe('img');
    expect(rigid.getAttribute('aria-label')).toBe('Camión rígido de 3 ejes');
    expect(rigid.querySelectorAll('ellipse.shadow').length).toBe(1);
    expect(rigid.querySelectorAll('circle.hub').length).toBe(3);
    expect(rigid.querySelectorAll('circle.rim').length).toBe(3);
    expect(rigid.querySelectorAll('path.arch').length).toBe(3);
    expect(rigid.querySelectorAll('rect.light').length).toBe(1);
    expect(rigid.querySelectorAll('path.glint').length).toBe(1);
    expect(rigid.querySelectorAll('rect.flap').length).toBe(1);
    expect(rigid.querySelectorAll('rect.tank').length).toBe(1);
  });

  it('cada dibujo usa degradados propios (ids únicos por instancia) y el tractocamión añade quinta rueda, pata de apoyo y dos guardafangos', () => {
    const first = render(byCode('C2')).svg;
    const second = render(byCode('C2')).svg;
    const ids = (svg: SVGSVGElement): string[] => Array.from(svg.querySelectorAll('defs [id]')).map((n) => n.id);
    const tractor = render(byCode('C3S3')).svg;

    expect(ids(first).length).toBe(6);
    expect(ids(first).some((id) => ids(second).includes(id))).toBeFalse();
    expect(first.querySelector('ellipse.shadow')!.getAttribute('fill')).toContain(`#${ids(first).find((id) => id.endsWith('shadow'))}`);
    expect(tractor.querySelectorAll('rect.fifth').length).toBe(1);
    expect(tractor.querySelectorAll('line.gear').length).toBe(1);
    expect(tractor.querySelectorAll('rect.flap').length).toBe(2);
  });

  it('el recorte del dibujo es ajustado: sin márgenes sobrantes, con todo el vehículo y su sombra dentro', () => {
    for (const dto of VEHICLES) {
      const { svg } = render(dto);
      const [x, y, w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
      const shadow = svg.querySelector('ellipse.shadow')!;
      const tires = Array.from(svg.querySelectorAll('circle.tire')).map((c) => Number(c.getAttribute('cx')));

      expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
      expect(h).withContext(dto.code).toBe(70);
      expect(y).toBe(17);
      for (const cx of tires) expect(cx - 10).withContext(`${dto.code} rueda izquierda`).toBeGreaterThanOrEqual(x);
      for (const cx of tires) expect(cx + 10).withContext(`${dto.code} rueda derecha`).toBeLessThanOrEqual(x + w);
      expect(Number(shadow.getAttribute('rx')) * 2).withContext(`${dto.code} sombra`).toBeCloseTo(w, 0);
      // El vehículo ocupa casi todo el ancho del recorte: de la defensa delantera al borde trasero de la caja.
      const bodyRight = Math.max(...Array.from(svg.querySelectorAll('rect.body')).map((r) => Number(r.getAttribute('x')) + Number(r.getAttribute('width'))));
      expect((bodyRight - x) / w).withContext(`${dto.code} ocupación`).toBeGreaterThan(0.95);
    }
  });

  it('los trazos principales no escalan con el dibujo (1,5 px en el cuerpo y la cabina)', () => {
    const { svg } = render(byCode('C2'));

    expect(getComputedStyle(svg.querySelector('rect.body')!).vectorEffect).toBe('non-scaling-stroke');
    expect(getComputedStyle(svg.querySelector('path.cab')!).strokeWidth).toBe('1.5px');
    expect(getComputedStyle(svg.querySelector('rect.body')!).strokeWidth).toBe('1.5px');
  });
});
