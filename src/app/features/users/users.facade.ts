import { Injectable, inject, signal } from '@angular/core';
import { Observable, forkJoin, map, tap } from 'rxjs';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { ScopedResource } from '../../core/org/scoped-resource';
import { DEFAULT_PAGE_REQUEST, Page } from '../../domain/models/pagination';
import {
  Invitation,
  ManagedUser,
  MembershipRecord,
  MembershipStatus,
  MembershipTargetStatus,
  UserListFilter,
  UserUpdate,
} from '../../domain/models/users';
import {
  InvitationsRepository,
  MembershipsRepository,
  UsersRepository,
} from '../../domain/repositories/identity.repositories';

/** Conteos reales del servidor (total de cada consulta), no de la página visible. */
export interface UsersCounts {
  readonly active: number;
  readonly pending: number;
  readonly suspended: number;
  readonly pendingInvitations: number;
}

@Injectable({ providedIn: 'root' })
export class UsersFacade {
  private readonly users = inject(UsersRepository);
  private readonly invitationsRepo = inject(InvitationsRepository);
  private readonly memberships = inject(MembershipsRepository);
  private readonly registry = inject(ContextResetRegistry);

  readonly usersPage = signal(DEFAULT_PAGE_REQUEST.page);
  readonly invitationsPage = signal(DEFAULT_PAGE_REQUEST.page);
  readonly userList = this.registry.track(new ScopedResource<Page<ManagedUser>>());
  readonly invitationList = this.registry.track(new ScopedResource<Page<Invitation>>());
  readonly counts = this.registry.track(new ScopedResource<UsersCounts>());
  /** Hasta 20 personas de la empresa, de las que el resumen sortea 3 para mostrar. */
  readonly preview = this.registry.track(new ScopedResource<Page<ManagedUser>>());

  loadPreview(): void {
    this.preview.load(this.users.list({ page: 1, pageSize: 20 }));
  }
  /** Búsqueda y filtros de la tabla; se aplican en el servidor. */
  readonly filter = signal<UserListFilter>({});
  /** Registros por página de la tabla de usuarios (fijo). */
  readonly usersPageSize = 6;

  setFilter(filter: UserListFilter): void {
    this.filter.set(filter);
    this.loadUsers(1);
  }

  loadUsers(page = this.usersPage()): void {
    this.usersPage.set(page);
    this.userList.load(this.users.list({ page, pageSize: this.usersPageSize }, this.filter()));
  }

  loadCounts(): void {
    const total = (status: MembershipStatus) =>
      this.users.list({ page: 1, pageSize: 1 }, { membershipStatus: status }).pipe(map((page) => page.total));

    this.counts.load(
      forkJoin({
        active: total('ACTIVE'),
        pending: total('PENDING'),
        suspended: total('SUSPENDED'),
        pendingInvitations: this.invitationsRepo.list({ page: 1, pageSize: 1 }, { status: 'PENDING' }).pipe(map((page) => page.total)),
      }),
    );
  }

  loadInvitations(page = this.invitationsPage()): void {
    this.invitationsPage.set(page);
    this.invitationList.load(
      this.invitationsRepo.list({ page, pageSize: DEFAULT_PAGE_REQUEST.pageSize }),
    );
  }

  revokeInvitation(invitationId: string): Observable<Invitation> {
    return this.invitationsRepo.revoke(invitationId).pipe(tap(() => { this.loadInvitations(); this.loadCounts(); }));
  }

  updateUser(userId: string, changes: UserUpdate): Observable<ManagedUser> {
    return this.users.update(userId, changes).pipe(tap(() => this.loadUsers()));
  }

  removeMembership(organizationId: string, membershipId: string): Observable<void> {
    return this.memberships.remove(organizationId, membershipId).pipe(tap(() => { this.loadUsers(); this.loadCounts(); }));
  }

  changeMembershipStatus(
    organizationId: string,
    membershipId: string,
    status: MembershipTargetStatus,
  ): Observable<MembershipRecord> {
    return this.memberships
      .changeStatus(organizationId, membershipId, status)
      .pipe(tap(() => { this.loadUsers(); this.loadCounts(); }));
  }
}
