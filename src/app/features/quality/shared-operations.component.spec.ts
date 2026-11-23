import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { RECONCILIATION_URL, candidatesBody, conflictCandidateDto, operationDto, ownDeclarationDto, sharedCandidateDto, sharedCandidateDtos, visibleCandidateDto } from '../../../testing/reconciliation';
import { SessionStore } from '../../core/auth/session.store';
import { ToastService } from '../../core/notifications/toast.service';
import { SharedCandidateDto } from '../../infrastructure/dto/reconciliation.dto';
import { SharedOperationsComponent } from './shared-operations.component';
import { SharedOperationsFacade } from './shared-operations.facade';

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 25));

const componentCss = (marker: string): string =>
  Array.from(document.querySelectorAll('style'))
    .map((s) => (s.textContent ?? '').replace(/\[_ng(?:content|host)-[^\]]+\]/g, '').replace(/\s+/g, ' '))
    .filter((c) => c.includes(marker))
    .join('\n');

describe('SharedOperationsComponent: Operaciones compartidas', () => {
  let fixture: ComponentFixture<SharedOperationsComponent>;
  let http: HttpTestingController;
  const CANDIDATES = `${RECONCILIATION_URL}/candidates`;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string, index = 0): T | null => el().querySelectorAll<T>(selector)[index] ?? null;
  const qa = <T extends HTMLElement = HTMLElement>(selector: string): T[] => Array.from(el().querySelectorAll<T>(selector));
  const text = (selector: string, index = 0): string => (q(selector, index)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const listRequest = (): TestRequest => http.expectOne((r) => r.url === CANDIDATES && r.method === 'GET');
  const click = (selector: string, index = 0): void => {
    qa(selector)[index].click();
    fixture.detectChanges();
  };

  function render(items: readonly SharedCandidateDto[], total = items.length): void {
    TestBed.configureTestingModule({ imports: [SharedOperationsComponent], providers: provideTestApp() });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SharedOperationsFacade).load();
    http.expectOne((r) => r.url === CANDIDATES).flush(candidatesBody(items, total));
    fixture = TestBed.createComponent(SharedOperationsComponent);
    fixture.detectChanges();
  }

  afterEach(() => http?.match(() => true));

  describe('tarjeta sin consentimiento de la otra empresa', () => {
    it('muestra «Posible viaje compartido», el motivo, la frase de la regla y la declaración propia completa', () => {
      render([sharedCandidateDto()]);

      expect(text('[data-testid="shared-candidate"] h3')).toBe('Posible viaje compartido');
      expect(text('[data-testid="cand-reason"]')).toBe('Se identificó una operación potencialmente coincidente');
      expect(text('[data-testid="cand-why"]')).toBe('Coinciden fecha, placa y ruta; falta un identificador compartido.');
      expect(text('[data-testid="cand-state"]')).toContain('Posible coincidencia');
      expect(text('[data-testid="cand-strength"]')).toBe('Evidencia débil');

      const own = text('[data-testid="side-own"]');

      for (const expected of ['ABC123', 'Bogotá, D.C. → Medellín', 'Diésel', '300 gal', '415,5 km', '3.030 kg CO₂', 'Fila de tu archivo', '14 de oct de 2026']) expect(own).toContain(expected);
    });

    it('con la regla M1 dice «Coinciden el ID de servicio, la fecha y la placa» y muestra el ID de servicio propio', () => {
      render([sharedCandidateDto({ rule: 'M1', strength: 'STRONG', own: ownDeclarationDto({ service_id: 'SRV-77' }) })]);

      expect(text('[data-testid="cand-why"]')).toBe('Coinciden el ID de servicio, la fecha y la placa.');
      expect(text('[data-testid="cand-strength"]')).toBe('Evidencia fuerte');
      expect(text('[data-testid="side-own"]')).toContain('SRV-77');
    });

    it('del otro lado muestra solo el nombre de la empresa y qué campos coinciden o difieren, sin ningún valor ajeno', () => {
      render([sharedCandidateDto({ evidence: { matches: ['origin', 'destination', 'weight'], differs: ['consumption', 'kg_co2'] } })]);
      const other = text('[data-testid="side-other"]');

      expect(text('[data-testid="side-other"] h4')).toContain('Transportadora B');
      expect(other).toContain('No se muestran los valores de esta empresa');
      expect(qa('[data-testid="cand-matches"] .tag').map((t) => t.textContent!.trim())).toEqual(['Origen', 'Destino', 'Peso']);
      expect(qa('[data-testid="cand-differs"] .tag').map((t) => t.textContent!.trim())).toEqual(['≠Consumo', '≠Emisiones (kg CO₂)']);
      expect(qa('[data-testid="side-other"] dl').length).toBe(0);
      expect(qa('[data-testid="side-other"] dd').length).toBe(0);
      expect(other).not.toMatch(/\*\*\*|kg CO₂ \d|\d+ gal|\d+ km/);
    });

    it('lo que difiere se destaca en la declaración propia con «≠» y texto para lectores de pantalla', () => {
      render([sharedCandidateDto({ evidence: { matches: [], differs: ['consumption'] } })]);
      const row = q('[data-testid="side-own"] [data-field="consumption"]')!;

      expect(row.classList.contains('diff')).toBeTrue();
      expect(row.textContent).toContain('≠');
      expect(row.querySelector('.sr-only')?.textContent).toContain('difiere de la otra empresa');
      expect(q('[data-testid="side-own"] [data-field="fuel"]')!.classList.contains('diff')).toBeFalse();
    });
  });

  describe('tarjeta con la contraparte visible', () => {
    it('muestra a la otra empresa con lo que dejó ver: placa enmascarada, valores y lo distinto resaltado', () => {
      render([visibleCandidateDto()]);
      const other = text('[data-testid="side-other"]');

      expect(other).toContain('***123');
      expect(other).toContain('310 gal');
      expect(other).toContain('3.100,5 kg CO₂');
      expect(other).not.toContain('ABC123');
      expect(q('[data-testid="side-other"] [data-field="consumption"]')!.classList.contains('diff')).toBeTrue();
      expect(q('[data-testid="side-other"] [data-field="consumption"] .sr-only')?.textContent).toContain('difiere de tu declaración');
      expect(q('[data-testid="cand-hidden"]')).toBeNull();
    });

    it('lo que la otra empresa no comparte (ID de servicio, peso, fila) dice «No se comparte» en vez de inventar un valor', () => {
      render([visibleCandidateDto({ own: ownDeclarationDto({ service_id: 'SRV-1', cargo_ton: '9' }) })]);

      expect(text('[data-testid="side-other"] [data-field="serviceId"]')).toContain('No se comparte');
      expect(text('[data-testid="side-other"] [data-field="weight"]')).toContain('No se comparte');
    });
  });

  describe('estado bilateral', () => {
    it('«Tu empresa: pendiente» y «La otra empresa: ya confirmó que es el mismo viaje»', () => {
      render([sharedCandidateDto({ counterpart_decision: 'SAME' })]);

      expect(text('[data-testid="cand-mine"]')).toBe('Tu empresa: pendiente');
      expect(text('[data-testid="cand-other"]')).toBe('La otra empresa: ya confirmó que es el mismo viaje');
      expect(q('[data-testid="cand-note"]')).toBeNull();
    });

    it('un desacuerdo se explica y la decisión ya tomada no se puede repetir (su botón queda desactivado)', () => {
      render([sharedCandidateDto({ my_decision: 'DISTINCT', counterpart_decision: 'SAME', disagreement: true })]);

      expect(text('[data-testid="cand-note"]')).toContain('decidieron distinto');
      expect(q<HTMLButtonElement>('[data-testid="action-distinct"]')!.disabled).toBeTrue();
      expect(q<HTMLButtonElement>('[data-testid="action-same"]')!.disabled).toBeFalse();
    });
  });

  describe('estados de la coincidencia', () => {
    it('cada estado tiene su etiqueta y una marca que no depende del color', () => {
      render([sharedCandidateDto({ id: 'a' }), sharedCandidateDto({ id: 'b', status: 'CONFIRMED_MATCH' }), sharedCandidateDto({ id: 'c', status: 'CONFLICTING_DATA' }), sharedCandidateDto({ id: 'd', status: 'DISTINCT' })]);

      expect([0, 1, 2, 3].map((i) => text('[data-testid="cand-state"]', i))).toEqual(['?Posible coincidencia', '✓Coincidencia confirmada', '!Cifras en conflicto', '≠Viajes distintos']);
      expect(qa('[data-testid="cand-state"] i').every((mark) => mark.getAttribute('aria-hidden') === 'true')).toBeTrue();
    });

    it('solo la posible coincidencia ofrece acciones y casilla; las resueltas son de solo lectura', () => {
      render([sharedCandidateDto({ id: 'a' }), sharedCandidateDto({ id: 'b', status: 'CONFIRMED_MATCH' }), sharedCandidateDto({ id: 'd', status: 'DISTINCT' })]);

      expect(qa('[data-testid="cand-select"]').length).toBe(1);
      expect(qa('[data-testid="action-same"]').length).toBe(1);
      expect(qa('[data-testid="shared-candidate"]')[1].querySelector('button')).toBeNull();
    });
  });

  describe('acciones y confirmaciones', () => {
    it('las cuatro acciones son botones reales dentro de un grupo con nombre', () => {
      render([sharedCandidateDto()]);

      expect(qa('[data-testid="shared-candidate"] [aria-label="Decidir sobre este posible viaje compartido"] button').map((b) => b.textContent!.trim())).toEqual([
        'Confirmar que es el mismo viaje',
        'Confirmar que son viajes distintos',
        'Solicitar aclaración',
        'Dejar pendiente',
      ]);
      expect(q('[aria-label="Decidir sobre este posible viaje compartido"]')!.getAttribute('role')).toBe('group');
    });

    it('«Confirmar que es el mismo viaje» explica la consecuencia y no envía nada hasta confirmar', () => {
      render([sharedCandidateDto()]);

      click('[data-testid="action-same"]');

      expect(text('[data-testid="shared-dialog-title"]')).toBe('¿Confirmar que es el mismo viaje?');
      expect(text('[data-testid="shared-dialog-text"]')).toContain('Ambas empresas conservan sus declaraciones; en un consolidado se contará una sola contribución cuando ambas confirmen');
      http.expectNone(`${CANDIDATES}/decide`);
    });

    it('confirmar envía SAME con el id del candidato y avisa que falta la otra empresa si no ha confirmado', () => {
      render([sharedCandidateDto()]);
      const toast = spyOn(TestBed.inject(ToastService), 'success');

      click('[data-testid="action-same"]');
      click('[data-testid="shared-dialog-confirm"]');
      const post = http.expectOne(`${CANDIDATES}/decide`);

      expect(post.request.body).toEqual({ candidate_ids: ['cand-1'], decision: 'SAME' });
      post.flush({ data: { updated: 1, unchanged: 0, confirmed: 0, conflicting: 0, items: [{ id: 'cand-1', status: 'POSSIBLE_MATCH', my_decision: 'SAME', disagreement: false, conflict_fields: [] }] } });
      listRequest().flush(candidatesBody([]));
      fixture.detectChanges();

      expect(toast.calls.mostRecent().args[0]).toContain('hasta que la otra empresa confirme');
      expect(q('[data-testid="shared-dialog"]')).toBeNull();
    });

    it('si la otra empresa ya había confirmado, el aviso dice que quedó confirmada (y en conflicto de cifras si lo hay)', () => {
      render([sharedCandidateDto({ counterpart_decision: 'SAME' })]);
      const toast = spyOn(TestBed.inject(ToastService), 'success');

      click('[data-testid="action-same"]');
      click('[data-testid="shared-dialog-confirm"]');
      http.expectOne(`${CANDIDATES}/decide`).flush({ data: { updated: 1, unchanged: 0, confirmed: 1, conflicting: 1, items: [{ id: 'cand-1', status: 'CONFLICTING_DATA', my_decision: 'SAME', disagreement: false, conflict_fields: ['co2_kg'] }] } });
      listRequest().flush(candidatesBody([]));

      expect(toast.calls.mostRecent().args[0]).toContain('1 coincidencia quedó confirmada');
      expect(toast.calls.mostRecent().args[0]).toContain('1 quedó en conflicto de cifras');
    });

    it('«Confirmar que son viajes distintos» pide confirmación y envía DISTINCT', () => {
      render([sharedCandidateDto()]);

      click('[data-testid="action-distinct"]');
      expect(text('[data-testid="shared-dialog-text"]')).toContain('se contarán por separado');
      click('[data-testid="shared-dialog-confirm"]');
      const post = http.expectOne(`${CANDIDATES}/decide`);

      expect(post.request.body).toEqual({ candidate_ids: ['cand-1'], decision: 'DISTINCT' });
      post.flush({ data: { updated: 1, unchanged: 0, confirmed: 0, conflicting: 0, items: [] } });
      listRequest().flush(candidatesBody([]));
    });

    it('«Solicitar aclaración» y «Dejar pendiente» son reversibles: se aplican sin confirmación', () => {
      render([sharedCandidateDto()]);

      click('[data-testid="action-needs-info"]');
      expect(q('[data-testid="shared-dialog"]')).toBeNull();
      const post = http.expectOne(`${CANDIDATES}/decide`);

      expect(post.request.body).toEqual({ candidate_ids: ['cand-1'], decision: 'NEEDS_INFO' });
      post.flush({ data: { updated: 1, unchanged: 0, confirmed: 0, conflicting: 0, items: [] } });
      listRequest().flush(candidatesBody([sharedCandidateDto({ my_decision: 'NEEDS_INFO' })]));
      fixture.detectChanges();

      click('[data-testid="action-pending"]');
      expect(http.expectOne(`${CANDIDATES}/decide`).request.body).toEqual({ candidate_ids: ['cand-1'], decision: 'KEEP_PENDING' });
    });

    it('cancelar cierra la confirmación sin enviar nada', async () => {
      render([sharedCandidateDto()]);

      click('[data-testid="action-same"]');
      click('[data-testid="shared-dialog-cancel"]');
      await settle();
      fixture.detectChanges();

      expect(q('[data-testid="shared-dialog"]')).toBeNull();
      http.expectNone(`${CANDIDATES}/decide`);
    });

    it('un 409 se explica en la confirmación con su mensaje, no cierra nada y renueva la lista', () => {
      render([sharedCandidateDto()]);

      click('[data-testid="action-same"]');
      click('[data-testid="shared-dialog-confirm"]');
      http.expectOne(`${CANDIDATES}/decide`).flush({ error: { code: 'CANDIDATE_ALREADY_RESOLVED' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(text('[data-testid="shared-dialog-error"]')).toContain('ya quedó resuelta');
      listRequest().flush(candidatesBody([sharedCandidateDto()]));
    });
  });

  describe('lote', () => {
    it('sin selección los botones del lote están desactivados; marcar los activa y cuenta', () => {
      render(sharedCandidateDtos(3));

      expect(qa<HTMLButtonElement>('[data-testid="shared-bulk"] .acts button').every((b) => b.disabled)).toBeTrue();
      expect(text('[data-testid="shared-selected-count"]')).toBe('Ninguno seleccionado');
      click('[data-testid="cand-select"]', 0);
      click('[data-testid="cand-select"]', 1);

      expect(text('[data-testid="shared-selected-count"]')).toBe('2 seleccionados');
      expect(q<HTMLButtonElement>('[data-testid="bulk-same"]')!.disabled).toBeFalse();
    });

    it('«Seleccionar los de esta página» marca solo las decidibles y envía todos los ids en una petición tras confirmar', () => {
      render([...sharedCandidateDtos(2), sharedCandidateDto({ id: 'ok', status: 'CONFIRMED_MATCH' })]);

      click('[data-testid="shared-select-page"]');
      expect(text('[data-testid="shared-selected-count"]')).toBe('2 seleccionados');
      click('[data-testid="bulk-same"]');
      expect(text('[data-testid="shared-dialog-title"]')).toBe('¿Confirmar que son el mismo viaje en los 2 seleccionados?');
      click('[data-testid="shared-dialog-confirm"]');
      const post = http.expectOne(`${CANDIDATES}/decide`);

      expect(post.request.body).toEqual({ candidate_ids: ['cand-1', 'cand-2'], decision: 'SAME' });
      post.flush({ data: { updated: 2, unchanged: 0, confirmed: 0, conflicting: 0, items: [] } });
      listRequest().flush(candidatesBody([]));
    });

    it('«Dejar pendiente» en lote no pide confirmación; al llegar a 500 avisa y «Quitar selección» la vacía', () => {
      render(sharedCandidateDtos(2));

      click('[data-testid="cand-select"]', 0);
      click('[data-testid="bulk-pending"]');
      const pending = http.expectOne(`${CANDIDATES}/decide`);

      expect(pending.request.body).toEqual({ candidate_ids: ['cand-1'], decision: 'KEEP_PENDING' });
      pending.flush({ data: { updated: 1, unchanged: 0, confirmed: 0, conflicting: 0, items: [] } });
      listRequest().flush(candidatesBody(sharedCandidateDtos(2)));

      TestBed.inject(SharedOperationsFacade).selection.set(Array.from({ length: 500 }, (_, i) => `x${i}`));
      fixture.detectChanges();

      expect(text('[data-testid="shared-selection-max"]')).toContain('máximo de 500');
      click('[data-testid="bulk-clear"]');
      expect(text('[data-testid="shared-selected-count"]')).toBe('Ninguno seleccionado');
    });
  });

  describe('conflicto de datos y selección de la declaración vigente', () => {
    it('muestra los campos en conflicto con nombres llanos, las dos elecciones y la explicación de que nada se promedia ni se borra', () => {
      render([conflictCandidateDto()]);

      expect(text('[data-testid="cand-conflict"]')).toContain('declararon cifras distintas en: Consumo, Emisiones (kg CO₂)');
      expect(text('[data-testid="sel-mine"]')).toBe('Tu empresa: aún no eligió');
      expect(text('[data-testid="sel-summary"]')).toBe('Solo se aplica cuando ambas empresas eligen la misma declaración. No se promedia ni se borra nada.');
      expect(qa('[data-testid="action-same"]').length).toBe(0);
    });

    it('«Usar mi declaración» envía el lado propio: A si soy A, B si soy B', () => {
      for (const side of ['A', 'B'] as const) {
        TestBed.resetTestingModule();
        render([conflictCandidateDto({ my_side: side })]);

        click('[data-testid="select-mine"]');
        expect(text('[data-testid="shared-dialog-title"]')).toBe('¿Usar tu declaración como la vigente?');
        expect(text('[data-testid="shared-dialog-text"]')).toContain('no se promedia ni se borra nada');
        click('[data-testid="shared-dialog-confirm"]');
        const post = http.expectOne(`${RECONCILIATION_URL}/operations/select`);

        expect(post.request.body).toEqual({ operation_ids: ['op-1'], selection: side });
        post.flush({ data: { updated: 1, unchanged: 0, effective: 0, operations: [] } });
        listRequest().flush(candidatesBody([]));
      }
    });

    it('«Usar la de la otra empresa» envía el lado contrario al propio', () => {
      render([conflictCandidateDto({ my_side: 'B' })]);

      click('[data-testid="select-theirs"]');
      expect(text('[data-testid="shared-dialog-title"]')).toBe('¿Usar la declaración de la otra empresa como la vigente?');
      click('[data-testid="shared-dialog-confirm"]');
      const post = http.expectOne(`${RECONCILIATION_URL}/operations/select`);

      expect(post.request.body).toEqual({ operation_ids: ['op-1'], selection: 'A' });
      post.flush({ data: { updated: 1, unchanged: 0, effective: 1, operations: [] } });
      listRequest().flush(candidatesBody([]));
    });

    it('el aviso tras elegir es veraz: solo dice «vigente» si el servidor informa acuerdo de ambas', () => {
      render([conflictCandidateDto()]);
      const toast = spyOn(TestBed.inject(ToastService), 'success');

      click('[data-testid="select-mine"]');
      click('[data-testid="shared-dialog-confirm"]');
      http.expectOne(`${RECONCILIATION_URL}/operations/select`).flush({ data: { updated: 1, unchanged: 0, effective: 0, operations: [] } });
      listRequest().flush(candidatesBody([]));

      expect(toast.calls.mostRecent().args[0]).toBe('Registramos tu elección. Solo se aplicará cuando la otra empresa elija la misma declaración.');
    });

    it('cuando ambas eligieron lo mismo muestra cuál quedó vigente, leída desde la propia empresa (mySide B, vigente B = la mía)', () => {
      render([conflictCandidateDto({ my_side: 'B', operation: operationDto({ my_selection: 'B', counterpart_selection: 'B', effective_selection: 'B', state: 'EFFECTIVE' }) })]);

      expect(text('[data-testid="sel-mine"]')).toBe('Tu empresa: tu declaración');
      expect(text('[data-testid="sel-other"]')).toBe('La otra empresa: tu declaración');
      expect(text('[data-testid="sel-summary"]')).toContain('Ambas empresas eligieron tu declaración: es la vigente');
    });

    it('sin consentimiento de ambas empresas no se puede elegir y se explica por qué (no se ve ningún valor ajeno)', () => {
      render([conflictCandidateDto({ counterpart: null })]);

      expect(qa('[data-testid="select-mine"]').length).toBe(0);
      expect(text('[data-testid="select-blocked"]')).toContain('ambas empresas permitan compartir los resultados');
      expect(qa('[data-testid="side-other"] dd').length).toBe(0);
    });
  });

  describe('cifras no compartidas, idénticas y pares sustituidos', () => {
    const confirmedNotShared = (): SharedCandidateDto => sharedCandidateDto({ status: 'CONFIRMED_MATCH', my_decision: 'SAME', counterpart_decision: 'SAME', data_comparison: 'not_shared', evidence: { matches: ['origin', 'destination'], differs: [] } });

    it('confirmado sin compartir resultados: línea neutra, ningún valor ajeno y sin control de selección', () => {
      render([confirmedNotShared()]);

      expect(text('[data-testid="cand-comparison"]')).toBe('Las cifras no se comparan porque no se comparten resultados entre las dos empresas.');
      expect(qa('[data-testid="side-other"] dd').length).toBe(0);
      expect(q('[data-testid="side-other"]')!.textContent).not.toMatch(/\*\*\*|\d+ gal|kg CO₂ \d/);
      expect(qa('[data-testid="select-mine"]').length).toBe(0);
      expect(qa('[data-testid="cand-conflict"]').length).toBe(0);
      expect(text('[data-testid="cand-comparison"]')).not.toMatch(/coinciden las cifras|difieren/i);
    });

    it('con cifras idénticas dice «Las cifras coinciden»; en conflicto mantiene el cuadro y la selección', () => {
      render([visibleCandidateDto({ status: 'CONFIRMED_MATCH', data_comparison: 'identical' }), conflictCandidateDto({ id: 'k' })]);

      expect(text('[data-testid="cand-comparison"]')).toBe('Las cifras coinciden.');
      expect(qa('[data-testid="cand-conflict"]').length).toBe(1);
      expect(qa('[data-testid="select-mine"]').length).toBe(1);
      expect(qa('[data-testid="cand-comparison"]').length).toBe(1);
    });

    it('un par pendiente no dice nada de las cifras', () => {
      render([sharedCandidateDto()]);

      expect(qa('[data-testid="cand-comparison"]').length).toBe(0);
    });

    it('`ambiguous_group` se muestra con su etiqueta y la explicación llana', () => {
      render([sharedCandidateDto({ evidence: { matches: ['origin', 'ambiguous_group'], differs: [] } })]);

      expect(qa('[data-testid="cand-matches"] .tag').map((t) => t.textContent!.trim())).toContain('Viajes repetidos ese día');
      expect(text('[data-testid="cand-ambiguous"]')).toBe('Hay varios viajes iguales ese día; el emparejamiento es por orden y hay que revisarlo.');
    });

    it('un par sustituido es de solo lectura: nota, sin casilla ni acciones, y «seleccionar la página» lo ignora', () => {
      render([sharedCandidateDto({ id: 's', superseded: true }), sharedCandidateDto({ id: 'p' })]);

      expect(text('[data-testid="cand-superseded"]')).toBe('Se resolvió otro par con este viaje.');
      expect(qa('[data-testid="shared-candidate"]')[0].querySelector('button, input')).toBeNull();
      expect(qa('[data-testid="cand-select"]').length).toBe(1);
      click('[data-testid="shared-select-page"]');
      expect(text('[data-testid="shared-selected-count"]')).toBe('1 seleccionado');
    });

    it('un 409 PAIR_NOT_CONFIRMABLE dice el mensaje genérico en la confirmación y renueva la lista', () => {
      render([sharedCandidateDto()]);

      click('[data-testid="action-same"]');
      click('[data-testid="shared-dialog-confirm"]');
      http.expectOne(`${CANDIDATES}/decide`).flush({ error: { code: 'PAIR_NOT_CONFIRMABLE' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();

      expect(text('[data-testid="shared-dialog-error"]')).toBe('Este par ya no se puede confirmar. Actualiza la lista.');
      listRequest().flush(candidatesBody([]));
    });

    it('el aviso solo menciona el conflicto de cifras cuando el servidor lo cuenta (> 0)', () => {
      render([sharedCandidateDto({ counterpart_decision: 'SAME' })]);
      const toast = spyOn(TestBed.inject(ToastService), 'success');

      click('[data-testid="action-same"]');
      click('[data-testid="shared-dialog-confirm"]');
      http.expectOne(`${CANDIDATES}/decide`).flush({ data: { updated: 1, unchanged: 0, confirmed: 1, conflicting: 0, items: [{ id: 'cand-1', status: 'CONFIRMED_MATCH', my_decision: 'SAME', disagreement: false, conflict_fields: [] }] } });
      listRequest().flush(candidatesBody([]));

      expect(toast.calls.mostRecent().args[0]).toContain('1 coincidencia quedó confirmada');
      expect(toast.calls.mostRecent().args[0]).not.toContain('conflicto');
    });

    it('las opciones del filtro explican qué incluye cada estado', () => {
      render([sharedCandidateDto()]);

      expect(qa('[data-testid="shared-status-filter"] option').map((o) => o.textContent!.trim())).toContain('Cifras en conflicto');
      expect(q('[data-testid="shared-status-filter"]')!.getAttribute('title')).toContain('incluyen las que no comparan cifras');
    });
  });

  describe('estados de la bandeja', () => {
    it('lista 5 por página con paginador y pide la página elegida al servidor', () => {
      render(sharedCandidateDtos(5), 12);

      expect(qa('[data-testid="shared-candidate"]').length).toBe(5);
      expect(text('[data-testid="pager"]')).toContain('Mostrando 1–5 de 12');
      click('[data-testid="page-next"]');
      const next = listRequest();

      expect(next.request.params.get('page')).toBe('2');
      next.flush(candidatesBody(sharedCandidateDtos(5), 12, 5, 2));
    });

    it('sin candidatos dice «No hay operaciones compartidas por revisar» y explica cuándo aparecerán', () => {
      render([]);

      expect(text('app-resource-state')).toContain('No hay operaciones compartidas por revisar');
      expect(text('app-resource-state')).toContain('permitan la conciliación');
    });

    it('el filtro por estado pide solo ese estado y vuelve a la primera página', () => {
      render(sharedCandidateDtos(1));
      const select = q<HTMLSelectElement>('[data-testid="shared-status-filter"]')!;

      select.value = 'CONFLICTING_DATA';
      select.dispatchEvent(new Event('change'));
      const request = listRequest();

      expect([request.request.params.get('status'), request.request.params.get('page')]).toEqual(['CONFLICTING_DATA', '1']);
      request.flush(candidatesBody([]));
    });

    it('si la lista falla muestra el error con «Reintentar» que vuelve a pedir', () => {
      TestBed.configureTestingModule({ imports: [SharedOperationsComponent], providers: provideTestApp() });
      signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
      http = TestBed.inject(HttpTestingController);
      TestBed.inject(SharedOperationsFacade).load();
      http.expectOne((r) => r.url === CANDIDATES).flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'Server Error' });
      fixture = TestBed.createComponent(SharedOperationsComponent);
      fixture.detectChanges();

      expect(q('[role="alert"]')).not.toBeNull();
      qa('button').find((b) => b.textContent!.trim() === 'Reintentar')!.click();
      listRequest().flush(candidatesBody(sharedCandidateDtos(1)));
      fixture.detectChanges();
      expect(qa('[data-testid="shared-candidate"]').length).toBe(1);
    });

    it('enlaza a los permisos de conciliación de «Empresas vinculadas»', () => {
      render([]);

      expect(q('[data-testid="shared-permissions-link"]')!.getAttribute('href')).toBe('/mi-empresa?tab=links');
    });
  });

  describe('presentación', () => {
    it('el CSS usa solo tokens de la plataforma: sin hexadecimales ni rgb() y con tintes permitidos', () => {
      render([conflictCandidateDto()]);
      click('[data-testid="select-mine"]');
      const css = [componentCss('.cand'), componentCss('.bulk'), componentCss('h2')].join('\n');

      expect(css).toContain('.cand');
      expect(css).toContain('.bulk');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z-])/);
      expect(css).not.toMatch(/rgb\(/);
      expect(css).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);

      const tints = Array.from(css.matchAll(/color-mix\(in srgb, [^,]+ (\d+)%/g));

      expect(tints.length).toBeGreaterThan(0);
      for (const m of tints) expect([14, 20, 40, 60, 80]).toContain(Number(m[1]));
    });

    it('nada tiene scroll interno aunque haya 5 tarjetas', () => {
      render([...sharedCandidateDtos(3), visibleCandidateDto({ id: 'v' }), conflictCandidateDto({ id: 'k' })], 12);
      document.body.appendChild(el());
      const scrollable = qa('*').filter((node) => {
        const style = getComputedStyle(node);

        if (node.classList.contains('sr-only')) return false;

        return ['auto', 'scroll'].includes(style.overflowY) || (style.overflowY !== 'visible' && node.scrollHeight > node.clientHeight + 1 && node.clientHeight > 0);
      });

      expect(scrollable.map((n) => n.className || n.tagName)).toEqual([]);
      el().remove();
    });

    it('la declaración propia y la de la otra empresa son dos tarjetas simétricas del mismo ancho y alto', () => {
      render([visibleCandidateDto()]);
      document.body.appendChild(el());
      const a = q('[data-testid="side-own"]')!.getBoundingClientRect();
      const b = q('[data-testid="side-other"]')!.getBoundingClientRect();

      expect(Math.abs(a.width - b.width)).toBeLessThan(2);
      expect(Math.abs(a.height - b.height)).toBeLessThan(2);
      el().remove();
    });
  });
});
