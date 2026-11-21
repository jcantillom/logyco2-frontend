import { ActivityItem } from '../../domain/models/platform-admin';
import { activityLine, activityText, relativeTime } from './platform-labels';

const item = (action: string, extra: Partial<ActivityItem> = {}): ActivityItem => ({
  id: '1', occurredAt: new Date(), action, actorName: 'Ana Gómez', targetName: null, organizationName: null, channel: 'api', details: {}, ...extra,
});

describe('textos de la actividad administrativa', () => {
  it('describe cada acción conocida con los datos reales del evento', () => {
    expect(activityText(item('organization.create', { organizationName: 'ENVIA' })).title).toBe('Ana Gómez creó la empresa ENVIA');
    expect(activityText(item('global_role.grant', { targetName: 'Luis Pérez', details: { role: 'SUPER_ADMIN' } })).title).toContain('concedió el rol');
    expect(activityText(item('global_role.revoke', { targetName: 'Luis Pérez', details: { role: 'SUPER_ADMIN' } })).tone).toBe('danger');
    expect(activityText(item('invitation.create', { organizationName: 'ENVIA', details: { invitee: 'lu***@x.co', role: 'ORG_ADMIN' } }))).toEqual(
      jasmine.objectContaining({ title: 'Ana Gómez invitó a lu***@x.co a ENVIA', detail: jasmine.stringContaining('Rol:') }),
    );
  });

  it('una aprobación de membresía se muestra como activa y una suspensión como advertencia', () => {
    const base = { targetName: 'Luis', organizationName: 'ENVIA' };

    expect(activityText(item('membership.status_change', { ...base, details: { to_status: 'ACTIVE' } })).tone).toBe('success');
    expect(activityText(item('membership.status_change', { ...base, details: { to_status: 'SUSPENDED' } })).tone).toBe('warning');
  });

  it('traduce las acciones de membresías, relaciones comerciales, contrapartes y logo sin mostrar el código técnico', () => {
    const base = { organizationName: 'TCC', targetName: 'María Gómez' };

    expect(activityText(item('membership.delete', base))).toEqual(
      jasmine.objectContaining({ title: 'Ana Gómez eliminó la membresía de María Gómez en TCC', detail: null, tone: 'warning' }),
    );
    expect(activityText(item('organization_link.requested', { organizationName: 'TCC', targetName: 'ENVIA' }))).toEqual(
      jasmine.objectContaining({ title: 'Ana Gómez solicitó una relación comercial de TCC', detail: 'ENVIA', tone: 'info' }),
    );
    expect(activityText(item('organization_link.cancelled', { organizationName: 'TCC' })).title).toBe('Ana Gómez canceló una relación comercial de TCC');
    expect(activityText(item('external_counterpart.create', { targetName: 'Acme' }))).toEqual(
      jasmine.objectContaining({ title: 'Ana Gómez registró una contraparte externa', detail: 'Acme', tone: 'success' }),
    );
    expect(activityText(item('external_counterpart.deactivate')).title).toBe('Ana Gómez desactivó una contraparte externa');
    expect(activityText(item('organization.logo_update', { organizationName: 'TCC' })).title).toBe('Ana Gómez actualizó el logo de TCC');
    for (const action of ['membership.delete', 'organization_link.requested', 'organization_link.cancelled', 'external_counterpart.create', 'external_counterpart.deactivate', 'organization.logo_update']) {
      expect(activityText(item(action)).detail).not.toBe(action);
      expect(activityLine(item(action)).text).not.toBe('Acción administrativa');
    }
  });

  it('una acción desconocida no inventa contenido y se rotula como acción administrativa', () => {
    const text = activityText(item('algo.nuevo'));

    expect(text.title).toBe('Ana Gómez realizó una acción administrativa');
    expect(text.detail).toBe('algo.nuevo');
  });

  it('sin actor identificado (p. ej. recuperación por operador) no atribuye la acción a nadie en concreto', () => {
    expect(activityText(item('global_role.grant', { actorName: null, targetName: 'Luis' })).title).toContain('Un operador');
  });
});

