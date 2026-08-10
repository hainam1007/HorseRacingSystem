// ─── Deposit Constants ─────────────────────────────────────────────────────────

/**
 * Exchange rate: how many VND equal one token.
 * Defaults to 1000 if the environment variable is not set.
 */
const VND_PER_TOKEN = Number(process.env.VND_PER_TOKEN) || 1000;

module.exports = { VND_PER_TOKEN };
