import { ActivityItem } from '../../domain/models/platform-admin';
import { Label, MEMBERSHIP_LABELS, roleLabel } from '../../shared/ui/labels';
import { ServiceStatus } from '../../domain/models/platform';

/** Estado de una PERSONA de la empresa (masculino); `MEMBERSHIP_LABELS` rotula la membresía (femenino) y lo usan otras vistas. */
export const PERSON_STATUS_LABELS: Readonly<Record<string, Label>> = {
  ...MEMBERSHIP_LABELS,
  ACTIVE: { text: 'Activo', tone: 'success' },
  SUSPENDED: { text: 'Suspendido', tone: 'warning' },
  REVOKED: { text: 'Revocado', tone: 'danger' },
};

/** Estado de una persona según su membresía, con el mismo texto en toda la consola (lista, identidad y tabla de membresías). */
export function memberStatus(status: string): Label {
  return status === 'PENDING' ? { text: 'Pendiente', tone: 'warning' } : (PERSON_STATUS_LABELS[status] ?? { text: 'Activo', tone: 'success' });
}

/**
 * Estado de la persona, el mismo criterio en la lista y en el detalle: cuenta inactiva; si no, su membresía vigente;
 * si solo conserva membresías revocadas, «Revocado» (la cuenta puede seguir activa); sin membresías, solo la cuenta.
 */
export function personStatus(user: { readonly isActive: boolean; readonly memberships: readonly { readonly status: string }[] }): Label {
  if (!user.isActive) return { text: 'Inactivo', tone: 'neutral' };

  const current = user.memberships.find((m) => m.status !== 'REVOKED');

  if (current) return memberStatus(current.status);

  return user.memberships.length > 0 ? memberStatus('REVOKED') : { text: 'Activo', tone: 'success' };
}

export const SERVICE_LABELS: Record<ServiceStatus, Label> = {
  UP: { text: 'Operativo', tone: 'success' },
  DEGRADED: { text: 'Degradado', tone: 'warning' },
  DOWN: { text: 'No disponible', tone: 'danger' },
  UNVERIFIED: { text: 'No verificado', tone: 'neutral' },
};

// ── Actividad administrativa (auditoría persistente) ──

export interface ActivityText {
  readonly title: string;
  readonly detail: string | null;
  readonly tone: 'success' | 'info' | 'warning' | 'danger' | 'neutral';
}

const MEMBERSHIP_STATUS_TEXT: Readonly<Record<string, string>> = {
  PENDING: 'pendiente', ACTIVE: 'activa', SUSPENDED: 'suspendida', REVOKED: 'revocada',
};

function detailNumber(item: ActivityItem, key: string): number | null {
  const value = item.details[key];

  return typeof value === 'number' ? value : null;
}

/** `2026-05-21T02:43:00+00:00` -> `2026-05-21`: la fecha de corte de una depuración por retención. */
function cutoffDay(item: ActivityItem): string | null {
  return detailText(item, 'cutoff')?.slice(0, 10) ?? null;
}

function detailText(item: ActivityItem, key: string): string | null {
  const value = item.details[key];

  return typeof value === 'string' && value ? value : null;
}

