import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError, parse } from '../http';
import { MAX_SPEECH_CHARS } from '../services/speech';

const line = z.object({ voice: z.string().max(40), text: z.string().min(1).max(MAX_SPEECH_CHARS) });

export async function speechRoutes(app: FastifyInstance): Promise<void> {
  const speech = app.speech;

  app.get('/tts/status', async () => speech?.status() ?? { enabled: false, state: 'off', queued: 0, error: null });

  // One line of natural speech as WAV (generated on first request, then cached).
  app.get('/tts/speech', async (req, reply) => {
    const q = parse(line, req.query);
    if (!speech?.enabled) throw new HttpError(503, 'Natural voices are turned off.');
    if (!speech.isVoice(q.voice)) throw new HttpError(400, 'Unknown voice');
    let file: string;
    try {
      file = await speech.file(q.voice, q.text, 'now');
    } catch (err) {
      throw new HttpError(503, (err as Error).message);
    }
    const audio = await fs.promises.readFile(file);
    reply.header('Cache-Control', 'private, max-age=31536000, immutable').header('Accept-Ranges', 'bytes').type('audio/wav');
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, audio.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1;
      if (start > end || start >= audio.length) return reply.code(416).header('Content-Range', `bytes */${audio.length}`).send();
      return reply.code(206).header('Content-Range', `bytes ${start}-${end}/${audio.length}`).send(audio.subarray(start, end + 1));
    }
    return reply.send(audio);
  });

  // Lines the learner is about to hear: prepare them now, without waiting.
  app.post('/tts/prefetch', async (req) => {
    const body = parse(z.object({ items: z.array(line).max(300) }), req.body);
    speech?.prefetch(body.items.filter((i) => speech.isVoice(i.voice)), 'soon');
    return { ok: true };
  });
}
