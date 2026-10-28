import { Redirect } from 'expo-router';

// The lesson list now lives on the Learn tab, as a path with Pip.
export default function LessonsScreen() {
  return <Redirect href="/learn" />;
}
