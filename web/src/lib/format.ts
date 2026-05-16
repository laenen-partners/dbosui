import type { Timestamp } from '@bufbuild/protobuf/wkt';

import { WorkflowStatus } from '../gen/dbosui/v1/workflows_pb.js';

export const STATUS_LABEL: Record<WorkflowStatus, string> = {
  [WorkflowStatus.UNSPECIFIED]: 'Unknown',
  [WorkflowStatus.PENDING]: 'Pending',
  [WorkflowStatus.ENQUEUED]: 'Enqueued',
  [WorkflowStatus.SUCCESS]: 'Success',
  [WorkflowStatus.ERROR]: 'Error',
  [WorkflowStatus.CANCELLED]: 'Cancelled',
  [WorkflowStatus.MAX_RETRIES_EXCEEDED]: 'Max Retries',
};

export const STATUS_COLOR: Record<WorkflowStatus, string> = {
  [WorkflowStatus.UNSPECIFIED]: 'gray',
  [WorkflowStatus.PENDING]: 'yellow',
  [WorkflowStatus.ENQUEUED]: 'cyan',
  [WorkflowStatus.SUCCESS]: 'green',
  [WorkflowStatus.ERROR]: 'red',
  [WorkflowStatus.CANCELLED]: 'gray',
  [WorkflowStatus.MAX_RETRIES_EXCEEDED]: 'orange',
};

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: String(WorkflowStatus.PENDING), label: 'Pending' },
  { value: String(WorkflowStatus.ENQUEUED), label: 'Enqueued' },
  { value: String(WorkflowStatus.SUCCESS), label: 'Success' },
  { value: String(WorkflowStatus.ERROR), label: 'Error' },
  { value: String(WorkflowStatus.CANCELLED), label: 'Cancelled' },
  { value: String(WorkflowStatus.MAX_RETRIES_EXCEEDED), label: 'Max Retries' },
];

export function timestampToDate(ts?: Timestamp): Date | null {
  if (!ts) return null;
  const ms = Number(ts.seconds) * 1000 + Math.floor(ts.nanos / 1_000_000);
  if (!ms) return null;
  return new Date(ms);
}

export function formatTimestamp(ts?: Timestamp): string {
  const d = timestampToDate(ts);
  if (!d) return '—';
  return d.toLocaleString();
}

/**
 * Human-friendly duration between two timestamps. Returns "—" if either is
 * missing. Picks the largest unit (ms / s / m / h) that produces a number ≥ 1.
 */
export function formatDuration(from?: Timestamp, to?: Timestamp): string {
  const start = timestampToDate(from);
  const end = timestampToDate(to);
  if (!start || !end) return '—';
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)}m`;
  const h = m / 60;
  return `${h.toFixed(1)}h`;
}

/** Number of milliseconds since the epoch represented by a Timestamp, or 0. */
export function timestampToMs(ts?: Timestamp): number {
  if (!ts) return 0;
  return Number(ts.seconds) * 1000 + Math.floor(ts.nanos / 1_000_000);
}

/** ISO date helper for URL query params (YYYY-MM-DD), or empty for null. */
export function dateToIso(d: Date | null): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function tryPrettyJSON(raw: string): string {
  if (!raw) return '';
  // DBOS stores values as base64-encoded JSON. Try to decode, then pretty-print.
  let candidate = raw;
  try {
    const decoded = atob(raw);
    candidate = decoded;
  } catch {
    // not base64 — fall through with original
  }
  try {
    return JSON.stringify(JSON.parse(candidate), null, 2);
  } catch {
    return candidate;
  }
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}
