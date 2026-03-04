import { Vec3, Mat4 } from "../math";

/**
 * Diagnostic utility to validate cascading shadow frustum calculations
 */

export function validateCascadeTransformation(
  eye: Vec3,
  center: Vec3,
  up: Vec3,
  corners: Vec3[],
  cascadeIndex: number = 0
) {
  console.log(`\n=== FRUSTUM VALIDATION CASCADE ${cascadeIndex} ===`);
  console.log(`Eye:    (${eye.x.toFixed(3)}, ${eye.y.toFixed(3)}, ${eye.z.toFixed(3)})`);
  console.log(`Center: (${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)})`);
  console.log(`Up:     (${up.x.toFixed(3)}, ${up.y.toFixed(3)}, ${up.z.toFixed(3)})`);

  const viewMatrix = Mat4.lookAt(eye, center, up);
  console.log(`\nView Matrix (column-major):`);
  const d = viewMatrix.data;
  console.log(
    `[${d[0].toFixed(3)}, ${d[4].toFixed(3)}, ${d[8].toFixed(3)}, ${d[12].toFixed(3)}]`
  );
  console.log(
    `[${d[1].toFixed(3)}, ${d[5].toFixed(3)}, ${d[9].toFixed(3)}, ${d[13].toFixed(3)}]`
  );
  console.log(
    `[${d[2].toFixed(3)}, ${d[6].toFixed(3)}, ${d[10].toFixed(3)}, ${d[14].toFixed(3)}]`
  );
  console.log(
    `[${d[3].toFixed(3)}, ${d[7].toFixed(3)}, ${d[11].toFixed(3)}, ${d[15].toFixed(3)}]`
  );

  // Transform first 4 corners (near plane from camera)
  console.log(`\nTransforming first 4 corners (camera near plane):`);
  let minZ = Infinity;
  let maxZ = -Infinity;
  
  for (let i = 0; i < Math.min(4, corners.length); i++) {
    const world = corners[i];
    const viewSpace = Vec3.transformMat4(world, viewMatrix);
    console.log(
      `  World [${world.x.toFixed(2)}, ${world.y.toFixed(2)}, ${world.z.toFixed(2)}] ` +
      `→ View [${viewSpace.x.toFixed(3)}, ${viewSpace.y.toFixed(3)}, ${viewSpace.z.toFixed(3)}]`
    );
    minZ = Math.min(minZ, viewSpace.z);
    maxZ = Math.max(maxZ, viewSpace.z);
  }

  console.log(
    `\nZ range (first 4): [${minZ.toFixed(3)}, ${maxZ.toFixed(3)}]`
  );
  console.log(
    `Expected: All Z should be NEGATIVE in view space (right-hand, -Z is forward)`
  );
  if (maxZ > 0) {
    console.warn(`⚠️  WARNING: Some Z coordinates are positive - transformation may be incorrect!`);
  }
}
