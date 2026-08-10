const User = require('../models/User');
const Wallet = require('../models/Wallet');
const DepositRequest = require('../models/DepositRequest');
const Bet = require('../models/Bet');
const PrizeAward = require('../models/PrizeAward');
const Race = require('../models/Race');
const Tournament = require('../models/Tournament');
const Violation = require('../models/Violation');
const RaceResult = require('../models/RaceResult');
const ApiError = require('../utils/ApiError');

const ICT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Helper: Parse YYYY-MM-DD into ICT (GMT+7) boundaries.
 */
function getIctDateRange(fromDateStr, toDateStr) {
  const match = {};
  if (fromDateStr) {
    match.$gte = new Date(`${fromDateStr}T00:00:00.000+07:00`);
  }
  if (toDateStr) {
    match.$lte = new Date(`${toDateStr}T23:59:59.999+07:00`);
  }
  return Object.keys(match).length > 0 ? match : null;
}

function dateStringInIct(date) {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(dateString, amount) {
  return dateStringInIct(new Date(new Date(`${dateString}T00:00:00.000+07:00`).getTime() + amount * DAY_MS));
}

function getAnalyticsWindow(fromDateStr, toDateStr) {
  const now = new Date();
  const defaultTo = dateStringInIct(now);
  const defaultFrom = addDays(defaultTo, -29);
  const from = fromDateStr || defaultFrom;
  const to = toDateStr || defaultTo;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(from) || !datePattern.test(to)) {
    throw new ApiError(400, 'Dashboard dates must use YYYY-MM-DD.');
  }
  const current = getIctDateRange(from, to);
  const days = Math.round((new Date(`${to}T00:00:00+07:00`) - new Date(`${from}T00:00:00+07:00`)) / DAY_MS) + 1;
  if (!Number.isFinite(days) || days < 1 || days > 366) {
    throw new ApiError(400, 'Dashboard date range must contain between 1 and 366 days.');
  }
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(from, -days);
  return { from, to, current, previous: getIctDateRange(previousFrom, previousTo), previousFrom, previousTo, days };
}

function percentageChange(current, previous) {
  if (previous <= 0) return current ? null : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function aggregateTotal(Model, match, field) {
  return Model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: field } } }])
    .then((rows) => Number(rows[0]?.total || 0));
}

