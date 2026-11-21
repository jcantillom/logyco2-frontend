import { PlatformTrends } from '../../domain/models/platform-admin';
import { buildEvolution, toYearData, yearRange } from './platform-evolution';

const metrics = { organizationsCreated: 0, usersRegistered: 0, invitationsCreated: 0, adminsOnboarded: 0, membershipsApproved: 0, superAdminsGranted: 0 };
const trends = (points: { bucket: string; organizationsCreated?: number }[]): PlatformTrends => ({
  period: { dateFrom: '2026-01-01', dateTo: '2026-12-31', granularity: 'day', days: 365 },
  summary: metrics,
  points: points.map((p) => ({ ...metrics, ...p })),
  auditAvailableSince: null,
});

describe('evolución mensual', () => {
  it('agrupa por mes los puntos diarios y descarta los de otro año', () => {
    const data = toYearData(2026, trends([
      { bucket: '2026-03-02', organizationsCreated: 1 },
      { bucket: '2026-03-20', organizationsCreated: 2 },
      { bucket: '2025-12-31', organizationsCreated: 7 },
    ]));

    expect(data.months[2].organizations).toBe(3);
    expect(data.months.reduce((sum, m) => sum + m.organizations, 0)).toBe(3);
  });

  it('el rango del año en curso termina hoy; el de un año pasado, el 31 de diciembre', () => {
    expect(yearRange(2026, '2026-11-18')).toEqual({ from: '2026-01-01', to: '2026-11-18' });
    expect(yearRange(2025, '2026-11-18')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('reconstruye el acumulado hacia atrás desde el total actual, mes a mes', () => {
    const years = new Map([[2026, toYearData(2026, trends([{ bucket: '2026-02-01', organizationsCreated: 1 }, { bucket: '2026-04-01', organizationsCreated: 2 }]))]]);
    const e = buildEvolution(2026, 'organizations', years, 5, '2026-05-10');

    expect(e.labels).toEqual(['Ene', 'Feb', 'Mar', 'Abr', 'May']);
    expect(e.cumulative).toEqual([2, 3, 3, 5, 5]);
  });

  it('un año pasado necesita los años posteriores; sin ellos no se inventa el acumulado', () => {
    const y2025 = toYearData(2025, trends([{ bucket: '2025-06-01', organizationsCreated: 1 }]));
    const y2026 = toYearData(2026, trends([{ bucket: '2026-01-01', organizationsCreated: 1 }]));

    expect(buildEvolution(2025, 'organizations', new Map([[2025, y2025]]), 4, '2026-05-10').cumulative).toBeNull();
    const full = buildEvolution(2025, 'organizations', new Map([[2025, y2025], [2026, y2026]]), 4, '2026-05-10');
    expect(full.labels.length).toBe(12);
    expect(full.cumulative?.[4]).toBe(2);
    expect(full.cumulative?.[5]).toBe(3);
  });

  it('con más altas que el total (datos incoherentes) no hay acumulado', () => {
    const years = new Map([[2026, toYearData(2026, trends([{ bucket: '2026-02-01', organizationsCreated: 9 }]))]]);

    expect(buildEvolution(2026, 'organizations', years, 3, '2026-05-10').cumulative).toBeNull();
  });
});
