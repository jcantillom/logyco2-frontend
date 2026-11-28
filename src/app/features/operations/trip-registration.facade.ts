import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subscription, catchError, map, of, switchMap } from 'rxjs';
import { AccessPolicy } from '../../core/auth/access-policy';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { ManualFuel, ManualOptions, ManualPlace, ManualTemplate, ManualTripInput, ManualTripOutcome, ManualVehicle, RepeatedTrip, RouteUnavailableReason, TemplateMode } from '../../domain/models/manual-trips';
import { ManualTripsRepository } from '../../domain/repositories/manual-trips.repositories';
import { OperationsFacade } from './operations.facade';
import { FIELD_OF_SERVER, decimalInput, fuelOf, registrationAnnouncement } from './registration.view';
import { TypeAhead } from './type-ahead';

export type RegistrationStep = 'closed' | 'form' | 'repeated' | 'saved';
export type EnergyMode = 'REAL' | 'ESTIMATED';
export type RouteState =
  | { readonly state: 'idle' }
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly km: number }
  | { readonly state: 'unavailable'; readonly reason: RouteUnavailableReason | 'ERROR' };

/** Cuántas sugerencias se piden por búsqueda: la lista no tiene scroll. */
export const SUGGESTIONS = 6;
const IDLE_ROUTE: RouteState = { state: 'idle' };

type PlaceKind = 'origin' | 'destination';
interface Chosen {
  readonly code: string;
  readonly label: string;
}

/** Una clave nueva por intento: un UUID (36 caracteres entre letras, números y guion, dentro de lo que acepta el servidor). */
const newKey = (): string => crypto.randomUUID();

/**
 * «Registrar viaje»: el formulario breve de un viaje manual. Todo lo calcula el servidor (el resultado se muestra tal cual); aquí solo se guardan las elecciones y se pide.
 *
 * - Vehículo y municipios se buscan mientras se escribe (250 ms de espera y cancelación de la petición anterior); la distancia por ruta se pide al tener origen y destino.
 * - Nada se rellena por su cuenta: ni energía, ni «último rendimiento» (solo con una acción explícita).
 * - `Idempotency-Key`: una por intento de registro. Se reutiliza SOLO para reintentar el mismo envío (cortes de red, `COMPANY_BUSY`, confirmar «es otro viaje»); si la persona cambia
 *   algún dato antes de reintentar, el cuerpo ya no es el mismo y se genera una clave nueva; tras guardar, la siguiente vez también.
 * - Guardar actualiza la lista SIN perder la pila de cursores (`OperationsFacade.reload`).
 */
@Injectable({ providedIn: 'root' })
export class TripRegistrationFacade {
  private readonly repository = inject(ManualTripsRepository);
  private readonly operations = inject(OperationsFacade);
  private readonly context = inject(OrganizationContext);
  private readonly access = inject(AccessPolicy);
  private readonly registry = inject(ContextResetRegistry);

  readonly options = this.registry.track(new ScopedResource<ManualOptions>());
  readonly step = signal<RegistrationStep>('closed');
  /** Se está pidiendo la estructura de «Duplicar» / «Viaje de regreso». */
  readonly prefilling = signal(false);
  /** De dónde viene lo copiado («Copiado del viaje M-000123») o un aviso de lo que hay que elegir de nuevo. */
  readonly banner = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  readonly date = signal('');
  readonly vehicleText = signal('');
  readonly vehicle = signal<ManualVehicle | null>(null);
  readonly originText = signal('');
  readonly origin = signal<Chosen | null>(null);
  readonly destinationText = signal('');
  readonly destination = signal<Chosen | null>(null);
  readonly route = signal<RouteState>(IDLE_ROUTE);
  /** La persona eligió escribir la distancia aunque haya una por ruta. */
  readonly distanceEditing = signal(false);
  readonly distance = signal('');
  readonly mode = signal<EnergyMode>('REAL');
  readonly consumption = signal('');
  readonly consumptionUnit = signal('');
  readonly efficiency = signal('');
  readonly efficiencyUnit = signal('');
  readonly fuelChoice = signal('');
  readonly cargo = signal('');

