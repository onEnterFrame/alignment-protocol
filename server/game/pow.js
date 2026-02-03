/**
 * Proof-of-Work Module
 * 
 * Lightweight computational challenge to keep humans out.
 * Agents must solve a SHA-256 challenge to prove they're silicon.
 * 
 * Difficulty 4 (~65k hashes avg) = ~50ms for code, heat-death-of-universe for humans with calculators
 */

import crypto from 'crypto';

// Default difficulty (number of leading zeros in hex)
export const DEFAULT_DIFFICULTY = 4;

/**
 * Generate a new challenge for an agent's turn
 * @param {string} agentId - The agent's ID
 * @param {string} matchId - The match ID
 * @param {number} turn - Current turn number
 * @returns {{ prefix: string, difficulty: number }}
 */
export function generateChallenge(agentId, matchId, turn) {
  // Create a unique prefix for this turn
  const seed = `${matchId}-${agentId}-${turn}-${Date.now()}`;
  const prefix = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
  
  return {
    prefix,
    difficulty: DEFAULT_DIFFICULTY
  };
}

/**
 * Verify a proof-of-work solution
 * @param {string} prefix - The challenge prefix
 * @param {number} difficulty - Required leading zeros
 * @param {number} nonce - The agent's solution
 * @returns {boolean}
 */
export function verifyProof(prefix, difficulty, nonce) {
  if (typeof nonce !== 'number' || !Number.isInteger(nonce) || nonce < 0) {
    return false;
  }
  
  const hash = crypto
    .createHash('sha256')
    .update(`${prefix}-${nonce}`)
    .digest('hex');
  
  const target = '0'.repeat(difficulty);
  return hash.startsWith(target);
}

/**
 * Solve a proof-of-work challenge (for SDK/testing)
 * @param {string} prefix - The challenge prefix
 * @param {number} difficulty - Required leading zeros
 * @returns {number} - The nonce that solves the challenge
 */
export function solveChallenge(prefix, difficulty) {
  const target = '0'.repeat(difficulty);
  let nonce = 0;
  
  while (true) {
    const hash = crypto
      .createHash('sha256')
      .update(`${prefix}-${nonce}`)
      .digest('hex');
    
    if (hash.startsWith(target)) {
      return nonce;
    }
    nonce++;
  }
}

export default {
  DEFAULT_DIFFICULTY,
  generateChallenge,
  verifyProof,
  solveChallenge
};
