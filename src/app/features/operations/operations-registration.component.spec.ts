import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { MANUAL_URLS, manualOptionsDto, manualTemplateDto, manualTripDetailDto, manualVehicleDto, repeatedDataDto, routeDto, voidOutDto } from '../../../testing/manual-trips';
import { completionStateDto, EXPORTS_URL, OPERATIONS_URL, capped, completionUrl, exportsBody, operationTripDto, operationsPageBody, tabCountsDto, tripDetailDto } from '../../../testing/operations';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ToastService } from '../../core/notifications/toast.service';
import { OperationTripDto } from '../../infrastructure/dto/operations.dto';
import { OperationsComponent } from './operations.component';

describe('Operaciones logísticas: registrar viaje y anular', () => {
  let fixture: ComponentFixture<OperationsComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T | null => el().querySelector<T>(selector);
  const qa = <T extends HTMLElement = HTMLElement>(selector: string): T[] => Array.from(el().querySelectorAll<T>(selector));
  const text = (selector: string): string => (q(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const click = (selector: string, index = 0): void => {
    qa(selector)[index].click();
    fixture.detectChanges();
  };
  const manualRow = (): OperationTripDto => operationTripDto({ id: 'trip-m1', trip_id: 'M-000123', plate: 'ABC123', file_name: 'Registros manuales', source: 'MANUAL' });

  function init(rows: readonly OperationTripDto[], roles: string[] = ['ORG_ANALYST']): void {
    TestBed.configureTestingModule({
      imports: [OperationsComponent],
      providers: [...provideTestApp(), provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } }],
    });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, roles)] }), TestBed.inject(SessionStore));
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OperationsComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === OPERATIONS_URL && r.method === 'GET').flush(operationsPageBody(rows, { next: 'cur-2', total: capped(rows.length) }));
    http.expectOne(`${OPERATIONS_URL}/summary`).flush({ data: tabCountsDto(), meta: {} });

    if (roles.includes('ORG_ANALYST') || roles.includes('ORG_ADMIN')) {
      http.expectOne((r) => r.url.endsWith('/imports/periods')).flush({ data: [], meta: {} });
      http.expectOne((r) => r.url.endsWith('/imports') && r.method === 'GET').flush({ data: [], meta: { pagination: { page: 1, page_size: 50, total: 0, total_pages: 0, has_next: false, has_previous: false } } });
    }

    fixture.detectChanges();
  }

  function openDetail(detail: ReturnType<typeof tripDetailDto>, id = 'trip-m1', index = 0): void {
    click('[data-testid="open-detail"]', index);
    http.expectOne(`${OPERATIONS_URL}/${id}`).flush({ data: detail, meta: {} });
    fixture.detectChanges();
  }

  /** Abre el menú de acciones del detalle. */
  function openMenu(): void {
    click('[data-testid="detail-actions-button"]');
    fixture.detectChanges();
  }

  afterEach(() => {
    if (!http) return;

    http.match((r) => r.url === EXPORTS_URL && r.method === 'GET').forEach((request) => !request.cancelled && request.flush(exportsBody()));
    http.verify();
  });

  describe('acción «Registrar viaje»', () => {
    it('es el botón primario de las acciones del encabezado, junto a Exportar y Reportes', () => {
      init([operationTripDto()]);
      const button = q<HTMLButtonElement>('[data-testid="register-trip"]')!;

      expect(button.textContent?.trim()).toBe('Registrar viaje');
      expect(button.classList).toContain('btn-primary');
      expect(button.disabled).toBeFalse();
      expect(button.closest('.actions')).toBe(q('[data-testid="export"]')!.closest('.actions'));
      expect(q('[data-testid="registration-dialog"]')).toBeNull();
    });

    it('sin imports:create se ve deshabilitado con su explicación accesible y no abre nada', () => {
      init([operationTripDto()], ['ORG_VIEWER']);
      const button = q<HTMLButtonElement>('[data-testid="register-trip"]')!;

      expect(button.disabled).toBeTrue();
      expect(button.getAttribute('aria-describedby')).toBe('ops-register-hint');
      expect(text('#ops-register-hint')).toContain('permiso');
      button.click();
      http.expectNone((r) => r.url.includes('/manual/'));
    });

    it('abre el diálogo (no una ruta) pidiendo las opciones y, al cerrarlo sin escribir nada, el foco vuelve al botón', fakeAsync(() => {
      init([operationTripDto()]);
      const button = q<HTMLButtonElement>('[data-testid="register-trip"]')!;

      button.focus();
      button.click();
      fixture.detectChanges();
      http.expectOne(MANUAL_URLS.options).flush({ data: manualOptionsDto(), meta: {} });
      fixture.detectChanges();
      tick();

      expect(q<HTMLDialogElement>('dialog.reg')!.open).toBeTrue();
      expect(document.activeElement?.id).toBe('reg-date');

      click('[data-testid="reg-cancel"]');
      tick();
      fixture.detectChanges();

      expect(q('dialog.reg')).toBeNull();
      expect(document.activeElement).toBe(button);
      flush();
    }));

    it('un viaje por completar guardado abre su detalle con el formulario de «Completar datos» de la Etapa 1', fakeAsync(() => {
      init([operationTripDto()]);
      click('[data-testid="register-trip"]');
      http.expectOne(MANUAL_URLS.options).flush({ data: manualOptionsDto(), meta: {} });
      fixture.detectChanges();
      const facade = fixture.debugElement.injector.get(TripRegistrationFacadeToken);

      facade.step.set('saved');
      facade.outcome.set({
        created: true,
        trip: toDetail(manualTripDetailDto({ status: 'PENDING', state_label: 'Por completar', completable: true })),
        result: { status: 'PENDING', reasonLabel: 'Falta el rendimiento', methodLabel: null, kgCo2: null, counted: false, countedNote: null, completable: true },
      });
      fixture.detectChanges();
      tick();

      expect(text('[data-testid="reg-result"]')).toBe('Por completar: Falta el rendimiento');
      click('[data-testid="reg-complete"]');
      fixture.detectChanges();

      expect(q('dialog.reg')).toBeNull();
      http.expectOne(`${OPERATIONS_URL}/trip-m1`).flush({ data: manualTripDetailDto({ status: 'PENDING', state_label: 'Por completar', completable: true, emissions: null }), meta: {} });
      http.expectOne(completionUrl('trip-m1')).flush({ data: completionStateDto({ trip_id: 'trip-m1' }), meta: {} });
      fixture.detectChanges();

      expect(q('[data-testid="completion"]')).not.toBeNull();
      flush();
    }));
  });

  describe('lista y detalle de un viaje manual', () => {
    it('la fila de un viaje manual lleva la marca «Manual»; la de un archivo no', () => {
      init([manualRow(), operationTripDto({ id: 'trip-2' })]);

      expect(qa('[data-testid="manual-mark"]').length).toBe(1);
      expect(qa('[data-testid="trip-row"]')[0].querySelector('[data-testid="manual-mark"]')?.textContent?.trim()).toBe('Manual');
    });

    it('el detalle dice «Registrado manualmente por X» en Información, sin carga ni fila, y el chip muestra el estado del servidor', () => {
      init([manualRow()]);
      openDetail(manualTripDetailDto());

      expect(text('.meta .file')).toBe('Registrado manualmente');
      expect(text('[data-testid="detail-info"]')).toContain('Registrado manualmente por Laura Gómez');
      expect(text('[data-testid="detail-info"]')).not.toContain('Archivo Excel');
      expect(text('[data-testid="detail-info"]')).not.toContain('Registros manuales');
    });

    it('un viaje anulado muestra el chip «Anulado» (tono neutro), sin «Anular viaje» y su evento en el historial', () => {
      init([manualRow()]);
      openDetail(voidOutDto().trip);

      expect(text('[data-testid="detail-state"]')).toBe('Anulado');
      expect(q('[data-testid="detail-state"]')!.className).toContain('info');
      expect(q('[data-testid="void-action"]')).toBeNull();
    });

    it('«Duplicar», «Viaje de regreso» y «Anular viaje» aparecen con imports:create; «Anular viaje» no aparece en un viaje de archivo', () => {
      init([manualRow(), operationTripDto({ id: 'trip-2' })]);
      openDetail(manualTripDetailDto());

      const trigger = q('[data-testid="detail-actions-button"]')!;

      expect(q('[data-testid="detail-actions"]')).toBeNull();
      expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      openMenu();

      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(q('[data-testid="detail-actions"]')!.getAttribute('role')).toBe('menu');
      expect(qa('[role="menuitem"]').map((b) => b.textContent?.trim())).toEqual(['Duplicar', 'Viaje de regreso', 'Anular viaje']);
      expect(q('[data-testid="void-action"]')!.getAttribute('aria-disabled')).toBeNull();

      click('[data-testid="open-detail"]', 1);
      http.expectOne(`${OPERATIONS_URL}/trip-2`).flush({ data: tripDetailDto({ identity: { ...tripDetailDto().identity, id: 'trip-2' } }), meta: {} });
      fixture.detectChanges();

      openMenu();

      expect(qa('[role="menuitem"]').map((b) => b.textContent?.trim())).toEqual(['Duplicar', 'Viaje de regreso']);
    });

    it('un viaje manual que no se puede anular muestra el botón deshabilitado con el motivo del servidor', () => {
      init([manualRow()]);
      openDetail(manualTripDetailDto({ voidable: false, void_blocked_reason: 'Este viaje ya está confirmado con una empresa vinculada' }));
      openMenu();
      const button = q<HTMLButtonElement>('[data-testid="void-action"]')!;

      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.getAttribute('aria-describedby')).toBe('void-why');
      expect(text('#void-why')).toBe('Este viaje ya está confirmado con una empresa vinculada');
    });

    it('sin imports:create el detalle no ofrece registrar ni anular', () => {
      init([manualRow()], ['ORG_VIEWER']);
      openDetail(manualTripDetailDto());

      expect(q('[data-testid="detail-actions-button"]')).toBeNull();
    });

    it('el menú se maneja con teclado: flechas recorren, Escape lo cierra y devuelve el foco al botón sin cerrar el panel, y un clic fuera lo cierra', fakeAsync(() => {
      init([manualRow()]);
      openDetail(manualTripDetailDto());
      openMenu();
      tick();
      const items = qa('[role="menuitem"]');
      const press = (key: string): KeyboardEvent => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });

        document.activeElement!.dispatchEvent(event);
        fixture.detectChanges();

        return event;
      };

      expect(document.activeElement).toBe(items[0]);
      press('ArrowDown');
      expect(document.activeElement).toBe(items[1]);
      press('End');
      expect(document.activeElement).toBe(items[2]);
      press('ArrowDown');
      expect(document.activeElement).toBe(items[0]);

      press('Escape');

      expect(q('[data-testid="detail-actions"]')).toBeNull();
      expect(document.activeElement).toBe(q('[data-testid="detail-actions-button"]'));
      expect(q('[data-testid="trip-detail"]')).not.toBeNull();

      openMenu();
      document.body.click();
      fixture.detectChanges();

      expect(q('[data-testid="detail-actions"]')).toBeNull();
      flush();
    }));

    it('una acción no anulable no hace nada al elegirla', () => {
      init([manualRow()]);
      openDetail(manualTripDetailDto({ voidable: false, void_blocked_reason: 'Confirmado' }));
      openMenu();

      click('[data-testid="void-action"]');

      expect(q('dialog.void')).toBeNull();
    });
  });

  describe('Duplicar y Viaje de regreso', () => {
    it('«Duplicar» pide la estructura del viaje y abre el formulario con lo copiado y sin fecha ni energía; el foco vuelve al botón al cerrar', fakeAsync(() => {
      init([manualRow()]);
      openDetail(manualTripDetailDto());
      const trigger = q<HTMLButtonElement>('[data-testid="detail-actions-button"]')!;

      trigger.focus();
      openMenu();
      click('[data-testid="duplicate-action"]');
      http.expectOne(MANUAL_URLS.options).flush({ data: manualOptionsDto(), meta: {} });
      const template = http.expectOne((r) => r.url === MANUAL_URLS.template('trip-m1'));

      expect(template.request.params.get('mode')).toBe('duplicate');
      template.flush({ data: manualTemplateDto({ source_trip_id: 'trip-m1' }), meta: {} });
      http.expectOne((r) => r.url === MANUAL_URLS.vehicles).flush({ data: [manualVehicleDto()], meta: {} });
      http.expectOne((r) => r.url === MANUAL_URLS.route).flush({ data: routeDto(), meta: {} });
      fixture.detectChanges();
      tick();

      expect(text('[data-testid="reg-banner"]')).toBe('Copiado del viaje M-000123');
      expect(q<HTMLInputElement>('#reg-vehicle')!.value).toBe('ABC123');
      expect(q<HTMLInputElement>('#reg-origin')!.value).toBe('Medellín, Antioquia');
      expect(q<HTMLInputElement>('#reg-date')!.value).toBe('');
      expect(q<HTMLInputElement>('#reg-value')!.value).toBe('');

      click('[data-testid="reg-cancel"]');
      tick();
      fixture.detectChanges();

      expect(document.activeElement).toBe(trigger);
      flush();
    }));

    it('«Viaje de regreso» pide el modo return', fakeAsync(() => {
      init([manualRow()]);
      openDetail(manualTripDetailDto());

      openMenu();
      click('[data-testid="return-action"]');
      http.expectOne(MANUAL_URLS.options).flush({ data: manualOptionsDto(), meta: {} });
      const template = http.expectOne((r) => r.url === MANUAL_URLS.template('trip-m1'));

      expect(template.request.params.get('mode')).toBe('return');
      template.flush({ data: manualTemplateDto({ mode: 'return', plate_registered: false }), meta: {} });
      http.expectOne((r) => r.url === MANUAL_URLS.route).flush({ data: routeDto(), meta: {} });
      fixture.detectChanges();

      expect(text('[data-testid="reg-banner"]')).toBe('Viaje de regreso de M-000123');
      flush();
    }));
  });

  describe('Anular viaje', () => {
    function openVoid(): void {
      init([manualRow()]);
      openDetail(manualTripDetailDto({ correction_version: 2 }));
      openMenu();
      click('[data-testid="void-action"]');
      fixture.detectChanges();
    }

    it('pide confirmar con la consecuencia en palabras simples y un motivo opcional de hasta 200 caracteres', fakeAsync(() => {
      openVoid();
      tick();

      expect(q<HTMLDialogElement>('dialog.void')!.open).toBeTrue();
      expect(text('[data-testid="void-text"]')).toBe('El viaje dejará de contarse en tus emisiones. No se elimina: queda en el historial como Anulado.');
      expect(q('[data-testid="void-reason"]')!.getAttribute('maxlength')).toBe('200');
      expect(text('[data-testid="void-count"]')).toBe('0/200');
      http.expectNone((r) => r.url.includes('/void'));
      flush();
    }));

    it('confirmar anula, deja el detalle como «Anulado», avisa y refresca lista y conteos', fakeAsync(() => {
      openVoid();
      const reason = q<HTMLTextAreaElement>('[data-testid="void-reason"]')!;

      reason.value = 'Duplicado por error';
      reason.dispatchEvent(new Event('input'));
      click('[data-testid="void-confirm"]');
      const request = http.expectOne(MANUAL_URLS.voidOf('trip-m1'));

      expect(request.request.body).toEqual({ reason: 'Duplicado por error', expected_version: 2 });
      request.flush({ data: voidOutDto(), meta: {} });
      fixture.detectChanges();
      http.expectOne((r) => r.url === OPERATIONS_URL && r.method === 'GET').flush(operationsPageBody([]));
      http.expectOne(`${OPERATIONS_URL}/summary`).flush({ data: tabCountsDto(), meta: {} });
      fixture.detectChanges();
      tick();

      expect(q('dialog.void')).toBeNull();
      expect(text('[data-testid="detail-state"]')).toBe('Anulado');
      expect(q('[data-testid="void-action"]')).toBeNull();
      expect(text('[data-testid="void-live"]')).toBe('Viaje anulado. Ya no cuenta en tus emisiones.');
      expect(TestBed.inject(ToastService).toasts().at(-1)?.message).toBe('Viaje anulado. Ya no cuenta en tus emisiones.');
      flush();
    }));

    it('TRIP_HAS_CONFIRMED_MATCH se explica en el diálogo, que sigue abierto', fakeAsync(() => {
      openVoid();

      click('[data-testid="void-confirm"]');
      http.expectOne(MANUAL_URLS.voidOf('trip-m1')).flush({ error: { code: 'TRIP_HAS_CONFIRMED_MATCH' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      http.expectOne(`${OPERATIONS_URL}/trip-m1`).flush({ data: manualTripDetailDto({ voidable: false, void_blocked_reason: 'Confirmado con una vinculada' }), meta: {} });
      fixture.detectChanges();

      expect(text('[data-testid="void-error"]')).toBe('Este viaje ya está confirmado como compartido con una empresa vinculada: no se puede anular sin alterar lo confirmado.');
      expect(q('dialog.void')).not.toBeNull();
      expect(q<HTMLButtonElement>('[data-testid="void-confirm"]')!.disabled).toBeFalse();
      flush();
    }));

    it('TRIP_NOT_MANUAL se explica con el mensaje del catálogo', fakeAsync(() => {
      openVoid();

      click('[data-testid="void-confirm"]');
      http.expectOne(MANUAL_URLS.voidOf('trip-m1')).flush({ error: { code: 'TRIP_NOT_MANUAL' } }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      http.expectOne(`${OPERATIONS_URL}/trip-m1`).flush({ data: manualTripDetailDto(), meta: {} });
      fixture.detectChanges();

      expect(text('[data-testid="void-error"]')).toContain('Solo se pueden anular los viajes registrados manualmente');
      flush();
    }));

    it('Cancelar cierra sin anular y el foco vuelve al botón de acciones', fakeAsync(() => {
      openVoid();
      tick();

      click('[data-testid="void-cancel"]');
      tick();
      fixture.detectChanges();
      tick();

      expect(q('dialog.void')).toBeNull();
      expect(document.activeElement).toBe(q('[data-testid="detail-actions-button"]'));
      http.expectNone((r) => r.url.includes('/void'));
      flush();
    }));
  });

  describe('viaje repetido desde la pantalla', () => {
    it('«Revisar el existente» cierra el formulario y abre el detalle de ese viaje', fakeAsync(() => {
      init([operationTripDto()]);
      click('[data-testid="register-trip"]');
      http.expectOne(MANUAL_URLS.options).flush({ data: manualOptionsDto(), meta: {} });
      fixture.detectChanges();
      const facade = fixture.debugElement.injector.get(TripRegistrationFacadeToken);

      facade.candidates.set(toRepeated());
      facade.step.set('repeated');
      fixture.detectChanges();

      click('[data-testid="reg-review"]');
      fixture.detectChanges();

      expect(q('dialog.reg')).toBeNull();
      http.expectOne(`${OPERATIONS_URL}/trip-9`).flush({ data: manualTripDetailDto({ identity: { ...manualTripDetailDto().identity, id: 'trip-9' } }), meta: {} });
      fixture.detectChanges();

      expect(q('[data-testid="trip-detail"]')).not.toBeNull();
      flush();
    }));
  });
});

import { TripRegistrationFacade as TripRegistrationFacadeToken } from './trip-registration.facade';
import { toTripDetail } from '../../infrastructure/mappers/operations.mappers';
import { toRepeatedTrips } from '../../infrastructure/mappers/manual-trips.mappers';

const toDetail = (dto: ReturnType<typeof manualTripDetailDto>): ReturnType<typeof toTripDetail> => toTripDetail(dto);
const toRepeated = (): ReturnType<typeof toRepeatedTrips> => toRepeatedTrips(repeatedDataDto());
