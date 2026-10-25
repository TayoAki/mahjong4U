import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api.ts';
import { track } from '../../lib/analytics.ts';
import { Button, ErrorPanel, Loading, Screen, TopBar } from '../../components/ui.tsx';

/** Table invite link: /t/CODE takes a seat and opens the table. */
export default function TableInviteScreen() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const join = () => {
    setError(null);
    api
      .joinByCode(code)
      .then((t) => {
        track('table_joined', { mode: t.table.mode, via: 'link' });
        router.replace(`/table/${t.table.id}`);
      })
      .catch((e: Error) => setError(e.message));
  };
  useEffect(join, [code]);

  return (
    <Screen>
      <TopBar title="Table invite" onBack={() => router.replace('/play')} />
      {error ? (
        <>
          <ErrorPanel message={error} onRetry={join} />
          <Button title="Go to Play" onPress={() => router.replace('/play')} />
        </>
      ) : (
        <Loading label="Finding your seat" />
      )}
    </Screen>
  );
}
