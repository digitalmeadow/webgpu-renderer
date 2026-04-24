import { Vertex, VERTEX_FLOAT_COUNT } from "./Vertex";
import { AABB } from "../math";

export class Geometry {
  public vertices: Vertex[];
  public indices: number[];

  public vertexBuffer: GPUBuffer;
  public indexBuffer: GPUBuffer;
  public vertexCount: number;
  public indexCount: number;

  public aabb: AABB;

  constructor(device: GPUDevice, vertices: Vertex[], indices: number[]) {
    this.vertices = vertices;
    this.indices = indices;
    this.vertexCount = vertices.length;
    this.indexCount = indices.length;

    const vertexData = this.getVertexData();
    this.vertexBuffer = device.createBuffer({
      label: "Geometry Vertex Buffer",
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.vertexBuffer, 0, vertexData);

    const indexData = new Uint32Array(indices);
    this.indexBuffer = device.createBuffer({
      label: "Geometry Index Buffer",
      size: indexData.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.indexBuffer, 0, indexData);

    this.aabb = this.computeAABB();
  }

  private computeAABB(): AABB {
    const aabb = new AABB();
    for (const vertex of this.vertices) {
      aabb.expandByPoint(vertex.position[0], vertex.position[1], vertex.position[2]);
    }
    return aabb;
  }

  private getVertexData(): Float32Array<ArrayBuffer> {
    const data = new Float32Array(this.vertices.length * VERTEX_FLOAT_COUNT) as Float32Array<ArrayBuffer>;
    this.vertices.forEach((v, i) => {
      data.set(v.toArray(), i * VERTEX_FLOAT_COUNT);
    });
    return data;
  }
}
