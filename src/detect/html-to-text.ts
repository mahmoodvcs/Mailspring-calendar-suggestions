// A regex conversion rather than DOMParser so detection runs (and is tested) outside a browser.
// It only needs to keep words in order and lines apart, not to render faithfully.

const NAMED_ENTITIES: { [name: string]: string } = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  middot: '·',
  bull: '•',
  rarr: '→',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const LINE_BREAKING_TAGS =
  /<br\s*\/?>|<\/?(p|div|li|ul|ol|tr|table|h[1-6]|blockquote|section|article|header|footer|hr)\b[^>]*>/gi;

export function htmlToText(html: string): string {
  const withoutInvisible = html
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const flattened = withoutInvisible
    .replace(LINE_BREAKING_TAGS, '\n')
    .replace(/<\/t[dh]\s*>/gi, ' \t ')
    .replace(/<[^>]+>/g, '');

  return decodeEntities(flattened)
    .replace(/[ \t\u00a0\u200b]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Drops "> " quoted lines and everything from the first "On … wrote:" attribution or Outlook
 * "Original Message" divider onward.
 */
export function stripQuotedPlainText(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const twoLines = `${line} ${lines[i + 1] || ''}`;
    if (/^\s*On\b.{0,200}\bwrote:\s*$/i.test(line) || /^\s*On\b.{0,200}\bwrote:\s*$/i.test(twoLines)) {
      break;
    }
    // Forwarded messages are kept: forwarding an invitation is a common way to share it.
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    kept.push(line);
  }
  return kept.join('\n').trim();
}
