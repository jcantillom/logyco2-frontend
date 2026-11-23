import { notificationDto } from '../../../testing/notifications';
import { toNotification } from './notifications.mappers';

describe('notifications.mappers', () => {
  it('reconoce el aviso POSSIBLE_DUPLICATES y conserva el título y el texto que da el servidor', () => {
    const item = toNotification(notificationDto({ kind: 'POSSIBLE_DUPLICATES', title: 'Posibles operaciones repetidas por revisar', body: 'Se encontraron 1 operación que podría estar repetida.', payload: { import_id: 'imp-7', new: 0, changed: 0, possible_duplicates: 1 } }));

    expect(item.kind).toBe('POSSIBLE_DUPLICATES');
    expect(item.title).toBe('Posibles operaciones repetidas por revisar');
    expect(item.payload.importId).toBe('imp-7');
  });

  it('los avisos de vehículos siguen igual y un tipo desconocido se trata como cambios de vehículos', () => {
    expect(toNotification(notificationDto({ kind: 'VEHICLES_NEW' })).kind).toBe('VEHICLES_NEW');
    expect(toNotification(notificationDto({ kind: 'VEHICLES_CHANGED' })).kind).toBe('VEHICLES_CHANGED');
    expect(toNotification(notificationDto({ kind: 'OTRO' })).kind).toBe('VEHICLES_CHANGED');
  });

  it('el aviso agrupado SHARED_OPERATIONS conserva el título y el texto del servidor y trae la carga y la cantidad, sin datos de la otra empresa', () => {
    const item = toNotification(notificationDto({ kind: 'SHARED_OPERATIONS', title: 'Posibles viajes compartidos', body: 'Se identificaron 12 posibles viajes compartidos con una empresa vinculada.', payload: { import_id: 'imp-9', possible_shared: 12 } }));

    expect(item.kind).toBe('SHARED_OPERATIONS');
    expect(item.title).toBe('Posibles viajes compartidos');
    expect(item.payload).toEqual({ importId: 'imp-9', possibleShared: 12 });
  });

  it('el payload de vehículos y duplicados sigue igual: carga, nuevos y cambios', () => {
    const item = toNotification(notificationDto({ kind: 'VEHICLES_NEW', payload: { import_id: 'imp-1', new: 2, changed: 0 } }));

    expect(item.payload).toEqual({ importId: 'imp-1', new: 2, changed: 0 });
  });
});
