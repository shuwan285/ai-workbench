// constraints 内部统一存 string[]。界面上是一行一条，粘贴多行会自动拆开。

export function normalizeConstraints(input) {
  if (Array.isArray(input)) {
    return input.map((s) => String(s).trim()).filter(Boolean)
  }
  if (typeof input === 'string') {
    return input
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

export function constraintsToText(list) {
  return Array.isArray(list) ? list.join('\n') : ''
}

export function addConstraint(list, text) {
  return normalizeConstraints([...(list || []), ...normalizeConstraints(text)])
}

export function removeConstraint(list, index) {
  return (list || []).filter((_, i) => i !== index)
}
