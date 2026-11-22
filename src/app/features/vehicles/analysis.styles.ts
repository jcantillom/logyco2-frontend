/** Estilos que comparten los pasos del asistente (tarjetas, tablas, avisos). Solo tokens de la plataforma. */
export const ANALYSIS_STYLES = `
  :host { display: block; }
  svg.i { width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  .bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .bar .grow { flex: 1 1 auto; }
  .note { margin: 0 0 12px; padding: 8px 12px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-s2); font-size: 0.86rem; color: var(--c-text2); }
  .result { margin: 0 0 12px; padding: 8px 12px; border-radius: 10px; background: var(--c-success-bg); color: var(--c-success); font-size: 0.88rem; font-weight: 600; }
  .tw { border: 1px solid var(--c-bd); border-radius: 12px; overflow-x: auto; }
  .tbl { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.86rem; }
  .tbl th { text-align: left; padding: 9px 12px; font-weight: 600; font-size: 0.8rem; color: var(--c-text2); background: var(--c-s2); white-space: nowrap; border-bottom: 1px solid var(--c-bd); }
  .tbl td { padding: 8px 12px; border-bottom: 1px solid var(--c-bd); vertical-align: middle; }
  .tbl tbody tr:last-child td { border-bottom: 0; }
  .tbl tbody th { padding: 8px 12px; border-bottom: 1px solid var(--c-bd); background: none; font-size: inherit; font-weight: 700; letter-spacing: 0.03em; color: var(--c-head); }
  .tbl small { display: block; color: var(--c-mu); font-size: 0.76rem; }
  .tbl input[type='checkbox'], .confirm input { accent-color: var(--c-primary); width: 16px; height: 16px; }
  .empty { margin: 0; padding: 22px 12px; text-align: center; color: var(--c-mu); }
  .foot { margin-top: 12px; }
  .cards { display: flex; flex-direction: column; gap: 12px; }
  .card-f { border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .card-f.done { background: var(--c-s2); }
  .card-f header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .card-f h3 { margin: 0; font-size: 1rem; letter-spacing: 0.03em; color: var(--c-head); }
  .card-f h3 small { font-weight: 400; color: var(--c-mu); letter-spacing: 0; }
  .card-f p { margin: 0; color: var(--c-text); font-size: 0.9rem; }
  .vals { margin: 0; padding-left: 18px; font-size: 0.86rem; color: var(--c-text2); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .confirm { display: flex; gap: 8px; align-items: flex-start; padding: 8px 12px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-warn-soft); font-size: 0.86rem; }
  .why { margin: 0; font-size: 0.82rem; color: var(--c-mu); }
  .err { margin: 0; font-size: 0.86rem; color: var(--c-danger); }
  details.light { margin-top: 16px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); padding: 8px 14px; }
  details.light summary { cursor: pointer; font-weight: 700; color: var(--c-head); padding: 4px 0; }
  details.light summary:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
  details.light .cards { margin-top: 10px; }
  details.light .card-f { background: var(--c-sf); }
  @media (max-width: 768px) {
    .tbl thead { display: none; }
    .tbl, .tbl tbody { display: block; }
    .tbl tr { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; padding: 10px 12px; border-bottom: 1px solid var(--c-bd); }
    .tbl td, .tbl tbody th { display: block; padding: 0; border: 0; }
    .tbl td[data-l]::before { content: attr(data-l) ': '; color: var(--c-mu); }
    .tbl td:not(.k-pick) { grid-column: 1 / -1; }
  }
`;