class AdminDashboardService {
  /**
   * 1. GET /api/admin/dashboard
   * Returns a global summary using atomic counts for performance.
   */
  async getDashboardSummary(from, to) {
    const window = getAnalyticsWindow(from, to);
    const dateMetrics = async (range) => {
      const tournamentMatch = {
        status: { $nin: ['deleted', 'cancelled'] },
        start_date: { $lte: range.$lte },
        $or: [
          { end_date: { $gte: range.$gte } },
          { end_date: null },
          { end_date: { $exists: false } }
        ]
      };
      const [newUsers, depositVnd, depositCount, bettingRows, completedRaces, racesInPeriod, tournamentsInPeriod] = await Promise.all([
        User.countDocuments({ created_at: range }),
        aggregateTotal(DepositRequest, { created_at: range, status: 'success' }, '$total_vnd'),
        DepositRequest.countDocuments({ created_at: range, status: 'success' }),
        Bet.aggregate([
          { $match: { submitted_at: range } },
          {
            $group: {
              _id: null,
              totalStake: { $sum: '$stake_amount' },
              settledStake: {
                $sum: { $cond: [{ $in: ['$status', ['won', 'lost']] }, '$stake_amount', 0] }
              },
              payout: {
                $sum: { $cond: [{ $in: ['$status', ['won', 'lost']] }, '$payout_amount', 0] }
              },
              count: { $sum: 1 },
              bettors: { $addToSet: '$spectator_id' }
            }
          }
        ]),
        Race.countDocuments({ race_date: range, status: 'completed' }),
        Race.countDocuments({ race_date: range, status: { $nin: ['deleted', 'cancelled'] } }),
        Tournament.countDocuments(tournamentMatch)
      ]);
      const betting = bettingRows[0] || {};
      const grossGamingMargin = Number(betting.settledStake || 0) - Number(betting.payout || 0);
      return {
        newUsers,
        depositVnd,
        depositCount,
        betStake: Number(betting.totalStake || 0),
        settledStake: Number(betting.settledStake || 0),
        betPayout: Number(betting.payout || 0),
        betCount: Number(betting.count || 0),
        activeBettors: betting.bettors?.length || 0,
        grossGamingMargin,
        completedRaces,
        racesInPeriod,
        tournamentsInPeriod
      };
    };

    const [current, previous, totalUsers, activeWallets, walletAgg, pendingDeposits, pendingBets, liveRaces, scheduledRaces, unresolvedIncidents, unpublishedResults, dailyUsers, dailyDeposits, dailyBets, dailyRaces, raceStatuses, topRaces, upcomingRaces] = await Promise.all([
      dateMetrics(window.current),
      dateMetrics(window.previous),
      User.countDocuments(),
      Wallet.countDocuments({ status: { $ne: 'inactive' } }),
      Wallet.aggregate([{ $group: { _id: null, totalToken: { $sum: '$token_balance' } } }]),
      DepositRequest.countDocuments({ status: 'pending' }),
      Bet.countDocuments({ status: 'pending' }),
      Race.countDocuments({ status: { $in: ['running', 'live'] } }),
      Race.countDocuments({ status: 'scheduled', race_date: { $gte: new Date() } }),
      Violation.countDocuments({ status: { $nin: ['confirmed', 'dismissed'] } }),
      RaceResult.aggregate([{ $group: { _id: '$race_id', statuses: { $addToSet: '$status' } } }, { $match: { statuses: { $nin: ['published'] } } }, { $count: 'total' }]),
      User.aggregate([{ $match: { created_at: window.current } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at', timezone: 'Asia/Ho_Chi_Minh' } }, value: { $sum: 1 } } }]),
      DepositRequest.aggregate([{ $match: { created_at: window.current, status: 'success' } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at', timezone: 'Asia/Ho_Chi_Minh' } }, value: { $sum: '$total_vnd' }, count: { $sum: 1 } } }]),
      Bet.aggregate([{ $match: { submitted_at: window.current } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$submitted_at', timezone: ICT_TIMEZONE } }, stake: { $sum: '$stake_amount' }, settled_stake: { $sum: { $cond: [{ $in: ['$status', ['won', 'lost']] }, '$stake_amount', 0] } }, payout: { $sum: { $cond: [{ $in: ['$status', ['won', 'lost']] }, '$payout_amount', 0] } }, count: { $sum: 1 } } }]),
      Race.aggregate([{ $match: { race_date: window.current, status: 'completed' } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$race_date', timezone: ICT_TIMEZONE } }, value: { $sum: 1 } } }]),
      Race.aggregate([{ $match: { status: { $ne: 'deleted' } } }, { $group: { _id: '$status', value: { $sum: 1 } } }]),
      Bet.aggregate([
        { $match: { submitted_at: window.current } },
        {
          $group: {
            _id: '$race_id',
            stakes: { $sum: '$stake_amount' },
            settled_stakes: {
              $sum: { $cond: [{ $in: ['$status', ['won', 'lost']] }, '$stake_amount', 0] }
            },
            bets: { $sum: 1 },
            payout: {
              $sum: { $cond: [{ $in: ['$status', ['won', 'lost']] }, '$payout_amount', 0] }
            }
          }
        },
        { $sort: { stakes: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'races', localField: '_id', foreignField: '_id', as: 'race' } },
        { $unwind: { path: '$race', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            race_id: '$_id',
            name: '$race.name',
            status: '$race.status',
            stakes: 1,
            settled_stakes: 1,
            payout: 1,
            gross_gaming_margin: { $subtract: ['$settled_stakes', '$payout'] },
            bets: 1
          }
        }
      ]),
      Race.find({ race_date: { $gte: new Date() } }).sort({ race_date: 1 }).limit(6).select('name race_date status location betting_status').lean()
    ]);

    const days = Array.from({ length: window.days }, (_, index) => {
      return addDays(window.from, index);
    });
    const mapByDay = (rows) => new Map(rows.map((row) => [row._id, row]));
    const usersByDay = mapByDay(dailyUsers);
    const depositsByDay = mapByDay(dailyDeposits);
    const betsByDay = mapByDay(dailyBets);
    const racesByDay = mapByDay(dailyRaces);
    const holdRate = current.settledStake > 0
      ? Number(((current.grossGamingMargin / current.settledStake) * 100).toFixed(1))
      : 0;

    return {
      source: 'dashboard-api',
      // Legacy top-level aliases retained for existing admin consumers.
      total_users: totalUsers,
      active_wallets: activeWallets,
      total_tokens_in_circulation: Number(walletAgg[0]?.totalToken || 0),
      total_successful_deposit_vnd: current.depositVnd,
      queues: { pending_deposits: pendingDeposits, pending_bets: pendingBets },
      period: {
        from: window.from,
        to: window.to,
        previous_from: window.previousFrom,
        previous_to: window.previousTo,
        days: window.days,
        timezone: ICT_TIMEZONE
      },
      metrics: {
        total_users: totalUsers,
        new_users: { value: current.newUsers, change: percentageChange(current.newUsers, previous.newUsers) },
        deposits_vnd: { value: current.depositVnd, change: percentageChange(current.depositVnd, previous.depositVnd), count: current.depositCount },
        stakes_tokens: { value: current.betStake, change: percentageChange(current.betStake, previous.betStake), count: current.betCount },
        gross_gaming_margin_tokens: { value: current.grossGamingMargin, change: percentageChange(current.grossGamingMargin, previous.grossGamingMargin), hold_rate: holdRate },
        races_held: { value: current.completedRaces, change: percentageChange(current.completedRaces, previous.completedRaces) },
        races_in_period: { value: current.racesInPeriod, change: percentageChange(current.racesInPeriod, previous.racesInPeriod) },
        tournaments_in_period: { value: current.tournamentsInPeriod, change: percentageChange(current.tournamentsInPeriod, previous.tournamentsInPeriod) },
        active_bettors: { value: current.activeBettors, change: percentageChange(current.activeBettors, previous.activeBettors) },
        live_races: liveRaces,
        scheduled_races: scheduledRaces,
        active_wallets: activeWallets,
        tokens_in_circulation: Number(walletAgg[0]?.totalToken || 0),
        pending_deposits: pendingDeposits,
        pending_bets: pendingBets,
        unresolved_incidents: unresolvedIncidents,
        unpublished_results: Number(unpublishedResults[0]?.total || 0)
      },
      charts: {
        daily: days.map((date) => ({
          date,
          new_users: usersByDay.get(date)?.value || 0,
          deposits_vnd: depositsByDay.get(date)?.value || 0,
          deposit_count: depositsByDay.get(date)?.count || 0,
          stakes_tokens: betsByDay.get(date)?.stake || 0,
          settled_stakes_tokens: betsByDay.get(date)?.settled_stake || 0,
          payouts_tokens: betsByDay.get(date)?.payout || 0,
          bets: betsByDay.get(date)?.count || 0,
          races_held: racesByDay.get(date)?.value || 0
        })),
        race_statuses: raceStatuses.map((row) => ({ status: row._id || 'unknown', value: row.value }))
      },
      operations: { top_races: topRaces, upcoming_races: upcomingRaces },
      alerts: [
        { key: 'pending_deposits', label: 'Pending deposits', value: pendingDeposits, attention: pendingDeposits > 0, href: '/admin/deposits' },
        { key: 'pending_bets', label: 'Unsettled bets', value: pendingBets, attention: pendingBets > 0, href: '/admin/schedule' },
        { key: 'unpublished_results', label: 'Results awaiting publication', value: Number(unpublishedResults[0]?.total || 0), attention: Number(unpublishedResults[0]?.total || 0) > 0, href: '/admin/results' },
        { key: 'unresolved_incidents', label: 'Unresolved incidents', value: unresolvedIncidents, attention: unresolvedIncidents > 0, href: '/admin/incidents' },
        { key: 'scheduled_races', label: 'Upcoming scheduled races', value: scheduledRaces, attention: false, href: '/admin/schedule' }
      ]
    };
  }

  async getLegacyDashboardSummary() {
    const [
      totalUsers,
      activeWallets,
      walletAgg,
      depositAgg,
      pendingDeposits,
      pendingBets
    ] = await Promise.all([
      User.countDocuments(),
      Wallet.countDocuments(),
      Wallet.aggregate([
        { $group: { _id: null, totalToken: { $sum: '$token_balance' } } }
      ]),
      DepositRequest.aggregate([
        { $match: { status: 'success' } },
        { $group: { _id: null, totalVnd: { $sum: '$total_vnd' } } }
      ]),
      DepositRequest.countDocuments({ status: 'pending' }),
      Bet.countDocuments({ status: 'pending' })
    ]);

    return {
      total_users: totalUsers,
      active_wallets: activeWallets,
      total_tokens_in_circulation: walletAgg[0]?.totalToken || 0,
      total_successful_deposit_vnd: depositAgg[0]?.totalVnd || 0,
      queues: {
        pending_deposits: pendingDeposits,
        pending_bets: pendingBets
      }
    };
  }

  /**
   * 2. GET /api/admin/betting-summary
   */
  async getBettingSummary(from, to) {
    const dateFilter = getIctDateRange(from, to);
    const matchStage = dateFilter ? { submitted_at: dateFilter } : {};

    const agg = await Bet.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalStaked: { $sum: '$stake_amount' },
          totalPaidOut: { $sum: '$payout_amount' }
        }
      }
    ]);

    const summary = {
      pending_bets: 0,
      settled_bets: 0,
      refunded_bets: 0,
      token_staked: 0,
      token_paid_out: 0,
      token_refunded: 0,
      breakdown: []
    };

    agg.forEach(group => {
      const status = group._id;
      summary.breakdown.push({ status, count: group.count });
      
      summary.token_staked += group.totalStaked;

      if (status === 'pending') {
        summary.pending_bets += group.count;
      } else if (status === 'won' || status === 'lost') {
        summary.settled_bets += group.count;
        summary.token_paid_out += group.totalPaidOut;
      } else if (status === 'cancelled') {
        summary.refunded_bets += group.count;
        summary.token_refunded += group.totalStaked;
      }
    });

    return summary;
  }

  /**
   * 3. GET /api/admin/deposit-requests
   */
  async getDepositRequests(from, to, status, page = 1, limit = 20) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const match = {};
    const dateFilter = getIctDateRange(from, to);
    if (dateFilter) match.created_at = dateFilter;
    if (status) match.status = status;

    const skip = (safePage - 1) * safeLimit;

    const [list, total, summaryAgg] = await Promise.all([
      DepositRequest.find(match)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate('user_id', 'username email')
        .lean(),
      DepositRequest.countDocuments(match),
      DepositRequest.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalVnd: { $sum: '$total_vnd' },
            totalToken: { $sum: '$total_token' }
          }
        }
      ])
    ]);

    const summary = {
      pending_count: 0,
      success_count: 0,
      failed_count: 0,
      total_vnd: 0,
      total_token: 0
    };

    summaryAgg.forEach(group => {
      summary.total_vnd += group.totalVnd || 0;
      summary.total_token += group.totalToken || 0;
      if (group._id === 'pending') summary.pending_count += group.count;
      if (group._id === 'success') summary.success_count += group.count;
      if (group._id === 'failed') summary.failed_count += group.count;
    });

    const totalPages = Math.ceil(total / safeLimit);

    return {
      list,
      summary,
      page: safePage,
      limit: safeLimit,
      total,
      total_pages: totalPages,
      has_next_page: safePage < totalPages,
      has_prev_page: safePage > 1
    };
  }

  /**
   * 4. GET /api/admin/prize-awards/summary
   */
  async getPrizeAwardsSummary(from, to) {
    const match = {};
    const dateFilter = getIctDateRange(from, to);
    if (dateFilter) match.created_at = dateFilter;

    const agg = await PrizeAward.aggregate([
      { $match: match },
      {
        $group: {
          _id: { currency: '$currency', status: '$status' },
          count: { $sum: 1 },
          totalAmount: { $sum: '$gross_amount' }
        }
      }
    ]);

    const summary = {};

    agg.forEach(group => {
      const currency = group._id.currency || 'VND';
      const status = group._id.status || 'unknown';
      
      if (!summary[currency]) {
        summary[currency] = {
          total_count: 0,
          total_amount: 0,
          statuses: {}
        };
      }

      summary[currency].total_count += group.count;
      summary[currency].total_amount += group.totalAmount;
      summary[currency].statuses[status] = {
        count: group.count,
        amount: group.totalAmount
      };
    });

    return summary;
  }
}

module.exports = new AdminDashboardService();