describe('acciones que el filtro de auditoría deja ver', () => {
  it('traduce la gestión de empresas, usuarios y relaciones sin mostrar el código técnico', () => {
    for (const action of ['organization.logo_remove', 'organization.profile_update', 'organization.delete', 'organization.restore', 'organization.purge', 'user.update', 'organization_link.accepted', 'organization_link.rejected', 'organization_link.ended', 'external_counterpart.update']) {
      expect(activityText(item(action)).title).withContext(action).not.toContain('.');
      expect(activityLine(item(action)).text).withContext(action).not.toBe('Acción administrativa');
    }
  });
});

describe('depuración de la auditoría por retención', () => {
  it('se lee en español con la fecha de corte y la cantidad, en tono de borrado definitivo, sin atribuirla a una persona', () => {
    const purge = item('audit.retention_purge', { actorName: null, details: { cutoff: '2026-05-21T02:43:00+00:00', deleted: 5000, oldest: '2024-12-21T00:00:00+00:00' } });

    expect(activityText(purge)).toEqual(
      jasmine.objectContaining({ title: 'Depuración de la auditoría: eventos anteriores al 2026-05-21', detail: '5000 eventos eliminados de forma definitiva', tone: 'danger' }),
    );
    expect(activityText(purge).title).not.toContain('realizó una acción');
    expect(activityLine(purge).text).toBe('Auditoría depurada (anterior al 2026-05-21)');
  });

  it('con un solo evento usa el singular y sin datos no inventa nada', () => {
    expect(activityText(item('audit.retention_purge', { details: { cutoff: '2026-05-21T00:00:00+00:00', deleted: 1 } })).detail).toBe('1 evento eliminado de forma definitiva');

    const bare = activityText(item('audit.retention_purge', { details: {} }));
    expect(bare.title).toBe('Depuración de la auditoría: eventos anteriores al plazo de retención');
    expect(bare.detail).toBeNull();
  });
});

describe('tiempo relativo', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  const ago = (seconds: number): Date => new Date(now.getTime() - seconds * 1000);

  it('usa unidades legibles', () => {
    expect(relativeTime(ago(10), now)).toBe('hace unos segundos');
    expect(relativeTime(ago(5 * 60), now)).toBe('hace 5 min');
    expect(relativeTime(ago(3 * 3600), now)).toBe('hace 3 h');
    expect(relativeTime(ago(30 * 3600), now)).toBe('ayer');
    expect(relativeTime(ago(3 * 86_400), now)).toBe('hace 3 días');
  });

  it('un futuro por reloj desfasado nunca da un valor negativo', () => {
    expect(relativeTime(new Date(now.getTime() + 60_000), now)).toBe('hace unos segundos');
  });
});

describe('líneas compactas de actividad (acción + objeto, actor aparte)', () => {
  const event = (action: string, extra: Partial<ActivityItem> = {}): ActivityItem => ({
    id: '1', occurredAt: new Date(), action, actorName: 'Ana Gómez', targetName: null, organizationName: null, channel: 'api', details: {}, ...extra,
  });

  it('muestra el objeto de la acción y el actor por separado', () => {
    expect(activityLine(event('organization.create', { organizationName: 'ENVIA' }))).toEqual({ icon: 'organization', text: 'Empresa creada: ENVIA', actor: 'Ana Gómez' });
    expect(activityLine(event('global_role.grant', { targetName: 'Luis', details: { role: 'SUPER_ADMIN' } })).text).toBe('Rol concedido: Superadministrador → Luis');
    expect(activityLine(event('invitation.create', { organizationName: 'ENVIA', details: { invitee: 'lu***@x.co' } })).text).toBe('Invitación enviada: lu***@x.co → ENVIA');
  });

  it('sin persona identificada el actor es «Sistema», nunca un nombre inventado', () => {
    expect(activityLine(event('organization.create', { actorName: null })).actor).toBe('Sistema');
  });

  it('una acción desconocida se rotula genéricamente', () => {
    expect(activityLine(event('algo.nuevo')).text).toBe('Acción administrativa');
  });
});
