import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Heading, LinkButton, usePalette } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/lib/session';

// Saved login, but the server couldn't be reached to check it. Keeps the login so a weak signal doesn't log people out.
export default function Offline() {
  const { retry, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const c = usePalette();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={styles.inner}>
        <Card>
          <Heading title="Can't reach Thunder" intro="Check your Wi-Fi or cell signal, then try again." />
          <Button
            title="Try again"
            busy={busy}
            onPress={async () => {
              setBusy(true);
              await retry();
              setBusy(false);
            }}
          />
          <LinkButton title="Log out" onPress={signOut} />
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', padding: Spacing.three },
});
