import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

/**
 * Ball bands are glossy, curved, multilingual, and carry half their information
 * as standardized icons. Classic OCR reads them badly; a vision model reads the
 * icons too. Everything is nullable because a band that has lost its corner is
 * the normal case, not the exception.
 */
const BandSchema = z.object({
  brand: z.string().nullable().describe('Manufacturer, e.g. "Cascade", "Knit Picks", "Malabrigo".'),
  name: z.string().nullable().describe('Yarn line, e.g. "220", "Swish DK". Not the colorway.'),
  colorway: z.string().nullable().describe('Colour name or number as printed.'),
  dyeLot: z.string().nullable().describe('Dye lot, often labelled LOT, PARTIDA or BAIN. Skeins from different lots do not match.'),
  fiber: z.string().nullable().describe('Fiber content verbatim, e.g. "100% superwash merino wool".'),
  weightClass: z.number().int().min(0).max(7).nullable()
    .describe('Craft Yarn Council class: 0 lace, 1 super fine/fingering, 2 fine/sport, 3 light/DK, 4 medium/worsted, 5 bulky, 6 super bulky, 7 jumbo. Read the numbered skein symbol when present, otherwise infer from the printed weight name or the stated gauge.'),
  yardsPerSkein: z.number().positive().nullable().describe('Yards per skein. Convert from metres if only metres are printed (1 m = 1.0936 yd).'),
  gramsPerSkein: z.number().positive().nullable().describe('Grams per skein. Convert from ounces if needed (1 oz = 28.35 g).'),
  gaugeStsPer4in: z.number().positive().nullable()
    .describe('Stitches per 4 inches / 10 cm from the gauge square. If the band prints stitches per inch, multiply by four.'),
  needleSizeMm: z.number().positive().nullable().describe('Recommended needle size in millimetres. Convert US sizes to mm.'),
  superwash: z.boolean().nullable()
    .describe('True only if the band says superwash or machine washable, or shows a machine-wash care symbol. False if it shows hand-wash only. Null if no care information is visible.'),
  unreadable: z.array(z.string())
    .describe('Field names above that are genuinely not legible on this photo, so the app can ask the knitter for them.'),
});

const SYSTEM = `You read knitting yarn ball bands from photographs.

Report only what the band actually shows. A guessed yardage sends a knitter into a
sweater they cannot finish, so when a field is illegible, cut off, or absent, set it
to null and name it in "unreadable" instead of estimating.

Bands print in several languages and use Craft Yarn Council symbols: a numbered skein
icon for weight class, a crossed-out or numbered wash tub for care, and a gauge square
showing stitches and rows over 10 cm. Read the icons as well as the text.`;

/** @typedef {{ base64: string, mediaType: string }} BandPhoto */

/**
 * Pull structured yarn data off a photograph of a ball band.
 * @param {BandPhoto} photo
 * @returns {Promise<object>} a draft the knitter confirms before it enters the stash
 */
export async function extractBand({ base64, mediaType }) {
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 4096,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(BandSchema), effort: 'medium' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'Read this ball band.' },
        ],
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error('The model declined to read this image.'), { status: 422 });
  }
  if (!response.parsed_output) {
    throw Object.assign(new Error('Could not read a ball band in that photo.'), { status: 422 });
  }
  return response.parsed_output;
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Handles POST /api/extract for both the Vite dev server and the standalone one.
 * The API key stays here and never reaches the browser.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleExtract(req, res) {
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };

  if (req.method !== 'POST') return send(405, { error: 'Use POST.' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return send(503, {
      error: 'Label scanning is off because ANTHROPIC_API_KEY is not set. Add a yarn by hand instead.',
      code: 'no_api_key',
    });
  }

  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_PHOTO_BYTES * 1.4) return send(413, { error: 'That photo is too large. Try again at a lower resolution.' });
      chunks.push(chunk);
    }

    const { image } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const parsed = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(image ?? '');
    if (!parsed) return send(400, { error: 'Send the photo as a base64 image data URL.' });

    const [, mediaType, base64] = parsed;
    if (!ALLOWED_MEDIA.has(mediaType)) return send(415, { error: `${mediaType} is not a supported image type.` });

    const draft = await extractBand({ base64, mediaType });
    return send(200, draft);
  } catch (error) {
    const status = error?.status ?? 500;
    console.error('[extract]', error);
    return send(status >= 400 && status < 600 ? status : 500, {
      error: error?.message ?? 'Reading the band failed.',
    });
  }
}
