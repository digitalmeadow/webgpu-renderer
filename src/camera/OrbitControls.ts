import { Vec3 } from "../math";
import { Camera } from "./Camera";

export interface OrbitControlsOptions {
  target?: Vec3;
  distance?: number;
  minDistance?: number;
  maxDistance?: number;
  /** Radians per pixel dragged. */
  rotateSpeed?: number;
  /** Fraction of the remaining turn left per 1/60 s: higher trails the pointer more softly. */
  rotateDamping?: number;
  /** Fraction of distance per wheel delta unit. */
  zoomSpeed?: number;
  /** Fraction of fling velocity kept per 1/60 s: 0 stops dead, 1 never slows. */
  damping?: number;
  /** Fraction of the remaining zoom left per 1/60 s: higher glides longer. */
  zoomDamping?: number;
  /** Radians per second around the target while idle. */
  autoRotateSpeed?: number;
  /** Wheel zoom keeps the point under the cursor where it is, rather than closing on the target. */
  zoomToCursor?: boolean;
  /** Shift-drag slides the target across the view. */
  enablePan?: boolean;
}

const MAX_PITCH = Math.PI / 2 - 0.01;
const DRAG_THRESHOLD_PX = 3;
/** Weight of the latest frame in the fling velocity: one uneven frame doesn't decide the throw. */
const VELOCITY_SMOOTHING = 0.25;

/**
 * Drag to orbit a target, wheel to dolly. The pointer moves a goal and the camera eases after it
 * every frame, so motion stays smooth however unevenly pointer events arrive. Momentum on release;
 * optional idle spin.
 */
export class OrbitControls {
  readonly target: Vec3;
  distance: number;
  minDistance: number;
  maxDistance: number;
  rotateSpeed: number;
  rotateDamping: number;
  zoomSpeed: number;
  damping: number;
  zoomDamping: number;
  autoRotateSpeed: number;
  zoomToCursor: boolean;
  enablePan: boolean;
  /** While true the view keeps still: no idle spin, and a glide in progress stops. */
  hold = false;

  yaw = 0;
  pitch = 0;

  /** True from the moment a press moves past the threshold until the next press. */
  dragged = false;

  private canvas: HTMLElement;
  private camera: Camera;
  private abort = new AbortController();
  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private goalYaw = 0;
  private goalPitch = 0;
  private lastGoalYaw = 0;
  private lastGoalPitch = 0;
  private velocityYaw = 0;
  private velocityPitch = 0;
  private targetDistance: number;
  private initialised = false;
  /** This press slides the target rather than orbiting it. */
  private panning = false;
  /** Pan the target still has to make, eased out as turns are: an offset, so code moving the target too isn't undone. */
  private panLeft = [0, 0, 0];
  /** Pan since the last frame, and its smoothed rate per 1/60 s: the fling it carries on with. */
  private panAdded = [0, 0, 0];
  private panVelocity = [0, 0, 0];
  /** The last wheel's cursor, in normalised device coordinates: what zoom closes on. */
  private zoomAnchor: [number, number] | null = null;
  /** Every pointer down, where it is: two make a pinch. */
  private touches = new Map<number, { x: number; y: number }>();
  /** A pinch under way: the fingers' spread and the zoom when it began. */
  private pinch: { spread: number; distance: number } | null = null;

  constructor(canvas: HTMLElement, camera: Camera, options: OrbitControlsOptions = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.target = options.target ?? new Vec3(0, 0, 0);
    this.distance = options.distance ?? 10;
    this.targetDistance = this.distance;
    this.minDistance = options.minDistance ?? 0.1;
    this.maxDistance = options.maxDistance ?? Infinity;
    this.rotateSpeed = options.rotateSpeed ?? 0.005;
    this.rotateDamping = options.rotateDamping ?? 0.8;
    this.zoomSpeed = options.zoomSpeed ?? 0.001;
    this.damping = options.damping ?? 0.9;
    this.zoomDamping = options.zoomDamping ?? 0.8;
    this.autoRotateSpeed = options.autoRotateSpeed ?? 0;
    this.zoomToCursor = options.zoomToCursor ?? false;
    this.enablePan = options.enablePan ?? false;

    const { signal } = this.abort;
    canvas.addEventListener("pointerdown", this.onPointerDown, { signal });
    canvas.addEventListener("pointermove", this.onPointerMove, { signal });
    canvas.addEventListener("pointerup", this.onPointerUp, { signal });
    canvas.addEventListener("pointercancel", this.onPointerUp, { signal });
    canvas.addEventListener("wheel", this.onWheel, { signal, passive: false });
  }