  readonly fieldErrors = signal<Readonly<Record<string, string>>>({});
  readonly error = signal<AppError | null>(null);
  readonly saving = signal(false);
  readonly candidates = signal<readonly RepeatedTrip[]>([]);
  readonly outcome = signal<ManualTripOutcome | null>(null);
  /** El último viaje guardado con «Guardar y registrar otro» (el formulario sigue abierto). */
  readonly lastSaved = signal<ManualTripOutcome | null>(null);
  /** Región `aria-live` educada. */
  readonly announcement = signal('');

  readonly vehicles = new TypeAhead<ManualVehicle>((query) => this.searchVehicles(query), inject(DestroyRef));
  readonly places = new TypeAhead<ManualPlace>((query) => this.searchPlaces(query), inject(DestroyRef));
  /** Qué municipio busca la lista de lugares que está desplegada. */
  readonly placeField = signal<PlaceKind>('origin');

  readonly canRegister = computed(() => this.access.can('imports:create'));
  readonly isOpen = computed(() => this.step() !== 'closed');
  readonly fuelCode = computed(() => this.vehicle()?.fuelType ?? (this.fuelChoice() || null));
  readonly fuel = computed<ManualFuel | null>(() => fuelOf(this.options.data(), this.fuelCode()));
  /** El vehículo elegido no tiene combustible registrado: el viaje debe indicarlo. */
  readonly needsFuel = computed(() => this.vehicle() !== null && this.vehicle()?.fuelType === null);
  readonly consumptionUnits = computed(() => this.fuel()?.consumptionUnits ?? []);
  readonly efficiencyUnits = computed(() => this.fuel()?.efficiencyUnits ?? []);
  /** La distancia por ruta no está (o no se pudo pedir): el campo para escribirla aparece solo. */
  readonly distanceVisible = computed(() => this.distanceEditing() || this.route().state === 'unavailable');
  /** Hay algo escrito distinto de lo inicial: cerrar pide confirmación. */
  readonly dirty = computed(() => this.step() === 'form' && this.snapshot() !== this.baseline());

  private readonly snapshot = computed(() =>
    JSON.stringify([this.date(), this.vehicle()?.plate ?? this.vehicleText(), this.origin()?.code ?? this.originText(), this.destination()?.code ?? this.destinationText(), this.distance(), this.mode(), this.consumption(), this.consumptionUnit(), this.efficiency(), this.efficiencyUnit(), this.fuelChoice(), this.cargo()]),
  );
  private readonly baseline = signal('');
  private routeRequest: Subscription | null = null;
  private prefillRequest: Subscription | null = null;
  private saveRequest: Subscription | null = null;
  /** «Guardar y registrar otro» que terminó en «viaje repetido»: al confirmar se respeta. */
  private repeatedAnother = false;
  private attempt: { readonly key: string; readonly signature: string } | null = null;

  constructor() {
    this.registry.track({ reset: () => this.clear() });
  }

  /** Abre el formulario en blanco. Sin permiso no hace nada. */
  show(): void {
    if (!this.canRegister() || !this.context.activeOrganizationId()) return;

    this.clear();
    this.step.set('form');
    this.loadOptions();
    this.baseline.set(this.snapshot());
  }

  /** «Duplicar» y «Viaje de regreso»: abre el formulario con lo que el servidor armó del viaje (sin fecha ni energía; nada se asume). */
  showFrom(tripId: string, mode: TemplateMode): void {
    const organizationId = this.context.activeOrganizationId();

    if (!this.canRegister() || !organizationId) return;

    this.clear();
    this.step.set('form');
    this.prefilling.set(true);
    this.loadOptions();
    this.prefillRequest = this.repository
      .template(organizationId, tripId, mode)
      .pipe(
        switchMap((template) => this.lookupVehicle(organizationId, template).pipe(map((vehicle) => ({ template, vehicle })))),
      )
      .subscribe({
        next: ({ template, vehicle }) => {
          this.prefilling.set(false);
          this.applyTemplate(template, vehicle);
          this.baseline.set(this.snapshot());
        },
        error: (error: unknown) => {
          this.prefilling.set(false);
          this.error.set(toAppError(error));
        },
      });
  }

  /** Cierra y descarta todo (la pantalla ya confirmó si había algo escrito). */
  close(): void {
    this.clear();
  }

  retryOptions(): void {
    this.loadOptions();
  }

  // ------------------------------------------------------------------ vehículo y lugares

