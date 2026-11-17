// Three.js scene for the hero: loads a turntable .glb, puts the current track's
// cover on the record label and animates platter, tonearm and knobs from the
// playback state. Framework-free; components/VinylCanvas.tsx drives it.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { drawLabel, type LabelInfo } from "./label";
import { getSkin, type KnobConfig, type SkinConfig, type SkinId } from "./skins";

export type { LabelInfo };

const RAD = THREE.MathUtils.degToRad;
/** 33⅓ rpm in rad/s. */
const OMEGA = ((100 / 3) / 60) * Math.PI * 2;
/** Label textures kept warm for quick switching back and forth. */
const MAX_TEXTURES = 10;
/** Swing distance above which the arm lifts, travels and lowers instead of sliding. */
const TRAVEL_EPS = RAD(0.6);
const SWAP_SECONDS = 0.7;
/** Wide layouts: horizontal deck offset (fraction of width) and size, in the hero vs docked left. */
const HERO_SHIFT_X = 0.16;
const DOCK_SHIFT_X = -0.23;
const DOCK_ZOOM = 0.62;

export interface PlaybackState {
  playing: boolean;
  positionMs: number;
  durationMs: number;
}

export interface LoadState {
  skin: SkinId;
  /** 0..1 */
  progress: number;
  ready: boolean;
  error?: string;
}

export interface StageEvents {
  onLoadState?(state: LoadState): void;
  /** The record (platter or label) was clicked without dragging. */
  onRecordClick?(): void;
}

interface Knob {
  obj: THREE.Object3D;
  base: THREE.Quaternion;
  axis: THREE.Vector3;
  cfg: KnobConfig;
  angle: number;
}

interface Rig {
  cfg: SkinConfig;
  root: THREE.Object3D;
  spinners: THREE.Object3D[];
  labels: THREE.Mesh[];
  labelOriginal: (THREE.Material | THREE.Material[])[];
  labelMaterial: THREE.MeshStandardMaterial;
  hideWithCover: THREE.Object3D[];
  swing: THREE.Object3D;
  lift: THREE.Object3D;
  rest: number;
  leadIn: number;
  leadOut: number;
  liftMax: number;
  knobs: Knob[];
  pickables: THREE.Object3D[];
  frame: THREE.Sphere;
}

interface Tween {
  t: number;
  duration: number;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  from: THREE.Spherical;
  to: THREE.Spherical;
}

const isMesh = (o: THREE.Object3D): o is THREE.Mesh => (o as THREE.Mesh).isMesh === true;
const materials = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material : [m.material]);
const smoothstep = (x: number) => x * x * (3 - 2 * x);
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
const damp = (from: number, to: number, rate: number, dt: number) => to + (from - to) * Math.exp(-rate * dt);
const approach = (from: number, to: number, step: number) =>
  from < to ? Math.min(to, from + step) : Math.max(to, from - step);

/** Black room lit by a warm softbox, a cool strip and a faint top light. */
function studioEnvironment(): THREE.Scene {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(14, 8, 14),
    new THREE.MeshBasicMaterial({ color: 0x0d0b0a, side: THREE.BackSide }),
  );
  room.position.y = 3;
  env.add(room);
  const panel = (color: number, power: number, w: number, h: number, x: number, y: number, z: number) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
  };
  panel(0xffc58a, 3.2, 0.9, 3.4, -3.2, 2.4, -3.6); // warm strip, back left: the streak on the record
  panel(0xffe2c2, 2.2, 3, 3, -2.5, 4.5, 2.5); // key, front left
  panel(0x8fa8ff, 3.5, 0.5, 4, 4, 2, -2.5); // cool rim strip, back right
  panel(0xffffff, 0.6, 6, 0.6, 0, 6.5, 0); // ceiling strip
  return env;
}

function disposeScene(scene: THREE.Scene) {
  scene.traverse((o) => {
    if (!isMesh(o)) return;
    o.geometry.dispose();
    for (const m of materials(o)) m.dispose();
  });
}

