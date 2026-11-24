import { agoText, expiryText, failureText, isActive, sizeText, statusText, statusTone } from './operation-exports.view';

describe('operation-exports.view', () => {
  const NOW = Date.parse('2026-11-23T12:00:00Z');

  it('el texto del estado: En cola, Generando n %, Listo, Falló, Cancelado y Vencido', () => {
    expect(statusText({ status: 'QUEUED', progress: 0 })).toBe('En cola');
    expect(statusText({ status: 'RUNNING', progress: 42 })).toBe('Generando 42 %');
    expect(statusText({ status: 'RUNNING', progress: null })).toBe('Generando 0 %');
    expect(statusText({ status: 'COMPLETED', progress: 100 })).toBe('Listo');
    expect(statusText({ status: 'FAILED', progress: null })).toBe('Falló');
    expect(statusText({ status: 'CANCELED', progress: null })).toBe('Cancelado');
    expect(statusText({ status: 'EXPIRED', progress: null })).toBe('Vencido');
  });

  it('solo en cola y generando son activos; cada estado tiene su tono', () => {
    expect(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED', 'EXPIRED'].map((status) => isActive({ status: status as never }))).toEqual([true, true, false, false, false, false]);
    expect(statusTone('COMPLETED')).toBe('success');
    expect(statusTone('FAILED')).toBe('danger');
    expect(statusTone('EXPIRED')).toBe('warning');
    expect(statusTone('RUNNING')).toBe('info');
  });

  it('tamaño y tiempos relativos legibles', () => {
    expect(sizeText(null)).toBe('');
    expect(sizeText(31_457_280)).toBe('31,5 MB');
    expect(sizeText(830_000)).toBe('830 KB');
    expect(agoText('2026-11-23T11:59:50Z', NOW)).toBe('hace un momento');
    expect(agoText('2026-11-23T11:55:00Z', NOW)).toBe('hace 5 min');
    expect(agoText('2026-11-23T09:00:00Z', NOW)).toBe('hace 3 h');
    expect(agoText('2026-11-21T12:00:00Z', NOW)).toBe('hace 2 días');
    expect(agoText('2026-11-22T11:00:00Z', NOW)).toBe('hace 1 día');
    expect(agoText('2026-11-23T13:00:00Z', NOW)).toBe('hace un momento');
  });

  it('el vencimiento solo se dice de un reporte listo', () => {
    expect(expiryText({ status: 'COMPLETED', expiresAt: '2026-11-26T11:00:00Z' }, NOW)).toBe('vence en 71 h');
    expect(expiryText({ status: 'COMPLETED', expiresAt: '2026-11-23T12:25:00Z' }, NOW)).toBe('vence en 25 min');
    expect(expiryText({ status: 'COMPLETED', expiresAt: '2026-11-23T11:00:00Z' }, NOW)).toBe('vence ahora');
    expect(expiryText({ status: 'FAILED', expiresAt: null }, NOW)).toBe('');
  });

  it('el motivo del fallo sale del catálogo en español, nunca del texto del servidor', () => {
    expect(failureText({ status: 'FAILED', errorCode: 'EXPORT_FAILED' })).toContain('No se pudo generar el reporte');
    expect(failureText({ status: 'FAILED', errorCode: 'EXPORT_STORAGE_FULL' })).toContain('espacio');
    expect(failureText({ status: 'FAILED', errorCode: null })).toContain('No se pudo generar el reporte');
    expect(failureText({ status: 'COMPLETED', errorCode: null })).toBe('');
  });
});
