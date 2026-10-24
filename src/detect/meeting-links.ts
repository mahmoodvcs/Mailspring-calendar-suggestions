import { decodeEntities } from './html-to-text';

const PROVIDERS: { name: string; pattern: RegExp }[] = [
  { name: 'Zoom', pattern: /https:\/\/(?:[\w-]+\.)?zoom\.us\/(?:j|my|w|s)\/[^\s"'<>)\]]+/i },
  { name: 'Google Meet', pattern: /https:\/\/meet\.google\.com\/[a-z]{3,4}-[a-z]{4}-[a-z]{3,4}\b/i },
  {
    name: 'Microsoft Teams',
    pattern: /https:\/\/teams\.(?:microsoft|live)\.com\/(?:l\/meetup-join|meet)\/[^\s"'<>)\]]+/i,
  },
  { name: 'Webex', pattern: /https:\/\/[\w-]+\.webex\.com\/(?:meet|join|[\w-]+\/j\.php)[^\s"'<>)\]]*/i },
  { name: 'Whereby', pattern: /https:\/\/whereby\.com\/[\w-]+/i },
  { name: 'Jitsi', pattern: /https:\/\/meet\.jit\.si\/[\w-]+/i },
  { name: 'GoTo Meeting', pattern: /https:\/\/(?:gotomeet\.me|meet\.goto\.com|global\.gotomeeting\.com\/join)\/[\w/-]+/i },
  { name: 'Amazon Chime', pattern: /https:\/\/chime\.aws\/\d+/i },
];

export interface MeetingLink {
  provider: string;
  url: string;
}

/** Returns the first video-meeting link in the message, whichever provider it belongs to. */
export function findMeetingLink(html: string): MeetingLink | null {
  const source = decodeEntities(html);
  let best: (MeetingLink & { index: number }) | null = null;
  for (const { name, pattern } of PROVIDERS) {
    const match = pattern.exec(source);
    if (match && (!best || match.index < best.index)) {
      best = { provider: name, url: match[0].replace(/[.,;:]+$/, ''), index: match.index };
    }
  }
  return best && { provider: best.provider, url: best.url };
}
