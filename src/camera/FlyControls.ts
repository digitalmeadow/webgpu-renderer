import { Vec3 } from "../math";

export class FlyControls {
  private canvas: HTMLCanvasElement;
  private camera: any;

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

  constructor(canvas: HTMLCanvasElement, camera: any) {
    this.canvas = canvas;
    this.camera = camera;

    this.initKeyboard();
    this.initMouse();

    this.updateFromCamera();
  }

  private updateFromCamera(): void {
    const forward = Vec3.sub(this.camera.target, this.camera.position);
    const len = Vec3.len(forward);
    this.yaw = Math.atan2(forward.x, forward.z);
    this.pitch = Math.asin(forward.y / len);
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

      const deltaX = e.clientX - this.lastMouseX;
      const deltaY = e.clientY - this.lastMouseY;

      this.yaw -= deltaX * this.sensitivity;
      this.pitch -= deltaY * this.sensitivity;
      this.pitch = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, this.pitch),
      );

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    document.addEventListener("mouseup", () => {
      this.isDragging = false;
    });

    document.addEventListener("mouseleave", () => {
      this.isDragging = false;
    });
  }

  update(deltaTime: number): void {
    // Calculate forward direction from camera orientation
    let forward = Vec3.sub(this.camera.target, this.camera.position);
    Vec3.normalize(forward, forward);

    // Calculate right vector from forward cross world up
    const worldUp = new Vec3(0, 1, 0);
    let right = Vec3.cross(forward, worldUp);
    Vec3.normalize(right, right);

    // Calculate local up from right cross forward
    let localUp = Vec3.cross(right, forward);
    Vec3.normalize(localUp, localUp);

    const actualSpeed = this.keys.has("shift") ? this.speed * 2 : this.speed;
    const moveSpeed = actualSpeed * deltaTime;

    // Calculate movement using local vectors
    const movement = new Vec3(0, 0, 0);

    if (this.keys.has("w")) {
      movement.x += forward.x * moveSpeed;
      movement.y += forward.y * moveSpeed;
      movement.z += forward.z * moveSpeed;
    }
    if (this.keys.has("s")) {
      movement.x -= forward.x * moveSpeed;
      movement.y -= forward.y * moveSpeed;
      movement.z -= forward.z * moveSpeed;
    }
    if (this.keys.has("a")) {
      movement.x -= right.x * moveSpeed;
      movement.y -= right.y * moveSpeed;
      movement.z -= right.z * moveSpeed;
    }
    if (this.keys.has("d")) {
      movement.x += right.x * moveSpeed;
      movement.y += right.y * moveSpeed;
      movement.z += right.z * moveSpeed;
    }
    if (this.keys.has("q")) {
      movement.x -= localUp.x * moveSpeed;
      movement.y -= localUp.y * moveSpeed;
      movement.z -= localUp.z * moveSpeed;
    }
    if (this.keys.has("e")) {
      movement.x += localUp.x * moveSpeed;
      movement.y += localUp.y * moveSpeed;
      movement.z += localUp.z * moveSpeed;
    }

    // Apply movement
    this.camera.position.x += movement.x;
    this.camera.position.y += movement.y;
    this.camera.position.z += movement.z;

    // Update target based on yaw/pitch
    const target = new Vec3(
      this.camera.position.x + Math.sin(this.yaw) * Math.cos(this.pitch),
      this.camera.position.y + Math.sin(this.pitch),
      this.camera.position.z + Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    this.camera.target.set(target.x, target.y, target.z);
    this.camera.updateView();
  }

  getSpeed(): number {
    return this.speed;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(this.minSpeed, Math.min(this.maxSpeed, speed));
  }
}
