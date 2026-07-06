import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AuthProvider } from '@/context/auth';
import { useAuth } from '@/context/auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: 'index',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootGate>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="sales" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
        </RootGate>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}

function RootGate({ children }: { children: React.ReactNode }) {
  const { clockChecking, clockValid, clockError } = useAuth();

  if (clockChecking) {
    return <FullScreenNotice title="Checking device time" message="Verifying your clock against the server..." />;
  }

  if (!clockValid) {
    return (
      <FullScreenNotice
        title="Device time is incorrect"
        message={clockError || 'Set date and time to automatic, then restart the app.'}
      />
    );
  }

  return <>{children}</>;
}

function FullScreenNotice({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.noticeWrap}>
      <View style={styles.noticeCard}>
        <View style={styles.noticeSpinner}>
          <ActivityIndicator size="large" color="#D95D39" />
        </View>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeMessage}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  noticeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9F8F6',
    padding: 24,
  },
  noticeCard: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    borderRadius: 28,
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E6E1',
    gap: 12,
  },
  noticeSpinner: {
    width: 68,
    height: 68,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9F1EE',
  },
  noticeTitle: {
    color: '#2C423F',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  noticeMessage: {
    color: '#5C5C59',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
