// Vertex buffer
struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv_coords: vec2<f32>,
    @location(3) joint_indices: vec4<f32>,
    @location(4) joint_weights: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vertex_position: vec4<f32>,
    @location(1) vertex_normal: vec4<f32>,
    @location(2) uv_mesh: vec2<f32>,
    @location(3) depth: f32,
};

// Uniforms
// Context uniforms
struct ContextUniforms {
    time_duration: f32,
    time_delta: f32,
    screen_size: vec2<f32>,
    render_size: vec2<f32>,
}

@group(0) @binding(0)
var<uniform> context_uniforms: ContextUniforms;

// Camera uniforms
struct CameraUniforms {
    view_projection_matrix: mat4x4<f32>,
    position: vec4<f32>,
    near: f32,
    far: f32,
}

@group(1) @binding(0)
var<uniform> camera_uniforms: CameraUniforms;

// Mesh uniforms
struct MeshUniforms {
    model_transform_matrix: mat4x4<f32>,
    joint_matrices: array<mat4x4<f32>, 128>, // MAX_JOINTS = 128
    apply_skinning: u32,
}

@group(2) @binding(0)
var<uniform> mesh_uniforms: MeshUniforms;

@vertex
fn vs_main(
    in: VertexInput,
) -> VertexOutput {
    var skin_matrix = mat4x4<f32>(
        in.joint_weights.x * mesh_uniforms.joint_matrices[i32(in.joint_indices.x)] +
        in.joint_weights.y * mesh_uniforms.joint_matrices[i32(in.joint_indices.y)] +
        in.joint_weights.z * mesh_uniforms.joint_matrices[i32(in.joint_indices.z)] +
        in.joint_weights.w * mesh_uniforms.joint_matrices[i32(in.joint_indices.w)]
    );

    // Note: All values output are automatically interpolated across the triangle (modern shader language behaviour)
    var output: VertexOutput;

    let skinned_position: vec4<f32> = skin_matrix * in.position;
    // Conditionally apply skinning
    var final_position: vec4<f32> = select(in.position, skinned_position, bool(mesh_uniforms.apply_skinning));

    let model_position: vec4<f32> = mesh_uniforms.model_transform_matrix * final_position;

    // Scale back to the original space
    output.vertex_position = model_position;
    var clip_position = camera_uniforms.view_projection_matrix * model_position;

    // Snap to pixel grid
    // https://www.w3.org/TR/webgpu/#coordinate-systems
    // Normalized device coordinates (NDC) range from -1 to 1 so 2 / length gives pixel size
    let render_width = context_uniforms.render_size.x;
    let render_height = context_uniforms.render_size.y;
    let pixel_size_ndc: vec2<f32> = vec2<f32>(2.0 / render_width, 2.0 / render_height);

    // Convert to NDC
    var ndc_position = clip_position.xyz / clip_position.w;

    // Snap to the nearest pixel in NDC
    ndc_position.x = round(ndc_position.x / pixel_size_ndc.x) * pixel_size_ndc.x;
    ndc_position.y = round(ndc_position.y / pixel_size_ndc.y) * pixel_size_ndc.y;

    // Convert back to clip space
    clip_position = vec4<f32>(ndc_position * clip_position.w, clip_position.w);
    output.position = clip_position;

    // Recalculate the normal albedo on the model matrix (works only for uniform scaling by exploiting w=0)
    let normal: vec3<f32> = (mesh_uniforms.model_transform_matrix * vec4(in.normal.xyz, 0.0)).xyz;
    output.vertex_normal = vec4<f32>(normal, 0.0);

    // Fog
    let depth = map_range(clip_position.z, camera_uniforms.near, camera_uniforms.far, 0.0, 1.0);
    output.depth = depth;

    // UVs
    output.uv_mesh = in.uv_coords;

    return output;
}

@group(2) @binding(1)
var albedo_sampler: sampler;

@group(2) @binding(2)
var albedo_texture: texture_2d<f32>;

@group(2) @binding(3)
var metalness_roughness_sampler: sampler;

@group(2) @binding(4)
var metalness_roughness_texture: texture_2d<f32>;

@group(2) @binding(5)
var environment_sampler: sampler;

@group(2) @binding(6)
var environment_texture: texture_cube<f32>;

