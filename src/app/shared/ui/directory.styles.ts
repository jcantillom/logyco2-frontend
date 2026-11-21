/** Estilos comunes de los listados de la consola (KPIs, barra de herramientas, tabla con cabecera fija, avatar, píldoras, vacío). */
export const DIRECTORY_STYLES = `
  .head { display: flex; align-items: center; gap: 14px; }
  .head-ico { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 13px; background: linear-gradient(145deg, var(--c-primary-600), var(--c-primary)); color: #fff; box-shadow: 0 6px 14px color-mix(in srgb, var(--c-primary) 25%, transparent); flex: none; }
  .head-ico svg { width: 26px; height: 26px; }
  .btn-new { display: inline-flex; align-items: center; gap: 8px; }
  .btn-new svg { width: 18px; height: 18px; stroke-width: 2.2; }
  svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  .chips { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
  .chip { position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 14px 16px 12px; border-radius: 12px; border: 1px solid var(--c-bd); background: linear-gradient(180deg, var(--c-sf), var(--c-s2)); box-shadow: 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); font: inherit; text-align: left; cursor: pointer; transition: border-color 0.15s, background 0.15s, transform 0.15s, box-shadow 0.15s; }
  .chip::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: var(--c-s3); transition: background 0.15s; }
  .chip:hover { border-color: var(--c-primary); transform: translateY(-2px); box-shadow: 0 8px 18px color-mix(in srgb, var(--c-gray) 8%, transparent); }
  .chip:hover::before { background: var(--c-primary); }
  .chip:focus-visible { outline: 3px solid var(--c-secondary-soft); }
  .chip span { min-height: 2.8em; font-size: 0.74rem; line-height: 1.4; font-weight: 500; color: var(--c-gray-600); }
  .chip b { font-size: 1.65rem; font-weight: 700; line-height: 1.1; color: var(--c-head); font-variant-numeric: tabular-nums; }
  .chip[aria-pressed='true'] { background: var(--c-sf); border-color: var(--c-primary); box-shadow: 0 0 0 1px var(--c-primary), 0 8px 20px color-mix(in srgb, var(--c-primary) 18%, transparent); }
  .chip[aria-pressed='true']::before { height: 4px; background: var(--c-primary); }
  .chip.warn:not([aria-pressed='true'])::before { background: #e7b24c; }
  .chip[aria-pressed='true'] span { color: var(--c-head); font-weight: 600; }
  .chip[aria-pressed='true'] b { color: var(--c-accent); }
  .chip.warn:not([aria-pressed='true']) b { color: var(--c-warning); }
  .directory { min-width: 0; overflow: hidden; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: 0 10px 30px color-mix(in srgb, var(--c-gray) 5%, transparent), 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); }
  .directory > .alert { margin: 16px; }
  .directory app-pager { display: block; padding: 10px 20px 16px; border-top: 1px solid var(--c-bd); }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 18px 20px; border-bottom: 1px solid var(--c-bd); background: var(--c-sf); }
  .search { position: relative; flex: 1 1 320px; min-width: 0; }
  .search > svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; color: var(--c-mu); pointer-events: none; }
  .search .input { width: 100%; padding: 9px 36px 9px 38px; border-radius: 10px; background: var(--c-s2); border-color: var(--c-bd); }
  .search .input:focus { background: var(--c-sf); }
  .search .input::-webkit-search-cancel-button, .search .input::-webkit-search-decoration { -webkit-appearance: none; appearance: none; display: none; }
  .search .x { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 50%; background: var(--c-s3); color: var(--c-text2); cursor: pointer; }
  .search .x svg { width: 14px; height: 14px; stroke-width: 2.2; }
  .toolbar .type-filter { width: auto; max-width: 100%; flex: 0 1 230px; border-radius: 10px; background-color: var(--c-s2); }
  .result { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; padding: 6px 12px; border-radius: 999px; background: var(--c-s2); color: var(--c-mu); white-space: nowrap; }
  .result svg { width: 16px; height: 16px; flex: none; fill: none; stroke: var(--c-primary); stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
  .result b { color: var(--c-head); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
  .dt { position: relative; container-type: inline-size; min-width: 0; max-width: 100%; background: var(--c-sf); overflow: auto; max-height: max(300px, calc(100dvh - 420px)); min-height: 240px; scrollbar-color: var(--c-gray-300) var(--c-gray-50); transition: opacity 0.15s; }
  .dt:focus-visible { outline: 3px solid var(--c-primary); outline-offset: -3px; }
  .dt.busy { opacity: 0.55; pointer-events: none; }
  .dt.busy::before { content: ''; position: sticky; top: 0; z-index: 3; display: block; height: 3px; margin-bottom: -3px; background: linear-gradient(90deg, transparent, var(--c-secondary), var(--c-secondary-soft), transparent); background-size: 40% 100%; background-repeat: no-repeat; animation: sweep 1s linear infinite; }
  @keyframes sweep { from { background-position: -40% 0; } to { background-position: 140% 0; } }
  .dt thead th { position: sticky; top: 0; z-index: 2; padding: 0; background: var(--c-s2); border-bottom: 1px solid var(--c-bd); text-align: center; vertical-align: middle; }
  .dt thead th > span, .dt thead th > button { display: flex; align-items: center; justify-content: center; gap: 8px; box-sizing: border-box; width: 100%; height: 50px; padding: 0 16px; border: 0; background: transparent; font: inherit; font-size: 0.75rem; font-weight: 650; letter-spacing: 0.01em; color: var(--c-mute2); white-space: nowrap; }
  .dt thead th:first-child > button { justify-content: flex-start; }
  .dt thead th > button { position: relative; cursor: pointer; }
  /* La flecha no desplaza el título respecto del centro de la columna. */
  .dt thead th:not(:first-child) .arrow { position: absolute; right: 12px; }
  .dt thead th > button:hover, .dt thead th[aria-sort='ascending'] > button, .dt thead th[aria-sort='descending'] > button { color: var(--c-accent); }
  .dt thead th > button:focus-visible { outline: 3px solid var(--c-secondary-soft); outline-offset: -3px; }
  .dt .arrow { width: 13px; height: 13px; opacity: 0.35; transition: transform 0.15s, opacity 0.15s; }
  .dt th[aria-sort='ascending'] .arrow, .dt th[aria-sort='descending'] .arrow { opacity: 1; }
  .dt th[aria-sort='descending'] .arrow { transform: rotate(180deg); }
  .dt tbody tr { height: 88px; cursor: pointer; background: var(--c-sf); transition: background 0.12s; }
  .dt tbody tr:hover, .dt tbody tr:focus-within { background: var(--c-row-hover); }
  .dt tbody tr:hover th { box-shadow: inset 3px 0 var(--c-primary); }
  .dt tbody tr:hover .go { opacity: 1; transform: translateX(2px); }
  .dt td, .dt tbody th { padding: 12px 16px; border-bottom: 1px solid var(--c-bd); vertical-align: middle; text-align: center; font-weight: 400; background: inherit; text-transform: none; letter-spacing: 0; font-size: 0.84rem; line-height: 1.5; overflow-wrap: anywhere; }
  .dt tbody th { text-align: left; }
  .dt td:last-child { padding-inline: 10px; }
  .dt tbody tr:last-child td, .dt tbody tr:last-child th { border-bottom: 0; }
  .who { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .avatar { display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid hsl(var(--h, 160) 35% 84%); border-radius: 11px; background: linear-gradient(145deg, hsl(var(--h, 160) 45% 95%), hsl(var(--h, 160) 40% 88%)); color: hsl(var(--h, 160) 55% 26%); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.02em; flex: none; }
  .avatar:has(img) { background: #fff; padding: 3px; overflow: hidden; }
  .avatar.off { background: var(--c-s2); border-color: var(--c-bd); color: var(--c-mute2); }
  .avatar.warn { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #f0d7a0; }
  .nm { display: flex; flex: 1; flex-direction: column; gap: 5px; min-width: 0; line-height: 1.5; }
  .nm a, .nm .small { white-space: normal; overflow-wrap: anywhere; }
  .nm a { font-size: 0.9rem; font-weight: 650; color: var(--c-head); text-decoration: none; }
  .nm .small { font-size: 0.76rem; color: var(--c-gray-600); }
  .nm a:focus-visible { outline: 2px solid var(--c-primary); outline-offset: 3px; border-radius: 3px; }
  .nm a:hover { color: var(--c-accent); text-decoration: underline; }
  .pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 650; white-space: nowrap; }
  .pill::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
  .pill.on { background: var(--c-ok-soft); color: var(--c-accent); box-shadow: inset 0 0 0 1px var(--c-secondary-200); }
  .pill.off { background: var(--c-s3); color: var(--c-mute2); }
  .pill.del { background: var(--c-bad-soft); color: var(--c-bad); }
  .go { width: 18px; height: 18px; color: var(--c-gray-600); opacity: 0.45; transition: opacity 0.15s, transform 0.15s; }
  .skel td { padding: 14px; border-bottom: 1px solid var(--c-bd); }
  .skel i { display: block; height: 12px; border-radius: 6px; background: linear-gradient(90deg, var(--c-s3) 25%, var(--c-gray-50) 50%, var(--c-s3) 75%); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }
  .skel .sa { width: 40px; height: 40px; border-radius: 12px; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  .empty-state { display: grid; justify-items: center; gap: 6px; padding: 48px 20px; text-align: center; }
  .empty-state svg { width: 44px; height: 44px; color: var(--c-gray-300); }
  .empty-state h2 { margin: 4px 0 0; }
  .empty-state .btn { margin-top: 10px; }
  /* En escritorio la empresa sigue visible al consultar las columnas de la derecha. */
  @container (min-width: 700px) {
    .dt thead th:first-child { left: 0; z-index: 4; }
    .dt tbody th { position: sticky; left: 0; z-index: 1; }
  }
  @media (prefers-reduced-motion: reduce) { .skel i, .dt.busy::before { animation: none; } .chip, .dt tbody tr, .go { transition: none; } }
`;
