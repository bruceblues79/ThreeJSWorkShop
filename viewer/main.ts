import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ASSETS, type AssetEntry } from './assets';

/**
 * 项目级公用浏览台。
 * URL 参数：?asset=<id>&view=iso|front|side&yaw=&pitch=&hud=0&plate=0
 * 新增资产只需在 assets.ts 注册，无需再写预览页。
 */

const params = new URLSearchParams(location.search);
/** 单资产预览：构建时注入，带值时只加载该资产并隐藏切换按钮。 */
const previewAsset = String(
  (globalThis as { __PREVIEW_ASSET__?: string }).__PREVIEW_ASSET__ ?? '',
).trim();
const assetList = previewAsset ? ASSETS.filter((entry) => entry.id === previewAsset) : ASSETS;
if (params.get('hud') === '0') {
  document.querySelector('.card')?.remove();
  document.querySelector('.bar')?.remove();
}

const app = document.getElementById('app')!;
const viewportWidth = () => app.clientWidth || innerWidth;
const viewportHeight = () => app.clientHeight || innerHeight;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(viewportWidth(), viewportHeight());
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, viewportWidth() / viewportHeight(), 0.01, 40);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.15;
controls.maxDistance = 6;
controls.maxPolarAngle = Math.PI * 0.495;

scene.add(new THREE.HemisphereLight(0xeaf1f7, 0x4a4136, 1.15));

const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
key.position.set(0.85, 1.5, 0.75);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 0.2;
key.shadow.camera.far = 6;
key.shadow.camera.left = -1.2;
key.shadow.camera.right = 1.2;
key.shadow.camera.top = 1.2;
key.shadow.camera.bottom = -1.2;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.002;
scene.add(key);

const rim = new THREE.DirectionalLight(0xbcd2ff, 0.9);
rim.position.set(-1.1, 0.7, -0.9);
scene.add(rim);

const bounce = new THREE.DirectionalLight(0xffd9a8, 0.35);
bounce.position.set(0.2, -0.4, 1.2);
scene.add(bounce);

const fill = new THREE.DirectionalLight(0xdbe6ff, 1.0);
fill.position.set(-1, 0.5, -0.7);
scene.add(fill);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.26 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// 展示用基座（不属于资产本体，?plate=0 可关闭）
const stage = new THREE.Group();
stage.name = 'viewer-stage';
const plate = new THREE.Mesh(
  new THREE.CylinderGeometry(1, 1, 1, 64),
  new THREE.MeshStandardMaterial({ color: 0x9c968a, roughness: 0.82, metalness: 0.1, transparent: true, opacity: 0.55 }),
);
plate.receiveShadow = true;
const plateRing = new THREE.Mesh(
  new THREE.TorusGeometry(1, 0.008, 6, 96),
  new THREE.MeshBasicMaterial({ color: 0x6f685c, transparent: true, opacity: 0.5 }),
);
plateRing.rotation.x = Math.PI / 2;
stage.add(plate, plateRing);
if (params.get('plate') === '0') stage.visible = false;
scene.add(stage);

type Pose = { yaw: number; pitch: number };
type Mounted = { entry: AssetEntry; root: THREE.Group; bounds: THREE.Box3 };

let mounted: Mounted | null = null;
let pose: Pose = { yaw: 0, pitch: 18 };
let view: string = params.get('view') ?? 'iso';

const title = document.getElementById('title');
const meta = document.getElementById('meta');
const assetsBox = document.getElementById('assets');
const yawInput = document.getElementById('yaw') as HTMLInputElement | null;
const pitchInput = document.getElementById('pitch') as HTMLInputElement | null;
const yawOut = document.getElementById('yawOut');
const pitchOut = document.getElementById('pitchOut');

/** 让相机把当前资产完整框进画面，同时按资产尺寸调整展示盘与阴影相机。 */
function frame() {
  if (!mounted) return;
  const { bounds } = mounted;
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const fit = Math.min(vFov, hFov);

  const dirs: Record<string, THREE.Vector3> = {
    iso: new THREE.Vector3(-1.2, 0.85, -1.5),
    front: new THREE.Vector3(0, 0.22, -1),
    side: new THREE.Vector3(1, 0.16, 0),
  };
  const dir = (dirs[view] ?? dirs.iso).clone().normalize();
  const targetPos = sphere.center.clone();

  // 用包围盒 8 个角做投影拟合，竖屏/透视下都能留出稳定边距
  const corners: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  const probe = new THREE.Vector3();
  let distance = (sphere.radius / Math.sin(fit / 2)) * 1.12;
  camera.near = sphere.radius / 50;
  camera.far = sphere.radius * 60;
  camera.updateProjectionMatrix();
  for (let i = 0; i < 5; i++) {
    camera.position.copy(targetPos).addScaledVector(dir, distance);
    camera.lookAt(targetPos);
    camera.updateMatrixWorld();
    let extent = 0;
    for (const corner of corners) {
      probe.copy(corner).project(camera);
      extent = Math.max(extent, Math.abs(probe.x), Math.abs(probe.y));
    }
    if (extent > 0.92) distance *= Math.min(1.3, extent / 0.92);
    else if (extent < 0.8) distance *= Math.max(0.8, extent / 0.86);
    else break;
  }

  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(dir, distance);
  camera.near = Math.max(0.004, distance / 200);
  camera.far = distance * 20;
  camera.updateProjectionMatrix();
  controls.minDistance = distance * 0.35;
  controls.maxDistance = distance * 4;
  controls.update();

  const radius = Math.max(sphere.radius, 0.15);
  stage.scale.set(radius * 1.18, 0.005, radius * 1.18);
  stage.position.set(sphere.center.x, -0.0025, sphere.center.z);
  key.shadow.camera.left = -radius * 2.4;
  key.shadow.camera.right = radius * 2.4;
  key.shadow.camera.top = radius * 2.4;
  key.shadow.camera.bottom = -radius * 2.4;
  key.shadow.camera.updateProjectionMatrix();
}

