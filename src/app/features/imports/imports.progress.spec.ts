import { ImportSummary } from '../../domain/models/imports';
import { toImportSummary } from '../../infrastructure/mappers/imports.mappers';
import { importSummaryDto } from '../../../testing/imports';
import { StepMeter, elapsedMs, etaText, liveRow, overallPercent, processedIn, processingMs, queuedText, rateText, stepText } from './imports.progress';

const running = (overrides: Partial<ImportSummary> = {}): ImportSummary => ({
  ...toImportSummary(importSummaryDto({ status: 'RUNNING', phase: 'READING', rows_total: 500_000, rows_processed: 0, headline: null, finished_at: null })),
  ...overrides,
});

describe('imports.progress', () => {
  describe('avance general', () => {
    it('(paso anterior + fracción del paso) / 2: 0 → 49 en la lectura y 50 → 99 en el cálculo', () => {
      expect(overallPercent('READING', 0, 200)).toBe(0);
      expect(overallPercent('READING', 100, 200)).toBe(25);
      expect(overallPercent('READING', 200, 200)).toBe(50);
      expect(overallPercent('CALCULATING', 0, 200)).toBe(50);
      expect(overallPercent('CALCULATING', 100, 200)).toBe(75);
      expect(overallPercent('CALCULATING', 200, 200)).toBe(99);
    });

    it('nunca retrocede a lo largo de las dos fases, ni siquiera cuando rows_processed vuelve a 0', () => {
      const sequence: [string, number][] = [['READING', 0], ['READING', 40], ['READING', 100], ['CALCULATING', 0], ['CALCULATING', 30], ['CALCULATING', 100]];
      const values = sequence.map(([phase, processed]) => overallPercent(phase, processed, 100)!);

      expect(values).toEqual([...values].sort((a, b) => a - b));
    });

    it('es indeterminado (null) sin total, sin paso conocido y acota lo que se pasa del total', () => {
      expect(overallPercent('READING', 5, null)).toBeNull();
      expect(overallPercent('READING', 5, 0)).toBeNull();
      expect(overallPercent(null, 5, 100)).toBeNull();
      expect(overallPercent('REVIEWING', 5, 100)).toBeNull();
      expect(overallPercent('READING', 999, 100)).toBe(50);
    });

    it('el texto del paso', () => {
      expect(stepText('READING')).toBe('Paso 1 de 2 · Leyendo filas');
      expect(stepText('CALCULATING')).toBe('Paso 2 de 2 · Calculando emisiones');
      expect(stepText(null)).toBeNull();
      expect(stepText('OTRA')).toBeNull();
    });
  });

  describe('tiempos', () => {
    const NOW = Date.parse('2026-03-01T10:10:00Z');

    it('corre desde started_at; en cola o sin started_at, desde created_at; nunca negativo', () => {
      expect(elapsedMs({ status: 'RUNNING', createdAt: '2026-03-01T10:00:00Z', startedAt: '2026-03-01T10:08:48Z' }, NOW)).toBe(72_000);
      expect(elapsedMs({ status: 'QUEUED', createdAt: '2026-03-01T10:09:48Z', startedAt: null }, NOW)).toBe(12_000);
      expect(elapsedMs({ status: 'RUNNING', createdAt: '2026-03-01T10:09:00Z', startedAt: null }, NOW)).toBe(60_000);
      expect(elapsedMs({ status: 'RUNNING', createdAt: '2026-03-01T10:00:00Z', startedAt: '2026-03-01T10:20:00Z' }, NOW)).toBe(0);
      expect(elapsedMs({ status: 'QUEUED', createdAt: 'no-es-fecha', startedAt: null }, NOW)).toBe(0);
    });

    it('«En cola · esperando 00:12»', () => {
      expect(queuedText({ status: 'QUEUED', createdAt: '2026-03-01T10:09:48Z', startedAt: null }, NOW)).toBe('En cola · esperando 00:12');
    });

    it('tiempo de proceso de una carga terminada; sin started_at o incoherente es null', () => {
      expect(processingMs({ startedAt: '2026-03-01T10:00:05Z', finishedAt: '2026-03-01T10:02:00Z' })).toBe(115_000);
      expect(processedIn({ startedAt: '2026-03-01T10:00:05Z', finishedAt: '2026-03-01T10:02:00Z' })).toBe('Procesada en 1 min 55 s');
      expect(processedIn({ startedAt: '2026-03-01T10:00:00.000Z', finishedAt: '2026-03-01T10:00:00.400Z' })).toBe('Procesada en menos de 1 s');
      expect(processedIn({ startedAt: null, finishedAt: '2026-03-01T10:02:00Z' })).toBeNull();
      expect(processedIn({ startedAt: '2026-03-01T10:00:05Z', finishedAt: null })).toBeNull();
      expect(processedIn({ startedAt: '2026-03-01T10:05:00Z', finishedAt: '2026-03-01T10:02:00Z' })).toBeNull();
    });
  });

  describe('ritmo y tiempo restante del paso (StepMeter)', () => {
    const feed = (meter: StepMeter, item: ImportSummary, processed: number, at: number): ImportSummary => {
      const next = { ...item, rowsProcessed: processed };

      meter.observe([next], at);

      return next;
    };

    it('no es fiable con menos de 3 s observados ni con menos de 2 % del paso', () => {
      const meter = new StepMeter();
      let item = feed(meter, running(), 0, 0);

      item = feed(meter, item, 50_000, 2000); // 10 % pero solo 2 s
      expect(meter.estimate(item, 2000)).toBeNull();

      const slow = new StepMeter();
      let other = feed(slow, running({ rowsTotal: 1_000_000 }), 0, 0);

      other = feed(slow, other, 10_000, 4000); // 4 s pero 1 %
      expect(slow.estimate(other, 4000)).toBeNull();
    });

    it('con 3 s y 2 % calcula ritmo y restante del paso actual, y lo hace bajar con el reloj', () => {
      const meter = new StepMeter();
      let item = feed(meter, running(), 0, 0);

      item = feed(meter, item, 40_000, 4000); // 10 000 filas/s
      const first = meter.estimate(item, 4000)!;
      const later = meter.estimate(item, 6000)!;

      expect(first.rate).toBe(10_000);
      expect(first.etaMs).toBe(46_000); // 460 000 restantes
      expect(later.etaMs).toBe(44_000);
    });

    it('suaviza: una medición atípica no dispara la estimación', () => {
      const meter = new StepMeter();
      let item = feed(meter, running(), 0, 0);

      item = feed(meter, item, 40_000, 4000); // 10 000 filas/s
      item = feed(meter, item, 41_000, 5000); // 1 000 filas/s: pesa 30 %
      const estimate = meter.estimate(item, 5000)!;

      expect(estimate.rate).toBeCloseTo(0.3 * 1000 + 0.7 * 10_000, 5);
    });

    it('nunca devuelve un valor negativo ni absurdo: pasado el restante o más de un día es null', () => {
      const meter = new StepMeter();
      let item = feed(meter, running(), 0, 0);

      item = feed(meter, item, 40_000, 4000);
      expect(meter.estimate(item, 4000 + 600_000)!.etaMs).toBeNull(); // se agotó la cuenta y aún faltan filas

      const crawl = new StepMeter();
      let slow = feed(crawl, running({ rowsTotal: 1000 }), 0, 0);

      slow = feed(crawl, slow, 20, 100 * 24 * 3_600_000); // 2 % en 100 días: quedarían más de un año
      expect(crawl.estimate(slow, 100 * 24 * 3_600_000)!.etaMs).toBeNull();
    });

    it('al cambiar de paso (o reiniciar) empieza de cero: no arrastra el ritmo de la lectura', () => {
      const meter = new StepMeter();
      let item = feed(meter, running(), 0, 0);

      item = feed(meter, item, 500_000, 4000);
      expect(meter.estimate(item, 4000)).not.toBeNull();

      const calculating = { ...item, phase: 'CALCULATING', rowsProcessed: 0 };

      meter.observe([calculating], 5000);
      expect(meter.estimate(calculating, 5000)).toBeNull();
    });

    it('olvida las cargas que ya no están en proceso', () => {
      const meter = new StepMeter();
      let item = feed(meter, running(), 0, 0);

      item = feed(meter, item, 40_000, 4000);
      meter.observe([{ ...item, status: 'COMPLETED' }], 5000);
      expect(meter.estimate(item, 5000)).toBeNull();
    });

    it('al llegar al total el restante es 0', () => {
      const meter = new StepMeter();
      let item = feed(meter, running(), 0, 0);

      item = feed(meter, item, 250_000, 4000);
      item = feed(meter, item, 500_000, 8000);
      expect(meter.estimate(item, 8000)!.etaMs).toBe(0);
    });
  });

  describe('textos', () => {
    it('ritmo: «≈ 12.400 filas/s» redondeado', () => {
      expect(rateText(12_437)).toBe('≈ 12.400 filas/s');
      expect(rateText(437.4)).toBe('≈ 440 filas/s');
      expect(rateText(12.4)).toBe('≈ 12 filas/s');
      expect(rateText(0.46)).toBe('≈ 0,5 filas/s');
    });

    it('restante: «quedan ≈ 38 s»; desde el minuto de 5 en 5 s; nunca menos de 1 s', () => {
      expect(etaText(38_000)).toBe('quedan ≈ 38 s');
      expect(etaText(37_200)).toBe('quedan ≈ 38 s');
      expect(etaText(71_000)).toBe('quedan ≈ 1 min 15 s');
      expect(etaText(200)).toBe('quedan ≈ 1 s');
      expect(etaText(-5000)).toBe('quedan ≈ 1 s');
    });

    it('la fila en proceso arma reloj, paso, filas, ritmo y restante; antes de ser fiable dice «calculando…»', () => {
      const meter = new StepMeter();
      const now = Date.parse('2026-03-01T10:10:00Z');
      const item = running({ rowsProcessed: 230_000, startedAt: '2026-03-01T10:08:48Z' });

      meter.observe([{ ...item, rowsProcessed: 0 }], now - 4000);
      meter.observe([item], now);
      const live = liveRow(item, now, meter);

      expect(live.clock).toBe('01:12');
      expect(live.clockSpoken).toBe('1 min 12 s');
      expect(live.left).toBe('1/2 · Leyendo filas · 230.000 de 500.000');
      expect(live.step).toBe('Paso 1 de 2 · Leyendo filas');
      expect(live.eta).toBe(etaText(((500_000 - 230_000) / 57_500) * 1000));
      expect(live.title).toBe(`Paso 1 de 2 · Leyendo filas · 230.000 de 500.000 filas · ≈ 57.500 filas/s · ${live.eta}`);
      expect(liveRow(item, now, new StepMeter()).eta).toBe('calculando…');
      expect(liveRow({ ...item, phase: null }, now, meter)).toEqual(jasmine.objectContaining({ left: '', eta: '', step: null }));
    });
  });
});
