import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { buildUser, FAKE_TOKEN, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { SessionStore } from '../auth/session.store';
import { ContextResetRegistry } from './context-reset';
import { OrganizationContext } from './organization-context';
import { ScopedResource } from './scoped-resource';

describe('OrganizationContext y limpieza de contexto', () => {
  let context: OrganizationContext;
  let registry: ContextResetRegistry;

  beforeEach(() => {
    const session = TestBed.inject(SessionStore);
    session.setToken(FAKE_TOKEN);
    session.setUser(buildUser());
    context = TestBed.inject(OrganizationContext);
    registry = TestBed.inject(ContextResetRegistry);
  });

  it('por defecto activa la primera membresía', () => {
    expect(context.activeOrganizationId()).toBe(ORG_ENVIA.id);
  });

  it('select cambia la empresa activa', () => {
    expect(context.select(ORG_COORDINADORA.id)).toBeTrue();
    expect(context.activeMembership()?.organization.name).toBe('Coordinadora');
  });

  it('rechaza seleccionar una empresa sin membresía', () => {
    expect(context.select('00000000-0000-4000-8000-000000000000')).toBeFalse();
    expect(context.activeOrganizationId()).toBe(ORG_ENVIA.id);
  });

  it('seleccionar la misma empresa no descarta estado', () => {
    const resource = registry.track(new ScopedResource<string>());
    resource.data.set('datos de ENVIA');
    expect(context.select(ORG_ENVIA.id)).toBeFalse();
    expect(resource.data()).toBe('datos de ENVIA');
  });

  it('al cambiar de empresa se descarta TODO el estado registrado', () => {
    const a = registry.track(new ScopedResource<string>());
    const b = registry.track(new ScopedResource<number>());
    a.data.set('datos de ENVIA');
    a.status.set('ready');
    b.data.set(42);

    context.select(ORG_COORDINADORA.id);

    expect(a.data()).toBeNull();
    expect(a.status()).toBe('idle');
    expect(b.data()).toBeNull();
  });

  it('una respuesta tardía de la empresa anterior se descarta', () => {
    const pending = new Subject<string>();
    const resource = registry.track(new ScopedResource<string>());
    resource.load(pending);
    expect(resource.status()).toBe('loading');

    context.select(ORG_COORDINADORA.id);
    pending.next('datos de ENVIA llegando tarde');

    expect(resource.data()).toBeNull();
    expect(resource.status()).toBe('idle');
  });

  it('clear() (cierre de sesión) también limpia el estado', () => {
    const resource = registry.track(new ScopedResource<string>());
    resource.data.set('x');
    context.clear();
    expect(resource.data()).toBeNull();
  });

  it('sin membresías no hay empresa activa', () => {
    TestBed.inject(SessionStore).setUser(buildUser({ memberships: [] }));
    expect(context.hasOrganizations()).toBeFalse();
    expect(context.activeOrganizationId()).toBeNull();
  });

  it('markAccessLost afecta solo a la empresa indicada', () => {
    context.markAccessLost(ORG_COORDINADORA.id);
    expect(context.activeAccessLost()).toBeFalse();
    context.select(ORG_COORDINADORA.id);
    expect(context.activeAccessLost()).toBeTrue();
  });
});

describe('ScopedResource', () => {
  it('expone el error ya interpretado', () => {
    const resource = new ScopedResource<string>();
    const source = new Subject<string>();
    resource.load(source);
    source.error(new Error('boom'));

    expect(resource.status()).toBe('error');
    expect(resource.error()?.kind).toBe('unknown');
  });

  it('una carga nueva cancela la anterior', () => {
    const resource = new ScopedResource<string>();
    const first = new Subject<string>();
    const second = new Subject<string>();
    resource.load(first);
    resource.load(second);

    first.next('viejo');
    second.next('nuevo');

    expect(resource.data()).toBe('nuevo');
    expect(first.observed).toBeFalse();
  });
});
