/**
 * The sign where a run parts in two (asked: "add a fork sign"): a post at the side of the piste a little above where the ways part,
 * two boards on it facing the skier coming down, each with the name of a run and an arrow the way it goes, as a resort's trail signs
 * are, white on green. Made by the page for a land whose slice carries a branch (`Land.ways`), and let go of with it.
 */
import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SRGBColorSpace } from 'three';

/** A board's face, `w` by `h` metres: the run's name and an arrow, pointing to the right (`right`) or to the left. */
function boardFace(name: string, right: boolean, w: number, h: number): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = Math.round((1024 * h) / w);
  const g = c.getContext('2d')!, W = c.width, H = c.height, pad = H * 0.14;
  g.fillStyle = '#1f4a35'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#f4f1e6'; g.lineWidth = H * 0.05; g.strokeRect(g.lineWidth, g.lineWidth, W - 2 * g.lineWidth, H - 2 * g.lineWidth);
  // The arrow, at the end it points to.
  const ah = H - 2 * pad, aw = ah * 1.25, ax = right ? W - pad - aw : pad, mid = H / 2;
  g.fillStyle = '#f4f1e6';
  g.beginPath();
  const tip = right ? ax + aw : ax, back = right ? ax : ax + aw, neck = right ? ax + aw * 0.55 : ax + aw * 0.45;
  g.moveTo(tip, mid); g.lineTo(neck, mid - ah / 2); g.lineTo(neck, mid - ah * 0.2); g.lineTo(back, mid - ah * 0.2);
  g.lineTo(back, mid + ah * 0.2); g.lineTo(neck, mid + ah * 0.2); g.lineTo(neck, mid + ah / 2); g.closePath(); g.fill();
  // The name, as large as fits beside it.
  const room = W - 3 * pad - aw;
  let size = H * 0.6;
  g.font = `600 ${size}px Georgia, 'Times New Roman', serif`;
  while (g.measureText(name).width > room && size > 10) { size -= 2; g.font = `600 ${size}px Georgia, 'Times New Roman', serif`; }
  g.textBaseline = 'middle'; g.textAlign = right ? 'left' : 'right';
  g.fillText(name, right ? pad * 1.5 : W - pad * 1.5, mid + size * 0.04);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/**
 * A fork sign standing at its foot at the origin, its boards facing along +z (the page turns it to face up the run): `left` the name
 * of the run that goes off to the skier's left, `right` the one to the right, the upper board the left's.
 */
export function forkSign(left: string, right: string): { group: Group; dispose(): void } {
  const group = new Group(), wood = new MeshStandardMaterial({ color: 0x5b4030, roughness: 0.85 }), W = 2.4, H = 0.44;
  const faces = [boardFace(left, false, W, H), boardFace(right, true, W, H)];
  const fronts = faces.map((map) => new MeshStandardMaterial({ map, roughness: 0.75 }));
  const post = new Mesh(new CylinderGeometry(0.07, 0.08, 3.2, 8).translate(0, 1.6, 0), wood), board = new BoxGeometry(W, H, 0.06);
  post.castShadow = true;
  group.add(post);
  fronts.forEach((front, k) => {
    // (Its face on the side towards +z, the rest of it wood: a box's sides go +x, -x, +y, -y, +z, -z.)
    const m = new Mesh(board, [wood, wood, wood, wood, front, wood]);
    // (Each reaching out from the post the way it points, clear of it, which had hidden the end of a name; and turned a little that way.)
    const toRight = k === 1;
    m.position.set((toRight ? 1 : -1) * (W / 2 + 0.06), 2.75 - k * 0.56, 0);
    m.rotation.y = (toRight ? -1 : 1) * 0.12;
    m.castShadow = true;
    group.add(m);
  });
  group.name = 'fork sign';
  return {
    group,
    dispose: () => { post.geometry.dispose(); board.dispose(); wood.dispose(); for (const f of fronts) f.dispose(); for (const t of faces) t.dispose(); },
  };
}
