import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api.ts';
import { track } from '../../lib/analytics.ts';
import { useSafety } from '../../lib/safety.tsx';
import { FIRST_OPEN_KEY, writeJson } from '../../lib/storage.ts';
import { Button, ErrorPanel, Loading, Screen, TopBar } from '../../components/ui.tsx';

/** Table invite link: /t/CODE takes a seat and opens the table. */
export default function TableInviteScreen() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { ensureName } = useSafety();

  const join = async () => {
    setError(null);
    // Someone arriving from an invite came to play, not for the daily rack.
    void writeJson(FIRST_OPEN_KEY, true);
    if (!(await ensureName())) {
      router.replace('/play');
      return;
    }
    try {
      const t = await api.joinByCode(code);
      track('table_joined', { mode: t.table.mode, via: 'link' });
      router.replace(`/table/${t.table.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void join();
  }, [code]);

  return (
    <Screen>
      <TopBar title="Table invite" onBack={() => router.replace('/play')} />
      {error ? (
        <>
          <ErrorPanel message={error} onRetry={() => void join()} />
          <Button title="Go to Play" onPress={() => router.replace('/play')} />
        </>
      ) : (
        <Loading label="Finding your seat" />
      )}
    </Screen>
  );
}
