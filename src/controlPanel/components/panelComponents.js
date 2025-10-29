export function createButton({
  text,
  className = "",
  type = "button",
  ariaLabel,
  onClick,
}) {
  const button = document.createElement("button");
  button.type = type;
  if (className) {
    button.className = className;
  }
  if (text != null) {
    button.textContent = text;
  }
  if (ariaLabel) {
    button.setAttribute("aria-label", ariaLabel);
  }
  if (typeof onClick === "function") {
    button.addEventListener("click", onClick);
  }
  return button;
}

export function createToggleButtonGroup({
  items,
  activeId,
  className = "control-toggle",
  buttonClassName = "control-toggle-btn",
  onChange,
}) {
  const wrapper = document.createElement("div");
  wrapper.className = className;

  const buttons = new Map();

  const handleSelection = (id) => {
    if (!buttons.has(id)) return;
    for (const [buttonId, button] of buttons) {
      const isActive = buttonId === id;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
    if (typeof onChange === "function") {
      onChange(id);
    }
  };

  items.forEach((item) => {
    const { id, label, ariaLabel, disabled } = item;
    const button = createButton({
      text: label,
      ariaLabel: ariaLabel ?? label,
      className: buttonClassName,
      onClick: () => handleSelection(id),
    });
    button.dataset.toggleId = id;
    if (disabled) {
      button.disabled = true;
      button.classList.add("is-non-clickable");
    }
    wrapper.appendChild(button);
    buttons.set(id, button);
  });

  if (activeId != null && buttons.has(activeId)) {
    handleSelection(activeId);
  }

  return {
    element: wrapper,
    buttons,
    setActive(id) {
      handleSelection(id);
    },
  };
}

export function createSectionLabel(text, { className = "control-section-label" } = {}) {
  const label = document.createElement("div");
  label.className = className;
  label.textContent = text;
  return label;
}

export function createSwitchButton({
  initialActive = false,
  className = "control-switch",
  handleClassName = "control-switch-handle",
  onToggle,
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("role", "switch");
  button.setAttribute("aria-pressed", String(Boolean(initialActive)));
  button.setAttribute("aria-checked", String(Boolean(initialActive)));

  const handle = document.createElement("span");
  handle.className = handleClassName;
  button.appendChild(handle);

  let active = Boolean(initialActive);
  if (active) {
    button.classList.add("is-on");
  }

  const update = (value) => {
    active = Boolean(value);
    button.classList.toggle("is-on", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-checked", String(active));
  };

  button.addEventListener("click", () => {
    update(!active);
    if (typeof onToggle === "function") {
      onToggle(active);
    }
  });

  return {
    element: button,
    handle,
    isActive: () => active,
    setActive(value) {
      update(value);
    },
    setDisabled(disabled) {
      button.disabled = Boolean(disabled);
      button.classList.toggle("is-non-clickable", Boolean(disabled));
    },
  };
}

export function createInputField({
  type = "text",
  inputMode,
  className = "",
  wrapperClassName = "",
  spellcheck = false,
  autocomplete = "off",
  ariaLabel,
  placeholder,
  value,
  onInput,
  onBlur,
}) {
  const wrapper = document.createElement("div");
  if (wrapperClassName) {
    wrapper.className = wrapperClassName;
  }

  const input = document.createElement("input");
  input.type = type;
  if (inputMode) {
    input.inputMode = inputMode;
  }
  input.autocomplete = autocomplete;
  input.spellcheck = spellcheck;
  if (className) {
    input.className = className;
  }
  if (ariaLabel) {
    input.setAttribute("aria-label", ariaLabel);
  }
  if (placeholder != null) {
    input.placeholder = placeholder;
  }
  if (value != null) {
    input.value = value;
  }
  if (typeof onInput === "function") {
    input.addEventListener("input", onInput);
  }
  if (typeof onBlur === "function") {
    input.addEventListener("blur", onBlur);
  }

  wrapper.appendChild(input);

  return { wrapper, input };
}

export function createIcon({ src, alt = "", className = "" }) {
  const icon = document.createElement("img");
  icon.src = src;
  icon.alt = alt;
  if (className) {
    icon.className = className;
  }
  return icon;
}

export function createStepperField({
  inputOptions,
  iconOptions,
  stepperFactory,
  wrapperClassName,
  hasStepperClass = "has-stepper",
}) {
  const { wrapper, input } = createInputField({
    ...inputOptions,
    wrapperClassName,
  });

  if (iconOptions?.src) {
    const icon = createIcon({
      src: iconOptions.src,
      alt: iconOptions.alt,
      className: iconOptions.className,
    });
    wrapper.appendChild(icon);
  }

  let stepper = null;
  if (typeof stepperFactory === "function") {
    stepper = stepperFactory();
    if (stepper?.element) {
      wrapper.appendChild(stepper.element);
    }
  }

  if (stepper && hasStepperClass) {
    wrapper.classList.add(hasStepperClass);
  }

  return { wrapper, input, stepper };
}

export function createSelectField({
  wrapperClassName,
  selectClassName = "control-select",
  arrowClassName = "control-select-arrow",
  options = [],
  ariaLabel,
  onChange,
}) {
  const wrapper = document.createElement("div");
  if (wrapperClassName) {
    wrapper.className = wrapperClassName;
  }

  const select = document.createElement("select");
  select.className = selectClassName;
  if (ariaLabel) {
    select.setAttribute("aria-label", ariaLabel);
  }

  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    if (option.disabled) {
      element.disabled = true;
    }
    select.appendChild(element);
  });

  if (typeof onChange === "function") {
    select.addEventListener("change", onChange);
  }

  wrapper.appendChild(select);

  const arrow = document.createElement("span");
  arrow.className = arrowClassName;
  arrow.setAttribute("aria-hidden", "true");
  wrapper.appendChild(arrow);

  return { wrapper, select, arrow };
}

export function createSummaryRow({
  label,
  value,
  className = "auto-advanced-summary-row",
  labelClassName = "auto-advanced-summary-label",
  valueClassName = "auto-advanced-summary-value",
}) {
  const row = document.createElement("div");
  row.className = className;

  const labelElement = document.createElement("span");
  labelElement.className = labelClassName;
  labelElement.textContent = label;

  const valueElement = document.createElement("span");
  valueElement.className = valueClassName;
  valueElement.textContent = value;

  row.append(labelElement, valueElement);
  return { row, labelElement, valueElement };
}

export function createCurrencyField({
  icon,
  inputClassName = "control-currency-input",
  wrapperClassName = "control-currency-field",
  value = "",
  ariaLabel,
  placeholder,
  onInput,
  onBlur,
}) {
  const { wrapper, input } = createInputField({
    type: "text",
    inputMode: "decimal",
    className: inputClassName,
    wrapperClassName,
    ariaLabel,
    value,
    placeholder,
    onInput,
    onBlur,
  });

  if (icon?.src) {
    const iconElement = createIcon({
      src: icon.src,
      alt: icon.alt,
      className: icon.className,
    });
    wrapper.appendChild(iconElement);
  }

  return { wrapper, input };
}
