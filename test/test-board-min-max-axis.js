import { it, assert } from './test-framework.js';
import { BoardMinMaxAxis } from "../classes/board-min-max-axis.js";

/** Test constructor */
(function() {
    const minMaxAxis = new BoardMinMaxAxis(1,5,2,6);
    it('should create board min max axis', () => {
        assert(!!minMaxAxis); // quick undefined check
        assert(minMaxAxis.xMin === 1);
        assert(minMaxAxis.xMax === 5);
        assert(minMaxAxis.yMin === 2);
        assert(minMaxAxis.yMax === 6);
    });
})();

(function() {
    let minMaxAxis = new BoardMinMaxAxis(1,5,2,6);
    minMaxAxis = BoardMinMaxAxis.genCurrentBoardMinMaxes(minMaxAxis, -1, 4);
    it('should adjust x min axis', () => {
        assert(minMaxAxis.xMin === -1);
        assert(minMaxAxis.xMax === 5);
        assert(minMaxAxis.yMin === 2);
        assert(minMaxAxis.yMax === 6);
    });
    minMaxAxis = BoardMinMaxAxis.genCurrentBoardMinMaxes(minMaxAxis, 9, 4);
    it('should adjust x max axis', () => {
        assert(minMaxAxis.xMax === 9);
    });
    minMaxAxis = BoardMinMaxAxis.genCurrentBoardMinMaxes(minMaxAxis, 1, -1);
    it('should adjust y min axis', () => {
        assert(minMaxAxis.yMin === -1);
    });
    minMaxAxis = BoardMinMaxAxis.genCurrentBoardMinMaxes(minMaxAxis, 1, 9);
    it('should adjust y max axis', () => {
        assert(minMaxAxis.xMin === -1);
        assert(minMaxAxis.xMax === 9);
        assert(minMaxAxis.yMin === -1);
        assert(minMaxAxis.yMax === 9);
    });
})();