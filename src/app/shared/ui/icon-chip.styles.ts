const CHIP = `display: grid; place-items: center; flex: none; width: 40px; height: 40px; padding: 0; border-radius: 12px; background: var(--chip-bg, var(--c-sf)); color: var(--tone, var(--c-primary)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tone, var(--c-primary)) 20%, transparent);`;
const GLYPH = `display: block; width: 20px; height: 20px; fill: color-mix(in srgb, currentColor 14%, transparent); stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;`;
const SOLID = `fill: currentColor; fill-rule: evenodd; stroke: none;`;

/**
 * Chip del ícono de las tarjetas compactas de indicador (clase `.ico.chip` dentro de una tarjeta `.sm`: 40 px, radio 12, fondo claro, aro fino del tono y
 * glifo de 20 px con trazo 1,6): una sola definición para `app-kpi-tile size="sm"` y `app-footprint-card size="sm"`, de modo que todas se vean igual. El
 * tono (`--tone`) solo cambia el color. Un glifo sólido (`.solid`) se rellena con `currentColor` y sin trazo, con huecos `evenodd`. Debe ir DESPUÉS de los
 * estilos base del componente (misma especificidad).
 */
export const ICON_CHIP_STYLES = `
      .sm .ico.chip { ${CHIP} }
      .sm .ico.chip svg { ${GLYPH} }
      .sm .ico.chip.solid svg { ${SOLID} }
`;

/** El mismo chip para la cabecera de las tarjetas grandes del Resumen (clase `.hdr` en la cabecera): así las tarjetas grandes y las de indicador son una familia. */
export const HEADER_CHIP_STYLES = `
      .hdr .ico.chip { ${CHIP} }
      .hdr .ico.chip svg { ${GLYPH} }
      .hdr .ico.chip.solid svg { ${SOLID} }
`;
