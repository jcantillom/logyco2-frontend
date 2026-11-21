/** Modelos de la consola de plataforma con API: métricas administrativas y estado de servicios. */

export interface SuperAdminQuotaSummary {
  readonly active: number;
  readonly maxActive: number;
  readonly reservedByInvitations: number;
  readonly available: number;
}

// ── Métricas administrativas REALES (GET /platform/metrics, calculadas en PostgreSQL) ──
export interface PlatformAdminMetrics {
  readonly organizations: {
    readonly total: number;
    readonly active: number;
    readonly inactive: number;
    readonly withoutActiveAdmin: number;
    readonly withoutType: number;
    readonly withPendingInvitations: number;
    /** Eliminadas lógicamente (no cuentan en el resto de indicadores). */
    readonly deleted: number;
    readonly byType: readonly { readonly code: string; readonly name: string; readonly count: number }[];
  };
  readonly users: { readonly total: number; readonly active: number };
  readonly memberships: { readonly pending: number; readonly active: number };
  readonly invitations: { readonly pending: number };
  readonly superAdmins: SuperAdminQuotaSummary;
  readonly generatedAt: Date;
}

// ── Estado de servicios ──
export type ServiceStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'UNVERIFIED';
export interface ServiceHealth {
  readonly id: string;
  readonly name: string;
  readonly status: ServiceStatus;
  readonly checkedAt: Date | null;
  readonly detail: string;
}
