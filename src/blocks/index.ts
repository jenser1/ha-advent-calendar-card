import type { TemplateResult } from 'lit';
import type { DoorContent } from '../types';
import { validateEffect } from './effect';
import { imageStyles, renderImage } from './image';
import { LINK_KINDS, linkStyles, normalizeLink, renderLink } from './link';
import { renderTask, taskStyles } from './task';
import { renderText, textStyles } from './text';
import { isSafeUrl } from './url';
import { parseVideo, renderVideo, videoStyles } from './video';

export const blockStyles = [textStyles, imageStyles, taskStyles, linkStyles, videoStyles];

export const BLOCK_KEYS = ['text', 'answer', 'image', 'task', 'link', 'video', 'effect'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Leere Werte (z. B. ein gerade im Editor hinzugefügter Baustein) gelten als
 * „nicht gesetzt“: Sie werden weder geprüft noch angezeigt.
 */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function requireText(value: unknown, path: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `„${path}“ muss ein Text sein (Zahlen oder Texte mit Doppelpunkt in Anführungszeichen setzen).`,
    );
  }
}

function requireUrl(value: unknown, path: string): void {
  requireText(value, path);
  if (!isSafeUrl(value as string)) {
    throw new Error(`„${path}“ muss mit https:// oder / beginnen (z. B. /local/advent/bild.gif).`);
  }
}

function validateLink(value: unknown, path: string): void {
  if (typeof value === 'string') {
    requireUrl(value, path);
    return;
  }
  if (!isRecord(value)) {
    throw new Error(`„${path}“ muss eine Adresse oder „url“, „title“ und „kind“ enthalten.`);
  }
  const allowed = ['url', 'title', 'description', 'kind'];
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) {
    throw new Error(`„${path}.${unknown}“ gibt es nicht. Möglich sind: ${allowed.join(', ')}.`);
  }
  if (!isBlank(value.url)) {
    requireUrl(value.url, `${path}.url`);
  }
  for (const key of ['title', 'description'] as const) {
    if (!isBlank(value[key])) {
      requireText(value[key], `${path}.${key}`);
    }
  }
  if (!isBlank(value.kind) && !(LINK_KINDS as readonly unknown[]).includes(value.kind)) {
    throw new Error(`„${path}.kind“ muss eines davon sein: ${LINK_KINDS.join(', ')}.`);
  }
}

/** Prüft den Inhalt eines Türchens und wirft bei Fehlern eine verständliche Meldung. */
export function validateDoorContent(content: Record<string, unknown>, path: string): void {
  for (const key of Object.keys(content)) {
    if (!(BLOCK_KEYS as readonly string[]).includes(key)) {
      throw new Error(`„${path}.${key}“ gibt es nicht. Möglich sind: ${BLOCK_KEYS.join(', ')}.`);
    }
  }
  for (const key of ['text', 'answer', 'task'] as const) {
    if (!isBlank(content[key])) {
      requireText(content[key], `${path}.${key}`);
    }
  }
  if (!isBlank(content.answer) && isBlank(content.text)) {
    throw new Error(`„${path}.answer“ braucht einen „text“ mit dem Rätsel.`);
  }
  if (!isBlank(content.image)) {
    requireUrl(content.image, `${path}.image`);
  }
  if (!isBlank(content.video)) {
    requireText(content.video, `${path}.video`);
    if (!parseVideo(content.video as string)) {
      throw new Error(
        `„${path}.video“ muss ein YouTube-Link oder eine Videodatei (.mp4, .webm, .ogg, .mov) sein.`,
      );
    }
  }
  if (!isBlank(content.link)) {
    validateLink(content.link, `${path}.link`);
  }
  if (!isBlank(content.effect)) {
    validateEffect(content.effect, `${path}.effect`);
  }
}

/** Bausteine, die das Türchen tatsächlich anzeigt – in der Reihenfolge aus der YAML. */
export function visibleBlocks(content: DoorContent | null | undefined): (keyof DoorContent)[] {
  if (!content) {
    return [];
  }
  return (Object.keys(content) as (keyof DoorContent)[]).filter((key) => {
    switch (key) {
      case 'text':
      case 'image':
      case 'task':
      case 'video':
        return !isBlank(content[key]);
      case 'link':
        return !isBlank(content.link) && !isBlank(normalizeLink(content.link!).url);
      default:
        // answer hängt am text, effect wird beim Öffnen ausgelöst.
        return false;
    }
  });
}

/** true, wenn das Türchen etwas zum Anzeigen hat (ein reiner Effekt zählt nicht). */
export function hasVisibleContent(content: DoorContent | null | undefined): boolean {
  return visibleBlocks(content).length > 0;
}

export interface BlockContext {
  day: number;
  answerRevealed: boolean;
  taskDone: boolean;
  onReveal: () => void;
  onToggleTask: () => void;
  /** Erscheint neben dem Video, z. B. die Kerzen am Adventssonntag. */
  videoAside?: TemplateResult;
}

/** Rendert die Bausteine in der Reihenfolge, in der sie in der YAML stehen. */
export function renderBlocks(content: DoorContent, context: BlockContext): TemplateResult[] {
  return visibleBlocks(content).map((key) => {
    switch (key) {
      case 'text':
        return renderText(
          content.text!,
          isBlank(content.answer) ? undefined : content.answer,
          context.answerRevealed,
          context.onReveal,
        );
      case 'image':
        return renderImage(content.image!, context.day);
      case 'task':
        return renderTask(content.task!, context.taskDone, context.onToggleTask);
      case 'link':
        return renderLink(content.link!);
      default:
        return renderVideo(content.video!, context.videoAside);
    }
  });
}
