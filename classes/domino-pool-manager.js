import { DominoTile } from "./domino-tile.js";
import { Domino } from "./domino.js";
import { Landscapes } from "./enums/landscapes.js";

export class DominoPoolManager {
    /**
     * @type {Domino[]}
     * The pool of dominos
     */
    #dominos = [];

    /**
     * @type {number}
     * number of draws taken from the pool since the last reset.
     * This is used to track the current turn
     */
    #drawsTaken = 0;

    constructor() {
        this.reset();
    }

    /** 
    * @returns {Domino[]} The drawn dominos
    * Draw four dominos from the pool without replacement
    */
    draw4() {
        // Draw the first four dominos
        const drawnDominos = this.dominos.slice(0, 4);
        // Remove the drawn dominos from the pool
        this.dominos = this.dominos.slice(4);
        // Increment the number of draws taken
        this.#drawsTaken += 4;
        return drawnDominos;
    }

    /**
     * @returns {number} The current turn
     */
    currentTurn() {
        return Math.floor(this.#drawsTaken / 4) + 1;
    }


    /**
     * @returns {void}
     * Reset the pool to the starting pool and shuffle it
     */
    reset() {
        this.dominos = this.#getStartingDominoPool();
        this.#shuffle();
        this.#drawsTaken = 0;
    }

    /**
     * returns {boolean} true if the pool is empty
     * Check if the pool is empty
     * @returns {boolean}
     */
    isEmpty() {
        return this.dominos.length === 0;
    }

    /**
     * @returns {void}
     * Shuffle the domino pool
     */
    #shuffle() {
        this.#dominos.sort(() => Math.random() - 0.5);
    }

    /**
     * @returns {Domino[]} returns the starting pool of dominos
     * Get the starting pool of dominos
     */
    #getStartingDominoPool() {
        return dominosRaw.map((dominoRaw) =>
            new Domino(
                new DominoTile(dominoRaw.left.type, dominoRaw.left.crowns),
                new DominoTile(dominoRaw.right.type, dominoRaw.right.crowns),
                dominoRaw.id
            )
        );
    }
}

const dominosRaw = [
    {
        "id": 1,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        }
    },
    {
        "id": 2,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        }
    },
    {
        "id": 3,
        "left": {
            "type": Landscapes.FOREST,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.FOREST,
            "crowns": 0
        }
    },
    {
        "id": 4,
        "left": {
            "type": Landscapes.FOREST,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.FOREST,
            "crowns": 0
        }
    },
    {
        "id": 5,
        "left": {
            "type": Landscapes.FOREST,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.FOREST,
            "crowns": 0
        }
    },
    {
        "id": 6,
        "left": {
            "type": Landscapes.FOREST,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.FOREST,
            "crowns": 0
        }
    },
    {
        "id": 7,
        "left": {
            "type": Landscapes.WATER,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.WATER,
            "crowns": 0
        }
    },
    {
        "id": 8,
        "left": {
            "type": Landscapes.WATER,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.WATER,
            "crowns": 0
        }
    },
    {
        "id": 9,
        "left": {
            "type": Landscapes.WATER,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.WATER,
            "crowns": 0
        }
    },
    {
        "id": 10,
        "left": {
            "type": Landscapes.PASTURE,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.PASTURE,
            "crowns": 0
        }
    },
    {
        "id": 11,
        "left": {
            "type": Landscapes.PASTURE,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.PASTURE,
            "crowns": 0
        }
    },
    {
        "id": 12,
        "left": {
            "type": Landscapes.BOG,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.BOG,
            "crowns": 0
        }
    },
    {
        "id": 13,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.FOREST,
            "crowns": 0
        }
    },
    {
        "id": 14,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.WATER,
            "crowns": 0
        }
    },
    {
        "id": 15,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.PASTURE,
            "crowns": 0
        }
    },
    {
        "id": 16,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.BOG,
            "crowns": 0
        }
    },
    {
        "id": 17,
        "left": {
            "type": Landscapes.FOREST,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.WATER,
            "crowns": 0
        }
    },
    {
        "id": 18,
        "left": {
            "type": Landscapes.FOREST,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.PASTURE,
            "crowns": 0
        }
    },
    {
        "id": 19,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.FOREST,
            "crowns": 0
        }
    },
    {
        "id": 20,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.WATER,
            "crowns": 0
        }
    },
    {
        "id": 21,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.PASTURE,
            "crowns": 0
        }
    },
    {
        "id": 22,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.BOG,
            "crowns": 0
        }
    },
    {
        "id": 23,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.MINE,
            "crowns": 0
        }
    },
    {
        "id": 24,
        "left": {
            "type": Landscapes.FOREST,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        }
    },
    {
        "id": 25,
        "left": {
            "type": Landscapes.FOREST,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        }
    },
    {
        "id": 26,
        "left": {
            "type": Landscapes.FOREST,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        }
    },
    {
        "id": 27,
        "left": {
            "type": Landscapes.FOREST,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        }
    },
    {
        "id": 28,
        "left": {
            "type": Landscapes.FOREST,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.WATER,
            "crowns": 0
        }
    },
    {
        "id": 29,
        "left": {
            "type": Landscapes.FOREST,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.PASTURE,
            "crowns": 0
        }
    },
    {
        "id": 30,
        "left": {
            "type": Landscapes.WATER,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        }
    },
    {
        "id": 31,
        "left": {
            "type": Landscapes.WATER,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        }
    },
    {
        "id": 32,
        "left": {
            "type": Landscapes.WATER,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.FOREST,
            "crowns": 0
        }
    },
    {
        "id": 33,
        "left": {
            "type": Landscapes.WATER,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.FOREST,
            "crowns": 0
        }
    },
    {
        "id": 34,
        "left": {
            "type": Landscapes.WATER,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.FOREST,
            "crowns": 0
        }
    },
    {
        "id": 35,
        "left": {
            "type": Landscapes.WATER,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.FOREST,
            "crowns": 0
        }
    },
    {
        "id": 36,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.PASTURE,
            "crowns": 1
        }
    },
    {
        "id": 37,
        "left": {
            "type": Landscapes.WATER,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.PASTURE,
            "crowns": 1
        }
    },
    {
        "id": 38,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.BOG,
            "crowns": 1
        }
    },
    {
        "id": 39,
        "left": {
            "type": Landscapes.PASTURE,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.BOG,
            "crowns": 1
        }
    },
    {
        "id": 40,
        "left": {
            "type": Landscapes.MINE,
            "crowns": 1
        },
        "right": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        }
    },
    {
        "id": 41,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.PASTURE,
            "crowns": 2
        }
    },
    {
        "id": 42,
        "left": {
            "type": Landscapes.WATER,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.PASTURE,
            "crowns": 2
        }
    },
    {
        "id": 43,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.BOG,
            "crowns": 2
        }
    },
    {
        "id": 44,
        "left": {
            "type": Landscapes.PASTURE,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.BOG,
            "crowns": 2
        }
    },
    {
        "id": 45,
        "left": {
            "type": Landscapes.MINE,
            "crowns": 2
        },
        "right": {
            "type": Landscapes.WHEAT,
            "crowns": 20
        }
    },
    {
        "id": 46,
        "left": {
            "type": Landscapes.BOG,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.MINE,
            "crowns": 2
        }
    },
    {
        "id": 47,
        "left": {
            "type": Landscapes.BOG,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.MINE,
            "crowns": 2
        }
    },
    {
        "id": 48,
        "left": {
            "type": Landscapes.WHEAT,
            "crowns": 0
        },
        "right": {
            "type": Landscapes.MINE,
            "crowns": 3
        }
    }
];
