import { FootprintByFuel } from '../../domain/models/footprint';
import { ImportCounts } from '../../domain/models/imports';

export const KG_UNIT = 'kg CO₂';

const WHOLE = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

/** Un combustible del resultado, listo para mostrar. */
export interface FuelResultView {
  readonly fuelCode: string;
  readonly name: string;
  /** kg de CO₂ equivalente redondeados al entero, con separador de miles es-CO («43.432»). */
  readonly value: string;
  readonly unit: string;
}

/** Una cifra total de la mitad derecha: valor y unidad, o «—» (`value` null) con la nota de por qué no hay. */
export interface TotalView {
  readonly value: string | null;
  readonly unit: string;
  readonly note: string;
  /** Segunda línea muy discreta (solo en la distancia, con rutas): «de ellos 120.000 km calculados por ruta (aprox.)». */
  readonly extra: string | null;
}

export interface TotalsView {
  readonly distance: TotalView;
  readonly cargo: TotalView;
}

/** Kilogramos al entero con separador de miles. */
export const formatKg = (kg: number): string => WHOLE.format(Math.round(kg));

/** Toneladas: con hasta un decimal si son menos de 100 («12,5»); desde 100, al entero con separador de miles. */
export const formatTons = (tons: number): string => (tons < 100 ? ONE_DECIMAL.format(tons) : WHOLE.format(Math.round(tons)));

/**
 * Resultado por combustible del periodo, en el orden que entrega el servidor. Se descartan las cifras negativas o no numéricas (no pueden existir).
 * Sin dato (`null`, vacío o todo inválido) devuelve vacío: la tarjeta muestra el estado «pendiente», sin rotación.
 */
export function fuelResults(byFuel: FootprintByFuel | null): FuelResultView[] {
  return (byFuel ?? []).filter((f) => Number.isFinite(f.kgCo2e) && f.kgCo2e >= 0).map((f) => ({ fuelCode: f.fuelCode, name: f.name, value: formatKg(f.kgCo2e), unit: KG_UNIT }));
}

const trips = (count: number): string => `${WHOLE.format(count)} ${count === 1 ? 'viaje' : 'viajes'}`;

/**
 * Distancia total y carga transportada del periodo elegido: suman solo los viajes que traen el dato, y la nota dice cuántos son. Sin cargas
 * terminadas («—» y «Sube un archivo…»); con cargas pero sin ese dato en ningún viaje («—» y «Ningún viaje trae…»); sin `counts` (sin permiso) solo «—».
 */
export function totalsView(counts: ImportCounts | null): TotalsView {
  const metric = (value: string, unit: string, withData: number, noun: string, missing: string, upload: string, extra: string | null = null): TotalView => {
    if (!counts) return { value: null, unit, note: '', extra: null };

    if (counts.rowsRead === 0) return { value: null, unit, note: upload, extra: null };

    if (withData === 0) return { value: null, unit, note: missing, extra: null };

    return { value, unit, note: `en ${trips(withData)} con ${noun}`, extra };
  };

  const km = formatKg(counts?.distanceKm ?? 0);
  const routeKm = counts?.distanceFromRoutesKm ?? 0;
  const tons = formatTons(counts?.cargoTon ?? 0);

  return {
    distance: metric(km, 'km', counts?.rowsWithDistance ?? 0, 'distancia', 'Ningún viaje trae distancia', 'Sube un archivo para ver la distancia total', routeKm > 0 ? `de ellos ${formatKg(routeKm)} km calculados por ruta (aprox.)` : null),
    cargo: metric(tons, 't', counts?.rowsWithCargo ?? 0, 'carga', 'Ningún viaje trae carga', 'Sube un archivo para ver la carga transportada'),
  };
}
