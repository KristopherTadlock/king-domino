import { GameState } from './enums/game-state.js';

function landscapeKey(landscape) {
  return landscape?.description ?? String(landscape);
}

function describeLandscape(landscape) {
  const key = landscapeKey(landscape);
  return key ? key[0].toUpperCase() + key.slice(1) : 'Terrain';
}

function advisorLandscapeNoun(landscapeKeyValue) {
  return ({
    wheat: 'wheat',
    pasture: 'pasture',
    water: 'water',
    bog: 'bogs',
    forest: 'forest',
    mine: 'mines',
  })[landscapeKeyValue] ?? 'terrain';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Small, deterministic decision harness for in-game help and future opponents.
 *
 * The scores are deliberately simple heuristics. Keeping the shape pure and
 * inspectable lets UI code consume suggestions now while leaving room for a
 * learned policy to swap in later.
 */
export class GameAdvisor {
  rankDraftMoves(game, playerIndex = game?.currentPickingPlayerIndex) {
    if (!game || game.isGameOver || game.state !== GameState.DRAFT) return [];
    if (playerIndex == null || !game.players?.[playerIndex]) return [];

    const available = (game.currentDraft ?? [])
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot?.player == null && !slot?.placed);
    if (!available.length) return [];

    const boardProfile = this.#profileBoard(game.players[playerIndex].board?.board ?? {});
    const nextOrderByNumber = [...(game.currentDraft ?? [])]
      .sort((a, b) => a.domino.number - b.domino.number);
    const nextSlotByNumber = new Map(
      nextOrderByNumber.map((slot, index) => [slot.domino.number, index + 1])
    );

    return available
      .map(({ slot, index }) => this.#rankDraftSlot(slot, index, playerIndex, boardProfile, nextSlotByNumber, available.length))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.nextOrder !== b.nextOrder) return a.nextOrder - b.nextOrder;
        return a.dominoNumber - b.dominoNumber;
      });
  }

  suggestDraftMove(game, playerIndex = game?.currentPickingPlayerIndex) {
    return this.rankDraftMoves(game, playerIndex)[0] ?? null;
  }

  rankPlacementMoves(game, playerIndex = game?.currentPlacingPlayerIndex) {
    if (!game || game.isGameOver || game.state !== GameState.PLACE) return [];
    if (playerIndex == null || !game.players?.[playerIndex]) return [];

    const options = game.getCurrentPlacementOptionsForPlayer?.(playerIndex) ?? [];
    if (!options.length) return [];
    const suggested = this.#suggestPlacementFromOptions(game, playerIndex, options);

    return options
      .map((option) => ({
        ...option,
        playerIndex,
        score: this.#placementScore(option, suggested),
        reasons: this.#placementReasons(option, suggested),
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.dominoNumber !== b.dominoNumber) return a.dominoNumber - b.dominoNumber;
        if (a.orientation !== b.orientation) return a.orientation - b.orientation;
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      });
  }

  suggestPlacementMove(game, playerIndex = game?.currentPlacingPlayerIndex) {
    return this.rankPlacementMoves(game, playerIndex)[0] ?? null;
  }

  #suggestPlacementFromOptions(game, playerIndex, options) {
    const current = game.currentPlacingDraftedTileForPlayer?.(playerIndex);
    const currentNumber = current?.domino.number ?? null;
    const currentOrientation = current?.domino.orientation ?? null;
    const boardSize = game.players?.[playerIndex]?.board?.boardSize;
    const centerX = boardSize ? (boardSize.xMin + boardSize.xMax) / 2 : 0;
    const centerY = boardSize ? (boardSize.yMin + boardSize.yMax) / 2 : 0;

    return [...options].sort((a, b) => {
      const aSelection = a.dominoNumber === currentNumber
        ? a.orientation === currentOrientation ? 0 : 1
        : 2;
      const bSelection = b.dominoNumber === currentNumber
        ? b.orientation === currentOrientation ? 0 : 1
        : 2;
      if (aSelection !== bSelection) return aSelection - bSelection;

      const ar = Math.abs(a.rotationSteps ?? 0);
      const br = Math.abs(b.rotationSteps ?? 0);
      if (ar !== br) return ar - br;

      const ad = Math.abs(a.x - centerX) + Math.abs(a.y - centerY);
      const bd = Math.abs(b.x - centerX) + Math.abs(b.y - centerY);
      if (ad !== bd) return ad - bd;

      if (a.dominoNumber !== b.dominoNumber) return a.dominoNumber - b.dominoNumber;
      if (a.orientation !== b.orientation) return a.orientation - b.orientation;
      if (a.y !== b.y) return a.y - b.y;
      if (a.x !== b.x) return a.x - b.x;
      return (a.anchorEnd?.description === 'RIGHT' ? 1 : 0) - (b.anchorEnd?.description === 'RIGHT' ? 1 : 0);
    })[0] ?? null;
  }

  #profileBoard(board) {
    const landscapeCounts = new Map();
    const crownCounts = new Map();
    let placedTiles = 0;

    for (const tile of Object.values(board)) {
      if (!tile || landscapeKey(tile.landscape) === 'castle') continue;
      placedTiles += 1;
      const key = landscapeKey(tile.landscape);
      landscapeCounts.set(key, (landscapeCounts.get(key) ?? 0) + 1);
      crownCounts.set(key, (crownCounts.get(key) ?? 0) + (tile.crowns || 0));
    }

    return { landscapeCounts, crownCounts, placedTiles };
  }

  #rankDraftSlot(slot, index, playerIndex, boardProfile, nextSlotByNumber, availableCount) {
    const domino = slot.domino;
    const ends = [domino.leftEnd, domino.rightEnd];
    const crowns = ends.reduce((sum, end) => sum + (end.crowns || 0), 0);
    const uniqueLandscapes = new Set(ends.map((end) => landscapeKey(end.landscape)));
    const nextOrder = nextSlotByNumber.get(domino.number) ?? index + 1;

    const continuity = ends.reduce((sum, end) => {
      const count = boardProfile.landscapeCounts.get(landscapeKey(end.landscape)) ?? 0;
      return sum + clamp(count, 0, 8);
    }, 0);
    const crownSynergy = ends.reduce((sum, end) => {
      const key = landscapeKey(end.landscape);
      const count = boardProfile.landscapeCounts.get(key) ?? 0;
      const existingCrowns = boardProfile.crownCounts.get(key) ?? 0;
      return sum + (end.crowns || 0) * (1 + clamp(count, 0, 8) * 0.8 + clamp(existingCrowns, 0, 6) * 0.45);
    }, 0);

    const crownScore = crowns * 13;
    const synergyScore = continuity * 1.35 + crownSynergy * 4.5;
    const tempoScore = (availableCount - nextOrder + 1) * 2.35;
    const strengthScore = domino.number * 0.22;
    const varietyScore = boardProfile.placedTiles === 0
      ? uniqueLandscapes.size * 0.55
      : uniqueLandscapes.size > 1 ? 0.65 : 0;
    const score = Number((crownScore + synergyScore + tempoScore + strengthScore + varietyScore).toFixed(3));

    const reasons = [
      { label: crowns === 1 ? '1 crown' : `${crowns} crowns`, value: crownScore },
      { label: continuity > 0 ? 'Fits your board' : 'New terrain', value: synergyScore + varietyScore },
      { label: nextOrder <= 2 ? 'Early next pick' : `Next order ${nextOrder}`, value: tempoScore },
    ].filter((reason) => reason.value > 0.01);

    const bestLandscape = ends
      .map((end) => ({
        key: landscapeKey(end.landscape),
        label: describeLandscape(end.landscape),
        count: boardProfile.landscapeCounts.get(landscapeKey(end.landscape)) ?? 0,
        crowns: end.crowns || 0,
        existingCrowns: boardProfile.crownCounts.get(landscapeKey(end.landscape)) ?? 0,
        value: (boardProfile.landscapeCounts.get(landscapeKey(end.landscape)) ?? 0) + (end.crowns || 0) * 3,
      }))
      .sort((a, b) => b.value - a.value)[0];

    const phrase = this.#draftPhrase({
      crowns,
      continuity,
      nextOrder,
      bestLandscape,
    });
    const explanation = this.#draftExplanation({
      crowns,
      continuity,
      nextOrder,
      bestLandscape,
      reasons,
    });

    return {
      index,
      playerIndex,
      dominoNumber: domino.number,
      score,
      nextOrder,
      crowns,
      landscapes: [...uniqueLandscapes],
      focus: bestLandscape?.label ?? describeLandscape(domino.leftEnd.landscape),
      phrase,
      explanation,
      reasons,
      summary: reasons.slice(0, 2).map((reason) => reason.label).join(' · '),
    };
  }

  #draftPhrase({ crowns, continuity, nextOrder, bestLandscape }) {
    const noun = advisorLandscapeNoun(bestLandscape?.key);
    if (crowns >= 2) return 'Big crowns';
    if (bestLandscape?.crowns > 0 && bestLandscape.count > 0) return `More ${noun}`;
    if (crowns > 0) return 'Take crowns';
    if (continuity > 0) return `Grow ${noun}`;
    if (nextOrder <= 2) return 'Pick early';
    return 'Good shape';
  }

  #draftExplanation({ crowns, continuity, nextOrder, bestLandscape, reasons }) {
    const noun = advisorLandscapeNoun(bestLandscape?.key);
    const reasonText = reasons
      .filter((reason) => {
        const label = reason.label.toLowerCase();
        return !label.includes('crown')
          && !label.includes('next order')
          && !label.includes('next pick');
      })
      .slice(0, 2)
      .map((reason) => reason.label.toLowerCase())
      .join(' and ');
    const orderText = nextOrder === 1
      ? 'It also gives you first choice next round.'
      : `It sets you at pick ${nextOrder} next round.`;

    if (bestLandscape?.crowns > 0 && bestLandscape.count > 0) {
      const addedPoints = bestLandscape.count * bestLandscape.crowns
        + bestLandscape.existingCrowns
        + bestLandscape.crowns;
      return `You already have ${bestLandscape.count} ${noun} space${bestLandscape.count === 1 ? '' : 's'}. If this crown connects, that region gains at least ${addedPoints} point${addedPoints === 1 ? '' : 's'}. ${orderText}`;
    }

    if (crowns > 0) {
      return `Crowns are how regions score. This tile brings ${crowns} crown${crowns === 1 ? '' : 's'} and ${reasonText || 'a useful shape'}. ${orderText}`;
    }

    if (continuity > 0) {
      return `This keeps your ${noun} region growing and is easier to connect than starting a new terrain. ${orderText}`;
    }

    return `This is a flexible tile with ${reasonText || 'good future options'}. ${orderText}`;
  }

  #placementScore(option, suggested) {
    const isSuggested = suggested
      && option.dominoNumber === suggested.dominoNumber
      && option.orientation === suggested.orientation
      && option.x === suggested.x
      && option.y === suggested.y
      && option.anchorEnd === suggested.anchorEnd;
    const rotationCost = Math.abs(option.rotationSteps ?? 0);
    return (isSuggested ? 1000 : 0)
      - rotationCost * 12
      - Math.abs(option.x) * 0.25
      - Math.abs(option.y) * 0.25
      - option.dominoNumber * 0.01;
  }

  #placementReasons(option, suggested) {
    const isSuggested = suggested
      && option.dominoNumber === suggested.dominoNumber
      && option.orientation === suggested.orientation
      && option.x === suggested.x
      && option.y === suggested.y
      && option.anchorEnd === suggested.anchorEnd;
    return [
      isSuggested ? { label: 'Best initial placement', value: 1000 } : null,
      option.rotationSteps ? { label: `${option.rotationSteps} rotation${option.rotationSteps === 1 ? '' : 's'}`, value: -option.rotationSteps } : null,
    ].filter(Boolean);
  }
}
