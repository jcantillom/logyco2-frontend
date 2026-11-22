import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { vehicleDetailDto, vehicleDto, VEHICLES_ORG_URL } from '../../../testing/vehicles';
import { SessionStore } from '../../core/auth/session.store';
import { toVehicle } from '../../infrastructure/mappers/vehicles.mappers';
import { VehicleDetailDto } from '../../infrastructure/dto/vehicles.dto';
import { catalogDto } from '../emissions/emissions.fixtures';
import { VehicleDetailComponent } from './vehicle-detail.component';

describe('VehicleDetailComponent: detalle de un vehículo', () => {
  let fixture: ComponentFixture<VehicleDetailComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (selector: string): string => (el().querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  /** Valor (`dd`) del dato cuya etiqueta (`dt`) es `label`. */
  const fact = (label: string): string => {
    const row = Array.from(el().querySelectorAll('dl.facts > div')).find((div) => div.querySelector('dt')!.textContent!.trim() === label)!;

    return row.querySelector('dd')!.textContent!.replace(/\s+/g, ' ').trim();
  };

  function open(detail: VehicleDetailDto = vehicleDetailDto(), roles = ['ORG_ADMIN']): void {
    TestBed.configureTestingModule({ imports: [VehicleDetailComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(VehicleDetailComponent);
    fixture.componentRef.setInput('vehicle', toVehicle(vehicleDto({ id: detail.id, plate: detail.plate })));
    fixture.detectChanges();
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/${detail.id}`).flush({ data: detail });
    http.expectOne('http://api.test/api/v1/emissions/vehicles').flush({ data: catalogDto() });
    fixture.detectChanges();
  }

  it('es un diálogo modal con la placa como título y un esqueleto mientras carga', () => {
    TestBed.configureTestingModule({ imports: [VehicleDetailComponent], providers: provideTestApp() });
    signInAs(buildUser(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(VehicleDetailComponent);
    fixture.componentRef.setInput('vehicle', toVehicle(vehicleDto()));
    fixture.detectChanges();

    expect(el().querySelector<HTMLDialogElement>('dialog')!.open).toBeTrue();
    expect(text('#vehicle-detail-title')).toBe('ABC123');
    expect(el().querySelector('[role="status"][aria-busy="true"]')).not.toBeNull();
  });

  it('muestra la identificación: placa normalizada y la original tal como llegó', () => {
    open();

    expect(fact('Placa')).toBe('ABC123Como llegó: abc 123');
  });

  it('la propiedad UNKNOWN se muestra «Sin declarar» y explica que aparecer en un archivo no implica propiedad', () => {
    open();

    expect(text('[data-testid="ownership"]')).toBe('Sin declarar');
    expect(text('dl.facts')).not.toContain('archivos');
  });

  it('una propiedad declarada se traduce', () => {
    open(vehicleDetailDto({ ownership: 'CONTRACTED' }));

    expect(text('[data-testid="ownership"]')).toBe('Contratado');
  });

  it('muestra características, origen y fecha de registro con el combustible por su nombre', () => {
    open();

    expect(fact('Configuración')).toBe('C2');
    expect(fact('Tipo')).toBe('Camión');
    expect(fact('Combustible')).toBe('Diésel');
    expect(fact('Modelo')).toBe('2018');
    expect(fact('Capacidad')).toBe('8 t');
    expect(fact('Origen del registro')).toBe('Registro manual');
    expect(fact('Fecha de registro')).toMatch(/^2 mar 2026$/i);
    expect(text('dl.facts')).not.toMatch(/aparición/i);
  });

  it('el historial lista evento, actor, fecha y cambios de campo antes → después', () => {
    open();
    const items = Array.from(el().querySelectorAll('[data-testid="history"] > li')).map((li) => li.textContent!.replace(/\s+/g, ' ').trim());

    expect(items.length).toBe(2);
    expect(items[0]).toContain('Edición manual');
    expect(items[0]).toContain('Por Ana Prueba');
    expect(items[0]).toMatch(/1 (abr|apr) 2026/i);
    expect(items[0]).toContain('Combustible: Gasolina → Diésel');
    expect(items[1]).toContain('Registro manual');
  });

  it('un evento nuevo del servidor se rotula de forma genérica y la propiedad en el historial se traduce', () => {
    open(vehicleDetailDto({ history: [{ id: 'h', event: 'ALGO_NUEVO', at: '2026-04-01T09:30:00Z', actor_name: 'Ana', changes: [{ field: 'ownership', before: 'UNKNOWN', after: 'OWN' }] }] }));

    expect(text('[data-testid="history"]')).toContain('Cambio registrado');
    expect(text('[data-testid="history"]')).toContain('Propiedad: Sin declarar → Propio');
  });

  it('sin historial lo dice, y no hay lista de archivos donde apareció el vehículo', () => {
    open(vehicleDetailDto({ history: [] }));

    expect(text('section[aria-labelledby="vd-history"]')).toContain('Todavía no hay cambios registrados.');
    expect(el().querySelector('[data-testid="runs"]')).toBeNull();
    expect(text('.body')).not.toContain('Archivos donde apareció');
  });

  it('dibuja la configuración con el diagrama compartido, emparejada por código con el catálogo, y su nombre', () => {
    open();
    const stage = el().querySelector('[data-testid="vehicle-stage"]')!;

    expect(stage.querySelector('app-vehicle-diagram svg[data-testid="vehicle-diagram"]')).not.toBeNull();
    expect(stage.querySelector('[data-testid="vehicle-placeholder"]')).toBeNull();
    expect(stage.textContent).toContain('C2 · Camión rígido');
    expect(stage.textContent).toContain('Camión rígido de dos ejes');
  });

  it('una configuración no reconocida usa un dibujo neutro y lo explica, sin inventar un diagrama', () => {
    open(vehicleDetailDto({ configuration_code: 'C2S', configuration_recognized: false }));
    const stage = el().querySelector('[data-testid="vehicle-stage"]')!;

    expect(stage.querySelector('[data-testid="vehicle-placeholder"]')).not.toBeNull();
    expect(stage.querySelector('app-vehicle-diagram')).toBeNull();
    expect(stage.textContent).toContain('Configuración «C2S» no reconocida');
  });

  it('sin configuración usa el dibujo neutro y lo dice', () => {
    open(vehicleDetailDto({ configuration_code: null }));

    expect(el().querySelector('[data-testid="vehicle-placeholder"]')).not.toBeNull();
    expect(text('[data-testid="vehicle-stage"]')).toContain('Sin configuración registrada');
  });

  it('«Editar» solo aparece con vehicles:manage', () => {
    open(vehicleDetailDto(), ['ORG_VIEWER']);

    expect(el().querySelector('[data-testid="edit-vehicle"]')).toBeNull();
  });

  it('si el detalle falla muestra el error del catálogo con «Reintentar»', () => {
    TestBed.configureTestingModule({ imports: [VehicleDetailComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(VehicleDetailComponent);
    fixture.componentRef.setInput('vehicle', toVehicle(vehicleDto()));
    fixture.detectChanges();
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/veh-1`).flush({ error: { code: 'VEHICLE_NOT_FOUND' } }, { status: 404, statusText: 'x' });
    http.expectOne('http://api.test/api/v1/emissions/vehicles');
    fixture.detectChanges();

    expect(text('[role="alert"]')).toContain('El vehículo no existe en tu empresa');

    el().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    http.expectOne(`${VEHICLES_ORG_URL}/vehicles/veh-1`).flush({ data: vehicleDetailDto() });
    fixture.detectChanges();
    expect(text('dl.facts')).toContain('ABC123');
  });

  it('un vehículo registrado desde Excel muestra el origen «Excel» y los eventos IMPORTED e IMPORT_UPDATED en español', () => {
    open(
      vehicleDetailDto({
        source: 'IMPORT',
        history: [
          { id: 'h-2', event: 'IMPORT_UPDATED', at: '2026-04-01T09:30:00Z', actor_name: 'Ana', changes: [{ field: 'fuel_type', before: 'GASOLINE', after: 'DIESEL' }] },
          { id: 'h-1', event: 'IMPORTED', at: '2026-03-02T10:00:00Z', actor_name: 'Ana', changes: [] },
        ],
      }),
    );

    expect(fact('Origen del registro')).toBe('Excel');
    expect(text('[data-testid="history"]')).toContain('Actualizado desde Excel');
    expect(text('[data-testid="history"]')).toContain('Registrado desde Excel');
    expect(text('[data-testid="history"]')).toContain('Combustible: Gasolina → Diésel');
  });
});
