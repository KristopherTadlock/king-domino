import { GameState } from './enums/game-state.js';
import { DominoEnd } from './enums/domino-end.js';
import { GameAdvisor } from './game-advisor.js';

const COORD_MIN = -6;
const COORD_MAX = 6;
const COORD_SPAN = COORD_MAX - COORD_MIN + 1;
const DRAFT_ACTIONS = 4;
const BOARD_LIMIT = 7;
const SKIP_ACTION = DRAFT_ACTIONS + 4 * 4 * COORD_SPAN * COORD_SPAN * 2;
const ORIENTATIONS = [0, 90, 180, 270];
const ANCHOR_LEFT = 0;
const ANCHOR_RIGHT = 1;
const RICH_ACTION_FEATURE_SIZE = 96;
const DEFAULT_DIFFICULTY = 'challenger';
const DIFFICULTY_PROFILES = Object.freeze({
  casual: Object.freeze({
    mode: 'advisor',
    draftPressureScale: 0,
    draftPressureCap: 0,
    draftOwnScale: 0,
    draftOwnGapScale: 0,
    draftPlaceabilityScale: 0,
    draftDenialGapScale: 0,
    draftOpponentThreatScale: 0,
    draftOpponentEaseScale: 0,
    placementBonusScale: 0,
    placementBonusCap: 0,
  }),
  challenger: Object.freeze({
    mode: 'model',
    draftPressureScale: 0.015,
    draftPressureCap: 0.25,
    draftOwnScale: 0.002,
    draftOwnGapScale: 0.001,
    draftPlaceabilityScale: 0.006,
    draftDenialGapScale: 0.004,
    draftOpponentThreatScale: 0.002,
    draftOpponentEaseScale: 0.002,
    placementBonusScale: 0.004,
    placementBonusCap: 0.15,
  }),
  sharp: Object.freeze({
    mode: 'model',
    draftPressureScale: 0.18,
    draftPressureCap: 3.2,
    draftOwnScale: 0.052,
    draftOwnGapScale: 0,
    draftPlaceabilityScale: 0.105,
    draftDenialGapScale: 0.04,
    draftOpponentThreatScale: 0.006,
    draftOpponentEaseScale: 0,
    placementBonusScale: 0.11,
    placementBonusCap: 4.8,
  }),
});
const TERRAIN = Object.freeze({
  castle: 0,
  wheat: 1,
  pasture: 2,
  water: 3,
  bog: 4,
  forest: 5,
  mine: 6,
});
const ABLATION_MODES = Object.freeze(new Set(['full', 'model', 'draft', 'placement']));

function terrainId(landscape) {
  return TERRAIN[landscape?.description ?? String(landscape)] ?? 0;
}

function terrainKey(landscape) {
  return landscape?.description ?? String(landscape);
}

function normalizeDifficulty(difficulty) {
  const key = String(difficulty ?? '').trim().toLowerCase();
  return DIFFICULTY_PROFILES[key] ? key : DEFAULT_DIFFICULTY;
}

function normalizeAblationMode(mode) {
  const key = String(mode ?? '').trim().toLowerCase();
  return ABLATION_MODES.has(key) ? key : 'full';
}

export class AIPolicyRunner {
  #advisor = new GameAdvisor();
  #artifact = null;
  #difficulty = DEFAULT_DIFFICULTY;
  #ablationMode = 'full';
  #traceEnabled = false;
  #lastDecisionTrace = null;
  #decisionTraces = [];

