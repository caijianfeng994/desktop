/**
 * 渲染特效层：环境反射（PMREM，零外部依赖）与可选 Bloom（EffectComposer）。
 * 任何一步失败都回退到「直接渲染」，绝不让画面变黑或抛错。
 */
import * as THREE from 'three';
import {EffectComposer} from '../vendor/three/postprocessing/EffectComposer.js';
import {RenderPass} from '../vendor/three/postprocessing/RenderPass.js';
import {UnrealBloomPass} from '../vendor/three/postprocessing/UnrealBloomPass.js';
import {OutputPass} from '../vendor/three/postprocessing/OutputPass.js';

/**
 * 用一张竖向渐变（顶部偏亮、底部偏暗、中部一条高光带）生成环境贴图，
 * 让金属/装甲件获得可信的反射，而不依赖任何外部 HDR 资产。
 * @param {THREE.WebGLRenderer} renderer
 * @returns {THREE.Texture|null}
 */
export function buildEnvironment(renderer) {
  try {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#bcd4dc'); // 天顶
    g.addColorStop(0.45, '#5d7e88');
    g.addColorStop(0.55, '#e7f6ff'); // 高光带（灯）
    g.addColorStop(0.7, '#2b3c44');
    g.addColorStop(1, '#101a1f'); // 地面
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    // 几束「灯」增强方向性反射
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (const x of [90, 256, 420]) {
      ctx.beginPath();
      ctx.ellipse(x, 130, 34, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
    return env;
  } catch (e) {
    console.warn('[renderFx] buildEnvironment failed, skipping env map', e);
    return null;
  }
}

/**
 * 创建带 Bloom 的合成器；低画质或任何异常时返回 null（调用方回退直渲）。
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {{strength?:number, radius?:number, threshold?:number}} [opts]
 */
export function createBloomComposer(renderer, scene, camera, opts = {}) {
  try {
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new THREE.Vector2());
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x || 1, size.y || 1),
      opts.strength ?? 0.55,
      opts.radius ?? 0.6,
      opts.threshold ?? 0.78,
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return {composer, bloom};
  } catch (e) {
    console.warn('[renderFx] createBloomComposer failed, falling back to direct render', e);
    return null;
  }
}
