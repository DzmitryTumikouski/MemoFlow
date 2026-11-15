import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Deck } from './src/types';
import {
  applyReview, loadDecks, saveDecks, loadThemeMode, saveThemeMode,
} from './src/storage';
import { ThemeMode, ThemeProvider, useResolvedTheme } from './src/theme';
import DeckListScreen from './src/screens/DeckListScreen';
import DeckDetailScreen from './src/screens/DeckDetailScreen';
import StudyScreen from './src/screens/StudyScreen';
import CardEditScreen from './src/screens/CardEditScreen';

type Route =
  | { name: 'decks' }
  | { name: 'deck'; deckId: string }
  | { name: 'study'; deckId: string }
  | { name: 'cardEdit'; deckId: string; cardId?: string };

export default function App() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [route, setRoute] = useState<Route>({ name: 'decks' });
  const [mode, setModeState] = useState<ThemeMode>('system');
  const theme = useResolvedTheme(mode);

  useEffect(() => {
    Promise.all([loadDecks(), loadThemeMode()]).then(([d, m]) => {
      setDecks(d);
      setModeState(m);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) saveDecks(decks);
  }, [decks, loaded]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    saveThemeMode(m);
  }, []);

  const updateDeck = (deckId: string, updater: (d: Deck) => Deck) => {
    setDecks(prev => prev.map(d => (d.id === deckId ? updater(d) : d)));
  };

  const deckId = route.name === 'decks' ? undefined : route.deckId;
  const deck = deckId ? decks.find(d => d.id === deckId) : undefined;

  // Если колоды уже нет (например, удалили) — спокойно возвращаемся к списку
  useEffect(() => {
    if (loaded && route.name !== 'decks' && !deck) {
      setRoute({ name: 'decks' });
    }
  }, [loaded, route, deck]);

  // Кнопка «Назад» на Android
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.name === 'decks') return false; // выходим из приложения
      if (route.name === 'cardEdit') return false; // экран карточки сам спросит про сохранение
      if (route.name === 'deck') setRoute({ name: 'decks' });
      else setRoute({ name: 'deck', deckId: route.deckId });
      return true;
    });
    return () => sub.remove();
  }, [route]);

  const goDecks = () => setRoute({ name: 'decks' });

  return (
    <SafeAreaProvider>
      <ThemeProvider mode={mode} setMode={setMode} theme={theme}>
        <View style={[styles.root, { backgroundColor: theme.bg }]}>
          <StatusBar style={theme.isDark ? 'light' : 'dark'} />

          {!loaded && (
            <View style={styles.center}>
              <ActivityIndicator color={theme.link} />
            </View>
          )}

          {loaded && route.name === 'decks' && (
            <DeckListScreen
              decks={decks}
              setDecks={setDecks}
              onOpenDeck={id => setRoute({ name: 'deck', deckId: id })}
            />
          )}

          {loaded && deck && route.name === 'deck' && (
            <DeckDetailScreen
              deck={deck}
              onBack={goDecks}
              onStudy={() => setRoute({ name: 'study', deckId: deck.id })}
              onAddCard={() => setRoute({ name: 'cardEdit', deckId: deck.id })}
              onEditCard={cardId => setRoute({ name: 'cardEdit', deckId: deck.id, cardId })}
              updateDeck={updater => updateDeck(deck.id, updater)}
              onDeleteDeck={() => {
                setDecks(prev => prev.filter(d => d.id !== deck.id));
                goDecks();
              }}
            />
          )}

          {loaded && deck && route.name === 'cardEdit' && (() => {
            const card = route.cardId ? deck.cards.find(c => c.id === route.cardId) : undefined;
            return (
              <CardEditScreen
                card={card}
                onCancel={() => setRoute({ name: 'deck', deckId: deck.id })}
                onSave={c => {
                  updateDeck(deck.id, d => ({
                    ...d,
                    cards: card
                      ? d.cards.map(x => (x.id === c.id ? c : x))
                      : [...d.cards, c],
                  }));
                  setRoute({ name: 'deck', deckId: deck.id });
                }}
              />
            );
          })()}

          {loaded && deck && route.name === 'study' && (
            <StudyScreen
              deck={deck}
              onExit={() => setRoute({ name: 'deck', deckId: deck.id })}
              onToggleReverse={() =>
                updateDeck(deck.id, d => ({ ...d, reverse: !d.reverse }))
              }
              onReviewed={(cardId, remembered, side) => {
                updateDeck(deck.id, d => ({
                  ...d,
                  cards: d.cards.map(c =>
                    c.id === cardId ? applyReview(c, remembered, side) : c
                  ),
                }));
              }}
            />
          )}
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
