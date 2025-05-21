// Get the canvas element
const canvas = document.getElementById('webgl-canvas');

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

// Function to initialize the world
function initializeWorld() {
  worldGrid = new Array(WORLD_HEIGHT);
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    worldGrid[y] = new Array(WORLD_WIDTH);
    for (let x = 0; x < WORLD_WIDTH; x++) {
      if (y < WORLD_HEIGHT / 3) {
        worldGrid[y][x] = BLOCK_TYPES.AIR;
      } else if (y < (WORLD_HEIGHT * 2) / 3) {
        worldGrid[y][x] = BLOCK_TYPES.DIRT;
      } else {
        worldGrid[y][x] = BLOCK_TYPES.STONE;
      }
    }
  }
  console.log("World initialized:", worldGrid); // For debugging
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
  }
  // --- End of renderWorld function ---

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

  // Initial render
  renderWorld();

} catch (error) {
  console.error(error);
  document.body.innerHTML = `<pre>${error.message}</pre>`; // Display error on the page for easier debugging
}

// Clear the canvas - THIS IS NOW DONE AT THE START OF renderWorld()
// gl.clearColor(0.0, 0.0, 0.0, 1.0); // Black, fully opaque
// gl.clear(gl.COLOR_BUFFER_BIT);
