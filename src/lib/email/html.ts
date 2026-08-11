const unsafeContainerTagPattern =
  /<\s*(script|iframe|object|embed|link|meta|base|form|input|textarea|select|option)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const unsafeSelfClosingTagPattern =
  /<\s*(script|iframe|object|embed|link|meta|base|form|input|textarea|select|option)\b[^>]*\/?>/gi;
const eventHandlerAttributePattern =
  /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const javascriptUrlPattern = /\s(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi;

export function containsHtmlMarkup(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function sanitizeEmailHtml(html: string) {
  return html
    .replace(unsafeContainerTagPattern, "")
    .replace(unsafeSelfClosingTagPattern, "")
    .replace(eventHandlerAttributePattern, "")
    .replace(javascriptUrlPattern, ' $1="#"');
}

export function htmlToPlainText(html: string) {
  return sanitizeEmailHtml(html)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
