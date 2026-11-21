import {
  ExternalCounterpart,
  Link,
  LinkCandidate,
  LinkCounterpart,
  LinkDetail,
  LinkEvent,
  LinkSummary,
} from '../../domain/models/links';
import {
  ExternalCounterpartDto,
  LinkCandidateDto,
  LinkCounterpartDto,
  LinkDetailDto,
  LinkDto,
  LinkEventDto,
  LinkSummaryDto,
} from '../dto/links.dto';

const date = (value: string | null): Date | null => (value ? new Date(value) : null);

function toCounterpart(dto: LinkCounterpartDto): LinkCounterpart {
  return {
    id: dto.id,
    name: dto.name,
    legalName: dto.legal_name,
    taxId: dto.tax_id,
    types: dto.types.map((t) => ({ code: t.code, name: t.name })),
    isActive: dto.is_active,
  };
}

export function toLink(dto: LinkDto): Link {
  return {
    id: dto.id,
    status: dto.status,
    relationshipType: dto.relationship_type,
    ourRole: dto.our_role,
    direction: dto.direction,
    counterpart: toCounterpart(dto.counterpart),
    requestedByOrganization: dto.requested_by_organization,
    requestNote: dto.request_note,
    responseNote: dto.response_note,
    endReason: dto.end_reason,
    startDate: date(dto.start_date),
    endDate: date(dto.end_date),
    createdAt: new Date(dto.created_at),
    respondedAt: date(dto.responded_at),
    endedAt: date(dto.ended_at),
    canAccept: dto.can_accept,
    canReject: dto.can_reject,
    canCancel: dto.can_cancel,
    canEnd: dto.can_end,
  };
}

function toEvent(dto: LinkEventDto): LinkEvent {
  return { at: new Date(dto.at), action: dto.action, byOrganization: dto.by_organization, actorName: dto.actor_name };
}

export function toLinkDetail(dto: LinkDetailDto): LinkDetail {
  return { ...toLink(dto), events: dto.events.map(toEvent) };
}

export function toLinkSummary(dto: LinkSummaryDto): LinkSummary {
  return { active: dto.active, pendingReceived: dto.pending_received, pendingSent: dto.pending_sent, external: dto.external };
}

export function toCandidate(dto: LinkCandidateDto): LinkCandidate {
  return {
    id: dto.id,
    name: dto.name,
    legalName: dto.legal_name,
    taxId: dto.tax_id,
    types: dto.types.map((t) => ({ code: t.code, name: t.name })),
    relation: dto.relation,
    linkId: dto.link_id ?? null,
  };
}

export function toExternal(dto: ExternalCounterpartDto): ExternalCounterpart {
  return {
    id: dto.id,
    name: dto.name,
    taxId: dto.tax_id,
    counterpartType: dto.counterpart_type,
    country: dto.country,
    relationshipType: dto.relationship_type,
    ourRole: dto.our_role,
    note: dto.note,
    isActive: dto.is_active,
    createdAt: new Date(dto.created_at),
    updatedAt: new Date(dto.updated_at),
  };
}
