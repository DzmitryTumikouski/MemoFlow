import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';

type Props = {
  uri: string;
  color: string;
};

export default function AudioPlayer({ uri, color }: Props) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  const duration = status.duration ?? 0;
  const current = status.currentTime ?? 0;
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;
  const isPlaying = status.playing;

  const fmt = (s: number) => {
    if (!s || s < 0 || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const toggle = async () => {
    if (isPlaying) {
      player.pause();
      return;
    }
    try {
      // после записи звук на iPhone может «тихнуть» — возвращаем режим воспроизведения
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    } catch {}
    // если доиграло до конца — начинаем заново
    if (duration > 0 && current >= duration - 0.1) {
      await player.seekTo(0);
    }
    player.play();
  };

  return (
    <Pressable
      onPress={toggle}
      style={({ pressed }) => [
        styles.btn,
        {
          borderColor: isPlaying ? color : color + '88',
          backgroundColor: color + (isPlaying ? '28' : '12'),
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        <Text style={[styles.icon, { color }]}>{isPlaying ? '❚❚' : '▶'}</Text>
        <View style={[styles.track, { backgroundColor: color + '33' }]}>
          <View
            style={[
              styles.fill,
              { width: `${Math.max(2, progress * 100)}%`, backgroundColor: color },
            ]}
          />
        </View>
        <Text style={[styles.time, { color }]}>
          {fmt(current)}/{fmt(duration)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 13, fontWeight: '700', width: 18, textAlign: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', flex: 1, minWidth: 70 },
  fill: { height: 4, borderRadius: 2 },
  time: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    minWidth: 62,
    textAlign: 'right',
  },
});
