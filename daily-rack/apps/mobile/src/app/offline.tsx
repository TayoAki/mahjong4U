import { useRouter } from 'expo-router';
import { useSession } from '../lib/session.tsx';
import { OfflineGameView } from '../offline/OfflineGameView.tsx';

/** A game against the computer that runs on the device, no connection needed. */
export default function OfflineScreen() {
  const router = useRouter();
  const { profile } = useSession();
  return <OfflineGameView me={profile?.name ?? 'You'} onExit={() => (router.canGoBack() ? router.back() : router.replace('/play'))} />;
}
