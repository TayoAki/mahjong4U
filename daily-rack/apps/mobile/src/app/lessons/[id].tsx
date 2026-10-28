import { useLocalSearchParams, useRouter } from 'expo-router';
import { LESSONS, MORE_LESSONS } from '../../lessons/content.ts';
import { LessonPlayer } from '../../lessons/LessonPlayer.tsx';
import { useLessonProgress } from '../../lessons/progress.ts';
import { useNotifications } from '../../lib/notification-prompt.tsx';
import { notePractice } from '../../lib/reminders.ts';
import { Body, Button, Display, Screen, TopBar } from '../../components/ui.tsx';

// One lesson, start to finish. Finishing it ticks it off on the list.

export default function LessonScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { markDone, done } = useLessonProgress();
  const { ask, refresh } = useNotifications();
  const index = LESSONS.findIndex((l) => l.id === id);
  // Lessons off the main path (two-player games) open the same way but aren't counted in it.
  const extra = MORE_LESSONS.findIndex((l) => l.id === id);
  const lesson = LESSONS[index] ?? MORE_LESSONS[extra];
  const next = index === -1 ? undefined : LESSONS[index + 1];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/learn'));

  if (!lesson) {
    return (
      <Screen>
        <TopBar title="Lessons" onBack={back} />
        <Display size={28}>We couldn’t find that lesson</Display>
        <Body muted>It may have moved. Every lesson is on the list.</Body>
        <Button title="See all lessons" onPress={() => router.replace('/learn')} />
      </Screen>
    );
  }

  return (
    <LessonPlayer
      key={lesson.id}
      lesson={lesson}
      number={index === -1 ? LESSONS.length + extra + 1 : index + 1}
      onComplete={(lessonId) => {
        const first = done.size === 0;
        if (index !== -1) markDone(lessonId);
        void notePractice().then(refresh);
        // After a first lesson, Pip offers to keep them going (once the celebration has had a moment).
        if (first) setTimeout(() => ask('first-lesson'), 2500);
      }}
      onExit={back}
      // Back to the Play tab rather than stacking another copy of it on top of the lesson.
      onPractice={() => router.dismissTo('/play')}
      next={next}
      onNext={next ? () => router.replace(`/lessons/${next.id}`) : undefined}
    />
  );
}
