/**
 * Estilos del menú vertical compartidos por el espacio de empresa (`ShellComponent`) y la consola de
 * plataforma (`PlatformShellComponent`). Solo presentación: la estructura y los hooks de prueba viven en
 * cada plantilla. Los colores salen de los tokens `--sb-*` (ver `styles.scss`), nunca literales.
 */
export const SIDEBAR_STYLES = `
  .shell { min-height: 100vh; display: grid; grid-template-columns: var(--sidebar-w) minmax(0, 1fr); }
  .shell.collapsed { grid-template-columns: var(--sidebar-w-collapsed) minmax(0, 1fr); }
  .sidebar { position: sticky; top: 0; height: 100dvh; display: flex; flex-direction: column; gap: 16px; padding: 20px 12px 16px; overflow: hidden; z-index: 50; background: var(--sb-bg); color: var(--sb-fg); border-right: 1px solid var(--sb-line); }
  .brand { display: flex; align-items: center; min-height: 56px; padding: 4px 8px 8px; }
  .collapsed .brand { justify-content: center; padding: 8px 0; }
  .sidebar nav { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--sb-line) transparent; }
  .group { display: flex; flex-direction: column; gap: 2px; }
  .group { gap: 4px; }
  .group + .group { margin-top: clamp(16px, 3.4vh, 32px); }
  .group h2, .group-toggle { margin: 0 0 8px; padding: 0 12px; font-size: 0.8rem; font-weight: 700; letter-spacing: 0; text-transform: none; text-wrap: balance; color: var(--sb-fg-muted); }
  .group-toggle { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; margin: 0 0 8px; padding: 0 12px; cursor: pointer; font-size: 0.78rem; font-weight: 700; color: var(--sb-fg-muted); border-radius: var(--radius-sm); }
  .group-toggle:hover { color: var(--sb-active-fg); }
  .group-toggle .chev { margin-left: auto; width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.15s; }
  .group-toggle[aria-expanded='false'] .chev { transform: rotate(180deg); }
  .group-toggle .leaf { width: 16px; height: 16px; fill: none; stroke: var(--sb-accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .sidebar ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .sidebar a.nav-link, .parent-toggle { position: relative; display: flex; align-items: center; gap: 12px; min-height: clamp(40px, 5.2vh, 46px); padding: 8px 12px; border-radius: var(--radius-sm); color: var(--sb-fg); text-decoration: none; font-size: 0.95rem; font-weight: 700; line-height: 1.25; transition: background-color 0.15s, color 0.15s; }
  .parent-toggle { all: unset; box-sizing: border-box; position: relative; display: flex; align-items: center; gap: 12px; width: 100%; min-height: clamp(40px, 5.2vh, 46px); padding: 8px 12px; border-radius: var(--radius-sm); color: var(--sb-fg); cursor: pointer; font-size: 0.95rem; font-weight: 700; }
  .parent-toggle .chev { margin-left: auto; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.15s; }
  .parent-toggle[aria-expanded='false'] .chev { transform: rotate(180deg); }
  .group.has-active .parent-toggle { color: var(--sb-active-fg); }
  ul.sub { margin: 4px 0 0 16px; padding-left: 8px; border-left: 1px solid var(--sb-line); }
  .sidebar svg.ico { width: 20px; height: 20px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
  .sidebar a.nav-link:hover, .parent-toggle:hover { background: var(--sb-hover); color: var(--sb-active-fg); }
  .sidebar a.nav-link:active, .parent-toggle:active, .collapse-btn:active { background: var(--sb-line); }
  .sidebar a.nav-link.active { background: var(--sb-active); color: var(--sb-active-fg); font-weight: 700; }
  .sidebar a.nav-link.active::before { content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px; border-radius: 0 3px 3px 0; background: var(--sb-accent); }
  .sidebar a.nav-link.active svg.ico { color: var(--sb-accent); }
  .sidebar a.nav-link.soon-item { color: var(--sb-fg-muted); }
  .sidebar a:focus-visible, .sidebar button:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 1px; }
  .sidebar .label { min-width: 0; overflow-wrap: anywhere; }
  .pill { margin-left: auto; flex: none; white-space: nowrap; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--sb-line); color: var(--sb-fg-muted); font-size: 0.72rem; font-weight: 500; letter-spacing: 0; text-transform: none; }
  .group + .group.pinned { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--sb-line); }
  .side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 12px; padding-top: 16px; border-top: 1px solid var(--sb-line); font-size: 0.72rem; color: var(--sb-fg-muted); }
  .side-version { padding: 0 4px; }
  .collapse-btn { display: flex; justify-content: center; align-items: center; gap: 8px; min-height: 36px; border: 1px solid var(--sb-line); border-radius: var(--radius-sm); background: transparent; color: var(--sb-fg); cursor: pointer; font: inherit; font-size: 0.8rem; transition: background-color 0.15s; }
  .collapse-btn:hover { background: var(--sb-hover); }
  .collapse-btn svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .collapsed .collapse-btn svg { transform: rotate(180deg); }
  .collapsed .label, .collapsed .group h2, .collapsed .group-toggle, .collapsed .pill, .collapsed .side-foot .txt, .collapsed .company .txt, .collapsed .company .chev { display: none; }
  .collapsed .group + .group { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--sb-line); }
  .collapsed .sidebar a.nav-link, .collapsed .parent-toggle { justify-content: center; padding: 8px 0; }
  .backdrop { display: none; }
  @media (prefers-reduced-motion: reduce) { .sidebar a.nav-link, .parent-toggle, .collapse-btn, .group-toggle .chev, .parent-toggle .chev { transition: none; } }
  @media (max-width: 900px) {
    .shell, .shell.collapsed { grid-template-columns: 1fr; }
    .sidebar { position: fixed; inset: 0 auto 0 0; width: min(300px, 88vw); transform: translateX(-102%); transition: transform 0.2s; }
    .mobile-open .sidebar { transform: none; }
    .mobile-open .backdrop { display: block; position: fixed; inset: 0; background: var(--sb-scrim); z-index: 45; }
    .collapse-btn { display: none; }
    .collapsed .label, .collapsed .group h2, .collapsed .group-toggle, .collapsed .pill, .collapsed .company .txt, .collapsed .company .chev { display: revert; }
    .collapsed .sidebar a.nav-link, .collapsed .parent-toggle { justify-content: flex-start; padding: 8px 12px; }
    .collapsed .group + .group { margin-top: 20px; padding-top: 0; border-top: 0; }
    .sidebar a.nav-link, .parent-toggle { min-height: 44px; }
  }
  @media (max-width: 900px) and (prefers-reduced-motion: reduce) { .sidebar { transition: none; } }
`;
