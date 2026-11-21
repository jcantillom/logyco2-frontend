export interface PlatformNavItem {
  readonly label: string;
  readonly path: string;
  readonly icon: string;
  /** Funcionalidad futura: se rotula «Próximamente». */
  readonly soon?: boolean;
  /** Activo solo con la ruta exacta (p. ej. el «Resumen» de un grupo cuyos hijos comparten prefijo). */
  readonly exact?: boolean;
}
export interface PlatformNavGroup {
  readonly title: string;
  readonly items: readonly PlatformNavItem[];
  /** El grupo se puede plegar con su chevron (el primero siempre está visible). */
  readonly collapsible?: boolean;
  /** Icono del grupo (p. ej. la hoja de «Descarbonización»). */
  readonly icon?: string;
  /** Categoría padre: se dibuja como un ítem con sus subcategorías anidadas debajo (no como un rótulo de sección). */
  readonly parent?: boolean;
  /** Se ancla al pie del menú, como categoría aparte. */
  readonly pinned?: boolean;
}

export const PLATFORM_NAV: readonly PlatformNavGroup[] = [
  { title: 'Panel general', items: [
    { label: 'Resumen', path: '/plataforma/resumen', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
  ] },
  { title: 'Administración', collapsible: true, items: [
    { label: 'Empresas', path: '/plataforma/organizaciones', icon: 'M3 21h18M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M9 8h2M9 12h2M9 16h2' },
    { label: 'Usuarios', path: '/plataforma/usuarios', icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M17 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.7' },
    { label: 'Superadministradores', path: '/plataforma/superadministradores', icon: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5zM5 21h14' },
  ] },
  { title: 'Herramientas complementarias', collapsible: true, items: [
    { label: 'Referencias de combustibles', path: '/plataforma/intelligence/energia', icon: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M7 8h6M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3' },
    { label: 'Indicadores de costos', path: '/plataforma/intelligence/costos', icon: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6' },
  ] },
  { title: 'Seguridad', collapsible: true, items: [
    { label: 'Roles y accesos', path: '/plataforma/roles', exact: true, icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5' },
    { label: 'Matriz técnica', path: '/plataforma/roles/matriz', icon: 'M3 5h18v14H3zM3 10h18M9 5v14M15 5v14' },
  ] },
  { title: 'Sistema', pinned: true, items: [
    { label: 'Actividad y auditoría', path: '/plataforma/auditoria', icon: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4' },
    { label: 'Estado de la plataforma', path: '/plataforma/estado', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  ] },
];
