/**
 * 编辑草稿与服务端蓝图同步策略、工具行为检测、保存状态文案。
 */

const TOOL_BEHAVIORS = new Set(['grasp', 'drag', 'push']);

/**
 * dirty 草稿禁止被一般 sync 覆盖；force 用于保存成功或显式从存档重载。
 * @param {{dirty?: boolean, force?: boolean}} opts
 */
export function shouldSyncFromServer({dirty = false, force = false} = {}) {
  if (force) return true;
  if (dirty) return false;
  return true;
}

/**
 * @param {Map|object[]|null|undefined} partDefs
 * @returns {Map<string, object>}
 */
export function indexPartDefs(partDefs) {
  if (partDefs instanceof Map) return partDefs;
  const map = new Map();
  if (!partDefs) return map;
  if (Array.isArray(partDefs)) {
    for (const d of partDefs) {
      if (d?.id) map.set(d.id, d);
    }
    return map;
  }
  for (const [id, d] of Object.entries(partDefs)) {
    map.set(id, d?.id ? d : {...d, id});
  }
  return map;
}

/**
 * 蓝图是否含可用操作工具（夹爪 / 推板 / 钩子）。
 * @param {object|null|undefined} bp
 * @param {Map|object[]|null|undefined} partDefs
 */
export function blueprintHasTool(bp, partDefs) {
  if (!bp?.instances?.length) return false;
  const defs = indexPartDefs(partDefs);
  for (const inst of bp.instances) {
    const def = defs.get(inst.part_id);
    const behaviors = def?.behaviors || [];
    for (const b of behaviors) {
      if (TOOL_BEHAVIORS.has(b)) return true;
    }
  }
  return false;
}

/**
 * @param {{
 *   saving?: boolean,
 *   dirty?: boolean,
 *   failed?: boolean,
 *   name?: string,
 *   instanceCount?: number,
 * }} opts
 */
export function formatBuildStatus({
  saving = false,
  dirty = false,
  failed = false,
  name = '未命名作品',
  instanceCount = 0,
} = {}) {
  let phase = '已保存';
  if (saving) phase = '保存中';
  else if (failed) phase = '失败';
  else if (dirty) phase = '未保存';
  return `${name} · ${instanceCount} 零件 · ${phase}`;
}