export class VinylStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.01, 30);
  private readonly controls: OrbitControls;
  private readonly loader = new GLTFLoader();
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private readonly visibility: IntersectionObserver;
  /** Off-screen canvases (phones, scrolled past the hero) keep animating but skip drawing. */
  private visible = true;
  private readonly key: THREE.SpotLight;
  private readonly abort = new AbortController();
  private disposed = false;
  private lastTime = performance.now();
  private dirty = true;

  // Models.
  private readonly rigs = new Map<SkinId, Promise<Rig>>();
  private rig: Rig | null = null;
  private wantedSkin: SkinId | null = null;

  // Labels.
  private readonly textures = new Map<string, Promise<THREE.Texture>>();
  private readonly readyTextures = new Map<string, THREE.Texture>();
  private track: LabelInfo | null = null;
  private labelKey: string | null = null;
  private swap: { t: number; key: string; tex: THREE.Texture; applied: boolean } | null = null;

  // Playback inputs.
  private playback: PlaybackState & { at: number } = { playing: false, positionMs: 0, durationMs: 0, at: 0 };
  private volume = 0.8;

  // Animated state.
  private omega = 0;
  private swingAngle = 0;
  private swingVel = 0;
  private lift = 0;
  private motor = 0;

  // Camera.
  private tween: Tween | null = null;
  private homeTarget = new THREE.Vector3();
  private homePosition = new THREE.Vector3();
  private introDone = false;
  /** Extra downward shift of the deck, as a fraction of the height (wide layouts). */
  private shiftY = 0;
  private shiftYTarget = 0;
  /** 0 = hero position, 1 = docked on the left (wide layouts only). */
  private dock = 0;
  private dockTarget = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly events: StageEvents = {},
  ) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.outline = "none";
    canvas.setAttribute("aria-label", "3D turntable. Drag to orbit, pinch to zoom.");
    canvas.setAttribute("role", "img");
    container.appendChild(canvas);
    this.renderer = renderer;

    // Reflections: a dark studio with a few softboxes, so the vinyl and metal catch highlights.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const studio = studioEnvironment();
    this.scene.environment = pmrem.fromScene(studio, 0.02).texture;
    this.scene.environmentIntensity = 0.9;
    disposeScene(studio);
    pmrem.dispose();

    // Warm key from the upper left, cool rim from behind, faint fill.
    const key = new THREE.SpotLight(0xffd2a1, 9, 0, RAD(30), 0.75, 2);
    key.position.set(-0.75, 1.15, 0.55);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 6;
    key.shadow.camera.near = 0.3;
    key.shadow.camera.far = 4;
    this.scene.add(key, key.target);
    this.key = key;

    const rim = new THREE.DirectionalLight(0x9db2ff, 1.4);
    rim.position.set(0.9, 0.7, -1.1);
    const fill = new THREE.HemisphereLight(0xfff0dd, 0x0a0908, 0.35);
    this.scene.add(rim, fill);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(4, 64),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.55 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // The page scrolls: a plain wheel scrolls it, and only pinch / Ctrl+wheel zooms the deck.
    // Registered before OrbitControls so it runs first and can keep the event from it.
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation();
      },
      { capture: true, signal: this.abort.signal },
    );

    const controls = new OrbitControls(this.camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.9;
    controls.minPolarAngle = RAD(6);
    controls.maxPolarAngle = RAD(82);
    controls.addEventListener("start", () => {
      this.tween = null; // the user takes over
    });
    controls.addEventListener("change", () => {
      this.dirty = true;
    });
    this.controls = controls;
    // Vertical swipes scroll the page; horizontal swipes orbit and two fingers zoom.
    canvas.style.touchAction = "pan-y";

    this.bindPointer(canvas);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.visibility = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.dirty = true;
    });
    this.visibility.observe(container);
    this.resize();
    renderer.setAnimationLoop(this.tick);
  }

  // ---------------------------------------------------------------- public API

  async setSkin(id: SkinId): Promise<void> {
    if (this.wantedSkin === id) return;
    this.wantedSkin = id;
    const cached = this.rigs.has(id);
    if (!cached) this.events.onLoadState?.({ skin: id, progress: 0, ready: false });
    let rig: Rig;
    try {
      rig = await this.loadRig(id);
    } catch (err) {
      if (this.wantedSkin === id) {
        this.rigs.delete(id);
        this.wantedSkin = null;
        const error = err instanceof Error ? err.message : "Could not load the turntable.";
        this.events.onLoadState?.({ skin: id, progress: 0, ready: false, error });
      }
      return;
    }
    if (this.disposed || this.wantedSkin !== id) return;

    if (this.rig) this.scene.remove(this.rig.root);
    this.scene.add(rig.root);
    this.rig = rig;
    // A new deck starts with its arm parked; the state machine cues it again.
    this.swingAngle = rig.rest;
    this.swingVel = 0;
    this.lift = 0;
    this.applyLabel(rig, this.labelKey ? (this.readyTextures.get(this.labelKey) ?? null) : null);
    this.pose(rig);
    this.updateHome();
    this.flyHome(this.introDone ? 1.2 : 2.4, !this.introDone);
    this.introDone = true;
    this.dirty = true;
    this.events.onLoadState?.({ skin: id, progress: 1, ready: true });
  }

  /** The track whose cover belongs on the label (null: keep what is there). */
  setTrack(info: LabelInfo | null) {
    this.track = info;
    if (info) this.ensureTexture(info);
  }

  /** Prepare a label ahead of time (e.g. the next track in the queue). */
  preload(info: LabelInfo | null) {
    if (info) this.ensureTexture(info);
  }

  setPlayback(state: PlaybackState) {
    this.playback = { ...state, at: performance.now() };
  }

  setVolume(volume: number) {
    this.volume = volume;
  }

  /** Slide the deck down by `fraction` of the view height (wide layouts only), e.g. to clear an overlay. */
  setFrameShift(fraction: number) {
    this.shiftYTarget = fraction;
  }

  /** Move the deck from its hero spot (0) to docked on the left (1), e.g. from scroll progress. */
  setDock(progress: number) {
    this.dockTarget = THREE.MathUtils.clamp(progress, 0, 1);
  }

  /** Dolly toward (+1) or away from (-1) the target. */
  zoom(direction: 1 | -1) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const to = new THREE.Spherical().setFromVector3(offset);
    to.radius = THREE.MathUtils.clamp(
      to.radius * (direction > 0 ? 0.78 : 1.28),
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    this.startTween(this.controls.target.clone(), to, 0.5);
  }

  resetView() {
    this.flyHome(1.1, false);
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.abort.abort();
    this.resizeObserver.disconnect();
    this.visibility.disconnect();
    this.controls.dispose();
    for (const tex of this.readyTextures.values()) tex.dispose();
    this.readyTextures.clear();
    this.textures.clear();
    for (const p of this.rigs.values()) {
      p.then((rig) => {
        rig.labelMaterial.dispose();
        rig.root.traverse((o) => {
          if (!isMesh(o)) return;
          o.geometry.dispose();
          for (const m of materials(o)) {
            for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
            m.dispose();
          }
        });
      }).catch(() => {});
    }
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------- loading

  private loadRig(id: SkinId): Promise<Rig> {
    let p = this.rigs.get(id);
    if (!p) {
      const cfg = getSkin(id);
      p = this.loader
        .loadAsync(cfg.url, (e) => {
          if (this.wantedSkin !== id) return;
          const total = e.total || cfg.bytes;
          this.events.onLoadState?.({ skin: id, progress: Math.min(0.99, e.loaded / total), ready: false });
        })
        .then((gltf) => this.buildRig(cfg, gltf.scene));
      this.rigs.set(id, p);
    }
    return p;
  }

  private buildRig(cfg: SkinConfig, root: THREE.Object3D): Rig {
    root.updateMatrixWorld(true);
    const find = (name: string) => {
      const o = root.getObjectByName(name);
      if (!o) throw new Error(`${cfg.url} has no node named "${name}".`);
      return o;
    };

    root.traverse((o) => {
      if (!isMesh(o)) return;
      const transparent = materials(o).some((m) => m.transparent);
      o.castShadow = !transparent; // shadow maps ignore opacity
      o.receiveShadow = true;
    });

    const spinners = cfg.spin.map(find);

    // Label meshes, plus a second UV set (uv1) that maps the label disc onto a
    // square image, top of the image toward the back of the deck.
    const labels: THREE.Mesh[] = [];
    if ("node" in cfg.label) find(cfg.label.node).traverse((o) => isMesh(o) && labels.push(o));
    else {
      const name = cfg.label.material;
      root.traverse((o) => isMesh(o) && materials(o).some((m) => m.name === name) && labels.push(o));
    }
    if (!labels.length) throw new Error(`${cfg.url} has no record label.`);
    // Own copies of the original label materials, so a record change can dim them.
    for (const mesh of labels) {
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
    }
    for (const mesh of labels) {
      const g = mesh.geometry;
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const size = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      const cx = (bb.min.x + bb.max.x) / 2;
      const cz = (bb.min.z + bb.max.z) / 2;
      const pos = g.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = (pos.getX(i) - cx) / size + 0.5;
        uv[i * 2 + 1] = (pos.getZ(i) - cz) / size + 0.5;
      }
      g.setAttribute("uv1", new THREE.BufferAttribute(uv, 2));
    }
    const labelMaterial = new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0, envMapIntensity: 0.6 });

    const hideWithCover: THREE.Object3D[] = [];
    if (cfg.hideWithCover?.length) {
      const names = new Set(cfg.hideWithCover);
      root.traverse((o) => isMesh(o) && materials(o).some((m) => names.has(m.name)) && hideWithCover.push(o));
    }

    // Tonearm: re-parent under swing (vertical axis through the pivot) and lift
    // (horizontal axis across the arm), keeping its world transform.
    const arm = find(cfg.arm.node);
    const pivot = arm.getWorldPosition(new THREE.Vector3());
    const tip = pivot.clone();
    let reach = -1;
    const v = new THREE.Vector3();
    arm.traverse((o) => {
      if (!isMesh(o)) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const d = Math.hypot(v.x - pivot.x, v.z - pivot.z);
        if (d > reach) {
          reach = d;
          tip.copy(v);
        }
      }
    });
    const swing = new THREE.Group();
    swing.name = "ArmSwing";
    swing.position.copy(root.worldToLocal(pivot.clone()));
    const lift = new THREE.Group();
    lift.name = "ArmLift";
    lift.rotation.y = Math.atan2(-(tip.z - pivot.z), tip.x - pivot.x); // local +X → stylus
    swing.add(lift);
    root.add(swing);
    root.updateMatrixWorld(true);
    lift.attach(arm);

    const ud = arm.userData as Record<string, unknown>;
    const num = (k: string, fallback: number) => (typeof ud[k] === "number" ? (ud[k] as number) : fallback);

    const knobs: Knob[] = (cfg.knobs ?? []).flatMap((k) => {
      const obj = root.getObjectByName(k.node);
      if (!obj) return [];
      const axis = new THREE.Vector3(k.axis === "x" ? 1 : 0, k.axis === "y" ? 1 : 0, k.axis === "z" ? 1 : 0);
      return [{ obj, base: obj.quaternion.clone(), axis, cfg: k, angle: k.fromDeg }];
    });

    // Frame on the deck itself; open lids would push the camera back.
    const skip = new Set((cfg.frameExclude ?? []).map((n) => root.getObjectByName(n)).filter(Boolean));
    const box = new THREE.Box3();
    const part = new THREE.Box3();
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!isMesh(o)) return;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (skip.has(p)) return;
      o.geometry.computeBoundingBox();
      box.union(part.copy(o.geometry.boundingBox!).applyMatrix4(o.matrixWorld));
    });

    return {
      cfg,
      root,
      spinners,
      labels,
      labelOriginal: labels.map((m) => m.material),
      labelMaterial,
      hideWithCover,
      swing,
      lift,
      rest: RAD(num("swing_rest_deg", cfg.arm.restDeg)),
      leadIn: RAD(cfg.arm.leadInDeg),
      leadOut: RAD(num("swing_leadout_deg", cfg.arm.leadOutDeg)),
      liftMax: RAD(num("lift_max_deg", cfg.arm.liftDeg)),
      knobs,
      pickables: [...spinners, ...labels],
      frame: box.getBoundingSphere(new THREE.Sphere()),
    };
  }

  private ensureTexture(info: LabelInfo) {
    const existing = this.textures.get(info.key);
    if (existing) {
      // Refresh its place in the LRU order.
      this.textures.delete(info.key);
      this.textures.set(info.key, existing);
      return;
    }
    const p = drawLabel(info).then((canvas) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.channel = 1; // the label's planar uv1
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      if (this.disposed || !this.textures.has(info.key)) tex.dispose();
      else this.readyTextures.set(info.key, tex);
      return tex;
    });
    this.textures.set(info.key, p);

    for (const key of [...this.textures.keys()]) {
      if (this.textures.size <= MAX_TEXTURES) break;
      if (key === this.labelKey || key === this.track?.key || key === this.swap?.key) continue;
      this.textures.delete(key);
      this.readyTextures.get(key)?.dispose();
      this.readyTextures.delete(key);
    }
  }

  private applyLabel(rig: Rig, tex: THREE.Texture | null) {
    if (tex) {
      rig.labelMaterial.map = tex;
      rig.labelMaterial.needsUpdate = true;
      for (const m of rig.labels) m.material = rig.labelMaterial;
    } else {
      rig.labels.forEach((m, i) => (m.material = rig.labelOriginal[i]));
    }
    for (const o of rig.hideWithCover) o.visible = !tex;
  }

  // ---------------------------------------------------------------- camera

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyViewOffset();
    this.updateHome();
    this.dirty = true;
  }

  /** Wide layouts keep the copy on the left, so the deck sits right of centre. */
  private applyViewOffset() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const wide = w >= 1024;
    const d = wide ? smoothstep(this.dock) : 0;
    const sx = wide ? THREE.MathUtils.lerp(HERO_SHIFT_X, DOCK_SHIFT_X, d) : 0;
    const sy = wide ? this.shiftY : 0;
    if (sx || sy) this.camera.setViewOffset(w, h, -w * sx, -h * sy, w, h);
    else this.camera.clearViewOffset();
    this.camera.zoom = THREE.MathUtils.lerp(1, DOCK_ZOOM, d);
    this.camera.updateProjectionMatrix();
  }

  private updateHome() {
    const rig = this.rig;
    if (!rig) return;
    const { center, radius } = rig.frame;
    const w = this.container.clientWidth;
    const vFov = RAD(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    // Leave room for the copy (wide) or for the panel below (narrow).
    const fill = w >= 1024 ? 0.58 : 0.82;
    const dist = radius / Math.sin(Math.min(vFov, hFov * fill) / 2) / (w >= 1024 ? 1.12 : 1.05);
    this.homeTarget.set(center.x, center.y * 0.7, center.z);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, RAD(61), RAD(30));
    this.homePosition.copy(this.homeTarget).addScaledVector(dir, dist);
    this.controls.minDistance = radius * 0.9;
    this.controls.maxDistance = dist * 1.9;
    this.key.target.position.copy(center);
  }

  private flyHome(duration: number, fromAfar: boolean) {
    if (fromAfar) {
      // Intro: swing in from higher up and further left.
      const from = new THREE.Spherical().setFromVector3(this.homePosition.clone().sub(this.homeTarget));
      from.radius *= 1.75;
      from.phi = RAD(30);
      from.theta -= RAD(55);
      this.camera.position.copy(this.homeTarget).add(new THREE.Vector3().setFromSpherical(from));
      this.controls.target.copy(this.homeTarget);
    }
    const to = new THREE.Spherical().setFromVector3(this.homePosition.clone().sub(this.homeTarget));
    this.startTween(this.homeTarget.clone(), to, duration);
  }

  private startTween(toTarget: THREE.Vector3, to: THREE.Spherical, duration: number) {
    const from = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    // Turn the short way round.
    while (to.theta - from.theta > Math.PI) to.theta -= Math.PI * 2;
    while (to.theta - from.theta < -Math.PI) to.theta += Math.PI * 2;
    this.tween = { t: 0, duration, fromTarget: this.controls.target.clone(), toTarget, from, to };
  }

  private stepTween(dt: number) {
    const tw = this.tween;
    if (!tw) return;
    tw.t = Math.min(1, tw.t + dt / tw.duration);
    const k = easeOutCubic(tw.t);
    const s = new THREE.Spherical(
      THREE.MathUtils.lerp(tw.from.radius, tw.to.radius, k),
      THREE.MathUtils.lerp(tw.from.phi, tw.to.phi, k),
      THREE.MathUtils.lerp(tw.from.theta, tw.to.theta, k),
    );
    this.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(s));
    this.dirty = true;
    if (tw.t >= 1) this.tween = null;
  }

  // ---------------------------------------------------------------- pointer

  private bindPointer(canvas: HTMLCanvasElement) {
    const signal = this.abort.signal;
    let down: { x: number; y: number; t: number } | null = null;
    const ndc = new THREE.Vector2();
    const hitsRecord = (e: PointerEvent) => {
      const rig = this.rig;
      if (!rig) return false;
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      return this.raycaster.intersectObjects(rig.pickables, true).length > 0;
    };
    canvas.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }), {
      signal,
    });
    canvas.addEventListener(
      "pointerup",
      (e) => {
        const d = down;
        down = null;
        if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 500) return;
        if (hitsRecord(e)) this.events.onRecordClick?.();
      },
      { signal },
    );
    let pending = false;
    canvas.addEventListener(
      "pointermove",
      (e) => {
        if (e.buttons || pending || e.pointerType !== "mouse") return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          canvas.style.cursor = hitsRecord(e) ? "pointer" : "grab";
        });
      },
      { signal },
    );
  }

  // ---------------------------------------------------------------- animation

  private progress(now: number): number {
    const { playing, positionMs, durationMs, at } = this.playback;
    if (!durationMs) return 0;
    const pos = positionMs + (playing ? now - at : 0);
    return THREE.MathUtils.clamp(pos / durationMs, 0, 1);
  }

  private readonly tick = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.stepTween(dt);
    if (this.shiftY !== this.shiftYTarget || this.dock !== this.dockTarget) {
      this.shiftY = damp(this.shiftY, this.shiftYTarget, 5, dt);
      if (Math.abs(this.shiftY - this.shiftYTarget) < 1e-4) this.shiftY = this.shiftYTarget;
      this.dock = damp(this.dock, this.dockTarget, 9, dt); // smooths out wheel steps
      if (Math.abs(this.dock - this.dockTarget) < 1e-4) this.dock = this.dockTarget;
      this.applyViewOffset();
      this.dirty = true;
    }
    if (this.controls.update(dt)) this.dirty = true;

    const rig = this.rig;
    if (rig) {
      const before = this.signature();
      this.animate(rig, dt, now);
      this.pose(rig);
      if (this.omega !== 0 || this.signature() !== before) this.dirty = true;
    }

    if (this.dirty && this.visible) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  };

  /** Cheap fingerprint of the animated state, to skip idle frames. */
  private signature() {
    const s = this.swap ? this.swap.t : 1;
    return `${this.omega.toFixed(5)}|${this.swingAngle.toFixed(5)}|${this.lift.toFixed(4)}|${this.motor.toFixed(4)}|${s}|${this.volume}`;
  }

  private animate(rig: Rig, dt: number, now: number) {
    const want = this.track?.key ?? null;
    const progress = this.progress(now);
    const { playing } = this.playback;

    // Swap the label once the new cover is drawn and the arm is clear of the record.
    if (want && want !== this.labelKey && !this.swap) {
      const tex = this.readyTextures.get(want);
      const parked = Math.abs(this.swingAngle - rig.rest) < RAD(2);
      if (tex && parked) this.swap = { t: 0, key: want, tex, applied: false };
    }
    if (this.swap) {
      this.swap.t = Math.min(1, this.swap.t + dt / SWAP_SECONDS);
      if (!this.swap.applied && this.swap.t >= 0.5) {
        this.applyLabel(rig, this.swap.tex);
        this.labelKey = this.swap.key;
        this.swap.applied = true;
      }
      if (this.swap.t >= 1) this.swap = null;
    }

    const onRecord = Boolean(want) && want === this.labelKey && !this.swap;
    const engaged = onRecord && playing;
    // Parked: nothing loaded, a record change, or stopped at either end of the side.
    const parked = !onRecord || (!playing && (progress < 0.002 || progress > 0.995));
    const targetSwing = parked ? rig.rest : THREE.MathUtils.lerp(rig.leadIn, rig.leadOut, progress);
    const needle = engaged; // needle down while playing; cue up while paused

    // Platter: quick spin-up, slower coast down.
    const targetOmega = engaged ? OMEGA : 0;
    this.omega = damp(this.omega, targetOmega, targetOmega > this.omega ? 2.4 : 1.1, dt);
    if (Math.abs(this.omega) < 1e-3 && !targetOmega) this.omega = 0;
    for (const s of rig.spinners) s.rotation.y -= this.omega * dt; // clockwise from above

    // Tonearm: lift, travel, lower. Small changes (playback progress) just slide.
    const travel = Math.abs(targetSwing - this.swingAngle) > TRAVEL_EPS;
    const liftTarget = travel ? 1 : parked || needle ? 0 : 1;
    this.lift = approach(this.lift, liftTarget, dt * (liftTarget > this.lift ? 3.6 : 2.2));
    const goal = travel && this.lift < 0.9 ? this.swingAngle : targetSwing;
    const k = 7; // critically damped spring
    this.swingVel += (k * k * (goal - this.swingAngle) - 2 * k * this.swingVel) * dt;
    this.swingVel = THREE.MathUtils.clamp(this.swingVel, -RAD(55), RAD(55));
    this.swingAngle += this.swingVel * dt;
    if (!travel && Math.abs(goal - this.swingAngle) < 1e-5) this.swingVel = 0;

    this.motor = damp(this.motor, engaged ? 1 : 0, 10, dt);
  }

  private pose(rig: Rig) {
    rig.swing.rotation.y = this.swingAngle;
    rig.lift.rotation.z = rig.liftMax * smoothstep(this.lift);

    // Label change: the old cover dims and dips, the new one comes up in its place.
    const f = this.swap ? smoothstep(Math.abs(Math.cos(this.swap.t * Math.PI))) : 1;
    const scale = 0.9 + 0.1 * f;
    const tint = 0.08 + 0.92 * f;
    for (const mesh of rig.labels) {
      mesh.scale.set(scale, 1, scale);
      for (const m of materials(mesh)) {
        const tinted = m as THREE.Material & { color?: THREE.Color };
        if (!tinted.color) continue;
        tinted.userData.baseColor ??= tinted.color.clone();
        tinted.color.copy(tinted.userData.baseColor as THREE.Color).multiplyScalar(tint);
      }
    }

    const q = new THREE.Quaternion();
    for (const knob of rig.knobs) {
      const t = knob.cfg.bind === "motor" ? this.motor : this.volume;
      const angle = RAD(THREE.MathUtils.lerp(knob.cfg.fromDeg, knob.cfg.toDeg, t));
      knob.obj.quaternion.copy(knob.base).multiply(q.setFromAxisAngle(knob.axis, angle));
    }
  }
}
