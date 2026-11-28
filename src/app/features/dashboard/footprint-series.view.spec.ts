import { buildBucket } from '../../../testing/footprint';
import { NO_TRIPS_IN_PERIOD, PARTIAL_BUCKET_HINT, bucketRange, bucketTip, hasSeriesData, seriesAnnouncement, seriesBars, seriesRows, seriesTitle } from './footprint-series.view';

describe('footprint-series.view', () => {
  it('el título sigue la granularidad y el mensual es el de siempre', () => {
    expect(seriesTitle('month')).toBe('Emisiones de CO₂ por mes');
    expect(seriesTitle('week')).toBe('Emisiones de CO₂ por semana');
    expect(seriesTitle('day')).toBe('Emisiones de CO₂ por día');
    expect(seriesTitle('year')).toBe('Emisiones de CO₂ por año');
  });

  it('una barra por cubeta, las vacías en 0 (no se saltan ni se inventan) y el valor es el kg del servidor', () => {
    const bars = seriesBars([buildBucket({ label: 'Sem 11', kgCo2: 1520.25 }), buildBucket({ label: 'Sem 12', kgCo2: 0, tCo2: 0, trips: 0 })]);

    expect(bars.map((b) => [b.label, b.value])).toEqual([['Sem 11', 1520.25], ['Sem 12', 0]]);
  });

  it('el tooltip trae la etiqueta, kg y t de CO₂ (es-CO), los viajes y, si es parcial, la aclaración', () => {
    const tip = bucketTip(buildBucket({ label: 'Sem 11', start: '2026-03-11', end: '2026-03-15', kgCo2: 1520.25, tCo2: 1.52025, trips: 12, partial: true }));

    expect(tip[0]).toContain('Sem 11');
    expect(tip[0]).toBe('Sem 11 · 11 mar 2026 a 15 mar 2026');
    expect(tip[1]).toBe('1.520,25 kg CO₂ · 1,52 t');
    expect(tip[2]).toBe('12 viajes');
    expect(tip[3]).toBe('Periodo parcial: incluye solo los días dentro del rango elegido');
    expect(PARTIAL_BUCKET_HINT).toBe(tip[3]);
  });

  it('una cubeta de cero muestra 0 y «0 viajes»; un día no repite el rango; un viaje va en singular', () => {
    const zero = bucketTip(buildBucket({ kgCo2: 0, tCo2: 0, trips: 0 }));

    expect(zero.slice(0, 3)).toEqual(['14 mar', '0 kg CO₂ · 0 t', '0 viajes']);
    expect(bucketTip(buildBucket({ trips: 1 }))[2]).toBe('1 viaje');
    expect(bucketRange(buildBucket({ start: '2026-03-14', end: '2026-03-14' }))).toBe('');
    expect(bucketRange({ start: 'x', end: 'y' })).toBe('');
  });

  it('hay datos solo si alguna cubeta tiene viajes o kg (todo en cero es «Sin viajes calculados en este periodo»)', () => {
    const zero = buildBucket({ kgCo2: 0, tCo2: 0, trips: 0 });

    expect(hasSeriesData([zero, zero])).toBeFalse();
    expect(hasSeriesData([zero, buildBucket()])).toBeTrue();
    expect(hasSeriesData([])).toBeFalse();
    expect(NO_TRIPS_IN_PERIOD).toBe('Sin viajes calculados en este periodo');
  });

  it('las filas de la tabla traen periodo, viajes, kg y t ya formateados y la marca de parcial', () => {
    expect(seriesRows([buildBucket({ key: 'k', label: '14 mar', kgCo2: 1234.5, tCo2: 1.2345, trips: 1200, partial: true })])).toEqual([{ key: 'k', label: '14 mar', range: '', trips: '1.200', kg: '1.234,5', tonnes: '1,235', partial: true }]);
  });

  it('el anuncio accesible dice la granularidad, cuántos periodos y el total del servidor', () => {
    expect(seriesAnnouncement('week', 12, 1826.4)).toBe('Serie semanal: 12 periodos, total 1.826 kg CO₂');
    expect(seriesAnnouncement('day', 1, 0)).toBe('Serie diaria: 1 periodo, total 0 kg CO₂');
  });
});
