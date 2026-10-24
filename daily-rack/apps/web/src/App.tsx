import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { FIRST_OPEN_KEY, readJson } from './lib/storage.ts';
import { TodayScreen } from './screens/Today.tsx';
import { RackScreen } from './screens/Rack.tsx';
import { ResultScreen } from './screens/Result.tsx';
import { YouScreen } from './screens/You.tsx';
import { SharedRackScreen } from './screens/SharedRack.tsx';
import { Loading } from './components/ui.tsx';

const ClipScreen = lazy(() => import('./screens/Clip.tsx').then((m) => ({ default: m.ClipScreen })));

/** First open goes straight to the rack; returning players land on Today. */
function Entry() {
  return <Navigate to={readJson<boolean>(FIRST_OPEN_KEY, false) ? '/today' : '/rack'} replace />;
}

export function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Entry />} />
        <Route path="/today" element={<TodayScreen />} />
        <Route path="/rack" element={<RackScreen />} />
        <Route path="/result/:attemptId" element={<ResultScreen />} />
        <Route
          path="/clip/:attemptId"
          element={
            <Suspense fallback={<Loading label="Setting up your clip" />}>
              <ClipScreen />
            </Suspense>
          }
        />
        <Route path="/you" element={<YouScreen />} />
        <Route path="/r/:token" element={<SharedRackScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
