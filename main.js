// Get the canvas element
const canvas = document.getElementById('webgl-canvas');
canvas.width = 800;
canvas.height = 600;

// Initialize WebGL rendering context
let gl;
try {
  gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
} catch (e) {
  // Fallback for no WebGL support
}

if (!gl) {
  document.body.innerHTML = 'WebGL is not supported in your browser. Please use a modern browser like Chrome or Firefox.';
  throw new Error('WebGL not supported');
}

// World representation constants
const WORLD_WIDTH = 50; // blocks
const WORLD_HEIGHT = 30; // blocks
const BLOCK_SIZE_PIXELS = 20;

// Block types mapping
const BLOCK_TYPES = {
  AIR: 0,
  DIRT: 1,
  STONE: 2,
  // GRASS: 3, // Example for future expansion
};

const BLOCK_COLORS = {
  [BLOCK_TYPES.AIR]: [0.0, 0.0, 0.0, 0.0], // Fully transparent
  [BLOCK_TYPES.DIRT]: [0.5, 0.25, 0.15, 1.0], // Brown color for dirt
  [BLOCK_TYPES.STONE]: [0.5, 0.5, 0.5, 1.0], // Grey color for stone
  // [BLOCK_TYPES.GRASS]: [0.0, 0.8, 0.0, 1.0],
};

// World grid
let worldGrid = [];

// Keyboard input state
const keysPressed = {};

// Movement and Physics constants
const PLAYER_MOVE_SPEED = 3;    // pixels per frame
const JUMP_FORCE = 10;          // initial upward velocity for a jump
const GRAVITY = 0.5;            // pixels per frame per frame
const MAX_FALL_SPEED = 10;      // maximum downward velocity

// Terrain Generation Constants
const SURFACE_SCALE_FACTOR = 30.0; // How "stretched" or "smooth" the terrain surface is. Larger numbers = smoother.
const SURFACE_BASE_HEIGHT = WORLD_HEIGHT / 2; // Average height of the terrain.
const SURFACE_AMPLITUDE = WORLD_HEIGHT / 4;   // Max deviation from base height.
const DIRT_LAYER_THICKNESS = 4; // How many blocks of dirt form the top layer.
const SURFACE_NOISE_SEED_Y = 0.5; // A fixed Y value for the 2D noise to get 1D-like behavior for surface.

// Cave Generation Constants
const CAVE_SCALE_FACTOR = 15.0; // Smaller scale for more detailed cave patterns.
const CAVE_THRESHOLD = 0.6;    // Noise values above this become caves. Range is [-1, 1], so 0.6 means rarer.

// Player object
const player = {
  x: (WORLD_WIDTH * BLOCK_SIZE_PIXELS) / 2 - (BLOCK_SIZE_PIXELS * 0.8) / 2, // Centered, accounting for player width
  y: Math.floor(WORLD_HEIGHT / 3) * BLOCK_SIZE_PIXELS - (BLOCK_SIZE_PIXELS * 0.8), // Start on the surface of the first dirt layer
  width: BLOCK_SIZE_PIXELS * 0.8,
  height: BLOCK_SIZE_PIXELS * 0.8,
  velocityX: 0,
  velocityY: 0,
  isGrounded: false,
  color: [0.2, 0.5, 1.0, 1.0] // Light blue
};

// --- Simplex Noise Start ---
// Based on https://raw.githubusercontent.com/jwagner/simplex-noise.js/main/simplex-noise.ts
// Adapted to plain JavaScript

const SQRT3 = Math.sqrt(3.0);
const SQRT5 = Math.sqrt(5.0);
const F2 = 0.5 * (SQRT3 - 1.0);
const G2 = (3.0 - SQRT3) / 6.0;
const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;
const F4 = (SQRT5 - 1.0) / 4.0;
const G4 = (5.0 - SQRT5) / 20.0;

const fastFloor = (x) => Math.floor(x) | 0;

const grad2 = new Float64Array([1, 1,
  -1, 1,
  1, -1,

  -1, -1,
  1, 0,
  -1, 0,

  1, 0,
  -1, 0,
  0, 1,

  0, -1,
  0, 1,
  0, -1]);

