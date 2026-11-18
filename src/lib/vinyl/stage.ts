// Three.js scene for the hero: loads a turntable .glb, puts the current track's
// cover on the record label and animates platter, tonearm and knobs from the
// playback state. Framework-free; components/vinyl/vinyl-canvas.tsx drives it.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { pressLabel, type LabelInfo } from "./label";
import { getSkin, type KnobConfig, type SkinConfig, type SkinId } from "./skins";

export type { LabelInfo };

/** How the record is pressed: plain black, the cover's colour, or the cover across the whole disc. */
export type DiscStyle = "black" | "colour" | "picture";

const RAD = THREE.MathUtils.degToRad;
/** 33⅓ rpm in rad/s. */
const OMEGA = ((100 / 3) / 60) * Math.PI * 2;
/** Label textures kept warm for quick switching back and forth. */
const MAX_TEXTURES = 10;
/** Swing distance above which the arm lifts, travels and lowers instead of sliding. */
const TRAVEL_EPS = RAD(0.6);
/** Changing records: the old one lifts off and slides away, the new one slides in and drops. */
const SWAP_SECONDS = 1.3;
/** The run-out groove ticks once a revolution over the last few seconds of a side. */
const RUNOUT_MS = 3800;
/** After the arm is dropped or rested, playback reports that disagree are ignored this long. */
const DROP_HOLD_MS = 1500;
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

/** `down`: the stylus touched the record. `up`: it left it. `runout`: one turn of the run-out groove. */
export type NeedleEvent = "down" | "up" | "runout";

export interface StageEvents {
  onLoadState?(state: LoadState): void;
  /** The record (platter or label) was clicked without dragging. Without it the record isn't clickable. */
  onRecordClick?(): void;
  /**
   * The tonearm was dragged and lowered onto the record at `fraction` (0 = start, 1 = end of the
   * side). Without it the arm can't be dragged.
   */
  onNeedleDrop?(fraction: number): void;
  /** The tonearm was dragged back to its rest. */
  onArmRest?(): void;
  /** While the arm is dragged: where it would drop (0..1), `"rest"` over the rest, null when let go. */
  onArmScrub?(at: number | "rest" | null): void;
  onNeedle?(event: NeedleEvent): void;
}

/**
 * `hero`: on wide layouts the deck sits right of centre to leave room for the copy, and can dock left.
 * `centered`: the deck fills its own box at any width (e.g. a product page).
 */
export type StageFraming = "hero" | "centered";

interface Knob {
  obj: THREE.Object3D;
  base: THREE.Quaternion;
  axis: THREE.Vector3;
  cfg: KnobConfig;
  angle: number;
}

/** The record: what lifts off the platter when records are changed. */
interface RecordParts {
  /** Moved as a whole; sits on the spindle axis, so its world position doesn't change as it spins. */
  carrier: THREE.Object3D;
  /** `carrier.position` on the platter, in its parent's space. */
  base: THREE.Vector3;
  baseWorld: THREE.Vector3;
  vinyl: THREE.Mesh[];
  vinylOriginal: (THREE.Material | THREE.Material[])[];
  /** Every mesh in the carrier (faded while the record is in flight). */
  meshes: THREE.Mesh[];
  radius: number;
}

interface Rig {
  cfg: SkinConfig;
  root: THREE.Object3D;
  spinners: THREE.Object3D[];
  labels: THREE.Mesh[];
  labelOriginal: (THREE.Material | THREE.Material[])[];
  labelMaterial: THREE.MeshStandardMaterial;
  hideWithCover: THREE.Object3D[];
  record: RecordParts;
  colourMaterial: THREE.MeshPhysicalMaterial;
  pictureMaterial: THREE.MeshPhysicalMaterial;
  swing: THREE.Object3D;
  lift: THREE.Object3D;
  /** Arm meshes plus an invisible, wider box along the arm, so the thin tube is easy to grab. */
  armPickables: THREE.Object3D[];
  rest: number;
  leadIn: number;
  leadOut: number;
  liftMax: number;
  knobs: Knob[];
  pickables: THREE.Object3D[];
  frame: THREE.Sphere;
}

/** A drawn label, plus what coloured and picture pressings need. */
interface Pressing {
  label: THREE.Texture;
  colour: THREE.Color;
  drawPicture: (() => HTMLCanvasElement) | null;
  picture?: THREE.Texture;
}

