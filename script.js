import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

document.documentElement.classList.add('js');

const CONFIG = {
  model: {
    finalGlb: './assets/models/kombi-orange-final.glb',
    macroStages: [2, 45, 95, 155, 220, 285, 345, 399]
  },
  buildDescriptions: [
    'Etapa de montagem 0 de 7. Apenas as primeiras peças estão visíveis.',
    'Etapa de montagem 1 de 7. A base e a estrutura inferior começaram a surgir.',
    'Etapa de montagem 2 de 7. O piso e o chassi estão em construção.',
    'Etapa de montagem 3 de 7. Rodas e primeiras partes da carroceria estão visíveis.',
    'Etapa de montagem 4 de 7. A frente e as laterais do veículo tomam forma.',
    'Etapa de montagem 5 de 7. Janelas, interior e carroceria avançada estão montados.',
    'Etapa de montagem 6 de 7. Teto e detalhes finais estão quase completos.',
    'Etapa de montagem 7 de 7. A Kombi laranja e branca está completamente montada.'
  ]
};

const scenes = [...document.querySelectorAll('.scene')];
const state = { scene: 0, reveal: 0, build: -1, direction: 1, reducedMotion: false };
const ui = {
  prev: document.querySelector('#previous-button'),
  next: document.querySelector('#next-button'),
  sceneProgress: document.querySelector('#scene-progress'),
  progressBar: document.querySelector('#progress-bar'),
  buildProgress: document.querySelector('#build-progress'),
  announcer: document.querySelector('#scene-announcer'),
  modelDescription: document.querySelector('#model-description'),
  restart: document.querySelector('#restart-button'),
  audio: document.querySelector('#background-music'),
  audioToggle: document.querySelector('#audio-toggle'),
  audioVolume: document.querySelector('#audio-volume'),
  modelReset: document.querySelector('#model-reset')
};

let renderer;
let scene3D;
let camera;
let modelRoot;
let modelSteps = [];
let renderFrame = 0;
let transitionToken = 0;
let rotationFrame = 0;
let resizeObserver;
const modelRotation = { x: -0.08, y: -0.58, userControlled: false };

bootstrap();

async function bootstrap() {
  await populateContent();
  initPresentation();
  initThree();
}

async function populateContent() {
  try {
    const response = await fetch('./content.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const content = await response.json();

    document.querySelectorAll('[data-content]').forEach(element => {
      const value = element.dataset.content.split('.').reduce((current, key) => current?.[key], content);
      if (value !== undefined && value !== null) element.textContent = String(value);
    });
  } catch (error) {
    console.warn('Não foi possível carregar content.json; usando os placeholders do HTML.', error);
  }
}

function initPresentation() {
  state.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  scenes.forEach(scene => {
    scene.querySelectorAll('[data-step]').forEach((item, index) => item.dataset.stepIndex = String(index + 1));
  });

  ui.prev.addEventListener('click', previous);
  ui.next.addEventListener('click', next);
  ui.restart.addEventListener('click', restartPresentation);
  document.addEventListener('keydown', onKeyDown);
  initAudio();
  showScene(0, false);
}

function showScene(index, announce = true) {
  state.scene = Math.max(0, Math.min(index, scenes.length - 1));
  const active = scenes[state.scene];

  scenes.forEach((scene, sceneIndex) => {
    const isActive = sceneIndex === state.scene;
    scene.classList.toggle('is-active', isActive);
    scene.hidden = !isActive;
    scene.setAttribute('aria-hidden', String(!isActive));
    if (!isActive) resetReveals(scene);
  });

  state.reveal = 0;
  updateReveals(active);
  setBuildStage(Number(active.dataset.buildStage || 0), state.direction > 0);
  updateProgress();

  document.body.classList.toggle('final-model', state.scene === 7);
  document.body.classList.toggle('summary-model', state.scene === 8);
  requestRender();

  if (announce) {
    const title = active.querySelector('h1,h2')?.textContent.replace(/\s+/g, ' ').trim() || '';
    ui.announcer.textContent = `Cena ${state.scene + 1} de ${scenes.length}. ${title}. ${CONFIG.buildDescriptions[Number(active.dataset.buildStage || 0)]}`;
    active.querySelector('h1,h2')?.focus?.({ preventScroll: true });
  }
}

function updateReveals(scene) {
  scene.querySelectorAll('[data-step]').forEach((item, index) => {
    item.classList.toggle('is-revealed', index < state.reveal);
    item.setAttribute('aria-hidden', String(index >= state.reveal));
  });
}

function resetReveals(scene) {
  scene.querySelectorAll('[data-step]').forEach(item => item.classList.remove('is-revealed'));
}

function next() {
  const active = scenes[state.scene];
  const reveals = active.querySelectorAll('[data-step]');
  if (state.reveal < reveals.length) {
    state.reveal += 1;
    updateReveals(active);
    updateProgress();
    ui.announcer.textContent = `Informação adicional ${state.reveal} de ${reveals.length}.`;
    return;
  }
  if (state.scene < scenes.length - 1) {
    state.direction = 1;
    showScene(state.scene + 1);
  }
}

function previous() {
  const active = scenes[state.scene];
  if (state.reveal > 0) {
    state.reveal -= 1;
    updateReveals(active);
    updateProgress();
    return;
  }
  if (state.scene > 0) {
    state.direction = -1;
    showScene(state.scene - 1);
    const previousReveals = scenes[state.scene].querySelectorAll('[data-step]');
    state.reveal = previousReveals.length;
    updateReveals(scenes[state.scene]);
    updateProgress();
  }
}

function restartPresentation() {
  state.direction = -1;
  showScene(0);
  resetModelView(true);
  window.location.hash = 'scene-0';
}

function updateProgress() {
  const current = String(state.scene + 1).padStart(2, '0');
  const total = String(scenes.length).padStart(2, '0');
  ui.sceneProgress.textContent = `${current} / ${total}`;
  ui.progressBar.style.width = `${((state.scene + 1) / scenes.length) * 100}%`;
  ui.prev.disabled = state.scene === 0 && state.reveal === 0;
  ui.next.disabled = state.scene === scenes.length - 1 && state.reveal >= scenes[state.scene].querySelectorAll('[data-step]').length;
  window.history.replaceState(null, '', `#scene-${state.scene}`);
}

function onKeyDown(event) {
  if (event.target.matches('button,input,a')) return;
  if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') { event.preventDefault(); next(); }
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); previous(); }
  if (event.key === 'Home') { event.preventDefault(); state.direction = -1; showScene(0); }
  if (event.key === 'End') { event.preventDefault(); state.direction = 1; showScene(scenes.length - 1); }
}

