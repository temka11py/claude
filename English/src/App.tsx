import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';
import { SettingsProvider, useAuth, useSettings } from './lib/context';

const Login = lazy(() => import('./pages/Login'));
const Welcome = lazy(() => import('./pages/Welcome'));
const Placement = lazy(() => import('./pages/Placement'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Session = lazy(() => import('./pages/Session'));
const Course = lazy(() => import('./pages/Course'));
const ModulePage = lazy(() => import('./pages/ModulePage'));
const LessonPlayer = lazy(() => import('./pages/LessonPlayer'));
const TestRunner = lazy(() => import('./pages/TestRunner'));
const Review = lazy(() => import('./pages/Review'));
const Vocabulary = lazy(() => import('./pages/Vocabulary'));
const Practice = lazy(() => import('./pages/Practice'));
const PracticeActivity = lazy(() => import('./pages/PracticeActivity'));
const GamePage = lazy(() => import('./pages/GamePage'));
const Mistakes = lazy(() => import('./pages/Mistakes'));
const Progress = lazy(() => import('./pages/Progress'));
const Achievements = lazy(() => import('./pages/Achievements'));
const Tutor = lazy(() => import('./pages/Tutor'));
const Conversation = lazy(() => import('./pages/Conversation'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Admin = lazy(() => import('./pages/Admin'));
const Certificate = lazy(() => import('./pages/Certificate'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Loading() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <Spinner />
    </div>
  );
}

/** Sends new learners through onboarding (schedule + placement) first. */
function Onboarded({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  if (!settings) return <Loading />;
  if (!settings.onboarded && settings.placementStatus === 'pending') return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

function Private({ children }: { children: ReactNode }) {
  const { status, loading } = useAuth();
  const location = useLocation();
  if (loading || !status) return <Loading />;
  if (status.needsSetup) return <Navigate to="/login?setup=1" replace />;
  if (!status.user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

export default function App() {
  const { status } = useAuth();
  return (
    <SettingsProvider enabled={!!status?.user}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/welcome"
            element={
              <Private>
                <Welcome />
              </Private>
            }
          />
          <Route
            path="/placement"
            element={
              <Private>
                <Placement />
              </Private>
            }
          />
          <Route
            path="/session"
            element={
              <Private>
                <Onboarded>
                  <Session />
                </Onboarded>
              </Private>
            }
          />
          <Route
            path="/lesson/:id"
            element={
              <Private>
                <LessonPlayer />
              </Private>
            }
          />
          <Route
            path="/test/:kind/:id"
            element={
              <Private>
                <TestRunner />
              </Private>
            }
          />
          <Route
            path="/games/:id"
            element={
              <Private>
                <GamePage />
              </Private>
            }
          />
          <Route
            path="/practice/:activity/:id?"
            element={
              <Private>
                <PracticeActivity />
              </Private>
            }
          />
          <Route
            element={
              <Private>
                <Onboarded>
                  <AppShell />
                </Onboarded>
              </Private>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="/course" element={<Course />} />
            <Route path="/module/:id" element={<ModulePage />} />
            <Route path="/review" element={<Review />} />
            <Route path="/vocabulary" element={<Vocabulary />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/mistakes" element={<Mistakes />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/achievements" element={<Achievements />} />
            <Route path="/tutor" element={<Tutor />} />
            <Route path="/conversation" element={<Conversation />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/certificate" element={<Certificate />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </SettingsProvider>
  );
}
