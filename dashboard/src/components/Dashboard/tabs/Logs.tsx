import type { EventEntry, WsState } from "../../../types";

import { ACCENT, MUTED, panel, TEXT } from "../../../theme";
import { PanelHeader } from "../../PanelHeader";
import { SocketStatus } from "../../SocketStatus";

const ISO_TIME_START = 11;
const ISO_TIME_END = 19;
const EMPTY_LOG_LENGTH = 0;

interface Props {
  readonly eventLog: EventEntry[];
  readonly lastPoll: Date | null;
  readonly socket: string;
  readonly wsState: WsState;
}

const getLogLevelColor = (level: string): string => {
  switch (level) {
    case "DEBUG":
      return "#484f58";
    case "ERROR":
      return "#f85149";
    case "WARN":
      return "#d29922";
    default:
      return ACCENT;
  }
};

const getMessageColor = (level: string): string => {
  switch (level) {
    case "ERROR":
      return "#ffa198";
    case "WARN":
      return "#e3b341";
    default:
      return TEXT;
  }
};

export const LogsTab = ({ eventLog, lastPoll, socket, wsState }: Props) => <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
  <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
    <span style={{ color: MUTED, fontSize: 11 }}>WebSocket:</span>
    <SocketStatus state={wsState} />
    <span style={{ color: MUTED, fontSize: 10, marginLeft: 4 }}>{socket}</span>
    {lastPoll && (
      <span style={{ color: MUTED, fontSize: 10, marginLeft: "auto" }}>
        last poll: {lastPoll.toISOString().slice(ISO_TIME_START, ISO_TIME_END)}
      </span>
    )}
  </div>

  <div style={panel()}>
    <PanelHeader label="Event Log" right={`${eventLog.length} entries`} />
    <div style={{ maxHeight: 560, overflowY: "auto", padding: "4px 0" }}>
      {eventLog.map((entry, idx) => (
        <div className="rh" key={idx} style={{ alignItems: "baseline", display: "flex", fontFamily: "monospace", fontSize: 11, gap: 12, padding: "3px 14px" }}>
          <span style={{ color: MUTED, flexShrink: 0, minWidth: 60 }}>{entry.t}</span>
          <span style={{ color: getLogLevelColor(entry.lv), flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: ".06em", minWidth: 42 }}>{entry.lv}</span>
          <span style={{ color: getMessageColor(entry.lv) }}>{entry.m}</span>
        </div>
      ))}
      {eventLog.length === EMPTY_LOG_LENGTH && <div style={{ color: MUTED, fontSize: 11, padding: "16px 14px" }}>Waiting for events…</div>}
    </div>
  </div>
</div>
