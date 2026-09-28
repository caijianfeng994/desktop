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
 * 用一张竖向渐变生成「蓝紫影棚」环境贴图：顶部淡紫天光、中部冷紫墙面、
 * 一条暖色灯带（实用灯）与冷紫地面对比，让漆面 clearcoat 拿到方向性反射，
 * 不依赖任何外部 HDR 资产。
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
    g.addColorStop(0, '#b0b4e8'); // 淡紫天光
    g.addColorStop(0.42, '#5a5a9a'); // 冷紫墙面
    g.addColorStop(0.55, '#3a3a68');
    g.addColorStop(0.7, '#2a2a4a');
    g.addColorStop(1, '#202038'); // 深紫地面
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    // 暖色实用灯（主光方向性反射）
    ctx.fillStyle = 'rgba(255,214,160,0.95)';
    for (const x of [110, 400]) {
      ctx.beginPath();
      ctx.ellipse(x, 118, 40, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 冷紫色补光带
    ctx.fillStyle = 'rgba(150,160,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(256, 140, 70, 18, 0, 0, Math.PI * 2);
    ctx.fill();
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
