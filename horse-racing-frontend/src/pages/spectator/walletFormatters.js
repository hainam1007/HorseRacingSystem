export function getWalletBalance(payload) {
  const value = payload?.wallet?.token_balance ?? payload?.token_balance ?? payload?.balance;
  const balance = Number(value);
  return Number.isFinite(balance) ? balance : null;
}

export function formatTokenAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-- TOKEN";
  return `${amount.toLocaleString()} TOKEN`;
}

export function formatTransactionAmount(transaction) {
  const amount = Number(transaction?.amount);
  const prefix = transaction?.direction === "debit" ? "-" : "+";
  if (!Number.isFinite(amount)) return "--";
  return `${prefix}${amount.toLocaleString()} TOKEN`;
}

export function formatTransactionDate(value) {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

export function transactionLabel(type) {
  const labels = {
    deposit: "Wallet deposit",
    bet_deduct: "Prediction stake",
    bet_refund: "Prediction refund",
    bet_win: "Prediction payout",
    race_prize: "Race prize",
    redeem: "Reward redemption",
  };

  return labels[type] || "Wallet transaction";
}
