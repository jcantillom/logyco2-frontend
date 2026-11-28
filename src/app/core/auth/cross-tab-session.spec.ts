import { TestBed } from '@angular/core/testing';
import { CrossTabSession, SessionSignal } from './cross-tab-session';

describe('CrossTabSession', () => {
  afterEach(() => localStorage.clear());

  it('una pestaña recibe el aviso que publica otra (BroadcastChannel)', async () => {
    const receiver = TestBed.inject(CrossTabSession);
    const received: SessionSignal[] = [];
    receiver.listen((signal) => received.push(signal));

    const other = new BroadcastChannel('logyco2.session');
    other.postMessage('logout');
    other.postMessage('login');
    other.postMessage('otra-cosa');
    await new Promise((resolve) => setTimeout(resolve, 50));
    other.close();

    expect(received).toEqual(['logout', 'login']);
    receiver.ngOnDestroy();
  });

  it('publicar no entrega el aviso a la propia pestaña ni guarda nada en el almacenamiento', async () => {
    const tab = TestBed.inject(CrossTabSession);
    const received: SessionSignal[] = [];
    tab.listen((signal) => received.push(signal));

    tab.publish('login');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toEqual([]);
    expect(localStorage.length).toBe(0);
    tab.ngOnDestroy();
  });

  it('sin BroadcastChannel recurre al evento storage y solo transporta la palabra y una marca de tiempo', () => {
    // `typeof BroadcastChannel` se evalúa contra el global: se simula un navegador que no lo ofrece.
    const globalRef = globalThis as unknown as { BroadcastChannel?: unknown };
    const saved = globalRef.BroadcastChannel;
    delete globalRef.BroadcastChannel;

    try {
      const tab = TestBed.inject(CrossTabSession);
      const received: SessionSignal[] = [];
      tab.listen((signal) => received.push(signal));

      window.dispatchEvent(new StorageEvent('storage', { key: 'logyco2.session.signal', newValue: 'logout:123' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'otra', newValue: 'logout:123' }));
      tab.publish('login');

      expect(received).toEqual(['logout']);
      expect(localStorage.getItem('logyco2.session.signal')).toMatch(/^login:\d+$/);
      tab.ngOnDestroy();
    } finally {
      globalRef.BroadcastChannel = saved;
    }
  });
});
