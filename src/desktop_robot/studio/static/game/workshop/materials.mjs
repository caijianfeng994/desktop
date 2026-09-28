/**
 * 零件材质分档：金属机架 / 塑料板件 / 橡胶轮胎；支持视觉主题覆写。
 */
import {getTheme, normalizeThemeId} from './visualTheme.mjs';

const PRESET_KEYS = {
  core: 'accent',
  wheel: 'rubber',
  drive_wheel: 'rubber',
  track_module: 'rubber',
  plate: 'plastic',
  beam: 'metal',
  post: 'metal',
  revolute_joint: 'metal',
  prism_joint: 'metal',
  gripper: 'tool',
  pusher: 'plastic',
  hook: 'metal',
  bucket: 'plastic',
  battery: 'plastic',
  camera: 'plastic',
  display: 'plastic',
  armor_torso: 'metal',
  armor_shoulder: 'metal',
  mecha_head: 'accent',
  mecha_leg: 'metal',
  backpack_frame: 'metal',
  weapon_rifle: 'tool',
  thruster_pack: 'accent',
  winch_module: 'metal',
  heavy_plate: 'metal',
};

/**
 * @param {string} partId
 * @param {string} [themeId]
 * @returns {{color:number, roughness:number, metalness:number, preset:string, emissive:number, emissiveIntensity:number, theme:string}}
 */
export function materialForPart(partId, themeId = 'warm') {
  const theme = getTheme(themeId);
  const key = PRESET_KEYS[partId] || 'plastic';
  const p = theme.materials[key] || theme.materials.plastic;
  return {
    color: p.color,
    roughness: p.roughness,
    metalness: p.metalness,
    emissive: p.emissive ?? 0x000000,
    emissiveIntensity: p.emissiveIntensity ?? 0,
    preset: key,
    theme: normalizeThemeId(themeId),
  };
}

/** @deprecated 使用 getTheme(themeId).materials；保留兼容旧测试 */
export function materialPresets(themeId = 'warm') {
  return {...getTheme(themeId).materials};
}
