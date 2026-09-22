import { useCallback, useEffect, useRef, useState } from 'react';
import type { Yarn, YarnDraft, WeightClass } from '../core/types';
import { Field, WeightSelect } from './bits';
import { newId } from '../lib/storage';

type Stage = 'capture' | 'reading' | 'confirm';

/** Keeps the request small enough to send quickly over a phone connection. */
const MAX_EDGE = 1600;

async function downscale(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.86);
}

function blankDraft(): Required<Omit<YarnDraft, 'unreadable' | 'weightClass' | 'superwash'>> &
  Pick<YarnDraft, 'weightClass' | 'superwash'> {
  return {
    brand: '', name: '', colorway: '', dyeLot: '', fiber: '',
    yardsPerSkein: 0, gramsPerSkein: 0, gaugeStsPer4in: 0, needleSizeMm: 0,
    weightClass: 4, superwash: false,
  };
}

export function Scan({ onAdd, onCancel }: { onAdd: (yarn: Yarn) => void; onCancel: () => void }) {
  const [stage, setStage] = useState<Stage>('capture');
  const [photo, setPhoto] = useState<string | undefined>();
  const [message, setMessage] = useState<{ text: string; kind: 'info' | 'error' } | undefined>();
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [form, setForm] = useState(blankDraft());
  const [skeins, setSkeins] = useState(1);
  const [liveCamera, setLiveCamera] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setLiveCamera(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      });
      streamRef.current = stream;
      setLiveCamera(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setMessage({ text: 'No camera available here. Choose a photo instead.', kind: 'info' });
      fileRef.current?.click();
    }
  }

  async function shoot() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    stopCamera();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (blob) await read(await downscale(blob));
  }

  async function onFile(file: File | undefined) {
    if (file) await read(await downscale(file));
  }

  async function read(dataUrl: string) {
    setPhoto(dataUrl);
    setStage('reading');
    setMessage(undefined);
    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Reading the band failed.');
      applyDraft(body as YarnDraft);
      setMessage(
        body.unreadable?.length
          ? { text: `Read the band, but ${body.unreadable.join(', ')} ${body.unreadable.length === 1 ? 'is' : 'are'} not legible. Fill in what you know.`, kind: 'info' }
          : undefined,
      );
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Reading the band failed.', kind: 'error' });
      setForm(blankDraft());
      setUnreadable([]);
    } finally {
      setStage('confirm');
    }
  }

  function applyDraft(draft: YarnDraft) {
    const blank = blankDraft();
    setForm({
      brand: draft.brand ?? blank.brand,
      name: draft.name ?? blank.name,
      colorway: draft.colorway ?? blank.colorway,
      dyeLot: draft.dyeLot ?? blank.dyeLot,
      fiber: draft.fiber ?? blank.fiber,
      yardsPerSkein: draft.yardsPerSkein ?? blank.yardsPerSkein,
      gramsPerSkein: draft.gramsPerSkein ?? blank.gramsPerSkein,
      gaugeStsPer4in: draft.gaugeStsPer4in ?? blank.gaugeStsPer4in,
      needleSizeMm: draft.needleSizeMm ?? blank.needleSizeMm,
      weightClass: draft.weightClass ?? blank.weightClass,
      superwash: draft.superwash ?? false,
    });
    setUnreadable(draft.unreadable ?? []);
  }

  function enterByHand() {
    setForm(blankDraft());
    setUnreadable([]);
    setMessage(undefined);
    setStage('confirm');
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onAdd({
      id: newId('y'),
      brand: form.brand.trim(),
      name: form.name.trim() || 'Unnamed yarn',
      colorway: form.colorway.trim() || undefined,
      dyeLot: form.dyeLot.trim() || undefined,
      fiber: form.fiber.trim() || 'unspecified fiber',
      weightClass: (form.weightClass ?? 4) as WeightClass,
      yardsPerSkein: Number(form.yardsPerSkein) || 0,
      gramsPerSkein: Number(form.gramsPerSkein) || undefined,
      skeins: Math.max(1, Number(skeins) || 1),
      gaugeStsPer4in: Number(form.gaugeStsPer4in) || undefined,
      needleSizeMm: Number(form.needleSizeMm) || undefined,
      superwash: Boolean(form.superwash),
      photo,
      createdAt: Date.now(),
    });
  }

  const set = <K extends keyof ReturnType<typeof blankDraft>>(key: K, value: ReturnType<typeof blankDraft>[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div>
      <p className="eyebrow">Add to stash</p>

      {liveCamera || photo || stage !== 'confirm' ? (
      <div className="viewfinder">
        {liveCamera ? (
          <>
            <video ref={videoRef} playsInline muted aria-label="Camera viewfinder" />
            <p className="hint">Fill the frame with the band. Keep the yardage and gauge in shot.</p>
          </>
        ) : photo ? (
          <img src={photo} alt="The ball band you captured" />
        ) : (
          <p className="placeholder">A photo of the band fills in brand, fiber, yardage, gauge and dye lot.</p>
        )}
      </div>
      ) : null}

      {message ? (
        <p className={`notice${message.kind === 'error' ? ' error' : ''}`}>{message.text}</p>
      ) : null}

      {stage === 'reading' ? <p className="working">Reading the band…</p> : null}

      {stage === 'capture' ? (
        <div className="stack">
          {liveCamera ? (
            <button type="button" className="btn btn-primary btn-block btn-lg" onClick={shoot}>
              Capture band
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-block btn-lg" onClick={startCamera}>
              Open camera
            </button>
          )}
          <div className="btn-row">
            <button type="button" className="btn btn-quiet" onClick={() => fileRef.current?.click()}>
              Choose a photo
            </button>
            <button type="button" className="btn btn-quiet" onClick={enterByHand}>
              Enter by hand
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => { stopCamera(); onCancel(); }}>
              Cancel
            </button>
          </div>
          <input
            ref={fileRef} id="band-photo" type="file" accept="image/*" capture="environment"
            className="sr-only" onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
      ) : null}

      {stage === 'confirm' ? (
        <form onSubmit={submit}>
          <div className="grid-2">
            <Field label="Brand" flagged={unreadable.includes('brand')}>
              <input id="y-brand" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
            </Field>
            <Field label="Yarn" flagged={unreadable.includes('name')}>
              <input id="y-name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
            </Field>
            <Field label="Colorway" flagged={unreadable.includes('colorway')}>
              <input id="y-colorway" value={form.colorway} onChange={(e) => set('colorway', e.target.value)} />
            </Field>
            <Field label="Dye lot" note="Lots do not match." flagged={unreadable.includes('dyeLot')}>
              <input id="y-dyelot" value={form.dyeLot} onChange={(e) => set('dyeLot', e.target.value)} />
            </Field>
          </div>

          <Field label="Fiber" flagged={unreadable.includes('fiber')}>
            <input id="y-fiber" value={form.fiber} onChange={(e) => set('fiber', e.target.value)} />
          </Field>

          <Field label="Weight class" flagged={unreadable.includes('weightClass')}>
            <WeightSelect id="y-weight" value={(form.weightClass ?? 4) as WeightClass} onChange={(v) => set('weightClass', v)} />
          </Field>

          <div className="grid-2">
            <Field label="Yards per skein" flagged={unreadable.includes('yardsPerSkein')}>
              <input id="y-yards" type="number" min="0" value={form.yardsPerSkein || ''} onChange={(e) => set('yardsPerSkein', Number(e.target.value))} required />
            </Field>
            <Field label="Skeins on hand">
              <input id="y-skeins" type="number" min="1" value={skeins} onChange={(e) => setSkeins(Number(e.target.value))} required />
            </Field>
            <Field label="Grams per skein" flagged={unreadable.includes('gramsPerSkein')}>
              <input id="y-grams" type="number" min="0" value={form.gramsPerSkein || ''} onChange={(e) => set('gramsPerSkein', Number(e.target.value))} />
            </Field>
            <Field label='Gauge, sts/4"' flagged={unreadable.includes('gaugeStsPer4in')}>
              <input id="y-gauge" type="number" min="0" value={form.gaugeStsPer4in || ''} onChange={(e) => set('gaugeStsPer4in', Number(e.target.value))} />
            </Field>
          </div>

          <label className="check-field" htmlFor="y-superwash">
            <input id="y-superwash" type="checkbox" checked={Boolean(form.superwash)} onChange={(e) => set('superwash', e.target.checked)} />
            Superwash — survives a washing machine
          </label>

          <div className="btn-row">
            <button type="submit" className="btn btn-primary">Add to stash</button>
            <button type="button" className="btn btn-quiet" onClick={() => { setStage('capture'); setPhoto(undefined); setMessage(undefined); }}>
              Retake
            </button>
            <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
