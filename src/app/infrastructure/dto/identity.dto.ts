/** DTOs tal como los serializa el backend (snake_case). Ver los `schema.py` de cada app del backend. */
export interface RoleReferenceDto {
  readonly code: string;
  readonly name: string;
}

export interface OrganizationReferenceDto {
  readonly id: string;
  readonly name: string;
}

export interface MembershipContextDto {
  readonly membership_id: string;
  readonly organization: OrganizationReferenceDto;
  readonly roles: readonly RoleReferenceDto[];
}

export interface MeResponseDto {
  readonly id: string;
  readonly full_name: string;
  readonly email: string;
  readonly is_active: boolean;
  readonly global_roles: readonly RoleReferenceDto[];
  readonly memberships: readonly MembershipContextDto[];
  readonly session_expires_at?: string | null;
}

export interface LoginRequestDto {
  readonly email: string;
  readonly password: string;
}

export interface LoginResponseDto {
  /** Siempre `null` para el navegador: la sesión es la cookie HttpOnly. Solo los clientes de API lo piden (`X-Client-Type: api`). */
  readonly access_token: string | null;
  readonly token_type: string;
  readonly expiration_time_utc_bogota: string | null;
}

export interface OrganizationDto {
  readonly id: string;
  readonly name: string;
  readonly legal_name: string | null;
  readonly tax_id: string | null;
  readonly contact_email?: string | null;
  readonly contact_phone?: string | null;
  readonly address?: string | null;
  readonly city?: string | null;
  readonly website?: string | null;
  readonly logo_version?: string | null;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at?: string | null;
  /** Ausente en respuestas de versiones anteriores del backend. */
  readonly types?: readonly { readonly code: string; readonly name: string }[];
  readonly active_admins?: number | null;
  readonly pending_invitations?: number | null;
}

export interface OrganizationTypeDto {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
}

export interface OrganizationRelationshipDto {
  readonly id: string;
  readonly counterpart: { readonly id: string; readonly name: string };
  readonly role: 'PROVIDER' | 'CLIENT';
  readonly relationship_type: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly is_active: boolean;
}

export interface PlatformMetricsDto {
  readonly organizations: {
    readonly total: number;
    readonly active: number;
    readonly inactive: number;
    readonly without_active_admin: number;
    readonly without_type: number;
    readonly with_pending_invitations?: number;
    readonly deleted?: number;
    readonly by_type: readonly { readonly code: string; readonly name: string; readonly count: number }[];
  };
  readonly users: { readonly total: number; readonly active: number };
  readonly memberships: { readonly pending: number; readonly active: number };
  readonly invitations: { readonly pending: number };
  readonly super_admins?: {
    readonly active: number;
    readonly max_active: number;
    readonly reserved_by_invitations: number;
    readonly available: number;
  };
  readonly generated_at: string;
}

export interface MembershipViewDto {
  readonly membership_id: string;
  /** `logo_version` ausente en versiones anteriores del backend. */
  readonly organization: OrganizationReferenceDto & { readonly logo_version?: string | null };
  readonly status: string;
  readonly roles: readonly string[];
}

export interface UserSummaryDto {
  readonly id: string;
  readonly full_name: string;
  readonly email: string;
  readonly is_active: boolean;
  /** Ausente en versiones anteriores del backend. */
  readonly last_login_at?: string | null;
  readonly memberships: readonly MembershipViewDto[];
  /** Solo la entrega a administradores de plataforma; ausente en versiones anteriores. */
  readonly global_roles?: readonly string[];
}

export interface InvitationDto {
  readonly id: string;
  readonly organization: OrganizationReferenceDto;
  readonly email: string;
  readonly invitee_name: string | null;
  readonly role_code: string;
  readonly status: string;
  readonly expires_at: string;
  readonly created_at: string;
  readonly accepted_at: string | null;
}

export interface InvitationCreatedDto extends InvitationDto {
  readonly code: string;
}

export interface InvitationCreateDto {
  readonly organization_id: string;
  readonly email: string;
  readonly role_code: string;
  readonly invitee_name?: string;
  readonly expires_in_days?: number;
}

export interface InvitationAcceptedDto {
  readonly membership_id: string;
  readonly organization: OrganizationReferenceDto;
  readonly role_code: string;
  readonly status: string;
}

export interface MembershipDto {
  readonly id: string;
  readonly user_id: string;
  readonly organization_id: string;
  readonly status: string;
}
