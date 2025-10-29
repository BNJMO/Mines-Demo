const DEFAULT_CLASS_PREFIX = "server-dummy";

function getClassName(prefix, suffix) {
  return suffix ? `${prefix}__${suffix}` : prefix;
}

export class BasePanel {
  constructor({
    mount = document.body,
    title = "",
    prefix = DEFAULT_CLASS_PREFIX,
    collapsed = false,
    hidden = false,
    onCollapseChange = () => {},
    onVisibilityChange = () => {},
  } = {}) {
    this.prefix = prefix;
    this.onCollapseChange = onCollapseChange;
    this.onVisibilityChange = onVisibilityChange;

    this.element = document.createElement("div");
    this.element.className = getClassName(prefix);

    this.headerElement = document.createElement("div");
    this.headerElement.className = getClassName(prefix, "header");
    this.element.appendChild(this.headerElement);

    this.titleElement = document.createElement("div");
    this.titleElement.className = getClassName(prefix, "title");
    this.headerElement.appendChild(this.titleElement);
    this.setTitle(title);

    this.headerActionsElement = document.createElement("div");
    this.headerActionsElement.className = getClassName(prefix, "header-controls");
    this.headerElement.appendChild(this.headerActionsElement);

    this.bodyElement = document.createElement("div");
    this.bodyElement.className = getClassName(prefix, "body");
    this.element.appendChild(this.bodyElement);

    this.visible = !hidden;
    this.collapsed = Boolean(collapsed);

    if (this.collapsed) {
      this.element.classList.add(`${prefix}--collapsed`);
    }
    if (!this.visible) {
      this.element.classList.add(`${prefix}--hidden`);
    }

    (mount ?? document.body).prepend(this.element);
  }

  get body() {
    return this.bodyElement;
  }

  addHeaderAction(node) {
    if (node) {
      this.headerActionsElement.appendChild(node);
    }
    return node;
  }

  setTitle(title) {
    this.titleElement.textContent = title ?? "";
  }

  isCollapsed() {
    return this.collapsed;
  }

  setCollapsed(value, { silent = false } = {}) {
    const normalized = Boolean(value);
    if (normalized === this.collapsed) {
      return;
    }
    this.collapsed = normalized;
    this.element.classList.toggle(
      `${this.prefix}--collapsed`,
      this.collapsed
    );
    if (!silent) {
      this.onCollapseChange(this.collapsed);
    }
  }

  toggleCollapsed() {
    this.setCollapsed(!this.collapsed);
  }

  isVisible() {
    return this.visible;
  }

  setHidden(hidden, { silent = false } = {}) {
    const visible = !Boolean(hidden);
    if (visible === this.visible) {
      return;
    }
    this.visible = visible;
    this.element.classList.toggle(
      `${this.prefix}--hidden`,
      !this.visible
    );
    if (!silent) {
      this.onVisibilityChange(this.visible);
    }
  }

  show(options) {
    this.setHidden(false, options);
  }

  hide(options) {
    this.setHidden(true, options);
  }

  destroy() {
    this.element?.remove?.();
  }
}
