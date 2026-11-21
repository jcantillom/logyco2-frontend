import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AppError } from '../../core/errors/app-error';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { ScopedResource } from '../../core/org/scoped-resource';
import { AreaComparison, GroupBreakdown, IndicatorHistory, IngestionResult, IntelligenceSummary, SourceStatus } from '../../domain/models/intelligence';
import { IntelligenceRepository } from '../../domain/repositories/intelligence.repositories';

/** Indicador y área elegidos en cada bloque de la pantalla. */
export const ENERGY_INDICATORS = [
  { code: 'FUEL_ACPM_PRICE', label: 'ACPM' },
  { code: 'FUEL_GASOLINE_PRICE', label: 'Gasolina' },
  { code: 'FUEL_GNCV_PRICE', label: 'GNCV' },
] as const;
export const COST_INDICATORS = [
  { code: 'ICTC_TOTAL', label: 'Total nacional' },
  { code: 'ICTC_FUEL', label: 'Combustibles' },
  { code: 'ICTC_INPUTS', label: 'Insumos' },
  { code: 'ICTC_FIXED', label: 'Costos fijos y peajes' },
  { code: 'ICTC_MAINTENANCE', label: 'Mantenimiento y repuestos' },
] as const;
/** Ventanas de las series (en meses). */
export const ENERGY_RANGES = [6, 12, 24, 48] as const;
export const COST_RANGES = [12, 24, 48, 84] as const;

/** Primer día del mes de hace `months` meses, como `YYYY-MM-DD` (ventana de las series históricas). */
export function monthsAgo(months: number, now: Date = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth() - months, 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

@Injectable({ providedIn: 'root' })
export class IntelligenceFacade {
  private readonly repository = inject(IntelligenceRepository);
  private readonly registry = inject(ContextResetRegistry);

  readonly summary = this.registry.track(new ScopedResource<IntelligenceSummary>());
  readonly energy = this.registry.track(new ScopedResource<IndicatorHistory>());
  readonly costs = this.registry.track(new ScopedResource<IndicatorHistory>());
  readonly groups = this.registry.track(new ScopedResource<GroupBreakdown>());
  readonly sources = this.registry.track(new ScopedResource<readonly SourceStatus[]>());
  readonly acpmAreas = this.registry.track(new ScopedResource<AreaComparison>());
  readonly gasolineAreas = this.registry.track(new ScopedResource<AreaComparison>());
  readonly gncvAreas = this.registry.track(new ScopedResource<AreaComparison>());

  readonly energyCode = signal<string>(ENERGY_INDICATORS[0].code);
  readonly energyArea = signal<string | null>(null);
  readonly energyMonths = signal<number>(12);
  readonly costCode = signal<string>(COST_INDICATORS[0].code);
  readonly costMonths = signal<number>(12);
  readonly working = signal(false);
  /**
   * Si varias secciones fallan por la MISMA causa (mismo código de error), se muestra un único aviso general en lugar
   * de una alerta idéntica por sección.
   */
  readonly sharedError = computed<AppError | null>(() => {
    const failed = [this.summary, this.energy, this.acpmAreas, this.costs, this.sources]
      .filter((resource) => resource.status() === 'error')
      .map((resource) => resource.error());

    return failed.length >= 2 && failed.every((e) => e?.code === failed[0]?.code) ? failed[0] : null;
  });
  /** Si la persona ya eligió combustible, no se le cambia solo. */
  private userPickedEnergy = false;

  /** Comparación geográfica del combustible elegido (cada indicador se pide una sola vez). */
  get cities(): ScopedResource<AreaComparison> {
    const code = this.energyCode();

    return code === 'FUEL_GASOLINE_PRICE' ? this.gasolineAreas : code === 'FUEL_GNCV_PRICE' ? this.gncvAreas : this.acpmAreas;
  }

  /** Carga todo el tablero; los datos ya cargados se refrescan en segundo plano (sin parpadeo). */
  loadAll(): void {
    this.summary.load(this.repository.summary().pipe(tap((summary) => this.useFirstFuelWithData(summary))), { keepData: true });
    this.sources.load(this.repository.sources(), { keepData: true });
    this.groups.load(this.repository.ictcGroups(), { keepData: true });
    this.acpmAreas.load(this.repository.areas('FUEL_ACPM_PRICE'), { keepData: true });
    this.gasolineAreas.load(this.repository.areas('FUEL_GASOLINE_PRICE'), { keepData: true });
    this.loadGncvAreas();
    this.loadEnergy();
    this.loadCosts();
  }

  /** Solo las tarjetas destacadas (p. ej. los precios de combustible del resumen de la consola). */
  loadSummary(): void {
    this.summary.load(this.repository.summary(), { keepData: true });
  }

  selectEnergy(code: string): void {
    this.userPickedEnergy = true;
    this.energyCode.set(code);
    this.energyArea.set(null);
    this.loadEnergy();
  }

  selectEnergyArea(areaCode: string | null): void {
    this.energyArea.set(areaCode);
    this.loadEnergy();
  }

  setEnergyMonths(months: number): void {
    this.energyMonths.set(months);
    this.loadEnergy();
  }

  selectCost(code: string): void {
    this.costCode.set(code);
    this.loadCosts();
  }

  setCostMonths(months: number): void {
    this.costMonths.set(months);
    this.loadCosts();
  }

  /**
   * Para no abrir la pantalla con un gráfico vacío: si el combustible elegido por defecto no tiene datos y otro sí,
   * se muestra el primero que tenga (solo mientras la persona no haya elegido uno).
   */
  private useFirstFuelWithData(summary: IntelligenceSummary): void {
    if (this.userPickedEnergy) return;

    const hasData = (code: string): boolean => summary.featured.some((card) => card.code === code && card.status === 'AVAILABLE');
    const first = ENERGY_INDICATORS.find((i) => hasData(i.code));

    if (first && first.code !== this.energyCode() && !hasData(this.energyCode())) {
      this.energyCode.set(first.code);
      this.energyArea.set(null);
      this.loadEnergy();
    }
  }

  private loadEnergy(): void {
    this.energy.load(
      this.repository.history(this.energyCode(), { areaCode: this.energyArea(), dateFrom: monthsAgo(this.energyMonths()) }),
      { keepData: true },
    );
  }

  private loadGncvAreas(): void {
    this.gncvAreas.load(this.repository.areas('FUEL_GNCV_PRICE'), { keepData: true });
  }

  private loadCosts(): void {
    this.costs.load(this.repository.history(this.costCode(), { dateFrom: monthsAgo(this.costMonths()) }), { keepData: true });
  }

  /** Actualiza una fuente automática y recarga el tablero (solo administradores de la plataforma). */
  refresh(sourceCode: string): Observable<IngestionResult> {
    this.working.set(true);

    return this.repository.refreshSource(sourceCode).pipe(tap({ next: () => this.finish(), error: () => this.working.set(false) }));
  }


  private finish(): void {
    this.working.set(false);
    this.loadAll();
  }
}
