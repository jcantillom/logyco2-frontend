export interface LinkCounterpartDto {
  readonly id: string;
  readonly name: string;
  readonly legal_name: string | null;
  readonly tax_id: string | null;
  readonly types: readonly { readonly code: string; readonly name: string }[];
  readonly is_active: boolean;
}

export interface LinkDto {
  readonly id: string;
  readonly status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'CANCELLED' | 'ENDED';
  readonly relationship_type: string;
  readonly our_role: 'CONTRACTOR' | 'PROVIDER';
  readonly direction: 'SENT' | 'RECEIVED';
  readonly counterpart: LinkCounterpartDto;
  readonly requested_by_organization: string | null;
  readonly request_note: string | null;
  readonly response_note: string | null;
  readonly end_reason: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly created_at: string;
  readonly responded_at: string | null;
  readonly ended_at: string | null;
  readonly can_accept: boolean;
  readonly can_reject: boolean;
  readonly can_cancel: boolean;
  readonly can_end: boolean;
}

export interface LinkEventDto {
  readonly at: string;
  readonly action: 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'ENDED';
  readonly by_organization: string | null;
  readonly actor_name: string | null;
}

export interface LinkDetailDto extends LinkDto {
  readonly events: readonly LinkEventDto[];
}

export interface LinkSummaryDto {
  readonly active: number;
  readonly pending_received: number;
  readonly pending_sent: number;
  readonly external: number;
}

export interface LinkCandidateDto {
  readonly id: string;
  readonly name: string;
  readonly legal_name: string | null;
  readonly tax_id: string | null;
  readonly types: readonly { readonly code: string; readonly name: string }[];
  readonly relation: 'NONE' | 'ACTIVE' | 'PENDING_SENT' | 'PENDING_RECEIVED';
  readonly link_id?: string | null;
}

export interface ExternalCounterpartDto {
  readonly id: string;
  readonly name: string;
  readonly tax_id: string | null;
  readonly counterpart_type: 'SHIPPER' | 'CARRIER' | 'BOTH';
  readonly country: string;
  readonly relationship_type: string;
  readonly our_role: 'CONTRACTOR' | 'PROVIDER';
  readonly note: string | null;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}