// Fragment shader
@fragment
fn fs_main(
    in: VertexOutput,
) -> @location(0) vec4<f32> {
    // Vectors
    let normal: vec3<f32> = normalize(in.vertex_normal.xyz);
    let view: vec3<f32> = normalize(camera_uniforms.position.xyz - in.vertex_position.xyz);  // Subtraction gets a vector pointing from the vertex to the eye

    // Texture
    let albedo: vec4<f32> = textureSample(albedo_texture, albedo_sampler, in.uv_mesh);

    // Metalness = b channel, Roughness = g channel
    let metalness_roughness: vec4<f32> = textureSample(metalness_roughness_texture, metalness_roughness_sampler, in.uv_mesh);
    let metalness = metalness_roughness.b;
    let roughness = metalness_roughness.g;

    // For our simple renderer, we use metalness as reflectivity instead of PBR metalness
    let reflectivity = metalness;
    
    // Sample environment map from reflection vector
    let reflection_vector = reflect(-view, normal);

    // Use mipmaps to sample varying resolution
    let environment_high_res = textureSampleLevel(environment_texture, environment_sampler, reflection_vector, 0.0);
    let environment_low_res = textureSampleLevel(environment_texture, environment_sampler, reflection_vector, 3.0);

    // Use roughness to control the resolution mix of reflections (rougher = low-res blurry reflections)
    let reflection = mix(environment_high_res, environment_low_res, roughness);

    // Lighting
    // Basic fake downward lighting
    let light_dir = normalize(vec3<f32>(0.0, 1.0, 0.0)); // Light from above (+Y)
    let diffuse = max(dot(normal, light_dir), 0.0);

    let ambient = 0.2;
    let upward_normal = dot(normal, vec3<f32>(0.0, 1.0, 0.0));
    let lighting = ambient + (1.0 - ambient) * diffuse;
    let albedo_lit = albedo.rgb * lighting;

    // Combine albedo and environment
    // Add reflection to albedo to lost less albedo color
    let reflection_albedo_mix = albedo_lit + reflection.rgb;
    var color = mix(albedo_lit, reflection_albedo_mix, reflectivity);

    let luminosity = dot(vec3(0.2126, 0.7152, 0.0722), color.rgb);
    let colorDithered = coloredDither(in.position.xy, color, context_uniforms.screen_size, context_uniforms.render_size);
    color = colorDithered;

    return vec4(color, 1.0);
}

fn map_range(value: f32, from_min: f32, from_max: f32, to_min: f32, to_max: f32) -> f32 {
    if from_max == from_min {
        return to_min;
    }
    return to_min + (value - from_min) * (to_max - to_min) / (from_max - from_min);
}

