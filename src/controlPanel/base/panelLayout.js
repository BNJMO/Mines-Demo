import { resolveMount } from "./utils.js";

export class ControlPanelLayout extends EventTarget {
  constructor(mount, { containerClass = "control-panel", scrollClass = "control-panel-scroll" } = {}) {
    super();
    this.host = resolveMount(mount);
    this.host.innerHTML = "";

    this.container = document.createElement("div");
    this.container.className = containerClass;
    this.host.appendChild(this.container);

    this.scrollContainer = document.createElement("div");
    this.scrollContainer.className = scrollClass;
    this.container.appendChild(this.scrollContainer);
  }

  get element() {
    return this.container;
  }

  get scrollElement() {
    return this.scrollContainer;
  }
}