/** Frase en español de un evento de auditoría. Nunca inventa datos: usa solo lo que el evento trae. */
export function activityText(item: ActivityItem): ActivityText {
  const actor = item.actorName ?? 'Un operador';
  const target = item.targetName ?? 'una persona';
  const organization = item.organizationName ?? 'una empresa';
  const role = detailText(item, 'role');

  switch (item.action) {
    case 'organization.create': return { title: `${actor} creó la empresa ${organization}`, detail: null, tone: 'success' };
    case 'organization.update': return { title: `${actor} modificó los datos de ${organization}`, detail: null, tone: 'info' };
    case 'organization.activate': return { title: `${actor} activó la empresa ${organization}`, detail: null, tone: 'success' };
    case 'organization.deactivate': return { title: `${actor} desactivó la empresa ${organization}`, detail: null, tone: 'warning' };
    case 'organization.set_types': return { title: `${actor} actualizó los tipos de ${organization}`, detail: null, tone: 'info' };
    case 'invitation.create': return { title: `${actor} invitó a ${detailText(item, 'invitee') ?? 'una persona'} a ${organization}`, detail: role ? `Rol: ${roleLabel(role)}` : null, tone: 'info' };
    case 'invitation.revoke': return { title: `${actor} revocó una invitación de ${organization}`, detail: null, tone: 'warning' };
    case 'invitation.accept': return { title: `${actor} aceptó la invitación a ${organization}`, detail: role ? `Rol: ${roleLabel(role)}` : null, tone: 'success' };
    case 'membership.status_change': {
      const to = MEMBERSHIP_STATUS_TEXT[detailText(item, 'to_status') ?? ''] ?? 'actualizada';

      return { title: `${actor} dejó ${to} la membresía de ${target} en ${organization}`, detail: null, tone: to === 'activa' ? 'success' : 'warning' };
    }
    case 'global_role.grant': return { title: `${actor} concedió el rol ${role ? roleLabel(role) : 'global'} a ${target}`, detail: null, tone: 'success' };
    case 'global_role.revoke': return { title: `${actor} revocó el rol ${role ? roleLabel(role) : 'global'} a ${target}`, detail: null, tone: 'danger' };
    case 'super_admin.invite': return { title: `${actor} invitó a un superadministrador`, detail: detailText(item, 'invitee'), tone: 'info' };
    case 'super_admin.invitation_revoke': return { title: `${actor} revocó una invitación de superadministrador`, detail: null, tone: 'warning' };
    case 'super_admin.accept': return { title: `${actor} aceptó ser superadministrador`, detail: null, tone: 'success' };
    case 'membership.delete': return { title: `${actor} eliminó la membresía de ${target} en ${organization}`, detail: null, tone: 'warning' };
    case 'organization.logo_update': return { title: `${actor} actualizó el logo de ${organization}`, detail: null, tone: 'info' };
    case 'organization.logo_remove': return { title: `${actor} quitó el logo de ${organization}`, detail: null, tone: 'info' };
    case 'organization.profile_update': return { title: `${actor} actualizó el perfil de ${organization}`, detail: null, tone: 'info' };
    case 'organization.delete': return { title: `${actor} eliminó la empresa ${organization}`, detail: null, tone: 'warning' };
    case 'organization.restore': return { title: `${actor} restauró la empresa ${organization}`, detail: null, tone: 'success' };
    case 'organization.purge': return { title: `${actor} eliminó definitivamente la empresa ${organization}`, detail: null, tone: 'danger' };
    case 'user.update': return { title: `${actor} actualizó los datos de ${target}`, detail: null, tone: 'info' };
    case 'organization_link.accepted': return { title: `${actor} aceptó una relación comercial de ${organization}`, detail: item.targetName, tone: 'success' };
    case 'organization_link.rejected': return { title: `${actor} rechazó una relación comercial de ${organization}`, detail: item.targetName, tone: 'warning' };
    case 'organization_link.ended': return { title: `${actor} terminó una relación comercial de ${organization}`, detail: item.targetName, tone: 'warning' };
    case 'external_counterpart.update': return { title: `${actor} actualizó una contraparte externa`, detail: item.targetName, tone: 'info' };
    case 'organization_link.requested': return { title: `${actor} solicitó una relación comercial de ${organization}`, detail: item.targetName, tone: 'info' };
    case 'organization_link.cancelled': return { title: `${actor} canceló una relación comercial de ${organization}`, detail: item.targetName, tone: 'warning' };
    case 'external_counterpart.create': return { title: `${actor} registró una contraparte externa`, detail: item.targetName, tone: 'success' };
    case 'external_counterpart.deactivate': return { title: `${actor} desactivó una contraparte externa`, detail: item.targetName, tone: 'warning' };
    case 'audit.retention_purge': {
      const deleted = detailNumber(item, 'deleted');

      return {
        title: `Depuración de la auditoría: eventos anteriores al ${cutoffDay(item) ?? 'plazo de retención'}`,
        detail: deleted === null ? null : `${deleted} ${deleted === 1 ? 'evento eliminado' : 'eventos eliminados'} de forma definitiva`,
        tone: 'danger',
      };
    }
    default: {
      const emissions = EMISSIONS_ACTIONS[item.action];

      return emissions
        ? { title: `${actor} ${emissions.phrase}`, detail: emissionsSubject(item), tone: emissions.tone }
        : { title: `${actor} realizó una acción administrativa`, detail: item.action, tone: 'neutral' };
    }
  }
}

