import { AppErrorKind } from './app-error';

/**
 * Catálogo central de mensajes. Está indexado por el `error.code` estable del
 * backend (no por su texto), de modo que un cambio de redacción en el servidor
 * no rompe la interfaz. Preparado para i18n: reemplazar el valor por una clave.
 */
/** Mensaje acordado cuando se completa el cupo (debe coincidir con el del backend). */
export const SUPER_ADMIN_LIMIT_MESSAGE =
  'Se alcanzó el límite máximo de 5 superadministradores activos. Para incorporar uno nuevo, primero debes revocar el acceso de uno de los actuales.';

export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  // Autenticación y sesión
  INVALID_CREDENTIALS: 'El correo o la contraseña no son correctos.',
  LOGIN_RATE_LIMITED: 'Demasiados intentos de inicio de sesión. Inténtalo de nuevo más tarde.',
  MISSING_TOKEN: 'Tu sesión no es válida. Inicia sesión nuevamente.',
  INVALID_TOKEN: 'Tu sesión expiró o no es válida. Inicia sesión nuevamente.',
  UNAUTHORIZED: 'Tu sesión expiró o no es válida. Inicia sesión nuevamente.',
  USER_NOT_REGISTERED:
    'Tu identidad corporativa es válida, pero aún no tienes una cuenta en LoGyCO₂. Usa tu código de invitación.',
  USER_INACTIVE: 'Tu cuenta está inactiva. Contacta al administrador.',
  IDENTITY_MISMATCH: 'La identidad de la sesión no coincide con la invitación.',
  AUTH_PROVIDER_UNAVAILABLE: 'El servicio corporativo de autenticación no está disponible.',
  AUTH_PROVIDER_ERROR: 'El servicio corporativo de autenticación respondió con un error.',
  AUTH_NOT_CONFIGURED: 'La autenticación corporativa no está configurada en el servidor.',
  AUTH_LOGIN_NOT_CONFIGURED: 'El inicio de sesión corporativo no está configurado en el servidor.',

  // Empresas y membresías
  ORGANIZATION_ACCESS_DENIED: 'No tienes acceso a esta empresa.',
  ORGANIZATION_INACTIVE: 'La empresa está inactiva.',
  INVALID_MEMBERSHIP_TRANSITION: 'Ese cambio de estado no está permitido para la membresía.',
  MEMBERSHIP_ALREADY_EXISTS: 'La persona ya tiene una membresía en esa empresa.',
  SELF_MODIFICATION_FORBIDDEN: 'No puedes modificar tu propia membresía.',
  ROLE_GRANT_NOT_ALLOWED: 'No tienes permiso para otorgar ese rol.',
  ROLE_NOT_ASSIGNABLE: 'Ese rol no se puede asignar mediante invitación.',
  USER_BELONGS_TO_OTHER_ORGANIZATION: 'Esta persona ya pertenece a otra empresa.',
  ORG_ADMIN_ALREADY_EXISTS: 'La empresa ya tiene un administrador. Para cambiarlo, primero revoca el acceso del actual (o su invitación pendiente).',
  MEMBERSHIP_NOT_REVOKED: 'Solo se puede eliminar a quien ya tiene el acceso revocado.',
  OWN_EMAIL_LOCKED: 'No puedes cambiar tu propio correo.',
  EMAIL_IN_USE: 'Ese correo ya pertenece a otra persona.',
  USER_NOT_EDITABLE: 'No puedes editar a un administrador de la plataforma.',

  // Perfil y logo de la empresa
  ORGANIZATION_NAME_DUPLICATE: 'Ya existe una empresa con ese nombre.',
  ORGANIZATION_DELETED: 'La empresa está eliminada y no se puede modificar.',
  NAME_REQUIRED: 'El nombre es obligatorio.',
  LOGO_TOO_LARGE: 'El logo supera el máximo de 512 KB.',
  LOGO_FORMAT_INVALID: 'El logo debe ser una imagen PNG, JPG o WebP.',

  // Empresas vinculadas
  LINK_SELF: 'Una empresa no puede vincularse consigo misma.',
  LINK_COUNTERPART_UNAVAILABLE: 'Esa empresa no está disponible para vincularse.',
  LINK_ALREADY_ACTIVE: 'Ya existe un vínculo vigente con esa empresa para ese tipo de relación.',
  LINK_REQUEST_PENDING: 'Ya enviaste una solicitud pendiente a esa empresa.',
  LINK_INVERSE_PENDING: 'Esa empresa ya te envió una solicitud: respóndela desde «Solicitudes».',
  LINK_REQUEST_CONFLICT: 'Ya existe una solicitud para estas empresas.',
  LINK_NOT_FOUND: 'El vínculo no existe.',
  LINK_NOT_REQUESTER: 'Solo la empresa que envió la solicitud puede cancelarla.',
  LINK_CANNOT_RESPOND_OWN: 'No puedes responder una solicitud que enviaste tú: la responde la otra empresa.',
  LINK_ORGANIZATION_INACTIVE: 'Las dos empresas deben estar activas para aceptar el vínculo.',
  INVALID_LINK_TRANSITION: 'Ese cambio no está permitido para el estado actual del vínculo.',
  SEARCH_TOO_SHORT: 'Escribe al menos 3 caracteres para buscar.',
  EXTERNAL_COUNTERPART_DUPLICATE: 'Ya registraste una contraparte con ese nombre o documento.',
  EXTERNAL_COUNTERPART_NOT_FOUND: 'La contraparte no existe.',
  COUNTERPART_REGISTERED: 'Esa empresa ya está registrada en LoGyCO₂: solicita el vínculo en lugar de registrarla como externa.',
  FIELD_REQUIRED: 'Ese dato es obligatorio.',

  // Invitaciones
  INVITATION_NOT_FOUND: 'La invitación no existe.',
  INVITATION_NOT_AVAILABLE: 'La invitación no está disponible.',
  INVITATION_EXPIRED: 'La invitación expiró.',
  INVITATION_NOT_PENDING: 'La invitación ya no está pendiente.',
  INVITATION_ALREADY_PENDING: 'Ya existe una invitación pendiente para esa persona.',

  // Superadministradores y administración global
  PLATFORM_ADMIN_REQUIRED: 'Esta acción requiere ser superadministrador de la plataforma.',
  SUPER_ADMIN_LIMIT_REACHED: SUPER_ADMIN_LIMIT_MESSAGE,
  LAST_GLOBAL_ADMIN: 'No se puede revocar al último superadministrador activo: la plataforma quedaría sin administración.',
  CONFIRMATION_REQUIRED: 'Debes confirmar la operación de forma explícita.',
  ALREADY_SUPER_ADMIN: 'Esa persona ya es superadministradora.',
  SUPER_ADMIN_INVITATION_EXISTS: 'Ya existe una invitación pendiente para ese correo.',
  SUPER_ADMIN_INVITATION_NOT_FOUND: 'El código no corresponde a ninguna invitación disponible.',
  IDENTITY_NOT_VERIFIED: 'No fue posible verificar que tu identidad corresponda a la persona invitada.',
  INVALID_RANGE: 'La fecha inicial debe ser anterior a la final.',
  RANGE_TOO_LONG: 'El rango máximo permitido es de un año.',

  // Vehículos de la empresa
  VEHICLE_ALREADY_REGISTERED: 'Esta placa ya está registrada en tu empresa.',
  VEHICLE_STRUCTURAL_CONFIRMATION_REQUIRED: 'Cambiar la configuración o el tipo del vehículo modifica su estructura. Marca la confirmación para continuar.',
  INVALID_PLATE: 'La placa no es válida. Revisa que tenga el formato correcto, por ejemplo ABC123.',
  INVALID_VEHICLE_FIELD: 'Uno de los datos del vehículo no es válido. Revisa los campos marcados.',
  FINDING_NOT_RESOLVABLE: 'Este hallazgo no se puede resolver: solo las inconsistencias y los datos incompletos se resuelven.',
  FINDING_ALREADY_RESOLVED: 'Este hallazgo ya se resolvió con otra decisión. Actualiza la revisión.',
  FINDING_WITHOUT_VEHICLE: 'Este hallazgo no tiene un vehículo registrado. Confírmalo primero como vehículo nuevo.',
  INVALID_FIELDS: 'Los campos elegidos no tienen un valor en el archivo. Elige otros campos.',
  FINDING_STALE: 'El vehículo cambió después del análisis. Vuelve a analizar el archivo o revisa los datos actuales.',
  ANALYSIS_NOT_RETRYABLE: 'Este análisis no se puede reintentar porque no falló. Actualiza la lista.',
  ANALYSIS_FILE_UNAVAILABLE: 'El archivo de este análisis ya no está disponible. Vuelve a cargarlo.',
  NOTIFICATION_NOT_FOUND: 'La notificación ya no está disponible.',
  VEHICLE_NOT_FOUND: 'El vehículo no existe en tu empresa. Vuelve a la lista y actualízala.',
  ANALYSIS_NOT_FOUND: 'El análisis no existe. Vuelve a cargar el archivo.',
  FINDING_NOT_FOUND: 'El hallazgo no existe. Actualiza la revisión.',
  ANALYSIS_NOT_COMPLETED: 'El análisis aún no termina. Espera a que finalice e inténtalo de nuevo.',
  FILE_TOO_LARGE: 'El archivo supera el tamaño permitido. Divídelo en partes más pequeñas e inténtalo de nuevo.',
  UNSUPPORTED_FILE: 'El archivo no es válido. Sube un libro de Excel con extensión .xlsx.',

  // Directorio corporativo
  // LoGyCO₂ Intelligence
  SECTOR_DATA_FORBIDDEN: 'No tienes acceso a los indicadores sectoriales.',
  INDICATOR_NOT_FOUND: 'El indicador solicitado no existe.',
  SOURCE_NOT_FOUND: 'La fuente solicitada no existe.',
  SOURCE_NOT_AVAILABLE: 'Esta fuente aún no tiene una publicación oficial que se pueda leer automáticamente.',
  DIRECTORY_SERVICE_UNAVAILABLE: 'El directorio corporativo no está disponible.',
  DIRECTORY_USER_NOT_FOUND: 'No se encontró la persona en el directorio corporativo.',
  DIRECTORY_USER_ALREADY_EXISTS: 'La persona ya existe en el directorio corporativo.',

  // Genéricos
  VALIDATION_ERROR: 'Revisa los datos ingresados: hay campos inválidos.',
  FORBIDDEN: 'No tienes permisos para realizar esta acción.',
  NOT_FOUND: 'No se encontró el recurso solicitado.',
  RESOURCE_NOT_FOUND: 'No se encontró el recurso solicitado.',
  CONFLICT: 'La operación entra en conflicto con el estado actual del recurso.',
  DB_CONFLICT: 'La operación entra en conflicto con el estado actual del recurso.',
  TOO_MANY_REQUESTS: 'Demasiadas solicitudes. Inténtalo de nuevo en unos momentos.',
  SERVICE_UNAVAILABLE: 'El servicio no está disponible temporalmente.',
  DB_UNAVAILABLE: 'El servicio no está disponible temporalmente.',
  EXTERNAL_SERVICE_ERROR: 'Un servicio externo no respondió correctamente.',
  INTERNAL_ERROR: 'Ocurrió un error interno. Inténtalo de nuevo más tarde.',
};

