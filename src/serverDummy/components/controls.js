import { createActionButton } from "./primitives.js";

const DEFAULT_CLASS_PREFIX = "server-dummy";

function getClassName(prefix, suffix) {
  return suffix ? `${prefix}__${suffix}` : prefix;
}

export class ControlsGroup {
  constructor({ title, mount, prefix = DEFAULT_CLASS_PREFIX } = {}) {
    this.prefix = prefix;
    this.element = document.createElement("div");
    this.element.className = getClassName(prefix, "controls-group");

    this.titleElement = document.createElement("div");
    this.titleElement.className = getClassName(prefix, "controls-group-title");
    this.titleElement.textContent = title ?? "";
    this.element.appendChild(this.titleElement);

    this.buttonsContainer = document.createElement("div");
    this.buttonsContainer.className = getClassName(
      prefix,
      "controls-group-buttons"
    );
    this.element.appendChild(this.buttonsContainer);

    if (mount) {
      mount.appendChild(this.element);
    }
  }

  addButton({ label, onClick, className }) {
    const button = createActionButton({
      label,
      onClick,
      prefix: this.prefix,
      className,
    });
    this.buttonsContainer.appendChild(button);
    return button;
  }

  addInputRow({
    placeholder,
    type = "text",
    step,
    inputMode,
    onSubmit,
    buttonLabel,
  }) {
    const row = document.createElement("div");
    row.className = getClassName(this.prefix, "field-row");
    this.buttonsContainer.appendChild(row);

    const input = document.createElement("input");
    input.type = type;
    input.placeholder = placeholder ?? "";
    input.className = getClassName(this.prefix, "input");
    if (step !== undefined) {
      input.step = step;
    }
    if (inputMode) {
      input.inputMode = inputMode;
    }
    row.appendChild(input);

    const button = createActionButton({
      label: buttonLabel ?? "Submit",
      prefix: this.prefix,
      onClick: () => {
        if (typeof onSubmit === "function") {
          onSubmit({ input, button });
        }
      },
    });
    row.appendChild(button);

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
}