  get isDragging(): boolean {
    return this.pointerId !== null;
  }

  get isPanning(): boolean {
    return this.isDragging && this.panning;
  }

  /** Call once per frame, before the camera updates. */
  update(deltaSeconds: number): void {
    // yaw and pitch may be set directly before the first frame: the goal starts there.
    if (!this.initialised) {
      this.goalYaw = this.lastGoalYaw = this.yaw;
      this.goalPitch = this.lastGoalPitch = this.pitch;
      this.initialised = true;
    }
    const frames = Math.max(deltaSeconds * 60, 0.0001);

    if (this.isDragging && !this.panning) {
      const blend = 1 - Math.pow(1 - VELOCITY_SMOOTHING, frames);
      this.velocityYaw += ((this.goalYaw - this.lastGoalYaw) / frames - this.velocityYaw) * blend;
      this.velocityPitch +=
        ((this.goalPitch - this.lastGoalPitch) / frames - this.velocityPitch) * blend;
    } else if (this.hold) {
      this.velocityYaw = 0;
      this.velocityPitch = 0;
      // Stop where the camera is, not where the glide was heading.
      this.goalYaw = this.yaw;
      this.goalPitch = this.pitch;
    } else {
      const keep = Math.pow(this.damping, frames);
      this.goalYaw += this.velocityYaw * frames + this.autoRotateSpeed * deltaSeconds;
      this.goalPitch += this.velocityPitch * frames;
      this.velocityYaw *= keep;
      this.velocityPitch *= keep;
    }
    this.goalPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.goalPitch));
    this.lastGoalYaw = this.goalYaw;
    this.lastGoalPitch = this.goalPitch;

    const turn = 1 - Math.pow(this.rotateDamping, frames);
    this.yaw += (this.goalYaw - this.yaw) * turn;
    this.pitch += (this.goalPitch - this.pitch) * turn;
    this.easePan(frames, turn);

    // Eased, so a wheel notch glides instead of jumping.
    const zoom = 1 - Math.pow(this.zoomDamping, frames);
    const before = this.distance;
    this.distance += (this.targetDistance - this.distance) * zoom;
    if (this.zoomAnchor) {
      // The cursor's point on the target's plane sits this far off the target, in proportion to
      // the distance: closing in by some fraction moves the target that fraction toward it.
      const [x, y] = this.zoomAnchor;
      this.slide(x, y, (before - this.distance) / before);
      // Glide done: a later move of the target (code panning to something) mustn't keep sliding.
      if (Math.abs(this.targetDistance - this.distance) < this.distance * 1e-4)
        this.zoomAnchor = null;
    }

    const cosPitch = Math.cos(this.pitch);
    this.camera.transform.setPosition(
      this.target.x + this.distance * Math.sin(this.yaw) * cosPitch,
      this.target.y + this.distance * Math.sin(this.pitch),
      this.target.z - this.distance * Math.cos(this.yaw) * cosPitch,
    );
    this.camera.transform.lookAt(this.target);
  }

  /** Eases the zoom there, as a wheel does. */
  zoomTo(distance: number): void {
    this.zoomAnchor = null;
    this.targetDistance = this.clampDistance(distance);
  }

  /** Drops a pan still easing or gliding: code moving the target from here on has it to itself. */
  stopPan(): void {
    this.panLeft.fill(0);
    this.panVelocity.fill(0);
  }

  /** Jumps the zoom with no easing. */
  setDistance(distance: number): void {
    this.zoomAnchor = null;
    this.targetDistance = this.clampDistance(distance);
    this.distance = this.targetDistance;
  }

  destroy(): void {
    this.abort.abort();
  }

  private clampDistance(distance: number): number {
    return Math.max(this.minDistance, Math.min(this.maxDistance, distance));
  }

  /**
   * Moves the target by a fraction of the way to a point on its plane, given in normalised device
   * coordinates: measured through the camera as it last drew, so any projection works.
   */
  private slide(ndcX: number, ndcY: number, fraction: number) {
    const step = this.stepTo(ndcX, ndcY, fraction);
    if (step)
      this.target.set(this.target.x + step[0], this.target.y + step[1], this.target.z + step[2]);
  }

  /** As slide, but only the step it would make. */
  private stepTo(ndcX: number, ndcY: number, fraction: number): number[] | null {
    const w = this.camera.transform.worldMatrix.data;
    const right = [w[0], w[1], w[2]];
    const up = [w[4], w[5], w[6]];
    const t = [this.target.x, this.target.y, this.target.z];
    const [sx, sy] = this.ndc(t);
    const perRight = this.ndc([t[0] + right[0], t[1] + right[1], t[2] + right[2]])[0] - sx;
    const perUp = this.ndc([t[0] + up[0], t[1] + up[1], t[2] + up[2]])[1] - sy;
    if (!perRight || !perUp) return null;
    const along = ((ndcX - sx) / perRight) * fraction;
    const rise = ((ndcY - sy) / perUp) * fraction;
    return [0, 1, 2].map((axis) => right[axis] * along + up[axis] * rise);
  }

  /** Dragging, the pan's rate is measured; let go, it glides on and slows as a fling does. Either way, eased in. */
  private easePan(frames: number, turn: number) {
    const left = this.panLeft;
    const velocity = this.panVelocity;
    if (this.isPanning) {
      const blend = 1 - Math.pow(1 - VELOCITY_SMOOTHING, frames);
      for (let axis = 0; axis < 3; axis++) {
        velocity[axis] += (this.panAdded[axis] / frames - velocity[axis]) * blend;
        this.panAdded[axis] = 0;
      }
    } else if (this.hold) {
      velocity.fill(0);
      left.fill(0);
    } else {
      const keep = Math.pow(this.damping, frames);
      for (let axis = 0; axis < 3; axis++) {
        left[axis] += velocity[axis] * frames;
        velocity[axis] *= keep;
      }
    }
    const step = left.map((d) => d * turn);
    this.target.set(this.target.x + step[0], this.target.y + step[1], this.target.z + step[2]);
    for (let axis = 0; axis < 3; axis++) left[axis] -= step[axis];
  }

  private ndc([x, y, z]: number[]): [number, number] {
    const m = this.camera.viewProjectionMatrix.data;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    ];
  }

  private toNdc(e: MouseEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((e.clientY - rect.top) / rect.height) * 2,
    ];
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // A second finger: the drag becomes a pinch, zooming on the point between them.
    if (this.pointerId !== null) {
      if (this.touches.size !== 2) return;
      this.canvas.setPointerCapture(e.pointerId);
      this.pinch = { spread: this.spread(), distance: this.targetDistance };
      this.dragged = true;
      return;
    }
    this.pointerId = e.pointerId;
    this.startX = this.lastX = e.clientX;
    this.startY = this.lastY = e.clientY;
    this.velocityYaw = 0;
    this.velocityPitch = 0;
    this.dragged = false;
    this.panning = this.enablePan && e.shiftKey;
    this.panVelocity.fill(0);
    this.panAdded.fill(0);
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch) {
      const [a, b] = [...this.touches.values()];
      const rect = this.canvas.getBoundingClientRect();
      this.zoomAnchor = this.zoomToCursor
        ? [
            (((a.x + b.x) / 2 - rect.left) / rect.width) * 2 - 1,
            1 - (((a.y + b.y) / 2 - rect.top) / rect.height) * 2,
          ]
        : null;
      this.targetDistance = this.clampDistance(
        (this.pinch.distance * this.pinch.spread) / Math.max(this.spread(), 1),
      );
      return;
    }
    if (e.pointerId !== this.pointerId) return;
    if (Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > DRAG_THRESHOLD_PX) {
      this.dragged = true;
    }
    if (this.panning) {
      // Drags the view with the pointer: the target slides the other way.
      const rect = this.canvas.getBoundingClientRect();
      const [sx, sy] = this.ndc([this.target.x, this.target.y, this.target.z]);
      const step = this.stepTo(
        sx - ((e.clientX - this.lastX) / rect.width) * 2,
        sy + ((e.clientY - this.lastY) / rect.height) * 2,
        1,
      );
      for (let axis = 0; step && axis < 3; axis++) {
        this.panLeft[axis] += step[axis];
        this.panAdded[axis] += step[axis];
      }
    } else {
      this.goalYaw -= (e.clientX - this.lastX) * this.rotateSpeed;
      this.goalPitch += (e.clientY - this.lastY) * this.rotateSpeed;
    }
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    // A pinch ends the gesture: the finger left behind doesn't turn the view until it's lifted.
    if (this.pinch) {
      this.pinch = null;
      this.pointerId = null;
      return;
    }
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
  };

  private spread(): number {
    const [a, b] = [...this.touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomAnchor = this.zoomToCursor ? this.toNdc(e) : null;
    this.targetDistance = this.clampDistance(
      this.targetDistance * Math.exp(e.deltaY * this.zoomSpeed),
    );
  };
}
