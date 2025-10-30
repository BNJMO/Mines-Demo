import { ServerRelay } from "../serverRelay.js";
import { BasePanel } from "./ui/basePanel.js";
import { LogView } from "./ui/logView.js";
import { ControlsGroup } from "./components/controls.js";
import { createIconButton, createToggle } from "./components/primitives.js";

function ensureRelay(relay) {
  if (!relay) {
    throw new Error("A ServerRelay instance is required");
  }
  if (!(relay instanceof ServerRelay)) {
    throw new Error("GameServerDummy expects a ServerRelay instance");
  }
  return relay;
}

function coerceNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export class GameServerDummy {
  constructor(relay, options = {}) {
    this.relay = ensureRelay(relay);
    this.options = {
      prefix: options.prefix ?? "server-dummy",
      mount: options.mount ?? document.querySelector(".app-wrapper") ?? document.body,
      title: options.title ?? "Dummy Server",
      initialDemoMode: Boolean(options.initialDemoMode ?? true),
      initialCollapsed: Boolean(options.initialCollapsed ?? true),
      initialHidden: Boolean(options.initialHidden ?? false),
      onDemoModeToggle: options.onDemoModeToggle ?? (() => {}),
      onVisibilityChange: options.onVisibilityChange ?? (() => {}),
    };

    this.buttons = [];
    this.inputs = [];
    this.state = {
      lastManualSelection: null,
      lastAutoSelections: [],
    };

    this.panel = new BasePanel({
      mount: this.options.mount,
      title: this.options.title,
      prefix: this.options.prefix,
      collapsed: this.options.initialCollapsed,
      hidden: this.options.initialHidden,
      onCollapseChange: (collapsed) => {
        this.updateCollapseButtonLabel(collapsed);
      },
      onVisibilityChange: (visible) => {
        this.options.onVisibilityChange(visible);
      },
    });

    const { element: toggleElement, input: toggleInput } = createToggle({
      label: "Demo Mode",
      checked: this.options.initialDemoMode,
      prefix: this.options.prefix,
      onChange: (value) => {
        this.setDemoMode(value);
        this.options.onDemoModeToggle(value);
      },
    });
    this.demoToggleInput = toggleInput;
    this.panel.addHeaderAction(toggleElement);

    this.collapseButton = createIconButton({
      label: "",
      ariaLabel: "Toggle dummy server visibility",
      prefix: this.options.prefix,
      onClick: () => {
        this.panel.toggleCollapsed();
        this.updateCollapseButtonLabel(this.panel.isCollapsed());
      },
      className: `${this.options.prefix}__minimize`,
    });
    this.panel.addHeaderAction(this.collapseButton);

    this.closeButton = createIconButton({
      label: "×",
      ariaLabel: "Hide dummy server",
      prefix: this.options.prefix,
      onClick: () => {
        this.hide();
      },
      className: `${this.options.prefix}__close`,
    });
    this.panel.addHeaderAction(this.closeButton);

    this.logView = new LogView({
      mount: this.panel.body,
      prefix: this.options.prefix,
    });

    this.controlsElement = document.createElement("div");
    this.controlsElement.className = `${this.options.prefix}__controls`;
    this.panel.body.appendChild(this.controlsElement);

    this.manualControls = new ControlsGroup({
      title: "Manual Actions",
      mount: this.controlsElement,
      prefix: this.options.prefix,
    });
    this.autoControls = new ControlsGroup({
      title: "Auto Actions",
      mount: this.controlsElement,
      prefix: this.options.prefix,
    });
    this.profitControls = new ControlsGroup({
      title: "PROFIT",
      mount: this.controlsElement,
      prefix: this.options.prefix,
    });

    this.registerControl(
      this.profitControls.addInputRow({
        placeholder: "Profit multiplier",
        type: "number",
        step: "0.01",
        inputMode: "decimal",
        buttonLabel: "Update Multiplier",
        onSubmit: ({ input }) => {
          const raw = input.value.trim();
          const payload = { value: raw === "" ? null : raw };
          const numericValue = coerceNumber(raw);
          if (numericValue != null) {
            payload.numericValue = numericValue;
          }
          this.relay.deliver("profit:update-multiplier", payload);
          input.value = "";
        },
      })
    );

    this.registerControl(
      this.profitControls.addInputRow({
        placeholder: "Total profit",
        type: "text",
        inputMode: "decimal",
        buttonLabel: "Update Profit",
        onSubmit: ({ input }) => {
          const raw = input.value.trim();
          const payload = { value: raw === "" ? null : raw };
          const numericValue = coerceNumber(raw);
          if (numericValue != null) {
            payload.numericValue = numericValue;
          }
          this.relay.deliver("profit:update-total", payload);
          input.value = "";
        },
      })
    );

    this.registerButton(
      this.manualControls.addButton({
        label: "Start Bet",
        onClick: () => {
          this.relay.deliver("start-bet", {});
        },
      })
    );

    this.registerButton(
      this.manualControls.addButton({
        label: "On Bet Won",
        onClick: () => {
          this.relay.deliver("bet-result", {
            result: "win",
            selection: this.state.lastManualSelection,
          });
        },
      })
    );

    this.registerButton(
      this.manualControls.addButton({
        label: "On Bet Lost",
        onClick: () => {
          this.relay.deliver("bet-result", {
            result: "lost",
            selection: this.state.lastManualSelection,
          });
        },
      })
    );

    this.registerButton(
      this.manualControls.addButton({
        label: "Cashout",
        onClick: () => {
          this.relay.deliver("cashout", {});
        },
      })
    );

    this.registerButton(
      this.autoControls.addButton({
        label: "On Autobet Won",
        onClick: () => {
          const selections = this.state.lastAutoSelections ?? [];
          const results = selections.map((selection) => ({
            row: selection?.row,
            col: selection?.col,
            result: "win",
          }));
          this.relay.deliver("auto-bet-result", { results });
        },
      })
    );

    this.registerButton(
      this.autoControls.addButton({
        label: "On Autobet Lost",
        onClick: () => {
          const selections = this.state.lastAutoSelections ?? [];
          const results = selections.map((selection, index) => ({
            row: selection?.row,
            col: selection?.col,
            result: index === 0 ? "lost" : "win",
          }));
          this.relay.deliver("auto-bet-result", { results });
        },
      })
    );

    this.registerButton(
      this.autoControls.addButton({
        label: "Stop Autobet",
        onClick: () => {
          this.relay.deliver("stop-autobet", { completed: false });
        },
      })
    );

    this.updateCollapseButtonLabel(this.panel.isCollapsed());
    this.setDemoMode(this.options.initialDemoMode);

    this.outgoingHandler = (event) => {
      const { type, payload } = event.detail ?? {};
      this.appendLog("outgoing", type, payload);

      switch (type) {
        case "game:manual-selection":
          this.state.lastManualSelection = payload ?? null;
          break;
        case "game:auto-selections":
          this.state.lastAutoSelections = Array.isArray(payload?.selections)
            ? payload.selections.map((selection) => ({ ...selection }))
            : [];
          break;
        default:
          break;
      }
    };

    this.incomingHandler = (event) => {
      const { type, payload } = event.detail ?? {};
      this.appendLog("incoming", type, payload);
    };

    this.demoModeListener = (event) => {
      this.setDemoMode(Boolean(event.detail?.value));
    };

    this.relay.addEventListener("outgoing", this.outgoingHandler);
    this.relay.addEventListener("incoming", this.incomingHandler);
    this.relay.addEventListener("demomodechange", this.demoModeListener);

    this.options.onVisibilityChange(this.panel.isVisible());
  }

  registerButton(button) {
    if (button) {
      this.buttons.push(button);
    }
    return button;
  }

  registerControl(control) {
    if (!control) {
      return control;
    }
    const { input, button } = control;
    if (input) {
      this.inputs.push(input);
    }
    if (button) {
      this.buttons.push(button);
    }
    return control;
  }

  appendLog(direction, type, payload) {
    this.logView.append(direction, type, payload);
  }

  setDemoMode(enabled) {
    const normalized = Boolean(enabled);
    if (this.demoToggleInput && this.demoToggleInput.checked !== normalized) {
      this.demoToggleInput.checked = normalized;
    }
    this.buttons.forEach((button) => {
      button.disabled = normalized;
    });
    this.inputs.forEach((input) => {
      input.disabled = normalized;
    });
  }

  updateCollapseButtonLabel(collapsed) {
    if (!this.collapseButton) {
      return;
    }
    this.collapseButton.textContent = collapsed ? "+" : "−";
  }

  show(options) {
    this.panel.show(options);
  }

  hide(options) {
    this.panel.hide(options);
  }

  isVisible() {
    return this.panel.isVisible();
  }

  get element() {
    return this.panel.element;
  }

  destroy() {
    this.relay.removeEventListener("outgoing", this.outgoingHandler);
    this.relay.removeEventListener("incoming", this.incomingHandler);
    this.relay.removeEventListener("demomodechange", this.demoModeListener);
    this.logView.destroy();
    this.panel.destroy();
    this.buttons = [];
    this.inputs = [];
  }
}
