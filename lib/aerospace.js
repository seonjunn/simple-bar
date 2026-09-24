import * as Uebersicht from "uebersicht";
import * as Settings from "./settings";
import * as Utils from "./utils";

// AeroSpace serves its CLI socket one connection at a time, and the handler
// blocks in `select` waiting for the request to arrive. Overlapping calls can
// leave it reading a connection whose client is itself still waiting, which
// wedges the server for every later command — including the workspace switch
// that triggered the refresh, so the bar silently stops following AeroSpace.
// Issuing one query at a time keeps us to a single connection.
let queue = Promise.resolve();

// The queue is module scope, so it only serializes one JS context. Übersicht
// renders a widget instance per display, so a multi-monitor setup still issues
// one concurrent call per screen — enough to wedge AeroSpace on its own. And a
// wedge lasts exactly as long as the stuck client's process, so every call gets
// a deadline: the client dies, AeroSpace recovers, the next refresh succeeds.
//
// macOS ships no `timeout`, but /usr/bin/perl is always present and an alarm(2)
// timer is preserved across exec — so the timer kills the AeroSpace client
// itself, not merely our wait for it, which is the part that matters here.
const QUERY_TIMEOUT = 5;
const ACTION_TIMEOUT = 1;

function withDeadline(seconds, command) {
  return `/usr/bin/perl -e 'alarm shift; exec @ARGV or die' ${seconds} ${command}`;
}

function run(command, timeout = QUERY_TIMEOUT) {
  const result = queue.then(() =>
    Uebersicht.run(withDeadline(timeout, command)),
  );
  // A rejected call must not break the chain for everything queued behind it.
  queue = result.then(
    () => {},
    () => {},
  );
  return result;
}

// `aerospace workspace` and `aerospace focus` intermittently apply the change
// and then never answer, leaving a client that wedges the socket. The bar's own
// refresh queues behind it, so the deadline here is what the user feels after a
// click — keep it short. Killing the client does not undo an applied change,
// and the bar learns the new state from exec-on-workspace-change regardless, so
// a lost reply costs nothing.
function runAction(command) {
  return run(command, ACTION_TIMEOUT).catch(() => {});
}

/**
 * Switches to the specified workspace.
 * @param {number} index - The index of the workspace to switch to.
 */
export async function goToSpace(index) {
  const settings = Settings.get();
  const { aerospacePath = "/opt/homebrew/bin/aerospace" } = settings.global;
  await runAction(`${aerospacePath} workspace ${index}`);
}

/**
 * Focuses the window with the specified ID.
 * @param {number} id - The ID of the window to focus.
 */
export async function focusWindow(id) {
  const settings = Settings.get();
  const { aerospacePath = "/opt/homebrew/bin/aerospace" } = settings.global;
  await runAction(`${aerospacePath} focus --window-id ${id}`);
}

/**
 * Retrieves the list of workspaces for the specified display.
 * @param {number} displayId - The ID of the display.
 * @returns {Promise<Object[]>} The list of workspaces.
 */
export async function getSpaces(displayId) {
  const settings = Settings.get();
  const { aerospacePath = "/opt/homebrew/bin/aerospace" } = settings.global;
  const json = await run(
    `${aerospacePath} list-workspaces --monitor ${displayId} --json --format "%{workspace} %{monitor-appkit-nsscreen-screens-id}"`,
  );
  return Utils.parseJson(json);
}

/**
 * Retrieves the currently focused workspace.
 * @returns {Promise<Object>} The focused workspace.
 */
export async function getFocusedSpace() {
  const settings = Settings.get();
  const { aerospacePath = "/opt/homebrew/bin/aerospace" } = settings.global;
  const json = await run(
    `${aerospacePath} list-workspaces --focused --json`,
  );
  return Utils.parseJson(json);
}

/**
 * Retrieves the list of windows for the specified workspace.
 * @param {number} workspaceId - The ID of the workspace.
 * @returns {Promise<Object[]>} The list of windows.
 */
export async function getWindows(workspaceId) {
  const settings = Settings.get();
  const { aerospacePath = "/opt/homebrew/bin/aerospace" } = settings.global;
  const json = await run(
    `${aerospacePath} list-windows --workspace ${workspaceId} --json`,
  );
  const cleanedJson = json.replace(/\\\n/g, "").replace(/00000/g, "0");
  return Utils.parseJson(cleanedJson);
}

/**
 * Retrieves the currently focused window.
 * @returns {Promise<Object>} The focused window.
 */
export async function getFocusedWindow() {
  const settings = Settings.get();
  const { aerospacePath = "/opt/homebrew/bin/aerospace" } = settings.global;
  const json = await run(
    `${aerospacePath} list-windows --focused --json`,
  );
  return Utils.parseJson(json);
}

/**
 * Retrieves the list of displays.
 * @returns {Promise<Object[]>} The list of displays.
 */
export async function getDisplays() {
  const settings = Settings.get();
  const { aerospacePath = "/opt/homebrew/bin/aerospace" } = settings.global;
  const json = await run(
    `${aerospacePath} list-monitors --json --format "%{monitor-id} %{monitor-name} %{monitor-appkit-nsscreen-screens-id}"`,
  );
  return Utils.parseJson(json);
}

/**
 * Retrieves the custom display index for the specified display.
 * @param {Object} display - The display object.
 * @returns {number} The custom display index.
 */
export function getCustomDisplayIndex(item, allDisplays) {
  const settings = Settings.get();
  const { customAeroSpaceDisplayIndexes } = settings.spacesDisplay;
  const nativeId = item["monitor-appkit-nsscreen-screens-id"];
  const monitorName = item["monitor-name"];

  // Explicit config takes priority — name-based keys are stable across monitor changes
  const customId =
    customAeroSpaceDisplayIndexes[monitorName] ??
    customAeroSpaceDisplayIndexes[nativeId];
  if (customId != null) return customId;

  // Auto-fallback: sort displays with built-in first so indices always match
  // Übersicht's display numbering (/1/ = built-in, /2/ = external) regardless
  // of the nsscreen IDs that AeroSpace reports (which can vary and be swapped)
  if (allDisplays?.length) {
    const sorted = [...allDisplays].sort((a, b) => {
      const aBuiltIn = a["monitor-name"] === "Built-in Retina Display" ? 0 : 1;
      const bBuiltIn = b["monitor-name"] === "Built-in Retina Display" ? 0 : 1;
      if (aBuiltIn !== bBuiltIn) return aBuiltIn - bBuiltIn;
      return (
        (a["monitor-appkit-nsscreen-screens-id"] ?? 0) -
        (b["monitor-appkit-nsscreen-screens-id"] ?? 0)
      );
    });
    const monitorId = item["monitor-id"];
    const pos = sorted.findIndex(
      (d) =>
        (monitorId != null && d["monitor-id"] === monitorId) ||
        (nativeId != null &&
          d["monitor-appkit-nsscreen-screens-id"] === nativeId),
    );
    if (pos >= 0) return pos + 1;
  }

  return nativeId;
}
