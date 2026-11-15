import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Deck } from '../types';
import { ThemeMode, useTheme, useThemeMode } from '../theme';
import { uid, countDue, plural } from '../storage';

type Props = {
  decks: Deck[];
  setDecks: React.Dispatch<React.SetStateAction<Deck[]>>;
  onOpenDeck: (id: string) => void;
};

const THEME_OPTIONS: { key: ThemeMode; label: string; icon: string }[] = [
  { key: 'system', label: 'Как в системе', icon: '📱' },
  { key: 'light', label: 'Светлая', icon: '☀️' },
  { key: 'dark', label: 'Тёмная', icon: '🌙' },
];

export default function DeckListScreen({ decks, setDecks, onOpenDeck }: Props) {
  const t = useTheme();
  const { mode, setMode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [name, setName] = useState('');

  const closeCreate = () => {
    setShowCreate(false);
    setName('');
  };

  const createDeck = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const deck: Deck = { id: uid(), name: trimmed, cards: [], createdAt: Date.now() };
    setDecks(prev => [deck, ...prev]);
    closeCreate();
    onOpenDeck(deck.id);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>MemoFlow</Text>
          <Text style={{ color: t.muted, marginTop: 4 }}>
            {decks.length} {plural(decks.length, 'колода', 'колоды', 'колод')}
          </Text>
        </View>
        <Pressable
          onPress={() => setShowSettings(true)}
          hitSlop={10}
          style={[styles.iconBtn, { backgroundColor: t.card, borderColor: t.border }]}
        >
          <Text style={{ fontSize: 18 }}>{t.isDark ? '🌙' : '☀️'}</Text>
        </Pressable>
      </View>

      {decks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 56 }}>📚</Text>
          <Text style={[styles.emptyTitle, { color: t.text }]}>Пока нет колод</Text>
          <Text style={{ color: t.muted, textAlign: 'center' }}>
            Нажми «+» внизу, чтобы создать первую колоду
          </Text>
        </View>
      ) : (
        <FlatList
          data={decks}
          keyExtractor={d => d.id}
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 120, gap: 12 }}
          renderItem={({ item }) => {
            const total = item.cards.length;
            const learned = item.cards.filter(c => c.level >= 4).length;
            const due = countDue(item.cards, !!item.reverse);
            const pct = total ? Math.round((learned / total) * 100) : 0;
            return (
              <Pressable
                onPress={() => onOpenDeck(item.id)}
                style={({ pressed }) => [
                  styles.deckCard,
                  {
                    backgroundColor: t.card,
                    borderColor: t.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.deckName, { color: t.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ color: t.muted, marginTop: 2 }}>
                    {total} {plural(total, 'карточка', 'карточки', 'карточек')} · {learned} выучено
                  </Text>
                  {due > 0 && (
                    <Text style={{ color: t.link, marginTop: 2, fontWeight: '600', fontSize: 13 }}>
                      Пора повторить: {due}
                    </Text>
                  )}
                  <View style={[styles.progressBg, { backgroundColor: t.border }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${pct}%`, backgroundColor: t.primary },
                      ]}
                    />
                  </View>
                </View>
                <Text style={{ color: t.muted, fontSize: 24, marginLeft: 8 }}>›</Text>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        onPress={() => setShowCreate(true)}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: t.primary, bottom: 24 + insets.bottom, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {/* Создание колоды */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={closeCreate}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBg}
        >
          <View style={[styles.modal, { backgroundColor: t.card }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>Новая колода</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Название"
              placeholderTextColor={t.muted}
              autoFocus
              style={[
                styles.input,
                { color: t.text, borderColor: t.border, backgroundColor: t.bg },
              ]}
              onSubmitEditing={createDeck}
              returnKeyType="done"
            />
            <View style={styles.modalRow}>
              <Pressable
                onPress={closeCreate}
                style={[styles.btn, { borderColor: t.border, borderWidth: 1 }]}
              >
                <Text style={{ color: t.text }}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={createDeck}
                style={[styles.btn, { backgroundColor: t.primary, opacity: name.trim() ? 1 : 0.5 }]}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Создать</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Настройки темы */}
      <Modal
        visible={showSettings}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettings(false)}
      >
        <Pressable style={styles.modalBg} onPress={() => setShowSettings(false)}>
          <View
            onStartShouldSetResponder={() => true}
            style={[styles.modal, { backgroundColor: t.card }]}
          >
            <Text style={[styles.modalTitle, { color: t.text }]}>Тема оформления</Text>
            {THEME_OPTIONS.map(o => {
              const active = mode === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => {
                    setMode(o.key);
                    setShowSettings(false);
                  }}
                  style={[
                    styles.themeRow,
                    {
                      borderColor: active ? t.primary : t.border,
                      backgroundColor: active ? t.primary + '22' : 'transparent',
                    },
                  ]}
                >
                  <Text style={{ fontSize: 20 }}>{o.icon}</Text>
                  <Text style={{ color: t.text, fontSize: 16, flex: 1, marginLeft: 12 }}>
                    {o.label}
                  </Text>
                  {active && <Text style={{ color: t.link, fontWeight: '800' }}>✓</Text>}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  deckCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 16, borderWidth: 1,
  },
  deckName: { fontSize: 17, fontWeight: '700' },
  progressBg: { height: 4, borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 32, fontWeight: '500', lineHeight: 34 },
  modalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modal: { width: '100%', borderRadius: 20, padding: 20, gap: 14 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 },
  modalRow: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  themeRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
});
