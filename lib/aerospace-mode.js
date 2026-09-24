import * as Uebersicht from "uebersicht";

/**
 * Read AeroSpace modal state from the local mode file.
 *
 * @returns {Promise<{mode: string, color: string}>}
 */
export async function getMode() {
  const output = await Uebersicht.run(
    "cat /tmp/aerospace-mode 2>/dev/null || printf main",
  );
  const mode = output.trim() || "main";

  return {
    mode,
    color: mode === "wm" ? "red" : "white",
  };
}
