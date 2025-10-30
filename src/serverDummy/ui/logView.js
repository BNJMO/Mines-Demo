const DEFAULT_CLASS_PREFIX = "server-dummy";

function getClassName(prefix, suffix) {
  return suffix ? `${prefix}__${suffix}` : prefix;
}

function createLogEntry(direction, type, payload, prefix) {
  const entry = document.createElement("div");
  entry.className = `${getClassName(prefix, "log-entry")} ${getClassName(
    prefix,
    `log-entry--${direction}`
  )}`;

  const header = document.createElement("div");
  const directionLabel = document.createElement("span");
  directionLabel.className = getClassName(prefix, "log-direction");
  directionLabel.textContent =
    direction === "incoming" ? "Server → App" : "App → Server";
  header.appendChild(directionLabel);

  const typeLabel = document.createElement("span");
  typeLabel.className = getClassName(prefix, "log-type");
  typeLabel.textContent = type ?? "unknown";
  header.appendChild(typeLabel);

  entry.appendChild(header);

  const payloadNode = document.createElement("pre");
  payloadNode.className = getClassName(prefix, "log-payload");
  payloadNode.textContent = JSON.stringify(payload ?? {}, null, 2);
  entry.appendChild(payloadNode);

  return entry;
}

export class LogView {
  constructor({
    mount,
    prefix = DEFAULT_CLASS_PREFIX,
    title = "Relay Log",
    clearButtonLabel = "Clear",
    onClear = () => {},
  } = {}) {
    this.prefix = prefix;

    this.element = document.createElement("div");
    this.element.className = getClassName(prefix, "log");

    this.headerElement = document.createElement("div");
    this.headerElement.className = getClassName(prefix, "log-header");
    this.element.appendChild(this.headerElement);

    this.titleElement = document.createElement("div");
    this.titleElement.className = getClassName(prefix, "log-title");
    this.titleElement.textContent = title;
    this.headerElement.appendChild(this.titleElement);

    this.clearButton = document.createElement("button");
    this.clearButton.type = "button";
    this.clearButton.className = getClassName(prefix, "clear-log");
    this.clearButton.textContent = clearButtonLabel;
    this.clearButton.addEventListener("click", () => {
      this.clear();
      onClear();
    });
    this.headerElement.appendChild(this.clearButton);

    this.listElement = document.createElement("div");
    this.listElement.className = getClassName(prefix, "log-list");
    this.element.appendChild(this.listElement);

    if (mount) {
      mount.appendChild(this.element);
    }
  }

  append(direction, type, payload) {
    const entry = createLogEntry(direction, type, payload, this.prefix);
    this.listElement.appendChild(entry);
    this.listElement.scrollTop = this.listElement.scrollHeight;
    return entry;
  }

  clear() {
    this.listElement.textContent = "";
  }

  setTitle(title) {
    this.titleElement.textContent = title ?? "";
  }

  destroy() {
    this.element?.remove?.();
  }
}