export const NETWORK_ERROR_MESSAGE =
  'No fue posible comunicarse con el servidor. Verifica tu conexión e inténtalo de nuevo.';
export const GENERIC_ERROR_MESSAGE = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

const STATUS_FALLBACKS: Readonly<Record<number, string>> = {
  400: 'La solicitud no es válida.',
  401: 'Tu sesión expiró o no es válida. Inicia sesión nuevamente.',
  403: 'No tienes permisos para realizar esta acción.',
  404: 'No se encontró el recurso solicitado.',
  409: 'La operación entra en conflicto con el estado actual del recurso.',
  422: 'Revisa los datos ingresados: hay campos inválidos.',
  429: 'Demasiadas solicitudes. Inténtalo de nuevo en unos momentos.',
  502: 'Un servicio externo no respondió correctamente.',
  503: 'El servicio no está disponible temporalmente.',
};

export function kindForStatus(status: number): AppErrorKind {
  if (status === 0) return 'network';
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 400 || status === 422) return 'validation';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** Resuelve el mensaje: primero por código, luego por estado HTTP, al final genérico. */
export function messageFor(code: string | null, status: number): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (status === 0) return NETWORK_ERROR_MESSAGE;
  return STATUS_FALLBACKS[status] ?? GENERIC_ERROR_MESSAGE;
}