/** «hace 5 min», «hace 3 h», «ayer»… Para fechas más antiguas se usa la fecha corta. */
export function relativeTime(moment: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - moment.getTime()) / 1000));

  if (seconds < 45) return 'hace unos segundos';
  if (seconds < 3600) return `hace ${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 86_400) return `hace ${Math.round(seconds / 3600)} h`;
  if (seconds < 172_800) return 'ayer';
  if (seconds < 604_800) return `hace ${Math.round(seconds / 86_400)} días`;

  return moment.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export type ActivityIcon = 'organization' | 'person' | 'invitation' | 'role' | 'membership';

export interface ActivityLine {
  readonly icon: ActivityIcon;
  /** Frase corta con el objeto de la acción: «Empresa creada: ENVIA». */
  readonly text: string;
  /** Quién la realizó; «Sistema» cuando no hay una persona (p. ej. una intervención del operador). */
  readonly actor: string;
}

/** Versión compacta (acción + objeto, el actor aparte) para listados y tablas. */
export function activityLine(item: ActivityItem): ActivityLine {
  const actor = item.actorName ?? 'Sistema';
  const organization = item.organizationName ?? 'empresa';
  const target = item.targetName ?? 'persona';
  const role = detailText(item, 'role');
  const invitee = detailText(item, 'invitee') ?? 'persona';

  switch (item.action) {
    case 'organization.create': return { icon: 'organization', text: `Empresa creada: ${organization}`, actor };
    case 'organization.update': return { icon: 'organization', text: `Empresa modificada: ${organization}`, actor };
    case 'organization.activate': return { icon: 'organization', text: `Empresa activada: ${organization}`, actor };
    case 'organization.deactivate': return { icon: 'organization', text: `Empresa desactivada: ${organization}`, actor };
    case 'organization.set_types': return { icon: 'organization', text: `Tipos actualizados: ${organization}`, actor };
    case 'invitation.create': return { icon: 'invitation', text: `Invitación enviada: ${invitee} → ${organization}`, actor };
    case 'invitation.revoke': return { icon: 'invitation', text: `Invitación revocada: ${organization}`, actor };
    case 'invitation.accept': return { icon: 'invitation', text: `Invitación aceptada: ${organization}`, actor };
    case 'membership.status_change': return { icon: 'membership', text: `Membresía ${MEMBERSHIP_STATUS_TEXT[detailText(item, 'to_status') ?? ''] ?? 'actualizada'}: ${target} en ${organization}`, actor };
    case 'global_role.grant': return { icon: 'role', text: `Rol concedido: ${role ? roleLabel(role) : 'global'} → ${target}`, actor };
    case 'global_role.revoke': return { icon: 'role', text: `Rol revocado: ${role ? roleLabel(role) : 'global'} → ${target}`, actor };
    case 'super_admin.invite': return { icon: 'invitation', text: `Superadministrador invitado: ${invitee}`, actor };
    case 'super_admin.invitation_revoke': return { icon: 'invitation', text: 'Invitación de superadministrador revocada', actor };
    case 'super_admin.accept': return { icon: 'person', text: `Superadministrador incorporado: ${actor}`, actor };
    case 'membership.delete': return { icon: 'membership', text: `Membresía eliminada: ${target} en ${organization}`, actor };
    case 'organization.logo_update': return { icon: 'organization', text: `Logo actualizado: ${organization}`, actor };
    case 'organization.logo_remove': return { icon: 'organization', text: `Logo quitado: ${organization}`, actor };
    case 'organization.profile_update': return { icon: 'organization', text: `Perfil actualizado: ${organization}`, actor };
    case 'organization.delete': return { icon: 'organization', text: `Empresa eliminada: ${organization}`, actor };
    case 'organization.restore': return { icon: 'organization', text: `Empresa restaurada: ${organization}`, actor };
    case 'organization.purge': return { icon: 'organization', text: `Empresa eliminada definitivamente: ${organization}`, actor };
    case 'user.update': return { icon: 'person', text: `Datos actualizados: ${target}`, actor };
    case 'organization_link.accepted': return { icon: 'organization', text: `Relación comercial aceptada: ${organization}`, actor };
    case 'organization_link.rejected': return { icon: 'organization', text: `Relación comercial rechazada: ${organization}`, actor };
    case 'organization_link.ended': return { icon: 'organization', text: `Relación comercial terminada: ${organization}`, actor };
    case 'external_counterpart.update': return { icon: 'organization', text: 'Contraparte externa actualizada', actor };
    case 'organization_link.requested': return { icon: 'organization', text: `Relación comercial solicitada: ${organization}`, actor };
    case 'organization_link.cancelled': return { icon: 'organization', text: `Relación comercial cancelada: ${organization}`, actor };
    case 'external_counterpart.create': return { icon: 'organization', text: 'Contraparte externa registrada', actor };
    case 'external_counterpart.deactivate': return { icon: 'organization', text: 'Contraparte externa desactivada', actor };
    case 'audit.retention_purge': return { icon: 'organization', text: `Auditoría depurada (anterior al ${cutoffDay(item) ?? 'plazo de retención'})`, actor };
    default: {
      const emissions = EMISSIONS_ACTIONS[item.action];
      const subject = emissions ? emissionsSubject(item) : null;

      return emissions ? { icon: 'organization', text: subject ? `${emissions.short}: ${subject}` : emissions.short, actor } : { icon: 'person', text: 'Acción administrativa', actor };
    }
  }
}

// ── Emisiones, histórico (`emissions.*`) ──

interface EmissionsAction { readonly phrase: string; readonly short: string; readonly tone: ActivityText['tone'] }

/** Los dos eventos históricos inmutables del antiguo módulo de metodologías y factores; el servidor solo registra el código. */
const EMISSIONS_ACTIONS: Readonly<Record<string, EmissionsAction>> = {
  'emissions.methodology_create': { phrase: 'creó una metodología', short: 'Metodología creada', tone: 'success' },
  'emissions.catalog_apply': { phrase: 'cargó el catálogo técnico de metodologías y factores', short: 'Catálogo técnico cargado', tone: 'info' },
};

const SUBJECT_KEYS: Readonly<Record<string, string>> = { 'emissions.methodology_create': 'methodology_code', 'emissions.catalog_apply': 'catalog_version' };

/** «GLEC_FUEL», con lo que el evento trae; sin datos no se inventa nada. */
function emissionsSubject(item: ActivityItem): string | null {
  return detailText(item, SUBJECT_KEYS[item.action]) ?? item.targetName;
}
