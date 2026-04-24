import { Quat, Vec3 } from "../math";
import { Camera } from "./Camera";

export class FlyControls {
  private canvas: HTMLCanvasElement;
  private camera: Camera;

  private keys: Set<string> = new Set();
  private yaw: number = 0;
  private pitch: number = 0;
  private speed: number = 5;
  private minSpeed: number = 0.5;
  private maxSpeed: number = 50;

  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private readonly sensitivity = 0.005;

  private static readonly WORLD_UP = new Vec3(0, 1, 0);
  private static readonly WORLD_RIGHT = new Vec3(1, 0, 0);
  private static readonly WORLD_FORWARD = new Vec3(0, 0, 1);

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.camera = camera;

    this.initKeyboard();
    this.initMouse();
    this.updateFromCamera();
  }

  private updateFromCamera(): void {
    // Read rotation quat directly — worldMatrix may not be updated yet at construction.
    const forward = this.camera.transform.getForward();
    const len = Vec3.len(forward);
    if (len > 0) {
      this.yaw = Math.atan2(forward.x, forward.z);
      this.pitch = Math.asin(Math.max(-1, Math.min(1, forward.y / len)));
    }
  }

  private initKeyboard(): void {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
    });

    window.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.speed += e.deltaY * -0.01;
        this.speed = Math.max(
          this.minSpeed,
          Math.min(this.maxSpeed, this.speed),
        );
      },
      { passive: false },
    );
  }

  private initMouse(): void {
    this.canvas.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;

      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;

      this.yaw += dx * this.sensitivity;
      this.pitch -= dy * this.sensitivity;
      this.pitch = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, this.pitch),
      );

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      this.camera.needsUpdate = true;
    });

    document.addEventListener("mouseup", () => {
      this.isDragging = false;
    });
    document.addEventListener("mouseleave", () => {
      this.isDragging = false;
    });
  }

  update(deltaTime: number): void {
    // Build orientation quaternion directly from yaw/pitch — no target point needed.
    // Yaw rotates around world Y; pitch rotates around local X (applied after yaw).
    const qYaw = Quat.fromAxisAngle(FlyControls.WORLD_UP, this.yaw);
    const qPitch = Quat.fromAxisAngle(FlyControls.WORLD_RIGHT, -this.pitch);
    const q = Quat.multiply(qYaw, qPitch);

    // Derive movement basis from the combined quaternion.
    const forward = Vec3.transformQuat(FlyControls.WORLD_FORWARD, q);
    const right = Vec3.transformQuat(FlyControls.WORLD_RIGHT, q);
    const up = Vec3.transformQuat(FlyControls.WORLD_UP, q);

    const actualSpeed = this.keys.has("shift") ? this.speed * 2 : this.speed;
    const moveSpeed = actualSpeed * deltaTime;
    const movement = new Vec3(0, 0, 0);
    let hasMoved = false;

    if (this.keys.has("w")) {
      Vec3.addScaled(movement, forward, +moveSpeed, movement);
      hasMoved = true;
    }
    if (this.keys.has("s")) {
      Vec3.addScaled(movement, forward, -moveSpeed, movement);
      hasMoved = true;
    }
    if (this.keys.has("a")) {
      Vec3.addScaled(movement, right, -moveSpeed, movement);
      hasMoved = true;
    }
    if (this.keys.has("d")) {
      Vec3.addScaled(movement, right, +moveSpeed, movement);
      hasMoved = true;
    }
    if (this.keys.has("q")) {
      Vec3.addScaled(movement, up, -moveSpeed, movement);
      hasMoved = true;
    }
    if (this.keys.has("e")) {
      Vec3.addScaled(movement, up, +moveSpeed, movement);
      hasMoved = true;
    }

    if (hasMoved) {
      const pos = this.camera.transform.translation;
      this.camera.transform.setPosition(
        pos.x + movement.x,
        pos.y + movement.y,
        pos.z + movement.z,
      );
    }

    // Apply orientation directly — bypasses Transform.lookAt entirely.
    this.camera.transform.setRotationQuat(q.x, q.y, q.z, q.w);

    if (hasMoved) {
      this.camera.needsUpdate = true;
    }
  }

  getSpeed(): number {
    return this.speed;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(this.minSpeed, Math.min(this.maxSpeed, speed));
  }
}
