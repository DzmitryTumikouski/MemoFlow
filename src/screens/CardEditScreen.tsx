import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable, ScrollView, Image, Alert,
  KeyboardAvoidingView, Platform, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio';
import AudioPlayer from '../components/AudioPlayer';
import { Card } from '../types';
import { useTheme } from '../theme';
import { makeCard } from '../storage';
import { persistMedia, extOf } from '../media';

type Props = {
  card?: Card;
  onSave: (card: Card) => void;
  onCancel: () => void;
};

type Side = 'front' | 'back';

export default function CardEditScreen({ card, onSave, onCancel }: Props) {
  const t = useTheme();
  const [text, setText] = useState({
    front: card?.front ?? '',
    back: card?.back ?? '',
  });
  const [images, setImages] = useState<{ front?: string; back?: string }>({
    front: card?.frontImage,
    back: card?.backImage,
  });
  const [audios, setAudios] = useState<{ front?: string; back?: string }>({
    front: card?.frontAudio,
    back: card?.backAudio,
  });

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recordingSide, setRecordingSide] = useState<Side | null>(null);

  // Есть ли несохранённые изменения
  const dirty =
    text.front !== (card?.front ?? '') ||
    text.back !== (card?.back ?? '') ||
    images.front !== card?.frontImage ||
    images.back !== card?.backImage ||
    audios.front !== card?.frontAudio ||
    audios.back !== card?.backAudio;

  const pickImage = async (side: Side) => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (!res.canceled) {
        const uri = res.assets[0].uri;
        setImages(prev => ({ ...prev, [side]: persistMedia(uri, extOf(uri, 'jpg')) }));
      }
    } catch (e) {
      Alert.alert('Не получилось выбрать фото', String(e));
    }
  };

  const startRecording = async (side: Side) => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Нет доступа к микрофону', 'Разреши доступ в настройках телефона.');
        return;
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingSide(side);
    } catch (e) {
      Alert.alert('Ошибка записи', String(e));
    }
  };

  const stopRecording = async () => {
    if (!recordingSide) return;
    const side = recordingSide;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        setAudios(prev => ({ ...prev, [side]: persistMedia(uri, extOf(uri, 'm4a')) }));
      }
    } catch (e) {
      Alert.alert('Ошибка остановки записи', String(e));
    } finally {
      setRecordingSide(null);
      // возвращаем обычный режим, чтобы звук не тихнул при воспроизведении
      try {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      } catch {}
    }
  };

  const handleCancel = () => {
    if (recordingSide) {
      Alert.alert('Идёт запись', 'Сначала нажми «Стоп».');
      return;
    }
    if (!dirty) {
      onCancel();
      return;
    }
    Alert.alert('Выйти без сохранения?', 'Изменения пропадут.', [
      { text: 'Остаться', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: onCancel },
    ]);
  };

  // Кнопка «Назад» на Android работает так же, как «Отмена»
  const cancelRef = useRef(handleCancel);
  cancelRef.current = handleCancel;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cancelRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  const save = () => {
    if (recordingSide) {
      Alert.alert('Идёт запись', 'Сначала нажми «Стоп».');
      return;
    }
    if (!text.front.trim() && !text.back.trim()) {
      return Alert.alert('Заполни хотя бы одну сторону');
    }
    const base = card ?? makeCard('', '');
    onSave({
      ...base,
      front: text.front.trim(),
      back: text.back.trim(),
      frontImage: images.front,
      backImage: images.back,
      frontAudio: audios.front,
      backAudio: audios.back,
    });
  };

  const renderSide = (side: Side, label: string) => (
    <View style={[styles.block, { backgroundColor: t.card, borderColor: t.border }]}>
      <Text style={[styles.blockLabel, { color: t.muted }]}>{label}</Text>
      <TextInput
        value={text[side]}
        onChangeText={v => setText(prev => ({ ...prev, [side]: v }))}
        placeholder={side === 'front' ? 'Сторона 1' : 'Сторона 2'}
        placeholderTextColor={t.muted}
        multiline
        style={[
          styles.input,
          { color: t.text, borderColor: t.border, backgroundColor: t.bg },
        ]}
      />
      {images[side] && (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Image source={{ uri: images[side]! }} style={styles.image} resizeMode="contain" />
          <Pressable onPress={() => setImages(p => ({ ...p, [side]: undefined }))}>
            <Text style={{ color: t.danger, fontSize: 13 }}>Удалить фото</Text>
          </Pressable>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Pressable
          onPress={() => pickImage(side)}
          style={[styles.miniBtn, { borderColor: t.border }]}
        >
          <Text style={{ color: t.text, fontSize: 13 }}>📷 Фото</Text>
        </Pressable>

        {recordingSide === side ? (
          <Pressable
            onPress={stopRecording}
            style={[styles.miniBtn, { borderColor: t.danger, backgroundColor: t.danger + '22' }]}
          >
            <Text style={{ color: t.danger, fontSize: 13, fontWeight: '600' }}>■ Стоп</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => startRecording(side)}
            disabled={!!recordingSide}
            style={[styles.miniBtn, { borderColor: t.border, opacity: recordingSide ? 0.4 : 1 }]}
          >
            <Text style={{ color: t.text, fontSize: 13 }}>🎤 Запись</Text>
          </Pressable>
        )}

        {audios[side] && (
          <>
            {/* key пересоздаёт плеер при смене файла */}
            <AudioPlayer key={audios[side]} uri={audios[side]!} color={t.primary} />
            <Pressable
              onPress={() => setAudios(p => ({ ...p, [side]: undefined }))}
              style={[styles.miniBtn, { borderColor: t.border }]}
            >
              <Text style={{ color: t.danger, fontSize: 13 }}>✕</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={handleCancel} hitSlop={12}>
          <Text style={{ color: t.link, fontSize: 16 }}>Отмена</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.text }]}>{card ? 'Карточка' : 'Новая'}</Text>
        <Pressable onPress={save} hitSlop={12}>
          <Text style={{ color: t.link, fontSize: 16, fontWeight: '600' }}>Готово</Text>
        </Pressable>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {renderSide('front', 'СТОРОНА 1')}
          {renderSide('back', 'СТОРОНА 2')}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  title: { fontSize: 17, fontWeight: '700' },
  block: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  blockLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, minHeight: 60 },
  image: { width: '100%', height: 140, borderRadius: 10 },
  miniBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
});
