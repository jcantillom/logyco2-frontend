/** Estilos de las tarjetas, controles y estados vacíos que comparten las secciones de LoGyCO₂ Intelligence. */
export const PANEL_STYLES = `
  svg { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex: none; }
      .nodata { display: flex; flex-direction: column; gap: 3px; margin: 0; padding: 10px 12px; border: 1px dashed var(--c-bd); border-radius: 10px; background: var(--c-s2); font-size: 0.74rem; color: var(--c-mu); line-height: 1.35; }
      .nodata strong { color: var(--c-head); font-size: 0.8rem; }
      .split { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr); gap: 12px; min-height: 0; height: 100%; }
      @media (max-width: 1100px) { .split { grid-template-columns: minmax(0, 1fr); height: auto; } }
      .panel { display: flex; flex-direction: column; gap: 10px; padding: 14px 18px; min-width: 0; min-height: 0; overflow: hidden; }
      .panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: nowrap; }
      .panel-head > div:first-child { min-width: 0; }
      .panel-head.wrap { flex-wrap: wrap; row-gap: 10px; }
      .panel-head.wrap h3, .panel-head.wrap p { overflow: visible; text-overflow: clip; white-space: normal; }
      .reading { display: flex; flex-direction: column; gap: 12px; }
      .panel-head h3, .panel-head p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .panel-head h3 { margin: 0; font-size: 1rem; letter-spacing: -0.01em; }
      .panel-head p { margin: 2px 0 0; font-size: 0.76rem; color: var(--c-mu); }
      .controls { display: flex; align-items: center; gap: 8px; flex: none; }
      .seg { display: inline-flex; padding: 3px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-s2); }
      .seg button { border: 0; background: none; padding: 5px 11px; border-radius: 7px; font: inherit; font-size: 0.76rem; font-weight: 600; color: var(--c-mu); cursor: pointer; }
      .seg button[aria-pressed='true'] { background: var(--c-primary); color: #fff; box-shadow: 0 2px 6px color-mix(in srgb, var(--c-primary) 25%, transparent); }
      .sel { min-height: 32px; padding: 0 28px 0 10px; border: 1px solid var(--c-bd); border-radius: 9px; background: var(--c-sf); font: inherit; font-size: 0.78rem; color: var(--c-head); }
      .chart-box { display: flex; flex-direction: column; height: 260px; min-height: 0; }
      .chart-box app-trend-chart { flex: 1 1 0; }
      .axis-note { margin: 6px 0 0; color: var(--c-mu); font-size: 0.72rem; }
      .scroll { overflow-y: auto; min-height: 0; flex: 1 1 0; }
      .link { align-self: flex-start; padding: 0; border: 0; background: none; font: inherit; font-size: 0.8rem; font-weight: 700; color: var(--c-accent); cursor: pointer; }
      .link:hover { text-decoration: underline; }
      .pill { display: inline-flex; flex-direction: column; align-items: flex-end; padding: 3px 10px; border-radius: 10px; background: var(--c-s3); color: var(--c-mute2); font-size: 0.7rem; font-weight: 800; line-height: 1.25; }
      .pill small { font-weight: 500; font-size: 0.64rem; }
      .pill.ok { background: var(--c-ok-soft); color: var(--c-accent); }
      .pill.err { background: var(--c-bad-soft); color: var(--c-bad); }
  @media (min-width: 1101px) and (min-height: 700px) {
    .chart-box { flex: 1 1 0; height: auto; }
  }
`;
