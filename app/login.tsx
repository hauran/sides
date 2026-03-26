import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore, useIsAuthenticated } from '../src/store/useAuthStore';
import { pickAvatarImage, uploadAvatarImage } from '../src/lib/avatar';
import { colors, spacing, radii, shadows, typography } from '../src/lib/theme';
import { getInitials } from '../src/lib/utils';

type Step = 'email' | 'code' | 'name';

export default function LoginScreen() {
  const router = useRouter();
  const sendCode = useAuthStore((s) => s.sendCode);
  const verifyCode = useAuthStore((s) => s.verifyCode);
  const isAuthenticated = useIsAuthenticated();
  const token = useAuthStore((s) => s.token);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const codeInputRef = useRef<TextInput>(null);
  const nameInputRef = useRef<TextInput>(null);

  // If already authenticated (e.g. restored session), go home
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated]);

  async function handleSendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await sendCode(trimmed);
      setStep('code');
      setTimeout(() => codeInputRef.current?.focus(), 100);
    } catch (err: any) {
      setError(err.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(providedName?: string) {
    const trimmedCode = code.trim();
    if (trimmedCode.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await verifyCode(email.trim().toLowerCase(), trimmedCode, providedName);
      if ('needsName' in result && result.needsName) {
        setStep('name');
        setTimeout(() => nameInputRef.current?.focus(), 100);
      }
      // If successful, useEffect above handles redirect
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function pickAvatar() {
    const uri = await pickAvatarImage();
    if (uri) setAvatarUri(uri);
  }

  async function handleSetName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter your name');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await verifyCode(email.trim().toLowerCase(), code.trim(), trimmed);
      if (avatarUri && 'token' in result) {
        uploadAvatarImage(avatarUri).catch((err) => console.error('Avatar upload error:', err));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          {/* Wordmark */}
          <Text style={styles.wordmark}>sides</Text>

          {step === 'email' && (
            <>
              <Text style={styles.heading}>Sign in or create account</Text>
              <Text style={styles.subtitle}>
                We'll send a verification code to your email
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={colors.textSecondary}
                value={email}
                onChangeText={(t) => { setEmail(t); setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={handleSendCode}
                editable={!loading}
              />

              {!!error && <Text style={styles.error}>{error}</Text>}

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSendCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.buttonText}>Send code</Text>
                )}
              </Pressable>
            </>
          )}

          {step === 'code' && (
            <>
              <Text style={styles.heading}>Check your email</Text>
              <Text style={styles.subtitle}>
                Enter the 6-digit code sent to{'\n'}
                <Text style={styles.emailHighlight}>{email.trim().toLowerCase()}</Text>
              </Text>

              <TextInput
                ref={codeInputRef}
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor={colors.textSecondary}
                value={code}
                onChangeText={(t) => {
                  const digits = t.replace(/\D/g, '').slice(0, 6);
                  setCode(digits);
                  setError('');
                }}
                keyboardType="number-pad"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={() => handleVerifyCode()}
                editable={!loading}
              />

              {!!error && <Text style={styles.error}>{error}</Text>}

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={() => handleVerifyCode()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.buttonText}>Verify</Text>
                )}
              </Pressable>

              <Pressable
                style={styles.linkButton}
                onPress={() => { setStep('email'); setCode(''); setError(''); }}
              >
                <Text style={styles.linkText}>Use a different email</Text>
              </Pressable>
            </>
          )}

          {step === 'name' && (
            <>
              <Text style={styles.heading}>Set up your profile</Text>
              <Text style={styles.subtitle}>
                This is how your castmates will see you
              </Text>

              {/* Avatar picker */}
              <Pressable style={styles.avatarPicker} onPress={pickAvatar}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    {name.trim() ? (
                      <Text style={styles.avatarInitials}>{getInitials(name.trim())}</Text>
                    ) : (
                      <Text style={styles.avatarPlus}>+</Text>
                    )}
                  </View>
                )}
                <Text style={styles.avatarLabel}>
                  {avatarUri ? 'Change photo' : 'Add a photo'}
                </Text>
              </Pressable>

              <TextInput
                ref={nameInputRef}
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor={colors.textSecondary}
                value={name}
                onChangeText={(t) => { setName(t); setError(''); }}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSetName}
                editable={!loading}
              />

              {!!error && <Text style={styles.error}>{error}</Text>}

              <Pressable
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSetName}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.buttonText}>Let's go</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const AVATAR_SIZE = 96;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  inner: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  wordmark: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
    marginBottom: spacing.xxxxl,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.xxl,
  },
  emailHighlight: {
    fontWeight: '600',
    color: colors.text,
  },
  input: {
    height: 52,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    fontSize: 17,
    letterSpacing: 0,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  codeInput: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
  },
  button: {
    height: 52,
    backgroundColor: colors.rose,
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  linkButton: {
    marginTop: spacing.lg,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  linkText: {
    fontSize: 14,
    color: colors.rose,
    fontWeight: '500',
  },
  error: {
    fontSize: 13,
    color: colors.coral,
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
  },
  avatarPicker: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.roseSoft,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.rose,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.rose,
  },
  avatarPlus: {
    fontSize: 32,
    fontWeight: '400',
    color: colors.rose,
  },
  avatarLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.rose,
    marginTop: spacing.sm,
  },
});
