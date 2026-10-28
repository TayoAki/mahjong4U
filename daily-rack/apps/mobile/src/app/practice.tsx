import { useRouter } from 'expo-router';
import { useSession } from '../lib/session.tsx';
import { PracticeView } from '../practice/PracticeView.tsx';

/** A practice round: one untimed hand against the computer, with Pip coaching every move. */
export default function PracticeScreen() {
  const router = useRouter();
  const { profile } = useSession();
  return <PracticeView me={profile?.name ?? 'You'} onExit={() => (router.canGoBack() ? router.back() : router.replace('/learn'))} />;
}
