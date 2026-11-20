import { isRecord } from '../validation';

export const SOURCE_TAG_DEFINITIONS = [
  { id: 'githubIssues', name: 'GitHub issues', placeholder: '#source/github' }
] as const;
export type SourceId = typeof SOURCE_TAG_DEFINITIONS[number]['id'];
export type SourceTags = Record<SourceId, string>;
export const EMPTY_SOURCE_TAGS: SourceTags = { githubIssues: '' };

function isTagCharacter(char: string): boolean
{
  return /^[\p{L}\p{M}\p{N}\p{S}_/-]$/u.test(char) || char === '\u200D';
}

export function normalizeSourceTag(value: string): string
{
  const trimmed = value.trim();
  if (!trimmed) return '';
  const tag = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const name = tag.slice(1);
  const characters = [...name];
  const unsafeAscii = characters.some(char => char.charCodeAt(0) < 128 && !/[a-z\d_/-]/i.test(char));
  const hasNonNumeric = characters.some(char => char !== '\u200D' && !/^[\p{N}\p{M}]$/u.test(char));
  if (!name || !characters.every(isTagCharacter) || unsafeAscii || !hasNonNumeric
    || name.split('/').some(part => !part)) {
    throw new Error('Use one tag without spaces, for example #source/github. Numeric-only tags are not supported.');
  }
  return tag;
}

export function cleanSourceTags(value: unknown): SourceTags
{
  const result = { ...EMPTY_SOURCE_TAGS };
  if (!isRecord(value)) return result;
  for (const source of SOURCE_TAG_DEFINITIONS) {
    const candidate = value[source.id];
    if (typeof candidate !== 'string') continue;
    try { result[source.id] = normalizeSourceTag(candidate); }
    catch { /* Invalid persisted tags must never become task markup. */ }
  }
  return result;
}

export function appendSourceTag(suffix: string, sourceTag: string): string
{
  const tag = normalizeSourceTag(sourceTag);
  if (!tag) return suffix;
  const chars = [...suffix];
  for (let index = 0; index < chars.length; index++) {
    if (chars[index] !== '#' || (index > 0 && (isTagCharacter(chars[index - 1]) || chars[index - 1] === '\\' || chars[index - 1] === '#'))) continue;
    let end = index + 1;
    while (end < chars.length && isTagCharacter(chars[end])) end++;
    if (chars.slice(index, end).join('').toLowerCase() === tag.toLowerCase()) return suffix;
    index = end - 1;
  }
  return `${suffix} ${tag}`;
}
