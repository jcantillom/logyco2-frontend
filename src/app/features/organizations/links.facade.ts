import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import {
  ExternalCounterpart,
  ExternalCounterpartChanges,
  Link,
  LinkCandidate,
  LinkDetail,
  LinkSummary,
  LinkView,
  NewExternalCounterpart,
  NewLink,
} from '../../domain/models/links';
import { Page } from '../../domain/models/pagination';
import { LinksRepository } from '../../domain/repositories/links.repository';

const PAGE_SIZE = 10;

/** Estado y acciones de las empresas vinculadas de la empresa activa. Cada acción refresca lo que cambia (conteos, lista y detalle). */
@Injectable({ providedIn: 'root' })
export class LinksFacade {
  private readonly repository = inject(LinksRepository);
  private readonly context = inject(OrganizationContext);
  private readonly registry = inject(ContextResetRegistry);

  readonly summary = this.registry.track(new ScopedResource<LinkSummary>());
  readonly list = this.registry.track(new ScopedResource<Page<Link>>());
  readonly detail = this.registry.track(new ScopedResource<LinkDetail>());
  readonly candidates = this.registry.track(new ScopedResource<readonly LinkCandidate[]>());
  readonly external = this.registry.track(new ScopedResource<Page<ExternalCounterpart>>());

  readonly view = signal<LinkView>('active');
  readonly search = signal('');
  readonly page = signal(1);
  readonly externalSearch = signal('');
  readonly externalPage = signal(1);

  private get organizationId(): string | null {
    return this.context.activeOrganizationId();
  }

  loadSummary(): void {
    const id = this.organizationId;

    if (!id) return this.summary.reset();

    this.summary.load(this.repository.summary(id), { keepData: true });
  }

  loadList(options: { view?: LinkView; page?: number; search?: string } = {}): void {
    const id = this.organizationId;

    if (!id) return this.list.reset();

    if (options.view !== undefined && options.view !== this.view()) {
      this.view.set(options.view);
      this.page.set(1);
      this.search.set('');
    }

    if (options.search !== undefined) {
      this.search.set(options.search);
      this.page.set(1);
    }

    if (options.page !== undefined) this.page.set(options.page);

    this.list.load(this.repository.list(id, { page: this.page(), pageSize: PAGE_SIZE }, { view: this.view(), search: this.search() }));
  }

  loadExternal(options: { page?: number; search?: string } = {}): void {
    const id = this.organizationId;

    if (!id) return this.external.reset();

    if (options.search !== undefined) {
      this.externalSearch.set(options.search);
      this.externalPage.set(1);
    }

    if (options.page !== undefined) this.externalPage.set(options.page);

    this.external.load(this.repository.listExternal(id, { page: this.externalPage(), pageSize: PAGE_SIZE }, this.externalSearch()));
  }

  openDetail(linkId: string): void {
    const id = this.organizationId;

    if (id) this.detail.load(this.repository.get(id, linkId));
  }

  searchCandidates(query: string): void {
    const id = this.organizationId;

    if (id) this.candidates.load(this.repository.search(id, query));
  }

  clearCandidates(): void {
    this.candidates.reset();
  }

  /** Solicita un vínculo (queda pendiente hasta que la otra empresa responda). */
  request(link: NewLink): Observable<Link> {
    return this.repository.request(this.requireId(), link).pipe(tap(() => this.refresh()));
  }

  respond(linkId: string, action: 'accept' | 'reject' | 'cancel' | 'end', note?: string): Observable<Link> {
    return this.repository.respond(this.requireId(), linkId, action, note).pipe(
      tap(() => {
        this.refresh();

        if (this.detail.data()?.id === linkId) this.openDetail(linkId);
      }),
    );
  }

  createExternal(counterpart: NewExternalCounterpart): Observable<ExternalCounterpart> {
    return this.repository.createExternal(this.requireId(), counterpart).pipe(tap(() => this.refreshExternal()));
  }

  updateExternal(counterpartId: string, changes: ExternalCounterpartChanges): Observable<ExternalCounterpart> {
    return this.repository.updateExternal(this.requireId(), counterpartId, changes).pipe(tap(() => this.refreshExternal()));
  }

  removeExternal(counterpartId: string): Observable<void> {
    return this.repository.removeExternal(this.requireId(), counterpartId).pipe(tap(() => this.refreshExternal()));
  }

  private refresh(): void {
    this.loadSummary();

    if (this.list.status() !== 'idle') this.list.load(this.repository.list(this.requireId(), { page: this.page(), pageSize: PAGE_SIZE }, { view: this.view(), search: this.search() }), { keepData: true });
  }

  private refreshExternal(): void {
    this.loadSummary();

    if (this.external.status() !== 'idle') this.loadExternal();
  }

  private requireId(): string {
    const id = this.organizationId;

    if (!id) throw new Error('Sin empresa activa');

    return id;
  }
}
