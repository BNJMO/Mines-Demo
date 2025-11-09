import { ServerRelay } from "../serverRelay.js";

export const DEFAULT_SERVER_URL = "https://dev.securesocket.net:8443";

let sessionId = null;

function normalizeBaseUrl(url) {
  if (typeof url !== "string") {
    return DEFAULT_SERVER_URL;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return DEFAULT_SERVER_URL;
  }

  return trimmed.replace(/\/+$/, "");
}

export function getSessionId() {
  return sessionId;
}

function isServerRelay(candidate) {
  return candidate instanceof ServerRelay;
}

export async function initializeSessionId({
  url = DEFAULT_SERVER_URL,
  relay,
} = {}) {
  const baseUrl = normalizeBaseUrl(url);
  const endpoint = `${baseUrl}/get_session_id`;

  const requestPayload = {
    method: "GET",
    url: endpoint,
  };

  if (isServerRelay(relay)) {
    relay.send("api:get_session_id:request", requestPayload);
  }

  let response;

  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
      },
    });
  } catch (networkError) {
    if (isServerRelay(relay)) {
      relay.deliver("api:get_session_id:response", {
        ok: false,
        error: networkError?.message ?? "Network error",
        request: requestPayload,
      });
    }
    throw networkError;
  }

  const rawBody = await response.text();
  let nextSessionId = rawBody;

  const responsePayload = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: rawBody,
    request: requestPayload,
  };

  try {
    const parsed = JSON.parse(rawBody);
    if (typeof parsed === "string") {
      nextSessionId = parsed;
    } else if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.sessionId === "string"
    ) {
      nextSessionId = parsed.sessionId;
    }
  } catch (error) {
    // Response is not JSON; treat raw body as the session id string.
  }

  if (typeof nextSessionId !== "string" || nextSessionId.length === 0) {
    if (isServerRelay(relay)) {
      relay.deliver("api:get_session_id:response", {
        ...responsePayload,
        ok: false,
        error: "Session id response did not include a session id value",
      });
    }
    throw new Error("Session id response did not include a session id value");
  }

  if (!response.ok) {
    if (isServerRelay(relay)) {
      relay.deliver("api:get_session_id:response", {
        ...responsePayload,
        ok: false,
        error: `Failed to initialize session id: ${response.status} ${response.statusText}`,
      });
    }
    throw new Error(
      `Failed to initialize session id: ${response.status} ${response.statusText}`
    );
  }

  sessionId = nextSessionId;

  if (isServerRelay(relay)) {
    relay.deliver("api:get_session_id:response", {
      ...responsePayload,
      ok: true,
      sessionId,
    });
  }

  return sessionId;
}

function createLogEntry(direction, type, payload) {
  const entry = document.createElement("div");
  entry.className = `server__log-entry server__log-entry--${direction}`;

  const header = document.createElement("div");
  const directionLabel = document.createElement("span");
  directionLabel.className = "server__log-direction";
  directionLabel.textContent =
    direction === "incoming" ? "Server → App" : "App → Server";
  header.appendChild(directionLabel);

  const typeLabel = document.createElement("span");
  typeLabel.className = "server__log-type";
  typeLabel.textContent = type ?? "unknown";
  header.appendChild(typeLabel);

  entry.appendChild(header);

  const payloadNode = document.createElement("pre");
  payloadNode.className = "server__log-payload";
  payloadNode.textContent = JSON.stringify(payload ?? {}, null, 2);
  entry.appendChild(payloadNode);

  return entry;
}

function ensureRelay(relay) {
  if (!relay) {
    throw new Error("A ServerRelay instance is required");
  }
  if (!(relay instanceof ServerRelay)) {
    throw new Error("Server expects a ServerRelay instance");
  }
  return relay;
}

