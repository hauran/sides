import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../lib/theme';

interface LogoProps {
  width?: number;
  color?: string;
  showText?: boolean;
}

export function Logo({ width = 80, color = colors.rose, showText = true }: LogoProps) {
  const s = width / 320;
  const h = 170 * s;
  const r = 16 * s;
  const fontSize = h * 1.2;

  return (
    <View style={styles.row}>
      {showText && (
        <Text style={[styles.text, { fontSize, color: colors.text }]}>sides</Text>
      )}
      <View style={{ width, height: h }}>
        <View style={{ width: 175 * s, height: 32 * s, borderRadius: r, backgroundColor: color, opacity: 0.3 }} />
        <View style={{ width: 320 * s, height: 32 * s, borderRadius: r, backgroundColor: color, opacity: 1.0, marginTop: 14 * s }} />
        <View style={{ width: 245 * s, height: 32 * s, borderRadius: r, backgroundColor: color, opacity: 0.3, marginTop: 14 * s }} />
        <View style={{ width: 130 * s, height: 32 * s, borderRadius: r, backgroundColor: color, opacity: 0.3, marginTop: 14 * s }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  text: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
