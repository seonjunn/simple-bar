import * as Uebersicht from "uebersicht";
import * as Aerospace from "../aerospace.js";

const { React } = Uebersicht;

// Create a context with default values
const SimpleBarContext = React.createContext({
  display: 1,
  SIPDisabled: false,
  settings: {},
  setSettings: () => {},
});

/**
 * Custom hook to use the SimpleBarContext
 * @returns {Object} The context value
 */
export function useSimpleBarContext() {
  return React.useContext(SimpleBarContext);
}

/**
 * Provides context for simple-bar.
 *
 * @param {Object} props - The properties object.
 * @param {Object} props.initialSettings - The initial settings for the application.
 * @param {Array} props.displays - The initial displays configuration.
 * @param {boolean} props.SIPDisabled - Indicates if SIP (System Integrity Protection) is disabled.
 * @param {React.ReactNode} props.children - The child components to be wrapped by the provider.
 *
 * @returns {JSX.Element} The context provider component.
 */
export default function SimpleBarContextProvider({
  initialSettings,
  displays,
  SIPDisabled,
  children,
}) {
  const [settings, setSettings] = React.useState(initialSettings);
  const [_displays, setDisplays] = React.useState(displays);
  const [missives, setMissives] = React.useState([]);

  const { windowManager, enableServer, yabaiServerRefresh, aerospaceServerRefresh } = settings.global;
  const serverEnabled = enableServer && yabaiServerRefresh;
  const isYabai = windowManager === "yabai";
  const isAeroSpace = windowManager === "aerospace";
  const isAerospaceServer = isAeroSpace && enableServer && aerospaceServerRefresh;

  const currentDisplays = (serverEnabled && isYabai) || isAerospaceServer ? _displays : displays;

  const displayId = parseInt(window.location.pathname.replace("/", ""), 10);

  // Check if the built-in Retina Display is present in the current displays
  const hasBuiltInRetina = currentDisplays?.some(
    (d) => d["monitor-name"] === "Built-in Retina Display",
  );

  // Adjust displayId if the Retina screen is missing when using AeroSpace
  // This prevents mismatch between Übersicht and AeroSpace display numbering
  // as Übersicht still count closed built in screen in the display count
  const adjustedDisplayId =
    isAeroSpace && !hasBuiltInRetina ? displayId - 1 : displayId;

  // Try to find the current display by custom index first
  let currentDisplay =
    currentDisplays?.find((d) => {
      const id = Aerospace.getCustomDisplayIndex(d, currentDisplays) ?? d.id;
      return id === adjustedDisplayId;
    }) || null;

  // Fallback for AeroSpace: Übersicht's display IDs (from NSScreen) don't always
  // map sequentially to AeroSpace monitor indices. Übersicht display 1 is always
  // the built-in; any other ID belongs to an external monitor.
  if (!currentDisplay && isAeroSpace && currentDisplays?.length) {
    const sorted = [...currentDisplays].sort((a, b) => {
      const aB = a["monitor-name"] === "Built-in Retina Display" ? 0 : 1;
      const bB = b["monitor-name"] === "Built-in Retina Display" ? 0 : 1;
      if (aB !== bB) return aB - bB;
      return (
        (a["monitor-appkit-nsscreen-screens-id"] ?? 0) -
        (b["monitor-appkit-nsscreen-screens-id"] ?? 0)
      );
    });
    currentDisplay = displayId === 1 ? sorted[0] : sorted[1];
  }

  currentDisplay = currentDisplay || {};

  const displayIndex =
    (currentDisplay.index ??
      Aerospace.getCustomDisplayIndex(currentDisplay, currentDisplays)) ||
    1;

  const pushMissive = (newMissive) => {
    const now = Date.now();
    const { content, side = "right", delay = 5000 } = newMissive;
    const timeout =
      typeof delay === "number" && delay !== 0
        ? setTimeout(() => {
            setMissives((current) => {
              return current.filter((m) => m.id !== now);
            });
          }, delay)
        : undefined;
    setMissives((current) => {
      return [...current, { id: now, content, side, timeout }];
    });
  };

  return (
    <SimpleBarContext.Provider
      value={{
        displayIndex,
        SIPDisabled,
        settings,
        setSettings,
        displays: currentDisplays,
        setDisplays,
        missives,
        setMissives,
        pushMissive,
      }}
    >
      {children}
    </SimpleBarContext.Provider>
  );
}
