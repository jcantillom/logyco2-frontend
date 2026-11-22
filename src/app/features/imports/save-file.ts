/**
 * Guarda un archivo en el equipo: URL temporal del navegador + ancla temporal, y la URL se libera al terminar. Recibe el `Document` para
 * poder probarse sin descargar nada.
 */
export function saveFile(document: Document, blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Se libera en la tarea siguiente: algunos navegadores todavía necesitan la URL para iniciar la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
