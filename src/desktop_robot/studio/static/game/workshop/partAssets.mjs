/**
 * 英雄零件 GLB 资产管线：PART_MODEL_MAP 查表 → GLTFLoader 加载 → 尺寸归一 → 替换程序化外观。
 * 三条回落路径（缺一不可，见方案 §3.4）：
 *   1. 模型表为空 → 完全零开销，保持程序化；
 *   2. 加载失败/超时/文件缺失 → console.warn + heroModelWarnings 记录，保持程序化；
 *   3. 低画质分档 → 强制程序化。
 * createPartVisual 仍是同步返回：先给程序化外观，GLB 就绪后原位替换子网格，
 * 保留 root 的 userData（instanceId / visualHalfH / 拾取信息），不破坏编辑器与试验场。
 */
import * as THREE from 'three';
import {GLTFLoader} from '../../vendor/three/loaders/GLTFLoader.js';

/**
 * 英雄零件模型表：partId → /game-assets/ 下的 GLB 路径。
 * 路由已存在（http_server.py /game-assets/ → static/game/），把 .glb 放进
 * static/game/models/ 并在此登记即可生效；未登记的零件永远走程序化。
 */
export const PART_MODEL_MAP = Object.freeze({
  // 示例（资产就位后取消注释）：
  // mecha_head: '/game-assets/models/mecha_head.glb',
  // armor_torso: '/game-assets/models/armor_torso.glb',
  // gripper: '/game-assets/models/gripper.glb',
  // wheel: '/game-assets/models/wheel.glb',
});

/** 调试 HUD 可读取的加载失败记录 */
export const heroModelWarnings = [];

const loader = new GLTFLoader();
const cache = new Map(); // partId -> Promise<THREE.Object3D|null>

function modelUrlFor(partId) {
  const url = PART_MODEL_MAP[partId];
  return typeof url === 'string' && url ? url : null;
}

/**
 * 加载并尺寸归一：把 GLB 包围盒缩放到零件物理尺寸（米），中心对齐原点。
 * 返回 null 表示不可用（未登记/失败），调用方保持程序化。
 */
export function loadHeroModel(partId, size) {
  const url = modelUrlFor(partId);
  if (!url) return Promise.resolve(null);
  if (!cache.has(partId)) {
    cache.set(partId, new Promise((resolve) => {
      loader.load(
        url,
        (gltf) => resolve(gltf.scene || null),
        undefined,
        (err) => {
          const reason = String(err?.message || err || 'unknown');
          heroModelWarnings.push({partId, url, reason, at: Date.now()});
          console.warn(`[partAssets] ${partId} GLB 加载失败，回落程序化：${reason}`);
          resolve(null);
        },
      );
    }));
  }
  return cache.get(partId).then((scene) => {
    if (!scene) return null;
    return normalizeToSize(scene, size);
  });
}

/** 包围盒归一：等比缩放到 size 的最大维度并居中（Y 底对齐由 visualHalfH 承担） */
function normalizeToSize(scene, size) {
  const model = scene.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return null;
  const dim = box.getSize(new THREE.Vector3());
  const [sx = 0.05, sy = 0.05, sz = 0.05] = size || [];
  const target = Math.max(sx, sy, sz);
  const current = Math.max(dim.x, dim.y, dim.z) || 1;
  const s = target / current;
  model.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(model);
  const center = box2.getCenter(new THREE.Vector3());
  model.position.sub(center); // 居中；placePartVisual 用 visualHalfH 抬离地面
  return model;
}

/**
 * 火后不理（fire-and-forget）：模型表为空时零开销直接返回；
 * GLB 就绪后原位替换 visual 的子网格，保留 root 与 userData。
 * @param {THREE.Object3D} visual createPartVisual 的返回根节点
 * @param {string} partId
 * @param {{size?: number[], quality?: 'high'|'low'}} [opts]
 */
export function maybeAttachHeroModel(visual, partId, opts = {}) {
  if (!modelUrlFor(partId)) return; // 路径1：未登记 → 零开销
  if (opts.quality === 'low') return; // 路径3：低画质强制程序化
  loadHeroModel(partId, opts.size).then((model) => {
    if (!model || !visual.parent) return; // 场景已重建则放弃
    while (visual.children.length) visual.remove(visual.children[0]);
    visual.add(model);
    visual.userData.heroModel = true;
  }).catch(() => {}); // 路径2：任何异常都留在程序化外观
}