interface ArmGrab {
  pointerId: number;
  /** Swing angle minus the pointer's angle about the pivot when grabbed. */
  offset: number;
  /** Last raw pointer angle, to unwrap across ±π. */
  pointer: number;
  target: number;
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

/** A cover colour made into vinyl: never muddy or too dark to read; greys stay grey (smoke). */
function vinylColour(css: string): THREE.Color {
  const c = new THREE.Color().setStyle(css, THREE.SRGBColorSpace);
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  const s = hsl.s < 0.18 ? hsl.s : Math.max(hsl.s, 0.55);
  return c.setHSL(hsl.h, s, THREE.MathUtils.clamp(hsl.l, 0.3, 0.55), THREE.SRGBColorSpace);
}

function disposePressing(p: Pressing) {
  p.label.dispose();
  p.picture?.dispose();
}

/** Sets opacity on materials, switching them to transparent only while they need it. */
function setOpacity(mats: THREE.Material[], opacity: number) {
  for (const m of mats) {
    const transparent = opacity < 0.999;
    if (m.transparent !== transparent) {
      m.transparent = transparent;
      m.needsUpdate = true;
    }
    m.opacity = opacity;
  }
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
  private readonly textures = new Map<string, Promise<Pressing>>();
  private readonly readyTextures = new Map<string, Pressing>();
  private track: LabelInfo | null = null;
  private labelKey: string | null = null;
  private disc: DiscStyle = "black";
  private swap: {
    t: number;
    key: string;
    pressing: Pressing;
    applied: boolean;
    /** World direction the record slides off in (toward the viewer's right). */
    dir: THREE.Vector3;
  } | null = null;
  private readonly reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Playback inputs.
  private playback: PlaybackState & { at: number } = { playing: false, positionMs: 0, durationMs: 0, at: 0 };
  private volume = 0.8;
  /** Set when the arm was dropped or rested by hand, until playback catches up. */
  private hold: { until: number; playing: boolean } | null = null;

  // Tonearm by hand.
  private grab: ArmGrab | null = null;
  /** Put back on its rest by hand: stays there until playback starts again. */
  private armRested = false;

  // Animated state.
  private omega = 0;
  private swingAngle = 0;
  private swingVel = 0;
  private lift = 0;
  private motor = 0;
  /** Total platter turn (rad), for the run-out ticks. */
  private platterTurn = 0;
  private inGroove = false;
  private flight = 0;

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
    private readonly framing: StageFraming = "hero",
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
    // Likewise, grabbing the tonearm keeps the pointer from orbiting the camera.
    if (events.onNeedleDrop) this.bindArm(canvas);

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

    if (this.rig) {
      // Put the old deck's record back, in case it was changed mid-flight.
      const { record } = this.rig;
      record.carrier.position.copy(record.base);
      for (const mesh of record.meshes) setOpacity(materials(mesh), 1);
      this.scene.remove(this.rig.root);
    }
    if (this.inGroove) {
      this.inGroove = false;
      this.events.onNeedle?.("up");
    }
    this.scene.add(rig.root);
    this.rig = rig;
    // A new deck starts with its arm parked; the state machine cues it again.
    this.swingAngle = rig.rest;
    this.swingVel = 0;
    this.lift = 0;
    this.grab = null;
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
    const now = performance.now();
    const hold = this.hold;
    if (hold && now < hold.until) {
      // Just dropped or rested by hand: wait for the player to agree before following it again,
      // so the arm doesn't bounce while the seek or pause is in flight.
      if (state.playing !== hold.playing) return;
      if (hold.playing) {
        const expected = this.playback.positionMs + (now - this.playback.at);
        if (Math.abs(state.positionMs - expected) > 2500) return;
      }
    }
    this.hold = null;
    if (state.playing && !this.playback.playing) this.armRested = false;
    this.playback = { ...state, at: now };
  }

