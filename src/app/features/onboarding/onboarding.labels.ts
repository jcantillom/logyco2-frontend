/** Mensajes comprensibles para los códigos de error de la incorporación (sin detalles técnicos del proveedor). */
const ERRORS: Readonly<Record<string, string>> = {
  MAIL_DISABLED: 'El envío de correos no está habilitado en este ambiente.',
  MAIL_NOT_CONFIGURED: 'El servicio de correo no está configurado.',
  MAIL_TIMEOUT: 'El servicio de correo no respondió a tiempo.',
  MAIL_UNREACHABLE: 'No se pudo contactar el servicio de correo.',
  MAIL_REJECTED: 'El servicio de correo rechazó el mensaje.',
  MAIL_PROVIDER_ERROR: 'El servicio de correo reportó un error.',
  ONBOARDING_NOT_CONFIGURED: 'Falta configurar la URL pública de acceso a LoGyCO₂.',
  DIRECTORY_NOT_CONFIGURED: 'El directorio corporativo no está configurado.',
  DIRECTORY_TIMEOUT: 'El directorio corporativo no respondió a tiempo.',
  DIRECTORY_PROVIDER_ERROR: 'El directorio corporativo no está disponible.',
  DIRECTORY_SERVICE_REJECTED: 'El directorio corporativo rechazó la cuenta de servicio.',
  DIRECTORY_DATA_REJECTED: 'El directorio corporativo rechazó los datos de la persona.',
  DIRECTORY_PASSWORD_REJECTED: 'La contraseña no cumple la política corporativa: usa mayúsculas, minúsculas, números y un símbolo.',
};

export function onboardingError(code: string | null | undefined): string {
  return (code && ERRORS[code]) || (code ? 'No se pudo completar el paso. Reintenta en unos minutos.' : '');
}

export const NEXT_STEP_HINT: Readonly<Record<string, string>> = {
  RETRY_IDENTITY: 'La identidad aún no se creó. Reintenta: no se duplicará.',
  RESEND_EMAIL: 'El correo no salió. Reenvíalo: no se vuelve a crear la identidad.',
  WAIT_ACTIVATION: 'Esperando que la persona abra su enlace y elija su contraseña.',
  WAIT_ACCEPTANCE: 'Esperando que la persona inicie sesión y acepte la invitación.',
  DONE: 'Incorporación completada.',
};

export const ROLE_NAMES: Readonly<Record<string, string>> = { ORG_ADMIN: 'Administrador de la empresa', ORG_ANALYST: 'Analista', ORG_OPERATOR: 'Operador', ORG_VIEWER: 'Consulta' };
