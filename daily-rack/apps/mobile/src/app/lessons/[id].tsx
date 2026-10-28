import { useLocalSearchParams, useRouter } from 'expo-router';
import { LESSONS } from '../../lessons/content.ts';
import { LessonPlayer } from '../../lessons/LessonPlayer.tsx';
import { useLessonProgress } from '../../lessons/progress.ts';
import { Body, Button, Display, Screen, TopBar } from '../../components/ui.tsx';

// One lesson, start to finish. Finishing it ticks it off on the list.

export default function LessonScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { markDone } = useLessonProgress();
  const index = LESSONS.findIndex((l) => l.id === id);
  const lesson = LESSONS[index];
  const next = LESSONS[index + 1];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/lessons'));

  if (!lesson) {
    return (
      <Screen>
        <TopBar title="Lessons" onBack={back} />
        <Display size={28}>We couldn’t find that lesson</Display>
        <Body muted>It may have moved. Every lesson is on the list.</Body>
        <Button title="See all lessons" onPress={() => router.replace('/lessons')} />
      </Screen>
    );
  }

  return (
    <LessonPlayer
      key={lesson.id}
      lesson={lesson}
      number={index + 1}
      onComplete={markDone}
      onExit={back}
      // Back to the Play tab rather than stacking another copy of it on top of the lesson.
      onPractice={() => router.dismissTo('/play')}
      next={next}
      onNext={next ? () => router.replace(`/lessons/${next.id}`) : undefined}
    />
  );
}
