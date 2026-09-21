/**
 * BFS pathfinding for the 9x9 desk grid.
 * @param {number[]} start
 * @param {number[]} goal
 * @param {Set<string>} blockedCells cells as "x,y"
 * @param {number} [size=9]
 * @returns {number[][]|null} path excluding start, including goal; null if unreachable
 */
export function findPath(start, goal, blockedCells, size = 9) {
  const key = (p) => `${p[0]},${p[1]}`;
  const startKey = key(start);
  const goalKey = key(goal);
  if (startKey === goalKey) return [];
  if (blockedCells.has(goalKey)) return null;

  const queue = [[start, []]];
  const seen = new Set([startKey]);
  while (queue.length) {
    const [p, path] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = [p[0] + dx, p[1] + dy];
      const k = key(q);
      if (q.some((v) => v < 0 || v >= size) || seen.has(k) || blockedCells.has(k)) continue;
      const next = [...path, q];
      if (k === goalKey) return next;
      seen.add(k);
      queue.push([q, next]);
    }
  }
  return null;
}

/**
 * Step along a path until done, cancelled (version mismatch), or move fails.
 * @param {{path: number[][], version: number, getVersion: () => number, move: (pos: number[], index: number) => Promise<boolean>, onCancel?: () => void}} opts
 */
export async function followPath({path, version, getVersion, move, onCancel}) {
  for (let i = 0; i < path.length; i++) {
    if (version !== getVersion()) {
      onCancel?.();
      return {ok: false, reason: 'cancelled'};
    }
    const result = await move(path[i], i);
    if (version !== getVersion()) {
      onCancel?.();
      return {ok: false, reason: 'cancelled'};
    }
    if (!result) return {ok: false, reason: 'move_failed'};
  }
  return {ok: true};
}
