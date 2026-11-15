export type Card = {
  id: string;
  front: string;
  back: string;
  frontImage?: string;
  backImage?: string;
  frontAudio?: string;
  backAudio?: string;
  level: number;
  nextReview: number;
  lastReviewed: number;
  correct: number;
  wrong: number;
  // независимый прогресс для обратной стороны
  levelBack?: number;
  nextReviewBack?: number;
  lastReviewedBack?: number;
  correctBack?: number;
  wrongBack?: number;
};

export type Deck = {
  id: string;
  name: string;
  cards: Card[];
  createdAt: number;
  reverse?: boolean;
};