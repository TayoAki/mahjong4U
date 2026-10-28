import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { FEATURES } from '@daily-rack/core';
import { ApiError, api, type SharedRack } from '../../lib/api.ts';
import { track } from '../../lib/analytics.ts';
import { RackPlay } from '../../components/RackPlay.tsx';
import { Button, ErrorPanel, Loading, Notice, Screen, TopBar } from '../../components/ui.tsx';

/** Exact-rack entry from a shared result or link. */
function SharedRackScreen() {
  const { token = '' } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [rack, setRack] = useState<SharedRack | null>(null);
  const [error, setError] = useState<{ message: string; gone: boolean } | null>(null);

  const load = () => {
    setError(null);
    api
      .sharedRack(token)
      .then((r) => {
        track('shared_link_opened', { linkId: r.linkId, revisionId: r.puzzle.revisionId });
        if (r.attemptId) router.replace(`/result/${r.attemptId}`);
        else setRack(r);
      })
      .catch((e: Error) => setError({ message: e.message, gone: e instanceof ApiError && (e.status === 404 || e.status === 410) }));
  };
  useEffect(load, [token]);

  const header = <TopBar title={rack?.isTodaysRack ? "Today's rack" : 'Shared rack'} onBack={() => router.replace('/')} />;
  if (rack) {
    return (
      <RackPlay
        puzzle={rack.puzzle}
        shareToken={token}
        source="shared-link"
        header={header}
        top={<Notice>Someone shared this exact rack with you.{rack.posterPassPublished ? ' Answer it to see their pass next to yours.' : ''}</Notice>}
        onSubmitted={(id) => router.replace(`/result/${id}`)}
      />
    );
  }
  return (
    <Screen>
      {header}
      {error && (
        <>
          <ErrorPanel message={error.message} onRetry={error.gone ? undefined : load} />
          <Button title="Play today's rack instead" onPress={() => router.replace('/rack')} />
        </>
      )}
      {!error && <Loading label="Opening the shared rack" />}
    </Screen>
  );
}

/** Switched off for now (FEATURES.dailyRack): shared rack links land on Today. */
export default function SharedRackRoute() {
  return FEATURES.dailyRack ? <SharedRackScreen /> : <Redirect href="/" />;
}
