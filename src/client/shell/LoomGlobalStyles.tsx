/** Global Loom shell CSS that depends on the live preferences. */
export interface LoomGlobalStylesProps {
  readonly fontSize: number
}

/**
 * Inject the shell CSS that needs runtime preference values.
 * @param props - current body font size in pixels.
 * @returns the style element.
 */
export function LoomGlobalStyles({ fontSize }: LoomGlobalStylesProps): JSX.Element {
  return <style>{`
      .loom-root {
        container-type: inline-size;
        --loom-canvas: var(--color-bg);
        --loom-surface: var(--color-surface);
        --loom-surface-2: var(--color-panel);
        --loom-surface-3: var(--color-line-soft);
        --loom-selected: var(--color-accent-soft);
        --loom-accent: var(--color-accent);
        --loom-accent-hover: var(--color-accent-ink);
        --loom-accent-active: var(--color-accent-ink);
        --loom-on-accent: var(--color-bg);
        --loom-border: var(--color-line);
        --loom-border-strong: var(--color-line-strong);
        --loom-text: var(--color-ink);
        --loom-dim: var(--color-ink-3);
        --loom-faint: var(--color-muted);
        --text-body-size: ${String(fontSize)}px;
        --text-compact-size: ${String(fontSize - 1)}px;
        --text-small-size: ${String(fontSize - 2)}px;
        --dsh-content-font-size: ${String(fontSize)}px;
      }
      .loom-palette { width: min(560px, calc(100vw - 48px)) !important; max-height: min(640px, calc(100vh - 96px)); padding: 0 !important; gap: 0 !important; overflow: hidden; }
      .loom-root [role='separator']:focus-visible { outline: 2px solid var(--color-accent) !important; outline-offset: 2px; }
      .loom-branch-menu { --dsw-menu-surface-fill: var(--color-surface); --dsw-menu-backdrop-filter: none; width: var(--loom-branch-menu-width, 320px) !important; max-width: none !important; background: var(--color-surface) !important; border: 0.5px solid var(--color-line) !important; color: var(--color-ink); box-shadow: 0 12px 32px color-mix(in srgb, var(--color-ink) 16%, transparent) !important; }
      .loom-aside { background: var(--color-panel) !important; }
      .loom-workspace-switch { align-self: flex-start; }
      .loom-primary { background: var(--loom-accent) !important; color: var(--loom-on-accent) !important; border: 0.5px solid transparent !important; border-radius: 8px !important; font-size: var(--text-compact-size) !important; font-weight: 500 !important; box-shadow: 0 1px 2px color-mix(in srgb, var(--color-ink) 12%, transparent); transition: background-color .12s ease, box-shadow .12s ease; }
      .loom-primary:hover:not(:disabled) { background: var(--loom-accent-hover) !important; }
      .loom-primary:active:not(:disabled) { background: var(--loom-accent-active) !important; box-shadow: none; }
      .loom-primary:focus-visible { outline: 2px solid color-mix(in srgb, var(--loom-accent) 55%, transparent); outline-offset: 2px; }
      .loom-primary:disabled { opacity: .55; }
      .loom-top-context { max-width: 190px; }
      .loom-top-select { max-width: 132px; }
      .loom-top-context:hover { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
      .loom-top-action:hover { border-color: var(--loom-border-strong); color: var(--dsw-alias-label-primary); }
      .loom-top-new:hover { filter: brightness(1.08); }
      .loom-view-switch button:hover:not([aria-pressed='true']) { background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); }
      .loom-menu-item:hover { background: var(--dsw-alias-bg-layer-3); }
      .loom-new-item:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-3); }
      .loom-sidebar-section-head:hover { color: var(--dsw-alias-label-secondary) !important; }
      .loom-new-item:disabled { cursor: default; }
      div.loom-modal-delete { width: min(480px, calc(100vw - 32px)); }
      div.loom-temp-modal { width: min(560px, calc(100vw - 32px)); }
      div.loom-modal-takeover { width: min(440px, calc(100vw - 32px)); }
      .loom-row-action:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); color: var(--dsw-alias-label-primary) !important; }
      .loom-session-row { border-radius: 5px; }
      .loom-session-row:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
      .loom-session-row:focus-within { background: color-mix(in srgb, var(--loom-selected) 65%, transparent); }
      .loom-session-button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
      @media (hover: none) { .loom-session-row:hover { background: transparent; } }
      .loom-tree-row .loom-row-actions { opacity: 0; visibility: hidden; pointer-events: none; transition: opacity .12s ease; }
      .loom-tree-row:hover .loom-row-actions, .loom-tree-row:focus-within .loom-row-actions, .loom-tree-row-active .loom-row-actions { opacity: 1; visibility: visible; pointer-events: auto; }
      .loom-top-action:focus-visible, .loom-top-new:focus-visible, .loom-view-switch button:focus-visible, .loom-menu-item:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
      .loom-top-select:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; border-radius: 3px; }
      @media (hover: none) { .loom-tree-row .loom-row-actions { opacity: 1; visibility: visible; pointer-events: auto; } }
      @container (max-width: 1180px) { .loom-sidebar { min-width: 200px; } .loom-top-label, .loom-top-divider, .loom-top-activity-label, .loom-top-action-label { display: none; } .loom-top-context { max-width: 140px; } .loom-top-select { max-width: 100px; } .loom-top-activity { padding: 0 7px; } .loom-top-new { width: 30px; padding: 0 !important; } .loom-view-switch button { padding: 0 9px; } .loom-aside.loom-aside-kanban, .loom-aside-handle.loom-aside-handle-kanban, .loom-aside-toggle-kb { display: none !important; } }
      @container (max-width: 1040px) { .loom-aside, .loom-aside-handle, .loom-context-toggle { display: none !important; } }
      @container (max-width: 940px) { .loom-sidebar { display: none !important; } .loom-sidebar.loom-sidebar-open { display: block !important; position: absolute; top: 48px; bottom: 0; left: 0; z-index: 70; width: 240px !important; box-shadow: 12px 0 28px color-mix(in srgb, var(--color-ink) 35%, transparent); } .loom-aside { max-width: 300px !important; } .loom-aside.loom-aside-preview { max-width: 380px !important; } .loom-aside.loom-aside-kanban, .loom-aside-handle.loom-aside-handle-kanban, .loom-aside-toggle-kb { display: none !important; } }
      @container (max-width: 760px) { .loom-aside, .loom-aside-handle, .loom-aside-toggle { display: none !important; } .loom-brand-name { display: none; } .loom-top-context { max-width: 128px; } .loom-top-select { max-width: 76px; } }
      @container (max-width: 560px) { .loom-topbar { flex-wrap: wrap !important; height: auto !important; min-height: 48px; padding: 6px 8px !important; column-gap: 4px !important; row-gap: 4px; } .loom-top-spacer { display: none !important; } .loom-top-context { flex: 1 1 140px; max-width: none; padding: 0 6px; order: 5; } .loom-top-select { flex: 1; max-width: none; width: 100%; } .loom-view-switch { margin-left: auto; } .loom-view-switch button { padding: 0 7px; } .loom-top-activity { display: none !important; } .loom-sidebar.loom-sidebar-open { top: 85px !important; } .loom-sidebar-backdrop { top: 85px !important; } .loom-wizard-steps li > span[aria-hidden='true'] { display: none !important; } .loom-wizard-steps button { flex-direction: column; align-items: center; gap: 5px; } .loom-wizard-steps button > span:last-child { justify-content: center; text-align: center; } .loom-wizard-steps button > span:last-child > span:first-child { overflow: visible; white-space: normal; font-size: var(--text-small-size); line-height: 1.25; } }
    `}</style>
}