  /** How records are pressed: black, the cover's colour, or a picture disc. */
  setDisc(style: DiscStyle) {
    if (style === this.disc) return;
    this.disc = style;
    const rig = this.rig;
    if (rig && !this.swap) this.applyLabel(rig, this.labelKey ? (this.readyTextures.get(this.labelKey) ?? null) : null);
    this.dirty = true;
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
    for (const pressing of this.readyTextures.values()) disposePressing(pressing);
    this.readyTextures.clear();
    this.textures.clear();
    for (const p of this.rigs.values()) {
      p.then((rig) => {
        rig.labelMaterial.dispose();
        rig.colourMaterial.dispose();
        rig.pictureMaterial.dispose();
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
        .then((gltf) => this.buildRig(cfg, gltf.scene, gltf.animations));
      this.rigs.set(id, p);
    }
    return p;
  }

  private buildRig(cfg: SkinConfig, root: THREE.Object3D, clips: THREE.AnimationClip[]): Rig {
    // Clips aren't played; a few are only there for their end pose (e.g. a lid that opens).
    if (cfg.holdLastFrame?.length) {
      const held = cfg.holdLastFrame.map((name) => {
        const clip = THREE.AnimationClip.findByName(clips, name);
        if (!clip) throw new Error(`${cfg.url} has no animation named "${name}".`);
        return clip;
      });
      const mixer = new THREE.AnimationMixer(root);
      for (const clip of held) {
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
      }
      mixer.setTime(Math.max(...held.map((c) => c.duration)));
    }

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

    const hideWithCover: THREE.Mesh[] = [];
    if (cfg.hideWithCover?.length) {
      const names = new Set(cfg.hideWithCover);
      root.traverse((o) => isMesh(o) && materials(o).some((m) => names.has(m.name)) && hideWithCover.push(o));
    }

    const record = this.buildRecord(cfg, root, find, spinners, labels, hideWithCover);
    // Solid coloured vinyl under a glossy coat. (Transmission was tried for a translucent look,
    // but on these discs it refracts the label across the whole record.)
    const colourMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.3,
      metalness: 0,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
      sheen: 0.35,
      sheenRoughness: 0.5,
      envMapIntensity: 1,
    });
    // Keep the grooves: the vinyl's own normal / roughness maps, on its own UVs.
    const source = materials(record.vinyl[0])[0] as THREE.MeshStandardMaterial;
    colourMaterial.normalMap = source.normalMap ?? null;
    if (source.normalMap) colourMaterial.normalScale.copy(source.normalScale);
    colourMaterial.roughnessMap = source.roughnessMap ?? null;
    const pictureMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.38,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 0.8,
    });

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

    // A fatter, invisible stand-in along the arm, from the pivot to the stylus: the tube itself
    // is a few pixels wide. Added after framing so it doesn't count.
    const armPickables: THREE.Object3D[] = [lift];
    const tipLocal = lift.worldToLocal(tip.clone());
    const length = Math.hypot(tipLocal.x, tipLocal.z);
    if (length > 0) {
      const width = length * 0.14;
      const proxy = new THREE.Mesh(
        new THREE.BoxGeometry(length * 1.08, width, width),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      proxy.position.set(length * 0.5, tipLocal.y * 0.5, 0);
      proxy.name = "ArmGrab";
      lift.add(proxy);
    }

    return {
      cfg,
      root,
      spinners,
      labels,
      labelOriginal: labels.map((m) => m.material),
      labelMaterial,
      hideWithCover,
      record,
      colourMaterial,
      pictureMaterial,
      swing,
      lift,
      armPickables,
      rest: RAD(num("swing_rest_deg", cfg.arm.restDeg)),
      leadIn: RAD(cfg.arm.leadInDeg),
      leadOut: RAD(num("swing_leadout_deg", cfg.arm.leadOutDeg)),
      liftMax: RAD(num("lift_max_deg", cfg.arm.liftDeg)),
      knobs,
      pickables: [...spinners, ...labels],
      frame: box.getBoundingSphere(new THREE.Sphere()),
    };
  }

  /**
   * Finds the record and gives it a carrier that can lift it off the platter, plus a second
   * planar UV set (uv2) that maps the whole disc onto a square, for picture discs.
   */
  private buildRecord(
    cfg: SkinConfig,
    root: THREE.Object3D,
    find: (name: string) => THREE.Object3D,
    spinners: THREE.Object3D[],
    labels: THREE.Mesh[],
    hideWithCover: THREE.Mesh[],
  ): RecordParts {
    const names = new Set(cfg.record.vinyl);
    const vinyl: THREE.Mesh[] = [];
    for (const s of spinners) {
      s.traverse((o) => {
        if (isMesh(o) && !vinyl.includes(o) && materials(o).some((m) => names.has(m.name))) vinyl.push(o);
      });
    }
    if (!vinyl.length) throw new Error(`${cfg.url} has no record.`);

    let carrier: THREE.Object3D;
    if (cfg.record.node) carrier = find(cfg.record.node);
    else {
      // Group the record's meshes on the spindle axis of the spinner they turn with.
      const spinner = spinners.find((s) => s.getObjectById(vinyl[0].id)) ?? vinyl[0].parent!;
      carrier = new THREE.Group();
      carrier.name = "Record";
      spinner.add(carrier);
      root.updateMatrixWorld(true);
      for (const m of [...vinyl, ...labels, ...hideWithCover]) carrier.attach(m);
    }
    root.updateMatrixWorld(true);

    const meshes: THREE.Mesh[] = [];
    carrier.traverse((o) => isMesh(o) && meshes.push(o));
    // Own copies, so fading the record in flight leaves the rest of the deck alone (labels have theirs).
    for (const m of meshes) {
      if (labels.includes(m)) continue;
      m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
    }

    const toCarrier = new THREE.Matrix4();
    const inverse = carrier.matrixWorld.clone().invert();
    const v = new THREE.Vector3();
    const each = (mesh: THREE.Mesh, fn: (i: number) => void) => {
      toCarrier.multiplyMatrices(inverse, mesh.matrixWorld);
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(toCarrier);
        fn(i);
      }
    };
    let radius = 0;
    for (const m of vinyl) each(m, () => (radius = Math.max(radius, Math.hypot(v.x, v.z))));
    for (const m of meshes) {
      const uv = new Float32Array(m.geometry.attributes.position.count * 2);
      each(m, (i) => {
        uv[i * 2] = v.x / (2 * radius) + 0.5;
        uv[i * 2 + 1] = v.z / (2 * radius) + 0.5;
      });
      m.geometry.setAttribute("uv2", new THREE.BufferAttribute(uv, 2));
    }

    return {
      carrier,
      base: carrier.position.clone(),
      baseWorld: carrier.getWorldPosition(new THREE.Vector3()),
      vinyl,
      vinylOriginal: vinyl.map((m) => m.material),
      meshes,
      radius: radius * carrier.getWorldScale(new THREE.Vector3()).x,
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
    const p = pressLabel(info).then(({ label, colour, drawPicture }): Pressing => {
      const tex = new THREE.CanvasTexture(label);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.channel = 1; // the label's planar uv1
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      const pressing: Pressing = { label: tex, colour: vinylColour(colour), drawPicture };
      if (this.disposed || !this.textures.has(info.key)) disposePressing(pressing);
      else this.readyTextures.set(info.key, pressing);
      return pressing;
    });
    this.textures.set(info.key, p);

    for (const key of [...this.textures.keys()]) {
      if (this.textures.size <= MAX_TEXTURES) break;
      if (key === this.labelKey || key === this.track?.key || key === this.swap?.key) continue;
      this.textures.delete(key);
      const ready = this.readyTextures.get(key);
      if (ready) disposePressing(ready);
      this.readyTextures.delete(key);
    }
  }

  /** The picture-disc texture for `p`, drawn on first use; null when the cover couldn't be loaded. */
  private pictureOf(p: Pressing): THREE.Texture | null {
    if (!p.picture && p.drawPicture) {
      const tex = new THREE.CanvasTexture(p.drawPicture());
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.channel = 2; // the record's planar uv2
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      p.picture = tex;
    }
    return p.picture ?? null;
  }

  /** Puts `p` on the record: its label, and the vinyl pressed as the current disc style. Null: the model's own. */
  private applyLabel(rig: Rig, p: Pressing | null) {
    const style = p ? this.disc : "black";
    const picture = p && style === "picture" ? this.pictureOf(p) : null;

    if (picture) {
      rig.pictureMaterial.map = picture;
      rig.pictureMaterial.needsUpdate = true;
      for (const m of rig.labels) m.material = rig.pictureMaterial;
    } else if (p) {
      rig.labelMaterial.map = p.label;
      rig.labelMaterial.needsUpdate = true;
      for (const m of rig.labels) m.material = rig.labelMaterial;
    } else {
      rig.labels.forEach((m, i) => (m.material = rig.labelOriginal[i]));
    }
    for (const o of rig.hideWithCover) o.visible = !p;

    if (picture) for (const m of rig.record.vinyl) m.material = rig.pictureMaterial;
    else if (p && style !== "black") {
      // Colour, or a picture disc without a picture: the cover's colour.
      rig.colourMaterial.color.copy(p.colour);
      rig.colourMaterial.sheenColor.copy(p.colour);
      for (const m of rig.record.vinyl) m.material = rig.colourMaterial;
    } else rig.record.vinyl.forEach((m, i) => (m.material = rig.record.vinylOriginal[i]));
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

  /** Hero framing on a wide screen, where the copy takes the left side. */
  private isWideHero(width = this.container.clientWidth) {
    return this.framing === "hero" && width >= 1024;
  }

  /** Wide layouts keep the copy on the left, so the deck sits right of centre. */
  private applyViewOffset() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const wide = this.isWideHero(w);
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
    const wide = this.isWideHero();
    const vFov = RAD(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    // Leave room for the copy (wide) or for the panel below (narrow).
    const fill = wide ? 0.58 : 0.82;
    const dist = radius / Math.sin(Math.min(vFov, hFov * fill) / 2) / (wide ? 1.12 : 1.05);
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

  /** Casts a ray from the camera through the pointer. */
  private aim(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster;
  }

  /** The record has a track's cover on it and is on the platter, so the arm can be put on it. */
  private armUsable() {
    return Boolean(this.track && this.track.key === this.labelKey && !this.swap && this.playback.durationMs > 0);
  }

  private hitsArm(e: PointerEvent) {
    const rig = this.rig;
    if (!rig || !this.events.onNeedleDrop || !this.armUsable()) return false;
    return this.aim(e).intersectObjects(rig.armPickables, true).length > 0;
  }

  /** The pointer's angle about the arm pivot (the same convention as the swing), or null. */
  private pointerAngle(e: PointerEvent): number | null {
    const rig = this.rig;
    if (!rig) return null;
    const pivot = rig.swing.getWorldPosition(new THREE.Vector3());
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -pivot.y);
    const hit = this.aim(e).ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return null;
    return Math.atan2(-(hit.z - pivot.z), hit.x - pivot.x);
  }

  /** Where `angle` puts the stylus on the side: 0 at the lead-in, 1 at the lead-out. */
  private fractionAt(rig: Rig, angle: number) {
    return (angle - rig.leadIn) / (rig.leadOut - rig.leadIn);
  }

  /** Released this far toward the rest (fraction of the way there), the arm goes back on it. */
  private restsAt(rig: Rig, angle: number) {
    const rest = this.fractionAt(rig, rig.rest);
    return this.fractionAt(rig, angle) < rest * 0.45;
  }

  private scrubAt(rig: Rig, angle: number): number | "rest" {
    return this.restsAt(rig, angle) ? "rest" : THREE.MathUtils.clamp(this.fractionAt(rig, angle), 0, 1);
  }

  /**
   * Pick up the tonearm and swing it over the record; let go to lower it there (a seek), or on
   * its rest (a pause). Capture-phase listeners registered before OrbitControls, so a grab never orbits.
   */
  private bindArm(canvas: HTMLCanvasElement) {
    const signal = this.abort.signal;
    const opts = { capture: true, signal };
    const release = (e: PointerEvent, cancelled: boolean) => {
      const grab = this.grab;
      const rig = this.rig;
      if (!grab || grab.pointerId !== e.pointerId) return;
      e.stopImmediatePropagation();
      this.grab = null;
      canvas.style.cursor = "";
      this.events.onArmScrub?.(null);
      if (!rig || cancelled || !this.armUsable()) return;
      const now = performance.now();
      if (this.restsAt(rig, grab.target)) {
        this.armRested = true;
        this.playback = { ...this.playback, playing: false, at: now };
        this.hold = { until: now + DROP_HOLD_MS, playing: false };
        this.events.onArmRest?.();
      } else {
        const fraction = THREE.MathUtils.clamp(this.fractionAt(rig, grab.target), 0, 0.995);
        this.armRested = false;
        // Assume the player follows, so the arm lowers where it was let go instead of chasing old reports.
        this.playback = { ...this.playback, playing: true, positionMs: fraction * this.playback.durationMs, at: now };
        this.hold = { until: now + DROP_HOLD_MS, playing: true };
        this.events.onNeedleDrop?.(fraction);
      }
    };

    canvas.addEventListener(
      "pointerdown",
      (e) => {
        if (this.grab || (e.pointerType === "mouse" && e.button !== 0) || !this.hitsArm(e)) return;
        const angle = this.pointerAngle(e);
        if (angle === null) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        this.grab = { pointerId: e.pointerId, offset: this.swingAngle - angle, pointer: angle, target: this.swingAngle };
        this.tween = null;
        canvas.style.cursor = "grabbing";
        const rig = this.rig;
        if (rig) this.events.onArmScrub?.(this.scrubAt(rig, this.swingAngle));
      },
      opts,
    );
    canvas.addEventListener(
      "pointermove",
      (e) => {
        const grab = this.grab;
        const rig = this.rig;
        if (!grab || grab.pointerId !== e.pointerId || !rig) return;
        e.stopImmediatePropagation();
        let angle = this.pointerAngle(e);
        if (angle === null) return;
        while (angle - grab.pointer > Math.PI) angle -= Math.PI * 2;
        while (angle - grab.pointer < -Math.PI) angle += Math.PI * 2;
        grab.pointer = angle;
        const lo = Math.min(rig.rest, rig.leadIn, rig.leadOut);
        const hi = Math.max(rig.rest, rig.leadIn, rig.leadOut);
        grab.target = THREE.MathUtils.clamp(angle + grab.offset, lo, hi);
        this.events.onArmScrub?.(this.scrubAt(rig, grab.target));
      },
      opts,
    );
    canvas.addEventListener("pointerup", (e) => release(e, false), opts);
    canvas.addEventListener("pointercancel", (e) => release(e, true), opts);
    // Touch: pointerdown comes first, so a grab can stop the page from scrolling under the finger.
    canvas.addEventListener(
      "touchstart",
      (e) => {
        if (this.grab) e.preventDefault();
      },
      { passive: false, signal },
    );
    canvas.addEventListener(
      "touchmove",
      (e) => {
        if (this.grab) e.preventDefault();
      },
      { passive: false, signal },
    );
  }

  private bindPointer(canvas: HTMLCanvasElement) {
    const signal = this.abort.signal;
    let down: { x: number; y: number; t: number } | null = null;
    const hitsRecord = (e: PointerEvent) => {
      const rig = this.rig;
      if (!rig) return false;
      return this.aim(e).intersectObjects(rig.pickables, true).length > 0;
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
        if (e.buttons || pending || e.pointerType !== "mouse" || this.grab) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          if (this.grab) return;
          canvas.style.cursor = this.hitsArm(e)
            ? "ew-resize"
            : this.events.onRecordClick && hitsRecord(e)
              ? "pointer"
              : "grab";
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

    // Change records once the new cover is drawn and the arm is clear: the old one lifts off and
    // slides away toward the viewer's right, the new one comes back the same way and drops on.
    if (want && want !== this.labelKey && !this.swap && !this.grab) {
      const pressing = this.readyTextures.get(want);
      const parked = Math.abs(this.swingAngle - rig.rest) < RAD(2);
      if (pressing && parked) {
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0);
        const toward = this.camera.position.clone().sub(this.controls.target).setY(0);
        const dir = right.normalize().addScaledVector(toward.normalize(), 0.35).normalize();
        this.swap = { t: 0, key: want, pressing, applied: false, dir };
      }
    }
    if (this.swap) {
      this.swap.t = Math.min(1, this.swap.t + dt / SWAP_SECONDS);
      if (!this.swap.applied && this.swap.t >= 0.5) {
        this.applyLabel(rig, this.swap.pressing);
        this.labelKey = this.swap.key;
        this.swap.applied = true;
      }
      if (this.swap.t >= 1) this.swap = null;
    }
    // 0 on the platter, 1 at the far end of the slide (the swap's midpoint).
    this.flight = this.swap ? 1 - Math.abs(1 - this.swap.t * 2) : 0;

    const onRecord = Boolean(want) && want === this.labelKey && !this.swap;
    const engaged = onRecord && playing;
    // Parked: nothing loaded, a record change, put back on its rest, or stopped at either end of the side.
    const parked = !onRecord || this.armRested || (!playing && (progress < 0.002 || progress > 0.995));
    const targetSwing = this.grab
      ? this.grab.target
      : parked
        ? rig.rest
        : THREE.MathUtils.lerp(rig.leadIn, rig.leadOut, progress);
    const needle = engaged && !this.grab; // needle down while playing; cue up while paused or in hand

    // Platter: quick spin-up, slower coast down.
    const targetOmega = engaged ? OMEGA : 0;
    this.omega = damp(this.omega, targetOmega, targetOmega > this.omega ? 2.4 : 1.1, dt);
    if (Math.abs(this.omega) < 1e-3 && !targetOmega) this.omega = 0;
    for (const s of rig.spinners) s.rotation.y -= this.omega * dt; // clockwise from above

    // Tonearm: lift, travel, lower. Small changes (playback progress) just slide; in hand, it follows.
    const travel = !this.grab && Math.abs(targetSwing - this.swingAngle) > TRAVEL_EPS;
    const liftTarget = this.grab || travel ? 1 : parked || needle ? 0 : 1;
    this.lift = approach(this.lift, liftTarget, dt * (liftTarget > this.lift ? 3.6 : 2.2));
    const goal = travel && this.lift < 0.9 ? this.swingAngle : targetSwing;
    const k = this.grab ? 16 : 7; // critically damped spring
    this.swingVel += (k * k * (goal - this.swingAngle) - 2 * k * this.swingVel) * dt;
    this.swingVel = THREE.MathUtils.clamp(this.swingVel, -RAD(this.grab ? 240 : 55), RAD(this.grab ? 240 : 55));
    this.swingAngle += this.swingVel * dt;
    if (!travel && Math.abs(goal - this.swingAngle) < 1e-5) this.swingVel = 0;

    this.motor = damp(this.motor, engaged ? 1 : 0, 10, dt);

    // Needle on the record: for the sounds. Down once the stylus touches a turning record.
    const inGroove = needle && !travel && this.lift === 0 && !parked && this.omega > OMEGA * 0.3;
    if (inGroove !== this.inGroove) {
      this.inGroove = inGroove;
      this.events.onNeedle?.(inGroove ? "down" : "up");
    }
    const turn = this.platterTurn;
    this.platterTurn += this.omega * dt;
    const { durationMs } = this.playback;
    const remaining = durationMs * (1 - progress);
    if (
      inGroove &&
      durationMs > RUNOUT_MS * 2 &&
      remaining < RUNOUT_MS &&
      Math.floor(this.platterTurn / (Math.PI * 2)) !== Math.floor(turn / (Math.PI * 2))
    ) {
      this.events.onNeedle?.("runout");
    }
  }

  private pose(rig: Rig) {
    rig.swing.rotation.y = this.swingAngle;
    rig.lift.rotation.z = rig.liftMax * smoothstep(this.lift);

    // Record change: up off the spindle, then out to the side, fading at the far end.
    // Reduced motion: it only fades.
    const f = this.flight;
    const { record } = rig;
    if (f > 0 && this.swap) {
      const rise = this.reducedMotion ? 0 : smoothstep(Math.min(1, f / 0.3));
      const slide = this.reducedMotion ? 0 : smoothstep(Math.max(0, (f - 0.22) / 0.78));
      const world = record.baseWorld
        .clone()
        .addScaledVector(this.swap.dir, slide * record.radius * 3)
        .setY(record.baseWorld.y + rise * record.radius * 0.4);
      const parent = record.carrier.parent!;
      parent.updateWorldMatrix(true, false);
      record.carrier.position.copy(parent.worldToLocal(world));
    } else record.carrier.position.copy(record.base);
    const opacity = 1 - smoothstep(THREE.MathUtils.clamp((f - 0.5) / 0.45, 0, 1));
    for (const mesh of record.meshes) setOpacity(materials(mesh), opacity);

    const q = new THREE.Quaternion();
    for (const knob of rig.knobs) {
      const t = knob.cfg.bind === "motor" ? this.motor : this.volume;
      const angle = RAD(THREE.MathUtils.lerp(knob.cfg.fromDeg, knob.cfg.toDeg, t));
      knob.obj.quaternion.copy(knob.base).multiply(q.setFromAxisAngle(knob.axis, angle));
    }
  }
}
