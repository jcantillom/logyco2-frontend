import { Routes } from '@angular/router';

/** Rutas hijas de `/plataforma`. El guard del padre (`platformGuard`) confirma el rol global antes de activarlas. */
export const PLATFORM_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'resumen' },
  { path: 'resumen', data: { breadcrumb: 'Resumen' }, loadComponent: () => import('./platform-dashboard.component').then((m) => m.PlatformDashboardComponent) },
  { path: 'organizaciones', data: { breadcrumb: 'Empresas' }, children: [
    { path: '', loadComponent: () => import('./platform-organizations.component').then((m) => m.PlatformOrganizationsComponent) },
    { path: ':id', data: { breadcrumb: 'Detalle' }, loadComponent: () => import('./platform-organization-detail.component').then((m) => m.PlatformOrganizationDetailComponent) },
  ] },
  { path: 'usuarios', data: { breadcrumb: 'Usuarios' }, children: [
    { path: '', loadComponent: () => import('./platform-users.component').then((m) => m.PlatformUsersComponent) },
    { path: ':id', data: { breadcrumb: 'Detalle' }, loadComponent: () => import('./platform-user-detail.component').then((m) => m.PlatformUserDetailComponent) },
  ] },
  // «Métricas operativas» se integró en el Resumen: se conserva la dirección para no romper enlaces ni marcadores.
  { path: 'metricas', pathMatch: 'full', redirectTo: 'resumen' },
  { path: 'configuracion', data: { breadcrumb: 'Mi cuenta', platform: true }, loadComponent: () => import('../settings/settings.component').then((m) => m.SettingsComponent) },
  { path: 'estado', data: { breadcrumb: 'Estado de la plataforma' }, loadComponent: () => import('./platform-status.component').then((m) => m.PlatformStatusComponent) },
  { path: 'superadministradores', data: { breadcrumb: 'Superadministradores' }, children: [
    { path: '', loadComponent: () => import('./platform-super-admins.component').then((m) => m.PlatformSuperAdminsComponent) },
    { path: ':id', data: { breadcrumb: 'Detalle' }, loadComponent: () => import('./platform-super-admin-detail.component').then((m) => m.PlatformSuperAdminDetailComponent) },
  ] },
  { path: 'roles', data: { breadcrumb: 'Roles y accesos' }, children: [
    { path: '', loadComponent: () => import('./platform-rbac.component').then((m) => m.PlatformRbacComponent) },
    { path: 'matriz', data: { breadcrumb: 'Matriz técnica' }, loadComponent: () => import('./platform-rbac-matrix.component').then((m) => m.PlatformRbacMatrixComponent) },
  ] },
  { path: 'vehiculos', data: { breadcrumb: 'Vehículos', title: 'Vehículos', description: 'Permitirá consultar los vehículos registrados en la plataforma; la placa identifica un vehículo, no una operación.' }, loadComponent: () => import('../system/coming-soon.component').then((m) => m.ComingSoonComponent) },
  { path: 'operaciones', data: { breadcrumb: 'Operaciones de transporte', title: 'Operaciones de transporte (viajes y envíos)', description: 'Permitirá consultar las operaciones de transporte, distinguiendo vehículo, viaje, envío, carga y participantes.' }, loadComponent: () => import('../system/coming-soon.component').then((m) => m.ComingSoonComponent) },
  { path: 'cargas', data: { breadcrumb: 'Cargas masivas', title: 'Cargas masivas (vista administrativa)', description: 'Permitirá consultar las cargas masivas de archivos y sus incidencias, separando la transferencia del archivo del procesamiento de registros.' }, loadComponent: () => import('../system/coming-soon.component').then((m) => m.ComingSoonComponent) },
  { path: 'calidad', data: { breadcrumb: 'Centro de calidad', title: 'Centro de calidad y conciliación', description: 'Permitirá revisar los casos de calidad y conciliación sin sobrescribir nunca el valor original declarado.' }, loadComponent: () => import('../system/coming-soon.component').then((m) => m.ComingSoonComponent) },
  { path: 'auditoria', data: { breadcrumb: 'Actividad y auditoría' }, loadComponent: () => import('./platform-audit.component').then((m) => m.PlatformAuditComponent) },
  { path: 'metodologias', data: { breadcrumb: 'Metodologías y factores', title: 'Metodologías y factores de emisión', description: 'Permitirá consultar las metodologías y los factores de emisión, sin cambios retroactivos silenciosos sobre reportes publicados.' }, loadComponent: () => import('../system/coming-soon.component').then((m) => m.ComingSoonComponent) },
  { path: 'reportes', data: { breadcrumb: 'Reportes globales', title: 'Reportes globales', description: 'Permitirá consultar los indicadores globales de la plataforma con su metodología y criterio de agregación.' }, loadComponent: () => import('../system/coming-soon.component').then((m) => m.ComingSoonComponent) },
  { path: 'intelligence', data: { breadcrumb: 'LoGyCO₂ Intelligence' }, children: [
    { path: '', pathMatch: 'full', redirectTo: 'energia' },
    { path: 'energia', data: { section: 'energy', breadcrumb: 'Mercado energético' }, loadComponent: () => import('../intelligence/intelligence.component').then((m) => m.IntelligenceComponent) },
    { path: 'costos', data: { section: 'costs', breadcrumb: 'Costos de transporte' }, loadComponent: () => import('../intelligence/intelligence.component').then((m) => m.IntelligenceComponent) },
    // Fuera del foco del producto (2026-11-18): se retiran de la navegación y redirigen, sin borrar datos ni endpoints.
    { path: 'sectorial', redirectTo: 'energia' },
    { path: 'sostenibilidad', redirectTo: 'energia' },
    { path: 'fuentes', data: { breadcrumb: 'Administración de fuentes' }, loadComponent: () => import('../intelligence/intelligence-admin.component').then((m) => m.IntelligenceAdminComponent) },
    { path: '**', redirectTo: 'energia' },
  ] },
  { path: '**', redirectTo: 'resumen' },
];
