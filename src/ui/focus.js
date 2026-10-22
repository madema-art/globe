// Spatial-ish focus navigation for controller and keyboard: moves DOM focus between `[data-nav]`
// elements of the visible screen in document order (menus are vertical lists; rows move left/right).
// Focus is always a real DOM focus, so the same :focus-visible styles serve every input device.

export function createFocusNavigator() {
  function candidates(root) {
    return [...root.querySelectorAll('[data-nav]')].filter((el) => !el.disabled && !el.closest('[hidden]') && el.offsetParent !== null);
  }
  return {
    /** Move focus within `root`. direction: 'next' | 'previous'. Returns true if focus moved. */
    move(root, direction) {
      const list = candidates(root);
      if (!list.length) return false;
      const index = list.indexOf(document.activeElement);
      const next = index < 0 ? 0 : (index + (direction === 'next' ? 1 : -1) + list.length) % list.length;
      list[next].focus({ focusVisible: true });
      return true;
    },
    /** Focus the first enabled entry (or `preferred` if it is available). */
    enter(root, preferred) {
      const list = candidates(root);
      const target = (preferred && list.includes(preferred) && preferred) || list[0];
      target?.focus({ focusVisible: true });
      return target ?? null;
    },
    activate() {
      const el = document.activeElement;
      if (!el || el === document.body || el.disabled) return false;
      el.click();
      return true;
    },
  };
}
