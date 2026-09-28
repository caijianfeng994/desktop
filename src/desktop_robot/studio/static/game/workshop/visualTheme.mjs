/**
 * 视觉主题包：温暖 / 机甲 / 废土 / 未来。
 * 仅表现层；不改变物理与蓝图语义。
 */

export const THEME_IDS = Object.freeze(['kit', 'toy', 'warm', 'mecha', 'wasteland', 'future']);

const THEMES = {
  kit: {
    id: 'kit',
    label: '装配舱',
    scene: {
      // 深蓝机库：环臂机械手装配舱氛围（参考图）
      background: 0x0c1219,
      fog: {color: 0x0c1219, near: 9, far: 30},
    },
    lights: {
      hemiSky: 0x8fb2d8, // 冷蓝天光
      hemiGround: 0x11161d,
      hemiIntensity: 0.8,
      sunColor: 0xdfe9f5, // 冷白顶光
      sunIntensity: 2.2,
      fillColor: 0x54d8ff, // 青色补光（呼应灯带）
      fillIntensity: 0.75,
    },
    env: {
      ground: {color: 0x10151c, roughness: 0.55, metalness: 0.55},
      wall: {color: 0x1a2028, roughness: 0.7, metalness: 0.2},
      door: {color: 0x2a323c, roughness: 0.5, metalness: 0.3},
      ramp: {color: 0x232a33, roughness: 0.75, metalness: 0.2},
      drawer: {color: 0x1e242c, roughness: 0.75, metalness: 0.2},
      receive: {color: 0x4ec8b0, roughness: 0.45, metalness: 0.25},
      block: {color: 0xe8722c, roughness: 0.5, metalness: 0.1},
      editorGround: {color: 0x161c24, roughness: 0.4, metalness: 0.5},
    },
    materials: {
      metal: {color: 0xc8ccd4, roughness: 0.32, metalness: 0.7},
      plastic: {color: 0xd9dbdf, roughness: 0.42, metalness: 0.15},
      rubber: {color: 0x26282e, roughness: 0.78, metalness: 0.1},
      accent: {color: 0xe8722c, roughness: 0.38, metalness: 0.15, emissive: 0x602800, emissiveIntensity: 0.3},
      tool: {color: 0x8a8f98, roughness: 0.4, metalness: 0.6, emissive: 0x20242a, emissiveIntensity: 0.15},
    },
    markers: {default: 0x9fd8ff, ok: 0x5adf9a, bad: 0xff6070},
  },
  toy: {
    id: 'toy',
    label: '玩具',
    scene: {
      // 蓝紫影棚氛围：深紫背景 + 微紫雾
      background: 0x23233c,
      fog: {color: 0x2a2a4a, near: 16, far: 52},
    },
    lights: {
      hemiSky: 0xb0b4e8, // 淡紫天光
      hemiGround: 0x3a3060,
      hemiIntensity: 1.35,
      sunColor: 0xffd9a8, // 暖色主灯
      sunIntensity: 2.4,
      fillColor: 0x8890e0, // 紫色补光
      fillIntensity: 0.7,
    },
    env: {
      ground: {color: 0x32324e, roughness: 0.8, metalness: 0.15},
      wall: {color: 0x3c3c60, roughness: 0.6, metalness: 0.2},
      door: {color: 0x5a5a8c, roughness: 0.45, metalness: 0.35},
      ramp: {color: 0x44446a, roughness: 0.7, metalness: 0.2},
      drawer: {color: 0x3a3a58, roughness: 0.7, metalness: 0.2},
      receive: {color: 0x4ec8b0, roughness: 0.45, metalness: 0.25},
      block: {color: 0xe8722c, roughness: 0.5, metalness: 0.1},
      editorGround: {color: 0x2c2c48, roughness: 0.75, metalness: 0.15},
    },
    materials: {
      // 奶白漆面 + 塑料感；金属度压低，clearcoat 在 partVisuals 里叠
      metal: {color: 0xd8d0c0, roughness: 0.4, metalness: 0.3},
      plastic: {color: 0xece3d0, roughness: 0.5, metalness: 0.05},
      rubber: {color: 0x3a3a40, roughness: 0.75, metalness: 0.08},
      accent: {color: 0xe8722c, roughness: 0.4, metalness: 0.1, emissive: 0x602800, emissiveIntensity: 0.35},
      tool: {color: 0xb0512e, roughness: 0.5, metalness: 0.2, emissive: 0x401408, emissiveIntensity: 0.2},
    },
    markers: {default: 0x9fd8ff, ok: 0x5adf9a, bad: 0xff6070},
  },
  warm: {
    id: 'warm',
    label: '温暖',
    scene: {
      background: 0xe8dac4,
      fog: null,
    },
    lights: {
      hemiSky: 0xfff7e5,
      hemiGround: 0x8c8977,
      hemiIntensity: 1.5,
      sunColor: 0xffe2ab,
      sunIntensity: 2.2,
      fillColor: 0xc8d8e0,
      fillIntensity: 0.35,
    },
    env: {
      ground: {color: 0xd4c4a8, roughness: 0.92, metalness: 0.02},
      wall: {color: 0xb8a888, roughness: 0.75, metalness: 0.05},
      door: {color: 0x6a8f88, roughness: 0.7, metalness: 0.08},
      ramp: {color: 0xc4a574, roughness: 0.82, metalness: 0.04},
      drawer: {color: 0x8a7460, roughness: 0.85, metalness: 0.05},
      receive: {color: 0x5a9e8a, roughness: 0.7, metalness: 0.05},
      block: {color: 0xd9893a, roughness: 0.7, metalness: 0.05},
      editorGround: {color: 0xd9cbb2, roughness: 0.9, metalness: 0.02},
    },
    materials: {
      metal: {color: 0x7a8a88, roughness: 0.35, metalness: 0.72},
      plastic: {color: 0xc9b896, roughness: 0.62, metalness: 0.08},
      rubber: {color: 0x3a3834, roughness: 0.92, metalness: 0.02},
      accent: {color: 0x477e7c, roughness: 0.4, metalness: 0.55, emissive: 0x000000, emissiveIntensity: 0},
      tool: {color: 0xb08968, roughness: 0.45, metalness: 0.35},
    },
    markers: {default: 0x62e9de, ok: 0x4caf7a, bad: 0xb07060},
  },
  mecha: {
    id: 'mecha',
    label: '机甲',
    scene: {
      background: 0x0f1c24,
      fog: {color: 0x0e242c, near: 14, far: 48},
    },
    lights: {
      hemiSky: 0xa0e8f0,
      hemiGround: 0x2a4048,
      hemiIntensity: 1.55,
      sunColor: 0xd8f4f8,
      sunIntensity: 2.4,
      fillColor: 0x40c8d0,
      fillIntensity: 0.85,
    },
    env: {
      ground: {color: 0x243038, roughness: 0.78, metalness: 0.35},
      wall: {color: 0x2e3c44, roughness: 0.55, metalness: 0.45},
      door: {color: 0x2a6a72, roughness: 0.4, metalness: 0.55},
      ramp: {color: 0x3a4c54, roughness: 0.65, metalness: 0.4},
      drawer: {color: 0x334048, roughness: 0.7, metalness: 0.3},
      receive: {color: 0x1ec8c0, roughness: 0.45, metalness: 0.35},
      block: {color: 0xff6a3d, roughness: 0.45, metalness: 0.25},
      editorGround: {color: 0x1e3038, roughness: 0.7, metalness: 0.25},
    },
    materials: {
      // 偏亮，避免深色主题下机体“消失”
      metal: {color: 0xc0d4dc, roughness: 0.28, metalness: 0.75},
      plastic: {color: 0x6a7e88, roughness: 0.5, metalness: 0.22},
      rubber: {color: 0x2a3034, roughness: 0.88, metalness: 0.05},
      accent: {color: 0x4af0e0, roughness: 0.3, metalness: 0.65, emissive: 0x1a8078, emissiveIntensity: 0.75},
      tool: {color: 0x70e8f0, roughness: 0.35, metalness: 0.55, emissive: 0x106068, emissiveIntensity: 0.45},
    },
    markers: {default: 0x3ef0e0, ok: 0x2ee6a8, bad: 0xff5570},
  },
  wasteland: {
    id: 'wasteland',
    label: '废土',
    scene: {
      background: 0x2a2218,
      fog: {color: 0x6a5538, near: 10, far: 42},
    },
    lights: {
      hemiSky: 0xe0c090,
      hemiGround: 0x4a3828,
      hemiIntensity: 0.95,
      sunColor: 0xffc878,
      sunIntensity: 1.8,
    },
    env: {
      ground: {color: 0x5a4630, roughness: 0.95, metalness: 0.08},
      wall: {color: 0x6a5240, roughness: 0.88, metalness: 0.15},
      door: {color: 0x8a3028, roughness: 0.7, metalness: 0.25},
      ramp: {color: 0x7a5a38, roughness: 0.9, metalness: 0.12},
      drawer: {color: 0x5a4030, roughness: 0.9, metalness: 0.1},
      receive: {color: 0xb84828, roughness: 0.65, metalness: 0.2},
      block: {color: 0xd07030, roughness: 0.75, metalness: 0.15},
      editorGround: {color: 0x4a3828, roughness: 0.93, metalness: 0.1},
    },
    materials: {
      metal: {color: 0xa07048, roughness: 0.62, metalness: 0.55},
      plastic: {color: 0x8a6a48, roughness: 0.78, metalness: 0.12},
      rubber: {color: 0x2a2218, roughness: 0.95, metalness: 0.02},
      accent: {color: 0xc45a28, roughness: 0.5, metalness: 0.4, emissive: 0x401808, emissiveIntensity: 0.25},
      tool: {color: 0xc88840, roughness: 0.55, metalness: 0.4, emissive: 0x301808, emissiveIntensity: 0.15},
    },
    markers: {default: 0xf0a050, ok: 0xc8d060, bad: 0xd04030},
  },
  future: {
    id: 'future',
    label: '未来',
    scene: {
      background: 0x1a1e24,
      fog: {color: 0x222830, near: 14, far: 48},
    },
    lights: {
      hemiSky: 0xd8e4ec,
      hemiGround: 0x3a424c,
      hemiIntensity: 1.05,
      sunColor: 0xe8f0f4,
      sunIntensity: 1.9,
    },
    env: {
      ground: {color: 0x2a3038, roughness: 0.7, metalness: 0.28},
      wall: {color: 0x3a424c, roughness: 0.55, metalness: 0.35},
      door: {color: 0x4a8078, roughness: 0.45, metalness: 0.4},
      ramp: {color: 0x364048, roughness: 0.6, metalness: 0.3},
      drawer: {color: 0x323840, roughness: 0.65, metalness: 0.25},
      receive: {color: 0x3ab89a, roughness: 0.5, metalness: 0.3},
      block: {color: 0x5a9ec8, roughness: 0.45, metalness: 0.3},
      editorGround: {color: 0x242a32, roughness: 0.68, metalness: 0.25},
    },
    materials: {
      metal: {color: 0x9aa8b0, roughness: 0.32, metalness: 0.78},
      plastic: {color: 0x5a6670, roughness: 0.55, metalness: 0.18},
      rubber: {color: 0x2a2e32, roughness: 0.88, metalness: 0.06},
      accent: {color: 0x4ec8b0, roughness: 0.38, metalness: 0.5, emissive: 0x0a3028, emissiveIntensity: 0.22},
      tool: {color: 0x70b8c8, roughness: 0.4, metalness: 0.45, emissive: 0x082028, emissiveIntensity: 0.12},
    },
    markers: {default: 0x60e0c8, ok: 0x50d090, bad: 0xe06070},
  },
};

