import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { FOOTPRINT_URL, bucketDto, footprintDto } from '../../../testing/footprint';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { FootprintFacade } from './footprint.facade';

describe('FootprintFacade', () => {
  let facade: FootprintFacade;
  let http: HttpTestingController;
  const request = (): TestRequest => http.expectOne((r) => r.url === FOOTPRINT_URL);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    facade = TestBed.inject(FootprintFacade);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.match(() => true));

  it('un periodo pide la huella con from y to, pasa por «cargando» y deja el dominio en `footprint`', () => {
    facade.load({ from: '2026-10-01', to: '2026-11-30' });
    const r = request();

    expect(facade.footprint.status()).toBe('loading');
    expect([r.request.params.get('from'), r.request.params.get('to')]).toEqual(['2026-10-01', '2026-11-30']);
    r.flush({ data: footprintDto() });
    expect(facade.footprint.status()).toBe('ready');
    expect(facade.footprint.data()?.totals.tripsCalculated).toBe(12);
  });

  it('«todos» no envía from ni to', () => {
    facade.load('ALL');
    const r = request();

    expect(r.request.params.has('from') || r.request.params.has('to')).toBeFalse();
    r.flush({ data: footprintDto() });
  });

  it('cambiar de periodo vuelve a pedir y muestra «cargando» otra vez', () => {
    facade.load({ from: '2026-10-01', to: '2026-11-30' });
    request().flush({ data: footprintDto() });
    facade.load({ from: '2026-01-01', to: '2026-03-31' });

    expect(facade.footprint.status()).toBe('loading');
    expect(request().request.params.get('from')).toBe('2026-01-01');
  });

  it('con `background` conserva los datos y no pasa por «cargando» (renovación sin parpadeo)', () => {
    facade.load('ALL');
    request().flush({ data: footprintDto() });
    facade.reload({ background: true });

    expect(facade.footprint.status()).toBe('ready');
    request().flush({ data: footprintDto({ totals: { ...footprintDto().totals, trips_calculated: 13 } }) });
    expect(facade.footprint.data()?.totals.tripsCalculated).toBe(13);
  });

  it('un error queda en `error` y `reload` reintenta con el último periodo pedido', () => {
    facade.load({ from: '2026-10-01', to: '2026-11-30' });
    request().flush({ error: { code: 'X' } }, { status: 500, statusText: 'Server Error' });

    expect(facade.footprint.status()).toBe('error');
    facade.reload();
    const r = request();

    expect(r.request.params.get('from')).toBe('2026-10-01');
    r.flush({ data: footprintDto() });
    expect(facade.footprint.status()).toBe('ready');
  });

  it('al cambiar de empresa se limpia la huella', () => {
    facade.load('ALL');
    request().flush({ data: footprintDto() });
    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);

    expect(facade.footprint.data()).toBeNull();
  });

  it('sin empresa activa no pide nada', () => {
    TestBed.inject(SessionStore).setUser(buildUser({ memberships: [] }));
    facade.load('ALL');

    http.expectNone((r) => r.url === FOOTPRINT_URL);
    expect(facade.footprint.status()).toBe('idle');
  });

  describe('granularidad', () => {
    const PERIOD = { from: '2026-01-01', to: '2026-12-31' };
    const tooFine = { error: { code: 'GRANULARITY_TOO_FINE', message: 'El periodo tiene 365 días: la serie diaria admite hasta 400.' } };

    it('por defecto es mensual y la petición es la de siempre (sin parámetro granularity)', () => {
      expect(facade.granularity()).toBe('month');
      facade.load(PERIOD);
      const r = request();

      expect(r.request.params.has('granularity')).toBeFalse();
      r.flush({ data: footprintDto() });
    });

    it('cambiar la granularidad pide de nuevo con el parámetro y el mismo periodo, pasando por «cargando»', () => {
      facade.load(PERIOD);
      request().flush({ data: footprintDto() });
      facade.setGranularity('week');

      expect(facade.footprint.status()).toBe('loading');
      const r = request();

      expect([r.request.params.get('granularity'), r.request.params.get('from'), r.request.params.get('to')]).toEqual(['week', '2026-01-01', '2026-12-31']);
      r.flush({ data: footprintDto({ granularity: 'week', series: [bucketDto()], series_total_kg: 1520.25 }) });
      expect(facade.footprint.data()?.series.length).toBe(1);
      expect(facade.footprint.data()?.seriesTotalKg).toBe(1520.25);
    });

    it('elegir la misma granularidad no pide nada', () => {
      facade.load(PERIOD);
      request().flush({ data: footprintDto() });
      facade.setGranularity('month');

      expect(http.match(() => true).length).toBe(0);
    });

    it('antes de la primera petición solo se recuerda (no hay tormenta de peticiones) y la primera ya lleva la granularidad', () => {
      facade.setGranularity('quarter');

      expect(http.match(() => true).length).toBe(0);
      facade.load(PERIOD);
      const r = request();

      expect(r.request.params.get('granularity')).toBe('quarter');
      r.flush({ data: footprintDto({ granularity: 'quarter' }) });
    });

    it('un cambio rápido cancela la petición anterior: solo la última escribe en el estado', () => {
      facade.load(PERIOD);
      request().flush({ data: footprintDto() });
      facade.setGranularity('week');
      const first = request();

      facade.setGranularity('quarter');
      const second = request();

      expect(first.cancelled).toBeTrue();
      second.flush({ data: footprintDto({ granularity: 'quarter', series: [bucketDto({ key: '2026-Q1' })] }) });
      expect(facade.footprint.data()?.granularity).toBe('quarter');
    });

    it('cambiar de periodo conserva la granularidad y la manda en la nueva petición', () => {
      facade.setGranularity('week');
      facade.load(PERIOD);
      request().flush({ data: footprintDto({ granularity: 'week' }) });
      facade.load({ from: '2026-03-01', to: '2026-03-31' });
      const r = request();

      expect([r.request.params.get('granularity'), r.request.params.get('from')]).toEqual(['week', '2026-03-01']);
      r.flush({ data: footprintDto({ granularity: 'week' }) });
    });

    it('la renovación en segundo plano conserva la granularidad y los datos', () => {
      facade.setGranularity('week');
      facade.load(PERIOD);
      request().flush({ data: footprintDto({ granularity: 'week' }) });
      facade.reload({ background: true });

      expect(facade.footprint.status()).toBe('ready');
      expect(request().request.params.get('granularity')).toBe('week');
    });

    describe('GRANULARITY_TOO_FINE (422)', () => {
      it('vuelve a la última granularidad válida, avisa con el mensaje en español del catálogo y no deja el recurso en error', () => {
        facade.load(PERIOD);
        request().flush({ data: footprintDto() });
        facade.setGranularity('week');
        request().flush({ data: footprintDto({ granularity: 'week' }) });
        facade.setGranularity('day');
        request().flush(tooFine, { status: 422, statusText: 'Unprocessable' });
        const retry = request();

        expect(retry.request.params.get('granularity')).toBe('week');
        retry.flush({ data: footprintDto({ granularity: 'week', series: [bucketDto()] }) });
        expect(facade.granularity()).toBe('week');
        expect(facade.footprint.status()).toBe('ready');
        expect(facade.notice()).toBe('El periodo es demasiado largo para ver la serie diaria. Elige granularidad semanal o mensual, o un periodo más corto.');
        expect(facade.notice()).not.toContain('365');
      });

      it('sin una granularidad previa válida vuelve a la mensual (y no pide `granularity`)', () => {
        facade.setGranularity('day');
        facade.load(PERIOD);
        request().flush(tooFine, { status: 422, statusText: 'x' });
        const retry = request();

        expect(retry.request.params.has('granularity')).toBeFalse();
        retry.flush({ data: footprintDto() });
        expect(facade.granularity()).toBe('month');
      });

      it('recuerda cuántos días rechazó y deshabilita «Diario» desde ahí (el tope no está quemado en el cliente)', () => {
        facade.setGranularity('day');
        facade.load(PERIOD);
        request().flush(tooFine, { status: 422, statusText: 'x' });
        request().flush({ data: footprintDto() });

        expect(facade.refusedFromDays()).toEqual({ day: 365 });
        expect(facade.disabledGranularities()).toEqual(['day']);
        facade.load({ from: '2026-03-01', to: '2026-03-31' });
        request().flush({ data: footprintDto({ period: { from: '2026-03-01', to: '2026-03-31' } }) });
        expect(facade.disabledGranularities()).toEqual([]);
        facade.load({ from: '2025-01-01', to: '2026-12-31' });
        request().flush({ data: footprintDto({ period: { from: '2025-01-01', to: '2026-12-31' } }) });
        expect(facade.disabledGranularities()).toEqual(['day']);
      });

      it('antes de cualquier rechazo «Diario» está habilitado, sea cual sea el periodo', () => {
        facade.load({ from: '2000-01-01', to: '2026-12-31' });
        request().flush({ data: footprintDto() });

        expect(facade.disabledGranularities()).toEqual([]);
      });

      it('el aviso se limpia al cambiar de granularidad o de periodo', () => {
        facade.setGranularity('day');
        facade.load(PERIOD);
        request().flush(tooFine, { status: 422, statusText: 'x' });
        request().flush({ data: footprintDto() });
        expect(facade.notice()).not.toBeNull();
        facade.setGranularity('quarter');
        expect(facade.notice()).toBeNull();
        request().flush({ data: footprintDto({ granularity: 'quarter' }) });
      });
    });

    it('otros errores (500, INVALID_GRANULARITY) NO hacen fallback: quedan en error con su mensaje y «Reintentar» vuelve a pedir la misma granularidad', () => {
      facade.load(PERIOD);
      request().flush({ data: footprintDto() });
      facade.setGranularity('week');
      request().flush({ error: { code: 'INVALID_GRANULARITY' } }, { status: 422, statusText: 'x' });

      expect(facade.footprint.status()).toBe('error');
      expect(facade.footprint.error()?.code).toBe('INVALID_GRANULARITY');
      expect(facade.granularity()).toBe('week');
      expect(facade.notice()).toBeNull();
      facade.reload();
      expect(request().request.params.get('granularity')).toBe('week');
    });

    it('un 422 GRANULARITY_TOO_FINE también aplica a otra granularidad (semana): vuelve a la última válida más gruesa y deshabilita la rechazada y las más finas', () => {
      facade.load(PERIOD);
      request().flush({ data: footprintDto() });
      facade.setGranularity('week');
      request().flush(tooFine, { status: 422, statusText: 'x' });
      const retry = request();

      expect(retry.request.params.has('granularity')).toBeFalse();
      retry.flush({ data: footprintDto() });
      expect(facade.granularity()).toBe('month');
      expect(facade.refusedFromDays()).toEqual({ week: 365 });
      expect(facade.disabledGranularities()).toEqual(['day', 'week']);
      expect(facade.notice()).toContain('demasiado largo');
    });

    it('si la granularidad de respaldo también es rechazada baja a la siguiente más gruesa hasta que una responda', () => {
      facade.setGranularity('day');
      facade.load(PERIOD);
      request().flush(tooFine, { status: 422, statusText: 'x' });
      request().flush(tooFine, { status: 422, statusText: 'x' });
      const last = request();

      expect(last.request.params.get('granularity')).toBe('quarter');
      last.flush({ data: footprintDto({ granularity: 'quarter' }) });
      expect(facade.granularity()).toBe('quarter');
      expect(facade.disabledGranularities()).toEqual(['day', 'week', 'month']);
      expect(facade.footprint.status()).toBe('ready');
    });

    it('«Anual» no tiene más gruesa: si se rechaza queda en error, sin bucle', () => {
      facade.setGranularity('year');
      facade.load(PERIOD);
      request().flush(tooFine, { status: 422, statusText: 'x' });

      expect(facade.footprint.status()).toBe('error');
      expect(facade.footprint.error()?.code).toBe('GRANULARITY_TOO_FINE');
    });

    it('un periodo más corto vuelve a habilitar lo rechazado', () => {
      facade.setGranularity('week');
      facade.load({ from: '2000-01-01', to: '2099-12-31' });
      request().flush(tooFine, { status: 422, statusText: 'x' });
      request().flush({ data: footprintDto({ period: { from: '2000-01-01', to: '2099-12-31' } }) });
      expect(facade.disabledGranularities()).toEqual(['day', 'week']);
      facade.load(PERIOD);
      request().flush({ data: footprintDto() });
      expect(facade.disabledGranularities()).toEqual([]);
    });

    it('INVALID_PERIOD avisa con el mensaje del catálogo y conserva los datos anteriores (estado «listo», sin error)', () => {
      facade.load(PERIOD);
      request().flush({ data: footprintDto({ totals: { ...footprintDto().totals, trips_calculated: 99 } }) });
      facade.load({ from: '1900-01-01', to: '2999-12-31' });
      request().flush({ error: { code: 'INVALID_PERIOD', message: 'x' } }, { status: 422, statusText: 'x' });

      expect(facade.footprint.status()).toBe('ready');
      expect(facade.footprint.data()?.totals.tripsCalculated).toBe(99);
      expect(facade.notice()).toBe('El periodo no es válido: indica la fecha inicial y la final, y que la inicial no sea posterior.');
    });

    it('INVALID_PERIOD sin datos previos queda en error (no hay nada que conservar)', () => {
      facade.load({ from: '1900-01-01', to: '2999-12-31' });
      request().flush({ error: { code: 'INVALID_PERIOD' } }, { status: 422, statusText: 'x' });

      expect(facade.footprint.status()).toBe('error');
      expect(facade.footprint.error()?.code).toBe('INVALID_PERIOD');
    });

    it('un 422 GRANULARITY_TOO_FINE con la granularidad más gruesa no activa el fallback', () => {
      facade.setGranularity('year');
      facade.load(PERIOD);
      request().flush(tooFine, { status: 422, statusText: 'x' });

      expect(facade.refusedFromDays()).toEqual({});
    });
  });
});
