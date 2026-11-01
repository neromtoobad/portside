// Draws a 1200×630 brag card from the harbour art, then shares it (phones) or downloads it and
// opens an X post (desktop, where X intents can't carry an image).

const SITE = 'https://portside.nerom.site';

export interface Brag { headline: string; detail: string; amount: string; up: boolean; captain: string; rank: string; face: string; kind: string; streak: number }

const load = (src: string) => new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });

function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export async function drawCard(b: Brag): Promise<Blob> {
  await document.fonts.ready;
  const [scene, face, kind] = await Promise.all([load('/art/scene-1600.webp'), load(b.face), load(b.kind)]);
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 630;
  const g = c.getContext('2d')!;
  // Scene, cropped toward the piers.
  const sw = scene.width * 0.62, sh = sw * (630 / 1200);
  g.drawImage(scene, scene.width * 0.3, scene.height * 0.18, sw, sh, 0, 0, 1200, 630);
  const fade = g.createLinearGradient(0, 0, 760, 0);
  fade.addColorStop(0, 'rgba(6,40,56,0.55)'); fade.addColorStop(1, 'rgba(6,40,56,0)');
  g.fillStyle = fade; g.fillRect(0, 0, 1200, 630);

  // The card.
  g.save();
  g.shadowColor = 'rgba(6,60,82,0.35)'; g.shadowBlur = 40; g.shadowOffsetY = 14;
  rounded(g, 56, 64, 640, 502, 36); g.fillStyle = '#fff'; g.fill();
  g.restore();

  g.fillStyle = '#067a96'; g.font = '900 30px Rubik'; g.fillText('PORTSIDE', 132, 124);
  g.fillStyle = '#f2c230'; rounded(g, 96, 101, 24, 24, 6); g.fill();
  g.fillStyle = '#1d4f91'; g.fillRect(108, 101, 12, 24);

  g.drawImage(kind, 566, 80, 110, 110);
  g.fillStyle = '#10324a'; g.font = '900 64px Rubik';
  g.fillText(b.headline.toUpperCase(), 96, 214, 440);
  g.fillStyle = '#5f7787'; g.font = '600 26px Rubik';
  g.fillText(b.detail, 96, 258, 560);

  g.fillStyle = b.up ? '#12a463' : '#e8443f'; g.font = '900 96px Rubik';
  g.fillText(b.amount, 92, 372, 560);

  if (b.streak >= 2) {
    g.fillStyle = '#fff1c7'; rounded(g, 96, 398, 250, 46, 23); g.fill();
    g.fillStyle = '#b26b00'; g.font = '800 24px Rubik'; g.fillText(`${b.streak} calls in a row`, 116, 430);
  }

  // Captain row.
  g.save(); g.beginPath(); g.arc(140, 500, 44, 0, Math.PI * 2); g.closePath(); g.fillStyle = '#ffe2a0'; g.fill(); g.clip();
  const s = face.width; g.drawImage(face, 0, 0, s, s * 0.9, 96, 456, 88, 88 * 0.9 + 9); g.restore();
  g.fillStyle = '#10324a'; g.font = '800 30px Rubik'; g.fillText(b.captain, 200, 494, 300);
  g.fillStyle = '#5f7787'; g.font = '600 22px Rubik'; g.fillText(b.rank, 200, 526);
  g.fillStyle = '#067a96'; g.font = '700 20px "JetBrains Mono"'; g.textAlign = 'right'; g.fillText('portside.nerom.site', 664, 526);

  return new Promise((ok) => c.toBlob((blob) => ok(blob!), 'image/png'));
}

export async function shareBrag(b: Brag, text: string) {
  const blob = await drawCard(b);
  const file = new File([blob], 'portside.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text: `${text} ${SITE}` }); return 'shared'; } catch { /* closed the sheet */ return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'portside.png'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SITE)}`, '_blank', 'noopener');
  return 'downloaded';
}
