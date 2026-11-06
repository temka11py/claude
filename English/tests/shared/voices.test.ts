import { describe, expect, it } from 'vitest';
import { narratorVoice, neuralVoicesFor, speechChunks } from '@shared/voices';

describe('natural voices', () => {
  it('gives each speaker their own voice that matches gender and accent', () => {
    const voices = neuralVoicesFor([
      { text: 'Hi!', speaker: 'Dan', voice: 'male', accent: 'en-GB' },
      { text: 'Hello.', speaker: 'Tom', voice: 'male', accent: 'en-GB' },
      { text: 'Hey.', speaker: 'Priya', voice: 'female', accent: 'en-IN' },
      { text: 'So…', speaker: 'Dan', voice: 'male', accent: 'en-GB' },
      { text: 'Yes.', speaker: 'Amy', voice: 'female', accent: 'en-US' },
    ]);
    expect(voices[0]).toMatch(/^bm_/);
    expect(voices[1]).toMatch(/^bm_/);
    expect(voices[1]).not.toBe(voices[0]);
    expect(voices[2]).toMatch(/^bf_/);
    expect(voices[3]).toBe(voices[0]);
    expect(voices[4]).toMatch(/^af_/);
  });

  it('reads lines without a speaker with the narrator voice', () => {
    expect(neuralVoicesFor([{ text: 'word' }])).toEqual([narratorVoice('en-GB')]);
    expect(narratorVoice('en-US')).toMatch(/^af_/);
  });

  it('splits only long lines, at sentence ends', () => {
    expect(speechChunks('  Short   line. ')).toEqual(['Short line.']);
    const long = 'This is the first sentence of a long answer. '.repeat(8).trim();
    const chunks = speechChunks(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(220);
      expect(c).toMatch(/\.$/);
    }
    expect(chunks.join(' ')).toBe(long);
  });
});
