import { Vertex } from "./Vertex";

export class Geometry {
  public vertices: Vertex[];
  public indices: number[];

  public vertexBuffer: GPUBuffer;
  public indexBuffer: GPUBuffer;
  public vertexCount: number;
  public indexCount: number;

  constructor(device: GPUDevice, vertices: Vertex[], indices: number[]) {
    this.vertices = vertices;
    this.indices = indices;
    this.vertexCount = vertices.length;
    this.indexCount = indices.length;

    const vertexData = this.getVertexData();
    this.vertexBuffer = device.createBuffer({
      label: "geometry-vertex-buffer",
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vertexBuffer, 0, vertexData.buffer);

    this.indexBuffer = device.createBuffer({
      label: "geometry-index-buffer",
      size: new Uint32Array(indices).byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.indexBuffer, 0, new Uint32Array(indices));
  }

  public getVertexData(): Float32Array {
    const data = new Float32Array(
      this.vertices.length * (Vertex.vertexSize / 4),
    );
    this.vertices.forEach((v, i) => {
      data.set(v.toArray(), i * (Vertex.vertexSize / 4));
    });
    return data;
  }
}
