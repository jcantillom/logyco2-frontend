import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Membership } from '../../domain/models/identity';
import { SessionStore } from '../auth/session.store';
import { ContextResetRegistry } from './context-reset';

/**
 * Empresa activa del usuario. Se deriva de las membresías de `/auth/me`;
 * seleccionar otra descarta todo el estado registrado en `ContextResetRegistry`.
 * Esto es contexto de interfaz: el aislamiento real lo aplica el backend.
 */
@Injectable({ providedIn: 'root' })
export class OrganizationContext {
  private readonly session = inject(SessionStore);
  private readonly registry = inject(ContextResetRegistry);

  private readonly selectedId = signal<string | null>(null);
  private readonly lostAccess = signal<ReadonlySet<string>>(new Set());

  readonly memberships = computed<readonly Membership[]>(
    () => this.session.user()?.memberships ?? [],
  );
  readonly activeMembership = computed<Membership | null>(() => {
    const list = this.memberships();
    return list.find((m) => m.organization.id === this.selectedId()) ?? list[0] ?? null;
  });
  readonly activeOrganizationId = computed(() => this.activeMembership()?.organization.id ?? null);
  readonly hasOrganizations = computed(() => this.memberships().length > 0);
  /** `true` si el backend negó el acceso a la empresa activa (revocada o inactiva). */
  readonly activeAccessLost = computed(() => {
    const id = this.activeOrganizationId();
    return id !== null && this.lostAccess().has(id);
  });

  select(organizationId: string): boolean {
    const target = this.memberships().find((m) => m.organization.id === organizationId);
    if (!target || target.organization.id === this.activeOrganizationId()) return false;
    this.selectedId.set(organizationId);
    this.registry.resetAll();
    return true;
  }

  markAccessLost(organizationId: string): void {
    this.lostAccess.update((current) => new Set(current).add(organizationId));
  }

  /** Limpia selección y estado asociado (cierre de sesión o cambio de usuario). */
  clear(): void {
    this.selectedId.set(null);
    this.lostAccess.set(new Set());
    this.registry.resetAll();
  }
}

/**
 * Ejecuta `load` ahora y cada vez que cambia la empresa activa.
 * Debe llamarse en un contexto de inyección (constructor de un componente).
 */
export function reloadOnContextChange(load: () => void): void {
  const context = inject(OrganizationContext);
  effect(() => {
    context.activeOrganizationId();
    untracked(load);
  });
}
