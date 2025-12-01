import { ServerRelay } from "../serverRelay.js";

function ensureRelay(relay) {
  if (!relay) {
    throw new Error("A ServerRelay instance is required");
  }
  if (!(relay instanceof ServerRelay)) {
    throw new Error("Server expects a ServerRelay instance");
  }
  return relay;
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

export class ServerPanel {
  constructor(relay, options = {}) {
    this.serverRelay = ensureRelay(relay);
    this.onVisibilityChange = options.onVisibilityChange ?? (() => {});
    this.onDemoModeToggle = options.onDemoModeToggle ?? (() => {});
    this.visible = !(options.initialHidden ?? false);
    this.collapsed = Boolean(options.initialCollapsed ?? false);

    const mount =
      options.mount ?? document.querySelector(".app-wrapper") ?? document.body;
    const initialDemoMode = Boolean(options.initialDemoMode ?? true);

    this.container = document.createElement("div");
    this.container.className = "server";
    if (this.collapsed) {
      this.container.classList.add("server--collapsed");
    }
    if (!this.visible) {
      this.container.classList.add("server--hidden");
    }

    const header = document.createElement("div");
    header.className = "server__header";
    this.container.appendChild(header);

    const title = document.createElement("div");
    title.className = "server__title";
    title.textContent = "Server";
    header.appendChild(title);

    const headerControls = document.createElement("div");
    headerControls.className = "server__header-controls";
    header.appendChild(headerControls);

    this.toggleLabel = document.createElement("label");
    this.toggleLabel.className = "server__toggle";
    this.toggleLabel.textContent = "Demo Mode";

    this.toggleInput = document.createElement("input");
    this.toggleInput.type = "checkbox";
    this.toggleInput.checked = initialDemoMode;
    this.toggleInput.addEventListener("change", () => {
      this.onDemoModeToggle(Boolean(this.toggleInput.checked));
    });

    this.toggleLabel.appendChild(this.toggleInput);
    headerControls.appendChild(this.toggleLabel);

    this.minimizeButton = document.createElement("button");
    this.minimizeButton.type = "button";
    this.minimizeButton.className = "server__minimize";
    this.minimizeButton.setAttribute("aria-label", "Toggle server visibility");
    this.minimizeButton.textContent = this.collapsed ? "+" : "−";
    this.minimizeButton.addEventListener("click", () => {
      this.toggleCollapsed();
    });
    headerControls.appendChild(this.minimizeButton);

    this.closeButton = document.createElement("button");
    this.closeButton.type = "button";
    this.closeButton.className = "server__close";
    this.closeButton.setAttribute("aria-label", "Hide server");
    this.closeButton.textContent = "×";
    this.closeButton.addEventListener("click", () => {
      this.hide();
    });
    headerControls.appendChild(this.closeButton);

    const body = document.createElement("div");
    body.className = "server__body";
    this.container.appendChild(body);

    const logSection = document.createElement("div");
    logSection.className = "server__log";
    body.appendChild(logSection);

    const logHeader = document.createElement("div");
    logHeader.className = "server__log-header";
    logSection.appendChild(logHeader);

    const logTitle = document.createElement("div");
    logTitle.className = "server__log-title";
    logTitle.textContent = "Log";
    logHeader.appendChild(logTitle);

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "server__clear-log";
    clearButton.textContent = "Clear";
    logHeader.appendChild(clearButton);

    this.logList = document.createElement("div");
    this.logList.className = "server__log-list";
    logSection.appendChild(this.logList);

    clearButton.addEventListener("click", () => {
      this.logList.innerHTML = "";
    });

    mount.prepend(this.container);

    this.outgoingHandler = (event) => {
      const { type, payload } = event.detail ?? {};
      this.appendLog("outgoing", type, payload);
    };

    this.incomingHandler = (event) => {
      const { type, payload } = event.detail ?? {};
      this.appendLog("incoming", type, payload);
    };

    this.serverRelay.addEventListener("outgoing", this.outgoingHandler);
    this.serverRelay.addEventListener("incoming", this.incomingHandler);

    this.demoModeHandler = (event) => {
      this.setDemoMode(Boolean(event.detail?.value));
    };
    this.serverRelay.addEventListener("demomodechange", this.demoModeHandler);
  }

  toggleCollapsed() {
    this.collapsed = this.container.classList.toggle("server--collapsed");
    this.minimizeButton.textContent = this.collapsed ? "+" : "−";
  }

  appendLog(direction, type, payload) {
    const entry = createLogEntry(direction, type, payload);
    this.logList.appendChild(entry);
    this.logList.scrollTop = this.logList.scrollHeight;
  }

  applyVisibility(next, { force = false } = {}) {
    const normalized = Boolean(next);
    if (!force && normalized === this.visible) {
      return;
    }
    this.visible = normalized;
    this.container.classList.toggle("server--hidden", !normalized);
    this.onVisibilityChange(this.visible);
  }

  show() {
    this.applyVisibility(true);
  }

  hide() {
    this.applyVisibility(false);
  }

  isVisible() {
    return Boolean(this.visible);
  }

  setDemoMode(enabled) {
    const normalized = Boolean(enabled);
    if (this.toggleInput.checked !== normalized) {
      this.toggleInput.checked = normalized;
    }
  }

  destroy() {
    this.serverRelay.removeEventListener("outgoing", this.outgoingHandler);
    this.serverRelay.removeEventListener("incoming", this.incomingHandler);
    this.serverRelay.removeEventListener("demomodechange", this.demoModeHandler);
    this.container.remove();
  }
}

export function createServerPanel(relay, options = {}) {
  return new ServerPanel(relay, options);
}
