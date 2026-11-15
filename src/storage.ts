import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card, Deck } from './types';
import type { ThemeMode } from './theme';

const KEY = 'memoflow.decks.v2';
const THEME_KEY = 'memoflow.theme.v1';

export const MAX_LEVEL = 6;
export const SESSION_SIZE = 20;

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function loadDecks(): Promise<Deck[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveDecks(decks: Deck[]) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(decks));
  } catch {}
}

export async function loadThemeMode(): Promise<ThemeMode> {
  try {
    const v = await AsyncStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

export async function saveThemeMode(mode: ThemeMode) {
  try {
    await AsyncStorage.setItem(THEME_KEY, mode);
  } catch {}
}

export function makeCard(front: string, back: string): Card {
  return {
    id: uid(),
    front,
    back,
    level: 0,
    nextReview: 0,
    lastReviewed: 0,
    correct: 0,
    wrong: 0,
    levelBack: 0,
    nextReviewBack: 0,
    lastReviewedBack: 0,
    correctBack: 0,
    wrongBack: 0,
  };
}

// Сбрасывает только прогресс, текст/фото/звук остаются
export function resetCardProgress(card: Card): Card {
  return {
    ...card,
    level: 0,
    nextReview: 0,
    lastReviewed: 0,
    correct: 0,
    wrong: 0,
    levelBack: 0,
    nextReviewBack: 0,
    lastReviewedBack: 0,
    correctBack: 0,
    wrongBack: 0,
  };
}

const INTERVALS = [
  0, 60_000, 10 * 60_000, 60 * 60_000,
  24 * 3_600_000, 3 * 24 * 3_600_000, 7 * 24 * 3_600_000,
];

export function applyReview(
  card: Card,
  remembered: boolean,
  side: 'front' | 'back' = 'front'
): Card {
  const now = Date.now();
  if (side === 'front') {
    const level = remembered
      ? Math.min(card.level + 1, MAX_LEVEL)
      : Math.max(0, card.level - 2);
    const interval = INTERVALS[level] ?? 0;
    return {
      ...card,
      level,
      nextReview: now + interval,
      lastReviewed: now,
      correct: card.correct + (remembered ? 1 : 0),
      wrong: card.wrong + (remembered ? 0 : 1),
    };
  }
  const prevLevel = card.levelBack ?? 0;
  const levelBack = remembered
    ? Math.min(prevLevel + 1, MAX_LEVEL)
    : Math.max(0, prevLevel - 2);
  const interval = INTERVALS[levelBack] ?? 0;
  return {
    ...card,
    levelBack,
    nextReviewBack: now + interval,
    lastReviewedBack: now,
    correctBack: (card.correctBack ?? 0) + (remembered ? 1 : 0),
    wrongBack: (card.wrongBack ?? 0) + (remembered ? 0 : 1),
  };
}

const levelOf = (c: Card, reverse: boolean) => (reverse ? c.levelBack ?? 0 : c.level);
const nextOf = (c: Card, reverse: boolean) =>
  reverse ? c.nextReviewBack ?? 0 : c.nextReview;

// Можно ли учить карточку в этом направлении:
// у стороны, которая показывается первой, должно быть хоть что-то (текст, фото или звук)
function isStudyable(c: Card, reverse: boolean): boolean {
  const text = reverse ? c.back : c.front;
  const image = reverse ? c.backImage : c.frontImage;
  const audio = reverse ? c.backAudio : c.frontAudio;
  return !!(text && text.trim()) || !!image || !!audio;
}

// Сколько карточек пора повторять прямо сейчас
export function countDue(cards: Card[], reverse = false): number {
  const now = Date.now();
  return cards.filter(c => isStudyable(c, reverse) && nextOf(c, reverse) <= now).length;
}

// Очередь для учёбы: сначала те, что пора повторять, самые слабые — вперёд.
// includeAll = true — берём вообще все карточки (повторить «просто так»).
export function buildStudyQueue(
  cards: Card[],
  reverse = false,
  includeAll = false,
  limit = SESSION_SIZE
): Card[] {
  const now = Date.now();
  const pool = cards.filter(
    c => isStudyable(c, reverse) && (includeAll || nextOf(c, reverse) <= now)
  );
  return [...pool]
    .sort((a, b) => {
      const dl = levelOf(a, reverse) - levelOf(b, reverse);
      if (dl !== 0) return dl;
      return nextOf(a, reverse) - nextOf(b, reverse);
    })
    .slice(0, limit);
}

// Правильное склонение: 1 колода, 2 колоды, 5 колод
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}