import * as Uebersicht from "uebersicht";
import * as DataWidget from "./data-widget.jsx";
import * as DataWidgetLoader from "./data-widget-loader.jsx";
import * as Icons from "../icons/icons.jsx";
import useWidgetRefresh from "../../hooks/use-widget-refresh";
import useServerSocket from "../../hooks/use-server-socket";
import { useSimpleBarContext } from "../simple-bar-context.jsx";
import * as Utils from "../../utils";

export { wifiStyles as styles } from "../../styles/components/data/wifi";

const { React } = Uebersicht;

const DEFAULT_REFRESH_FREQUENCY = 20000;

/**
 * Wifi widget component.
 * @returns {JSX.Element|null} The Wifi widget.
 */
export const Widget = React.memo(() => {
  const { displayIndex, settings, pushMissive } = useSimpleBarContext();
  const { widgets, networkWidgetOptions } = settings;
  const { wifiWidget } = widgets;
  const {
    refreshFrequency,
    hideWifiIfDisabled,
    toggleWifiOnClick,
    networkDevice,
    hideNetworkName,
    showOnDisplay,
    showIcon,
  } = networkWidgetOptions;
  const visible =
    Utils.isVisibleOnDisplay(displayIndex, showOnDisplay) && wifiWidget;

  const refresh = React.useMemo(
    () =>
      Utils.getRefreshFrequency(refreshFrequency, DEFAULT_REFRESH_FREQUENCY),
    [refreshFrequency],
  );

  const [state, setState] = React.useState();
  const [loading, setLoading] = React.useState(visible);

  /**
   * Resets the widget state.
   */
  const resetWidget = () => {
    setState(undefined);
    setLoading(false);
  };

  /**
   * Fetches the wifi status.
   *
   * This used to also read the SSID out of `system_profiler SPAirPortDataType`.
   * That call costs about 6.5 seconds of wall time and wakes airportd every
   * time, and on a machine that has not granted Location Services it answers
   * `<redacted>` and nothing else -- six and a half seconds spent to learn
   * nothing. `ifconfig` alone tells us whether the interface is associated, at
   * roughly 20ms.
   *
   * `networksetup -getairportpower` (~70ms) is what separates "powered off"
   * from "powered on but not associated", so it only runs when the interface is
   * already known to be down. While connected -- the common case -- this widget
   * now costs one `ifconfig`.
   */
  const getWifi = React.useCallback(async () => {
    if (!visible) return;
    const status = Utils.cleanupOutput(
      await Utils.cachedRun(`ifconfig ${networkDevice} | grep status | cut -c 10-`, refresh),
    );
    let poweredOn = true;
    if (status !== "active") {
      const power = await Utils.cachedRun(
        `networksetup -getairportpower ${networkDevice}`,
        refresh,
      );
      poweredOn = /:\s*on\s*$/i.test(Utils.cleanupOutput(power));
    }
    setState({ status, poweredOn });
    setLoading(false);
  }, [networkDevice, visible, refresh]);

  useServerSocket("wifi", visible, getWifi, resetWidget, setLoading);
  useWidgetRefresh(visible, getWifi, refresh);

  if (loading) return <DataWidgetLoader.Widget className="wifi" />;
  if (!state) return null;

  const { status, poweredOn } = state;
  const isActive = status === "active";
  const name = renderName(isActive, poweredOn, hideNetworkName);

  if (hideWifiIfDisabled && !isActive) return null;

  const classes = Utils.classNames("wifi", {
    "wifi--hidden-name": !name,
    "wifi--inactive": !isActive,
  });

  const Icon = isActive ? Icons.Wifi : Icons.WifiOff;

  /**
   * Handles the click event to toggle wifi.
   * @param {React.MouseEvent} e - The click event.
   */
  const onClick = async (e) => {
    Utils.clickEffect(e);
    await toggleWifi(isActive, networkDevice, pushMissive);
    getWifi();
  };

  return (
    <DataWidget.Widget
      classes={classes}
      Icon={showIcon ? Icon : null}
      onClick={toggleWifiOnClick ? onClick : undefined}
      onRightClick={openWifiPreferences}
    >
      {name}
    </DataWidget.Widget>
  );
});

Widget.displayName = "Wifi";

/**
 * Toggles the wifi on or off.
 * @param {boolean} isActive - Whether the wifi is currently active.
 * @param {string} networkDevice - The network device name.
 * @param {function} pushMissive - Function to push notifications.
 */
async function toggleWifi(isActive, networkDevice, pushMissive) {
  if (isActive) {
    await Uebersicht.run(`networksetup -setairportpower ${networkDevice} off`);
    Utils.notification("Disabling network...", pushMissive);
  } else {
    await Uebersicht.run(`networksetup -setairportpower ${networkDevice} on`);
    Utils.notification("Enabling network...", pushMissive);
  }
}

/**
 * Opens the wifi preferences pane.
 * @param {React.MouseEvent} e - The click event.
 */
function openWifiPreferences(e) {
  Utils.clickEffect(e);
  Uebersicht.run(`open /System/Library/PreferencePanes/Network.prefPane/`);
}

/**
 * Renders the wifi label.
 *
 * The SSID is deliberately not shown: macOS redacts it without Location
 * Services, so the only way to obtain it was the `system_profiler` call this
 * widget no longer makes. The three states below are what that call actually
 * conveyed in practice.
 *
 * @param {boolean} isActive - Whether the interface is associated.
 * @param {boolean} poweredOn - Whether the Wi-Fi radio is powered on.
 * @param {boolean} hideNetworkName - Whether to hide the label.
 * @returns {string} The rendered label.
 */
function renderName(isActive, poweredOn, hideNetworkName) {
  if (hideNetworkName) return "";
  if (isActive) return "Connected";
  return poweredOn ? "Searching..." : "Disabled";
}
