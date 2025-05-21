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
    if (keysPressed['ArrowLeft']) {
      player.velocityX = -PLAYER_MOVE_SPEED;
    }
    if (keysPressed['ArrowRight']) {
      player.velocityX = PLAYER_MOVE_SPEED;
    }
    player.x += player.velocityX;

    // 5. Handle collisions with the world
    // This function will adjust player.x, player.y if a collision occurs,
    // and importantly, it will set player.isGrounded = true if the player is on a surface.
    handleCollisions(); 

    // 6. Process jump input *after* collisions have been handled and isGrounded is correctly set
    if (keysPressed['Space'] && player.isGrounded) {
      player.velocityY = -JUMP_FORCE; 
      keysPressed['Space'] = false; // Prevent continuous jump if space is held
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