function initAudio() {
  const savedVolumeValue = localStorage.getItem('sprint-build:volume');
  const savedVolume = savedVolumeValue === null ? NaN : Number(savedVolumeValue);
  const savedMuted = localStorage.getItem('sprint-build:muted');
  ui.audio.volume = Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1 ? savedVolume : 0.05;
  ui.audio.muted = savedMuted === 'true';
  ui.audioVolume.value = String(ui.audio.volume);
  updateAudioControl();

  const startAfterInteraction = event => {
    if (event.target.closest?.('.audio-controls') || ui.audio.muted) return;
    playAudio();
    document.removeEventListener('pointerdown', startAfterInteraction, true);
    document.removeEventListener('keydown', startAfterInteraction, true);
  };

  document.addEventListener('pointerdown', startAfterInteraction, true);
  document.addEventListener('keydown', startAfterInteraction, true);

  ui.audioToggle.addEventListener('click', async () => {
    if (ui.audio.paused) {
      ui.audio.muted = false;
      await playAudio();
    } else {
      ui.audio.muted = !ui.audio.muted;
    }
    localStorage.setItem('sprint-build:muted', String(ui.audio.muted));
    updateAudioControl();
  });

  ui.audioVolume.addEventListener('input', () => {
    ui.audio.volume = Number(ui.audioVolume.value);
    ui.audio.muted = ui.audio.volume === 0;
    localStorage.setItem('sprint-build:volume', String(ui.audio.volume));
    localStorage.setItem('sprint-build:muted', String(ui.audio.muted));
    if (ui.audio.paused && ui.audio.volume > 0) playAudio();
    updateAudioControl();
  });
}

async function playAudio() {
  try {
    await ui.audio.play();
  } catch (_) {
    // O navegador libera a reprodução na próxima interação explícita do usuário.
  }
  updateAudioControl();
}

function updateAudioControl() {
  const silent = ui.audio.muted || ui.audio.volume === 0 || ui.audio.paused;
  ui.audioToggle.setAttribute('aria-pressed', String(silent));
  ui.audioToggle.setAttribute('aria-label', ui.audio.paused ? 'Ativar música' : silent ? 'Desmutar música' : 'Mutar música');
}

function initThree() {
  const container = document.querySelector('#model-canvas');
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    scene3D = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
    scene3D.add(new THREE.HemisphereLight(0xf2fbff, 0x62747a, 0.62));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(-5, 8, 6);
    scene3D.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffd6a3, 0.55);
    fillLight.position.set(6, 2, 4);
    scene3D.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0x8bdcff, 0.78);
    rimLight.position.set(-4, 5, -6);
    scene3D.add(rimLight);

    resizeObserver = new ResizeObserver(resizeRenderer);
    resizeObserver.observe(container);
    initModelControls(container);
    loadKombi();
  } catch (error) {
    showModelError(error);
  }
}

