/**
 * Copy text to the clipboard, including over plain HTTP.
 *
 * Browsers only provide navigator.clipboard on secure pages (HTTPS or
 * localhost). FermentOS is usually opened at http://<pi-ip>:<port>, where it is
 * undefined — calling it there throws before any .catch can run, which is how
 * every copy button in Settings silently did nothing. The fallback is the old
 * select-and-execCommand("copy") route: deprecated, but still supported by
 * Chrome, Firefox and Safari, and the only option an insecure page has.
 *
 * Resolves to whether the text was copied; never throws.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Denied permission or no focus — try the fallback below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  // Off-screen rather than display:none, which can't be selected.
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  const previousFocus = document.activeElement as HTMLElement | null;
  try {
    textarea.select();
    textarea.setSelectionRange(0, text.length); // iOS Safari ignores select() alone
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
    previousFocus?.focus?.();
  }
}
