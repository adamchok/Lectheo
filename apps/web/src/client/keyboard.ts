/** True when keystrokes should go to a text field rather than global shortcuts (F1.1). */
export function isEditableElement(element: Element | null | undefined): boolean {
  if (!element) return false
  const tag = element.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (element as HTMLInputElement).type
    // Buttons-as-inputs don't take text, so shortcuts stay live on them.
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file'].includes(
      type,
    )
  }
  if ((element as HTMLElement).isContentEditable) return true
  const editable = element.getAttribute('contenteditable')
  return editable !== null && editable !== 'false'
}

/** Plain, un-modified, non-repeating key press while no text field has focus. */
export function isBareShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat || event.isComposing) return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (isEditableElement(document.activeElement)) return false
  return !(event.target instanceof Element && isEditableElement(event.target))
}