const grad3 = new Float64Array([1, 1, 0,
  -1, 1, 0,
  1, -1, 0,

  -1, -1, 0,
  1, 0, 1,
  -1, 0, 1,

  1, 0, -1,
  -1, 0, -1,
  0, 1, 1,

  0, -1, 1,
  0, 1, -1,
  0, -1, -1]);

const grad4 = new Float64Array([0, 1, 1, 1, 0, 1, 1, -1, 0, 1, -1,
 1, 0, 1, -1, -1,
  0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1,
  1, 0, 1, 1, 1, 0, 1, -1, 1, 0, -1, 1, 1, 0, -1, -1,
  -1, 0, 1, 1, -1, 0, 1, -1, -1, 0, -1, 1, -1, 0, -1, -1,
  1, 1, 0, 1, 1, 1, 0, -1, 1, -1, 0, 1, 1, -1, 0, -1,
  -1, 1, 0, 1, -1, 1, 0, -1, -1, -1, 0, 1, -1, -1, 0, -1,
  1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0,
  -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1, 0]);

function createNoise2D(random = Math.random) {
  const perm = buildPermutationTable(random);
  const permGrad2x = new Float64Array(perm).map(v => grad2[(v % 12) * 2]);
  const permGrad2y = new Float64Array(perm).map(v => grad2[(v % 12) * 2 + 1]);
  return function noise2D(x, y) {
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    const s = (x + y) * F2;
    const i = fastFloor(x + s);
    const j = fastFloor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    let i1, j1;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi0 = ii + perm[jj];
      const g0x = permGrad2x[gi0];
      const g0y = permGrad2y[gi0];
      t0 *= t0;
      n0 = t0 * t0 * (g0x * x0 + g0y * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi1 = ii + i1 + perm[jj + j1];
      const g1x = permGrad2x[gi1];
      const g1y = permGrad2y[gi1];
      t1 *= t1;
      n1 = t1 * t1 * (g1x * x1 + g1y * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi2 = ii + 1 + perm[jj + 1];
      const g2x = permGrad2x[gi2];
      const g2y = permGrad2y[gi2];
      t2 *= t2;
      n2 = t2 * t2 * (g2x * x2 + g2y * y2);
    }
    return 70.0 * (n0 + n1 + n2);
  };
}

function createNoise3D(random = Math.random) {
  const perm = buildPermutationTable(random);
  const permGrad3x = new Float64Array(perm).map(v => grad3[(v % 12) * 3]);
  const permGrad3y = new Float64Array(perm).map(v => grad3[(v % 12) * 3 + 1]);
  const permGrad3z = new Float64Array(perm).map(v => grad3[(v % 12) * 3 + 2]);
  return function noise3D(x, y, z) {
    let n0, n1, n2, n3;
    const s = (x + y + z) * F3;
    const i = fastFloor(x + s);
    const j = fastFloor(y + s);
    const k = fastFloor(z + s);
    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    const z0 = z - Z0;
    let i1, j1, k1;
    let i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3;
    const y2 = y0 - j2 + 2.0 * G3;
    const z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3;
    const y3 = y0 - 1.0 + 3.0 * G3;
    const z3 = z0 - 1.0 + 3.0 * G3;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0.0;
    else {
      const gi0 = ii + perm[jj + perm[kk]];
      t0 *= t0;
      n0 = t0 * t0 * (permGrad3x[gi0] * x0 + permGrad3y[gi0] * y0 + permGrad3z[gi0] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0.0;
    else {
      const gi1 = ii + i1 + perm[jj + j1 + perm[kk + k1]];
      t1 *= t1;
      n1 = t1 * t1 * (permGrad3x[gi1] * x1 + permGrad3y[gi1] * y1 + permGrad3z[gi1] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0.0;
    else {
      const gi2 = ii + i2 + perm[jj + j2 + perm[kk + k2]];
      t2 *= t2;
      n2 = t2 * t2 * (permGrad3x[gi2] * x2 + permGrad3y[gi2] * y2 + permGrad3z[gi2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0.0;
    else {
      const gi3 = ii + 1 + perm[jj + 1 + perm[kk + 1]];
      t3 *= t3;
      n3 = t3 * t3 * (permGrad3x[gi3] * x3 + permGrad3y[gi3] * y3 + permGrad3z[gi3] * z3);
    }
    return 32.0 * (n0 + n1 + n2 + n3);
  };
}

function createNoise4D(random = Math.random) {
  const perm = buildPermutationTable(random);
  const permGrad4x = new Float64Array(perm).map(v => grad4[(v % 32) * 4]);
  const permGrad4y = new Float64Array(perm).map(v => grad4[(v % 32) * 4 + 1]);
  const permGrad4z = new Float64Array(perm).map(v => grad4[(v % 32) * 4 + 2]);
  const permGrad4w = new Float64Array(perm).map(v => grad4[(v % 32) * 4 + 3]);
  return function noise4D(x, y, z, w) {
    let n0, n1, n2, n3, n4;
    const s = (x + y + z + w) * F4;
    const i = fastFloor(x + s);
    const j = fastFloor(y + s);
    const k = fastFloor(z + s);
    const l = fastFloor(w + s);
    const t = (i + j + k + l) * G4;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const W0 = l - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    const z0 = z - Z0;
    const w0 = w - W0;
    let rankx = 0;
    let ranky = 0;
    let rankz = 0;
    let rankw = 0;
    if (x0 > y0) rankx++; else ranky++;
    if (x0 > z0) rankx++; else rankz++;
    if (x0 > w0) rankx++; else rankw++;
    if (y0 > z0) ranky++; else rankz++;
    if (y0 > w0) ranky++; else rankw++;
    if (z0 > w0) rankz++; else rankw++;
    const i1 = rankx >= 3 ? 1 : 0;
    const j1 = ranky >= 3 ? 1 : 0;
    const k1 = rankz >= 3 ? 1 : 0;
    const l1 = rankw >= 3 ? 1 : 0;
    const i2 = rankx >= 2 ? 1 : 0;
    const j2 = ranky >= 2 ? 1 : 0;
    const k2 = rankz >= 2 ? 1 : 0;
    const l2 = rankw >= 2 ? 1 : 0;
    const i3 = rankx >= 1 ? 1 : 0;
    const j3 = ranky >= 1 ? 1 : 0;
    const k3 = rankz >= 1 ? 1 : 0;
    const l3 = rankw >= 1 ? 1 : 0;
    const x1 = x0 - i1 + G4;
    const y1 = y0 - j1 + G4;
    const z1 = z0 - k1 + G4;
    const w1 = w0 - l1 + G4;
    const x2 = x0 - i2 + 2.0 * G4;
    const y2 = y0 - j2 + 2.0 * G4;
    const z2 = z0 - k2 + 2.0 * G4;
    const w2 = w0 - l2 + 2.0 * G4;
    const x3 = x0 - i3 + 3.0 * G4;
    const y3 = y0 - j3 + 3.0 * G4;
    const z3 = z0 - k3 + 3.0 * G4;
    const w3 = w0 - l3 + 3.0 * G4;
    const x4 = x0 - 1.0 + 4.0 * G4;
    const y4 = y0 - 1.0 + 4.0 * G4;
    const z4 = z0 - 1.0 + 4.0 * G4;
    const w4 = w0 - 1.0 + 4.0 * G4;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const ll = l & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
    if (t0 < 0) n0 = 0.0;
    else {
      const gi0 = ii + perm[jj + perm[kk + perm[ll]]];
      t0 *= t0;
      n0 = t0 * t0 * (permGrad4x[gi0] * x0 + permGrad4y[gi0] * y0 + permGrad4z[gi0] * z0 + permGrad4w[gi0] * w0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
    if (t1 < 0) n1 = 0.0;
    else {
      const gi1 = ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]];
      t1 *= t1;
      n1 = t1 * t1 * (permGrad4x[gi1] * x1 + permGrad4y[gi1] * y1 + permGrad4z[gi1] * z1 + permGrad4w[gi1] * w1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
    if (t2 < 0) n2 = 0.0;
    else {
      const gi2 = ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]];
      t2 *= t2;
      n2 = t2 * t2 * (permGrad4x[gi2] * x2 + permGrad4y[gi2] * y2 + permGrad4z[gi2] * z2 + permGrad4w[gi2] * w2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
    if (t3 < 0) n3 = 0.0;
    else {
      const gi3 = ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]];
      t3 *= t3;
      n3 = t3 * t3 * (permGrad4x[gi3] * x3 + permGrad4y[gi3] * y3 + permGrad4z[gi3] * z3 + permGrad4w[gi3] * w3);
    }
    let t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
    if (t4 < 0) n4 = 0.0;
    else {
      const gi4 = ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]];
      t4 *= t4;
      n4 = t4 * t4 * (permGrad4x[gi4] * x4 + permGrad4y[gi4] * y4 + permGrad4z[gi4] * z4 + permGrad4w[gi4] * w4);
    }
    return 27.0 * (n0 + n1 + n2 + n3 + n4);
  };
}

function buildPermutationTable(random) {
  const tableSize = 512;
  const p = new Uint8Array(tableSize);
  for (let i = 0; i < tableSize / 2; i++) {
    p[i] = i;
  }
  for (let i = 0; i < tableSize / 2 - 1; i++) {
    const r = i + ~~(random() * (256 - i));
    const aux = p[i];
    p[i] = p[r];
    p[r] = aux;
  }
  for (let i = 256; i < tableSize; i++) {
    p[i] = p[i - 256];
  }
  return p;
}
// --- Simplex Noise End ---

const noise2D = createNoise2D(Math.random);

// Function to initialize the world
function initializeWorld() {
  worldGrid = new Array(WORLD_HEIGHT);
  for (let x = 0; x < WORLD_WIDTH; x++) {
    // Calculate surface height for this column
    const noiseValue = noise2D(x / SURFACE_SCALE_FACTOR, SURFACE_NOISE_SEED_Y);
    // Using the corrected mapping: noiseValue is already [-1, 1], so SURFACE_AMPLITUDE is deviation in one direction.
    let surfaceY = Math.floor(SURFACE_BASE_HEIGHT + noiseValue * SURFACE_AMPLITUDE);

    // Clamp surfaceY to ensure it's within drawable world bounds and leaves space for dirt/stone
    const minSurfaceY = 1; // Must be at least 1 to have air above
    const maxSurfaceY = WORLD_HEIGHT - DIRT_LAYER_THICKNESS -1; // Must leave space for dirt and at least one stone layer
    surfaceY = Math.max(minSurfaceY, Math.min(maxSurfaceY, surfaceY));

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      if (x === 0) { // Initialize row arrays only once
         worldGrid[y] = new Array(WORLD_WIDTH);
      }

      if (y < surfaceY) {
        worldGrid[y][x] = BLOCK_TYPES.AIR;
      } else if (y < surfaceY + DIRT_LAYER_THICKNESS) {
        worldGrid[y][x] = BLOCK_TYPES.DIRT;
      } else {
        worldGrid[y][x] = BLOCK_TYPES.STONE;
      }
    }
  }

  // --- Cave Generation ---
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      // Only consider carving caves in areas that are currently DIRT or STONE
      if (worldGrid[y][x] === BLOCK_TYPES.DIRT || worldGrid[y][x] === BLOCK_TYPES.STONE) {
        // Use different scaling for cave noise compared to surface noise
        // noise2D typically returns values between -1 and 1
        const caveNoiseValue = noise2D(x / CAVE_SCALE_FACTOR, y / CAVE_SCALE_FACTOR);

        if (caveNoiseValue > CAVE_THRESHOLD) {
          worldGrid[y][x] = BLOCK_TYPES.AIR; // Carve out a cave block
        }
      }
    }
  }
  // --- End Cave Generation ---

  console.log("World initialized with noise-based terrain and caves."); // For debugging
}

// Vertex Shader source code
const vsSource = `
  attribute vec2 a_position; // Input vertex position (in block units, 0 to 1)
  uniform vec2 u_resolution; // Canvas resolution in pixels
  uniform vec2 u_translation;  // Top-left corner of the block in pixels
  uniform vec2 u_blockSize;    // Size of the block in pixels

  void main() {
    // Scale position by block size, then translate
    vec2 pixel_pos = a_position * u_blockSize + u_translation;

    // Convert from pixel space to clip space (0 to resolution -> 0 to 2 -> -1 to 1)
    vec2 zeroToOne = pixel_pos / u_resolution;
    vec2 zeroToTwo = zeroToOne * 2.0;
    vec2 clipSpace = zeroToTwo - 1.0;

    // Output to gl_Position. WebGL Y is bottom-up, so flip Y.
    gl_Position = vec4(clipSpace * vec2(1, -1), 0.0, 1.0);
  }
`;

// Fragment Shader source code
const fsSource = `
  precision mediump float;
  uniform vec4 u_color; // Color for the block

  void main() {
    gl_FragColor = u_color;
  }
`;

// Helper function to compile a shader
function compileShader(gl, source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const errorMsg = 'An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(errorMsg);
  }
  return shader;
}

// Helper function to link shaders into a program
function linkProgram(gl, vs, fs) {
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const errorMsg = 'Unable to initialize the shader program: ' + gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(errorMsg);
  }
  return program;
}

// Main part: Create and use the shader program
try {
  // Initialize the world data first
  initializeWorld();

  const vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
  const shaderProgram = linkProgram(gl, vertexShader, fragmentShader);
  gl.useProgram(shaderProgram);

  // Get attribute and uniform locations
  const positionAttributeLocation = gl.getAttribLocation(shaderProgram, "a_position");
  const resolutionUniformLocation = gl.getUniformLocation(shaderProgram, "u_resolution");
  const translationUniformLocation = gl.getUniformLocation(shaderProgram, "u_translation");
  const blockSizeUniformLocation = gl.getUniformLocation(shaderProgram, "u_blockSize");
  const colorUniformLocation = gl.getUniformLocation(shaderProgram, "u_color");

  // Setup square vertices (unit square)
  const blockVertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, blockVertexBuffer);
  const squareVertices = [
    // First triangle
    0.0, 0.0,
    1.0, 0.0,
    0.0, 1.0,
    // Second triangle
    0.0, 1.0,
    1.0, 0.0,
    1.0, 1.0,
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(squareVertices), gl.STATIC_DRAW);

  // --- renderWorld function ---
  function renderWorld() {
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Black, fully opaque
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Enable the attribute
    gl.enableVertexAttribArray(positionAttributeLocation);
    // Bind the position buffer.
    gl.bindBuffer(gl.ARRAY_BUFFER, blockVertexBuffer);
    // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
    gl.vertexAttribPointer(
        positionAttributeLocation,
        2,          // 2 components per iteration (x, y)
        gl.FLOAT,   // the data is 32bit floats
        false,      // don't normalize the data
        0,          // 0 = move forward size * sizeof(type) each iteration to get the next position
        0           // 0 = start at the beginning of the buffer
    );

    // Set global uniforms that don't change per block
    gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
    gl.uniform2f(blockSizeUniformLocation, BLOCK_SIZE_PIXELS, BLOCK_SIZE_PIXELS);

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let x = 0; x < WORLD_WIDTH; x++) {
        const blockType = worldGrid[y][x];

        if (blockType === BLOCK_TYPES.AIR) {
          continue; // Don't draw air blocks
        }

        const blockX = x * BLOCK_SIZE_PIXELS;
        const blockY = y * BLOCK_SIZE_PIXELS;

        gl.uniform2f(translationUniformLocation, blockX, blockY);
        gl.uniform4fv(colorUniformLocation, BLOCK_COLORS[blockType]);

        gl.drawArrays(gl.TRIANGLES, 0, 6); // 6 vertices for the two triangles forming a square
      }
    }

    // --- Render Player ---
    // positionAttributeLocation should still be enabled and blockVertexBuffer bound
    // vertexAttribPointer is already set up from rendering blocks

    // Set player-specific uniforms
    gl.uniform2f(translationUniformLocation, player.x, player.y);
    gl.uniform2f(blockSizeUniformLocation, player.width, player.height);
    gl.uniform4fv(colorUniformLocation, player.color);

    // Draw the player
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // --- End Render Player ---

  }
  // --- End of renderWorld function ---

  // --- Player Update Logic ---
  function updatePlayer() {
    // 1. Assume not grounded, reset before collision checks
    player.isGrounded = false;

    // 2. Apply physics: gravity
    player.velocityY += GRAVITY;
    if (player.velocityY > MAX_FALL_SPEED) {
      player.velocityY = MAX_FALL_SPEED;
    }

    // 3. Apply physics: update vertical position (pre-collision)
    player.y += player.velocityY;

    // 4. Handle horizontal input and update horizontal position (pre-collision)
    player.velocityX = 0;
    if (keysPressed['ArrowLeft'] || keysPressed['KeyA']) {
      player.velocityX = -PLAYER_MOVE_SPEED;
    }
    if (keysPressed['ArrowRight'] || keysPressed['KeyD']) {
      player.velocityX = PLAYER_MOVE_SPEED; // Right input overrides left if both active
    }
    player.x += player.velocityX;

    // 5. Handle collisions with the world
    // This function will adjust player.x, player.y if a collision occurs,
    // and importantly, it will set player.isGrounded = true if the player is on a surface.
    handleCollisions(); 

    // 6. Process jump input *after* collisions have been handled and isGrounded is correctly set
    if ((keysPressed['Space'] || keysPressed['KeyW']) && player.isGrounded) {
      player.velocityY = -JUMP_FORCE; 
      if (keysPressed['Space']) keysPressed['Space'] = false;
      if (keysPressed['KeyW']) keysPressed['KeyW'] = false;
      // player.isGrounded = false; // Optional: force isGrounded to false immediately after a jump if desired. Omitted for now.
    }
  }
  // --- End Player Update Logic ---

  // --- Helper function to get block type from pixel coordinates ---
  function getBlockFromPixelCoords(pixelX, pixelY) {
    const gx = Math.floor(pixelX / BLOCK_SIZE_PIXELS);
    const gy = Math.floor(pixelY / BLOCK_SIZE_PIXELS);

    // Boundary checks
    if (gx < 0 || gx >= WORLD_WIDTH || gy < 0 || gy >= WORLD_HEIGHT) {
      return BLOCK_TYPES.AIR; // Treat out-of-bounds as air (player can fall out)
      // Alternative: return a special "SOLID_BOUNDARY" type if desired
    }
    return worldGrid[gy][gx];
  }
  // --- End Helper Function ---

  // --- Collision Detection and Response ---
  function handleCollisions() {
    // Player's bounding box points
    let p_left = player.x;
    let p_right = player.x + player.width;
    let p_top = player.y;
    let p_bottom = player.y + player.height;

    // --- Vertical Collision Detection & Response (Bottom - for landing/ground) ---
    const mid_bottom_x = player.x + player.width / 2;
    // Check slightly ahead for landing to prevent minor sinking before correction
    const block_type_below = getBlockFromPixelCoords(mid_bottom_x, p_bottom + 0.1); 

    if (block_type_below !== BLOCK_TYPES.AIR && player.velocityY >= 0) {
      const block_gy_below = Math.floor(p_bottom / BLOCK_SIZE_PIXELS);
      player.y = block_gy_below * BLOCK_SIZE_PIXELS - player.height;
      player.velocityY = 0;
      player.isGrounded = true;
    }
    // Update p_bottom and p_top after potential vertical adjustment before top collision check
    p_top = player.y; 
    p_bottom = player.y + player.height;


    // --- Vertical Collision Detection & Response (Top - for hitting head) ---
    const mid_top_x = player.x + player.width / 2;
    const block_type_above = getBlockFromPixelCoords(mid_top_x, p_top - 0.1); // Check slightly ahead

    if (block_type_above !== BLOCK_TYPES.AIR && player.velocityY < 0) {
      const block_gy_above = Math.floor(p_top / BLOCK_SIZE_PIXELS);
      player.y = (block_gy_above + 1) * BLOCK_SIZE_PIXELS;
      player.velocityY = 0;
    }

    // Re-calculate player box after all vertical adjustments for horizontal checks
    p_left = player.x; // player.x hasn't changed yet in this function
    p_right = player.x + player.width;
    p_top = player.y; // player.y might have changed
    p_bottom = player.y + player.height;


    // --- Horizontal Collision Detection & Response (Right) ---
    const mid_right_y = player.y + player.height / 2;
    // Check slightly ahead for side collision
    const block_type_right = getBlockFromPixelCoords(p_right + 0.1, mid_right_y); 

    if (block_type_right !== BLOCK_TYPES.AIR && player.velocityX > 0) {
      const block_gx_right = Math.floor(p_right / BLOCK_SIZE_PIXELS);
      player.x = block_gx_right * BLOCK_SIZE_PIXELS - player.width;
      player.velocityX = 0;
    }
    // Update p_left and p_right after potential horizontal adjustment before left collision check
    p_left = player.x;
    p_right = player.x + player.width;


    // --- Horizontal Collision Detection & Response (Left) ---
    const mid_left_y = player.y + player.height / 2;
    const block_type_left = getBlockFromPixelCoords(p_left - 0.1, mid_left_y); // Check slightly ahead

    if (block_type_left !== BLOCK_TYPES.AIR && player.velocityX < 0) {
      const block_gx_left = Math.floor(p_left / BLOCK_SIZE_PIXELS);
      player.x = (block_gx_left + 1) * BLOCK_SIZE_PIXELS;
      player.velocityX = 0;
    }
  }
  // --- End Collision Detection and Response ---

  // --- Game Loop ---
  function gameLoop() {
    updatePlayer(); // Update player state based on input and physics

    renderWorld(); // Renders both world and player
    requestAnimationFrame(gameLoop);
  }
  // --- End Game Loop ---

  // --- Event Listeners for Keyboard Input ---
  window.addEventListener('keydown', function(event) {
    keysPressed[event.code] = true;
  });

  window.addEventListener('keyup', function(event) {
    keysPressed[event.code] = false;
  });
  // --- End Event Listeners ---

  // --- Block Digging ---

  // Helper function to get grid coordinates from a mouse click event
  function getClickedGridCoords(event) {
    const rect = canvas.getBoundingClientRect(); // Gets canvas position and size
    const clickX = event.clientX - rect.left;    // Click X relative to canvas
    const clickY = event.clientY - rect.top;     // Click Y relative to canvas

    const gx = Math.floor(clickX / BLOCK_SIZE_PIXELS);
    const gy = Math.floor(clickY / BLOCK_SIZE_PIXELS);

    return { gx, gy };
  }

  // Event listener for mouse clicks on the canvas
  canvas.addEventListener('mousedown', function(event) {
    const { gx, gy } = getClickedGridCoords(event);

    // Check if the click is within the world grid bounds
    if (gx >= 0 && gx < WORLD_WIDTH && gy >= 0 && gy < WORLD_HEIGHT) {
      // Check if the block is not already air
      if (worldGrid[gy][gx] !== BLOCK_TYPES.AIR) {
        console.log(`Digging block at: (${gx}, ${gy})`);
        worldGrid[gy][gx] = BLOCK_TYPES.AIR;
        renderWorld(); // Redraw the world to show the change
      }
    } else {
      console.log(`Clicked outside world bounds at pixel: (${event.offsetX}, ${event.offsetY}) -> grid: (${gx}, ${gy})`);
    }
  });
  // --- End of Block Digging ---

  // Start the game loop
  gameLoop();

} catch (error) {
  console.error(error);
  document.body.innerHTML = `<pre>${error.message}</pre>`; // Display error on the page for easier debugging
}

// Clear the canvas - THIS IS NOW DONE AT THE START OF renderWorld()
// gl.clearColor(0.0, 0.0, 0.0, 1.0); // Black, fully opaque
// gl.clear(gl.COLOR_BUFFER_BIT);
