# WebGL 2D Sandbox Game

This project is a 2D sandbox game developed using WebGL, HTML, and JavaScript. It features a procedurally generated world with various block types, player movement, and interaction mechanics.

## Features

*   **WebGL Rendering:** The game utilizes WebGL for efficient 2D rendering of the game world, player, and UI elements.
*   **Procedural World Generation:**
    *   Terrain is generated using Simplex noise, creating varied landscapes.
    *   Caves are carved out using another layer of Simplex noise.
    *   Ores (e.g., Coal Ore) are distributed within stone blocks.
    *   Small ponds of water are generated on the surface.
*   **Player Mechanics:**
    *   Movement: Walk left/right, jump.
    *   Swimming: Player can swim in water with different physics (slower gravity, swim up).
    *   Collision Detection: Player interacts with solid blocks.
*   **Block Interaction:**
    *   Digging: Player can dig blocks within a certain range.
    *   Inventory: Collected blocks (Dirt, Stone, Coal Ore) are added to the player's inventory.
*   **User Interface:**
    *   Item Belt: A hotbar-style UI displays selected items and their counts.
    *   Digging Cursor: A wireframe cursor highlights the block the mouse is hovering over, indicating diggable range.
*   **Dynamic Water:** Water blocks have basic physics, allowing them to flow downwards and sideways into empty spaces.
*   **Camera System:** The camera follows the player and is clamped within the world boundaries.

## Files

*   `index.html`: The main HTML file that sets up the canvas and includes the JavaScript.
*   `main.js`: Contains all the game logic, including WebGL setup, world generation, player controls, rendering, and game loop.

## How to Run

1.  Ensure you have a modern web browser that supports WebGL.
2.  Open the `index.html` file in your web browser.

## Gameplay Controls

*   **A / Left Arrow:** Move player left.
*   **D / Right Arrow:** Move player right.
*   **W / Space Bar:** Jump (on ground) or Swim Up (in water).
*   **Mouse Click:** Dig the highlighted block.

## Future Development (Potential Ideas)

*   Block placement.
*   Crafting system.
*   More block types and biomes.
*   Enemies and combat.
*   Saving and loading game state.
*   More sophisticated UI.
*   test
