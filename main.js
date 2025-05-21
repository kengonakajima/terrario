// Get the canvas element
const canvas = document.getElementById('webgl-canvas');
canvas.width = 800;
canvas.height = 600;

// Camera object
const camera = {
  x: 0,
  y: 0,
  width: canvas.width,
  height: canvas.height
};

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
const WORLD_WIDTH = 256; // blocks
const WORLD_HEIGHT = 128; // blocks
const BLOCK_SIZE_PIXELS = 20;

// Block types mapping
const BLOCK_TYPES = {
  AIR: 0,
  DIRT: 1,
  STONE: 2,
  WATER: 3, // New water block type
  COAL_ORE: 4, // New coal ore block type
  // GRASS: 5, // Example for future expansion
};

const BLOCK_COLORS = {
  [BLOCK_TYPES.AIR]: [0.0, 0.0, 0.0, 0.0], // Fully transparent
  [BLOCK_TYPES.DIRT]: [0.5, 0.25, 0.15, 1.0], // Brown color for dirt
  [BLOCK_TYPES.STONE]: [0.5, 0.5, 0.5, 1.0], // Grey color for stone
  [BLOCK_TYPES.WATER]: [0.2, 0.5, 1.0, 0.7], // Semi-transparent blue for water
  [BLOCK_TYPES.COAL_ORE]: [0.3, 0.3, 0.3, 1.0], // Dark grey for coal ore
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
const WATER_GRAVITY_MULTIPLIER = 0.4; // Player feels lighter in water
const SWIM_UP_FORCE = 3.5; // Upward velocity applied when swimming up
const MAX_WATER_FALL_SPEED = 2;   // Slower maximum fall speed in water

// UI Constants
const BELT_SLOT_SIZE = 40; // Size of the square slot
const BELT_SLOT_X = (canvas.width / 2) - (BELT_SLOT_SIZE / 2); // Centered horizontally
const BELT_SLOT_Y = canvas.height - BELT_SLOT_SIZE - 10; // Near bottom, 10px padding
const BELT_ITEM_MARGIN = 4; // Margin for the item inside the slot

// Terrain Generation Constants
const SURFACE_SCALE_FACTOR = 30.0; // How "stretched" or "smooth" the terrain surface is. Larger numbers = smoother.
const SURFACE_BASE_HEIGHT = WORLD_HEIGHT / 2; // Average height of the terrain.
const SURFACE_AMPLITUDE = WORLD_HEIGHT / 4;   // Max deviation from base height.
const DIRT_LAYER_THICKNESS = 4; // How many blocks of dirt form the top layer.
const SURFACE_NOISE_SEED_Y = 0.5; // A fixed Y value for the 2D noise to get 1D-like behavior for surface.

// Cave Generation Constants
const CAVE_SCALE_FACTOR = 15.0; // Smaller scale for more detailed cave patterns.
const CAVE_THRESHOLD = 0.6;    // Noise values above this become caves. Range is [-1, 1], so 0.6 means rarer.

// Ore Generation Constant
const COAL_ORE_CHANCE = 0.05; // 5% chance for a stone block to be coal ore

// Player object
const player = {
  x: (WORLD_WIDTH * BLOCK_SIZE_PIXELS) / 2 - (BLOCK_SIZE_PIXELS * 0.8) / 2, // Centered, accounting for player width
  y: Math.floor(WORLD_HEIGHT / 3) * BLOCK_SIZE_PIXELS - (BLOCK_SIZE_PIXELS * 0.8), // Start on the surface of the first dirt layer
  width: BLOCK_SIZE_PIXELS * 0.8,
  height: BLOCK_SIZE_PIXELS * 0.8,
  velocityX: 0,
  velocityY: 0,
  isGrounded: false,
  color: [0.2, 0.5, 1.0, 1.0], // Light blue
  inventory: {
    [BLOCK_TYPES.COAL_ORE]: 0
  }
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

  // --- Ore Generation ---
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      if (worldGrid[y][x] === BLOCK_TYPES.STONE) {
        if (Math.random() < COAL_ORE_CHANCE) {
          worldGrid[y][x] = BLOCK_TYPES.COAL_ORE;
        }
      }
    }
  }
  // --- End Ore Generation ---

  // --- Pond Generation (Simplified from prompt) ---
  const POND_CHANCE = 0.05; // Chance to attempt pond creation at a column
  const POND_WIDTH = 5;    // Max width of the pond
  const POND_DEPTH = 3;    // Max depth of the pond

  for (let x_pond_center = 0; x_pond_center < WORLD_WIDTH; x_pond_center++) {
    if (Math.random() < POND_CHANCE) {
      // Find the surface Y at this column's center (top of DIRT/STONE)
      let surfaceY_at_center = 0;
      for (let y_scan = 0; y_scan < WORLD_HEIGHT; y_scan++) {
        if (worldGrid[y_scan][x_pond_center] !== BLOCK_TYPES.AIR) {
          surfaceY_at_center = y_scan;
          break;
        }
      }

      // If there's space above ground (surfaceY_at_center > 0)
      if (surfaceY_at_center > 0) {
        // Potential pond starts at (x_pond_center, surfaceY_at_center - 1) and goes up
        for (let py = surfaceY_at_center - 1; py >= Math.max(0, surfaceY_at_center - POND_DEPTH); py--) {
          for (let px = Math.max(0, x_pond_center - Math.floor(POND_WIDTH / 2)); px < Math.min(WORLD_WIDTH, x_pond_center + Math.ceil(POND_WIDTH / 2)); px++) {
            // Check if the block to fill is currently AIR
            if (worldGrid[py][px] === BLOCK_TYPES.AIR) {
              // Ensure there's ground or existing water below it to hold the new water block
              // Also check that the block at (py+1, px) is within world bounds.
              if (py + 1 < WORLD_HEIGHT && (
                  worldGrid[py+1][px] === BLOCK_TYPES.DIRT ||
                  worldGrid[py+1][px] === BLOCK_TYPES.STONE ||
                  worldGrid[py+1][px] === BLOCK_TYPES.WATER )) {
                   worldGrid[py][px] = BLOCK_TYPES.WATER;
              }
            }
          }
        }
      }
    }
  }
  // --- End Pond Generation ---

  console.log("World initialized with noise-based terrain, caves, ores, and ponds."); // For debugging
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

  // Enable blending for transparency
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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

    // Calculate the visible range of blocks
    let startCol = Math.floor(camera.x / BLOCK_SIZE_PIXELS);
    let endCol = Math.min(startCol + Math.ceil(camera.width / BLOCK_SIZE_PIXELS) + 1, WORLD_WIDTH);
    let startRow = Math.floor(camera.y / BLOCK_SIZE_PIXELS);
    let endRow = Math.min(startRow + Math.ceil(camera.height / BLOCK_SIZE_PIXELS) + 1, WORLD_HEIGHT);

    // Clamp to world boundaries (ensure they don't go negative)
    startCol = Math.max(0, startCol);
    startRow = Math.max(0, startRow);

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

    // Set global uniforms that don't change per block (or player, unless overridden)
    gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
    
    // --- Render World Blocks ---
    gl.uniform2f(blockSizeUniformLocation, BLOCK_SIZE_PIXELS, BLOCK_SIZE_PIXELS); // Set for blocks

    for (let y = startRow; y < endRow; y++) {
      for (let x = startCol; x < endCol; x++) {
        const blockType = worldGrid[y][x];

        if (blockType === BLOCK_TYPES.AIR) {
          continue; // Don't draw air blocks
        }

        const blockWorldX = x * BLOCK_SIZE_PIXELS;
        const blockWorldY = y * BLOCK_SIZE_PIXELS;

        const screenX = blockWorldX - camera.x;
        const screenY = blockWorldY - camera.y;

        gl.uniform2f(translationUniformLocation, screenX, screenY);
        gl.uniform4fv(colorUniformLocation, BLOCK_COLORS[blockType]);

        gl.drawArrays(gl.TRIANGLES, 0, 6); // 6 vertices for the two triangles forming a square
      }
    }
    // --- End Render World Blocks ---

    // --- Render Player ---
    // positionAttributeLocation should still be enabled and blockVertexBuffer bound
    // vertexAttribPointer is already set up from rendering blocks

    const playerScreenX = player.x - camera.x;
    const playerScreenY = player.y - camera.y;

    // Set player-specific uniforms
    gl.uniform2f(translationUniformLocation, playerScreenX, playerScreenY);
    gl.uniform2f(blockSizeUniformLocation, player.width, player.height); // Player specific size
    gl.uniform4fv(colorUniformLocation, player.color);

    // Draw the player
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // --- End Render Player ---

    // --- Render UI Elements (Fixed Position, Not Affected by Camera) ---
    // Ensure vertex attributes are still set up (they should be from player/world rendering)
    // gl.enableVertexAttribArray(positionAttributeLocation);
    // gl.bindBuffer(gl.ARRAY_BUFFER, blockVertexBuffer);
    // gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    // u_resolution is already set correctly for screen space

    // Draw Slot Background
    gl.uniform2f(translationUniformLocation, BELT_SLOT_X, BELT_SLOT_Y);
    gl.uniform2f(blockSizeUniformLocation, BELT_SLOT_SIZE, BELT_SLOT_SIZE);
    gl.uniform4fv(colorUniformLocation, [0.2, 0.2, 0.2, 0.7]); // Semi-transparent dark grey
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Draw Item in Slot (if present)
    if (player.inventory[BLOCK_TYPES.COAL_ORE] > 0) {
      const itemSize = BELT_SLOT_SIZE - BELT_ITEM_MARGIN * 2;
      const itemX = BELT_SLOT_X + BELT_ITEM_MARGIN;
      const itemY = BELT_SLOT_Y + BELT_ITEM_MARGIN;

      gl.uniform2f(translationUniformLocation, itemX, itemY);
      gl.uniform2f(blockSizeUniformLocation, itemSize, itemSize);
      gl.uniform4fv(colorUniformLocation, BLOCK_COLORS[BLOCK_TYPES.COAL_ORE]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    // --- End Render UI Elements ---

  }
  // --- End of renderWorld function ---

  // --- Player Update Logic ---
  function updatePlayer() {
    const inWater = isPlayerInWater();
    player.isGrounded = false; // Reset before collision checks

    // 1. Apply Gravity (modified for water)
    if (inWater) {
      player.velocityY += GRAVITY * WATER_GRAVITY_MULTIPLIER;
      if (player.velocityY > MAX_WATER_FALL_SPEED) {
        player.velocityY = MAX_WATER_FALL_SPEED;
      }
    } else {
      player.velocityY += GRAVITY;
      if (player.velocityY > MAX_FALL_SPEED) {
        player.velocityY = MAX_FALL_SPEED;
      }
    }

    // 2. Handle horizontal movement input
    player.velocityX = 0;
    if (keysPressed['ArrowLeft'] || keysPressed['KeyA']) {
      player.velocityX -= PLAYER_MOVE_SPEED; // Allows cancellation if both pressed
    }
    if (keysPressed['ArrowRight'] || keysPressed['KeyD']) {
      player.velocityX += PLAYER_MOVE_SPEED; // Allows cancellation if both pressed
    }
    // Clamp horizontal speed if necessary, or adjust logic if direct override is preferred.
    // For now, additive is fine. Max speed could be enforced by clamping player.velocityX here.


    // 3. Update positions based on velocity (pre-collision)
    player.x += player.velocityX;
    player.y += player.velocityY;

    // 4. Handle collisions with the world (sets isGrounded, adjusts x,y, velocities)
    handleCollisions(); 

    // 5. Handle Jump (on ground) or Swim (in water) input
    if (inWater) {
      if (keysPressed['Space'] || keysPressed['KeyW']) {
        player.velocityY = -SWIM_UP_FORCE; 
        // Not resetting keysPressed for continuous swim up.
      }
    } else { // Not in water - regular ground jump
      if ((keysPressed['Space'] || keysPressed['KeyW']) && player.isGrounded) {
        player.velocityY = -JUMP_FORCE;
        if (keysPressed['Space']) keysPressed['Space'] = false;
        if (keysPressed['KeyW']) keysPressed['KeyW'] = false;
      }
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

  // --- Helper function to check if player is in water ---
  function isPlayerInWater() {
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    
    const blockAtPlayerCenter = getBlockFromPixelCoords(playerCenterX, playerCenterY);
    
    return blockAtPlayerCenter === BLOCK_TYPES.WATER;
  }
  // --- End Helper function to check if player is in water ---

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

    if (block_type_below !== BLOCK_TYPES.AIR && block_type_below !== BLOCK_TYPES.WATER && player.velocityY >= 0) {
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

    if (block_type_above !== BLOCK_TYPES.AIR && block_type_above !== BLOCK_TYPES.WATER && player.velocityY < 0) {
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

    if (block_type_right !== BLOCK_TYPES.AIR && block_type_right !== BLOCK_TYPES.WATER && player.velocityX > 0) {
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

    if (block_type_left !== BLOCK_TYPES.AIR && block_type_left !== BLOCK_TYPES.WATER && player.velocityX < 0) {
      const block_gx_left = Math.floor(p_left / BLOCK_SIZE_PIXELS);
      player.x = (block_gx_left + 1) * BLOCK_SIZE_PIXELS;
      player.velocityX = 0;
    }
  }
  // --- End Collision Detection and Response ---

  // --- Water Physics Update ---

  function processWaterBlock(x, y) {
    if (worldGrid[y][x] === BLOCK_TYPES.WATER) {
      // 1. Try to flow down
      if (y + 1 < WORLD_HEIGHT && worldGrid[y+1][x] === BLOCK_TYPES.AIR) {
        worldGrid[y+1][x] = BLOCK_TYPES.WATER;
        worldGrid[y][x] = BLOCK_TYPES.AIR;
        return; // Block moved down, process next block
      }

      // 2. If no downward flow, try to flow sideways
      // Randomly choose a side to check first to avoid bias if both sides are open
      let checkLeftFirst = Math.random() < 0.5;

      if (checkLeftFirst) {
        // Try left (slope flow)
        if (x - 1 >= 0 && worldGrid[y][x-1] === BLOCK_TYPES.AIR) {
          if (y + 1 < WORLD_HEIGHT && worldGrid[y+1][x-1] === BLOCK_TYPES.AIR) {
              worldGrid[y][x-1] = BLOCK_TYPES.WATER;
              worldGrid[y][x] = BLOCK_TYPES.AIR;
              return; // Block moved left
          }
        }
        // Then try right (slope flow)
        if (x + 1 < WORLD_WIDTH && worldGrid[y][x+1] === BLOCK_TYPES.AIR) {
           if (y + 1 < WORLD_HEIGHT && worldGrid[y+1][x+1] === BLOCK_TYPES.AIR) {
              worldGrid[y][x+1] = BLOCK_TYPES.WATER;
              worldGrid[y][x] = BLOCK_TYPES.AIR;
              return; // Block moved right
          }
        }
      } else { // Check right first (slope flow)
        // Try right
        if (x + 1 < WORLD_WIDTH && worldGrid[y][x+1] === BLOCK_TYPES.AIR) {
          if (y + 1 < WORLD_HEIGHT && worldGrid[y+1][x+1] === BLOCK_TYPES.AIR) {
              worldGrid[y][x+1] = BLOCK_TYPES.WATER;
              worldGrid[y][x] = BLOCK_TYPES.AIR;
              return; // Block moved right
          }
        }
        // Then try left (slope flow)
        if (x - 1 >= 0 && worldGrid[y][x-1] === BLOCK_TYPES.AIR) {
          if (y + 1 < WORLD_HEIGHT && worldGrid[y+1][x-1] === BLOCK_TYPES.AIR) {
              worldGrid[y][x-1] = BLOCK_TYPES.WATER;
              worldGrid[y][x] = BLOCK_TYPES.AIR;
              return; // Block moved left
          }
        }
      }

      // 3. If no slope flow, try leveling flow
      // (Order doesn't matter as much here as it's an 'else if' type of condition for the remaining logic)
      if (checkLeftFirst) { 
          // Try left (leveling)
          if (x - 1 >= 0 && worldGrid[y][x-1] === BLOCK_TYPES.AIR) { 
              worldGrid[y][x-1] = BLOCK_TYPES.WATER;
              worldGrid[y][x] = BLOCK_TYPES.AIR;
              return; 
          }
          // Then try right (leveling, if not moved left)
          if (x + 1 < WORLD_WIDTH && worldGrid[y][x+1] === BLOCK_TYPES.AIR) {
             worldGrid[y][x+1] = BLOCK_TYPES.WATER;
             worldGrid[y][x] = BLOCK_TYPES.AIR;
             return;
         }
      } else { // Check right first (leveling)
          // Try right
          if (x + 1 < WORLD_WIDTH && worldGrid[y][x+1] === BLOCK_TYPES.AIR) {
             worldGrid[y][x+1] = BLOCK_TYPES.WATER;
             worldGrid[y][x] = BLOCK_TYPES.AIR;
             return;
         }
          // Then try left (leveling, if not moved right)
          if (x - 1 >= 0 && worldGrid[y][x-1] === BLOCK_TYPES.AIR) {
             worldGrid[y][x-1] = BLOCK_TYPES.WATER;
             worldGrid[y][x] = BLOCK_TYPES.AIR;
             return; 
         }
      }
    }
  }

  function updateWater() {
    // Iterate from second to last row upwards, and alternate x-direction for somewhat stabler sideways spread
    for (let y = WORLD_HEIGHT - 2; y >= 0; y--) {
      // Alternate x-direction for each row to help with spread dynamics
      if (y % 2 === 0) { // Even rows: left-to-right
        for (let x = 0; x < WORLD_WIDTH; x++) {
          processWaterBlock(x, y);
        }
      } else { // Odd rows: right-to-left
        for (let x = WORLD_WIDTH - 1; x >= 0; x--) {
          processWaterBlock(x, y);
        }
      }
    }
  }
  // --- End Water Physics Update ---

  // --- Camera Update ---
  function updateCamera() {
    // Target camera position to center the player
    let targetX = player.x + player.width / 2 - camera.width / 2;
    let targetY = player.y + player.height / 2 - camera.height / 2;

    // Clamp camera position to world boundaries
    // World total pixel dimensions
    const worldPixelWidth = WORLD_WIDTH * BLOCK_SIZE_PIXELS;
    const worldPixelHeight = WORLD_HEIGHT * BLOCK_SIZE_PIXELS;

    camera.x = Math.max(0, Math.min(targetX, worldPixelWidth - camera.width));
    camera.y = Math.max(0, Math.min(targetY, worldPixelHeight - camera.height));
  }
  // --- End Camera Update ---

  // --- Game Loop ---
  function gameLoop() {
    updatePlayer(); // Update player state based on input and physics
    updateWater();  // Update water physics
    updateCamera(); // Update camera position
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
    const rect = canvas.getBoundingClientRect();
    const canvasClickX = event.clientX - rect.left;
    const canvasClickY = event.clientY - rect.top;

    const worldClickX = canvasClickX + camera.x;
    const worldClickY = canvasClickY + camera.y;

    const gx = Math.floor(worldClickX / BLOCK_SIZE_PIXELS);
    const gy = Math.floor(worldClickY / BLOCK_SIZE_PIXELS);

    return { gx, gy };
  }

  // Event listener for mouse clicks on the canvas
  canvas.addEventListener('mousedown', function(event) {
    const { gx, gy } = getClickedGridCoords(event);

    // Check if the click is within the world grid bounds
    if (gx >= 0 && gx < WORLD_WIDTH && gy >= 0 && gy < WORLD_HEIGHT) {
      // Check if the block is not already air
      if (worldGrid[gy][gx] !== BLOCK_TYPES.AIR) {
        console.log(`Digging block at: (${gx}, ${gy}) of type ${worldGrid[gy][gx]}`);
        
        // Check if the block being dug is COAL_ORE
        if (worldGrid[gy][gx] === BLOCK_TYPES.COAL_ORE) {
          player.inventory[BLOCK_TYPES.COAL_ORE]++;
          console.log(`Collected COAL_ORE. Total: ${player.inventory[BLOCK_TYPES.COAL_ORE]}`);
        }
        
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
