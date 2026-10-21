import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { I18nProvider } from './i18n';
import AppShell from './components/AppShell';
import { Spinner } from './components/ui';

const Login = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Register })));
const Today = lazy(() => import('./pages/Today'));
const Program = lazy(() => import('./pages/Program'));
const Day = lazy(() => import('./pages/Day'));
const Flashcards = lazy(() => import('./pages/Flashcards'));
const Games = lazy(() => import('./pages/Games'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Learn = lazy(() => import('./pages/Learn'));
const Lesson = lazy(() => import('./pages/Lesson'));
const KanaPage = lazy(() => import('./pages/Kana'));
const KanjiList = lazy(() => import('./pages/Kanji').then((m) => ({ default: m.KanjiList })));
const KanjiDetail = lazy(() => import('./pages/Kanji').then((m) => ({ default: m.KanjiDetail })));
const Vocabulary = lazy(() => import('./pages/Vocabulary'));
const GrammarList = lazy(() => import('./pages/Grammar').then((m) => ({ default: m.GrammarList })));
const GrammarDetail = lazy(() => import('./pages/Grammar').then((m) => ({ default: m.GrammarDetail })));
const Stories = lazy(() => import('./pages/Stories').then((m) => ({ default: m.Stories })));
const StoryPage = lazy(() => import('./pages/Stories').then((m) => ({ default: m.StoryPage })));
const Translation = lazy(() => import('./pages/Translation'));
const ListeningList = lazy(() => import('./pages/Listening').then((m) => ({ default: m.ListeningList })));
const ListeningExercise = lazy(() => import('./pages/Listening').then((m) => ({ default: m.ListeningExercise })));
const Speaking = lazy(() => import('./pages/Speaking'));
const Review = lazy(() => import('./pages/Review'));
const Tests = lazy(() => import('./pages/Tests').then((m) => ({ default: m.Tests })));
const TestRun = lazy(() => import('./pages/Tests').then((m) => ({ default: m.TestRun })));
const Jlpt = lazy(() => import('./pages/Jlpt').then((m) => ({ default: m.Jlpt })));
const JlptExam = lazy(() => import('./pages/Jlpt').then((m) => ({ default: m.JlptExam })));
const AttemptPage = lazy(() => import('./pages/Jlpt').then((m) => ({ default: m.AttemptPage })));
const Practice = lazy(() => import('./pages/Practice'));
const Progress = lazy(() => import('./pages/Progress'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function LanguageBridge({ children }: { children: ReactNode }) {
  const { settings } = useAuth();
  return <I18nProvider lang={settings.language}>{children}</I18nProvider>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LanguageBridge>
          <ToastProvider>
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
                <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
                <Route element={<RequireAuth><AppShell /></RequireAuth>}>
                  <Route index element={<Today />} />
                  <Route path="program" element={<Program />} />
                  <Route path="day/:number" element={<Day />} />
                  <Route path="day/:number/:step" element={<Day />} />
                  <Route path="flashcards" element={<Flashcards />} />
                  <Route path="games" element={<Games />} />
                  <Route path="overview" element={<Dashboard />} />
                  <Route path="learn" element={<Learn />} />
                  <Route path="lessons/:id" element={<Lesson />} />
                  <Route path="hiragana" element={<KanaPage script="hiragana" />} />
                  <Route path="katakana" element={<KanaPage script="katakana" />} />
                  <Route path="kanji" element={<KanjiList />} />
                  <Route path="kanji/:char" element={<KanjiDetail />} />
                  <Route path="vocabulary" element={<Vocabulary />} />
                  <Route path="grammar" element={<GrammarList />} />
                  <Route path="grammar/:slug" element={<GrammarDetail />} />
                  <Route path="stories" element={<Stories />} />
                  <Route path="stories/:slug" element={<StoryPage />} />
                  <Route path="translation" element={<Translation />} />
                  <Route path="listening" element={<ListeningList />} />
                  <Route path="listening/:slug" element={<ListeningExercise />} />
                  <Route path="speaking" element={<Speaking />} />
                  <Route path="review" element={<Review />} />
                  <Route path="tests" element={<Tests />} />
                  <Route path="tests/:id" element={<TestRun />} />
                  <Route path="jlpt" element={<Jlpt />} />
                  <Route path="jlpt/:id" element={<JlptExam />} />
                  <Route path="attempts/:id" element={<AttemptPage />} />
                  <Route path="practice" element={<Practice />} />
                  <Route path="progress" element={<Progress />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
          </ToastProvider>
        </LanguageBridge>
      </AuthProvider>
    </BrowserRouter>
  );
}
