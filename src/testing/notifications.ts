import { NotificationDto } from '../app/infrastructure/dto/notifications.dto';
import { ORG_ENVIA } from './builders';

/** URL base de los avisos de la empresa de pruebas. */
export const NOTIFICATIONS_URL = `http://api.test/api/v1/organizations/${ORG_ENVIA.id}/notifications`;

export const notificationDto = (overrides: Partial<NotificationDto> = {}): NotificationDto => ({
  id: 'n-1',
  kind: 'VEHICLES_NEW',
  title: 'Vehículos nuevos en tu carga',
  body: 'La carga trae 2 vehículos nuevos para registrar.',
  payload: { import_id: 'imp-1', new: 2, changed: 0 },
  created_at: '2026-03-01T10:02:00Z',
  read_at: null,
  ...overrides,
});
