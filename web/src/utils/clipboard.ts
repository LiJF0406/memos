import copy from "copy-to-clipboard";

/**
 * Copy text to the clipboard, preferring the native async Clipboard API (HTTPS
 * / localhost) and falling back to the sync copy-to-clipboard library on
 * failure. Returns true when the copy is believed to have succeeded. Shared by
 * the read-only memo view (MemoContent/CodeBlock) and the editor code-block
 * node view.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn("Native clipboard failed, using fallback:", err);
  }

  try {
    const success = copy(text);
    if (!success) {
      console.error("Failed to copy code");
    }
    return success;
  } catch (err) {
    console.error("Failed to copy code:", err);
    return false;
  }
}
