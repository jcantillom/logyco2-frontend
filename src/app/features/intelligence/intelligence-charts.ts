import { computed } from '@angular/core';
import { CHART_COLORS, ChartSeries } from '../../shared/ui/charts/chart-model';
import { axisDate, axisMonth, formatMoney, formatNumber, formatPct } from './intelligence.format';
import { ENERGY_INDICATORS, IntelligenceFacade } from './intelligence.facade';

/** Estado derivado del histórico de combustibles que dibujan el resumen y «Mercado energético». */
export function energyChart(facade: IntelligenceFacade) {
  const series = computed<readonly ChartSeries[] | null>(() => {
    const data = facade.energy.data();

    return data && data.points.length > 0 ? [{ name: data.name, color: CHART_COLORS.green, values: data.points.map((p) => p.value) }] : null;
  });

  return {
    series,
    label: computed(() => ENERGY_INDICATORS.find((i) => i.code === facade.energyCode())?.label ?? ''),
    labels: computed(() => {
      const byValidity = facade.energyCode() !== 'FUEL_GNCV_PRICE';

      return (facade.energy.data()?.points ?? []).map((p) => (byValidity ? axisDate(p.referencePeriod) : axisMonth(p.referencePeriod)));
    }),
    /** Tooltip de cada punto: circular de origen y variación frente a la publicación anterior (o la mensual). */
    notes: computed(() =>
      (facade.energy.data()?.points ?? []).map((p) => {
        const change = p.previousPct ?? p.monthlyPct;
        const parts = [p.sourceReference, change === null ? null : `${p.previousPct !== null ? 'vs. anterior' : 'vs. mes anterior'} ${formatPct(change)}`].filter(Boolean);

        return parts.length ? parts.join(' · ') : null;
      }),
    ),
    mark: computed(() => {
      const last = facade.energy.data()?.points.at(-1);

      return last ? formatMoney(last.value) : null;
    }),
    emptyHint: computed(() =>
      facade.energyCode() === 'FUEL_GNCV_PRICE' ? 'Aún no se han adquirido los precios de gas natural vehicular.' : 'Aún no hay una publicación oficial que se pueda leer automáticamente.',
    ),
  };
}

/** Estado derivado del histórico del ICTC que dibujan el resumen y «Costos de transporte». */
export function costChart(facade: IntelligenceFacade) {
  return {
    labels: computed(() => (facade.costs.data()?.points ?? []).map((p) => axisMonth(p.referencePeriod))),
    series: computed<readonly ChartSeries[] | null>(() => {
      const data = facade.costs.data();

      return data && data.points.length > 0 ? [{ name: data.name, color: CHART_COLORS.green, values: data.points.map((p) => p.value) }] : null;
    }),
    mark: computed(() => {
      const last = facade.costs.data()?.points.at(-1);

      return last ? formatNumber(last.value) : null;
    }),
  };
}
