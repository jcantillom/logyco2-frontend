/** Estilos comunes de las tarjetas de gráficas del Resumen: compactas (≈ 200–220 px), cabecera con chip de 34 px, título de 1 rem y apoyo en una línea. */
export const CHART_CARD_STYLES = `
      :host { display: block; min-width: 0; }
      .cc { box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 210px; padding: 12px 16px; border: 1px solid var(--c-bd); border-radius: 18px; background: var(--c-sf); box-shadow: var(--shadow); }
      .cc .hdr { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .cc .hdr .ico.chip { width: 34px; height: 34px; border-radius: 11px; }
      .cc .hdr .ico.chip svg { width: 18px; height: 18px; }
      .cc .ht { flex: 1; min-width: 0; }
      .cc h2 { margin: 0; font-size: 1rem; font-weight: 700; color: var(--c-head); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cc .ht p { margin: 0; font-size: 0.76rem; color: var(--c-mu); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cc .pchip { flex: none; padding: 1px 9px; border-radius: 999px; background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-primary) 40%, var(--c-sf)); color: var(--c-head); font-size: 0.72rem; font-weight: 700; white-space: nowrap; }
      .cc .body { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
      /* Marco vacío y neutro del gráfico (estado pendiente / sin cálculo en el periodo): decorativo, sin datos ni cifras; solo el texto de estado es accesible. */
      .cc .note { margin: 0; font-size: 0.82rem; color: var(--c-text2); }
      .cc .frame { display: flex; flex-direction: column; gap: 6px; }
      .cc .plot { position: relative; height: 88px; margin-left: 4px; border-bottom: 1px solid var(--c-bd); }
      .cc .plot i { position: absolute; left: 0; right: 0; border-top: 1px dashed var(--c-bd); opacity: 0.8; }
      .cc .slots { position: absolute; inset: 0; display: flex; }
      .cc .slots span { flex: 1; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 4px; font-size: 0.8rem; color: var(--c-mute2); }
      .cc .months { display: flex; justify-content: space-between; gap: 4px; margin-left: 4px; font-size: 0.68rem; color: var(--c-mu); min-height: 12px; }
      .cc .months.all { justify-content: space-around; }
      .cc .ring { flex: none; width: 112px; height: 112px; }
      .cc .ring .track { fill: none; stroke: var(--c-s3); stroke-width: 16; }
      .cc .ring .edge { fill: none; stroke: var(--c-bd); stroke-width: 1; stroke-dasharray: 3 3; }
      .cc .ring .dash { text-anchor: middle; fill: var(--c-mute2); font-size: 16px; font-weight: 800; }
      .cc .ring .sub { text-anchor: middle; fill: var(--c-mu); font-size: 8px; font-weight: 600; }
      .cc .donut-frame { display: flex; align-items: center; gap: 18px; min-width: 0; }
      .cc .legend-frame { flex: 1; min-width: 0; display: grid; gap: 8px; }
      .cc .legend-frame .lines { display: grid; gap: 7px; }
      .cc .legend-frame .lines b { display: block; height: 10px; border-radius: 999px; background: var(--c-s3); }
      .cc .err { margin: 0; font-size: 0.85rem; color: var(--c-danger); }
      .cc .err button { margin-left: 6px; padding: 0 8px; border: 1px solid var(--c-bd); border-radius: 6px; background: var(--c-sf); color: var(--c-head); font: inherit; font-size: 0.78rem; cursor: pointer; }
      .cc .err button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
`;
