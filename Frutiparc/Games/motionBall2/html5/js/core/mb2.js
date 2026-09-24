/*
 * MotionBall 2 - HTML5 port
 *
 * Global namespace.
 *
 * The port is made of plain scripts (no modules, no bundler) so that the game
 * can also be opened straight from the disk (file://), where browsers refuse
 * to load ES modules. Every file adds its classes / objects to this single
 * global object ; index.html loads the files in dependency order.
 *
 * See docs/ARCHITECTURE.md for the overall design.
 */
"use strict";

// eslint-disable-next-line no-var
var MB2 = {};
