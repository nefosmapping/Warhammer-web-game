// Атмосферное небо войны: процедурный купол с шейдерными тучами,
// клубами дыма и тусклым солнцем, пробивающимся сквозь гарь.
// Купол следует за камерой, поэтому небо «бесконечно» на любом уровне.

import * as THREE from 'three';

const vertexShader = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  varying vec3 vDir;

  uniform float uTime;
  uniform vec3 uTopColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uCloudColor;
  uniform vec3 uCloudDark;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uSunIntensity;
  uniform float uSmoke;

  // Дешёвый value-noise + fbm: тучи без текстур и внешних ассетов.
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);
    return mix(nxy0, nxy1, f.z);
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i += 1) {
      value += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

    // Базовый градиент: тёмная высь, мутный горизонт.
    vec3 sky = mix(uHorizonColor, uTopColor, smoothstep(0.02, 0.78, height));

    // Два слоя облаков: крупные тучи и медленно ползущий дым.
    vec3 cloudP = dir * 3.2 + vec3(uTime * 0.018, uTime * 0.006, uTime * 0.011);
    float clouds = fbm(cloudP * 1.7);

    vec3 smokeP = vec3(
      dir.x * 1.45 + uTime * 0.022,
      dir.y * 2.4 + uTime * 0.004,
      dir.z * 1.45 + uTime * 0.017
    );
    float smoke = fbm(smokeP);

    float coverage = smoothstep(0.36, 0.84, clouds * 0.72 + smoke * 0.55);
    // Ближе к горизонту дым плотнее: война, гарь, пыль.
    coverage = clamp(coverage + (1.0 - smoothstep(0.05, 0.55, height)) * 0.22, 0.0, 1.0);

    vec3 cloudColor = mix(uCloudDark, uCloudColor, smoothstep(0.38, 0.88, clouds));
    sky = mix(sky, cloudColor, coverage * 0.92 * uSmoke);

    // Тусклый солнечный диск и ореол сквозь дым.
    vec3 sunDir = normalize(uSunDirection);
    float sunDot = clamp(dot(dir, sunDir), 0.0, 1.0);
    float disc = smoothstep(0.9982, 0.9995, sunDot);
    float halo = pow(sunDot, 22.0);
    float haze = pow(sunDot, 4.0);
    float smokeMask = 1.0 - coverage * 0.75;

    sky += uSunColor * disc * 1.8 * uSunIntensity * smokeMask;
    sky += uSunColor * halo * 0.35 * uSunIntensity;
    sky += uSunColor * haze * 0.08 * uSunIntensity;

    gl_FragColor = vec4(sky, 1.0);
  }
`;

export class SkyDome {
  constructor({ scene, radius = 160 }) {
    this.scene = scene;
    this.radius = radius;
    this.time = 0;

    this.uniforms = {
      uTime: { value: 0 },
      uTopColor: { value: new THREE.Color(0x07090c) },
      uHorizonColor: { value: new THREE.Color(0x2a2f2a) },
      uCloudColor: { value: new THREE.Color(0x555a55) },
      uCloudDark: { value: new THREE.Color(0x14171a) },
      uSunColor: { value: new THREE.Color(0xd8d08a) },
      uSunDirection: { value: new THREE.Vector3(0.6, 0.55, -0.4).normalize() },
      uSunIntensity: { value: 1.0 },
      uSmoke: { value: 1.0 }
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 28), this.material);
    this.mesh.name = 'sky-dome';
    this.mesh.frustumCulled = false;
    // Небо рисуется первым, поверх него — весь мир.
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);

    // Визуальный диск солнца: два billboard-круга (ядро + ореол).
    this.sunGroup = new THREE.Group();
    this.sunGroup.name = 'sky-sun';

    this.sunCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe9b8,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false
    });
    this.sunCore = new THREE.Mesh(new THREE.CircleGeometry(5.2, 32), this.sunCoreMaterial);
    this.sunCore.renderOrder = -999;

    this.sunHaloMaterial = new THREE.MeshBasicMaterial({
      color: 0xffcf80,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false
    });
    this.sunHalo = new THREE.Mesh(new THREE.CircleGeometry(15, 32), this.sunHaloMaterial);
    this.sunHalo.position.z = -0.1;
    this.sunHalo.renderOrder = -999;

    this.sunGroup.add(this.sunHalo, this.sunCore);
    scene.add(this.sunGroup);

    // Мягкий направленный свет «сквозь дым». Теней не отбрасывает:
    // каскадные тени уже ведёт LightingSystem по world.sun.
    this.sunLight = new THREE.DirectionalLight(0xffe2b0, 0.25);
    this.sunLight.name = 'sky-sun-light';
    this.sunLight.castShadow = false;
    scene.add(this.sunLight);
    this.sunLight.target.position.set(0, 0, 0);
    scene.add(this.sunLight.target);

    this.sunDirection = new THREE.Vector3(0.6, 0.55, -0.4).normalize();
  }

  // Настраивает палитру неба под тему уровня.
  setTheme(theme) {
    if (!theme) return;

    const base = new THREE.Color(theme.background ?? 0x10120f);
    const fog = new THREE.Color(theme.fog?.color ?? 0x1a1c18);
    const sunColor = new THREE.Color(theme.sun?.color ?? 0xd8d08a);

    // Верх — почти чёрная гарь, горизонт — мутный дым.
    this.uniforms.uTopColor.value.copy(base).multiplyScalar(0.35).lerp(
      new THREE.Color(0x05070a),
      0.55
    );
    this.uniforms.uHorizonColor.value.copy(fog).lerp(base, 0.35);

    // Тучи серо-коричневые, с тёмной нижней кромкой.
    this.uniforms.uCloudColor.value.copy(fog).lerp(new THREE.Color(0x5a5850), 0.4);
    this.uniforms.uCloudDark.value.copy(base).multiplyScalar(0.4).lerp(
      new THREE.Color(0x101215),
      0.5
    );

    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uSunIntensity.value = Math.max(0.45, theme.sun?.intensity ?? 1);

    const position = theme.sun?.position ?? [18, 26, 12];
    this.sunDirection.set(position[0], position[1], position[2]).normalize();
    this.uniforms.uSunDirection.value.copy(this.sunDirection);

    this.sunLight.color.copy(sunColor);
    this.sunLight.position.set(position[0], position[1], position[2]);
    this.sunLight.intensity = 0.18 + (theme.sun?.intensity ?? 1) * 0.08;

    this.sunCoreMaterial.color.copy(sunColor).lerp(new THREE.Color(0xffffff), 0.35);
    this.sunHaloMaterial.color.copy(sunColor);
  }

  update(dt, camera) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;

    if (!camera) return;

    // Купол и солнце всегда вокруг камеры — небо не имеет границ.
    this.mesh.position.copy(camera.position);

    const distance = this.radius * 0.92;
    this.sunGroup.position.copy(camera.position).addScaledVector(
      this.sunDirection,
      distance
    );
    this.sunGroup.lookAt(camera.position);
    // Небольшая пульсация гари.
    const pulse = 0.96 + Math.sin(this.time * 0.6) * 0.04;
    this.sunCore.scale.setScalar(pulse);
    this.sunHalo.scale.setScalar(0.96 + Math.sin(this.time * 0.35) * 0.06);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.sunGroup);
    this.scene.remove(this.sunLight);
    this.scene.remove(this.sunLight.target);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.sunCore.geometry.dispose();
    this.sunCoreMaterial.dispose();
    this.sunHalo.geometry.dispose();
    this.sunHaloMaterial.dispose();
  }
}
