function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function applyInlineFormatting(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

export function convertMarkdownToHtml(markdown: string): string {
  if (!markdown.trim()) {
    return ''
  }

  const lines = markdown.split('\n')
  const htmlParts: string[] = []
  let inUnorderedList = false
  let inOrderedList = false

  const closeLists = () => {
    if (inUnorderedList) {
      htmlParts.push('</ul>')
      inUnorderedList = false
    }
    if (inOrderedList) {
      htmlParts.push('</ol>')
      inOrderedList = false
    }
  }

  lines.forEach((line) => {
    const trimmed = line.trim()

    if (!trimmed) {
      closeLists()
      htmlParts.push('<br />')
      return
    }

    if (/^#{3}\s+/.test(trimmed)) {
      closeLists()
      const content = trimmed.replace(/^#{3}\s+/, '')
      htmlParts.push(`<h3>${applyInlineFormatting(escapeHtml(content))}</h3>`)
      return
    }

    if (/^#{2}\s+/.test(trimmed)) {
      closeLists()
      const content = trimmed.replace(/^#{2}\s+/, '')
      htmlParts.push(`<h2>${applyInlineFormatting(escapeHtml(content))}</h2>`)
      return
    }

    if (/^#\s+/.test(trimmed)) {
      closeLists()
      const content = trimmed.replace(/^#\s+/, '')
      htmlParts.push(`<h1>${applyInlineFormatting(escapeHtml(content))}</h1>`)
      return
    }

    if (/^---+$/.test(trimmed)) {
      closeLists()
      htmlParts.push('<hr />')
      return
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inOrderedList) {
        closeLists()
        htmlParts.push('<ol>')
        inOrderedList = true
      }
      const content = trimmed.replace(/^\d+\.\s+/, '')
      htmlParts.push(`<li>${applyInlineFormatting(escapeHtml(content))}</li>`)
      return
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (!inUnorderedList) {
        closeLists()
        htmlParts.push('<ul>')
        inUnorderedList = true
      }
      const content = trimmed.replace(/^[-*]\s+/, '')
      htmlParts.push(`<li>${applyInlineFormatting(escapeHtml(content))}</li>`)
      return
    }

    closeLists()
    htmlParts.push(`<p>${applyInlineFormatting(escapeHtml(trimmed))}</p>`)
  })

  closeLists()

  return htmlParts.join('\n')
}

