import type { TemplateResult } from 'lit';
import type { DoorContent } from '../types';
import { imageStyles, renderImage } from './image';
import { LINK_KINDS, linkStyles, renderLink } from './link';
import { renderTask, taskStyles } from './task';
import { renderText, textStyles } from './text';
import { isSafeUrl } from './url';
import { parseVideo, renderVideo, videoStyles } from './video';

export const blockStyles = [textStyles, imageStyles, taskStyles, linkStyles, videoStyles];

const BLOCK_KEYS = ['text', 'answer', 'image', 'task', 'link', 'video', 'effect'] as const;
const VISIBLE_KEYS = ['text', 'image', 'task', 'link', 'video'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  requireUrl(value.url, `${path}.url`);
  if (value.title !== undefined) {
    requireText(value.title, `${path}.title`);
  }
  if (value.description !== undefined) {
    requireText(value.description, `${path}.description`);
  }
  if (value.kind !== undefined && !(LINK_KINDS as readonly unknown[]).includes(value.kind)) {
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
    if (content[key] !== undefined) {
      requireText(content[key], `${path}.${key}`);
    }
  }
  if (content.answer !== undefined && content.text === undefined) {
    throw new Error(`„${path}.answer“ braucht einen „text“ mit dem Rätsel.`);
  }
  if (content.image !== undefined) {
    requireUrl(content.image, `${path}.image`);
  }
  if (content.video !== undefined) {
    requireText(content.video, `${path}.video`);
    if (!parseVideo(content.video as string)) {
      throw new Error(
        `„${path}.video“ muss ein YouTube-Link oder eine Videodatei (.mp4, .webm, .ogg, .mov) sein.`,
      );
    }
  }
  if (content.link !== undefined) {
    validateLink(content.link, `${path}.link`);
  }
  if (content.effect !== undefined && !isRecord(content.effect)) {
    throw new Error(`„${path}.effect“ muss einen Service-Aufruf enthalten, z. B. „service: …“.`);
  }
}

/** true, wenn das Türchen etwas zum Anzeigen hat (ein reiner Effekt zählt nicht). */
export function hasVisibleContent(content: DoorContent | null | undefined): boolean {
  return !!content && VISIBLE_KEYS.some((key) => content[key] !== undefined);
}

export interface BlockContext {
  day: number;
  answerRevealed: boolean;
  taskDone: boolean;
  onReveal: () => void;
  onToggleTask: () => void;
}

/** Rendert die Bausteine in der Reihenfolge, in der sie in der YAML stehen. */
export function renderBlocks(content: DoorContent, context: BlockContext): TemplateResult[] {
  const blocks: TemplateResult[] = [];
  for (const key of Object.keys(content) as (keyof DoorContent)[]) {
    switch (key) {
      case 'text':
        blocks.push(
          renderText(content.text!, content.answer, context.answerRevealed, context.onReveal),
        );
        break;
      case 'image':
        blocks.push(renderImage(content.image!, context.day));
        break;
      case 'task':
        blocks.push(renderTask(content.task!, context.taskDone, context.onToggleTask));
        break;
      case 'link':
        blocks.push(renderLink(content.link!));
        break;
      case 'video':
        blocks.push(renderVideo(content.video!));
        break;
      default:
        // answer hängt am text, effect wird beim Öffnen ausgelöst.
        break;
    }
  }
  return blocks;
}
