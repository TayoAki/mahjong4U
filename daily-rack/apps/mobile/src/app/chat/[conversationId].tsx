import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChatPanel } from '../../components/ChatPanel.tsx';
import { useSafety } from '../../lib/safety.tsx';
import { IconButton, Screen, TopBar } from '../../components/ui.tsx';

export default function ChatScreen() {
  const { conversationId = '', name, friendId } = useLocalSearchParams<{ conversationId: string; name?: string; friendId?: string }>();
  const router = useRouter();
  const { openPlayer, lastBlocked } = useSafety();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/friends'));

  // Blocking this friend ends the chat, so leave it.
  useEffect(() => {
    if (friendId && lastBlocked?.id === friendId) back();
  }, [lastBlocked]);

  return (
    <Screen scroll={false}>
      <TopBar
        title={name ?? 'Chat'}
        onBack={back}
        right={friendId ? <IconButton icon="more" label={`Report or block ${name ?? 'this player'}`} onPress={() => openPlayer({ id: friendId, name: name ?? 'this player' })} /> : undefined}
      />
      <View style={{ flex: 1, paddingBottom: 12 }}>
        <ChatPanel conversationId={conversationId} />
      </View>
    </Screen>
  );
}
