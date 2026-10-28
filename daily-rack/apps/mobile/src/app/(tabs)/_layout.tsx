import { useCallback, useState } from 'react';
import { Platform, type ColorValue } from 'react-native';
import { Tabs, useFocusEffect } from 'expo-router';
import { api } from '../../lib/api.ts';
import { useRealtimeMessages } from '../../lib/realtime.tsx';
import { Icon, type IconName } from '../../components/ui.tsx';
import { SIDEBAR_WIDTH, useLayout } from '../../lib/layout.ts';
import { colors } from '../../theme.ts';

const icon = (name: IconName) => ({ color }: { color: ColorValue }) => <Icon name={name} color={String(color)} size={24} />;

export default function TabLayout() {
  const [yourMoves, setYourMoves] = useState(0);
  const [friendAlerts, setFriendAlerts] = useState(0);
  const { sidebar } = useLayout();

  const refresh = useCallback(() => {
    api.tables().then((r) => setYourMoves(r.tables.filter((t) => t.yourMove || t.invited).length)).catch(() => undefined);
    Promise.all([api.friends(), api.inbox()])
      .then(([f, i]) => setFriendAlerts(f.incoming.length + i.conversations.reduce((n, c) => n + c.unread, 0)))
      .catch(() => undefined);
  }, []);
  useFocusEffect(refresh);
  useRealtimeMessages((m) => {
    if (m.type === 'table' || m.type === 'friends' || m.type === 'message') refresh();
  });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        // Big screens (iPad, desktop) get a sidebar with the labels beside the icons.
        ...(sidebar
          ? {
              tabBarPosition: 'left' as const,
              tabBarLabelPosition: 'beside-icon' as const,
              tabBarActiveBackgroundColor: colors.pink,
              tabBarStyle: { width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH, backgroundColor: '#FFFFFF', borderRightColor: colors.border, paddingTop: 24, paddingHorizontal: 10 },
              tabBarItemStyle: { borderRadius: 14, maxHeight: 56, marginVertical: 2, justifyContent: 'flex-start', paddingHorizontal: 12 },
              tabBarLabelStyle: { fontSize: 16, fontWeight: '600' as const, marginLeft: 12 },
            }
          : {
              // The web build has no safe-area inset to grow into, so give the labels room.
              tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: colors.border, ...(Platform.OS === 'web' ? { height: 60, paddingBottom: 6 } : null) },
              tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
            }),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn', tabBarIcon: icon('bulb') }} />
      <Tabs.Screen name="play" options={{ title: 'Play', tabBarIcon: icon('play'), tabBarBadge: yourMoves || undefined }} />
      <Tabs.Screen name="friends" options={{ title: 'Friends', tabBarIcon: icon('users'), tabBarBadge: friendAlerts || undefined }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
