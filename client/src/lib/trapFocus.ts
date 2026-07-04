// Svelte action: basic focus trap + Escape handling for modal dialogs (B12).
// Moves focus into the dialog on mount, cycles Tab/Shift+Tab within its
// focusable descendants, calls `onEscape` on Escape, and restores focus to
// whatever was focused before the dialog opened when it's destroyed.

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface TrapFocusOptions {
  onEscape?: () => void;
}

export function trapFocus(node: HTMLElement, options: TrapFocusOptions = {}) {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  function focusables(): HTMLElement[] {
    return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      options.onEscape?.();
      return;
    }
    if (e.key !== "Tab") return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const initial = focusables();
  (initial[0] ?? node).focus();

  node.addEventListener("keydown", handleKeydown);

  return {
    update(newOptions: TrapFocusOptions) {
      options = newOptions;
    },
    destroy() {
      node.removeEventListener("keydown", handleKeydown);
      previouslyFocused?.focus();
    },
  };
}
