import { vec3 } from 'wgpu-matrix';

export class FlyControls {
  private canvas: HTMLCanvasElement;
  private camera: any;

  private keys: Set<string> = new Set();
  private yaw: number = 0;
  private pitch: number = 0;
  private speed: number = 5;
  private minSpeed: number = 0.5;
  private maxSpeed: number = 50;
  private isPointerLocked: boolean = false;

  constructor(canvas: HTMLCanvasElement, camera: any) {
    this.canvas = canvas;
    this.camera = camera;

    this.initKeyboard();
    this.initMouse();

    this.initFromCamera();
  }

  private initFromCamera(): void {
    const forward = vec3.create();
    vec3.subtract(this.camera.target, this.camera.position, forward);
    const len = vec3.length(forward);
    if (len > 0.0001) {
      this.yaw = Math.atan2(forward[0], forward[2]);
      this.pitch = Math.asin(forward[1] / len);
    }
  }

  private initKeyboard(): void {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.key.toLowerCase());

      if (e.key === "Escape") {
        document.exitPointerLock();
      }
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
    this.canvas.addEventListener("click", () => {
      if (!this.isPointerLocked) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener("pointerlockchange", () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.isPointerLocked) return;

      const sensitivity = 0.002;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;

      this.pitch = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, this.pitch),
      );
    });
  }

  update(deltaTime: number): void {
    if (isNaN(this.yaw) || isNaN(this.pitch)) {
      this.yaw = 0;
      this.pitch = 0;
    }
    
    const forward = vec3.fromValues(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );

    const worldUp = vec3.fromValues(0, 1, 0);
    const right = vec3.create();
    vec3.cross(forward, worldUp, right);
    vec3.normalize(right, right);

    const localUp = vec3.create();
    vec3.cross(right, forward, localUp);
    vec3.normalize(localUp, localUp);

    const actualSpeed = this.keys.has("shift") ? this.speed * 2 : this.speed;
    const moveSpeed = actualSpeed * deltaTime;

    const movement = vec3.create();

    if (this.keys.has("w")) {
      movement[0] += forward[0] * moveSpeed;
      movement[1] += forward[1] * moveSpeed;
      movement[2] += forward[2] * moveSpeed;
    }
    if (this.keys.has("s")) {
      movement[0] -= forward[0] * moveSpeed;
      movement[1] -= forward[1] * moveSpeed;
      movement[2] -= forward[2] * moveSpeed;
    }
    if (this.keys.has("a")) {
      movement[0] -= right[0] * moveSpeed;
      movement[1] -= right[1] * moveSpeed;
      movement[2] -= right[2] * moveSpeed;
    }
    if (this.keys.has("d")) {
      movement[0] += right[0] * moveSpeed;
      movement[1] += right[1] * moveSpeed;
      movement[2] += right[2] * moveSpeed;
    }
    if (this.keys.has("q")) {
      movement[0] -= localUp[0] * moveSpeed;
      movement[1] -= localUp[1] * moveSpeed;
      movement[2] -= localUp[2] * moveSpeed;
    }
    if (this.keys.has("e")) {
      movement[0] += localUp[0] * moveSpeed;
      movement[1] += localUp[1] * moveSpeed;
      movement[2] += localUp[2] * moveSpeed;
    }

    this.camera.position[0] += movement[0];
    this.camera.position[1] += movement[1];
    this.camera.position[2] += movement[2];

    // Update target based on where the camera is now looking
    this.camera.target[0] = this.camera.position[0] + forward[0];
    this.camera.target[1] = this.camera.position[1] + forward[1];
    this.camera.target[2] = this.camera.position[2] + forward[2];

    this.camera.updateProjectionView();
  }

  getSpeed(): number {
    return this.speed;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(this.minSpeed, Math.min(this.maxSpeed, speed));
  }
}