export function createServer(relay, options = {}) {
  const serverRelay = ensureRelay(relay);
  const mount = options.mount ?? document.querySelector(".app-wrapper") ?? document.body;
  const onDemoModeToggle = options.onDemoModeToggle ?? (() => {});
  const onVisibilityChange = options.onVisibilityChange ?? (() => {});
  const initialDemoMode = Boolean(options.initialDemoMode ?? true);
  const initialCollapsed = Boolean(options.initialCollapsed ?? true);
  const initialHidden = Boolean(options.initialHidden ?? false);

  const container = document.createElement("div");
  container.className = "server";
  if (initialCollapsed) {
    container.classList.add("server--collapsed");
  }
  if (initialHidden) {
    container.classList.add("server--hidden");
  }

  const header = document.createElement("div");
  header.className = "server__header";
  container.appendChild(header);

  const title = document.createElement("div");
  title.className = "server__title";
  title.textContent = "Server";
  header.appendChild(title);

  const headerControls = document.createElement("div");
  headerControls.className = "server__header-controls";
  header.appendChild(headerControls);

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "server__toggle";
  toggleLabel.textContent = "Demo Mode";

  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.checked = initialDemoMode;
  toggleInput.addEventListener("change", () => {
    onDemoModeToggle(Boolean(toggleInput.checked));
  });

  toggleLabel.appendChild(toggleInput);
  headerControls.appendChild(toggleLabel);

  const minimizeButton = document.createElement("button");
  minimizeButton.type = "button";
  minimizeButton.className = "server__minimize";
  minimizeButton.setAttribute("aria-label", "Toggle server visibility");
  minimizeButton.textContent = initialCollapsed ? "+" : "−";
  minimizeButton.addEventListener("click", () => {
    const collapsed = container.classList.toggle("server--collapsed");
    minimizeButton.textContent = collapsed ? "+" : "−";
  });
  headerControls.appendChild(minimizeButton);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "server__close";
  closeButton.setAttribute("aria-label", "Hide server");
  closeButton.textContent = "×";
  headerControls.appendChild(closeButton);

  const body = document.createElement("div");
  body.className = "server__body";
  container.appendChild(body);

  const logSection = document.createElement("div");
  logSection.className = "server__log";
  body.appendChild(logSection);

  const logList = document.createElement("div");
  logList.className = "server__log-list";
  logSection.appendChild(logList);

  const logHeader = document.createElement("div");
  logHeader.className = "server__log-header";
  logSection.insertBefore(logHeader, logList);

  const logTitle = document.createElement("div");
  logTitle.className = "server__log-title";
  logTitle.textContent = "Relay Log";
  logHeader.appendChild(logTitle);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "server__clear-log";
  clearButton.textContent = "Clear";
  clearButton.addEventListener("click", () => {
    logList.textContent = "";
  });
  logHeader.appendChild(clearButton);

  const controlsSection = document.createElement("div");
  controlsSection.className = "server__controls";
  body.appendChild(controlsSection);

  function createControlsGroup(title) {
    const group = document.createElement("div");
    group.className = "server__controls-group";

    const heading = document.createElement("div");
    heading.className = "server__controls-group-title";
    heading.textContent = title;
    group.appendChild(heading);

    const buttonsContainer = document.createElement("div");
    buttonsContainer.className = "server__controls-group-buttons";
    group.appendChild(buttonsContainer);

    controlsSection.appendChild(group);
    return buttonsContainer;
  }

  const manualControls = createControlsGroup("Manual Actions");
  const autoControls = createControlsGroup("Auto Actions");
  const profitControls = createControlsGroup("PROFIT");

  const buttons = [];
  const inputs = [];

  createInputRow({
    placeholder: "Profit multiplier",
    type: "number",
    step: "0.01",
    inputMode: "decimal",
    mountPoint: profitControls,
    buttonLabel: "Update Multiplier",
    onSubmit: ({ input }) => {
      const raw = input.value.trim();
      const payload = { value: raw === "" ? null : raw };
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) {
        payload.numericValue = numeric;
      }
      serverRelay.deliver("profit:update-multiplier", payload);
      input.value = "";
    },
  });

  createInputRow({
    placeholder: "Total profit",
    type: "text",
    inputMode: "decimal",
    mountPoint: profitControls,
    buttonLabel: "Update Profit",
    onSubmit: ({ input }) => {
      const raw = input.value.trim();
      const payload = { value: raw === "" ? null : raw };
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) {
        payload.numericValue = numeric;
      }
      serverRelay.deliver("profit:update-total", payload);
      input.value = "";
    },
  });

  function appendLog(direction, type, payload) {
    const entry = createLogEntry(direction, type, payload);
    logList.appendChild(entry);
    logList.scrollTop = logList.scrollHeight;
  }

  function createButton(label, onClick, mountPoint = controlsSection) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = "server__button";
    button.addEventListener("click", () => {
      if (typeof onClick === "function") {
        onClick();
      }
    });
    mountPoint.appendChild(button);
    buttons.push(button);
    return button;
  }

  function createInputRow({
    placeholder,
    type = "text",
    step,
    inputMode,
    onSubmit,
    mountPoint,
    buttonLabel,
  }) {
    const row = document.createElement("div");
    row.className = "server__field-row";
    (mountPoint ?? controlsSection).appendChild(row);

    const input = document.createElement("input");
    input.type = type;
    input.placeholder = placeholder;
    input.className = "server__input";
    if (step !== undefined) {
      input.step = step;
    }
    if (inputMode) {
      input.inputMode = inputMode;
    }
    row.appendChild(input);
    inputs.push(input);

    const button = createButton(
      buttonLabel ?? "Submit",
      () => {
        if (typeof onSubmit === "function") {
          onSubmit({ input, button });
        }
      },
      row
    );

    if (typeof onSubmit === "function") {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          button.click();
        }
      });
    }

    return { row, input, button };
  }

  const state = {
    lastManualSelection: null,
    lastAutoSelections: [],
  };

  createButton(
    "Start Bet",
    () => {
      serverRelay.deliver("start-bet", {});
    },
    manualControls
  );

  createButton(
    "On Bet Won",
    () => {
      serverRelay.deliver("bet-result", {
        result: "win",
        selection: state.lastManualSelection,
      });
    },
    manualControls
  );

  createButton(
    "On Bet Lost",
    () => {
      serverRelay.deliver("bet-result", {
        result: "lost",
        selection: state.lastManualSelection,
      });
    },
    manualControls
  );

  createButton(
    "Cashout",
    () => {
      serverRelay.deliver("cashout", {});
    },
    manualControls
  );

  createButton(
    "On Autobet Won",
    () => {
      const selections = state.lastAutoSelections ?? [];
      const results = selections.map((selection) => ({
        row: selection?.row,
        col: selection?.col,
        result: "win",
      }));
      serverRelay.deliver("auto-bet-result", { results });
    },
    autoControls
  );

  createButton(
    "On Autobet Lost",
    () => {
      const selections = state.lastAutoSelections ?? [];
      const results = selections.map((selection, index) => ({
        row: selection?.row,
        col: selection?.col,
        result: index === 0 ? "lost" : "win",
      }));
      serverRelay.deliver("auto-bet-result", { results });
    },
    autoControls
  );

  createButton(
    "Stop Autobet",
    () => {
      serverRelay.deliver("stop-autobet", { completed: false });
    },
    autoControls
  );

  mount.prepend(container);

  let visible = !initialHidden;

  function applyVisibility(next, { force = false } = {}) {
    const normalized = Boolean(next);
    if (!force && normalized === visible) {
      return;
    }
    visible = normalized;
    container.classList.toggle("server--hidden", !normalized);
    onVisibilityChange(visible);
  }

  const show = () => applyVisibility(true);
  const hide = () => applyVisibility(false);

  closeButton.addEventListener("click", () => {
    hide();
  });

  function setDemoMode(enabled) {
    const normalized = Boolean(enabled);
    if (toggleInput.checked !== normalized) {
      toggleInput.checked = normalized;
    }
    buttons.forEach((button) => {
      button.disabled = normalized;
    });
    inputs.forEach((input) => {
      input.disabled = normalized;
    });
  }

  setDemoMode(initialDemoMode);
  applyVisibility(visible, { force: true });

  const outgoingHandler = (event) => {
    const { type, payload } = event.detail ?? {};
    appendLog("outgoing", type, payload);

    switch (type) {
      case "game:manual-selection":
        state.lastManualSelection = payload ?? null;
        break;
      case "game:auto-selections":
        state.lastAutoSelections = Array.isArray(payload?.selections)
          ? payload.selections.map((selection) => ({ ...selection }))
          : [];
        break;
      default:
        break;
    }
  };

  const incomingHandler = (event) => {
    const { type, payload } = event.detail ?? {};
    appendLog("incoming", type, payload);
  };

  serverRelay.addEventListener("outgoing", outgoingHandler);
  serverRelay.addEventListener("incoming", incomingHandler);

  serverRelay.addEventListener("demomodechange", (event) => {
    setDemoMode(Boolean(event.detail?.value));
  });

  return {
    element: container,
    setDemoMode,
    show,
    hide,
    isVisible() {
      return Boolean(visible);
    },
    destroy() {
      serverRelay.removeEventListener("outgoing", outgoingHandler);
      serverRelay.removeEventListener("incoming", incomingHandler);
      container.remove();
    },
  };
}
