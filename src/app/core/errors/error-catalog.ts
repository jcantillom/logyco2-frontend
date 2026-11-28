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
  SESSION_NOT_SAVED:
    'La sesión no se guardó: el navegador rechazó la cookie de sesión. Abre la aplicación con el mismo host que la API (localhost y 127.0.0.1 son distintos), permite las cookies del sitio y vuelve a intentar.',
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
  INVALID_CURSOR: 'La lista cambió y la página pedida ya no es válida. Vuelve a la primera página.',
  INVALID_LIMIT: 'Esa cantidad de viajes por página no está permitida.',
  INVALID_PERIOD: 'El periodo no es válido: indica la fecha inicial y la final, y que la inicial no sea posterior.',
  INVALID_GRANULARITY: 'Esa granularidad no es válida: elige diaria, semanal, mensual, trimestral, semestral o anual.',
  GRANULARITY_TOO_FINE: 'El periodo es demasiado largo para ver la serie diaria. Elige granularidad semanal o mensual, o un periodo más corto.',
  INVALID_STATUS: 'Ese estado no es válido para filtrar los viajes.',
  EXPORT_TOO_LARGE: 'El reporte tiene demasiados viajes: acótalo con un periodo o un filtro e inténtalo de nuevo.',
  EXPORT_NOT_FOUND: 'El reporte no existe.',
  EXPORT_IN_PROGRESS: 'Ya tienes un reporte en cola o generándose. Espera a que termine o cancélalo para pedir otro.',
  EXPORT_LIMIT: 'Tu empresa ya tiene el máximo de reportes generándose. Inténtalo cuando termine alguno.',
  EXPORT_QUOTA_EXCEEDED: 'Los reportes guardados de tu empresa ocupan todo el espacio permitido. Espera a que venzan los anteriores para generar uno nuevo.',
  EXPORT_NOT_READY: 'El reporte todavía no está listo para descargar.',
  EXPORT_EXPIRED: 'El reporte venció y su archivo ya no está disponible. Genéralo de nuevo.',
  EXPORT_NOT_ACTIVE: 'El reporte ya no se puede cancelar: terminó, falló o ya estaba cancelado.',
  EXPORT_BUSY: 'Hay reportes generándose. Inténtalo en unos segundos.',
  EXPORT_FAILED: 'No se pudo generar el reporte. Inténtalo de nuevo; si persiste, contacta al administrador.',
  EXPORT_STORAGE_FULL: 'No hay espacio suficiente en el almacenamiento para generar el reporte. Contacta al administrador.',
  COMPANY_BUSY: 'Hay una carga procesándose en tu empresa. Inténtalo en unos segundos.',
  TRIP_VERSION_CONFLICT: 'Alguien más modificó este viaje. Revisa los datos actuales y vuelve a guardar.',
  TRIP_ALREADY_CALCULATED: 'Este viaje ya está calculado: completar solo agrega datos que faltan.',
  TRIP_NOT_EDITABLE: 'Este viaje ya no se puede completar: es un duplicado o su carga no terminó.',
  TRIP_HAS_CONFIRMED_MATCH: 'Este viaje ya está confirmado con una empresa vinculada y no se puede completar.',
  TRIP_NOT_COMPLETABLE: 'A este viaje no se le puede completar datos en pantalla.',
  FIELD_NOT_EDITABLE: 'Ese dato no se puede completar en este viaje.',
  MANUAL_TRIP_REPEATED: 'Ya hay un viaje de ese vehículo en esa fecha y con esa ruta. Si es otro viaje, confírmalo.',
  IDEMPOTENCY_KEY_REQUIRED: 'No se pudo registrar el viaje. Inténtalo de nuevo.',
  IDEMPOTENCY_KEY_INVALID: 'No se pudo registrar el viaje. Inténtalo de nuevo.',
  TRIP_NOT_MANUAL: 'Solo se pueden anular los viajes registrados manualmente. Los de un archivo se corrigen cargándolo de nuevo.',
  PLATE_NOT_REGISTERED: 'Ese vehículo no está registrado en tu empresa. Regístralo primero en «Mis vehículos».',
  VEHICLE_FUEL_MISSING: 'El vehículo no tiene combustible registrado. Elige el combustible del viaje o complétalo en «Mis vehículos».',
  FUEL_MISMATCH: 'El combustible del viaje es el del vehículo y no se puede cambiar.',
  UNIT_INCOMPATIBLE: 'La unidad no corresponde al combustible del vehículo. Elige una de las que se ofrecen.',
  DATE_OUT_OF_RANGE: 'La fecha debe estar entre el 1 de enero de 2000 y mañana.',
  INVALID_FIELD_VALUE: 'Hay datos no válidos. Corrígelos y vuelve a guardar.',
  COMPLETION_TOO_LARGE: 'Son más de 5.000 viajes por vez. Acota a una carga o a menos placas.',
  COMPLETION_TOKEN_INVALID: 'La confirmación no corresponde a lo que revisaste. Revísalo de nuevo.',
  COMPLETION_TOKEN_EXPIRED: 'La revisión venció. Revísala de nuevo antes de aplicar.',
  COMPLETION_PREVIEW_STALE: 'Hay más viajes afectados que en la revisión. Revísala de nuevo antes de aplicar.',
  IMPORT_HAS_CORRECTIONS: 'Esta carga tiene viajes completados en pantalla que no se pueden reponer con certeza al reprocesarla. No se cambió nada.',
  SEARCH_TOO_BROAD: 'La búsqueda es demasiado amplia: acótala con un rango de fechas, una placa completa o el id exacto del viaje.',
  SEARCH_TOO_SHORT: 'Escribe al menos 3 caracteres para buscar.',
  INVALID_SEARCH: 'La búsqueda tiene caracteres no válidos.',
  EXTERNAL_COUNTERPART_DUPLICATE: 'Ya registraste una contraparte con ese nombre o documento.',
  EXTERNAL_COUNTERPART_NOT_FOUND: 'La contraparte no existe.',
  COUNTERPART_REGISTERED: 'Esa empresa ya está registrada en LoGyCO₂: solicita el vínculo en lugar de registrarla como externa.',
  FIELD_REQUIRED: 'Ese dato es obligatorio.',

  // Conciliación de viajes entre empresas vinculadas
  LINK_NOT_ACTIVE: 'El vínculo ya no está vigente, así que no se puede autorizar. Revocar sí es posible.',
  SHARE_REQUIRES_MATCHING: 'Para compartir los resultados primero hay que permitir la búsqueda de viajes compartidos con esa empresa.',
  MATCHING_NOT_ACTIVE: 'La conciliación con esa empresa ya no está activa porque alguna de las dos dejó de permitirla. Actualiza la lista.',
  CANDIDATE_NOT_FOUND: 'Alguna de las coincidencias ya no está disponible para revisar. Actualiza la lista e inténtalo de nuevo.',
  CANDIDATE_ALREADY_RESOLVED: 'Esa coincidencia ya quedó resuelta y su decisión no se puede cambiar. Actualiza la lista.',
  PAIR_NOT_CONFIRMABLE: 'Este par ya no se puede confirmar. Actualiza la lista.',
  OPERATION_NOT_FOUND: 'La operación compartida ya no está disponible. Actualiza la lista e inténtalo de nuevo.',
  OPERATION_NOT_IN_CONFLICT: 'Esa operación no tiene datos en conflicto, así que no hay declaración que elegir.',
  CONSENT_REQUIRED: 'Para ver y elegir entre los valores de las dos empresas, ambas deben permitir compartir los resultados.',

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
  FILE_TOO_LARGE: 'El archivo supera el tamaño permitido. Divídelo en partes más pequeñas e inténtalo de nuevo.',
  UNSUPPORTED_FILE: 'El archivo no es válido. Sube un libro de Excel con extensión .xlsx.',
  IMPORT_NOT_FOUND: 'La carga no existe. Vuelve al historial y actualízalo.',
  IMPORT_NOT_RETRYABLE: 'Esta carga no se puede reintentar porque no falló. Actualiza el historial.',
  IMPORT_FILE_UNAVAILABLE: 'El archivo de esta carga ya no está disponible. Vuelve a subirlo.',
  IDEMPOTENCY_KEY_REUSED: 'Este envío se identificó igual que otro con un archivo distinto, por eso no se pudo completar. Vuelve a seleccionar el archivo e inténtalo de nuevo.',
  IMPORT_ALREADY_PROCESSED: 'Este archivo ya fue procesado en otra carga de tu empresa. Consulta su resultado en la cola de cargas.',
  KEEP_VERSION_NOT_CALCULATED: 'La versión que quieres conservar todavía no tiene resultado calculado. Corrige sus datos o elige la otra versión.',
  TRIP_NOT_FOUND: 'Alguno de los viajes ya no está disponible para revisar. Actualiza la lista e inténtalo de nuevo.',
  IMPORT_CALCULABLE: 'Esta carga sí tiene viajes que se pueden calcular, así que no necesita confirmación. Actualiza el historial.',
  IMPORT_NOT_REVIEWED: 'La revisión de esta carga aún no termina. Espera a que esté lista para decidir sobre sus vehículos.',
  SELECTION_TOO_LARGE: 'Seleccionaste demasiados vehículos para una sola operación. Decide por partes más pequeñas.',
  STORAGE_QUOTA_EXCEEDED: 'Se alcanzó el espacio de almacenamiento disponible para tu empresa. Contacta al administrador de la plataforma.',
  STORAGE_UNAVAILABLE: 'El almacenamiento de archivos no está disponible por ahora. Inténtalo de nuevo en unos minutos.',
  VEHICLE_NOT_FOUND: 'El vehículo no existe en tu empresa. Vuelve a la lista y actualízala.',

  // Rendimiento por vehículo y «Ficha por vehículo»
  EFFICIENCY_CONFLICT: 'Otra persona declaró el rendimiento de este vehículo al mismo tiempo. Revisa el valor vigente y vuelve a guardar.',
  EFFICIENCY_APPLY_TOO_LARGE: 'Son demasiados viajes para aplicarlos de una vez. No se cambió nada: inténtalo de nuevo en unos minutos.',
  FICHA_TOKEN_EXPIRED: 'La vista previa venció. Vuelve a cargar el archivo para revisarlo.',
  FICHA_PREVIEW_STALE: 'Los vehículos cambiaron después de la vista previa. Vuelve a cargar el archivo para revisarlo.',
  FICHA_TOKEN_INVALID: 'La confirmación no corresponde a este archivo. Vuelve a cargarlo para revisarlo.',
  FICHA_TOO_LARGE: 'La ficha tiene más filas de las permitidas. Divídela en partes más pequeñas.',
  FICHA_NOTHING_TO_APPLY: 'Ninguna fila de la ficha es válida, así que no hay nada que aplicar. Corrígela y vuelve a cargarla.',
  ESTIMATION_DISABLED: 'La estimación con referencia UPME no está disponible por ahora.',
  INVALID_ESTIMATE_SCOPE: 'La selección de vehículos para estimar no es válida. Cierra el diálogo y vuelve a abrirlo.',
  ESTIMATE_TOO_LARGE: 'Son demasiados vehículos para estimar de una vez. Hazlo por partes más pequeñas.',
  MEASURED_PROTECTED: 'Este vehículo tiene un rendimiento medido vigente. No se reemplaza sin tu confirmación.',
  ESTIMATION_MODE_OFF: 'La estimación del rendimiento está apagada en los ajustes de tu empresa. Un administrador puede activarla en Configuración.',
  CARGO_UNIT_NOT_PROPOSED: 'Esta carga ya no tiene una conversión de kilogramos para confirmar: el archivo ya declara la unidad o la propuesta cambió. Actualiza la revisión.',
  PLACE_ALREADY_RECOGNIZED: 'La plataforma ya reconoce este lugar: no hay nada que elegir. Actualiza la revisión.',
  PLACE_CHOICES_LIMIT: 'Tu empresa llegó al máximo de 1.000 lugares elegidos. Deshaz alguno que ya no necesites y vuelve a intentarlo.',
  PLACE_CHOICE_NOT_FOUND: 'Esta elección ya no existe: alguien la deshizo. Actualiza la lista.',
  UNKNOWN_MUNICIPALITY_CODE: 'Ese municipio no está en el catálogo oficial. Elige uno de la lista.',
  CHOICE_NOT_A_CANDIDATE: 'Ese municipio no es una de las opciones de este lugar. Actualiza la revisión y elige de nuevo.',
  INVALID_PLACE_TEXT: 'El texto del lugar no es válido. Actualiza la revisión.',
  INVALID_NOTE: 'La nota tiene caracteres que no se admiten. Escríbela de nuevo con texto normal.',
  ESTIMATE_PREVIEW_STALE: 'Los vehículos cambiaron después de la vista previa. Revísala de nuevo antes de aplicar.',
  INVALID_FILE: 'No se pudo leer el archivo. Usa la plantilla de la ficha, sin cambiar sus hojas ni sus columnas.',

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
