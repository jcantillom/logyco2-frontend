import { PermissionCode } from '../../domain/models/identity';

export type NavGroupId = 'start' | 'data' | 'carbon' | 'decarb' | 'results' | 'admin';

export interface NavItem {
  readonly label: string;
  readonly path: string;
  /** Path SVG (viewBox 24, trazo). */
  readonly icon: string;
  /** Visible si el usuario tiene AL MENOS uno de estos permisos (vacío = siempre). */
  readonly requires: readonly PermissionCode[];
  /** `true` si la capacidad todavía no tiene backend: se atenúa y se marca «Próximamente». */
  readonly soon: boolean;
  readonly group: NavGroupId;
}

export interface NavGroup {
  readonly id: NavGroupId;
  readonly title: string;
}

/** Estructura estable del menú de la empresa: cada capacidad se habilita cuando esté lista (`soon: false`). */
export const NAV_GROUPS: readonly NavGroup[] = [
  { id: 'start', title: 'Inicio' },
  { id: 'data', title: 'Datos operativos' },
  { id: 'carbon', title: 'Huella de carbono' },
  { id: 'decarb', title: 'Descarbonización' },
  { id: 'results', title: 'Resultados' },
  { id: 'admin', title: 'Administración' },
];

/** Permisos de visualización del catálogo existente; la autorización real es del backend. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Resumen', path: '/resumen', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z', requires: [], soon: false, group: 'start' },
  { label: 'Mis vehículos', path: '/vehiculos', icon: 'M3 7h18v10H3zM6.5 12h2M11 12h2M15.5 12h2', requires: ['vehicles:read'], soon: false, group: 'data' },
  { label: 'Cargar información', path: '/cargas', icon: 'M12 16V4M7 9l5-5 5 5M4 20h16', requires: ['imports:create'], soon: false, group: 'data' },
  { label: 'Calidad de datos', path: '/calidad', icon: 'M9 4h6l1 2h3v15H5V6h3zM9 14l2 2 4-4', requires: ['imports:create'], soon: false, group: 'data' },
  { label: 'Operaciones logísticas', path: '/operaciones', icon: 'M2 6h12v10H2zM14 9h4l3 3v4h-7zM5 19.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M16 19.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0', requires: ['indicators:read'], soon: false, group: 'data' },
  { label: 'Mis emisiones', path: '/emisiones', icon: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19c2-5 6-8 10-10', requires: ['indicators:read'], soon: true, group: 'carbon' },
  { label: 'Análisis de emisiones', path: '/analisis', icon: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6M20 16v-9', requires: ['indicators:read'], soon: true, group: 'carbon' },
  { label: 'Plan de reducción', path: '/reduccion', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', requires: ['indicators:read'], soon: true, group: 'carbon' },
  // La guía es la misma pantalla de la consola (`EmissionsComponent`). Solo la ve quien administra la empresa: `organizations:manage` lo tiene
  // únicamente ORG_ADMIN entre los roles de empresa (los endpoints de `/emissions` los puede leer cualquier persona autenticada).
  { label: 'Cálculo de emisiones', path: '/calculo-emisiones', icon: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', requires: ['organizations:manage'], soon: false, group: 'decarb' },
  { label: 'Reportes', path: '/reportes', icon: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 17v-3M12 17v-6M15 17v-4', requires: ['reports:read'], soon: true, group: 'results' },
  { label: 'Usuarios y accesos', path: '/usuarios', icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M17 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.7', requires: ['users:read', 'memberships:manage'], soon: false, group: 'admin' },
  { label: 'Datos de mi empresa', path: '/mi-empresa', icon: 'M3 21h18M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M9 8h2M9 12h2M9 16h2', requires: ['organizations:read'], soon: false, group: 'admin' },
];

/** Pie del menú: no depende de permisos ni de la empresa. */
export const HELP_ITEM = { label: 'Ayuda y soporte', path: '/ayuda', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01' } as const;
