import { describe, expect, it } from 'vitest';
import { hasVisibleContent, validateDoorContent } from '../src/blocks';
import { normalizeLink, parseGitHubRepo } from '../src/blocks/link';
import { isSafeUrl } from '../src/blocks/url';
import { parseVideo, youtubeEmbedUrl } from '../src/blocks/video';

describe('isSafeUrl', () => {
  it('erlaubt http(s) und Pfade auf dem eigenen Server', () => {
    expect(isSafeUrl('https://example.com/x.gif')).toBe(true);
    expect(isSafeUrl('http://192.168.178.43:8123/local/a.png')).toBe(true);
    expect(isSafeUrl('/local/advent/jens/01.gif')).toBe(true);
  });

  it('lehnt alles andere ab', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl(' JavaScript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeUrl('local/bild.gif')).toBe(false);
  });
});

describe('parseVideo', () => {
  const id = 'dQw4w9WgXcQ';

  it('erkennt die üblichen YouTube-Links', () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&list=abc`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
    ]) {
      expect(parseVideo(url), url).toEqual({ kind: 'youtube', id, start: undefined });
    }
  });

  it('übernimmt die Startzeit', () => {
    expect(parseVideo(`https://youtu.be/${id}?t=90`)).toMatchObject({ start: 90 });
    expect(parseVideo(`https://www.youtube.com/watch?v=${id}&t=1m30s`)).toMatchObject({ start: 90 });
  });

  it('erkennt eigene Videodateien', () => {
    expect(parseVideo('/local/advent/clip.mp4')).toEqual({ kind: 'file', src: '/local/advent/clip.mp4' });
    expect(parseVideo('https://example.com/schnee.WEBM')).toEqual({
      kind: 'file',
      src: 'https://example.com/schnee.WEBM',
    });
  });

  it('lehnt anderes ab', () => {
    expect(parseVideo('https://www.youtube.com/watch?v=kurz')).toBeUndefined();
    expect(parseVideo('https://vimeo.com/123')).toBeUndefined();
    expect(parseVideo('javascript:alert(1)//x.mp4')).toBeUndefined();
    expect(parseVideo('/local/advent/bild.gif')).toBeUndefined();
  });

  it('bettet über youtube-nocookie ein', () => {
    expect(youtubeEmbedUrl(id)).toBe(`https://www.youtube-nocookie.com/embed/${id}`);
    expect(youtubeEmbedUrl(id, 90)).toBe(`https://www.youtube-nocookie.com/embed/${id}?start=90`);
  });
});

describe('Links', () => {
  it('normalizeLink macht aus einer Adresse ein Link-Objekt', () => {
    expect(normalizeLink('https://example.com')).toEqual({ url: 'https://example.com' });
    expect(normalizeLink({ url: 'https://example.com', kind: 'shop' })).toEqual({
      url: 'https://example.com',
      kind: 'shop',
    });
  });

  it('parseGitHubRepo erkennt Repos', () => {
    expect(parseGitHubRepo('https://github.com/jenser1/ha-vorrat-addon')).toEqual({
      owner: 'jenser1',
      repo: 'ha-vorrat-addon',
    });
    expect(parseGitHubRepo('https://github.com/jenser1/ha-vorrat-addon.git')).toMatchObject({
      repo: 'ha-vorrat-addon',
    });
    expect(parseGitHubRepo('https://github.com/jenser1/ha-vorrat-addon/tree/main')).toMatchObject({
      repo: 'ha-vorrat-addon',
    });
    expect(parseGitHubRepo('https://github.com/jenser1')).toBeUndefined();
    expect(parseGitHubRepo('https://gitlab.com/a/b')).toBeUndefined();
  });
});

describe('validateDoorContent', () => {
  const ok = (content: Record<string, unknown>) => () => validateDoorContent(content, 'doors.1');

  it('akzeptiert alle Bausteine', () => {
    expect(
      ok({
        text: 'Was ist grün und klopft?',
        answer: 'Ein Klopfsalat',
        image: '/local/advent/01.gif',
        task: 'Gutschein: Frühstück ans Bett',
        link: { url: 'https://github.com/jenser1/ha-vorrat-addon', title: 'Vorrat', kind: 'github' },
        video: 'https://youtu.be/dQw4w9WgXcQ',
        effect: { service: 'script.turn_on' },
      }),
    ).not.toThrow();
    expect(ok({ link: 'https://example.com' })).not.toThrow();
    expect(ok({})).not.toThrow();
  });

  it('meldet Tippfehler mit den möglichen Schlüsseln', () => {
    expect(ok({ txt: 'Hallo' })).toThrow(/„doors\.1\.txt“ gibt es nicht\. Möglich sind: text, answer/);
    expect(ok({ link: { url: 'https://x.de', titel: 'x' } })).toThrow(/„doors\.1\.link\.titel“/);
  });

  it('prüft Texte', () => {
    expect(ok({ text: 42 })).toThrow(/„doors\.1\.text“ muss ein Text sein/);
    expect(ok({ task: '   ' })).toThrow(/„doors\.1\.task“/);
    expect(ok({ answer: 'Lösung' })).toThrow(/braucht einen „text“/);
  });

  it('ignoriert leere Felder, z. B. einen gerade im Editor angelegten Baustein', () => {
    expect(
      ok({ text: '', answer: '', image: '', task: null, video: '', link: { url: '', kind: 'shop' }, effect: [] }),
    ).not.toThrow();
    expect(hasVisibleContent({ text: '', image: '', link: { url: '' } })).toBe(false);
    expect(hasVisibleContent({ text: '', task: 'Kekse backen' })).toBe(true);
  });

  it('lässt keine gefährlichen Adressen zu', () => {
    expect(ok({ image: 'javascript:alert(1)' })).toThrow(/„doors\.1\.image“ muss mit https/);
    expect(ok({ link: 'javascript:alert(1)' })).toThrow(/„doors\.1\.link“ muss mit https/);
    expect(ok({ link: { url: 'javascript:alert(1)' } })).toThrow(/„doors\.1\.link\.url“/);
  });

  it('prüft Videos, Link-Arten und Effekte', () => {
    expect(ok({ video: 'https://vimeo.com/1' })).toThrow(/YouTube-Link oder eine Videodatei/);
    expect(ok({ link: { url: 'https://x.de', kind: 'blog' } })).toThrow(/github, video, shop, web/);
    expect(ok({ effect: 'script.lichtshow' })).toThrow(/„doors\.1\.effect“/);
  });
});

describe('hasVisibleContent', () => {
  it('zählt nur sichtbare Bausteine', () => {
    expect(hasVisibleContent(undefined)).toBe(false);
    expect(hasVisibleContent(null)).toBe(false);
    expect(hasVisibleContent({})).toBe(false);
    expect(hasVisibleContent({ effect: { service: 'script.turn_on' } })).toBe(false);
    expect(hasVisibleContent({ task: 'x' })).toBe(true);
  });
});
