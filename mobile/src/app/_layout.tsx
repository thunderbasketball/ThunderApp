import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { SessionProvider, useSession } from '@/lib/session';

// Keep the logo splash up until we know whether someone is logged in.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <RootStack />
      </SessionProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

// Which screens exist depends on the session: login only when logged out, the app only when logged in.
// This is just navigation; the server still checks the session and role on every request.
function RootStack() {
  const { state } = useSession();
  useEffect(() => {
    if (state.status !== 'loading') SplashScreen.hideAsync();
  }, [state.status]);
  if (state.status === 'loading') return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={state.status === 'in'} redirectTo={state.status === 'offline' ? '/offline' : '/login'}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={state.status === 'out'}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={state.status === 'offline'}>
        <Stack.Screen name="offline" />
      </Stack.Protected>
    </Stack>
  );
}