/**
 * @param {unknown} id
 * @returns {'warm'|'mecha'|'wasteland'|'future'}
 */
export function normalizeThemeId(id) {
  const s = String(id || '').trim().toLowerCase();
  if (THEME_IDS.includes(s)) return /** @type {'warm'|'mecha'|'wasteland'|'future'} */ (s);
  return 'warm';
}

/**
 * @param {unknown} id
 */
export function getTheme(id) {
  return THEMES[normalizeThemeId(id)];
}

export function listThemes() {
  return THEME_IDS.map((id) => ({id, label: THEMES[id].label}));
}

/**
 * 低画质时弱化雾与发光。
 * @param {ReturnType<typeof getTheme>} theme
 * @param {'high'|'low'} [quality]
 */
export function themeForQuality(theme, quality = 'high') {
  if (quality !== 'low') return theme;
  return {
    ...theme,
    scene: {
      ...theme.scene,
      fog: theme.scene.fog
        ? {color: theme.scene.fog.color, near: theme.scene.fog.near * 1.6, far: theme.scene.fog.far * 1.8}
        : null,
    },
    materials: Object.fromEntries(
      Object.entries(theme.materials).map(([k, v]) => [
        k,
        {...v, emissiveIntensity: Math.min(0.08, v.emissiveIntensity || 0)},
      ]),
    ),
  };
}

export function themeStorageKey() {
  return 'gameVisualThemeV2';
}
