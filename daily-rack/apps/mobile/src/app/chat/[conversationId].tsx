import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChatPanel } from '../../components/ChatPanel.tsx';
import { Screen, TopBar } from '../../components/ui.tsx';

export default function ChatScreen() {
  const { conversationId = '', name } = useLocalSearchParams<{ conversationId: string; name?: string }>();
  const router = useRouter();
  return (
    <Screen scroll={false}>
      <TopBar title={name ?? 'Chat'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/friends'))} />
      <View style={{ flex: 1, paddingBottom: 12 }}>
        <ChatPanel conversationId={conversationId} />
      </View>
    </Screen>
  );
}
