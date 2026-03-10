# @digitalmeadow/webgpu-renderer

Minimal WebGPU renderer for 3D graphics

## Installation

```bash
npm install @digitalmeadow/webgpu-renderer
```

## Features

- Built for WebGPU
- Dependency-free
- Minimal API

## Usage

```typescript
import { Renderer, Scene, Camera } from "@digitalmeadow/webgpu-renderer";

const renderer = new Renderer({ canvas: document.querySelector("canvas") });
const scene = new Scene();
const camera = new Camera();

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

animate();
```