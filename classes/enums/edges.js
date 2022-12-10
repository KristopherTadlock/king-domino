export const Edges = Object.freeze({
    TOP: Symbol("top"),
    BOTTOM: Symbol("bottom"),
    LEFT: Symbol("left"),
    RIGHT: Symbol("right"),
});

export const EdgeOffset = Object.freeze({
    TOP: {x: 0, y: 1},
    BOTTOM: {x: 0, y: -1},
    LEFT: {x: -1, y: 0},
    RIGHT: {x: 1, y: 0},
    /**
     * Maps edge to an edge offset
     * @param {Edges} edge
     */
    MAP_EDGE_TO_OFFSET(edge) {
        switch(edge) {
            case Edges.TOP:
                return this.TOP;
            case Edges.BOTTOM:
                return this.BOTTOM;
            case Edges.LEFT:
                return this.LEFT;
            case Edges.RIGHT:
                return this.RIGHT;
        }
    }
});