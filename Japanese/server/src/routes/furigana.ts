import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../lib/http.js';
import { furigana } from '../lib/furigana.js';

export const furiganaRouter = Router();

const schema = z.object({ texts: z.array(z.string().max(4000)).min(1).max(200) });

/** Furigana for any Japanese text shown in the app (batched by the client). */
furiganaRouter.post('/furigana', async (req, res) => {
  const { texts } = validate(schema, req.body);
  res.json({ results: await Promise.all(texts.map((t) => furigana(t))) });
});
