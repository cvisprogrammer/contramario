# Contra Mario

Mario with a twist: a side-scrolling platformer where you stomp, bump blocks and
grab mushrooms like Mario, while carrying Contra-style weapons.

No build step and no dependencies. Open `index.html` in a browser, or serve the
folder with any static server, e.g. `npx serve .`.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move / 8-way aim | Arrows or WASD | D-pad / left stick |
| Jump (hold for higher) | Z, Space, K | A |
| Fire (hold for auto) | X, J | X / B |
| Run | Shift, C | Shoulders |
| Prone (shoot low, dodge) | Down (standing still) | Down |
| Pause | P, Enter | Start |
| Mute | M | |

Aiming works like Contra. Hold Up to shoot up, Up and a direction for diagonals,
and Down and a direction for low diagonals. In the air, Down shoots straight down.
Jumping does the Contra somersault.

## Weapons

Weapons come from `?` blocks and from flying capsules. Shoot a capsule and its
falcon drops out.

- **N**: the standard rifle.
- **M**: machine gun, full auto.
- **S**: spread gun, five-way shot.
- **L**: laser, a beam that pierces enemies and does double damage.
- **F**: fire gun, corkscrewing fireballs.
- **R**: rapid fire, faster bullets and a faster rate of fire. Stacks with any gun.
- **B**: barrier. You're invincible for a while, and enemies you touch die.

You lose your gun when you die.

## Mario things

- Mushrooms make you big. Getting hit while big shrinks you instead of killing you.
- Big players break bricks by jumping into them. Bullets break bricks and open `?` blocks at any size.
- Stomp combos, kickable shells, coins (100 coins gives a 1UP), a timer, a mid-level checkpoint, and a flagpole and castle at the end.

## Enemies

Grunts, shelled troopers, piranha plants that spit fire, Contra soldiers that
shoot back, rotating pillbox turrets, and the **Defense Wall** boss. The wall has
two cannons and a core, and it blocks the way to the flagpole until you destroy it.