  typeVehicle(text: string): void {
    this.vehicleText.set(text);
    this.dropError('vehicle');

    if (this.vehicle() && this.vehicle()?.plate !== text) this.forgetVehicle();

    this.vehicles.search(text.trim());
  }

  /** Al enfocar el campo sin sugerencias a la vista se piden las primeras (activos primero). */
  openVehicles(): void {
    if (!this.vehicle()) this.vehicles.search(this.vehicleText().trim(), true);
  }

  pickVehicle(plate: string): void {
    const vehicle = this.vehicles.results().find((item) => item.plate === plate);

    if (!vehicle) return;

    this.vehicle.set(vehicle);
    this.vehicleText.set(vehicle.plate);
    this.fuelChoice.set('');
    this.consumptionUnit.set('');
    this.efficiencyUnit.set('');
    this.dropError('vehicle');
    this.dropError('fuel');
  }

  typePlace(kind: PlaceKind, text: string): void {
    this.placeField.set(kind);
    this.dropError(kind);

    if (kind === 'origin') {
      this.originText.set(text);
      this.origin.set(null);
    } else {
      this.destinationText.set(text);
      this.destination.set(null);
    }

    this.refreshRoute(true);

    if (text.trim()) this.places.search(text.trim());
    else this.places.clear();
  }

  pickPlace(kind: PlaceKind, code: string): void {
    const place = this.places.results().find((item) => item.code === code);

    if (!place) return;

    const chosen = { code: place.code, label: place.label };

    if (kind === 'origin') {
      this.origin.set(chosen);
      this.originText.set(place.label);
    } else {
      this.destination.set(chosen);
      this.destinationText.set(place.label);
    }

    this.dropError(kind);
    this.places.clear();
    this.refreshRoute(true);
  }

  /** Una lista de lugares visible solo muestra lo que corresponde al campo enfocado. */
  openPlaces(kind: PlaceKind): void {
    this.placeField.set(kind);
    this.places.clear();
    const text = kind === 'origin' ? this.originText() : this.destinationText();
    const chosen = kind === 'origin' ? this.origin() : this.destination();

    if (text.trim() && !chosen) this.places.search(text.trim(), true);
  }

  /** «⇄»: intercambia origen y destino (la distancia escrita se conserva: el trayecto inverso mide lo mismo). */
  swap(): void {
    const [origin, destination, originText, destinationText] = [this.destination(), this.origin(), this.destinationText(), this.originText()];

    this.origin.set(origin);
    this.destination.set(destination);
    this.originText.set(originText);
    this.destinationText.set(destinationText);
    this.dropError('origin');
    this.dropError('destination');
    this.places.clear();
    this.refreshRoute(false);
  }

  // ------------------------------------------------------------------ resto de datos

  setDate(value: string): void {
    this.date.set(value);
    this.dropError('date');
  }

  setMode(mode: EnergyMode): void {
    this.mode.set(mode);
    this.dropError('value');
    this.dropError('unit');
  }

  setValue(value: string): void {
    (this.mode() === 'REAL' ? this.consumption : this.efficiency).set(value);
    this.dropError('value');
  }

  setUnit(unit: string): void {
    (this.mode() === 'REAL' ? this.consumptionUnit : this.efficiencyUnit).set(unit);
    this.dropError('unit');
  }

  setFuel(code: string): void {
    this.fuelChoice.set(code);
    this.consumptionUnit.set('');
    this.efficiencyUnit.set('');
    this.dropError('fuel');
  }

  setDistance(value: string): void {
    this.distance.set(value);
    this.dropError('distance');
  }

  setCargo(value: string): void {
    this.cargo.set(value);
    this.dropError('cargo');
  }

  /** «Escribir la distancia»: reemplaza a la de ruta; volver a la de ruta descarta lo escrito. */
  editDistance(editing: boolean): void {
    this.distanceEditing.set(editing);

    if (!editing) this.distance.set('');
  }

  /** Acción EXPLÍCITA: pone en el campo (a la vista) el rendimiento del último viaje de la placa y cambia al modo estimado. */
  useLastEfficiency(): void {
    const last = this.vehicle()?.lastEfficiency;

    if (!last) return;

    this.mode.set('ESTIMATED');
    this.efficiency.set(decimalInput(last.value));
    this.efficiencyUnit.set(last.unit);
    this.dropError('value');
    this.dropError('unit');
    this.announcement.set('Se escribió el rendimiento del último viaje. Revísalo antes de guardar.');
  }

