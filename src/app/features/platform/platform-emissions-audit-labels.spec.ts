import { ActivityItem } from '../../domain/models/platform-admin';
import { activityLine, activityText } from './platform-labels';

const item = (action: string, details: Record<string, unknown> = {}, extra: Partial<ActivityItem> = {}): ActivityItem => ({
  id: '1', occurredAt: new Date(), action, actorName: 'Ana Gómez', targetName: null, organizationName: null, channel: 'api', details, ...extra,
});

describe('textos de auditoría histórica de emisiones (emissions.*)', () => {
  it('las dos acciones históricas tienen texto en español, sin caer en la frase genérica ni mostrar el código', () => {
    for (const action of ['emissions.methodology_create', 'emissions.catalog_apply']) {
      const text = activityText(item(action));
      const line = activityLine(item(action));

      expect(text.title).withContext(action).not.toBe('Ana Gómez realizó una acción administrativa');
      expect(text.title).withContext(action).toMatch(/^Ana Gómez (creó|cargó)/);
      expect(text.detail).withContext(action).not.toBe(action);
      expect(line.text).withContext(action).not.toBe('Acción administrativa');
      expect(line.text).withContext(action).not.toContain('emissions.');
    }
  });

  it('la metodología creada muestra su código, sin inventar datos cuando falta', () => {
    const created = item('emissions.methodology_create', { methodology_code: 'GLEC_FUEL' });

    expect(activityText(created)).toEqual(jasmine.objectContaining({ title: 'Ana Gómez creó una metodología', detail: 'GLEC_FUEL', tone: 'success' }));
    expect(activityLine(created).text).toBe('Metodología creada: GLEC_FUEL');
    expect(activityText(item('emissions.methodology_create')).detail).toBeNull();
    expect(activityLine(item('emissions.methodology_create')).text).toBe('Metodología creada');
  });

  it('la carga del catálogo tiene texto propio con su versión', () => {
    expect(activityText(item('emissions.catalog_apply', { catalog_version: '2026.1' }))).toEqual(
      jasmine.objectContaining({ title: 'Ana Gómez cargó el catálogo técnico de metodologías y factores', detail: '2026.1', tone: 'info' }),
    );
    expect(activityLine(item('emissions.catalog_apply', { catalog_version: '2026.1' })).text).toBe('Catálogo técnico cargado: 2026.1');
    expect(activityText(item('emissions.catalog_apply')).detail).toBeNull();
  });

  it('una acción emissions.* retirada cae en la frase genérica', () => {
    expect(activityText(item('emissions.factor_version_publish')).title).toBe('Ana Gómez realizó una acción administrativa');
  });
});
