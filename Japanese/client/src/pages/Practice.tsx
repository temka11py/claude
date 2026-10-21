import { useSearchParams } from 'react-router';
import { useI18n } from '../i18n';
import { categoryLabel } from '../lib/labels';
import { PageHeader } from '../components/ui';
import { PracticeRunner } from '../components/quiz/runners';

/** Ad-hoc practice, e.g. /practice?categories=particles,kanji-reading (weak areas). */
export default function Practice() {
  const [params] = useSearchParams();
  const { L, lang } = useI18n();
  const categories = (params.get('categories') ?? '').split(',').filter((c) => /^[a-z-]+$/.test(c));
  const weak = params.get('title') === 'weak';
  const query = new URLSearchParams({ count: '12' });
  if (categories.length) query.set('categories', categories.join(','));
  return (
    <div>
      <PageHeader
        titleJa="れんしゅう"
        title={weak ? L('Сул талаа дасгалжуулах', 'Practice weak areas') : L('Дасгал', 'Practice')}
        subtitle={categories.length ? categories.map((c) => categoryLabel(c, lang)).join(' · ') : L('Холимог асуултууд', 'Mixed questions')}
      />
      <PracticeRunner query={query.toString()} kind={weak ? 'weak_areas' : 'practice'} title={weak ? L('Сул талын дасгал', 'Weak-area practice') : L('Дасгал', 'Practice')} />
    </div>
  );
}