fn random(input: vec2<f32>) -> f32 {
    return fract(sin(dot(input.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// Dithering:  http://alex-charlton.com/posts/Dithering_on_the_GPU/
const bayerDimensions = 4;
fn coloredDither(uv: vec2<f32>, color: vec3<f32>, screen_size: vec2<f32>, render_size: vec2<f32>) -> vec3<f32> {
    var colorHsl = rgb2hsl(color);

    let x = i32(uv.x) % bayerDimensions;
    let y = i32(uv.y) % bayerDimensions;

    // let threshold = bayerMatrix2x2[x][y] + 1.0 / 64.0 + 0.130;
    let threshold = bayerMatrix4x4[x][y] + 1.0 / f32(bayerDimensions * bayerDimensions) + 0.130;
    // let threshold = bayerMatrix8x8[y * bayerDimensions + x] + 1.0 / f32(bayerDimensions * bayerDimensions) + 0.130;;
	
	let colors = closestColors(colorHsl.x);
	
	let hueDiff = hueDistance(colorHsl.x, colors[0].x) / hueDistance(colors[1].x, colors[0].x);
    // let hueDiff = 0.5;
	
	let l1 = lightnessStep(max((colorHsl.z - .125), 0.));
	let l2 = lightnessStep(min((colorHsl.z + .124), 1.));
	let lightnessDiff = (colorHsl.z - l1) / (l2 - l1);
	
    var resultColor = vec3<f32>();
    if (hueDiff < threshold) {
        resultColor = colors[0];
    } else {
        resultColor = colors[1];
    }

    if (lightnessDiff < threshold) {
        resultColor.z = l1;
    } else {
        resultColor.z = l2;
    }
	
	let s1 = saturationStep(max((colorHsl.y - .125), 0.0));
	let s2 = saturationStep(min((colorHsl.y + .124), 1.0));
	let saturationDiff = (colorHsl.y - s1) / (s2 - s1);
	
    if (saturationDiff < threshold) {
        resultColor.y = s1;
    } else {
        resultColor.y = s2;
    }
	
	return hsl2rgb(resultColor);

    // // Debug: output the Bayer matrix value as grayscale
    // let threshold = bayerMatrix4x4[x][y];
    // // let threshold = bayerMatrix8x8[y * bayerDimensions + x];
    // let debug_color = vec3<f32>(threshold);
    // return debug_color;
	
}

fn hsl2rgb(hsl: vec3<f32>) -> vec3<f32> {
    let c = vec3<f32>(fract(hsl.x), clamp(hsl.yz, vec2<f32>(0), vec2<f32>(1)));
    let rgb = clamp(abs((c.x * 6.0 + vec3<f32>(0.0, 4.0, 2.0)) % 6.0 - 3.0) - 1.0, vec3<f32>(0), vec3<f32>(1));
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
}

fn rgb2hsl(c: vec3<f32>) -> vec3<f32> {
	var h = 0.;
	var s = 0.;
	var l = 0.;

	let r = c.r;
	let g = c.g;
	let b = c.b;

	let cMin = min(r, min(g, b));
	let cMax = max(r, max(g, b));
	
	l = (cMax + cMin) / 2.0;

	if (cMax > cMin) {
		let cDelta = cMax - cMin;

        if (l < 0.0) {
            s = cDelta / (cMax+cMin);
        } else {
            s = cDelta / (2.0 - (cMax + cMin));
        }

		if (r == cMax) {
			h = (g - b) / cDelta;
		} else if(g == cMax) {
			h = 2.0 + (b - r) / cDelta;
		} else {
			h = 4.0 + (r - g) / cDelta;
		}
		
		if (h < 0.0) {
			h += 6.0;
		}

		h = h / 6.0;
	}

	return vec3(h, s, l);
}


fn hueDistance(hue1: f32, hue2: f32) -> f32 {
	let diff = abs(hue1 - hue2);
	return min(abs(1.0 - diff), diff);
}

const lightnessSteps = 2.0;

fn lightnessStep(lightness: f32) -> f32 {
	return floor((0.5 + lightness * lightnessSteps)) / lightnessSteps;
}

const saturationSteps = 4.;

fn saturationStep(saturation: f32) -> f32 {
	return floor((0.5 + saturation * saturationSteps)) / saturationSteps;
}

fn closestColors(hue: f32) -> array<vec3<f32>, 2> {
    var closest = vec3(-2.0, 0.0, 0.0);
    var secondClosest = vec3(-2.0, 0.0, 0.0);
    var temp = vec3<f32>();

    for (var i = 0; i < paletteLength; i++) {
        temp = rgb2hsl(palette[i]);
        let tempDistance = hueDistance(temp.x, hue);

        if (tempDistance < hueDistance(closest.x, hue)) {
            secondClosest = closest;
            closest = temp;
        } else {
            if (tempDistance < hueDistance(secondClosest.x, hue)) {
                secondClosest = temp;
            }
        }
    }

    let colors = array<vec3<f32>, 2>(closest, secondClosest);
    return colors;
}

const paletteLength = 1;
const palette = array<vec3<f32>, paletteLength>(
    vec3(0.2, 0.0, 0.0),  // Red
    // vec3(0.0, 1.0, 0.0),  // Green
    // vec3(0.0, 0.0, 1.0),  // Blue
    // vec3(1.0, 1.0, 0.0),  // Yellow
    // vec3(1.0, 0.0, 1.0),  // Magenta
    // vec3(0.0, 1.0, 1.0),  // Cyan
    // vec3(1.0, 0.5, 0.0),  // Orange
    // vec3(0.5, 0.0, 1.0),  // Purple
    // vec3(0.5, 1.0, 0.0),  // Lime
    // vec3(1.0, 0.0, 0.5),  // Pink
    // vec3(0.0, 0.5, 1.0),  // Sky Blue
    // vec3(0.0, 1.0, 0.5),  // Mint
    // vec3(1.0, 0.75, 0.0), // Gold
    // vec3(0.75, 0.0, 1.0), // Violet
    // vec3(0.0, 1.0, 0.75), // Aquamarine
    // vec3(1.0, 0.0, 0.75)  // Rose
);


const bayerMatrix2x2 = mat2x2(
    0.0, 2.0,
    3.0, 1.0
) / 4.0;

const bayerMatrix4x4 = mat4x4(
    0.0,  8.0,  2.0, 10.0,
    12.0, 4.0,  14.0, 6.0,
    3.0,  11.0, 1.0, 9.0,
    15.0, 7.0,  13.0, 5.0
) / 16.0;

// Horizontal stripes
// const bayerMatrix4x4 = mat4x4(
//     0.0,  4.0,  8.0, 12.0,
//     1.0,  5.0,  9.0, 13.0,
//     2.0,  6.0, 10.0, 14.0,
//     3.0,  7.0, 11.0, 15.0
// ) / 16.0;

// Checkerboard / Diagonal
// const bayerMatrix4x4 = mat4x4(
//     0.0,  8.0,  2.0, 10.0,
//     8.0,  0.0, 10.0,  2.0,
//     2.0, 10.0,  0.0,  8.0,
//    10.0,  2.0,  8.0,  0.0
// ) / 16.0;

// Double Grid
// const bayerMatrix4x4 = mat4x4(
//     0.0,  2.0,  10.0, 8.0,
//     0.0,  2.0, 10.0, 8.0,
//     10.0, 8.0,  0.0,  2.0,
//     10.0,  8.0,  0.0,  2.0
// ) / 16.0;

// Vertical bands
// const bayerMatrix4x4 = mat4x4(
//     0.0,  0.0,  0.0,  0.0,
//     4.0,  4.0,  4.0,  4.0,
//     8.0,  8.0,  8.0,  8.0,
//    12.0, 12.0, 12.0, 12.0
// ) / 16.0;

// const bayerMatrix8x8 = array<f32, 64>(
//     0.0/ 64.0, 48.0/ 64.0, 12.0/ 64.0, 60.0/ 64.0,  3.0/ 64.0, 51.0/ 64.0, 15.0/ 64.0, 63.0/ 64.0,
//   32.0/ 64.0, 16.0/ 64.0, 44.0/ 64.0, 28.0/ 64.0, 35.0/ 64.0, 19.0/ 64.0, 47.0/ 64.0, 31.0/ 64.0,
//     8.0/ 64.0, 56.0/ 64.0,  4.0/ 64.0, 52.0/ 64.0, 11.0/ 64.0, 59.0/ 64.0,  7.0/ 64.0, 55.0/ 64.0,
//   40.0/ 64.0, 24.0/ 64.0, 36.0/ 64.0, 20.0/ 64.0, 43.0/ 64.0, 27.0/ 64.0, 39.0/ 64.0, 23.0/ 64.0,
//     2.0/ 64.0, 50.0/ 64.0, 14.0/ 64.0, 62.0/ 64.0,  1.0/ 64.0, 49.0/ 64.0, 13.0/ 64.0, 61.0/ 64.0,
//   34.0/ 64.0, 18.0/ 64.0, 46.0/ 64.0, 30.0/ 64.0, 33.0/ 64.0, 17.0/ 64.0, 45.0/ 64.0, 29.0/ 64.0,
//   10.0/ 64.0, 58.0/ 64.0,  6.0/ 64.0, 54.0/ 64.0,  9.0/ 64.0, 57.0/ 64.0,  5.0/ 64.0, 53.0/ 64.0,
//   42.0/ 64.0, 26.0/ 64.0, 38.0/ 64.0, 22.0/ 64.0, 41.0/ 64.0, 25.0/ 64.0, 37.0/ 64.0, 21.0 / 64.0
// );

// Diagonal bands
// const bayerMatrix8x8 = array<f32, 64>(
//     1.0/64.0,  1.0/64.0,  1.0/64.0,  1.0/64.0,  1.0/64.0,  1.0/64.0,  1.0/64.0,  1.0/64.0,
//     9.0/64.0,  9.0/64.0,  9.0/64.0,  9.0/64.0,  9.0/64.0,  9.0/64.0,  9.0/64.0,  9.0/64.0,
//    17.0/64.0, 17.0/64.0, 17.0/64.0, 17.0/64.0, 17.0/64.0, 17.0/64.0, 17.0/64.0, 17.0/64.0,
//    25.0/64.0, 25.0/64.0, 25.0/64.0, 25.0/64.0, 25.0/64.0, 25.0/64.0, 25.0/64.0, 25.0/64.0,
//    33.0/64.0, 33.0/64.0, 33.0/64.0, 33.0/64.0, 33.0/64.0, 33.0/64.0, 33.0/64.0, 33.0/64.0,
//    41.0/64.0, 41.0/64.0, 41.0/64.0, 41.0/64.0, 41.0/64.0, 41.0/64.0, 41.0/64.0, 41.0/64.0,
//    49.0/64.0, 49.0/64.0, 49.0/64.0, 49.0/64.0, 49.0/64.0, 49.0/64.0, 49.0/64.0, 49.0/64.0,
//    57.0/64.0, 57.0/64.0, 57.0/64.0, 57.0/64.0, 57.0/64.0, 57.0/64.0, 57.0/64.0, 57.0/64.0
// );

// Checkerboard
// const bayerMatrix8x8 = array<f32, 64>(
//     1.0/64.0, 32.0/64.0,  2.0/64.0, 33.0/64.0,  3.0/64.0, 34.0/64.0,  4.0/64.0, 35.0/64.0,
//    32.0/64.0,  1.0/64.0, 33.0/64.0,  2.0/64.0, 34.0/64.0,  3.0/64.0, 35.0/64.0,  4.0/64.0,
//     2.0/64.0, 33.0/64.0,  1.0/64.0, 34.0/64.0,  4.0/64.0, 35.0/64.0,  3.0/64.0, 36.0/64.0,
//    33.0/64.0,  2.0/64.0, 34.0/64.0,  1.0/64.0, 35.0/64.0,  4.0/64.0, 36.0/64.0,  3.0/64.0,
//     3.0/64.0, 34.0/64.0,  4.0/64.0, 35.0/64.0,  1.0/64.0, 32.0/64.0,  2.0/64.0, 33.0/64.0,
//    34.0/64.0,  3.0/64.0, 35.0/64.0,  4.0/64.0, 32.0/64.0,  1.0/64.0, 33.0/64.0,  2.0/64.0,
//     4.0/64.0, 35.0/64.0,  3.0/64.0, 36.0/64.0,  2.0/64.0, 33.0/64.0,  1.0/64.0, 34.0/64.0,
//    35.0/64.0,  4.0/64.0, 36.0/64.0,  3.0/64.0, 33.0/64.0,  2.0/64.0, 34.0/64.0,  1.0/64.0
// );

// Horizontal
const bayerMatrix8x8 = array<f32, 64>(
    1.0/64.0,  1.0/64.0,  1.0/64.0,  1.0/64.0,  1.0/64.0,  1.0/64.0,  1.0/64.0,  1.0/64.0,
    9.0/64.0,  9.0/64.0,  9.0/64.0,  9.0/64.0,  9.0/64.0,  9.0/64.0,  9.0/64.0,  9.0/64.0,
   17.0/64.0, 17.0/64.0, 17.0/64.0, 17.0/64.0, 17.0/64.0, 17.0/64.0, 17.0/64.0, 17.0/64.0,
   25.0/64.0, 25.0/64.0, 25.0/64.0, 25.0/64.0, 25.0/64.0, 25.0/64.0, 25.0/64.0, 25.0/64.0,
   33.0/64.0, 33.0/64.0, 33.0/64.0, 33.0/64.0, 33.0/64.0, 33.0/64.0, 33.0/64.0, 33.0/64.0,
   41.0/64.0, 41.0/64.0, 41.0/64.0, 41.0/64.0, 41.0/64.0, 41.0/64.0, 41.0/64.0, 41.0/64.0,
   49.0/64.0, 49.0/64.0, 49.0/64.0, 49.0/64.0, 49.0/64.0, 49.0/64.0, 49.0/64.0, 49.0/64.0,
   57.0/64.0, 57.0/64.0, 57.0/64.0, 57.0/64.0, 57.0/64.0, 57.0/64.0, 57.0/64.0, 57.0/64.0
);