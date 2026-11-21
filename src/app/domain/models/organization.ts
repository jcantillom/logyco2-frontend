export interface OrganizationTypeRef {
  readonly code: string;
  readonly name: string;
}

/** Tipo del catálogo (p. ej. Transportador, Generador de carga). Una empresa puede tener varios. */
export interface OrganizationTypeInfo extends OrganizationTypeRef {
  readonly description: string | null;
}

/** Atajos de gestión que resuelve el servidor (coinciden con `attention` del API). */
export type OrganizationFocus = 'without_admin' | 'with_invitations' | 'without_type';
export type OrganizationSort = 'name' | 'created_at' | 'status';
export type SortOrder = 'asc' | 'desc';

/** Criterios de una página de empresas: búsqueda, filtros y orden se aplican SIEMPRE en el servidor. */
export interface OrganizationListFilter {
  /** `true` lista solo las eliminadas (borrado lógico; solo la plataforma las ve). */
  readonly deleted?: boolean;
  readonly search?: string;
  readonly isActive?: boolean;
  readonly typeCode?: string;
  readonly focus?: OrganizationFocus;
  readonly sort?: OrganizationSort;
  readonly order?: SortOrder;
}

export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly legalName: string | null;
  readonly taxId: string | null;
  /** Perfil NO sensible: lo mantiene el administrador de la propia empresa. */
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly website: string | null;
  /** Huella corta del logo (`null` si no tiene): la imagen se pide solo cuando esta versión cambia. */
  readonly logoVersion: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Borrado lógico: la empresa está oculta y se puede restaurar. */
  readonly deletedAt: Date | null;
  readonly types: readonly OrganizationTypeRef[];
  /** Administradores (ORG_ADMIN) con acceso hoy; `null` si el backend no lo informa (respuestas de modificación). */
  readonly activeAdmins: number | null;
  /** Invitaciones pendientes vigentes; `null` si no se informa. */
  readonly pendingInvitations: number | null;
}

/** Cambios parciales: solo los campos presentes se envían; `null` borra el valor. */
export interface OrganizationChanges {
  readonly name?: string;
  readonly legalName?: string | null;
  readonly taxId?: string | null;
}

/** Perfil que edita el administrador de la empresa (nombre y contacto): lo sensible solo lo cambia la plataforma. `null` borra el valor. */
export interface OrganizationProfileChanges {
  readonly name?: string;
  readonly contactEmail?: string | null;
  readonly contactPhone?: string | null;
  readonly address?: string | null;
  readonly city?: string | null;
  readonly website?: string | null;
}

/** Relación COMERCIAL entre empresas. No es una membresía de usuario. */
export interface CommercialRelationship {
  readonly id: string;
  readonly counterpart: { readonly id: string; readonly name: string };
  /** Rol de la empresa consultada dentro de la relación. */
  readonly role: 'PROVIDER' | 'CLIENT';
  readonly relationshipType: string;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly isActive: boolean;
}

/** Qué se eliminaría con una empresa (vista previa que calcula el backend). */
export interface OrganizationDeletionPlan {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly isActive: boolean;
  readonly deleted: boolean;
  readonly usersToDelete: number;
  /** Miembros con otras empresas o rol global: conservan su cuenta y solo pierden esta membresía. */
  readonly usersKept: number;
  readonly memberships: number;
  readonly invitations: number;
  readonly relationships: number;
}

export interface OrganizationDeleted {
  /** `true` = eliminación definitiva (irreversible); `false` = lógica (restaurable). */
  readonly permanent: boolean;
  readonly organizationName: string;
  readonly usersDeleted: number;
  readonly usersKept: number;
  readonly membershipsDeleted: number;
  readonly invitationsDeleted: number;
  readonly relationshipsDeleted: number;
}

