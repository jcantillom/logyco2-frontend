import { TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { createSecondTicker } from './imports.ticker';

describe('createSecondTicker', () => {
  it('no arranca solo, avanza cada segundo al activarse, no duplica el temporizador y se detiene al apagarse', fakeAsync(() => {
    const ticker = TestBed.runInInjectionContext(() => createSecondTicker());
    const start = ticker.now();

    tick(5000);
    expect(ticker.now()).toBe(start); // sin filas activas no hay temporizador

    ticker.setActive(true);
    ticker.setActive(true);
    const begin = ticker.now();

    tick(3000);
    expect(ticker.now() - begin).toBe(3000);

    ticker.setActive(false);
    const stopped = ticker.now();

    tick(5000);
    expect(ticker.now()).toBe(stopped);
  }));

  it('limpia el temporizador al destruirse el contexto', fakeAsync(() => {
    const ticker = TestBed.runInInjectionContext(() => createSecondTicker());

    ticker.setActive(true);
    tick(1000);
    TestBed.resetTestingModule(); // destruye el inyector: onDestroy detiene el intervalo (si no, fakeAsync fallaría por un temporizador pendiente)
    const frozen = ticker.now();

    tick(3000);
    expect(ticker.now()).toBe(frozen);
    discardPeriodicTasks();
  }));
});
