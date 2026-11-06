import { useState } from 'react';
import type { ReadingMaterial } from '@shared/contentSchema';
import type { QuestionDTO } from '../../lib/types';
import { QuestionSequence, type SequenceResult } from '../QuestionSequence';
import { Badge, Button, Card, Mn } from '../ui';

type Material = Omit<ReadingMaterial, 'questions'> & { id?: string; level?: string };

export function ReadingText({ material }: { material: Material }) {
  const [open, setOpen] = useState<string | null>(null);
  const glossary = material.glossary ?? [];
  return (
    <Card as="article">
      <div className="mb-1 flex flex-wrap gap-2">
        <Badge tone="primary">{material.genre}</Badge>
        {material.level && <Badge>{material.level}</Badge>}
      </div>
      <h3 className="mb-3 text-xl font-bold tracking-tight">{material.title}</h3>
      <div className="prose-text text-[16px]">
        {material.text.map((p, i) => (
          <p key={i}>
            <span className="mr-2 select-none text-xs font-bold text-muted" aria-hidden>
              {i + 1}
            </span>
            {p}
          </p>
        ))}
      </div>
      {glossary.length > 0 && (
        <div className="mt-2 border-t border-border pt-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Glossary</div>
          <div className="flex flex-wrap gap-1.5">
            {glossary.map((g) => (
              <button key={g.term} type="button" onClick={() => setOpen(open === g.term ? null : g.term)} className="rounded-lg bg-surface-2 px-2.5 py-1 text-sm font-medium" aria-expanded={open === g.term}>
                {g.term}
              </button>
            ))}
          </div>
          {open &&
            glossary
              .filter((g) => g.term === open)
              .map((g) => (
                <div key={g.term} className="animate-fade-in mt-2 rounded-xl bg-primary-soft p-3 text-sm">
                  <strong>{g.term}</strong> — {g.meaning}
                  <Mn>{g.mn}</Mn>
                </div>
              ))}
        </div>
      )}
      {material.source && <p className="mt-2 text-xs text-muted">{material.source}</p>}
    </Card>
  );
}

export function ReadingActivity({
  material,
  questions,
  context,
  onComplete,
}: {
  material: Material;
  questions: QuestionDTO[];
  context: { type: string; id?: string | null };
  onComplete: (r: SequenceResult) => void;
}) {
  const [started, setStarted] = useState(false);
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
        <ReadingText material={material} />
      </div>
      <div>
        {!started ? (
          <Card>
            <p className="text-[15px]">
              Read the text first — for the main idea, then for details. When you're ready, answer {questions.length} questions. The text stays visible.
            </p>
            <Button className="mt-3" block size="lg" onClick={() => setStarted(true)}>
              Start the questions
            </Button>
          </Card>
        ) : (
          <QuestionSequence questions={questions} context={context} onComplete={onComplete} />
        )}
      </div>
    </div>
  );
}
