import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, Alert, TextInput, Modal,
  KeyboardAvoidingView, Platform, Animated, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Card, Deck } from '../types';
import { Theme, useTheme } from '../theme';
import { makeCard, countDue, resetCardProgress, plural } from '../storage';

type Props = {
  deck: Deck;
  onBack: () => void;
  onStudy: () => void;
  onAddCard: () => void;
  onEditCard: (id: string) => void;
  updateDeck: (updater: (d: Deck) => Deck) => void;
  onDeleteDeck: () => void;
};

function SwipeableCardRow({
  card, onEdit, onDelete, t,
}: {
  card: Card;
  onEdit: () => void;
  onDelete: () => void;
  t: Theme;
}) {
  const pan = useRef(new Animated.Value(0)).current;

  // PanResponder создаётся один раз, поэтому свежие данные берём через ref
  const latest = useRef({ card, onDelete });
  latest.current = { card, onDelete };

  const springBack = () =>
    Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        pan.setValue(Math.min(0, g.dx)); // тянуть можно только влево
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -100) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          const c = latest.current.card;
          Alert.alert('Удалить карточку?', c.front || c.back || '(пустая)', [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Удалить', style: 'destructive', onPress: () => latest.current.onDelete() },
          ]);
        }
        springBack();
      },
      onPanResponderTerminate: springBack,
    })
  ).current;

  return (
    <View style={styles.swipeWrap}>
      <View style={[styles.deleteHint, { backgroundColor: t.danger + '22', borderColor: t.danger }]}>
        <Text style={{ color: t.danger, fontWeight: '800', fontSize: 13 }}>Удалить</Text>
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={{ transform: [{ translateX: pan }] }}
      >
        <Pressable
          onPress={onEdit}
          style={({ pressed }) => [
            styles.cardRow,
            {
              backgroundColor: t.card,
              borderColor: t.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: '600' }} numberOfLines={1}>
              {card.front || '—'}
            </Text>
            <Text style={{ color: t.muted, marginTop: 2 }} numberOfLines={1}>
              {card.back || '—'}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ---------- разбор файла для импорта ----------

function splitLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"' && cur === '') {
      inQuotes = true;
    } else if (ch === d) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseContent(rawContent: string, fileName: string): Card[] {
  const content = rawContent.replace(/^\uFEFF/, ''); // убираем невидимый знак в начале файла
  const name = fileName.toLowerCase();

  if (name.endsWith('.json')) {
    const parsed = JSON.parse(content);
    const arr = Array.isArray(parsed) ? parsed : parsed.cards ?? [];
    return arr
      .map((x: any) =>
        makeCard(
          String(x.front ?? x.question ?? x.q ?? '').trim(),
          String(x.back ?? x.answer ?? x.a ?? '').trim()
        )
      )
      .filter((c: Card) => c.front && c.back);
  }

  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  // разделитель определяем один раз по первой строке
  const first = lines[0];
  const d = first.includes('\t') ? '\t' : first.includes(';') ? ';' : ',';

  const cards: Card[] = [];
  lines.forEach((line, i) => {
    const parts = splitLine(line, d);
    if (parts.length < 2) return;
    const f = parts[0];
    const b = parts.slice(1).join(d).trim();
    if (!f || !b) return;
    // пропускаем строку-заголовок вроде «front;back»
    if (i === 0) {
      const h = (f + '|' + b).toLowerCase();
      if (['front|back', 'question|answer', 'q|a', 'вопрос|ответ'].includes(h)) return;
    }
    cards.push(makeCard(f, b));
  });
  return cards;
}

export default function DeckDetailScreen({
  deck, onBack, onStudy, onAddCard, onEditCard, updateDeck, onDeleteDeck,
}: Props) {
  const t = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [query, setQuery] = useState('');

  const due = countDue(deck.cards, !!deck.reverse);

  const importFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (res.canceled) return;
      const file = res.assets[0];
      const content = await new File(file.uri).text();
      const parsed = parseContent(content, file.name ?? '');
      if (parsed.length === 0) {
        Alert.alert('Файл пуст или формат не распознан');
        return;
      }
      // не добавляем то, что уже есть в колоде
      const exists = new Set(deck.cards.map(c => c.front + '\u0000' + c.back));
      const newCards = parsed.filter(c => !exists.has(c.front + '\u0000' + c.back));
      const skipped = parsed.length - newCards.length;
      if (newCards.length > 0) {
        updateDeck(d => ({ ...d, cards: [...d.cards, ...newCards] }));
      }
      Alert.alert(
        `Импортировано: ${newCards.length}`,
        skipped > 0 ? `Пропущено повторов: ${skipped}` : undefined
      );
    } catch (e) {
      Alert.alert('Ошибка импорта', String(e));
    }
  };

  const confirmDeleteDeck = () => {
    setMenuOpen(false);
    Alert.alert('Удалить колоду?', deck.name, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: onDeleteDeck },
    ]);
  };

  const confirmReset = () => {
    setMenuOpen(false);
    Alert.alert('Сбросить прогресс?', 'Все карточки начнут учиться с нуля. Тексты останутся.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Сбросить',
        style: 'destructive',
        onPress: () =>
          updateDeck(d => ({ ...d, cards: d.cards.map(resetCardProgress) })),
      },
    ]);
  };

  const openRename = () => {
    setMenuOpen(false);
    setNameDraft(deck.name);
    setRenameOpen(true);
  };

  const saveRename = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    updateDeck(d => ({ ...d, name: trimmed }));
    setRenameOpen(false);
  };

  const deleteCard = (cardId: string) => {
    updateDeck(d => ({ ...d, cards: d.cards.filter(c => c.id !== cardId) }));
  };

  const q = query.trim().toLowerCase();
  const shown = q
    ? deck.cards.filter(c => (c.front + ' ' + c.back).toLowerCase().includes(q))
    : deck.cards;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={{ color: t.link, fontSize: 16 }}>‹ Назад</Text>
        </Pressable>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={12}>
          <Text style={{ color: t.link, fontSize: 16 }}>Ещё ⋯</Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
          {deck.name}
        </Text>
        <Text style={{ color: t.muted, marginTop: 4 }}>
          {deck.cards.length} {plural(deck.cards.length, 'карточка', 'карточки', 'карточек')}
        </Text>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={onStudy}
          disabled={deck.cards.length === 0}
          style={({ pressed }) => [
            styles.bigBtn,
            {
              backgroundColor: t.primary,
              opacity: deck.cards.length === 0 ? 0.4 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
            {due > 0 ? `▶ Учить · ${due}` : '▶ Учить'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onAddCard}
          style={({ pressed }) => [
            styles.smallBtn,
            { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={{ color: t.text, fontWeight: '600' }}>+ Карточка</Text>
        </Pressable>
        <Pressable
          onPress={importFile}
          style={({ pressed }) => [
            styles.smallBtn,
            { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={{ color: t.text, fontWeight: '600' }}>⇪ Импорт</Text>
        </Pressable>
      </View>

      {deck.cards.length > 6 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск по карточкам"
            placeholderTextColor={t.muted}
            style={[
              styles.search,
              { color: t.text, borderColor: t.border, backgroundColor: t.card },
            ]}
          />
        </View>
      )}

      <FlatList
        data={shown}
        keyExtractor={c => c.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <SwipeableCardRow
            card={item}
            t={t}
            onEdit={() => onEditCard(item.id)}
            onDelete={() => deleteCard(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
            <Text style={{ color: t.muted, textAlign: 'center' }}>
              {q
                ? 'Ничего не найдено'
                : 'Карточек нет. Добавь вручную или импортируй файл\n(CSV: front;back или JSON).'}
            </Text>
          </View>
        }
      />

      {/* Меню «Ещё» */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.modalBg} onPress={() => setMenuOpen(false)}>
          <View
            onStartShouldSetResponder={() => true}
            style={[styles.sheet, { backgroundColor: t.card }]}
          >
            <Pressable onPress={openRename} style={[styles.sheetItem, { borderColor: t.border }]}>
              <Text style={{ color: t.text, fontSize: 16 }}>✏️  Переименовать</Text>
            </Pressable>
            <Pressable onPress={confirmReset} style={[styles.sheetItem, { borderColor: t.border }]}>
              <Text style={{ color: t.text, fontSize: 16 }}>↺  Сбросить прогресс</Text>
            </Pressable>
            <Pressable onPress={confirmDeleteDeck} style={[styles.sheetItem, { borderColor: t.border }]}>
              <Text style={{ color: t.danger, fontSize: 16 }}>🗑  Удалить колоду</Text>
            </Pressable>
            <Pressable onPress={() => setMenuOpen(false)} style={[styles.sheetItem, { borderBottomWidth: 0 }]}>
              <Text style={{ color: t.muted, fontSize: 16 }}>Закрыть</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Переименование */}
      <Modal
        visible={renameOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalBg, { alignItems: 'center', justifyContent: 'center' }]}
        >
          <View style={[styles.modal, { backgroundColor: t.card }]}>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Название колоды</Text>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              autoFocus
              placeholder="Название"
              placeholderTextColor={t.muted}
              onSubmitEditing={saveRename}
              returnKeyType="done"
              style={[
                styles.modalInput,
                { color: t.text, borderColor: t.border, backgroundColor: t.bg },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => setRenameOpen(false)}
                style={[styles.modalBtn, { borderColor: t.border, borderWidth: 1 }]}
              >
                <Text style={{ color: t.text }}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={saveRename}
                style={[styles.modalBtn, { backgroundColor: t.primary }]}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Сохранить</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title: { fontSize: 26, fontWeight: '800' },
  actionsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  bigBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  smallBtn: { paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  search: {
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
  },
  swipeWrap: {
    position: 'relative',
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  deleteHint: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  cardRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { margin: 12, borderRadius: 20, overflow: 'hidden' },
  sheetItem: {
    paddingVertical: 18, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modal: { width: '85%', borderRadius: 20, padding: 20, gap: 16 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
});
