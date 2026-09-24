/**
 * The boss of each dungeon.
 */

import { Mode } from "../data/enums.js";
import { Octopus } from "./octopus.js";
import { Snake } from "./snake.js";
import { Tourneboule } from "./tourneboule.js";

/** Adventures 1-4 : the snake of their element ; 5 : Tourneboule ; Challenge : the octopus. */
export function createBoss(game) {
	if (game.mode === Mode.ADVENTURE)
		return game.param === 4 ? new Tourneboule(game) : new Snake(game, game.param);
	return new Octopus(game);
}
