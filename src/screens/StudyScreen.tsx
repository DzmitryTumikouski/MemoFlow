import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, PanResponder, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Card, Deck } from '../types';
import { useTheme } from '../theme';
import { buildStudyQueue, plural } from '../storage';
import AudioPlayer from '../components/AudioPlayer';

type Props = {
  deck: Deck;
  onExit: () => void;
  onToggleReverse: () => void;
  onReviewed: (cardId: string, remembered: boolean, side: 'front' | 'back') => void;
};

export default function StudyScreen({ deck, onExit, onToggleReverse, onReviewed }: Props) {
  const t = useTheme();
  const reverse = !!deck.reverse;

  // queue — очередь сессии. Первые baseLen карточек — основные,
  // всё, что дальше, — «повторы» забытых карточек (они не меняют прогресс).
  const [queue, setQueue] = useState<Card[]>(() => buildStudyQueue(deck.cards, reverse, false));
  const [baseLen, setBaseLen] = useState(queue.length);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [rememberedCount, setRememberedCount] = useState(0);
  const pan = useRef(new Animated.ValueXY()).current;
  const busy = useRef(false); // защита от двойных нажатий во время анимации

  const current = queue[index];
  const isRetry = index >= baseLen;

  // showFront = true, когда показываем лицевую сторону.
  // В обратном режиме начальное состояние (flipped=false) показывает back.
  const showFront = reverse === flipped;

  const startSession = (q: Card[]) => {
    setQueue(q);
    setBaseLen(q.length);
    setIndex(0);
    setRememberedCount(0);
    setFlipped(false);
  };

  const rotate = pan.x.interpolate({
    inputRange: [-300, 0, 300],
    outputRange: ['-12deg', '0deg', '12deg'],
  });

  const cardBg = pan.x.interpolate({
    inputRange: [-200, -30, 0, 30, 200],
    outputRange: [
      'rgba(239,68,68,0.25)',
      'rgba(239,68,68,0.08)',
      t.card,
      'rgba(16,185,129,0.08)',
      'rgba(16,185,129,0.25)',
    ],
    extrapolate: 'clamp',
  });

  const leftHintOpacity = pan.x.interpolate({
    inputRange: [-150, -40, 0],
    outputRange: [1, 0.15, 0],
    extrapolate: 'clamp',
  });
  const rightHintOpacity = pan.x.interpolate({
    inputRange: [0, 40, 150],
    outputRange: [0, 0.15, 1],
    extrapolate: 'clamp',
  });

  const next = (remembered: boolean) => {
    Haptics.impactAsync(
      remembered ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
    );
    if (current && !isRetry) {
      // оцениваем ту сторону, которая в текущем режиме была «вопросом»
      onReviewed(current.id, remembered, reverse ? 'back' : 'front');
      if (remembered) {
        setRememberedCount(c => c + 1);
      } else {
        // забытую карточку покажем ещё раз в конце этой же сессии
        setQueue(q => [...q, current]);
      }
    }
    pan.setValue({ x: 0, y: 0 });
    setFlipped(false);
    setIndex(i => i + 1);
    busy.current = false;
  };

  // PanResponder создаётся один раз, поэтому он должен вызывать СВЕЖИЕ версии функций.
  const nextRef = useRef(next);
  nextRef.current = next;

  const fly = (dir: 1 | -1) => {
    if (busy.current) return;
    busy.current = true;
    Animated.timing(pan, {
      toValue: { x: dir * 500, y: 0 },
      duration: 200,
      useNativeDriver: false,
    }).start(() => nextRef.current(dir === 1));
  };
  const flyRef = useRef(fly);
  flyRef.current = fly;

  // Переключение направления: вся колода сразу переворачивается —
  // собираем новую очередь для другого направления и начинаем с первой карточки.
  const toggleReverse = () => {
    if (busy.current) return;
    Haptics.selectionAsync();
    pan.setValue({ x: 0, y: 0 });
    startSession(buildStudyQueue(deck.cards, !reverse, false));
    onToggleReverse();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > 120) {
          flyRef.current(1);
        } else if (g.dx < -120) {
          flyRef.current(-1);
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    })
  ).current;

  const renderTopBar = (showCounter: boolean) => (
    <View style={styles.topBar}>
      <View style={styles.topSide}>
        <Pressable onPress={onExit} hitSlop={12} style={{ paddingVertical: 8 }}>
          <Text style={{ color: t.link, fontSize: 16, fontWeight: '600' }}>✕ Выход</Text>
        </Pressable>
      </View>
      {showCounter ? (
        <View style={[styles.counterPill, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: 14 }}>
            {index + 1} / {queue.length}
          </Text>
        </View>
      ) : (
        <View />
      )}
      <View style={[styles.topSide, { alignItems: 'flex-end' }]}>
        <Pressable
          onPress={toggleReverse}
          hitSlop={12}
          style={({ pressed }) => [
            styles.reverseBtn,
            {
              backgroundColor: reverse ? t.primary + '22' : 'transparent',
              borderColor: reverse ? t.primary : t.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={{
              color: reverse ? t.link : t.muted,
              fontWeight: '800',
              fontSize: 14,
            }}
          >
            ⇄ {reverse ? '2→1' : '1→2'}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  // ---------- нет карточек ----------
  if (queue.length === 0) {
    const hasCards = deck.cards.length > 0;
    const canRepeatAll = buildStudyQueue(deck.cards, reverse, true, 1).length > 0;
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]} edges={['top', 'bottom']}>
        {renderTopBar(false)}
        <View style={styles.center}>
          <Text style={{ fontSize: 64 }}>{canRepeatAll ? '✅' : '🗂'}</Text>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 12 }}>
            {canRepeatAll
              ? 'На сейчас всё повторено'
              : hasCards
              ? 'В этом режиме нечего учить'
              : 'Нет карточек для изучения'}
          </Text>
          {canRepeatAll && (
            <Text style={{ color: t.muted, marginTop: 8, textAlign: 'center' }}>
              Приходи позже — карточки вернутся, когда придёт время.
            </Text>
          )}
          {!canRepeatAll && hasCards && (
            <Text style={{ color: t.muted, marginTop: 8, textAlign: 'center' }}>
              У карточек не заполнена сторона, с которой начинается этот режим.
            </Text>
          )}
          {canRepeatAll && (
            <Pressable
              onPress={() => startSession(buildStudyQueue(deck.cards, reverse, true))}
              style={[
                styles.btn,
                { borderColor: t.border, borderWidth: 1, marginTop: 24, paddingHorizontal: 32 },
              ]}
            >
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>
                Повторить всё равно
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={onExit}
            style={[styles.btn, { backgroundColor: t.primary, marginTop: 12, paddingHorizontal: 32 }]}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Назад</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ---------- сессия закончилась ----------
  if (index >= queue.length) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]} edges={['top', 'bottom']}>
        {renderTopBar(false)}
        <View style={styles.center}>
          <Text style={{ fontSize: 72 }}>🎉</Text>
          <Text style={{ color: t.text, fontSize: 24, fontWeight: '800', marginTop: 16 }}>
            Сессия завершена!
          </Text>
          <Text style={{ color: t.muted, marginTop: 8, textAlign: 'center' }}>
            Пройдено: {baseLen} {plural(baseLen, 'карточка', 'карточки', 'карточек')}
          </Text>
          <Text style={{ color: t.success, marginTop: 4, fontWeight: '700' }}>
            Помню с первого раза: {rememberedCount} из {baseLen}
          </Text>
          <Pressable
            onPress={onExit}
            style={[styles.btn, { backgroundColor: t.primary, marginTop: 24, paddingHorizontal: 40 }]}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Готово</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const shownText = showFront ? current.front : current.back;
  const shownImage = showFront ? current.frontImage : current.backImage;
  const shownAudio = showFront ? current.frontAudio : current.backAudio;
  const progressPct = (index / queue.length) * 100;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]} edges={['top', 'bottom']}>
      {renderTopBar(true)}

      <View style={[styles.progressTrack, { backgroundColor: t.border }]}>
        <View
          style={[styles.progressBar, { width: `${progressPct}%`, backgroundColor: t.primary }]}
        />
      </View>

      <View style={styles.cardArea}>
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: t.border,
              transform: [{ translateX: pan.x }, { rotate }],
            },
          ]}
        >
          <Pressable
            style={styles.cardInner}
            onPress={() => {
              Haptics.selectionAsync();
              setFlipped(f => !f);
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.hintBadge, styles.hintLeft,
                { opacity: leftHintOpacity, borderColor: t.danger, backgroundColor: t.danger + '22' },
              ]}
            >
              <Text style={{ color: t.danger, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 }}>
                НЕ ПОМНЮ
              </Text>
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.hintBadge, styles.hintRight,
                { opacity: rightHintOpacity, borderColor: t.success, backgroundColor: t.success + '22' },
              ]}
            >
              <Text style={{ color: t.success, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 }}>
                ПОМНЮ
              </Text>
            </Animated.View>

            <Text style={[styles.sideLabel, { color: t.muted }]} pointerEvents="none">
              {showFront ? 'СТОРОНА 1' : 'СТОРОНА 2'}
              {isRetry ? ' · ПОВТОР' : ''}
            </Text>

            <View style={styles.contentArea}>
              <Text
                style={[styles.cardText, { color: t.text }]}
                numberOfLines={8}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {shownText}
              </Text>
              {shownImage && (
                <View style={[styles.imageWrap, { backgroundColor: t.bg + '80' }]}>
                  <Image
                    source={{ uri: shownImage }}
                    style={styles.cardImage}
                    resizeMode="contain"
                  />
                </View>
              )}
            </View>

            <View style={styles.cardFooter}>
              {shownAudio ? (
                <AudioPlayer key={shownAudio} uri={shownAudio} color={t.primary} />
              ) : (
                <View />
              )}
              <Text style={{ color: t.muted, fontSize: 12 }}>
                нажми, чтобы перевернуть
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => flyRef.current(-1)}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: t.danger + (pressed ? '33' : '18'),
              borderColor: t.danger,
            },
          ]}
        >
          <Text style={{ color: t.danger, fontSize: 16, fontWeight: '700' }}>← Не помню</Text>
        </Pressable>
        <Pressable
          onPress={() => flyRef.current(1)}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: t.success + (pressed ? '33' : '18'),
              borderColor: t.success,
            },
          ]}
        >
          <Text style={{ color: t.success, fontSize: 16, fontWeight: '700' }}>Помню →</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 10,
  },
  topSide: { width: 96 },
  counterPill: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  reverseBtn: {
    paddingHorizontal: 12, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  progressTrack: {
    height: 3, marginHorizontal: 20, marginBottom: 8,
    borderRadius: 2, overflow: 'hidden',
  },
  progressBar: { height: 3, borderRadius: 2 },
  cardArea: { flex: 1, paddingHorizontal: 20, paddingVertical: 8 },
  card: {
    flex: 1,
    borderRadius: 26,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
    overflow: 'hidden',
  },
  cardInner: { flex: 1, padding: 24 },
  sideLabel: {
    position: 'absolute',
    top: 22,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  contentArea: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
  },
  cardText: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 34,
  },
  imageWrap: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 100,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 12,
  },
  hintBadge: {
    position: 'absolute',
    top: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 2,
    zIndex: 10,
  },
  hintLeft: { left: 20, transform: [{ rotate: '-8deg' }] },
  hintRight: { right: 20, transform: [{ rotate: '8deg' }] },
  actions: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8,
  },
  actionBtn: {
    flex: 1, paddingVertical: 18,
    borderRadius: 16, borderWidth: 1.5,
    alignItems: 'center',
  },
  btn: { padding: 16, borderRadius: 14, alignItems: 'center' },
});