function loadKombi() {
  const gltfLoader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('./vendor/three/addons/libs/draco/');
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.load(CONFIG.model.finalGlb, gltf => prepareModel(gltf.scene), undefined, showModelError);
}

function prepareModel(object) {
  modelRoot = new THREE.Group();
  modelRoot.add(object);
  scene3D.add(modelRoot);

  recolorBody(object);
  modelSteps = inspectBuildingSteps(object);
  centerAndFrameModel(object);

  document.querySelector('#model-status').hidden = true;
  state.build = -1;
  setBuildStage(Number(scenes[state.scene].dataset.buildStage || 0), false);
  requestRender();
}

function inspectBuildingSteps(object) {
  const steps = [];
  object.traverse(node => {
    const match = /^step_(\d+)$/i.exec(node.name || '');
    if (!match) return;
    const step = Number(match[1]);
    node.userData.buildingStep = step;
    node.userData.finalPosition = node.position.clone();
    steps.push({ step, object: node });
  });
  steps.sort((a, b) => a.step - b.step);
  return steps;
}

function recolorBody(object) {
  object.traverse(node => {
    if (!node.isMesh || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const mapped = materials.map(material => {
      const clone = material.clone();
      let looksRed = false;
      if (clone.color) {
        const hsl = {};
        clone.color.getHSL(hsl);
        looksRed = (hsl.h < 0.055 || hsl.h > 0.95) && hsl.s > 0.38 && hsl.l < 0.72;
        if (looksRed) {
          clone.color.set('#ff8a00');
        }
      }
      if (!clone.transparent && clone.opacity >= 0.99) {
        return new THREE.MeshLambertMaterial({
          name: clone.name,
          color: clone.color,
          map: clone.map,
          side: clone.side,
          alphaTest: clone.alphaTest,
          depthWrite: clone.depthWrite,
          depthTest: clone.depthTest,
          vertexColors: clone.vertexColors,
          emissive: looksRed ? 0x3a1200 : 0x000000,
          emissiveIntensity: looksRed ? 0.18 : 0
        });
      }
      clone.roughness = 0.88;
      clone.metalness = 0;
      clone.envMapIntensity = 0;
      if ('clearcoat' in clone) clone.clearcoat = 0;
      return clone;
    });
    node.material = Array.isArray(node.material) ? mapped : mapped[0];
  });
}

function centerAndFrameModel(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  object.position.sub(center);
  const radius = Math.max(size.x, size.y, size.z) * .5 || 1;
  modelRoot.userData.radius = radius;
  modelRotation.x = -0.08;
  modelRotation.y = -0.58;
  modelRotation.userControlled = false;
  applyModelRotation();
  camera.position.set(radius * 2.15, radius * 1.4, radius * 2.65);
  camera.lookAt(0, 0, 0);
  camera.near = Math.max(radius / 100, .001);
  camera.far = radius * 20;
  camera.updateProjectionMatrix();
}

function setBuildStage(stage, animate = true) {
  stage = Math.max(0, Math.min(7, stage));
  ui.buildProgress.textContent = `${String(stage).padStart(2, '0')} / 07`;
  ui.modelDescription.textContent = CONFIG.buildDescriptions[stage];
  if (!modelRoot || !modelSteps.length) { state.build = stage; return; }

  const previousThreshold = state.build >= 0 ? CONFIG.model.macroStages[state.build] : -1;
  const threshold = CONFIG.model.macroStages[stage];
  const forward = stage > state.build;
  state.build = stage;

  stopBuildTransition();
  modelSteps.forEach(entry => {
    const visible = entry.step <= threshold;
    entry.object.visible = visible;
    entry.object.position.copy(entry.object.userData.finalPosition);
  });

  const shouldAnimate = animate && forward && !state.reducedMotion;
  const incoming = shouldAnimate ? modelSteps.filter(entry => entry.step > previousThreshold && entry.step <= threshold) : [];
  const targetRotation = modelRotation.userControlled ? modelRotation.y : (state.scene === 7 ? -0.25 : -0.58);
  if (!incoming.length) {
    modelRotation.y = targetRotation;
    applyModelRotation();
    return requestRender();
  }

  incoming.forEach((entry, index) => {
    entry.object.position.y += modelRoot.userData.radius * .28;
    entry.object.userData.dropDelay = (index % 3) * 65;
  });

  const token = ++transitionToken;
  const started = performance.now();
  const duration = 560;
  const startRotation = modelRotation.y;
  const tick = now => {
    if (token !== transitionToken) return;
    let active = false;
    incoming.forEach(entry => {
      const local = Math.max(0, Math.min(1, (now - started - entry.object.userData.dropDelay) / duration));
      const eased = 1 - Math.pow(1 - local, 4);
      entry.object.position.y = entry.object.userData.finalPosition.y + modelRoot.userData.radius * .28 * (1 - eased);
      active ||= local < 1;
    });
    const cameraProgress = Math.max(0, Math.min(1, (now - started) / duration));
    const cameraEase = cameraProgress * cameraProgress * (3 - 2 * cameraProgress);
    modelRotation.y = THREE.MathUtils.lerp(startRotation, targetRotation, cameraEase);
    applyModelRotation();
    render();
    if (!active) {
      incoming.forEach(entry => entry.object.position.copy(entry.object.userData.finalPosition));
      modelRotation.y = targetRotation;
      applyModelRotation();
      renderer.setAnimationLoop(null);
      render();
    }
  };
  renderer.setAnimationLoop(tick);
}

function stopBuildTransition() {
  transitionToken += 1;
  renderer?.setAnimationLoop(null);
}

function initModelControls(container) {
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;

  container.addEventListener('pointerdown', event => {
    if (event.button !== undefined && event.button !== 0) return;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    container.setPointerCapture?.(pointerId);
    container.parentElement.classList.add('is-dragging');
    event.stopPropagation();
  });

  container.addEventListener('pointermove', event => {
    if (pointerId !== event.pointerId || !modelRoot) return;
    const deltaX = event.clientX - lastX;
    const deltaY = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    modelRotation.y += deltaX * 0.008;
    modelRotation.x = THREE.MathUtils.clamp(modelRotation.x + deltaY * 0.005, -0.38, 0.22);
    modelRotation.userControlled = true;
    applyModelRotation();
    requestRender();
    event.preventDefault();
    event.stopPropagation();
  });

  const endDrag = event => {
    if (pointerId !== event.pointerId) return;
    container.releasePointerCapture?.(pointerId);
    pointerId = null;
    container.parentElement.classList.remove('is-dragging');
    event.stopPropagation();
  };
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);

  container.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !modelRoot) return;
    if (event.key === 'ArrowLeft') modelRotation.y -= 0.12;
    if (event.key === 'ArrowRight') modelRotation.y += 0.12;
    if (event.key === 'ArrowUp') modelRotation.x = THREE.MathUtils.clamp(modelRotation.x - 0.08, -0.38, 0.22);
    if (event.key === 'ArrowDown') modelRotation.x = THREE.MathUtils.clamp(modelRotation.x + 0.08, -0.38, 0.22);
    modelRotation.userControlled = true;
    applyModelRotation();
    requestRender();
    event.preventDefault();
    event.stopPropagation();
  });

  ui.modelReset.addEventListener('click', event => {
    event.stopPropagation();
    resetModelView(true);
  });
}

