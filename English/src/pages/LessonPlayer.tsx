import { useNavigate, useParams } from 'react-router-dom';
import { LessonPlayerView } from '../components/lesson/LessonPlayer';
import { useDocumentTitle } from '../components/ui';

export default function LessonPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useDocumentTitle('Lesson');
  return <LessonPlayerView key={id} lessonId={id!} onExit={() => navigate(-1)} />;
}
