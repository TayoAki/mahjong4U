import { useLocalSearchParams } from 'expo-router';
import { ClipStudio } from '../../screens/ClipStudio';

export default function ClipScreen() {
  const { attemptId = '' } = useLocalSearchParams<{ attemptId: string }>();
  return <ClipStudio attemptId={attemptId} />;
}
