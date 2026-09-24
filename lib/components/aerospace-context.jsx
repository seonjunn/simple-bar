import * as Uebersicht from "uebersicht";
import { useSimpleBarContext } from "./simple-bar-context.jsx";
import useServerSocket from "../hooks/use-server-socket.js";
import * as Aerospace from "../aerospace.js";
import * as AerospaceMode from "../aerospace-mode.js";

const { React } = Uebersicht;

// Create a context with default values
const AerospaceContext = React.createContext({
  spaces: [],
  windows: [],
  mode: "",
});

/**
 * Custom hook to use the AerospaceContext
 * @returns {Object} The context value
 */
export function useAerospaceContext() {
  return React.useContext(AerospaceContext);
}

// Memoized AerospaceContextProvider component
export default React.memo(AerospaceContextProvider);

/**
 * AerospaceContextProvider component
 * @param {Object} props - The component props
 * @param {React.ReactNode} props.children - The child components
 * @returns {JSX.Element} The provider component
 */
function AerospaceContextProvider({ children }) {
  // Get settings, displayIndex, and displays from SimpleBarContext
  const { settings, displayIndex, displays, setDisplays } = useSimpleBarContext();
  const { enableServer, aerospaceServerRefresh } = settings.global;
  const serverEnabled = enableServer && aerospaceServerRefresh;

  // State to store aerospace spaces
  const [aerospaceSpaces, setAerospaceSpaces] = React.useState([]);
  const [currentMode, setCurrentMode] = React.useState({ mode: "main" });
  const latestRequestRef = React.useRef(0);

  // Fetches and sets the aerospace spaces
  const getSpaces = React.useCallback(async () => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    let focusedWindow = {};
    const [focusedSpace] = await Aerospace.getFocusedSpace();
    try {
      [focusedWindow] = await Aerospace.getFocusedWindow();
      // eslint-disable-next-line no-empty
    } catch (e) {}
    // Fetch fresh displays to handle monitor connect/disconnect without full widget reload
    const freshDisplays = await Aerospace.getDisplays();
    const displayList = freshDisplays?.length ? freshDisplays : displays;
    if (
      requestId === latestRequestRef.current &&
      freshDisplays?.length &&
      JSON.stringify(freshDisplays) !== JSON.stringify(displays)
    ) {
      setDisplays(freshDisplays);
    }
    // Build a lookup from nsscreen ID → resolved display index
    const nscreenToIndex = {};
    for (const display of displayList) {
      const nsId = display["monitor-appkit-nsscreen-screens-id"];
      if (nsId != null) {
        nscreenToIndex[nsId] = Aerospace.getCustomDisplayIndex(display, displayList);
      }
    }

    const spaces = await Promise.all(
      displayList.map(async (display) => {
        const id = display["monitor-id"];
        const result = await Aerospace.getSpaces(id);
        return Promise.all(
          result.map(async (space) => {
            const focused = space.workspace === focusedSpace.workspace;
            const monitor =
              nscreenToIndex[space["monitor-appkit-nsscreen-screens-id"]] ??
              Aerospace.getCustomDisplayIndex(space);
            const windows = await Aerospace.getWindows(space.workspace);
            const formatted = windows.map((window) => {
              const focused =
                window["window-id"] === focusedWindow["window-id"];
              return {
                ...window,
                focused,
              };
            });
            return { ...space, windows: formatted, focused, monitor };
          }),
        );
      }),
    );
    if (requestId !== latestRequestRef.current) {
      return;
    }
    setAerospaceSpaces(spaces.flat());
  }, [displays, setDisplays]);

  // Refreshes spaces with the data sent by simple-bar-server if it exists
  // in order to speed up the process then refreshes everything in background
  // else, simply refreshes everything
  const refreshSpaces = React.useCallback(
    async (data) => {
      if (data) {
        const { space } = data;
        setAerospaceSpaces((current) => {
          return current.map((s) => ({ ...s, focused: s.workspace === space }));
        });
        getSpaces();
      } else {
        await getSpaces();
      }
    },
    [getSpaces],
  );

  // Resets the aerospace spaces state
  const resetSpaces = () => {
    setAerospaceSpaces([]);
  };

  const getMode = React.useCallback(async () => {
    const nextMode = await AerospaceMode.getMode();
    setCurrentMode((prev) => {
      if (prev.mode === nextMode.mode && prev.color === nextMode.color) {
        return prev;
      }
      return nextMode;
    });
  }, []);

  // Use server socket to fetch and reset spaces
  useServerSocket("spaces", serverEnabled, refreshSpaces, resetSpaces);

  // Fetch spaces on component mount and when displayIndex changes
  React.useEffect(() => {
    refreshSpaces();
  }, [refreshSpaces, displayIndex]);

  React.useEffect(() => {
    getMode();
    const intervalId = setInterval(getMode, 300);
    return () => clearInterval(intervalId);
  }, [getMode]);

  return (
    <AerospaceContext.Provider value={{ spaces: aerospaceSpaces, mode: currentMode }}>
      {children}
    </AerospaceContext.Provider>
  );
}
