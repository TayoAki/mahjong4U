import { Redirect, useLocalSearchParams } from 'expo-router';
import { FEATURES } from '@daily-rack/core';
import { ClipStudio } from '../../screens/ClipStudio';

export default function ClipScreen() {
  const { attemptId = '' } = useLocalSearchParams<{ attemptId: string }>();
  // Switched off for now (FEATURES.clips): back to the result, or Today without the daily rack.
  if (!FEATURES.clips || !FEATURES.dailyRack) return <Redirect href={FEATURES.dailyRack ? `/result/${attemptId}` : '/'} />;
  return <ClipStudio attemptId={attemptId} />;
}
