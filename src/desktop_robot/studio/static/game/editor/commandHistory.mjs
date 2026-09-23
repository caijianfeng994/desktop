/**
 * 蓝图编辑命令历史：deep-clone 快照，支持 undo/redo。
 */

function clone(state) {
  return structuredClone(state);
}

/**
 * @param {number} [limit=50]
 * @returns {{
 *   push: (state: object) => void,
 *   undo: () => object | null,
 *   redo: () => object | null,
 *   canUndo: boolean,
 *   canRedo: boolean,
 * }}
 */
export function createHistory(limit = 50) {
  /** @type {object[]} */
  const past = [];
  /** @type {object[]} */
  const future = [];
  /** @type {object | null} */
  let current = null;

  return {
    push(state) {
      if (current !== null) {
        past.push(current);
        while (past.length > limit) {
          past.shift();
        }
      }
      current = clone(state);
      future.length = 0;
    },
    undo() {
      if (past.length === 0 || current === null) {
        return null;
      }
      future.push(current);
      current = past.pop();
      return clone(current);
    },
    redo() {
      if (future.length === 0 || current === null) {
        return null;
      }
      past.push(current);
      while (past.length > limit) {
        past.shift();
      }
      current = future.pop();
      return clone(current);
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
  };
}
