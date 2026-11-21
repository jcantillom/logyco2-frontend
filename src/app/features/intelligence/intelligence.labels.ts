import { SourceStatus } from '../../domain/models/intelligence';

/** Textos compartidos de LoGyCO₂ Intelligence (consulta y administración). */
export const ERROR_LABELS: Readonly<Record<string, string>> = {
  ICTC_UNREACHABLE: 'La fuente del DANE no respondió',
  ICTC_NOT_FOUND: 'No se encontró un anexo reciente',
  ICTC_FORMAT_CHANGED: 'Cambió el formato del anexo',
  ICTC_UNEXPECTED_RESPONSE: 'Respuesta inesperada de la fuente',
  GNCV_UNREACHABLE: 'datos.gov.co no respondió',
  GNCV_UNEXPECTED_RESPONSE: 'Respuesta inesperada de datos.gov.co',
  GNCV_FORMAT_CHANGED: 'Cambió el formato de la fuente',
  PORT_UNREACHABLE: 'La Supertransporte (datos.gov.co) no respondió',
  PORT_UNEXPECTED_RESPONSE: 'La Supertransporte respondió con un error',
  PORT_FORMAT_CHANGED: 'Cambió el formato de los datos de tráfico portuario',
  PORT_VALIDATION_FAILED: 'Los datos de tráfico portuario no pasaron la validación',
  PORT_NO_DATA: 'No hay meses de tráfico portuario con cobertura suficiente',
  CREG_INDEX_UNREACHABLE: 'La CREG no respondió',
  CREG_INDEX_FORMAT_CHANGED: 'Cambió el índice de circulares de la CREG',
  CREG_CIRCULAR_UNREACHABLE: 'No se pudo leer una circular de la CREG',
  CREG_FORMAT_CHANGED: 'Cambió el formato de las circulares de la CREG',
  CREG_VALIDATION_FAILED: 'Los valores de la circular no pasaron la validación',
  CREG_NO_DATA: 'No se encontraron precios en las circulares',
  DATABASE_ERROR: 'Error al guardar los datos',
};

export function errorLabel(code: string): string {
  return ERROR_LABELS[code] ?? code;
}

export function statusOf(source: SourceStatus): 'ok' | 'err' | 'none' {
  return source.lastErrorCode ? 'err' : source.lastSuccessAt ? 'ok' : 'none';
}
export function statusLabel(source: SourceStatus): string {
  if (!source.providerAvailable) return 'Pendiente';

  return source.lastErrorCode ? `Falló: ${errorLabel(source.lastErrorCode)}` : source.lastSuccessAt ? 'Actualizado' : 'Sin datos';
}
