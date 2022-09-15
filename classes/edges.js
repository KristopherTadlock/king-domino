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
});