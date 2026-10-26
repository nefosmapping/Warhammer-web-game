// Постобработка: SSAO (затенение в щелях) → UnrealBloomPass (сдержанный)
// → OutputPass (тонмаппинг/цвет) → FXAA (дешёвый антиалиасинг).
//
// ВАЖНО: SSAOPass в режиме OUTPUT.Default берёт готовую картинку из
// readBuffer, поэтому перед ним обязателен RenderPass. Кроме того, SSAOPass
// сам рендерит нормали сцены через overrideMaterial — это ещё один полный
// проход сцены. Поэтому пасс создаётся только при enableSSAO.
//
// Параметры SSAO/Bloom вынесены в CONFIG.render.ssao и CONFIG.render.bloom.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { CONFIG } from './config.js';

export class PostProcessing {
  constructor({
    renderer,
    scene,
    camera,
    enableSSAO = true,
    enableBloom = true,
    enableFXAA = CONFIG.render.fxaa
  }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;

    const size = renderer.getSize(new THREE.Vector2());
    this.width = Math.max(1, size.x);
    this.height = Math.max(1, size.y);

    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(renderer.getPixelRatio());

    // RenderPass нужен и как источник картинки для SSAOPass,
    // и как база цепочки, когда SSAO отключён.
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.ssaoPass = null;
    if (enableSSAO) {
      const ssao = CONFIG.render.ssao;
      this.ssaoPass = new SSAOPass(scene, camera, this.width, this.height);
      this.ssaoPass.kernelRadius = ssao.kernelRadius;
      this.ssaoPass.minDistance = ssao.minDistance;
      this.ssaoPass.maxDistance = ssao.maxDistance;
      this.composer.addPass(this.ssaoPass);
    }

    this.bloomPass = null;
    if (enableBloom) {
      const bloom = CONFIG.render.bloom;
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(this.width, this.height),
        bloom.strength,
        bloom.radius,
        bloom.threshold
      );
      this.composer.addPass(this.bloomPass);
    }

    // Обязательный финальный пасс: тонмаппинг и цветовое пространство.
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.fxaaPass = null;
    if (enableFXAA) {
      this.fxaaPass = new ShaderPass(FXAAShader);
      this.composer.addPass(this.fxaaPass);
    }

    this.useSSAO = Boolean(this.ssaoPass);
    this.useBloom = Boolean(this.bloomPass);
    this.useFXAA = Boolean(this.fxaaPass);

    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);

    const pixelRatio = this.renderer.getPixelRatio();

    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(this.width, this.height);

    this.ssaoPass?.setSize(this.width, this.height);
    this.bloomPass?.setSize(this.width, this.height);

    if (this.fxaaPass) {
      this.fxaaPass.material.uniforms.resolution.value.set(
        1 / (this.width * pixelRatio),
        1 / (this.height * pixelRatio)
      );
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  render(dt) {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render(dt);
  }

  dispose() {
    this.ssaoPass?.dispose();
    this.bloomPass?.dispose();
    this.outputPass?.dispose();
    this.fxaaPass?.dispose();
    this.renderPass?.dispose();
    this.composer.dispose();

    this.ssaoPass = null;
    this.bloomPass = null;
    this.outputPass = null;
    this.fxaaPass = null;
    this.renderPass = null;
    this.composer = null;
  }
}