function applyModelRotation() {
  if (!modelRoot) return;
  modelRoot.rotation.set(modelRotation.x, modelRotation.y, 0.02);
}

function resetModelView(animate = false) {
  if (!modelRoot) return;
  cancelAnimationFrame(rotationFrame);
  modelRotation.userControlled = false;
  const targetX = -0.08;
  const targetY = state.scene === 7 ? -0.25 : -0.58;
  if (!animate || state.reducedMotion) {
    modelRotation.x = targetX;
    modelRotation.y = targetY;
    applyModelRotation();
    return requestRender();
  }
  const startX = modelRotation.x;
  const startY = modelRotation.y;
  const started = performance.now();
  const tick = now => {
    const progress = Math.min(1, (now - started) / 320);
    const eased = progress * progress * (3 - 2 * progress);
    modelRotation.x = THREE.MathUtils.lerp(startX, targetX, eased);
    modelRotation.y = THREE.MathUtils.lerp(startY, targetY, eased);
    applyModelRotation();
    render();
    if (progress < 1) rotationFrame = requestAnimationFrame(tick);
  };
  rotationFrame = requestAnimationFrame(tick);
}

function resizeRenderer() {
  if (!renderer || !camera) return;
  const container = renderer.domElement.parentElement;
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const needsResize = renderer.domElement.width !== Math.floor(width * renderer.getPixelRatio()) || renderer.domElement.height !== Math.floor(height * renderer.getPixelRatio());
  if (needsResize) renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  requestRender();
}

function requestRender() {
  if (!renderer || !scene3D || !camera) return;
  cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(render);
}

function render() {
  if (renderer && scene3D && camera) renderer.render(scene3D, camera);
}

function showModelError(error) {
  console.error('SPRINT BUILD: modelo 3D indisponível.', error);
  const status = document.querySelector('#model-status');
  status.hidden = false;
  status.textContent = 'MODELO 3D INDISPONÍVEL';
}
