/**
 * Pure presentation logic for the extension popup. Kept free of any chrome.* API so it is
 * trivially unit-testable; the popup entrypoint wires this to live state from the background.
 */

export interface AuraStatus {
  /** Is the hands' WebSocket to the brain currently OPEN? */
  connected: boolean;
  /** Has the local emergency Stop-all been pulled? When true the hands refuse to run jobs. */
  paused: boolean;
}

export type StatusTone = 'connected' | 'paused' | 'disconnected';

/**
 * Human-readable status line for the popup.
 * Paused is the dominant state: a paused-but-connected extension is still hard-stopped, so the
 * user must see "Paused" rather than a falsely-reassuring "Connected".
 */
export function statusLabel(connected: boolean, paused: boolean): string {
  if (paused) return 'Paused';
  return connected ? 'Connected' : 'Disconnected';
}

/** Which visual tone (drives the status dot colour) the popup should show. */
export function statusTone(connected: boolean, paused: boolean): StatusTone {
  if (paused) return 'paused';
  return connected ? 'connected' : 'disconnected';
}
