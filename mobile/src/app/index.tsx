import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Heading, LinkButton, usePalette } from '@/components/ui';
import { Spacing, Thunder } from '@/constants/theme';
import { useSession } from '@/lib/session';

// Home after login. For now it shows who is logged in; Teams, Events, Practice and Chat come next.
export default function Home() {
  const { state, signOut } = useSession();
  const c = usePalette();
  if (state.status !== 'in') return null;
  const u = state.user;
  const roles = [u.isDirector && 'Director', u.isCoach && 'Coach'].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.inner}>
        <View style={styles.brand}>
          <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
          <View>
            <Text style={[styles.brandTop, { color: c.text }]}>Thunder</Text>
            <Text style={styles.brandBottom}>Basketball</Text>
          </View>
        </View>
        <Card>
          <Heading
            title={`Hi, ${u.firstName}`}
            intro={
              u.requestPending
                ? 'Your request is still pending. The Director will review it.'
                : roles || 'You are logged in.'
            }
          />
          <LinkButton title="Log out" onPress={signOut} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: Spacing.three, gap: Spacing.four },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  logo: { width: 40, height: 40 },
  brandTop: { fontSize: 17, fontWeight: '600' },
  brandBottom: { fontSize: 13, fontWeight: '500', color: Thunder.orange },
});
