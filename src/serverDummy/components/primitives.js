const DEFAULT_CLASS_PREFIX = "server-dummy";

function getClassName(prefix, suffix) {
  return suffix ? `${prefix}__${suffix}` : prefix;
}

export function createActionButton({
  label,
  prefix = DEFAULT_CLASS_PREFIX,
  onClick,
  className,
  type = "button",
  includeBaseClass = true,
}) {
  const button = document.createElement("button");
  button.type = type;
  button.textContent = label ?? "";
  const classes = [];
  if (includeBaseClass) {
    classes.push(getClassName(prefix, "button"));
  }
  if (className) {
    classes.push(className);
  }
  button.className = classes.join(" ").trim();
  if (typeof onClick === "function") {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onClick(event);
    });
  }
  return button;
}

export function createToggle({
  label,
  checked = false,
  prefix = DEFAULT_CLASS_PREFIX,
  onChange,
}) {
  const wrapper = document.createElement("label");
  wrapper.className = getClassName(prefix, "toggle");

  const textNode = document.createElement("span");
  textNode.textContent = label ?? "";
  wrapper.appendChild(textNode);

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checked);
  if (typeof onChange === "function") {
    input.addEventListener("change", (event) => {
      onChange(Boolean(event.target?.checked), event);
    });
  }
  wrapper.appendChild(input);

  return { element: wrapper, input };
}

export function createIconButton({
  label,
  ariaLabel,
  prefix = DEFAULT_CLASS_PREFIX,
  onClick,
  className,
  includeBaseClass = false,
}) {
  const button = createActionButton({
    label,
    onClick,
    prefix,
    className,
    includeBaseClass,
  });
  if (ariaLabel) {
    button.setAttribute("aria-label", ariaLabel);
  }
  return button;
}
