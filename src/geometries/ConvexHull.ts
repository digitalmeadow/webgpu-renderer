// Importers often produce duplicate boundary vertices; manifold validation requires shared indices.
const WELD_PRECISION = 1_000_000; // 1µm resolution if units are metres

export class ConvexHull {
  public vertexPositions: Float32Array;
  public vertexIndices: Uint32Array;

  constructor(vertexPositions: Float32Array, vertexIndices: Uint32Array) {
    const { positions, indices } = ConvexHull.weldVertices(vertexPositions, vertexIndices);

    if (!ConvexHull.isManifold(indices)) {
      throw new Error("Invalid mesh: not closed or non-manifold edges detected.");
    }

    this.vertexPositions = positions;
    this.vertexIndices = indices;
  }

  private static weldVertices(
    vertexPositions: Float32Array,
    vertexIndices: Uint32Array,
  ): { positions: Float32Array; indices: Uint32Array } {
    const uniquePositions: number[] = [];
    const oldToNewIndex = new Int32Array(vertexPositions.length / 3);
    const keyToNewIndex = new Map<string, number>();

    let uniqueCount = 0;
    for (let i = 0; i < vertexPositions.length; i += 3) {
      const xRound = Math.round(vertexPositions[i] * WELD_PRECISION);
      const yRound = Math.round(vertexPositions[i + 1] * WELD_PRECISION);
      const zRound = Math.round(vertexPositions[i + 2] * WELD_PRECISION);
      const key = `${xRound},${yRound},${zRound}`;

      let newIndex = keyToNewIndex.get(key);
      if (newIndex === undefined) {
        newIndex = uniqueCount++;
        keyToNewIndex.set(key, newIndex);
        uniquePositions.push(vertexPositions[i], vertexPositions[i + 1], vertexPositions[i + 2]);
      }
      oldToNewIndex[i / 3] = newIndex;
    }

    const positions = new Float32Array(uniquePositions);
    const indices = new Uint32Array(vertexIndices.length);
    for (let i = 0; i < vertexIndices.length; i++) {
      indices[i] = oldToNewIndex[vertexIndices[i]];
    }

    return { positions, indices };
  }

  private static isManifold(indices: Uint32Array): boolean {
    const edgeCount = new Map<string, number>();

    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];

      // Each edge keyed with smaller index first so winding direction doesn't matter
      const e0 = a < b ? `${a},${b}` : `${b},${a}`;
      const e1 = b < c ? `${b},${c}` : `${c},${b}`;
      const e2 = c < a ? `${c},${a}` : `${a},${c}`;

      edgeCount.set(e0, (edgeCount.get(e0) ?? 0) + 1);
      edgeCount.set(e1, (edgeCount.get(e1) ?? 0) + 1);
      edgeCount.set(e2, (edgeCount.get(e2) ?? 0) + 1);
    }

    for (const count of edgeCount.values()) {
      if (count !== 2) return false;
    }

    return true;
  }
}
