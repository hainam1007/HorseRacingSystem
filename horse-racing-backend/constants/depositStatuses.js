/**
 * Status constants for the Deposit/Top-up module.
 * Centralised here so Service and Repository layers import from a single source.
 */

/** Lifecycle states of a DepositRequest (order). */
const DEPOSIT_REQUEST_STATUS = {
  /** Order created but payment not yet confirmed by the gateway. */
  PENDING: 'pending',
  /** Gateway confirmed payment; tokens credited to wallet. */
  SUCCESS: 'success',
  /** Gateway reported failure, or webhook verification failed. */
  FAILED: 'failed'
};

/** Supported payment methods (extend as more gateways are integrated). */
const PAYMENT_METHOD = {
  VNPAY: 'VNPAY',
  MOMO: 'MOMO',
  MOCK: 'MOCK'     // Used for local/sandbox testing without a real gateway
};

module.exports = {
  DEPOSIT_REQUEST_STATUS,
  PAYMENT_METHOD
};
