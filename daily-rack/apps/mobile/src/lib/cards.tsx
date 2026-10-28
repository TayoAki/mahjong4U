import { createContext, useContext, useEffect, useState } from 'react';
import { HOUSE_CARD, cardById, cardFromSpec, cardToSpec, hasCard, registerCard, type Card, type CardSpec } from '@daily-rack/core/mahjong';
import { api } from './api.ts';

// The cards tables can play with. The house card is built in; any others come from the
// server once and are registered with the engine, so hints, the card view and the
// winning-hand layout all use the table's own card.

let loading: Promise<CardSpec[]> | null = null;

export function loadCards(): Promise<CardSpec[]> {
  loading ??= api
    .cards()
    .then((r) => {
      for (const spec of r.cards) if (!hasCard(spec.id)) registerCard(cardFromSpec(spec));
      return r.cards;
    })
    .catch(() => {
      loading = null;
      return [cardToSpec(HOUSE_CARD)];
    });
  return loading;
}

/** Every card on offer, house card first. */
export function useCardList(): CardSpec[] {
  const [cards, setCards] = useState<CardSpec[]>([cardToSpec(HOUSE_CARD)]);
  useEffect(() => {
    void loadCards().then(setCards);
  }, []);
  return cards;
}

/** The card with this id, fetched if this device hasn't seen it yet. */
export function useTableCard(cardId: string | undefined): Card {
  const [, setLoaded] = useState(0);
  useEffect(() => {
    if (cardId && !hasCard(cardId)) void loadCards().then(() => setLoaded((n) => n + 1));
  }, [cardId]);
  return cardById(cardId);
}

/** The card for the table on screen; the house card anywhere else. */
export const CardContext = createContext<Card>(HOUSE_CARD);

export function useActiveCard(): Card {
  return useContext(CardContext);
}
