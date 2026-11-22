/**
 * Estilos de las tarjetas de indicador (etiqueta · cifra + chip de ícono · pie) del espacio de empresa. Las reglas globales `.kpis .kpi`
 * de `styles.scss` solo valen dentro de `.platform-console`; las pantallas de empresa usan esta hoja. El tamaño del chip y del glifo se
 * ajusta con `--kpi-chip` y `--kpi-glyph`. Solo tokens de la plataforma.
 */
export const KPI_TILE_STYLES = `
      .kpi { --tone: var(--c-primary); --tone-bg: var(--c-ok-soft); all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: 'ico label' 'ico line'; align-items: center; column-gap: 16px; row-gap: 2px; min-height: 96px; padding: 16px 20px; border: 1px solid var(--c-bd); border-radius: 18px; background: var(--c-sf); box-shadow: var(--shadow); transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s; }
      .kpi:hover:not(:disabled) { border-color: color-mix(in srgb, var(--tone) 40%, var(--c-sf)); box-shadow: 0 10px 22px color-mix(in srgb, var(--c-head) 20%, transparent); transform: translateY(-2px); }
      .kpi:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .kpi:disabled { cursor: not-allowed; opacity: 0.75; }
      .kpi.warn { --tone: var(--c-warning); --tone-bg: var(--c-warn-soft); }
      .kpi.bad { --tone: var(--c-danger); --tone-bg: var(--c-bad-soft); }
      .kpi.neutral { --tone: var(--c-mute2); --tone-bg: var(--c-s3); }
      .kpi .label { grid-area: label; align-self: end; font-size: 0.88rem; font-weight: 600; color: var(--c-text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .kpi .value { grid-area: line; font-size: 2rem; font-weight: 750; line-height: 1.1; letter-spacing: -0.03em; color: var(--c-head); font-variant-numeric: tabular-nums; }
      .kpi .ico { grid-area: ico; display: grid; place-items: center; width: var(--kpi-chip, 52px); height: var(--kpi-chip, 52px); border-radius: 16px; background: linear-gradient(160deg, var(--tone-bg), color-mix(in srgb, var(--tone-bg) 40%, var(--c-sf))); color: var(--tone); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tone) 20%, transparent); }
      .kpi .ico svg { width: var(--kpi-glyph, 26px); height: var(--kpi-glyph, 26px); fill: color-mix(in srgb, currentColor 14%, transparent); stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
      .kpi .ico.solid svg { fill: currentColor; fill-rule: evenodd; stroke: none; }
      .kpi .cap { grid-area: cap; font-size: 0.8rem; color: var(--c-mu); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .kpi.has-cap { grid-template-areas: 'ico label' 'ico line' 'ico cap'; }
      .kpi .err { grid-area: line; margin: 0; font-size: 0.85rem; color: var(--c-danger); }
      .kpi .err button { margin-left: 6px; padding: 0 8px; border: 1px solid var(--c-bd); border-radius: 6px; background: var(--c-sf); color: var(--c-head); font: inherit; font-size: 0.78rem; cursor: pointer; }
      .kpi .sk { grid-area: line; height: 36px; }
      /* Versión compacta (size="sm"): ≈ 80 px de alto, pie en una sola línea. Solo aplica con la clase sm; el tamaño normal no cambia. */
      .kpi.sm { min-height: 0; padding: 10px 14px; column-gap: 12px; row-gap: 0; border-radius: 14px; }
      .kpi.sm .label { font-size: 0.8rem; }
      .kpi.sm .value { font-size: 1.5rem; overflow-wrap: anywhere; }
      .kpi.sm .cap { font-size: 0.74rem; line-height: 1.3; }
      .kpi.sm .sk { height: 28px; }
      @media (prefers-reduced-motion: reduce) { .kpi { transition: none; } .kpi:hover:not(:disabled) { transform: none; } }

`;