  /** Acción EXPLÍCITA: pone en el campo (a la vista) el rendimiento declarado o medido del vehículo y cambia al modo estimado. */
  useVehicleEfficiency(): void {
    const record = this.vehicle()?.vehicleEfficiency;

    if (!record) return;

    this.mode.set('ESTIMATED');
    this.efficiency.set(decimalInput(record.value));
    this.efficiencyUnit.set(record.unit);
    this.dropError('value');
    this.dropError('unit');
    this.announcement.set('Se escribió el rendimiento del vehículo. Revísalo antes de guardar.');
  }

  // ------------------------------------------------------------------ guardar

  /** Guarda. `another`: después de guardar, el formulario queda abierto con vehículo y ruta, sin fecha ni energía. */
  save(another = false): void {
    if (this.saving() || this.step() !== 'form' || this.prefilling() || this.options.status() !== 'ready') return;

    const problems = this.validate();

    if (Object.keys(problems).length > 0) {
      this.fieldErrors.set(problems);
      this.error.set(null);
      this.announcement.set('Hay datos por completar. Revisa los campos marcados.');

      return;
    }

    this.submit(this.buildInput(false), another);
  }

  /** «Es otro viaje distinto»: reenvía lo mismo con `confirm_distinct` y la MISMA clave (el servidor no guardó nada). */
  confirmDistinct(): void {
    if (this.saving() || this.step() !== 'repeated') return;

    this.submit(this.buildInput(true), this.repeatedAnother);
  }

  /** Vuelve del aviso de «viaje repetido» al formulario con lo escrito. */
  backToForm(): void {
    this.candidates.set([]);
    this.step.set('form');
  }

  /** Desde el resultado: otro viaje con el mismo vehículo y la misma ruta, sin fecha ni energía. */
  registerAnother(): void {
    this.outcome.set(null);
    this.resetForAnother();
    this.step.set('form');
  }