function applyPose() {
  if (!mounted) return;
  mounted.root.rotation.y = THREE.MathUtils.degToRad(pose.yaw);
  const gun = mounted.root.getObjectByName('gun_rotate');
  if (gun) gun.rotation.x = THREE.MathUtils.degToRad(pose.pitch);
  if (yawInput) yawInput.value = String(pose.yaw);
  if (pitchInput) pitchInput.value = String(pose.pitch);
  if (yawOut) yawOut.textContent = `${pose.yaw.toFixed(0)}°`;
  if (pitchOut) pitchOut.textContent = `${pose.pitch.toFixed(0)}°`;
}

function describe(entry: AssetEntry) {
  if (!mounted) return;
  const { root, bounds } = mounted;
  const size = bounds.getSize(new THREE.Vector3());
  let tris = 0;
  let draws = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry;
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    draws++;
  });

  const contract = ['gun_rotate', 'muzzle', 'hit_core']
    .filter((name) => root.getObjectByName(name))
    .join(' / ');

  if (title) title.textContent = entry.label;
  if (meta) {
    meta.innerHTML =
      `${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)} m · 接地 y=${bounds.min.y.toFixed(4)}<br />` +
      `${Math.round(tris)} tri · ${draws} draw call<br />` +
      (contract ? `节点 ${contract}<br />` : '') +
      (entry.note ?? '');
  }

  (window as unknown as { __assetInfo?: object }).__assetInfo = {
    id: entry.id,
    size: size.toArray(),
    min: bounds.min.toArray(),
    max: bounds.max.toArray(),
    tris: Math.round(tris),
    draws,
  };
}

function mount(entry: AssetEntry) {
  if (mounted) scene.remove(mounted.root);

  const root = entry.create();
  scene.add(root);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  mounted = { entry, root, bounds };

  const yawRange = entry.yawRange ?? 45;
  if (yawInput) {
    yawInput.min = String(-yawRange);
    yawInput.max = String(yawRange);
  }
  if (pitchInput) {
    pitchInput.min = String(entry.pitchMin ?? 0);
    pitchInput.max = String(entry.pitchMax ?? 80);
  }

  pose = {
    yaw: Number(params.get('yaw') ?? 0),
    pitch: Number(params.get('pitch') ?? entry.pitch ?? 18),
  };
  applyPose();
  describe(entry);
  frame();

  if (assetsBox) {
    for (const btn of Array.from(assetsBox.querySelectorAll<HTMLButtonElement>('button'))) {
      btn.classList.toggle('on', btn.dataset.asset === entry.id);
    }
  }
  document.title = `${entry.label} · 资产浏览台`;
  const url = new URL(location.href);
  url.searchParams.set('asset', entry.id);
  history.replaceState(null, '', url);
}

if (assetsBox) {
  if (assetList.length < 2) {
    assetsBox.remove();
  } else {
    for (const entry of assetList) {
      const btn = document.createElement('button');
      btn.textContent = entry.label;
      btn.dataset.asset = entry.id;
      btn.addEventListener('click', () => mount(entry));
      assetsBox.appendChild(btn);
    }
  }
}

const initial = assetList.find((entry) => entry.id === params.get('asset')) ?? assetList[0];
mount(initial);

yawInput?.addEventListener('input', () => {
  pose.yaw = Number(yawInput.value);
  applyPose();
});
pitchInput?.addEventListener('input', () => {
  pose.pitch = Number(pitchInput.value);
  applyPose();
});

document.querySelectorAll<HTMLButtonElement>('.views button').forEach((btn) => {
  btn.addEventListener('click', () => {
    view = btn.dataset.view ?? 'iso';
    frame();
    document.querySelectorAll<HTMLButtonElement>('.views button').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
  });
});

function resize() {
  const width = viewportWidth();
  const height = viewportHeight();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  frame();
}

// 用容器尺寸而不是 innerWidth，避免移动端首帧/旋转时画布尺寸与视口不一致
new ResizeObserver(resize).observe(app);
addEventListener('resize', resize);

let frames = 0;
function tick() {
  controls.update();
  renderer.render(scene, camera);
  frames++;
  if (frames === 8) (window as unknown as { __viewerReady?: boolean }).__viewerReady = true;
  requestAnimationFrame(tick);
}
tick();
