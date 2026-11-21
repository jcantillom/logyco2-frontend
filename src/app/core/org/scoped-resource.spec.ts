import { Subject, of } from 'rxjs';
import { ScopedResource } from './scoped-resource';

describe('ScopedResource: recarga en segundo plano', () => {
  it('sin datos previos pasa por «loading»', () => {
    const resource = new ScopedResource<number>();
    const pending = new Subject<number>();

    resource.load(pending, { keepData: true });

    expect(resource.status()).toBe('loading');
  });

  it('con datos previos y keepData conserva «ready» y los datos hasta que llega la respuesta', () => {
    const resource = new ScopedResource<number>();
    resource.load(of(1));
    const pending = new Subject<number>();

    resource.load(pending, { keepData: true });

    expect(resource.status()).toBe('ready');
    expect(resource.data()).toBe(1);
    pending.next(2);
    expect(resource.data()).toBe(2);
  });

  it('sin keepData siempre pasa por «loading» (comportamiento anterior)', () => {
    const resource = new ScopedResource<number>();
    resource.load(of(1));

    resource.load(new Subject<number>());

    expect(resource.status()).toBe('loading');
  });

  it('reset descarta los datos: la siguiente carga vuelve a mostrar «loading»', () => {
    const resource = new ScopedResource<number>();
    resource.load(of(1));
    resource.reset();

    resource.load(new Subject<number>(), { keepData: true });

    expect(resource.status()).toBe('loading');
  });
});