  private submit(input: ManualTripInput, another: boolean): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId) return;

    this.saving.set(true);
    this.error.set(null);
    this.fieldErrors.set({});
    this.saveRequest = this.repository.register(organizationId, input, this.keyFor(input)).subscribe({
      next: (outcome) => {
        this.saving.set(false);
        this.attempt = null;
        this.announcement.set(registrationAnnouncement(outcome));
        this.operations.reload();

        if (another) {
          this.lastSaved.set(outcome);
          this.resetForAnother();
          this.step.set('form');
        } else {
          this.lastSaved.set(null);
          this.outcome.set(outcome);
          this.step.set('saved');
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.repeatedAnother = another;
        this.fail(toAppError(error));
      },
    });
  }

  /** La clave del intento: la misma mientras el cuerpo (sin `confirm_distinct`) sea el mismo; otra si cambió. */
  private keyFor(input: ManualTripInput): string {
    const signature = JSON.stringify({ ...input, confirmDistinct: undefined });

    if (this.attempt?.signature !== signature) this.attempt = { key: newKey(), signature };

    return this.attempt.key;
  }

  private validate(): Record<string, string> {
    const problems: Record<string, string> = {};
    const value = (this.mode() === 'REAL' ? this.consumption() : this.efficiency()).trim();
    const unit = this.mode() === 'REAL' ? this.consumptionUnit() : this.efficiencyUnit();

    if (!this.date()) problems['date'] = 'Elige la fecha del viaje.';

    if (!this.vehicle()) problems['vehicle'] = 'Elige un vehículo de la lista.';
    else if (this.needsFuel() && !this.fuelChoice()) problems['fuel'] = 'Elige el combustible del viaje.';

    if (!this.origin()) problems['origin'] = 'Elige un municipio de la lista.';

    if (!this.destination()) problems['destination'] = 'Elige un municipio de la lista.';

    if (value && !unit) problems['unit'] = 'Elige la unidad.';

    return problems;
  }

  private buildInput(confirmDistinct: boolean): ManualTripInput {
    const real = this.mode() === 'REAL';
    const value = (real ? this.consumption() : this.efficiency()).trim();
    const unit = real ? this.consumptionUnit() : this.efficiencyUnit();
    const quantity = value ? { value, unit } : undefined;
    const distance = this.distanceVisible() ? this.distance().trim() : '';

    return {
      tripDate: this.date(),
      plate: this.vehicle()?.plate ?? '',
      origin: this.origin()?.code ?? '',
      destination: this.destination()?.code ?? '',
      ...(distance ? { distanceKm: distance } : {}),
      ...(quantity ? (real ? { consumption: quantity } : { efficiency: quantity }) : {}),
      ...(this.needsFuel() && this.fuelChoice() ? { fuelType: this.fuelChoice() } : {}),
      ...(this.cargo().trim() ? { cargoTon: this.cargo().trim() } : {}),
      ...(confirmDistinct ? { confirmDistinct: true } : {}),
    };
  }

  private fail(failure: AppError): void {
    if (failure.code === 'MANUAL_TRIP_REPEATED') {
      this.candidates.set((failure.data as readonly RepeatedTrip[] | null) ?? []);
      this.step.set('repeated');
      this.announcement.set('Ya hay un viaje parecido. Revísalo o confirma que es otro.');

      return;
    }

    const byField = Object.fromEntries(
      failure.details
        .filter((detail) => !!detail.message && (failure.code === 'INVALID_FIELD_VALUE' || failure.code === 'UNIT_INCOMPATIBLE'))
        .map((detail) => [FIELD_OF_SERVER[detail.field.split('.').at(-1) ?? ''] ?? '', detail.message as string]),
    );
    const single: Readonly<Record<string, string>> = { DATE_OUT_OF_RANGE: 'date', PLATE_NOT_REGISTERED: 'vehicle', VEHICLE_FUEL_MISSING: 'fuel', UNIT_INCOMPATIBLE: 'unit' };
    const field = single[failure.code];

    if (failure.code === 'INVALID_FIELD_VALUE' && Object.keys(byField).length > 0) {
      this.fieldErrors.set(Object.fromEntries(Object.entries(byField).filter(([name]) => name !== '')));
      this.announcement.set('Hay datos no válidos. Revisa los campos marcados.');
    } else if (field) {
      this.fieldErrors.set({ [field]: byField[field] ?? failure.message });
      this.announcement.set(failure.message);
    } else {
      // `COMPANY_BUSY`, red caída y demás: se conserva todo lo escrito y se puede reintentar (misma clave si el cuerpo no cambió).
      this.error.set(failure);
    }
  }

  // ------------------------------------------------------------------ ayudas privadas

  private loadOptions(): void {
    const organizationId = this.context.activeOrganizationId();

    if (organizationId) this.options.load(this.repository.options(organizationId), { keepData: true });
  }

  private searchVehicles(query: string): Observable<readonly ManualVehicle[]> {
    const organizationId = this.context.activeOrganizationId();

    return organizationId ? this.repository.vehicles(organizationId, query, SUGGESTIONS) : of([]);
  }

  private searchPlaces(query: string): Observable<readonly ManualPlace[]> {
    const organizationId = this.context.activeOrganizationId();

    return organizationId ? this.repository.places(organizationId, query, SUGGESTIONS) : of([]);
  }

  /** El vehículo de la plantilla con sus datos vigentes (combustible, configuración, último rendimiento); si ya no está registrado, ninguno. */
  private lookupVehicle(organizationId: string, template: ManualTemplate): Observable<ManualVehicle | null> {
    if (!template.plate || !template.plateRegistered) return of(null);

    const key = (plate: string): string => plate.replace(/[\s-]/g, '').toUpperCase();

    return this.repository.vehicles(organizationId, template.plate, SUGGESTIONS).pipe(
      map((items) => items.find((item) => key(item.plate) === key(template.plate ?? '')) ?? null),
      catchError(() => of(null)),
    );
  }

  private applyTemplate(template: ManualTemplate, vehicle: ManualVehicle | null): void {
    const ref = template.sourceTripRef;
    const missing: string[] = [];

    this.banner.set(`${template.mode === 'return' ? 'Viaje de regreso de' : 'Copiado del viaje'} ${ref ?? 'otro viaje'}`);

    if (vehicle) {
      this.vehicle.set(vehicle);
      this.vehicleText.set(vehicle.plate);
    } else if (template.plate) {
      missing.push(`El vehículo ${template.plate} ya no está registrado.`);
    }

    for (const [kind, place, label] of [['origin', template.origin, 'El origen'], ['destination', template.destination, 'El destino']] as const) {
      if (place.code && place.label) {
        (kind === 'origin' ? this.origin : this.destination).set({ code: place.code, label: place.label });
        (kind === 'origin' ? this.originText : this.destinationText).set(place.label);
      } else {
        missing.push(`${label} del viaje original no tiene municipio: elígelo de nuevo.`);
      }
    }

    this.notice.set(missing.length > 0 ? missing.join(' ') : null);

    // Las unidades del viaje original se ofrecen ya elegidas solo si el combustible actual las admite; los valores quedan vacíos.
    const fuel = fuelOf(this.options.data(), vehicle?.fuelType ?? null);

    if (template.consumptionUnit && fuel?.consumptionUnits.some((unit) => unit.value === template.consumptionUnit)) this.consumptionUnit.set(template.consumptionUnit);

    if (template.efficiencyUnit && fuel?.efficiencyUnits.some((unit) => unit.value === template.efficiencyUnit)) this.efficiencyUnit.set(template.efficiencyUnit);

    this.refreshRoute(true);
  }

  /** Pide la distancia por ruta cuando hay origen y destino; cada cambio cancela la petición anterior. `clearTyped`: elegir otro lugar descarta la distancia escrita. */
  private refreshRoute(clearTyped: boolean): void {
    const organizationId = this.context.activeOrganizationId();
    const [origin, destination] = [this.origin(), this.destination()];

    this.routeRequest?.unsubscribe();
    this.routeRequest = null;

    if (clearTyped) {
      this.distance.set('');
      this.distanceEditing.set(false);
    }

    if (!organizationId || !origin || !destination) return this.route.set(IDLE_ROUTE);

    this.route.set({ state: 'loading' });
    this.routeRequest = this.repository.routeDistance(organizationId, origin.code, destination.code).subscribe({
      next: (found) => this.route.set(found.available && found.distanceKm !== null ? { state: 'ready', km: found.distanceKm } : { state: 'unavailable', reason: found.reason ?? 'UNAVAILABLE' }),
      error: () => this.route.set({ state: 'unavailable', reason: 'ERROR' }),
    });
  }

  private forgetVehicle(): void {
    this.vehicle.set(null);
    this.fuelChoice.set('');
    this.consumptionUnit.set('');
    this.efficiencyUnit.set('');
  }

  private dropError(field: string): void {
    if (this.fieldErrors()[field]) this.fieldErrors.update((current) => Object.fromEntries(Object.entries(current).filter(([name]) => name !== field)));
  }

  /** Conserva vehículo y ruta; sin fecha ni energía (nunca el consumo).  */
  private resetForAnother(): void {
    this.date.set('');
    this.consumption.set('');
    this.efficiency.set('');
    this.consumptionUnit.set('');
    this.efficiencyUnit.set('');
    this.cargo.set('');
    this.distance.set('');
    this.distanceEditing.set(false);
    this.fieldErrors.set({});
    this.error.set(null);
    this.banner.set(null);
    this.notice.set(null);
    this.baseline.set(this.snapshot());
  }

  private clear(): void {
    this.routeRequest?.unsubscribe();
    this.prefillRequest?.unsubscribe();
    this.saveRequest?.unsubscribe();
    this.routeRequest = this.prefillRequest = this.saveRequest = null;
    this.attempt = null;
    this.repeatedAnother = false;
    this.vehicles.clear();
    this.places.clear();
    this.step.set('closed');
    this.prefilling.set(false);
    this.banner.set(null);
    this.notice.set(null);
    this.date.set('');
    this.vehicleText.set('');
    this.vehicle.set(null);
    this.originText.set('');
    this.origin.set(null);
    this.destinationText.set('');
    this.destination.set(null);
    this.route.set(IDLE_ROUTE);
    this.distanceEditing.set(false);
    this.distance.set('');
    this.mode.set('REAL');
    this.consumption.set('');
    this.consumptionUnit.set('');
    this.efficiency.set('');
    this.efficiencyUnit.set('');
    this.fuelChoice.set('');
    this.cargo.set('');
    this.fieldErrors.set({});
    this.error.set(null);
    this.saving.set(false);
    this.candidates.set([]);
    this.outcome.set(null);
    this.lastSaved.set(null);
    this.announcement.set('');
    this.baseline.set(this.snapshot());
  }
}
