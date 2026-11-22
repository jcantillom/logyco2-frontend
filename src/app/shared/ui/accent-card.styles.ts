/**
 * Receta visual de las tarjetas grandes del Resumen («Factor de emisión» y «Resultado del periodo»): fondo claro con un degradado suave del color de marca
 * en la esquina, filete superior de 3 px, borde fino y sombra. El color de marca de cada tarjeta es la variable `--card-accent` (naranja por defecto; el
 * aguamarina autorizado en «Resultado del periodo»). Va en el elemento con la clase `.acard`.
 */
export const ACCENT_CARD_STYLES = `
      .acard { --card-accent: var(--c-primary); border: 1px solid var(--c-bd); border-top: 3px solid var(--card-accent); border-radius: 18px; background: linear-gradient(225deg, color-mix(in srgb, var(--card-accent) 14%, var(--c-sf)), var(--c-sf) 42%); box-shadow: var(--shadow); }
      .acard:hover { border-color: color-mix(in srgb, var(--card-accent) 40%, var(--c-sf)); border-top-color: var(--card-accent); }
`;
