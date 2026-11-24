import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard, tokenGuard } from './core/guards/auth.guards';
import { homeGuard, workspaceGuard } from './core/guards/landing.guards';
import { platformGuard, platformMatch } from './core/guards/platform.guards';
import { PLATFORM_ROUTES } from './features/platform/platform.routes';
import { ShellComponent } from './shared/layouts/shell.component';

/** Todas las pantallas se cargan bajo demanda (lazy). */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    // Pública: el enlace del correo (código en el fragmento) es la credencial de la persona invitada.
    path: 'activar',
    loadComponent: () => import('./features/auth/activate-account.component').then((m) => m.ActivateAccountComponent),
  },
  {
    path: 'aceptar-invitacion',
    canActivate: [tokenGuard],
    loadComponent: () =>
      import('./features/auth/accept-invitation.component').then((m) => m.AcceptInvitationComponent),
  },
  {
    // Consola global: contexto separado del espacio de empresa. Exige rol GLOBAL SUPER_ADMIN
    // confirmado con una consulta fresca a /auth/me; cualquier fallo se interpreta como denegado.
    path: 'plataforma',
    canMatch: [platformMatch],
    canActivate: [authGuard, platformGuard],
    loadComponent: () => import('./features/platform/platform-shell.component').then((m) => m.PlatformShellComponent),
    children: PLATFORM_ROUTES,
  },
  {
    path: 'acceso-pendiente',
    canActivate: [authGuard],
    loadComponent: () => import('./features/system/system-pages.component').then((m) => m.PendingAccessComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', canActivate: [homeGuard], children: [] },
      { path: 'inicio', pathMatch: 'full', redirectTo: 'resumen' },
      {
        path: 'resumen',
        data: { breadcrumb: 'Resumen', wide: true },
        canActivate: [workspaceGuard],
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'mi-empresa',
        data: { breadcrumb: 'Datos de mi empresa' },
        canActivate: [permissionGuard('organizations:read')],
        loadComponent: () => import('./features/organizations/company-profile.component').then((m) => m.CompanyProfileComponent),
      },
      // Enlaces anteriores: la lista y el detalle de «Empresas» se reemplazaron por «Datos de mi empresa».
      { path: 'organizaciones', redirectTo: 'mi-empresa' },
      { path: 'organizaciones/:id', redirectTo: 'mi-empresa' },
      {
        path: 'usuarios',
        data: { breadcrumb: 'Usuarios y accesos', wide: true },
        canActivate: [permissionGuard('users:read', 'memberships:manage')],
        loadComponent: () => import('./features/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'vehiculos',
        data: { breadcrumb: 'Mis vehículos', wide: true },
        canActivate: [permissionGuard('vehicles:read')],
        loadComponent: () => import('./features/vehicles/vehicles.component').then((m) => m.VehiclesComponent),
      },
      {
        // La misma guía de la consola, en el espacio de empresa y solo para quien lo administra (`fit`: cabe en una pantalla, sin scroll de página).
        path: 'calculo-emisiones',
        data: { breadcrumb: 'Cálculo de emisiones', wide: true, fit: true },
        canActivate: [permissionGuard('organizations:manage')],
        loadComponent: () => import('./features/emissions/emissions.component').then((m) => m.EmissionsComponent),
      },
      {
        path: 'operaciones',
        data: { breadcrumb: 'Operaciones logísticas', wide: true },
        canActivate: [permissionGuard('indicators:read')],
        loadComponent: () => import('./features/operations/operations.component').then((m) => m.OperationsComponent),
      },
      { path: 'operaciones/:id', pathMatch: 'full', redirectTo: 'operaciones' },
      {
        path: 'cargas',
        data: { breadcrumb: 'Cargar información', wide: true },
        canActivate: [permissionGuard('imports:create')],
        loadComponent: () => import('./features/imports/imports.component').then((m) => m.ImportsComponent),
      },
      {
        path: 'conciliacion',
        data: {
          breadcrumb: 'Conciliación',
          title: 'Conciliación y calidad de datos',
          description: 'Mostrará las discrepancias entre los valores declarados y registrará las decisiones con su justificación y evidencia, sin sobrescribir los valores declarados.',
        },
        canActivate: [permissionGuard('indicators:read')],
        loadComponent: () => import('./features/system/coming-soon.component').then((m) => m.ComingSoonComponent),
      },
      {
        path: 'calidad',
        // Los posibles duplicados se resuelven con el mismo permiso que sube las cargas (los endpoints exigen `imports:create`).
        data: { breadcrumb: 'Calidad de datos', wide: true },
        canActivate: [permissionGuard('imports:create')],
        loadComponent: () => import('./features/quality/quality.component').then((m) => m.QualityComponent),
      },
      {
        path: 'analisis',
        data: {
          breadcrumb: 'Análisis de emisiones',
          title: 'Análisis de emisiones',
          description: 'Identificará qué vehículos, combustibles, rutas y operaciones generan mayor impacto, para pasar del resultado general a las causas concretas.',
        },
        canActivate: [permissionGuard('indicators:read')],
        loadComponent: () => import('./features/system/coming-soon.component').then((m) => m.ComingSoonComponent),
      },
      {
        path: 'ayuda',
        data: {
          breadcrumb: 'Ayuda y soporte',
          title: 'Ayuda y soporte',
          description: 'Reunirá guías de uso y el canal de soporte de LoGyCO₂.',
        },
        loadComponent: () => import('./features/system/coming-soon.component').then((m) => m.ComingSoonComponent),
      },
      {
        path: 'evidencias',
        data: {
          breadcrumb: 'Evidencias',
          title: 'Evidencias y trazabilidad',
          description: 'Reunirá las evidencias y el historial de cambios de los datos.',
        },
        canActivate: [permissionGuard('indicators:read')],
        loadComponent: () => import('./features/system/coming-soon.component').then((m) => m.ComingSoonComponent),
      },
      {
        path: 'emisiones',
        data: {
          breadcrumb: 'Emisiones',
          title: 'Emisiones',
          description: 'Mostrará las cifras, la intensidad y los factores de emisión, calculados con una metodología documentada.',
        },
        canActivate: [permissionGuard('indicators:read')],
        loadComponent: () => import('./features/system/coming-soon.component').then((m) => m.ComingSoonComponent),
      },
      {
        path: 'reportes',
        data: {
          breadcrumb: 'Reportes',
          title: 'Reportes y versiones',
          description: 'Reunirá los reportes y sus versiones, y permitirá descargarlos.',
        },
        canActivate: [permissionGuard('reports:read')],
        loadComponent: () => import('./features/system/coming-soon.component').then((m) => m.ComingSoonComponent),
      },
      {
        path: 'reduccion',
        data: {
          breadcrumb: 'Planes de reducción',
          title: 'Planes de reducción',
          description: 'Permitirá consultar y crear planes de reducción de emisiones.',
        },
        canActivate: [permissionGuard('indicators:read')],
        loadComponent: () => import('./features/system/coming-soon.component').then((m) => m.ComingSoonComponent),
      },
      {
        path: 'intelligence',
        data: { breadcrumb: 'LoGyCO₂ Intelligence' },
        canActivate: [permissionGuard('sector_reports:read')],
        children: [
          { path: '', pathMatch: 'full', loadComponent: () => import('./features/intelligence/intelligence.component').then((m) => m.IntelligenceComponent) },
          // Detalle de cada sección dentro del espacio de la empresa: quien tiene `sector_reports:read` lo ve sin pasar por la consola de plataforma.
          { path: 'energia', data: { section: 'energy', breadcrumb: 'Mercado energético' }, loadComponent: () => import('./features/intelligence/intelligence.component').then((m) => m.IntelligenceComponent) },
          { path: 'costos', data: { section: 'costs', breadcrumb: 'Costos de transporte' }, loadComponent: () => import('./features/intelligence/intelligence.component').then((m) => m.IntelligenceComponent) },
          { path: '**', redirectTo: '' },
        ],
      },
      {
        path: 'configuracion',
        data: { breadcrumb: 'Configuración' },
        loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'acceso-denegado',
        data: { breadcrumb: 'Acceso denegado' },
        loadComponent: () => import('./features/system/system-pages.component').then((m) => m.ForbiddenComponent),
      },
      {
        path: '**',
        data: { breadcrumb: 'No encontrada' },
        loadComponent: () => import('./features/system/system-pages.component').then((m) => m.NotFoundComponent),
      },
    ],
  },
];