  get ready() {
    return Boolean(this.#artifact);
  }

  get backend() {
    return this.#artifact?.metadata?.backend ?? this.#artifact?.backend ?? 'unloaded';
  }

  get difficulty() {
    return this.#difficulty;
  }

  get ablationMode() {
    return this.#ablationMode;
  }

  get lastDecisionTrace() {
    return this.#lastDecisionTrace;
  }

  setDifficulty(difficulty) {
    this.#difficulty = normalizeDifficulty(difficulty);
    return this.#difficulty;
  }

  setAblationMode(mode = 'full') {
    this.#ablationMode = normalizeAblationMode(mode);
    return this.#ablationMode;
  }

  setTraceEnabled(enabled = true) {
    this.#traceEnabled = Boolean(enabled);
    if (!this.#traceEnabled) this.#decisionTraces = [];
    return this.#traceEnabled;
  }

  drainDecisionTraces() {
    const traces = this.#decisionTraces;
    this.#decisionTraces = [];
    return traces;
  }

  async load(url = 'ai/artifacts/browser_policy.json') {
    let response = await fetch(url, { cache: 'no-store' });
    if (!response.ok && url !== 'ai/artifacts/heuristic_policy.json') {
      response = await fetch('ai/artifacts/heuristic_policy.json', { cache: 'no-store' });
    }
    if (!response.ok && url !== 'ai/artifacts/latest.pt') {
      response = await fetch('ai/artifacts/latest.pt', { cache: 'no-store' });
    }
    if (!response.ok) {
      throw new Error(`Failed to load AI policy: ${response.status}`);
    }
    this.#artifact = await response.json();
    return this.#artifact;
  }

  chooseAction(game, playerIndex) {
    if (!this.ready || !game || game.isGameOver || playerIndex == null) return null;
    if (this.#difficultyProfile().mode === 'advisor') {
      if (game.state === GameState.DRAFT) return this.#chooseDraftAction(game, playerIndex);
      if (game.state === GameState.PLACE) return this.#choosePlacementAction(game, playerIndex);
      return null;
    }
    if (this.#artifact?.format === 'kingdomino-weighted-heuristic-v0') {
      return this.#chooseHeuristicAction(game, playerIndex);
    }
    if (this.#artifact?.policy?.type === 'candidate_policy_v0') {
      const action = this.#chooseCandidateModelAction(game, playerIndex);
      if (action) return action;
    }
    if (this.#artifact?.policy?.type === 'masked_mlp_v0') {
      const action = this.#chooseModelAction(game, playerIndex);
      if (action) return action;
    }
    if (game.state === GameState.DRAFT) return this.#chooseDraftAction(game, playerIndex);
    if (game.state === GameState.PLACE) return this.#choosePlacementAction(game, playerIndex);
    return null;
  }

  #chooseCandidateModelAction(game, playerIndex) {
    const policy = this.#artifact?.policy;
    const { legalActions } = this.#legalActionsAndMask(game, playerIndex, policy.actionCount);
    if (!legalActions.length) return null;
    const obs = this.#observationVector(game, playerIndex, policy.obsScale || 50);
    if (!obs || obs.length !== policy.obsSize) return null;

    const state = this.#linearTanh(policy.weights.obsWeight, policy.weights.obsBias, obs);
    let bestAction = legalActions[0];
    let bestScore = -Infinity;
    const traceCandidates = this.#traceEnabled ? [] : null;
    for (const action of legalActions) {
      const features = this.#candidateFeatures(game, playerIndex, action, policy.featureMode);
      if (!features) continue;
      const modelScore = this.#candidatePolicyScore(policy, state, features);
      const adjustment = this.#candidateActionAdjustmentBreakdown(game, playerIndex, action);
      const score = modelScore + adjustment.score;
      if (traceCandidates) {
        traceCandidates.push({
          action: this.#describeEncodedAction(game, action),
          modelScore,
          adjustment: adjustment.score,
          totalScore: score,
          reason: adjustment.reason,
          components: adjustment.components,
        });
      }
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }
    const gameAction = this.#toGameAction(game, bestAction);
    this.#recordDecisionTrace({
      source: 'candidate-policy',
      phase: game.state?.description ?? String(game.state),
      playerIndex,
      chosen: this.#describeEncodedAction(game, bestAction),
      candidates: this.#topTraceCandidates(traceCandidates),
    });
    return gameAction;
  }

  #candidatePolicyScore(policy, state, features) {
    const action = this.#linearTanh(policy.weights.actionWeight, policy.weights.actionBias, features);
    if (policy.modelType === 'interaction') {
      const jointInput = new Array(state.length * 3);
      for (let i = 0; i < state.length; i += 1) {
        jointInput[i] = state[i];
        jointInput[i + state.length] = action[i];
        jointInput[i + state.length * 2] = state[i] * action[i];
      }
      const joint = this.#linearTanh(policy.weights.jointWeight, policy.weights.jointBias, jointInput);
      let sum = policy.weights.outputBias ?? 0;
      for (let i = 0; i < joint.length; i += 1) {
        sum += (policy.weights.outputWeight[i] ?? 0) * joint[i];
      }
      return sum;
    }

    let score = 0;
    for (let i = 0; i < state.length; i += 1) score += state[i] * action[i];
    score /= Math.sqrt(state.length);
    let bias = policy.weights.actionBiasBias ?? 0;
    for (let i = 0; i < features.length; i += 1) {
      bias += (policy.weights.actionBiasWeight?.[i] ?? 0) * features[i];
    }
    return score + bias;
  }

  #candidateActionAdjustment(game, playerIndex, action) {
    return this.#candidateActionAdjustmentBreakdown(game, playerIndex, action).score;
  }

  #candidateActionAdjustmentBreakdown(game, playerIndex, action) {
    if (this.#draftAdjustmentAllowed() && game.state === GameState.DRAFT && action >= 0 && action < DRAFT_ACTIONS) {
      return this.#draftScoreBreakdown(game, playerIndex, action);
    }
    if (this.#placementAdjustmentAllowed() && game.state === GameState.PLACE && action >= DRAFT_ACTIONS && action !== SKIP_ACTION) {
      return this.#placementTieBreakBreakdown(game, playerIndex, action);
    }
    return { score: 0, reason: 'Policy score only', components: {} };
  }

  #draftAdjustmentAllowed() {
    return this.#ablationMode === 'full' || this.#ablationMode === 'draft';
  }

  #placementAdjustmentAllowed() {
    return this.#ablationMode === 'full' || this.#ablationMode === 'placement';
  }

  #difficultyProfile() {
    return DIFFICULTY_PROFILES[this.#difficulty] ?? DIFFICULTY_PROFILES[DEFAULT_DIFFICULTY];
  }

  #draftOpponentPressureBonus(game, playerIndex, draftIndex) {
    return this.#draftScoreBreakdown(game, playerIndex, draftIndex).score;
  }

  #draftScoreBreakdown(game, playerIndex, draftIndex) {
    const profile = this.#difficultyProfile();
    const empty = { score: 0, reason: 'No draft adjustment', components: {} };
    if (!this.#draftAdjustmentAllowed()) return empty;
    if (game.currentPickingPlayerIndex !== playerIndex) return empty;
    const domino = game.currentDraft?.[draftIndex]?.domino;
    if (!domino) return empty;

    const own = this.#draftOpportunityBreakdown(game, playerIndex, domino);
    const ownAlternative = this.#bestAlternativeDraftOpportunity(game, playerIndex, draftIndex);
    const ownAlternativeValue = ownAlternative?.score ?? 0;
    const ownOpportunityGap = own.score - ownAlternativeValue;
    let bestOpponent = null;
    for (let opponentIndex = 0; opponentIndex < (game.players?.length ?? 0); opponentIndex += 1) {
      if (opponentIndex === playerIndex) continue;
      const opponent = this.#draftOpportunityBreakdown(game, opponentIndex, domino);
      const alternative = this.#bestAlternativeDraftOpportunity(game, opponentIndex, draftIndex);
      const alternativeValue = alternative?.score ?? 0;
      const denialGap = Math.max(0, opponent.score - alternativeValue);
      const opponentThreat = opponent.immediateValue
        + opponent.terrainAffinity * 0.35
        + opponent.crowns * 0.65
        + Math.log1p(Math.max(0, opponent.mobilityCount)) * 0.8;
      const opponentEase = Math.log1p(Math.max(0, opponent.mobilityCount));
      const denialScore = denialGap * 1.2 + opponentThreat * 0.35 + opponentEase * 0.25;
      if (!bestOpponent || denialScore > bestOpponent.denialScore) {
        bestOpponent = {
          playerIndex: opponentIndex,
          alternativeValue,
          alternativeDominoNumber: alternative?.dominoNumber ?? null,
          denialGap,
          opponentThreat,
          opponentEase,
          denialScore,
          ...opponent,
        };
      }
    }

    const opponentValue = bestOpponent?.score ?? 0;
    const oldPressure = Math.max(0, opponentValue - own.score * 0.65);
    const denialGap = bestOpponent?.denialGap ?? 0;
    const opponentThreat = bestOpponent?.opponentThreat ?? 0;
    const opponentEase = bestOpponent?.opponentEase ?? 0;
    const denialPressure = oldPressure;
    const ownBonus = own.score * (profile.draftOwnScale ?? 0);
    const ownGapBonus = ownOpportunityGap * (profile.draftOwnGapScale ?? 0);
    const denialBonus = denialPressure * (profile.draftPressureScale ?? 0);
    const denialGapBonus = Math.max(0, denialGap - 3) * (profile.draftDenialGapScale ?? 0);
    const opponentThreatBonus = Math.max(0, opponentThreat - own.immediateValue - 2)
      * (profile.draftOpponentThreatScale ?? 0);
    const opponentEaseBonus = opponentEase * (profile.draftOpponentEaseScale ?? 0);
    const placeabilityBonus = Math.log1p(Math.max(0, own.mobilityCount)) * (profile.draftPlaceabilityScale ?? 0);
    const cap = profile.draftPressureCap ?? 0;
    const total = ownBonus
      + ownGapBonus
      + denialBonus
      + denialGapBonus
      + opponentThreatBonus
      + opponentEaseBonus
      + placeabilityBonus;
    const score = cap > 0 ? Math.max(-cap, Math.min(cap, total)) : total;
    let reason = 'Flexible draft';
    if ((denialBonus + denialGapBonus + opponentThreatBonus) > Math.abs(ownBonus + ownGapBonus)
      && (denialBonus + denialGapBonus) > placeabilityBonus) {
      reason = 'Blocks opponent';
    } else if (ownOpportunityGap > 2) {
      reason = 'Best fit';
    } else if (own.bestScoreDelta > 0) {
      reason = 'Future score';
    } else if (own.mobilityCount <= 2) {
      reason = 'Hard to place';
    } else if (own.terrainAffinity > 0) {
      reason = 'Fits board';
    }
    return {
      score,
      reason,
      components: {
        ownValue: own.score,
        ownAlternativeValue,
        ownOpportunityGap,
        bestOpponentValue: opponentValue,
        bestOpponentIndex: bestOpponent?.playerIndex ?? null,
        bestOpponentAlternativeValue: bestOpponent?.alternativeValue ?? 0,
        bestOpponentAlternativeDominoNumber: bestOpponent?.alternativeDominoNumber ?? null,
        bestOpponentDenialGap: denialGap,
        bestOpponentThreat: opponentThreat,
        bestOpponentEase: opponentEase,
        denialPressure,
        ownBonus,
        ownGapBonus,
        denialBonus,
        denialGapBonus,
        opponentThreatBonus,
        opponentEaseBonus,
        placeabilityBonus,
        own,
        bestOpponent,
      },
    };
  }

  #placementTieBreakBonus(game, playerIndex, action) {
    return this.#placementTieBreakBreakdown(game, playerIndex, action).score;
  }

  #placementTieBreakBreakdown(game, playerIndex, action) {
    const profile = this.#difficultyProfile();
    if (!this.#placementAdjustmentAllowed()) return { score: 0, reason: 'No placement adjustment', components: {} };
    const decoded = this.#decodePlacementAction(action);
    if (!decoded) return { score: 0, reason: 'No placement adjustment', components: {} };
    const domino = game.currentDraft?.[decoded.draftIndex]?.domino;
    if (!domino) return { score: 0, reason: 'No placement adjustment', components: {} };
    const boardState = this.#boardFeatureState(game, playerIndex);
    const cells = this.#cellsForPlacement(domino, decoded.orientation, decoded.x, decoded.y, decoded.anchorEnd);
    const afterBoardState = this.#boardStateAfterPlacement(boardState, cells.left, cells.right);
    const outlook = this.#remainingPlacementOutlook(game, playerIndex, domino.number, afterBoardState);
    return this.#placementScoreBreakdown(boardState, cells, profile, outlook);
  }

  #draftOpportunityScore(game, playerIndex, domino) {
    return this.#draftOpportunityBreakdown(game, playerIndex, domino).score;
  }

  #bestAlternativeDraftOpportunity(game, playerIndex, excludedDraftIndex) {
    let best = null;
    (game.currentDraft ?? []).forEach((slot, index) => {
      if (index === excludedDraftIndex || slot?.player != null || slot?.placed || !slot?.domino) return;
      const opportunity = this.#draftOpportunityBreakdown(game, playerIndex, slot.domino);
      if (!best || opportunity.score > best.score) {
        best = { draftIndex: index, dominoNumber: slot.domino.number, ...opportunity };
      }
    });
    return best;
  }

  #draftOpportunityBreakdown(game, playerIndex, domino) {
    const boardState = this.#boardFeatureState(game, playerIndex);
    const metrics = this.#bestMobilityMetrics(boardState, domino);
    const crowns = (domino.leftEnd?.crowns ?? 0) + (domino.rightEnd?.crowns ?? 0);
    const diversity = terrainKey(domino.leftEnd?.landscape) === terrainKey(domino.rightEnd?.landscape) ? 0 : 1;
    const terrainAffinity = this.#dominoTerrainAffinity(boardState, domino);
    const immediateValue = metrics.bestScoreDelta
      + metrics.bestTouchCount * 0.85
      + terrainAffinity * 0.55
      + crowns * 0.75;
    const score = metrics.bestScoreDelta
      + metrics.bestTouchCount * 0.75
      + Math.min(24, metrics.count) * 0.12
      + crowns * 1.25
      + diversity * 0.4
      + terrainAffinity * 0.45
      + Math.log1p(Math.max(0, metrics.count)) * 0.35
      - (metrics.count ? 0 : 4);
    return {
      score,
      mobilityCount: metrics.count,
      bestScoreDelta: metrics.bestScoreDelta,
      bestTouchCount: metrics.bestTouchCount,
      immediateValue,
      crowns,
      diversity,
      terrainAffinity,
    };
  }

  #placementScoreBreakdown(boardState, cells, profile = this.#difficultyProfile(), outlook = null) {
    const metrics = this.#placementMetricsForCells(boardState, cells.left, cells.right);
    const postPlacementOutlook = outlook ?? {
      remainingTileCount: 0,
      remainingMobilityCount: 0,
      remainingBestScoreDelta: 0,
      remainingBestTouchCount: 0,
      remainingDeadTiles: 0,
      openAnchorCount: 0,
      valuableAnchorCount: 0,
    };
    const leftIsIsolatedCrown = cells.left.crowns > 0
      && metrics.leftSameTouches === 0
      && metrics.leftCastleTouches === 0;
    const rightIsIsolatedCrown = cells.right.crowns > 0
      && metrics.rightSameTouches === 0
      && metrics.rightCastleTouches === 0;
    const isolatedCrownPenalty = (leftIsIsolatedCrown ? cells.left.crowns : 0)
      + (rightIsIsolatedCrown ? cells.right.crowns : 0);
    const growthPenalty = metrics.widthGrowth + metrics.heightGrowth;
    const constraintPressure = Math.max(0, metrics.widthAfter - 5) + Math.max(0, metrics.heightAfter - 5);
    const crowdedMismatch = Math.max(0, metrics.occupiedTouchCount - metrics.sameTouchCount - metrics.castleTouchCount);
    const futureSpace = metrics.emptyTouchCount
      + Math.min(8, metrics.regionSizeSum) * 0.25
      + Math.min(6, metrics.regionCrownsSum) * 0.5;
    const remainingMobilityScore = postPlacementOutlook.remainingTileCount
      ? Math.log1p(Math.max(0, postPlacementOutlook.remainingMobilityCount)) * 0.45
        + postPlacementOutlook.remainingBestScoreDelta * 1.15
        + postPlacementOutlook.remainingBestTouchCount * 0.55
        + Math.min(8, postPlacementOutlook.valuableAnchorCount) * 0.12
        - postPlacementOutlook.remainingDeadTiles * 7
      : 0;
    const raw = Math.max(0, metrics.scoreDelta) * 1.65
      + metrics.sameTouchCount * 1.25
      + metrics.castleTouchCount * 0.2
      + futureSpace * 0.18
      + remainingMobilityScore
      - growthPenalty * 1.05
      - constraintPressure * 1.45
      - isolatedCrownPenalty * 2.0
      - crowdedMismatch * 0.45
      - metrics.distance * 0.045;
    const cap = profile.placementBonusCap ?? 0;
    const scaled = raw * (profile.placementBonusScale ?? 0);
    const score = cap > 0 ? Math.max(-cap, Math.min(cap, scaled)) : scaled;
    let reason = 'Board shape';
    if (metrics.scoreDelta > 0) reason = 'Immediate points';
    else if (metrics.regionCrownsSum > 0 || metrics.sameTouchCount > 1) reason = 'Builds region';
    else if (futureSpace >= 4) reason = 'Keeps space';
    else if (isolatedCrownPenalty > 0) reason = 'Avoids isolated crown';
    return {
      score,
      reason,
      components: {
        raw,
        scoreDelta: metrics.scoreDelta,
        sameTouchCount: metrics.sameTouchCount,
        castleTouchCount: metrics.castleTouchCount,
        regionSizeSum: metrics.regionSizeSum,
        regionCrownsSum: metrics.regionCrownsSum,
        emptyTouchCount: metrics.emptyTouchCount,
        growthPenalty,
        constraintPressure,
        isolatedCrownPenalty,
        crowdedMismatch,
        distance: metrics.distance,
        remainingTileCount: postPlacementOutlook.remainingTileCount,
        remainingMobilityCount: postPlacementOutlook.remainingMobilityCount,
        remainingBestScoreDelta: postPlacementOutlook.remainingBestScoreDelta,
        remainingBestTouchCount: postPlacementOutlook.remainingBestTouchCount,
        remainingDeadTiles: postPlacementOutlook.remainingDeadTiles,
        openAnchorCount: postPlacementOutlook.openAnchorCount,
        valuableAnchorCount: postPlacementOutlook.valuableAnchorCount,
      },
    };
  }

  #boardStateAfterPlacement(boardState, left, right) {
    const tiles = new Map(boardState.tiles);
    tiles.set(`${left.x},${left.y}`, { ...left });
    tiles.set(`${right.x},${right.y}`, { ...right });
    return {
      tiles,
      minX: Math.min(boardState.minX, left.x, right.x),
      maxX: Math.max(boardState.maxX, left.x, right.x),
      minY: Math.min(boardState.minY, left.y, right.y),
      maxY: Math.max(boardState.maxY, left.y, right.y),
    };
  }

  #remainingPlacementOutlook(game, playerIndex, placedDominoNumber, boardState) {
    const remaining = (game.currentDraft ?? [])
      .filter((slot) =>
        slot?.player === playerIndex
        && !slot?.placed
        && slot?.domino
        && slot.domino.number !== placedDominoNumber
      )
      .map((slot) => slot.domino);
    const anchors = this.#candidateAnchors(boardState);
    let remainingMobilityCount = 0;
    let remainingBestScoreDelta = 0;
    let remainingBestTouchCount = 0;
    let remainingDeadTiles = 0;
    for (const domino of remaining) {
      const metrics = this.#bestMobilityMetrics(boardState, domino);
      remainingMobilityCount += metrics.count;
      remainingBestScoreDelta = Math.max(remainingBestScoreDelta, metrics.bestScoreDelta);
      remainingBestTouchCount = Math.max(remainingBestTouchCount, metrics.bestTouchCount);
      if (metrics.count === 0) remainingDeadTiles += 1;
    }
    return {
      remainingTileCount: remaining.length,
      remainingMobilityCount,
      remainingBestScoreDelta,
      remainingBestTouchCount,
      remainingDeadTiles,
      openAnchorCount: anchors.length,
      valuableAnchorCount: this.#valuableAnchorCount(boardState, anchors),
    };
  }

  #valuableAnchorCount(boardState, anchors) {
    let count = 0;
    for (const anchor of anchors) {
      const seenTerrains = new Set();
      let hasCrownNeighbor = false;
      for (const neighbor of this.#neighbors(anchor.x, anchor.y)) {
        const tile = this.#tileAt(boardState, neighbor.x, neighbor.y);
        if (!tile || tile.terrainPlus <= TERRAIN.castle + 1) continue;
        seenTerrains.add(tile.terrainPlus);
        if ((tile.crowns ?? 0) > 0) hasCrownNeighbor = true;
      }
      if (hasCrownNeighbor || seenTerrains.size >= 2) count += 1;
    }
    return count;
  }

  #dominoTerrainAffinity(boardState, domino) {
    const ends = [domino.leftEnd, domino.rightEnd];
    const terrainStats = new Map();
    for (const tile of boardState.tiles.values()) {
      if (tile.terrainPlus <= TERRAIN.castle + 1) continue;
      const stats = terrainStats.get(tile.terrainPlus) ?? { count: 0, crowns: 0 };
      stats.count += 1;
      stats.crowns += tile.crowns ?? 0;
      terrainStats.set(tile.terrainPlus, stats);
    }
    let affinity = 0;
    for (const end of ends) {
      const terrainPlus = terrainId(end?.landscape) + 1;
      const stats = terrainStats.get(terrainPlus) ?? { count: 0, crowns: 0 };
      const crowns = end?.crowns ?? 0;
      affinity += Math.min(8, stats.count) * 0.18;
      affinity += Math.min(6, stats.crowns) * 0.35;
      affinity += crowns * Math.min(8, stats.count) * 0.34;
    }
    return affinity;
  }

  #linearTanh(weight, bias, input) {
    const output = new Array(weight.length);
    for (let row = 0; row < weight.length; row += 1) {
      const weights = weight[row];
      let sum = bias[row] ?? 0;
      for (let i = 0; i < input.length; i += 1) sum += (weights[i] ?? 0) * input[i];
      output[row] = Math.tanh(sum);
    }
    return output;
  }

  #chooseModelAction(game, playerIndex) {
    const policy = this.#artifact?.policy;
    const { legalActions, mask } = this.#legalActionsAndMask(game, playerIndex, policy.actionCount);
    if (!legalActions.length) return null;
    const obs = this.#observationVector(game, playerIndex, policy.obsScale || 50);
    if (!obs || obs.length !== policy.obsSize) return null;
    let bestAction = legalActions[0];
    let bestScore = -Infinity;
    const hidden = this.#hidden(policy, obs);
    const traceCandidates = this.#traceEnabled ? [] : null;
    for (const action of legalActions) {
      if (!mask[action]) continue;
      const score = this.#outputScore(policy, hidden, action);
      if (traceCandidates) {
        traceCandidates.push({
          action: this.#describeEncodedAction(game, action),
          modelScore: score,
          adjustment: 0,
          totalScore: score,
          reason: 'Masked MLP score',
          components: {},
        });
      }
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }
    const gameAction = this.#toGameAction(game, bestAction);
    this.#recordDecisionTrace({
      source: 'masked-mlp',
      phase: game.state?.description ?? String(game.state),
      playerIndex,
      chosen: this.#describeEncodedAction(game, bestAction),
      candidates: this.#topTraceCandidates(traceCandidates),
    });
    return gameAction;
  }

  #hidden(policy, obs) {
    const { inputWeight, inputBias } = policy.weights;
    const hidden = new Array(policy.hiddenSize).fill(0);
    for (let h = 0; h < policy.hiddenSize; h += 1) {
      const weights = inputWeight[h];
      let sum = inputBias[h] ?? 0;
      for (let i = 0; i < obs.length; i += 1) {
        sum += weights[i] * obs[i];
      }
      hidden[h] = Math.tanh(sum);
    }
    return hidden;
  }

  #outputScore(policy, hidden, action) {
    const weights = policy.weights.outputWeight[action];
    if (!weights) return -Infinity;
    let sum = policy.weights.outputBias[action] ?? 0;
    for (let h = 0; h < hidden.length; h += 1) {
      sum += weights[h] * hidden[h];
    }
    return sum;
  }

  #legalActionsAndMask(game, playerIndex, actionCount = SKIP_ACTION + 1) {
    const mask = new Array(actionCount).fill(false);
    const legalActions = [];
    const add = (action) => {
      if (action == null || action < 0 || action >= actionCount || mask[action]) return;
      mask[action] = true;
      legalActions.push(action);
    };

    if (game.state === GameState.DRAFT && game.currentPickingPlayerIndex === playerIndex) {
      (game.currentDraft ?? []).forEach((slot, index) => {
        if (slot?.player == null && !slot?.placed) add(index);
      });
      return { legalActions, mask };
    }

    if (game.state !== GameState.PLACE) return { legalActions, mask };
    const options = game.getCurrentPlacementOptionsForPlayer?.(playerIndex) ?? [];
    for (const option of options) {
      const draftIndex = (game.currentDraft ?? []).findIndex((slot) =>
        slot?.player === playerIndex
        && !slot?.placed
        && slot?.domino?.number === option.dominoNumber
      );
      add(this.#encodePlacementAction(draftIndex, option.orientation, option.x, option.y, option.anchorEnd));
    }
    if (!legalActions.length && game.canSkipPlacementForPlayer?.(playerIndex)) {
      add(SKIP_ACTION);
    }
    return { legalActions, mask };
  }

  #encodePlacementAction(draftIndex, orientation, x, y, anchorEnd) {
    if (draftIndex < 0 || draftIndex >= 4) return null;
    const normalized = ((Number(orientation) % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(normalized)) return null;
    if (x < COORD_MIN || x > COORD_MAX || y < COORD_MIN || y > COORD_MAX) return null;
    const anchor = anchorEnd === DominoEnd.RIGHT || anchorEnd?.description === 'right' || anchorEnd === 'RIGHT' ? 1 : 0;
    const orientationSteps = normalized / 90;
    const coordX = x - COORD_MIN;
    const coordY = y - COORD_MIN;
    const encoded = (((draftIndex * 4 + orientationSteps) * COORD_SPAN + coordX) * COORD_SPAN + coordY) * 2 + anchor;
    return DRAFT_ACTIONS + encoded;
  }

  #toGameAction(game, action) {
    if (action < DRAFT_ACTIONS) {
      return { type: 'pickDraft', payload: { index: action, ai: true } };
    }
    if (action === SKIP_ACTION) {
      return { type: 'skip', payload: { ai: true } };
    }
    const decoded = this.#decodePlacementAction(action);
    if (!decoded) return null;
    const slot = game.currentDraft?.[decoded.draftIndex];
    if (!slot?.domino) return null;
    return {
      type: 'place',
      payload: {
        ai: true,
        dominoNumber: slot.domino.number,
        orientation: decoded.orientation,
        x: decoded.x,
        y: decoded.y,
        anchorEnd: decoded.anchorEnd ? 'RIGHT' : 'LEFT',
        placeId: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    };
  }

  #decodePlacementAction(action) {
    if (action < DRAFT_ACTIONS || action >= SKIP_ACTION) return null;
    let value = action - DRAFT_ACTIONS;
    const anchorEnd = value % 2;
    value = Math.floor(value / 2);
    const coordY = value % COORD_SPAN;
    value = Math.floor(value / COORD_SPAN);
    const coordX = value % COORD_SPAN;
    value = Math.floor(value / COORD_SPAN);
    const orientationSteps = value % 4;
    const draftIndex = Math.floor(value / 4);
    return {
      draftIndex,
      orientation: orientationSteps * 90,
      x: coordX + COORD_MIN,
      y: coordY + COORD_MIN,
      anchorEnd,
    };
  }

  #observationVector(game, playerIndex, scale) {
    const phase = game.state === GameState.DRAFT ? 0 : 1;
    const currentPlayer = game.state === GameState.DRAFT
      ? game.currentPickingPlayerIndex
      : playerIndex;
    const scores = (game.players ?? []).map((player) => player?.board?.score ?? 0);
    const values = [
      phase,
      currentPlayer ?? -1,
      game.pickCursor ?? 0,
      game.placeCursor ?? 0,
      game.round ?? 0,
      scores[0] ?? 0,
      scores[1] ?? 0,
    ];

    for (let i = 0; i < 4; i += 1) {
      const slot = game.currentDraft?.[i];
      values.push(
        slot?.domino?.number ?? 0,
        slot?.player == null ? -1 : slot.player,
        slot?.placed ? 1 : 0,
      );
    }

    for (let player = 0; player < 2; player += 1) {
      const board = game.players?.[player]?.board?.board ?? {};
      for (let y = COORD_MIN; y <= COORD_MAX; y += 1) {
        for (let x = COORD_MIN; x <= COORD_MAX; x += 1) {
          const tile = board[`${x},${y}`];
          values.push(tile ? terrainId(tile.landscape) + 1 : 0);
          values.push(tile?.crowns ?? 0);
        }
      }
    }

    return values.map((value) => value / scale);
  }

  #candidateFeatures(game, playerIndex, action, featureMode = 'static') {
    if (featureMode !== 'rich') {
      const features = new Array(40).fill(0);
      this.#writeStaticActionFeatures(features, action);
      return features;
    }

    const features = new Array(RICH_ACTION_FEATURE_SIZE).fill(0);
    this.#writeStaticActionFeatures(features, action);

    const phase = game.state === GameState.DRAFT ? 0 : 1;
    const player = playerIndex === 0 || playerIndex === 1 ? playerIndex : 0;
    const scores = (game.players ?? []).map((p) => p?.board?.score ?? 0);
    features[40] = phase === 0 ? 1 : 0;
    features[41] = phase === 1 ? 1 : 0;
    features[42 + player] = 1;
    features[44] = (game.round ?? 0) / 12;
    features[45] = (scores[player] ?? 0) / 100;
    features[46] = (scores[1 - player] ?? 0) / 100;
    features[47] = ((scores[player] ?? 0) - (scores[1 - player] ?? 0)) / 100;

    if (action === SKIP_ACTION) {
      features[95] = 1;
      return features;
    }

    const decoded = this.#decodePlacementAction(action);
    const draftIndex = action < DRAFT_ACTIONS ? action : decoded?.draftIndex ?? -1;
    if (draftIndex < 0 || draftIndex >= DRAFT_ACTIONS) return features;
    const domino = game.currentDraft?.[draftIndex]?.domino;
    if (!domino) return features;

    const boardState = this.#boardFeatureState(game, player);
    this.#writeDominoFeatures(features, domino, draftIndex);

    if (action < DRAFT_ACTIONS) {
      const metrics = this.#bestMobilityMetrics(boardState, domino);
      this.#writeMetricFeatures(features, metrics);
      features[54] = Math.min(1, metrics.count / 64);
      features[55] = metrics.bestScoreDelta / 50;
      features[56] = Math.min(1, metrics.bestTouchCount / 8);
      return features;
    }

    if (!decoded) return features;
    const cells = this.#cellsForPlacement(domino, decoded.orientation, decoded.x, decoded.y, decoded.anchorEnd);
    const metrics = this.#placementMetricsForCells(boardState, cells.left, cells.right);
    this.#writeMetricFeatures(features, metrics);
    features[69 + decoded.anchorEnd] = 1;
    features[71] = decoded.x / 6;
    features[72] = decoded.y / 6;
    return features;
  }

  #writeStaticActionFeatures(features, action) {
    if (action < DRAFT_ACTIONS) {
      features[0] = 1;
      features[3 + action] = 1;
      return;
    }
    if (action === SKIP_ACTION) {
      features[2] = 1;
      return;
    }
    const decoded = this.#decodePlacementAction(action);
    if (!decoded) return;
    features[1] = 1;
    features[3 + decoded.draftIndex] = 1;
    features[7 + decoded.orientation / 90] = 1;
    features[11 + (decoded.x - COORD_MIN)] = 1;
    features[24 + (decoded.y - COORD_MIN)] = 1;
    features[37 + decoded.anchorEnd] = 1;
    features[39] = (Math.abs(decoded.x) + Math.abs(decoded.y)) / 12;
  }

  #writeDominoFeatures(features, domino, draftIndex) {
    const leftTerrain = terrainId(domino.leftEnd?.landscape);
    const rightTerrain = terrainId(domino.rightEnd?.landscape);
    const leftCrowns = domino.leftEnd?.crowns ?? 0;
    const rightCrowns = domino.rightEnd?.crowns ?? 0;
    features[48] = (domino.number ?? 0) / 48;
    features[49] = (leftCrowns + rightCrowns) / 6;
    features[50] = leftCrowns / 3;
    features[51] = rightCrowns / 3;
    features[52] = leftTerrain === rightTerrain ? 1 : 0;
    features[53] = draftIndex / 3;
    if (leftTerrain >= TERRAIN.wheat && leftTerrain <= TERRAIN.mine) {
      features[57 + (leftTerrain - TERRAIN.wheat)] = 1;
    }
    if (rightTerrain >= TERRAIN.wheat && rightTerrain <= TERRAIN.mine) {
      features[63 + (rightTerrain - TERRAIN.wheat)] = 1;
    }
  }

  #writeMetricFeatures(features, metrics) {
    features[73] = metrics.widthAfter / BOARD_LIMIT;
    features[74] = metrics.heightAfter / BOARD_LIMIT;
    features[75] = metrics.widthGrowth / BOARD_LIMIT;
    features[76] = metrics.heightGrowth / BOARD_LIMIT;
    features[77] = metrics.distance / 12;
    features[78] = metrics.scoreDelta / 50;
    features[79] = metrics.sameTouchCount / 8;
    features[80] = metrics.castleTouchCount / 8;
    features[81] = metrics.occupiedTouchCount / 8;
    features[82] = metrics.emptyTouchCount / 8;
    features[83] = metrics.regionSizeSum / 20;
    features[84] = metrics.regionCrownsSum / 8;
    features[85] = metrics.leftRegionSize / 20;
    features[86] = metrics.rightRegionSize / 20;
    features[87] = metrics.leftRegionCrowns / 8;
    features[88] = metrics.rightRegionCrowns / 8;
    features[89] = metrics.leftSameTouches / 4;
    features[90] = metrics.rightSameTouches / 4;
    features[91] = metrics.leftCastleTouches / 4;
    features[92] = metrics.rightCastleTouches / 4;
    features[93] = metrics.leftNeighborCrowns / 6;
    features[94] = metrics.rightNeighborCrowns / 6;
  }

  #boardFeatureState(game, playerIndex) {
    const tiles = new Map();
    const board = game.players?.[playerIndex]?.board?.board ?? {};
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    let found = false;
    for (const [key, tile] of Object.entries(board)) {
      const [x, y] = key.split(',').map((value) => Number.parseInt(value, 10));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      tiles.set(key, { x, y, terrainPlus: terrainId(tile.landscape) + 1, crowns: tile.crowns ?? 0 });
      if (!found) {
        minX = maxX = x;
        minY = maxY = y;
        found = true;
      } else {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return { tiles, minX, maxX, minY, maxY };
  }

  #emptyMetrics() {
    return {
      count: 0,
      bestScoreDelta: 0,
      bestTouchCount: 0,
      widthAfter: 0,
      heightAfter: 0,
      widthGrowth: 0,
      heightGrowth: 0,
      distance: 0,
      scoreDelta: 0,
      sameTouchCount: 0,
      castleTouchCount: 0,
      occupiedTouchCount: 0,
      emptyTouchCount: 0,
      regionSizeSum: 0,
      regionCrownsSum: 0,
      leftRegionSize: 0,
      rightRegionSize: 0,
      leftRegionCrowns: 0,
      rightRegionCrowns: 0,
      leftSameTouches: 0,
      rightSameTouches: 0,
      leftCastleTouches: 0,
      rightCastleTouches: 0,
      leftNeighborCrowns: 0,
      rightNeighborCrowns: 0,
    };
  }

  #bestMobilityMetrics(boardState, domino) {
    const anchors = this.#candidateAnchors(boardState);
    const seen = new Set();
    let bestScoreDelta = -Infinity;
    let bestTouchCount = -1;
    let bestCells = null;
    let count = 0;
    for (const orientation of ORIENTATIONS) {
      for (const anchor of anchors) {
        for (const anchorEnd of [ANCHOR_LEFT, ANCHOR_RIGHT]) {
          const cells = this.#cellsForPlacement(domino, orientation, anchor.x, anchor.y, anchorEnd);
          if (!this.#isValidPlacement(boardState, cells.left, cells.right)) continue;
          const key = this.#placementKey(domino, cells.left, cells.right);
          if (seen.has(key)) continue;
          seen.add(key);
          count += 1;
          const scoreDelta = this.#scoreDeltaLocal(boardState, cells.left, cells.right);
          const touchCount = this.#sameTouchCount(boardState, cells.left, cells.right);
          if (scoreDelta > bestScoreDelta || (scoreDelta === bestScoreDelta && touchCount > bestTouchCount)) {
            bestScoreDelta = scoreDelta;
            bestTouchCount = touchCount;
            bestCells = cells;
          }
        }
      }
    }
    const metrics = bestCells
      ? this.#placementMetricsForCells(boardState, bestCells.left, bestCells.right)
      : this.#emptyMetrics();
    metrics.count = count;
    metrics.bestScoreDelta = Math.max(0, bestScoreDelta);
    metrics.bestTouchCount = Math.max(0, bestTouchCount);
    return metrics;
  }

  #placementMetricsForCells(boardState, left, right) {
    const metrics = this.#emptyMetrics();
    if (!this.#coordInBounds(left.x, left.y) || !this.#coordInBounds(right.x, right.y)) return metrics;
    metrics.scoreDelta = this.#scoreDeltaLocal(boardState, left, right);

    const xs = [boardState.minX, boardState.maxX, left.x, right.x];
    const ys = [boardState.minY, boardState.maxY, left.y, right.y];
    metrics.widthAfter = Math.max(...xs) - Math.min(...xs) + 1;
    metrics.heightAfter = Math.max(...ys) - Math.min(...ys) + 1;
    metrics.widthGrowth = Math.max(0, metrics.widthAfter - (boardState.maxX - boardState.minX + 1));
    metrics.heightGrowth = Math.max(0, metrics.heightAfter - (boardState.maxY - boardState.minY + 1));
    metrics.distance = (Math.abs(left.x) + Math.abs(left.y) + Math.abs(right.x) + Math.abs(right.y)) / 2;

    const leftStats = this.#neighborStats(boardState, left);
    const rightStats = this.#neighborStats(boardState, right);
    metrics.sameTouchCount = leftStats.same + rightStats.same;
    metrics.castleTouchCount = leftStats.castle + rightStats.castle;
    metrics.occupiedTouchCount = leftStats.occupied + rightStats.occupied;
    metrics.emptyTouchCount = leftStats.empty + rightStats.empty;
    metrics.regionSizeSum = leftStats.regionSize + rightStats.regionSize;
    metrics.regionCrownsSum = leftStats.regionCrowns + rightStats.regionCrowns;
    metrics.leftRegionSize = leftStats.regionSize;
    metrics.rightRegionSize = rightStats.regionSize;
    metrics.leftRegionCrowns = leftStats.regionCrowns;
    metrics.rightRegionCrowns = rightStats.regionCrowns;
    metrics.leftSameTouches = leftStats.same;
    metrics.rightSameTouches = rightStats.same;
    metrics.leftCastleTouches = leftStats.castle;
    metrics.rightCastleTouches = rightStats.castle;
    metrics.leftNeighborCrowns = leftStats.neighborCrowns;
    metrics.rightNeighborCrowns = rightStats.neighborCrowns;
    return metrics;
  }

  #cellsForPlacement(domino, orientation, x, y, anchorEnd) {
    const offsets = {
      0: { x: 1, y: 0 },
      90: { x: 0, y: -1 },
      180: { x: -1, y: 0 },
      270: { x: 0, y: 1 },
    };
    const normalized = ((Number(orientation) % 360) + 360) % 360;
    const offset = offsets[normalized] ?? offsets[0];
    const leftEnd = {
      terrainPlus: terrainId(domino.leftEnd?.landscape) + 1,
      crowns: domino.leftEnd?.crowns ?? 0,
    };
    const rightEnd = {
      terrainPlus: terrainId(domino.rightEnd?.landscape) + 1,
      crowns: domino.rightEnd?.crowns ?? 0,
    };
    if (anchorEnd === ANCHOR_LEFT) {
      return {
        left: { x, y, ...leftEnd },
        right: { x: x + offset.x, y: y + offset.y, ...rightEnd },
      };
    }
    return {
      left: { x: x - offset.x, y: y - offset.y, ...leftEnd },
      right: { x, y, ...rightEnd },
    };
  }

  #candidateAnchors(boardState) {
    const candidates = new Map();
    for (const tile of boardState.tiles.values()) {
      for (const neighbor of this.#neighbors(tile.x, tile.y)) {
        if (!this.#coordInBounds(neighbor.x, neighbor.y)) continue;
        if (this.#tileAt(boardState, neighbor.x, neighbor.y)) continue;
        candidates.set(`${neighbor.x},${neighbor.y}`, neighbor);
      }
    }
    if (!candidates.size) candidates.set('0,0', { x: 0, y: 0 });
    return [...candidates.values()].sort((a, b) => {
      const ad = Math.abs(a.x) + Math.abs(a.y);
      const bd = Math.abs(b.x) + Math.abs(b.y);
      if (ad !== bd) return ad - bd;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
  }

  #isValidPlacement(boardState, left, right) {
    if (left.x === right.x && left.y === right.y) return false;
    if (!this.#coordInBounds(left.x, left.y) || !this.#coordInBounds(right.x, right.y)) return false;
    if (this.#tileAt(boardState, left.x, left.y) || this.#tileAt(boardState, right.x, right.y)) return false;
    const xs = [boardState.minX, boardState.maxX, left.x, right.x];
    const ys = [boardState.minY, boardState.maxY, left.y, right.y];
    if (Math.max(...xs) - Math.min(...xs) + 1 > BOARD_LIMIT) return false;
    if (Math.max(...ys) - Math.min(...ys) + 1 > BOARD_LIMIT) return false;
    return this.#hasValidTouch(boardState, left) || this.#hasValidTouch(boardState, right);
  }

  #hasValidTouch(boardState, cell) {
    return this.#neighbors(cell.x, cell.y).some((neighbor) => {
      const tile = this.#tileAt(boardState, neighbor.x, neighbor.y);
      return tile && (tile.terrainPlus === TERRAIN.castle + 1 || tile.terrainPlus === cell.terrainPlus);
    });
  }

  #scoreDeltaLocal(boardState, left, right) {
    const groups = new Map();
    const seenRegions = new Set();
    let beforeScore = 0;
    for (const cell of [left, right]) {
      const group = groups.get(cell.terrainPlus) ?? { size: 0, crowns: 0 };
      group.size += 1;
      group.crowns += cell.crowns;
      groups.set(cell.terrainPlus, group);
      for (const neighbor of this.#neighbors(cell.x, cell.y)) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (!this.#coordInBounds(neighbor.x, neighbor.y) || seenRegions.has(neighborKey)) continue;
        const tile = this.#tileAt(boardState, neighbor.x, neighbor.y);
        if (!tile || tile.terrainPlus !== cell.terrainPlus) continue;
        const region = this.#regionStats(boardState, neighbor.x, neighbor.y, cell.terrainPlus);
        for (const key of region.seen) seenRegions.add(key);
        beforeScore += region.size * region.crowns;
        group.size += region.size;
        group.crowns += region.crowns;
      }
    }
    let afterScore = 0;
    for (const group of groups.values()) afterScore += group.size * group.crowns;
    return afterScore - beforeScore;
  }

  #sameTouchCount(boardState, left, right) {
    let count = 0;
    for (const cell of [left, right]) {
      for (const neighbor of this.#neighbors(cell.x, cell.y)) {
        const tile = this.#tileAt(boardState, neighbor.x, neighbor.y);
        if (tile?.terrainPlus === cell.terrainPlus) count += 1;
      }
    }
    return count;
  }

  #neighborStats(boardState, cell) {
    const stats = {
      same: 0,
      castle: 0,
      occupied: 0,
      empty: 0,
      neighborCrowns: 0,
      regionSize: 0,
      regionCrowns: 0,
    };
    const visitedRegions = new Set();
    for (const neighbor of this.#neighbors(cell.x, cell.y)) {
      if (!this.#coordInBounds(neighbor.x, neighbor.y)) {
        stats.empty += 1;
        continue;
      }
      const tile = this.#tileAt(boardState, neighbor.x, neighbor.y);
      if (!tile) {
        stats.empty += 1;
        continue;
      }
      stats.occupied += 1;
      stats.neighborCrowns += tile.crowns;
      if (tile.terrainPlus === TERRAIN.castle + 1) stats.castle += 1;
      if (tile.terrainPlus === cell.terrainPlus) {
        stats.same += 1;
        const key = `${neighbor.x},${neighbor.y}`;
        if (!visitedRegions.has(key)) {
          const region = this.#regionStats(boardState, neighbor.x, neighbor.y, cell.terrainPlus);
          for (const seenKey of region.seen) visitedRegions.add(seenKey);
          stats.regionSize += region.size;
          stats.regionCrowns += region.crowns;
        }
      }
    }
    return stats;
  }

  #regionStats(boardState, x, y, terrainPlus) {
    const stack = [{ x, y }];
    const seen = new Set([`${x},${y}`]);
    let size = 0;
    let crowns = 0;
    while (stack.length) {
      const current = stack.pop();
      const tile = this.#tileAt(boardState, current.x, current.y);
      if (!tile || tile.terrainPlus !== terrainPlus) continue;
      size += 1;
      crowns += tile.crowns;
      for (const neighbor of this.#neighbors(current.x, current.y)) {
        const key = `${neighbor.x},${neighbor.y}`;
        if (seen.has(key) || !this.#coordInBounds(neighbor.x, neighbor.y)) continue;
        const neighborTile = this.#tileAt(boardState, neighbor.x, neighbor.y);
        if (!neighborTile || neighborTile.terrainPlus !== terrainPlus) continue;
        seen.add(key);
        stack.push(neighbor);
      }
    }
    return { size, crowns, seen };
  }

  #placementKey(domino, left, right) {
    const cells = [
      [left.x, left.y, left.terrainPlus, left.crowns],
      [right.x, right.y, right.terrainPlus, right.crowns],
    ].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return `${domino.number}|${cells.map((cell) => cell.join(',')).join('|')}`;
  }

  #tileAt(boardState, x, y) {
    return boardState.tiles.get(`${x},${y}`) ?? null;
  }

  #coordInBounds(x, y) {
    return x >= COORD_MIN && x <= COORD_MAX && y >= COORD_MIN && y <= COORD_MAX;
  }

  #neighbors(x, y) {
    return [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ];
  }

  #chooseDraftAction(game, playerIndex) {
    if (game.currentPickingPlayerIndex !== playerIndex) return null;
    const suggested = this.#advisor.suggestDraftMove(game, playerIndex);
    const index = suggested?.index ?? game.currentDraft.findIndex((slot) => slot.player == null && !slot.placed);
    if (index == null || index < 0) return null;
    const action = { type: 'pickDraft', payload: { index, ai: true } };
    this.#recordDecisionTrace({
      source: 'advisor',
      phase: game.state?.description ?? String(game.state),
      playerIndex,
      chosen: this.#describeGameAction(game, action),
      candidates: [{
        action: this.#describeGameAction(game, action),
        totalScore: suggested?.score ?? null,
        reason: suggested?.reason ?? 'Advisor draft',
        components: suggested ?? {},
      }],
    });
    return action;
  }

  #choosePlacementAction(game, playerIndex) {
    const choices = game.getCurrentPlacingChoicesForPlayer?.(playerIndex) ?? [];
    if (!choices.length) return null;

    const suggested = this.#advisor.suggestPlacementMove(game, playerIndex);
    if (suggested) {
      const action = {
        type: 'place',
        payload: {
          ai: true,
          dominoNumber: suggested.dominoNumber,
          orientation: suggested.orientation,
          x: suggested.x,
          y: suggested.y,
          anchorEnd: suggested.anchorEnd === DominoEnd.RIGHT ? 'RIGHT' : 'LEFT',
          placeId: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        },
      };
      this.#recordDecisionTrace({
        source: 'advisor',
        phase: game.state?.description ?? String(game.state),
        playerIndex,
        chosen: this.#describeGameAction(game, action),
        candidates: [{
          action: this.#describeGameAction(game, action),
          totalScore: suggested.score ?? null,
          reason: suggested.reason ?? 'Advisor placement',
          components: suggested,
        }],
      });
      return action;
    }

    if (game.canSkipPlacementForPlayer?.(playerIndex)) {
      const action = { type: 'skip', payload: { ai: true } };
      this.#recordDecisionTrace({
        source: 'advisor',
        phase: game.state?.description ?? String(game.state),
        playerIndex,
        chosen: this.#describeGameAction(game, action),
        candidates: [{ action: this.#describeGameAction(game, action), totalScore: 0, reason: 'No legal placement', components: {} }],
      });
      return action;
    }

    return null;
  }

  #chooseHeuristicAction(game, playerIndex) {
    const weights = this.#artifact?.weights;
    if (!Array.isArray(weights) || weights.length < 10) return null;
    if (game.state === GameState.DRAFT) return this.#chooseHeuristicDraftAction(game, playerIndex, weights);
    if (game.state === GameState.PLACE) return this.#chooseHeuristicPlacementAction(game, playerIndex, weights);
    return null;
  }

  #chooseHeuristicDraftAction(game, playerIndex, weights) {
    if (game.currentPickingPlayerIndex !== playerIndex) return null;
    let bestIndex = -1;
    let bestScore = -Infinity;
    const traceCandidates = this.#traceEnabled ? [] : null;
    (game.currentDraft ?? []).forEach((slot, index) => {
      if (slot?.player != null || slot?.placed || !slot?.domino) return;
      const domino = slot.domino;
      const crowns = (domino.leftEnd?.crowns ?? 0) + (domino.rightEnd?.crowns ?? 0);
      const diversity = terrainKey(domino.leftEnd?.landscape) === terrainKey(domino.rightEnd?.landscape) ? 0 : 1;
      const adjustment = this.#draftScoreBreakdown(game, playerIndex, index);
      const baseScore = crowns * weights[0] + domino.number * weights[1] + diversity * weights[2];
      const score = baseScore + adjustment.score * 8;
      if (traceCandidates) {
        traceCandidates.push({
          action: this.#describeEncodedAction(game, index),
          modelScore: baseScore,
          adjustment: adjustment.score * 8,
          totalScore: score,
          reason: adjustment.reason,
          components: adjustment.components,
        });
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) return null;
    const action = { type: 'pickDraft', payload: { index: bestIndex, ai: true } };
    this.#recordDecisionTrace({
      source: 'weighted-heuristic',
      phase: game.state?.description ?? String(game.state),
      playerIndex,
      chosen: this.#describeGameAction(game, action),
      candidates: this.#topTraceCandidates(traceCandidates),
    });
    return action;
  }

  #chooseHeuristicPlacementAction(game, playerIndex, weights) {
    const options = game.getCurrentPlacementOptionsForPlayer?.(playerIndex) ?? [];
    if (!options.length) {
      if (game.canSkipPlacementForPlayer?.(playerIndex)) return { type: 'skip', payload: { ai: true } };
      return null;
    }

    let best = null;
    let bestScore = -Infinity;
    const traceCandidates = this.#traceEnabled ? [] : null;
    for (const option of options) {
      const score = this.#weightedPlacementScore(game, playerIndex, option, weights);
      if (traceCandidates) {
        const domino = this.#dominoForOption(game, playerIndex, option);
        let quality = { score: 0, reason: 'Unknown domino', components: {} };
        if (domino) {
          const boardState = this.#boardFeatureState(game, playerIndex);
          const cells = this.#cellsForPlacement(
            domino,
            option.orientation,
            option.x,
            option.y,
            option.anchorEnd === DominoEnd.RIGHT ? ANCHOR_RIGHT : ANCHOR_LEFT,
          );
          quality = this.#placementScoreBreakdown(
            boardState,
            cells,
            this.#difficultyProfile(),
            this.#remainingPlacementOutlook(
              game,
              playerIndex,
              domino.number,
              this.#boardStateAfterPlacement(boardState, cells.left, cells.right),
            ),
          );
        }
        traceCandidates.push({
          action: {
            type: 'place',
            dominoNumber: option.dominoNumber,
            orientation: option.orientation,
            x: option.x,
            y: option.y,
            anchorEnd: option.anchorEnd === DominoEnd.RIGHT ? 'RIGHT' : 'LEFT',
          },
          totalScore: score,
          reason: quality.reason,
          components: quality.components,
        });
      }
      if (score > bestScore) {
        bestScore = score;
        best = option;
      }
    }
    if (!best) return null;
    const action = {
      type: 'place',
      payload: {
        ai: true,
        dominoNumber: best.dominoNumber,
        orientation: best.orientation,
        x: best.x,
        y: best.y,
        anchorEnd: best.anchorEnd === DominoEnd.RIGHT ? 'RIGHT' : 'LEFT',
        placeId: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    };
    this.#recordDecisionTrace({
      source: 'weighted-heuristic',
      phase: game.state?.description ?? String(game.state),
      playerIndex,
      chosen: this.#describeGameAction(game, action),
      candidates: this.#topTraceCandidates(traceCandidates),
    });
    return action;
  }

  #weightedPlacementScore(game, playerIndex, option, weights) {
    const domino = this.#dominoForOption(game, playerIndex, option);
    if (!domino) return -Infinity;
    const cells = this.#cellsForOption(option, domino);
    const boardManager = game.players?.[playerIndex]?.board;
    const board = boardManager?.board ?? {};
    const boardSize = boardManager?.boardSize;
    const before = this.#scoreBoard(board);
    const after = this.#scoreBoard(board, cells);
    const scoreDelta = after - before;
    const placementHeuristic = this.#placementHeuristic(board, option, domino, cells);
    const crowns = (domino.leftEnd?.crowns ?? 0) + (domino.rightEnd?.crowns ?? 0);
    const compactness = Math.abs(cells[0].x) + Math.abs(cells[0].y) + Math.abs(cells[1].x) + Math.abs(cells[1].y);
    const oldArea = boardSize
      ? (boardSize.xMax - boardSize.xMin + 1) * (boardSize.yMax - boardSize.yMin + 1)
      : 1;
    const xs = [
      boardSize?.xMin ?? 0,
      boardSize?.xMax ?? 0,
      cells[0].x,
      cells[1].x,
    ];
    const ys = [
      boardSize?.yMin ?? 0,
      boardSize?.yMax ?? 0,
      cells[0].y,
      cells[1].y,
    ];
    const newArea = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
    const touches = this.#matchingTouchCount(board, cells[0]) + this.#matchingTouchCount(board, cells[1]);
    const boardState = this.#boardFeatureState(game, playerIndex);
    const anchorEnd = option.anchorEnd === DominoEnd.RIGHT ? ANCHOR_RIGHT : ANCHOR_LEFT;
    const qualityCells = this.#cellsForPlacement(domino, option.orientation, option.x, option.y, anchorEnd);
    const quality = this.#placementScoreBreakdown(
      boardState,
      qualityCells,
      this.#difficultyProfile(),
      this.#remainingPlacementOutlook(
        game,
        playerIndex,
        domino.number,
        this.#boardStateAfterPlacement(boardState, qualityCells.left, qualityCells.right),
      ),
    );
    const placementQualityScore = this.#placementAdjustmentAllowed() ? quality.components.raw * 0.45 : 0;
    return scoreDelta * weights[3]
      + placementHeuristic * weights[4]
      + crowns * weights[5]
      - compactness * weights[6]
      - option.dominoNumber * weights[7]
      - (newArea - oldArea) * weights[8]
      + touches * weights[9]
      + placementQualityScore;
  }

  #dominoForOption(game, playerIndex, option) {
    return (game.getCurrentPlacingChoicesForPlayer?.(playerIndex) ?? [])
      .find((choice) => choice?.domino?.number === option.dominoNumber)
      ?.domino ?? null;
  }

  #cellsForOption(option, domino) {
    const anchor = { x: option.x, y: option.y };
    const offsets = {
      0: { x: 1, y: 0 },
      90: { x: 0, y: -1 },
      180: { x: -1, y: 0 },
      270: { x: 0, y: 1 },
    };
    const offset = offsets[((Number(option.orientation) % 360) + 360) % 360] ?? offsets[0];
    const other = { x: option.x + offset.x, y: option.y + offset.y };
    return option.anchorEnd === DominoEnd.LEFT
      ? [
        { ...anchor, landscape: domino.leftEnd.landscape, crowns: domino.leftEnd.crowns },
        { ...other, landscape: domino.rightEnd.landscape, crowns: domino.rightEnd.crowns },
      ]
      : [
        { ...other, landscape: domino.leftEnd.landscape, crowns: domino.leftEnd.crowns },
        { ...anchor, landscape: domino.rightEnd.landscape, crowns: domino.rightEnd.crowns },
      ];
  }

  #scoreBoard(board, extraCells = []) {
    const tiles = new Map();
    for (const [key, tile] of Object.entries(board ?? {})) {
      tiles.set(key, {
        terrain: terrainId(tile.landscape),
        crowns: tile.crowns ?? 0,
      });
    }
    for (const cell of extraCells) {
      tiles.set(`${cell.x},${cell.y}`, {
        terrain: terrainId(cell.landscape),
        crowns: cell.crowns ?? 0,
      });
    }

    const visited = new Set();
    let total = 0;
    for (const [key, tile] of tiles.entries()) {
      if (visited.has(key) || tile.terrain <= TERRAIN.castle) continue;
      const stack = [key];
      visited.add(key);
      let count = 0;
      let crowns = 0;
      while (stack.length) {
        const currentKey = stack.pop();
        const current = tiles.get(currentKey);
        count += 1;
        crowns += current.crowns ?? 0;
        const [x, y] = currentKey.split(',').map((value) => Number.parseInt(value, 10));
        for (const neighborKey of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) {
          if (visited.has(neighborKey)) continue;
          const neighbor = tiles.get(neighborKey);
          if (!neighbor || neighbor.terrain !== tile.terrain) continue;
          visited.add(neighborKey);
          stack.push(neighborKey);
        }
      }
      total += count * crowns;
    }
    return total;
  }

  #placementHeuristic(board, option, domino, cells) {
    const touchScore = (cell) => {
      let score = (cell.crowns ?? 0) * 10;
      for (const neighbor of this.#neighborTiles(board, cell.x, cell.y)) {
        if (terrainId(neighbor.landscape) === terrainId(cell.landscape)) {
          score += 3 + (cell.crowns ?? 0);
        } else if (terrainId(neighbor.landscape) === TERRAIN.castle) {
          score += 1.5;
        }
      }
      return score;
    };
    const compactness = -0.1 * (
      Math.abs(cells[0].x) + Math.abs(cells[0].y) + Math.abs(cells[1].x) + Math.abs(cells[1].y)
    );
    return touchScore(cells[0]) + touchScore(cells[1]) + compactness - option.dominoNumber * 0.005;
  }

  #matchingTouchCount(board, cell) {
    return this.#neighborTiles(board, cell.x, cell.y)
      .filter((tile) => {
        const terrain = terrainId(tile.landscape);
        return terrain === TERRAIN.castle || terrain === terrainId(cell.landscape);
      })
      .length;
  }

  #neighborTiles(board, x, y) {
    return [
      board?.[`${x + 1},${y}`],
      board?.[`${x - 1},${y}`],
      board?.[`${x},${y + 1}`],
      board?.[`${x},${y - 1}`],
    ].filter(Boolean);
  }

  #recordDecisionTrace(trace) {
    if (!this.#traceEnabled || !trace) return;
    const normalized = {
      at: Date.now(),
      difficulty: this.#difficulty,
      ablationMode: this.#ablationMode,
      backend: this.backend,
      ...trace,
    };
    this.#lastDecisionTrace = normalized;
    this.#decisionTraces.push(normalized);
    if (this.#decisionTraces.length > 100) this.#decisionTraces.shift();
    if (globalThis.KINGDOMINO_AI_DEBUG === true) {
      console.debug('[kingdomino-ai]', normalized);
    }
  }

  #topTraceCandidates(candidates, limit = 5) {
    if (!Array.isArray(candidates)) return [];
    return [...candidates]
      .sort((a, b) => (b.totalScore ?? -Infinity) - (a.totalScore ?? -Infinity))
      .slice(0, limit)
      .map((candidate, index) => ({
        rank: index + 1,
        ...this.#roundTraceNumbers(candidate),
      }));
  }

  #roundTraceNumbers(value) {
    if (typeof value === 'number') return Math.round(value * 1000) / 1000;
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item) => this.#roundTraceNumbers(item));
    const rounded = {};
    for (const [key, child] of Object.entries(value)) {
      rounded[key] = this.#roundTraceNumbers(child);
    }
    return rounded;
  }

  #describeEncodedAction(game, action) {
    if (action < DRAFT_ACTIONS) {
      const domino = game.currentDraft?.[action]?.domino;
      return {
        type: 'pickDraft',
        index: action,
        dominoNumber: domino?.number ?? null,
        left: terrainKey(domino?.leftEnd?.landscape),
        right: terrainKey(domino?.rightEnd?.landscape),
      };
    }
    if (action === SKIP_ACTION) return { type: 'skip' };
    const decoded = this.#decodePlacementAction(action);
    const domino = game.currentDraft?.[decoded?.draftIndex]?.domino;
    return {
      type: 'place',
      draftIndex: decoded?.draftIndex ?? null,
      dominoNumber: domino?.number ?? null,
      orientation: decoded?.orientation ?? null,
      x: decoded?.x ?? null,
      y: decoded?.y ?? null,
      anchorEnd: decoded?.anchorEnd ? 'RIGHT' : 'LEFT',
    };
  }

  #describeGameAction(game, action) {
    if (!action) return null;
    if (action.type === 'pickDraft') {
      return this.#describeEncodedAction(game, action.payload?.index ?? -1);
    }
    if (action.type === 'skip') return { type: 'skip' };
    return {
      type: action.type,
      dominoNumber: action.payload?.dominoNumber ?? null,
      orientation: action.payload?.orientation ?? null,
      x: action.payload?.x ?? null,
      y: action.payload?.y ?? null,
      anchorEnd: action.payload?.anchorEnd ?? null,
    };
  }
}
