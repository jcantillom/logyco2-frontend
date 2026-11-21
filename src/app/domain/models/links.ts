import { OrganizationTypeRef } from './organization';

export type LinkStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'CANCELLED' | 'ENDED';
export type LinkType = 'TRANSPORT_SERVICE' | 'SUBCONTRACTING' | 'OTHER_LOGISTICS';
/** Qué es la empresa que consulta en el vínculo: contratante del servicio o prestadora. */
export type OurRole = 'CONTRACTOR' | 'PROVIDER';
export type LinkView = 'active' | 'received' | 'sent' | 'history';
export type CounterpartType = 'SHIPPER' | 'CARRIER' | 'BOTH';

export const LINK_TYPES: readonly LinkType[] = ['TRANSPORT_SERVICE', 'SUBCONTRACTING', 'OTHER_LOGISTICS'];

export interface LinkCounterpart {
  readonly id: string;
  readonly name: string;
  readonly legalName: string | null;
  /** Completo solo con el vínculo vigente; antes llega enmascarado. */
  readonly taxId: string | null;
  readonly types: readonly OrganizationTypeRef[];
  readonly isActive: boolean;
}

export interface Link {
  readonly id: string;
  readonly status: LinkStatus;
  readonly relationshipType: string;
  readonly ourRole: OurRole;
  /** Quién lo inició, desde quien consulta. */
  readonly direction: 'SENT' | 'RECEIVED';
  readonly counterpart: LinkCounterpart;
  readonly requestedByOrganization: string | null;
  readonly requestNote: string | null;
  readonly responseNote: string | null;
  readonly endReason: string | null;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly createdAt: Date;
  readonly respondedAt: Date | null;
  readonly endedAt: Date | null;
  readonly canAccept: boolean;
  readonly canReject: boolean;
  readonly canCancel: boolean;
  readonly canEnd: boolean;
}

export interface LinkEvent {
  readonly at: Date;
  readonly action: 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'ENDED';
  readonly byOrganization: string | null;
  readonly actorName: string | null;
}

export interface LinkDetail extends Link {
  readonly events: readonly LinkEvent[];
}

export interface LinkSummary {
  readonly active: number;
  readonly pendingReceived: number;
  readonly pendingSent: number;
  readonly external: number;
}

export interface LinkCandidate {
  readonly id: string;
  readonly name: string;
  readonly legalName: string | null;
  readonly taxId: string | null;
  readonly types: readonly OrganizationTypeRef[];
  /** Relación abierta que ya existe (para no duplicarla). */
  readonly relation: 'NONE' | 'ACTIVE' | 'PENDING_SENT' | 'PENDING_RECEIVED';
  readonly linkId: string | null;
}

export interface NewLink {
  readonly counterpartOrganizationId: string;
  readonly relationshipType: LinkType;
  readonly ourRole: OurRole;
  readonly note?: string;
}

export interface LinkListFilter {
  readonly view: LinkView;
  readonly search?: string;
  readonly relationshipType?: LinkType;
}

export interface ExternalCounterpart {
  readonly id: string;
  readonly name: string;
  readonly taxId: string | null;
  readonly counterpartType: CounterpartType;
  readonly country: string;
  readonly relationshipType: string;
  readonly ourRole: OurRole;
  readonly note: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewExternalCounterpart {
  readonly name: string;
  readonly taxId?: string | null;
  readonly counterpartType: CounterpartType;
  readonly country: string;
  readonly relationshipType: LinkType;
  readonly ourRole: OurRole;
  readonly note?: string | null;
}

export type ExternalCounterpartChanges = Partial<NewExternalCounterpart>;
