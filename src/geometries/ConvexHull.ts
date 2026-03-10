export class ConvexHull {
  public vertexPositions: Float32Array;
  public vertexIndices: Uint32Array;

  constructor(vertexPositions: Float32Array, vertexIndices: Uint32Array) {
    // Weld vertices (remove duplicates) based on spatial proximity
    const uniquePositions: number[] = [];
    const oldToNewIndex = new Int32Array(vertexPositions.length / 3);
    const keyToNewIndex = new Map<string, number>();
    const verticesCheck: number[][] = [];

    let uniqueCount = 0;
    for (let i = 0; i < vertexPositions.length; i += 3) {
      const xRound = Math.round(vertexPositions[i] * 1_000_000);
      const yRound = Math.round(vertexPositions[i + 1] * 1_000_000);
      const zRound = Math.round(vertexPositions[i + 2] * 1_000_000);
      const key = `${xRound},${yRound},${zRound}`;

      let newIndex = keyToNewIndex.get(key);
      if (newIndex === undefined) {
        newIndex = uniqueCount++;
        keyToNewIndex.set(key, newIndex);
        uniquePositions.push(
          vertexPositions[i],
          vertexPositions[i + 1],
          vertexPositions[i + 2],
        );
        verticesCheck.push([xRound, yRound, zRound]);
      }
      oldToNewIndex[i / 3] = newIndex;
    }

    const weldedPositions = new Float32Array(uniquePositions);
    const weldedIndices = new Uint32Array(vertexIndices.length);
    for (let i = 0; i < vertexIndices.length; i++) {
      weldedIndices[i] = oldToNewIndex[vertexIndices[i]];
    }

    // Map indices to triangle chunks for validation
    const indicesChunks: [number, number, number][] = [];
    for (let i = 0; i < weldedIndices.length; i += 3) {
      indicesChunks.push([
        weldedIndices[i],
        weldedIndices[i + 1],
        weldedIndices[i + 2],
      ]);
    }

    if (!ConvexHull.checkMesh(verticesCheck, indicesChunks)) {
      throw new Error(
        "Invalid mesh: Mesh is either not closed or topology is mismatched.",
      );
    }

    this.vertexPositions = weldedPositions;
    this.vertexIndices = weldedIndices;
  }

  private static checkMesh(
    vertices: number[][],
    indices: [number, number, number][],
  ): boolean {
    const uniqueVertices = new Set<string>();
    for (const vertex of vertices) {
      const key = `${vertex[0]},${vertex[1]},${vertex[2]}`;
      if (uniqueVertices.has(key)) {
        return false;
      }
      uniqueVertices.add(key);
    }

    const edgeCount = new Map<string, number>();
    for (const triangle of indices) {
      const edges = [
        [triangle[0], triangle[1]],
        [triangle[1], triangle[2]],
        [triangle[2], triangle[0]],
      ];

      for (let i = 0; i < edges.length; i++) {
        let v1 = edges[i][0];
        let v2 = edges[i][1];

        if (v1 > v2) {
          const temp = v1;
          v1 = v2;
          v2 = temp;
        }

        const edgeKey = `${v1},${v2}`;
        edgeCount.set(edgeKey, (edgeCount.get(edgeKey) || 0) + 1);
      }
    }

    for (const count of edgeCount.values()) {
      if (count !== 2) {
        return false;
      }
    }

    return true;
  }
}
