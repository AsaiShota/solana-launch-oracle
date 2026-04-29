export interface ParsedLogEvent {
  signature: string;
  logs: string[];
  slot: number | null;
}
