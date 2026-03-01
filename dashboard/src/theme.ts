import type { CSSProperties } from "react";

export const BG = "#0d1117";
export const SURF = "#161b22";
export const BORD = "#30363d";
export const TEXT = "#e6edf3";
export const MUTED = "#7d8590";
export const ACCENT = "#58a6ff";

export const STATUS_COLORS = {
  connected: "#3fb950",
  disconnected: "#f85149",
} as const;

export const panel = (overrides: CSSProperties = {}): CSSProperties => ({
  background: SURF,
  border: `1px solid ${BORD}`,
  borderRadius: 8,
  overflow: "hidden",
  ...overrides,
});

export const latColor = (ms: number): string => ms < 100 ? "#3fb950" : ms < 250 ? "#f7c559" : ms < 500 ? "#d28622" : "#f85149"

export const confColor = (c: number): string => c > 0.8 ? "#3fb950" : c > 0.5 ? "#d29922" : "#f85149"

export const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  ::-webkit-scrollbar{width:5px;height:5px;}
  ::-webkit-scrollbar-track{background:#0d1117;}
  ::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px;}
  .tab{background:none;border:none;cursor:pointer;font-family:inherit;font-size:11.5px;padding:9px 14px;border-bottom:2px solid transparent;color:#7d8590;transition:all .15s;letter-spacing:.03em;}
  .tab:hover{color:#e6edf3;}
  .tab.on{color:#e6edf3;border-bottom-color:#58a6ff;}
  .rh:hover{background:rgba(88,166,255,.04)!important;}
  .fbtn{background:none;border:1px solid #30363d;border-radius:4px;color:#7d8590;font-family:inherit;font-size:10px;padding:3px 9px;cursor:pointer;transition:all .15s;}
  .fbtn:hover,.fbtn.on{background:rgba(88,166,255,.1);border-color:#58a6ff55;color:#58a6ff;}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
  @keyframes fadein{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
  @keyframes spin{to{transform:rotate(360deg)}}
`;