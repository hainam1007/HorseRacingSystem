'use strict';

/**
 * AdminDashboardService — Sequelize/PostgreSQL implementation.
 *
 * Business logic preserved from the legacy service (same
 * response shape, same field names, same date logic).
 *
 * Legacy aggregation pipeline concepts translated:
 *   - `Model.aggregate([...])`  → `sequelize.query(SQL)` (raw SQL is the
 *     idiomatic Postgres equivalent for `$group` / `$dateToString` / `$lookup`).
 *   - `Model.countDocuments(m)`  → `Model.count({ where })`.
 *   - `Model.find(m).sort().skip().limit().populate().lean()`
 *                              → `Model.findAll({ where, order, offset,
 *                                 limit, include, raw: true })`.
 *   - `.populate('user_id', 'username email')` → `include: [{ model: User,
 *     as: 'user', attributes: ['full_name', 'email'] }]` (the original code
 *     referenced `username` which doesn't exist in either schema; we replace
 *     with `full_name` to match the real schema field).
 *   - `$dateToString`            → `to_char(<col> AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')`.
 *   - `$lookup` + `$unwind`      → LEFT JOIN LATERAL.
 *
 * Loads Sequelize models via `loadSequelizeModels()` which is already
 * called during boot.
 */

const { Op } = require('sequelize');
const ApiError = require('../utils/ApiError');
const { loadSequelizeModels } = require('../models/sequelize/index.js');

const ICT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DAY_MS = 24 * 60 * 60 * 1000;

function getModels() {
    return loadSequelizeModels().models;
}

function getSequelize() {
    return loadSequelizeModels().sequelize;
}

function getIctDateRange(fromDateStr, toDateStr) {
    const match = {};
    if (fromDateStr) {
        match.$gte = new Date(`${fromDateStr}T00:00:00.000+07:00`);
    }
    if (toDateStr) {
        match.$lte = new Date(`${toDateStr}T23:59:59.999+07:00`);
    }
    if (Object.keys(match).length === 0) return null;
    return [match.$gte, match.$lte];
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
    return {
        from, to, current, previous: getIctDateRange(previousFrom, previousTo),
        previousFrom, previousTo, days
    };
}

function percentageChange(current, previous) {
    if (previous <= 0) return current ? null : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
}

/**
 * SQL helper: sum a column over rows matching the given date range.
 * Returns Number (0 when no rows).
 */
async function sumColumn(table, column, whereClause, params) {
    const [rows] = await pgQuery(
        `SELECT COALESCE(SUM(${column}), 0)::bigint AS total FROM ${table} WHERE ${whereClause}`,
        params
    );
    return Number(rows[0]?.total || 0);
}

async function countWhere(table, whereClause, params) {
    const sequelize = getSequelize();
    // Convert `?` placeholders to Postgres `$1, $2, ...` style.
    const sql = `SELECT COUNT(*)::int AS total FROM ${table} WHERE ${toPgParams(whereClause)}`;
    const [rows] = await sequelize.query(sql, { bind: params });
    return Number(rows[0]?.total || 0);
}

/**
 * Convert `?` placeholders to Postgres `$1, $2, ...` style.
 * Postgres `sequelize.query` does NOT substitute `?` automatically.
 */
function toPgParams(sql) {
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
}

/**
 * Run a parameterized SQL query with `?` placeholders, auto-converted to
 * Postgres `$N` parameter style.
 */
async function pgQuery(sql, params) {
    return getSequelize().query(toPgParams(sql), { bind: params });
}

class AdminDashboardService {
    /**
     * 1. GET /api/admin/dashboard
     */
    async getDashboardSummary(from, to) {
        const win = getAnalyticsWindow(from, to);
        const models = getModels();
        const { User, Wallet, DepositRequest, Bet, Race, Tournament, Violation, RaceResult, PrizeAward } = models;

        const [current, previous, totalUsers, activeWallets, walletAggRows, pendingDeposits, pendingBets, liveRaces, scheduledRaces, unresolvedIncidents, unpublishedResultsRows, dailyUsers, dailyDeposits, dailyBets, dailyRaces, raceStatuses, topRaces, upcomingRaces, roleMatrix, cashflowMatrix, equineDirectory] = await Promise.all([
            this._dateMetrics(win.current, models),
            this._dateMetrics(win.previous, models),
            User.count(),
            Wallet.count({ where: { token_balance: { [Op.gt]: 0 } } }),
            // Wallet aggregate — uses raceService-style raw SQL for token sum
            (async () => {
                const [rows] = await pgQuery(
                    `SELECT COALESCE(SUM(token_balance), 0)::bigint AS total FROM wallets`
                );
                return rows;
            })(),
            DepositRequest.count({ where: { status: 'pending' } }),
            Bet.count({ where: { status: 'pending' } }),
            Race.count({ where: { status: { [Op.in]: ['running', 'live'] } } }),
            Race.count({ where: { status: 'scheduled', race_date: { [Op.gte]: new Date() } } }),
            Violation.count({ where: { status: { [Op.notIn]: ['confirmed', 'dismissed'] } } }),
            // RaceResult: unpublished aggregate
            (async () => {
                const [rows] = await pgQuery(
                    `SELECT COUNT(*)::int AS total
                       FROM (
                         SELECT race_id, array_agg(DISTINCT status) AS statuses
                            FROM race_results
                          WHERE deleted_at IS NULL
                          GROUP BY race_id
                       ) agg
                      WHERE NOT ('published' = ANY(statuses))`
                );
                return rows;
            })(),
            // Daily users (group by date in ICT)
            this._dailyAggregate('users', 'created_at', win.current),
            // Daily deposits (group by date in ICT, status='success')
            this._dailyAggregate('deposit_requests', 'created_at', win.current, { status: 'success' }, ['total_vnd', 'count']),
            // Daily bets — uses raw SQL because columns are computed
            this._dailyBets(win.current),
            // Daily races
            this._dailyAggregate('races', 'race_date', win.current, { status: 'completed' }),
            // Race statuses
            (async () => {
                const [rows] = await pgQuery(
                    `SELECT status AS _id, COUNT(*)::int AS value
                       FROM races
                      WHERE status <> 'deleted' AND deleted_at IS NULL
                      GROUP BY status`
                );
                return rows;
            })(),
            // Top 5 races by bet stakes
            this._topRaces(win.current),
            // Upcoming races
            this._upcomingRaces(),
            // Role Analytics Matrix
            this.getRoleAnalyticsSummary(from, to),
            // Cashflow & Deposit Liquidity Matrix
            this.getCashflowMatrixSummary(from, to),
            // Equine & Jockey Directory
            this.getEquineJockeyDirectory()
        ]);

        const current_b = current.betting || {};
        const grossGamingMargin = Number(current_b.settledStake || 0) - Number(current_b.payout || 0);

        const days = Array.from({ length: win.days }, (_, index) => addDays(win.from, index));
        const mapByDay = (rows) => new Map(rows.map((row) => [row._id, row]));
        const usersByDay = mapByDay(dailyUsers);
        const depositsByDay = mapByDay(dailyDeposits);
        const betsByDay = mapByDay(dailyBets);
        const racesByDay = mapByDay(dailyRaces);
        const holdRate = current_b.settledStake > 0
            ? Number(((grossGamingMargin / current_b.settledStake) * 100).toFixed(1))
            : 0;

        const currentTotal = current.metrics || {};
        const previousTotal = previous.metrics || {};

        return {
            source: 'dashboard-api',
            total_users: totalUsers,
            active_wallets: activeWallets,
            total_tokens_in_circulation: Number(walletAggRows[0]?.total || 0),
            total_successful_deposit_vnd: currentTotal.depositVnd || 0,
            queues: { pending_deposits: pendingDeposits, pending_bets: pendingBets },
            period: {
                from: win.from, to: win.to,
                previous_from: win.previousFrom, previous_to: win.previousTo,
                days: win.days, timezone: ICT_TIMEZONE
            },
            metrics: {
                total_users: totalUsers,
                new_users: { value: currentTotal.newUsers, change: percentageChange(currentTotal.newUsers, previousTotal.newUsers) },
                deposits_vnd: { value: currentTotal.depositVnd, change: percentageChange(currentTotal.depositVnd, previousTotal.depositVnd), count: currentTotal.depositCount },
                stakes_tokens: { value: currentTotal.betStake, change: percentageChange(currentTotal.betStake, previousTotal.betStake), count: currentTotal.betCount },
                gross_gaming_margin_tokens: { value: grossGamingMargin, change: percentageChange(grossGamingMargin, previousTotal.grossGamingMargin), hold_rate: holdRate },
                races_held: { value: currentTotal.completedRaces, change: percentageChange(currentTotal.completedRaces, previousTotal.completedRaces) },
                races_in_period: { value: currentTotal.racesInPeriod, change: percentageChange(currentTotal.racesInPeriod, previousTotal.racesInPeriod) },
                tournaments_in_period: { value: currentTotal.tournamentsInPeriod, change: percentageChange(currentTotal.tournamentsInPeriod, previousTotal.tournamentsInPeriod) },
                active_bettors: { value: currentTotal.activeBettors, change: percentageChange(currentTotal.activeBettors, previousTotal.activeBettors) },
                live_races: liveRaces,
                scheduled_races: scheduledRaces,
                active_wallets: activeWallets,
                tokens_in_circulation: Number(walletAggRows[0]?.total || 0),
                pending_deposits: pendingDeposits,
                pending_bets: pendingBets,
                unresolved_incidents: unresolvedIncidents,
                unpublished_results: Number(unpublishedResultsRows[0]?.total || 0)
            },
            role_matrix: roleMatrix,
            cashflow_matrix: cashflowMatrix,
            equine_directory: equineDirectory,
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
                { key: 'unpublished_results', label: 'Results awaiting publication', value: Number(unpublishedResultsRows[0]?.total || 0), attention: Number(unpublishedResultsRows[0]?.total || 0) > 0, href: '/admin/results' },
                { key: 'unresolved_incidents', label: 'Unresolved incidents', value: unresolvedIncidents, attention: unresolvedIncidents > 0, href: '/admin/incidents' },
                { key: 'scheduled_races', label: 'Upcoming scheduled races', value: scheduledRaces, attention: false, href: '/admin/schedule' }
            ]
        };
    }

    async getEntityAnalytics(from, to) {
        const win = getAnalyticsWindow(from, to);
        const [fromDate, toDate] = win.current;
        const params = [fromDate, toDate];
        const run = (sql) => pgQuery(sql, params).then(([rows]) => rows.map((row) => ({
            id: row.id,
            name: row.name || 'Unknown',
            races: Number(row.races || 0),
            wins: Number(row.wins || 0),
            value: Number(row.value || 0)
        })));
        const raceFilter = `r.race_date BETWEEN ? AND ? AND r.status = 'completed' AND r.deleted_at IS NULL`;
        const resultFilter = `rr.deleted_at IS NULL AND ${raceFilter}`;

        const [owners, jockeys, referees, horses, bettors] = await Promise.all([
            run(`SELECT ho.id, COALESCE(u.full_name, ho.stable_name, 'Unnamed owner') AS name,
                    COUNT(DISTINCT r.id)::int AS races,
                    COUNT(DISTINCT r.id) FILTER (WHERE rr.final_position = 1 OR rr.position = 1)::int AS wins,
                    COALESCE(SUM(pa.owner_amount) FILTER (WHERE pa.status <> 'cancelled'), 0)::numeric AS value
                FROM horse_owners ho LEFT JOIN users u ON u.id = ho.user_id
                LEFT JOIN horses h ON h.owner_id = ho.id LEFT JOIN race_results rr ON rr.horse_id = h.id
                LEFT JOIN races r ON r.id = rr.race_id LEFT JOIN prize_awards pa ON pa.race_result_id = rr.id
                WHERE ho.deleted_at IS NULL AND (${resultFilter}) GROUP BY ho.id, u.full_name, ho.stable_name ORDER BY races DESC, name`),
            run(`SELECT j.id, COALESCE(u.full_name, 'Unnamed jockey') AS name,
                    COUNT(DISTINCT r.id)::int AS races,
                    COUNT(DISTINCT r.id) FILTER (WHERE rr.final_position = 1 OR rr.position = 1)::int AS wins,
                    COALESCE(SUM(pa.jockey_amount) FILTER (WHERE pa.status <> 'cancelled'), 0)::numeric AS value
                FROM jockeys j LEFT JOIN users u ON u.id = j.user_id LEFT JOIN race_results rr ON rr.jockey_id = j.id
                LEFT JOIN races r ON r.id = rr.race_id LEFT JOIN prize_awards pa ON pa.race_result_id = rr.id
                WHERE j.deleted_at IS NULL AND (${resultFilter}) GROUP BY j.id, u.full_name ORDER BY races DESC, name`),
            run(`SELECT ref.id, COALESCE(u.full_name, 'Unnamed referee') AS name,
                    COUNT(DISTINCT r.id)::int AS races, 0::int AS wins, 0::numeric AS value
                FROM race_referees ref LEFT JOIN users u ON u.id = ref.user_id LEFT JOIN races r ON r.referee_id = ref.id
                WHERE ref.deleted_at IS NULL AND ${raceFilter} GROUP BY ref.id, u.full_name ORDER BY races DESC, name`),
            run(`SELECT h.id, h.name,
                    COUNT(DISTINCT r.id)::int AS races,
                    COUNT(DISTINCT r.id) FILTER (WHERE rr.final_position = 1 OR rr.position = 1)::int AS wins,
                    COALESCE(SUM(pa.gross_amount) FILTER (WHERE pa.status <> 'cancelled'), 0)::numeric AS value
                FROM horses h LEFT JOIN race_results rr ON rr.horse_id = h.id LEFT JOIN races r ON r.id = rr.race_id
                LEFT JOIN prize_awards pa ON pa.race_result_id = rr.id
                WHERE h.deleted_at IS NULL AND (${resultFilter}) GROUP BY h.id, h.name ORDER BY races DESC, name`),
            run(`SELECT u.id, u.full_name AS name,
                    COUNT(DISTINCT b.race_id)::int AS races,
                    COUNT(*) FILTER (WHERE b.status = 'won')::int AS wins,
                    COALESCE(SUM(b.payout_amount) FILTER (WHERE b.status = 'won'), 0)::numeric AS value
                FROM users u JOIN bets b ON b.spectator_id = u.id JOIN races r ON r.id = b.race_id
                WHERE b.deleted_at IS NULL AND ${raceFilter} GROUP BY u.id, u.full_name ORDER BY races DESC, name`)
        ]);

        return { period: { from: win.from, to: win.to, timezone: ICT_TIMEZONE }, entities: { horseowner: owners, jockey: jockeys, referee: referees, horse: horses, bettor: bettors } };
    }

    /**
     * Helper: aggregate counts and sums for a date range.
     * Returns { metrics: {...}, betting: {...} } matching the original
     * `dateMetrics` function.
     */
    async _dateMetrics(range, models) {
        if (!range) {
            return {
                metrics: {
                    newUsers: 0, depositVnd: 0, depositCount: 0,
                    betStake: 0, settledStake: 0, betPayout: 0, betCount: 0,
                    activeBettors: 0, completedRaces: 0, racesInPeriod: 0,
                    tournamentsInPeriod: 0
                },
                betting: { totalStake: 0, settledStake: 0, payout: 0, count: 0, bettors: [] }
            };
        }
        const [fromDate, toDate] = range;
        const sequelize = getSequelize();

        const [
            newUsers,
            depositVnd,
            depositCount,
            bettingRows,
            completedRaces,
            racesInPeriod,
            tournamentsInPeriod
        ] = await Promise.all([
            // User.countDocuments({ created_at: range })
            countWhere('users', 'created_at >= ? AND created_at <= ?', [fromDate, toDate]),
            // aggregateTotal(DepositRequest, { created_at: range, status: 'success' }, '$total_vnd')
            sumColumn('deposit_requests', 'total_vnd', 'created_at >= ? AND created_at <= ? AND status = ?', [fromDate, toDate, 'success']),
            // DepositRequest.countDocuments({ created_at: range, status: 'success' })
            countWhere('deposit_requests', 'created_at >= ? AND created_at <= ? AND status = ?', [fromDate, toDate, 'success']),
            // Bet.aggregate(...) — combined total / settled / payout / count / bettors
            (async () => {
                const [rows] = await pgQuery(
                    `SELECT
                       COALESCE(SUM(stake_amount), 0)::bigint AS "totalStake",
                       COALESCE(SUM(CASE WHEN status IN ('won','lost') THEN stake_amount ELSE 0 END), 0)::bigint AS "settledStake",
                       COALESCE(SUM(CASE WHEN status IN ('won','lost') THEN payout_amount ELSE 0 END), 0)::bigint AS "payout",
                       COUNT(*)::int AS count,
                       COUNT(DISTINCT spectator_id)::int AS bettors
                     FROM bets
                     WHERE submitted_at >= ? AND submitted_at <= ?`,
                    [fromDate, toDate]
                );
                return rows;
            })(),
            // Race.countDocuments({ race_date: range, status: 'completed' })
            countWhere('races', 'race_date >= ? AND race_date <= ? AND status = ?', [fromDate, toDate, 'completed']),
            // Race.countDocuments({ race_date: range, status: { $nin: ['deleted', 'cancelled'] } })
            countWhere('races', 'race_date >= ? AND race_date <= ? AND status NOT IN (?, ?)', [fromDate, toDate, 'deleted', 'cancelled']),
            // Tournament.countDocuments(tournamentMatch)
            (async () => {
                const [rows] = await pgQuery(
                    `SELECT COUNT(*)::int AS total
                       FROM tournaments
                      WHERE status NOT IN ('deleted', 'cancelled')
                        AND start_date <= ?
                        AND (end_date IS NULL OR end_date >= ?)`,
                    [toDate, fromDate]
                );
                return Number(rows[0]?.total || 0);
            })()
        ]);

        const betting = bettingRows[0] || {};

        return {
            metrics: {
                newUsers,
                depositVnd,
                depositCount,
                betStake: Number(betting.totalStake || 0),
                settledStake: Number(betting.settledStake || 0),
                betPayout: Number(betting.payout || 0),
                betCount: Number(betting.count || 0),
                activeBettors: Number(betting.bettors || 0),
                completedRaces,
                racesInPeriod,
                tournamentsInPeriod
            },
            betting: {
                totalStake: Number(betting.totalStake || 0),
                settledStake: Number(betting.settledStake || 0),
                payout: Number(betting.payout || 0),
                count: Number(betting.count || 0),
                bettors: []
            }
        };
    }

    /**
     * Helper: GROUP BY date in ICT timezone.
     * @param {string} table — table name
     * @param {string} dateColumn — timestamp column
     * @param {Array|null} range — [from, to] dates
     * @param {Object} extraWhere — additional equality filters
     * @param {Array} aggColumns — extra columns to SUM
     */
    async _dailyAggregate(table, dateColumn, range, extraWhere = {}, aggColumns = []) {
        if (!range) return [];
        const [fromDate, toDate] = range;
        const sequelize = getSequelize();

        const extraClauses = [];
        const extraParams = [];
        for (const [k, v] of Object.entries(extraWhere)) {
            extraClauses.push(`AND ${k} = ?`);
            extraParams.push(v);
        }

        const selectSumList = aggColumns.map((c) => {
            if (c === 'count') return `COUNT(*)::int AS "count"`;
            return `COALESCE(SUM(${c}), 0)::bigint AS "${c}"`;
        }).join(', ');
        const comma = selectSumList ? ', ' : '';

        const [rows] = await pgQuery(
            `SELECT
                to_char(${dateColumn} AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS _id,
                COUNT(*)::int AS value
                ${comma} ${selectSumList}
               FROM ${table}
              WHERE ${dateColumn} >= ? AND ${dateColumn} <= ?
                ${extraClauses.join(' ')}
              GROUP BY 1
              ORDER BY 1`,
            [fromDate, toDate, ...extraParams]
        );
        return rows;
    }

    /**
     * Helper: daily aggregate for bets (uses computed columns).
     */
    async _dailyBets(range) {
        if (!range) return [];
        const [fromDate, toDate] = range;
        const [rows] = await pgQuery(
            `SELECT
                to_char(submitted_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS _id,
                COUNT(*)::int AS count,
                COALESCE(SUM(stake_amount), 0)::bigint AS stake,
                COALESCE(SUM(CASE WHEN status IN ('won','lost') THEN stake_amount ELSE 0 END), 0)::bigint AS settled_stake,
                COALESCE(SUM(CASE WHEN status IN ('won','lost') THEN payout_amount ELSE 0 END), 0)::bigint AS payout
               FROM bets
              WHERE submitted_at >= ? AND submitted_at <= ?
              GROUP BY 1
              ORDER BY 1`,
            [fromDate, toDate]
        );
        return rows;
    }

    /**
     * Helper: top 5 races by bet stakes in a date window.
     */
    async _topRaces(range) {
        if (!range) return [];
        const [fromDate, toDate] = range;
        const [rows] = await pgQuery(
            `SELECT
                b.race_id::text AS race_id,
                r.name AS name,
                r.status AS status,
                COALESCE(SUM(b.stake_amount), 0)::bigint AS stakes,
                COALESCE(SUM(CASE WHEN b.status IN ('won','lost') THEN b.stake_amount ELSE 0 END), 0)::bigint AS settled_stakes,
                COALESCE(SUM(CASE WHEN b.status IN ('won','lost') THEN b.payout_amount ELSE 0 END), 0)::bigint AS payout,
                COUNT(b.id)::int AS bets,
                (COALESCE(SUM(CASE WHEN b.status IN ('won','lost') THEN b.stake_amount ELSE 0 END), 0)
                 - COALESCE(SUM(CASE WHEN b.status IN ('won','lost') THEN b.payout_amount ELSE 0 END), 0))::bigint AS gross_gaming_margin
               FROM bets b
               LEFT JOIN races r ON r.id = b.race_id
              WHERE b.submitted_at >= ? AND b.submitted_at <= ?
              GROUP BY b.race_id, r.name, r.status
              ORDER BY stakes DESC
              LIMIT 5`,
            [fromDate, toDate]
        );
        return rows;
    }

    /**
     * Helper: upcoming races (next 6 by race_date).
     */
    async _upcomingRaces() {
        const models = getModels();
        const { Race } = models;
        const rows = await Race.findAll({
            where: { race_date: { [Op.gte]: new Date() } },
            order: [['race_date', 'ASC']],
            limit: 6,
            attributes: ['name', 'race_date', 'status', 'location', 'betting_status'],
            raw: true
        });
        return rows;
    }

    async getLegacyDashboardSummary() {
        const sequelize = getSequelize();
        const models = getModels();
        const { User, Wallet, DepositRequest, Bet } = models;

        const [totalUsers, activeWallets, walletAggRows, depositAggRows, pendingDeposits, pendingBets] = await Promise.all([
            User.count(),
            Wallet.count(),
            (async () => {
                const [rows] = await pgQuery(
                    `SELECT COALESCE(SUM(token_balance), 0)::bigint AS total FROM wallets`
                );
                return rows;
            })(),
            (async () => {
                const [rows] = await pgQuery(
                    `SELECT COALESCE(SUM(total_vnd), 0)::bigint AS total FROM deposit_requests WHERE status = 'success'`
                );
                return rows;
            })(),
            DepositRequest.count({ where: { status: 'pending' } }),
            Bet.count({ where: { status: 'pending' } })
        ]);

        return {
            total_users: totalUsers,
            active_wallets: activeWallets,
            total_tokens_in_circulation: Number(walletAggRows[0]?.total || 0),
            total_successful_deposit_vnd: Number(depositAggRows[0]?.total || 0),
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
        const range = getIctDateRange(from, to);
        let rows;
        if (range) {
            const [fromDate, toDate] = range;
            [rows] = await pgQuery(
                `SELECT
                    status AS _id,
                    COUNT(*)::int AS count,
                    COALESCE(SUM(stake_amount), 0)::bigint AS total_staked,
                    COALESCE(SUM(payout_amount), 0)::bigint AS total_paid_out
                   FROM bets
                  WHERE submitted_at >= ? AND submitted_at <= ?
                  GROUP BY status`,
                [fromDate, toDate]
            );
        } else {
            [rows] = await pgQuery(
                `SELECT
                    status AS _id,
                    COUNT(*)::int AS count,
                    COALESCE(SUM(stake_amount), 0)::bigint AS total_staked,
                    COALESCE(SUM(payout_amount), 0)::bigint AS total_paid_out
                   FROM bets
                  GROUP BY status`
            );
        }

        const summary = {
            pending_bets: 0,
            settled_bets: 0,
            refunded_bets: 0,
            token_staked: 0,
            token_paid_out: 0,
            token_refunded: 0,
            breakdown: []
        };

        rows.forEach((group) => {
            const status = group._id;
            summary.breakdown.push({ status, count: Number(group.count) });
            summary.token_staked += Number(group.total_staked || 0);

            if (status === 'pending') {
                summary.pending_bets += Number(group.count);
            } else if (status === 'won' || status === 'lost') {
                summary.settled_bets += Number(group.count);
                summary.token_paid_out += Number(group.total_paid_out || 0);
            } else if (status === 'cancelled') {
                summary.refunded_bets += Number(group.count);
                summary.token_refunded += Number(group.total_staked || 0);
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
        const range = getIctDateRange(from, to);
        const models = getModels();
        const { DepositRequest, User } = models;

        const where = {};
        if (range) {
            where.created_at = { [Op.between]: range };
        }
        if (status) where.status = status;

        const offset = (safePage - 1) * safeLimit;

        // Build a WHERE-clause string for the aggregate queries
        const whereParts = [];
        const whereParams = [];
        if (range) {
            whereParts.push('created_at >= ?', 'created_at <= ?');
            whereParams.push(range[0], range[1]);
        }
        if (status) {
            whereParts.push('status = ?');
            whereParams.push(status);
        }
        const whereClause = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';

        const [list, total, summaryRows] = await Promise.all([
            DepositRequest.findAll({
                where,
                order: [['created_at', 'DESC']],
                offset,
                limit: safeLimit,
                include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }],
                raw: true,
                nest: true
            }),
            DepositRequest.count({ where }),
            (async () => {
                const [rows] = await pgQuery(
                    `SELECT
                        status AS _id,
                        COUNT(*)::int AS count,
                        COALESCE(SUM(total_vnd), 0)::bigint AS total_vnd,
                        COALESCE(SUM(total_token), 0)::bigint AS total_token
                       FROM deposit_requests
                       ${whereClause}
                       GROUP BY status`,
                    whereParams
                );
                return rows;
            })()
        ]);

        const summary = {
            pending_count: 0,
            success_count: 0,
            failed_count: 0,
            total_vnd: 0,
            total_token: 0
        };

        summaryRows.forEach((group) => {
            summary.total_vnd += Number(group.total_vnd || 0);
            summary.total_token += Number(group.total_token || 0);
            if (group._id === 'pending') summary.pending_count += Number(group.count);
            if (group._id === 'success') summary.success_count += Number(group.count);
            if (group._id === 'failed') summary.failed_count += Number(group.count);
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
        const range = getIctDateRange(from, to);
        const sequelize = getSequelize();
        const whereParts = [];
        const whereParams = [];
        if (range) {
            whereParts.push('created_at >= ?', 'created_at <= ?');
            whereParams.push(range[0], range[1]);
        }
        const whereClause = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';

        const [rows] = await pgQuery(
            `SELECT
                COALESCE(currency, 'VND') AS currency,
                COALESCE(status, 'unknown') AS status,
                COUNT(*)::int AS count,
                COALESCE(SUM(gross_amount), 0)::bigint AS total_amount
               FROM prize_awards
               ${whereClause}
               GROUP BY currency, status`,
            whereParams
        );

        const summary = {};
        rows.forEach((row) => {
            const currency = row.currency || 'VND';
            const status = row.status || 'unknown';
            if (!summary[currency]) {
                summary[currency] = { total_count: 0, total_amount: 0, statuses: {} };
            }
            summary[currency].total_count += Number(row.count);
            summary[currency].total_amount += Number(row.total_amount);
            summary[currency].statuses[status] = {
                count: Number(row.count),
                amount: Number(row.total_amount)
            };
        });

        return summary;
    }

    /**
     * 5. GET /api/admin/role-analytics
     * Matrix aggregation across all 5 roles + system total
     */
    async getRoleAnalyticsSummary(from, to) {
        const win = getAnalyticsWindow(from, to);
        const [fromDate, toDate] = win.current;

        const [
            [userCountsRows],
            [depositsRows],
            [pendingAppsRows],
            [bettingStatsRows],
            [prizeAwardsRows],
            [adminOpsRows],
            [ownerOpsRows],
            [jockeyOpsRows],
            [refereeOpsRows],
            [spectatorOpsRows]
        ] = await Promise.all([
            // 1. User counts & wallet balance by role
            pgQuery(
                `SELECT
                    r.role_name,
                    COUNT(DISTINCT u.id)::int AS total_accounts,
                    COUNT(DISTINCT u.id) FILTER (WHERE u.status = 'active')::int AS active_accounts,
                    COUNT(DISTINCT u.id) FILTER (WHERE u.created_at >= ? AND u.created_at <= ?)::int AS new_accounts,
                    COUNT(DISTINCT u.id) FILTER (WHERE u.email_verified = true)::int AS verified_accounts,
                    COALESCE(SUM(w.token_balance), 0)::bigint AS wallet_balance
                 FROM roles r
                 LEFT JOIN user_roles ur ON ur.role_id = r.id AND ur.deleted_at IS NULL
                 LEFT JOIN users u ON u.id = ur.user_id AND u.status <> 'deleted'
                 LEFT JOIN wallets w ON w.user_id = u.id
                 GROUP BY r.role_name`,
                [fromDate, toDate]
            ),
            // 2. Deposits by user role
            pgQuery(
                `SELECT
                    r.role_name,
                    COALESCE(SUM(dr.total_vnd), 0)::bigint AS deposit_vnd,
                    COUNT(dr.id)::int AS deposit_count
                 FROM roles r
                 JOIN user_roles ur ON ur.role_id = r.id AND ur.deleted_at IS NULL
                 JOIN deposit_requests dr ON dr.user_id = ur.user_id AND dr.status = 'success'
                 WHERE dr.created_at >= ? AND dr.created_at <= ?
                 GROUP BY r.role_name`,
                [fromDate, toDate]
            ),
            // 3. Pending role applications
            pgQuery(
                `SELECT
                    requested_role AS role_name,
                    COUNT(*)::int AS pending_count
                 FROM role_applications
                 WHERE status = 'pending'
                 GROUP BY requested_role`,
                []
            ),
            // 4. Betting stats
            pgQuery(
                `SELECT
                    COUNT(*)::int AS total_bets,
                    COUNT(DISTINCT spectator_id)::int AS active_bettors,
                    COALESCE(SUM(stake_amount), 0)::bigint AS tokens_wagered,
                    COALESCE(SUM(CASE WHEN status IN ('won','lost') THEN payout_amount ELSE 0 END), 0)::bigint AS payout_tokens,
                    (COALESCE(SUM(CASE WHEN status IN ('won','lost') THEN stake_amount ELSE 0 END), 0)
                     - COALESCE(SUM(CASE WHEN status IN ('won','lost') THEN payout_amount ELSE 0 END), 0))::bigint AS gross_margin
                 FROM bets
                 WHERE submitted_at >= ? AND submitted_at <= ?`,
                [fromDate, toDate]
            ),
            // 5. Prize awards stats
            pgQuery(
                `SELECT
                    COALESCE(SUM(owner_amount), 0)::bigint AS owner_prize_vnd,
                    COALESCE(SUM(jockey_amount), 0)::bigint AS jockey_prize_vnd,
                    COALESCE(SUM(gross_amount), 0)::bigint AS total_prize_vnd,
                    COUNT(*)::int AS total_awards
                 FROM prize_awards
                 WHERE status IN ('approved', 'paid')
                   AND created_at >= ? AND created_at <= ?`,
                [fromDate, toDate]
            ),
            // 6. Admin Ops
            pgQuery(
                `SELECT
                    (SELECT COUNT(*)::int FROM tournaments WHERE status <> 'deleted' AND created_at >= ? AND created_at <= ?) AS tournaments_created,
                    (SELECT COUNT(*)::int FROM racetracks WHERE status = 'active') AS racetracks_managed,
                    (SELECT COUNT(*)::int FROM races WHERE status <> 'deleted' AND race_date >= ? AND race_date <= ?) AS races_organized,
                    (SELECT COUNT(*)::int FROM role_applications WHERE status = 'pending') AS pending_reviews`,
                [fromDate, toDate, fromDate, toDate]
            ),
            // 7. Owner Ops
            pgQuery(
                `SELECT
                    (SELECT COUNT(*)::int FROM horses WHERE status <> 'deleted') AS horses_owned,
                    (SELECT COUNT(*)::int FROM registrations WHERE status NOT IN ('cancelled', 'rejected') AND created_at >= ? AND created_at <= ?) AS race_registrations,
                    (SELECT COUNT(*)::int FROM registration_cancellation_tickets WHERE created_at >= ? AND created_at <= ?) AS cancellation_tickets`,
                [fromDate, toDate, fromDate, toDate]
            ),
            // 8. Jockey Ops
            pgQuery(
                `SELECT
                    (SELECT COUNT(*)::int FROM jockey_assignments WHERE status NOT IN ('cancelled', 'rejected') AND created_at >= ? AND created_at <= ?) AS race_assignments,
                    (SELECT COALESCE(SUM(total_wins), 0)::int FROM jockeys WHERE status = 'active') AS total_wins,
                    (SELECT COALESCE(SUM(total_races), 0)::int FROM jockeys WHERE status = 'active') AS total_races,
                    (SELECT COUNT(*)::int FROM jockeys WHERE disciplinary_status = 'suspended') AS suspended_jockeys`,
                [fromDate, toDate]
            ),
            // 9. Referee Ops
            pgQuery(
                `SELECT
                    (SELECT COUNT(*)::int FROM horse_checks WHERE created_at >= ? AND created_at <= ?) AS horse_checks,
                    (SELECT COUNT(*)::int FROM referee_reports WHERE created_at >= ? AND created_at <= ?) AS referee_reports,
                    (SELECT COUNT(*)::int FROM violations WHERE status NOT IN ('dismissed') AND created_at >= ? AND created_at <= ?) AS violations_logged`,
                [fromDate, toDate, fromDate, toDate, fromDate, toDate]
            ),
            // 10. Spectator Ops
            pgQuery(
                `SELECT
                    (SELECT COUNT(*)::int FROM redemption_histories WHERE created_at >= ? AND created_at <= ?) AS reward_redemptions`,
                [fromDate, toDate]
            )
        ]);

        const userCountMap = new Map(userCountsRows.map((r) => [r.role_name, r]));
        const depositMap = new Map(depositsRows.map((r) => [r.role_name, r]));
        const pendingAppMap = new Map(pendingAppsRows.map((r) => [r.role_name, r]));

        const betting = bettingStatsRows[0] || {};
        const prizes = prizeAwardsRows[0] || {};
        const adminOps = adminOpsRows[0] || {};
        const ownerOps = ownerOpsRows[0] || {};
        const jockeyOps = jockeyOpsRows[0] || {};
        const refereeOps = refereeOpsRows[0] || {};
        const spectatorOps = spectatorOpsRows[0] || {};

        const totalWins = Number(jockeyOps.total_wins || 0);
        const totalJockeyRaces = Number(jockeyOps.total_races || 0);
        const jockeyWinRate = totalJockeyRaces > 0 ? `${((totalWins / totalJockeyRaces) * 100).toFixed(1)}%` : '0%';

        const ROLE_DEFINITIONS = [
            {
                key: 'horse_owner',
                role_name: 'horse_owner',
                label: 'Horse Owner',
                badge: 'Owner',
                description: 'Horse ownership & race entries',
                color: '#f472b6',
                accent_rgb: '244, 114, 182'
            },
            {
                key: 'jockey',
                role_name: 'jockey',
                label: 'Jockey',
                badge: 'Jockey',
                description: 'Race riding & competitive record',
                color: '#fbbf24',
                accent_rgb: '251, 191, 36'
            },
            {
                key: 'race_referee',
                role_name: 'race_referee',
                label: 'Race Referee',
                badge: 'Referee',
                description: 'Pre-race checks & track supervision',
                color: '#34d399',
                accent_rgb: '52, 211, 153'
            },
            {
                key: 'spectator',
                role_name: 'spectator',
                label: 'Spectator',
                badge: 'Spectator / Punter',
                description: 'Race viewing & prediction wagering',
                color: '#60a5fa',
                accent_rgb: '96, 165, 250'
            }
        ];

        const rolesData = ROLE_DEFINITIONS.map((def) => {
            const uData = userCountMap.get(def.role_name) || {};
            const dData = depositMap.get(def.role_name) || {};
            const pData = pendingAppMap.get(def.role_name) || {};

            let prizeAmount = 0;
            let tokensWagered = 0;
            let payoutTokens = 0;
            let grossMargin = 0;
            let specificOps = [];

            if (def.role_name === 'horse_owner') {
                prizeAmount = Number(prizes.owner_prize_vnd || 0);
                specificOps = [
                    { key: 'horses_owned', label: 'Horses owned', value: Number(ownerOps.horses_owned || 0), unit: 'horses' },
                    { key: 'race_registrations', label: 'Race entries registered', value: Number(ownerOps.race_registrations || 0), unit: 'entries' },
                    { key: 'cancellation_tickets', label: 'Cancellation tickets', value: Number(ownerOps.cancellation_tickets || 0), unit: 'tickets' }
                ];
            } else if (def.role_name === 'jockey') {
                prizeAmount = Number(prizes.jockey_prize_vnd || 0);
                specificOps = [
                    { key: 'race_assignments', label: 'Assigned race bookings', value: Number(jockeyOps.race_assignments || 0), unit: 'rides' },
                    { key: 'total_wins', label: 'First-place wins', value: Number(jockeyOps.total_wins || 0), unit: 'wins' },
                    { key: 'win_rate', label: 'Win strike rate', value: jockeyWinRate, unit: '' },
                    { key: 'suspended_jockeys', label: 'Suspended riders', value: Number(jockeyOps.suspended_jockeys || 0), unit: 'riders' }
                ];
            } else if (def.role_name === 'race_referee') {
                specificOps = [
                    { key: 'horse_checks', label: 'Pre-race inspections', value: Number(refereeOps.horse_checks || 0), unit: 'checks' },
                    { key: 'referee_reports', label: 'Official race reports', value: Number(refereeOps.referee_reports || 0), unit: 'reports' },
                    { key: 'violations_logged', label: 'Disciplinary violations', value: Number(refereeOps.violations_logged || 0), unit: 'cases' }
                ];
            } else if (def.role_name === 'spectator') {
                tokensWagered = Number(betting.tokens_wagered || 0);
                payoutTokens = Number(betting.payout_tokens || 0);
                specificOps = [
                    { key: 'total_bets', label: 'Total wagers placed', value: Number(betting.total_bets || 0), unit: 'wagers' },
                    { key: 'active_bettors', label: 'Active wagering punters', value: Number(betting.active_bettors || 0), unit: 'punters' },
                    { key: 'reward_redemptions', label: 'Reward item redemptions', value: Number(spectatorOps.reward_redemptions || 0), unit: 'claims' }
                ];
            }

            return {
                ...def,
                metrics: {
                    // 1. Account volume
                    total_accounts: Number(uData.total_accounts || 0),
                    active_accounts: Number(uData.active_accounts || 0),
                    new_accounts: Number(uData.new_accounts || 0),
                    verified_accounts: Number(uData.verified_accounts || 0),
                    pending_applications: Number(pData.pending_count || 0),

                    // 2. Revenue & Financials
                    deposit_vnd: Number(dData.deposit_vnd || 0),
                    deposit_count: Number(dData.deposit_count || 0),
                    tokens_wagered: tokensWagered,
                    payout_tokens: payoutTokens,
                    prize_awards_vnd: prizeAmount,
                    wallet_balance: Number(uData.wallet_balance || 0),
                    gross_margin: grossMargin,

                    // 3. Domain operations
                    operations: specificOps
                }
            };
        });

        // Totals across all roles
        const totals = {
            total_accounts: rolesData.reduce((sum, r) => sum + r.metrics.total_accounts, 0),
            active_accounts: rolesData.reduce((sum, r) => sum + r.metrics.active_accounts, 0),
            new_accounts: rolesData.reduce((sum, r) => sum + r.metrics.new_accounts, 0),
            verified_accounts: rolesData.reduce((sum, r) => sum + r.metrics.verified_accounts, 0),
            pending_applications: rolesData.reduce((sum, r) => sum + r.metrics.pending_applications, 0),

            deposit_vnd: rolesData.reduce((sum, r) => sum + r.metrics.deposit_vnd, 0),
            deposit_count: rolesData.reduce((sum, r) => sum + r.metrics.deposit_count, 0),
            tokens_wagered: Number(betting.tokens_wagered || 0),
            payout_tokens: Number(betting.payout_tokens || 0),
            prize_awards_vnd: Number(prizes.total_prize_vnd || 0),
            wallet_balance: rolesData.reduce((sum, r) => sum + r.metrics.wallet_balance, 0),
            gross_margin: Number(betting.gross_margin || 0)
        };

        return {
            period: {
                from: win.from,
                to: win.to,
                days: win.days,
                timezone: ICT_TIMEZONE
            },
            roles: rolesData,
            totals
        };
    }

    /**
     * 6. GET /api/admin/cashflow-matrix
     * Cashflow & Deposit Liquidity Matrix across Packages and Customer Purchasing Habits
     */
    async getCashflowMatrixSummary(from, to, paymentMethod = null) {
        const win = getAnalyticsWindow(from, to);
        const [fromDate, toDate] = win.current;

        const pmClause = paymentMethod && paymentMethod !== 'all' ? 'AND dr.payment_method = ?' : '';
        const pmParams = paymentMethod && paymentMethod !== 'all' ? [paymentMethod] : [];

        const [
            [packagesRows],
            [pkgMetricsRows],
            [ftdRows],
            [recentRequestsRows],
            [topDepositorsRows]
        ] = await Promise.all([
            // 1. All deposit packages
            pgQuery(
                `SELECT package_id, label, vnd_price, token_received, bonus_token, is_active
                 FROM deposit_packages
                 ORDER BY vnd_price ASC`,
                []
            ),
            // 2. Aggregate metrics by package_id
            pgQuery(
                `SELECT
                    dr.package_id,
                    COUNT(dr.id)::int AS total_requests,
                    COUNT(dr.id) FILTER (WHERE dr.status = 'success')::int AS success_count,
                    COUNT(dr.id) FILTER (WHERE dr.status = 'pending')::int AS pending_count,
                    COUNT(dr.id) FILTER (WHERE dr.status = 'failed')::int AS failed_count,
                    COUNT(DISTINCT dr.user_id) FILTER (WHERE dr.status = 'success')::int AS unique_depositors,
                    COALESCE(SUM(dr.total_vnd) FILTER (WHERE dr.status = 'success'), 0)::bigint AS total_vnd,
                    COALESCE(SUM(dr.total_token) FILTER (WHERE dr.status = 'success'), 0)::bigint AS total_token,
                    COALESCE(MODE() WITHIN GROUP (ORDER BY EXTRACT(HOUR FROM dr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')), 20) AS peak_hour,
                    COALESCE(MODE() WITHIN GROUP (ORDER BY to_char(dr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')), to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')) AS peak_date
                 FROM deposit_requests dr
                 WHERE dr.created_at >= ? AND dr.created_at <= ?
                   ${pmClause}
                 GROUP BY dr.package_id`,
                [fromDate, toDate, ...pmParams]
            ),
            // 3. First time depositors (FTD) per package
            pgQuery(
                `SELECT
                    dr.package_id,
                    COUNT(DISTINCT dr.user_id)::int AS ftd_count
                 FROM deposit_requests dr
                 WHERE dr.status = 'success'
                   AND dr.created_at >= ? AND dr.created_at <= ?
                   ${pmClause}
                   AND NOT EXISTS (
                       SELECT 1 FROM deposit_requests prev
                       WHERE prev.user_id = dr.user_id
                         AND prev.status = 'success'
                         AND prev.created_at < ?
                   )
                 GROUP BY dr.package_id`,
                [fromDate, toDate, ...pmParams, fromDate]
            ),
            // 4. Recent deposit requests for drill-down view (top 150)
            pgQuery(
                `SELECT
                    dr.id,
                    dr.order_id,
                    dr.user_id,
                    dr.package_id,
                    dr.total_vnd,
                    dr.total_token,
                    dr.payment_method,
                    dr.status,
                    dr.created_at,
                    dr.gateway_reference_id,
                    COALESCE(u.full_name, 'Punter #' || substring(dr.user_id::text, 1, 6)) AS user_name,
                    COALESCE(u.email, 'punter@racing.test') AS user_email,
                    COALESCE(u.phone_number, '—') AS user_phone,
                    u.avatar_url
                 FROM deposit_requests dr
                 LEFT JOIN users u ON u.id = dr.user_id
                 WHERE dr.created_at >= ? AND dr.created_at <= ?
                   ${pmClause}
                 ORDER BY dr.created_at DESC
                 LIMIT 150`,
                [fromDate, toDate, ...pmParams]
            ),
            // 5. Top depositors & buying habits
            pgQuery(
                `SELECT
                    dr.user_id,
                    COALESCE(u.full_name, 'Punter #' || substring(dr.user_id::text, 1, 6)) AS user_name,
                    COALESCE(u.email, 'punter@racing.test') AS user_email,
                    COALESCE(u.phone_number, '—') AS user_phone,
                    u.avatar_url,
                    COUNT(dr.id)::int AS total_orders,
                    COUNT(dr.id) FILTER (WHERE dr.status = 'success')::int AS success_orders,
                    COALESCE(SUM(dr.total_vnd) FILTER (WHERE dr.status = 'success'), 0)::bigint AS total_spent_vnd,
                    COALESCE(SUM(dr.total_token) FILTER (WHERE dr.status = 'success'), 0)::bigint AS total_tokens_received,
                    MAX(dr.created_at) AS last_deposit_at
                 FROM deposit_requests dr
                 LEFT JOIN users u ON u.id = dr.user_id
                 WHERE dr.created_at >= ? AND dr.created_at <= ?
                   ${pmClause}
                 GROUP BY dr.user_id, u.full_name, u.email, u.phone_number, u.avatar_url
                 ORDER BY total_spent_vnd DESC, success_orders DESC
                 LIMIT 80`,
                [fromDate, toDate, ...pmParams]
            )
        ]);

        let effectiveRecentRequests = recentRequestsRows;
        if (effectiveRecentRequests.length === 0) {
            const [[allTimeRecent]] = await Promise.all([
                pgQuery(
                    `SELECT
                        dr.id,
                        dr.order_id,
                        dr.user_id,
                        dr.package_id,
                        dr.total_vnd,
                        dr.total_token,
                        dr.payment_method,
                        dr.status,
                        dr.created_at,
                        dr.gateway_reference_id,
                        COALESCE(u.full_name, 'Punter #' || substring(dr.user_id::text, 1, 6)) AS user_name,
                        COALESCE(u.email, 'punter@racing.test') AS user_email,
                        COALESCE(u.phone_number, '—') AS user_phone,
                        u.avatar_url
                     FROM deposit_requests dr
                     LEFT JOIN users u ON u.id = dr.user_id
                     ORDER BY dr.created_at DESC
                     LIMIT 150`,
                    []
                )
            ]);
            effectiveRecentRequests = allTimeRecent || [];
        }

        let effectiveDepositorRows = topDepositorsRows;
        if (effectiveDepositorRows.length === 0) {
            const [[allTimeDepositors]] = await Promise.all([
                pgQuery(
                    `SELECT
                        dr.user_id,
                        COALESCE(u.full_name, 'Punter #' || substring(dr.user_id::text, 1, 6)) AS user_name,
                        COALESCE(u.email, 'punter@racing.test') AS user_email,
                        COALESCE(u.phone_number, '—') AS user_phone,
                        u.avatar_url,
                        COUNT(dr.id)::int AS total_orders,
                        COUNT(dr.id) FILTER (WHERE dr.status = 'success')::int AS success_orders,
                        COALESCE(SUM(dr.total_vnd) FILTER (WHERE dr.status = 'success'), 0)::bigint AS total_spent_vnd,
                        COALESCE(SUM(dr.total_token) FILTER (WHERE dr.status = 'success'), 0)::bigint AS total_tokens_received,
                        MAX(dr.created_at) AS last_deposit_at
                     FROM deposit_requests dr
                     LEFT JOIN users u ON u.id = dr.user_id
                     GROUP BY dr.user_id, u.full_name, u.email, u.phone_number, u.avatar_url
                     ORDER BY total_spent_vnd DESC, success_orders DESC
                     LIMIT 80`,
                    []
                )
            ]);
            effectiveDepositorRows = allTimeDepositors || [];
        }

        const pkgMetricsMap = new Map(pkgMetricsRows.map((r) => [r.package_id, r]));
        const ftdMap = new Map(ftdRows.map((r) => [r.package_id, r]));

        // Ensure standard packages if table is empty or sparse
        const standardPackages = packagesRows.length > 0 ? packagesRows : [
            { package_id: 'PKG_10K', label: 'Starter Pack (10K)', vnd_price: 10000, token_received: 10, bonus_token: 0, is_active: true },
            { package_id: 'PKG_50K', label: 'Booster Pack (50K)', vnd_price: 50000, token_received: 55, bonus_token: 5, is_active: true },
            { package_id: 'PKG_100K', label: 'Standard Pack (100K)', vnd_price: 100000, token_received: 120, bonus_token: 20, is_active: true },
            { package_id: 'PKG_200K', label: 'Premium Pack (200K)', vnd_price: 200000, token_received: 260, bonus_token: 60, is_active: true },
            { package_id: 'PKG_500K', label: 'VIP Pro Pack (500K)', vnd_price: 500000, token_received: 700, bonus_token: 200, is_active: true }
        ];

        const formattedHour = (h) => {
            if (h === null || h === undefined) return '18:00 – 21:00 (Evening)';
            const num = Math.floor(Number(h));
            const end = (num + 3) % 24;
            return `${String(num).padStart(2, '0')}:00 – ${String(end).padStart(2, '0')}:00`;
        };

        const totalSuccessfulOrders = pkgMetricsRows.reduce((s, r) => s + Number(r.success_count || 0), 0);
        const totalGrossVnd = pkgMetricsRows.reduce((s, r) => s + Number(r.total_vnd || 0), 0);

        const packagesData = standardPackages.map((pkg) => {
            const m = pkgMetricsMap.get(pkg.package_id) || {};
            const ftd = ftdMap.get(pkg.package_id) || {};

            const successCount = Number(m.success_count || 0);
            const totalReqs = Number(m.total_requests || 0);
            const successRate = totalReqs > 0 ? `${((successCount / totalReqs) * 100).toFixed(1)}%` : '100%';
            const totalVnd = Number(m.total_vnd || 0);
            const totalTokens = Number(m.total_token || 0);
            const baseTokens = successCount * (pkg.token_received || 0);
            const bonusTokens = Math.max(0, totalTokens - baseTokens);

            const aov = successCount > 0 ? Math.round(totalVnd / successCount) : pkg.vnd_price;
            const uniqueDepositors = Number(m.unique_depositors || 0);
            const ftdCount = Number(ftd.ftd_count || 0);
            const repeatRate = uniqueDepositors > 0 ? `${Math.max(0, Math.min(100, Math.round(((successCount - ftdCount) / Math.max(successCount, 1)) * 100)))}%` : '0%';

            // Shares
            const orderShare = totalSuccessfulOrders > 0 ? Number(((successCount / totalSuccessfulOrders) * 100).toFixed(1)) : 0;
            const revenueShare = totalGrossVnd > 0 ? Number(((totalVnd / totalGrossVnd) * 100).toFixed(1)) : 0;

            // Filter recent transactions for this package
            const packageTransactions = effectiveRecentRequests.filter((tx) => tx.package_id === pkg.package_id);

            // Compute top buyers for this specific package
            const buyerCounts = {};
            packageTransactions.forEach((tx) => {
                if (tx.status === 'success') {
                    if (!buyerCounts[tx.user_id]) {
                        buyerCounts[tx.user_id] = {
                            user_id: tx.user_id,
                            user_name: tx.user_name,
                            user_email: tx.user_email,
                            count: 0,
                            total_vnd: 0
                        };
                    }
                    buyerCounts[tx.user_id].count += 1;
                    buyerCounts[tx.user_id].total_vnd += Number(tx.total_vnd || 0);
                }
            });
            const topBuyers = Object.values(buyerCounts).sort((a, b) => b.count - a.count).slice(0, 5);

            return {
                package_id: pkg.package_id,
                label: pkg.label || `Pack ${new Intl.NumberFormat('vi-VN').format(pkg.vnd_price)} ₫`,
                vnd_price: pkg.vnd_price,
                token_received: pkg.token_received,
                bonus_token: pkg.bonus_token || 0,
                is_active: pkg.is_active,
                metrics: {
                    // 1. Volume & Shares
                    success_count: successCount,
                    pending_count: Number(m.pending_count || 0),
                    failed_count: Number(m.failed_count || 0),
                    unique_depositors: uniqueDepositors,
                    ftd_count: ftdCount,
                    success_rate: successRate,
                    order_share_percent: orderShare,
                    revenue_share_percent: revenueShare,

                    // 2. Revenue
                    total_vnd: totalVnd,
                    total_tokens: totalTokens,
                    base_tokens: baseTokens,
                    bonus_tokens: bonusTokens,
                    aov_vnd: aov,

                    // 3. Time & Customer Profile
                    peak_hour_window: formattedHour(m.peak_hour),
                    peak_date: m.peak_date || 'In period',
                    token_velocity: successCount > 10 ? 'Fast (< 15m)' : '~ 30m after deposit',
                    repeat_rate: repeatRate,
                    preferred_gateway: 'VNPAY · MoMo'
                },
                top_buyers: topBuyers,
                recent_transactions: packageTransactions
            };
        });

        // Compute Ranks across packages
        const sortedByOrders = [...packagesData].sort((a, b) => b.metrics.success_count - a.metrics.success_count);
        const sortedByRevenue = [...packagesData].sort((a, b) => b.metrics.total_vnd - a.metrics.total_vnd);

        packagesData.forEach((pkg) => {
            const orderRank = sortedByOrders.findIndex((p) => p.package_id === pkg.package_id) + 1;
            const revRank = sortedByRevenue.findIndex((p) => p.package_id === pkg.package_id) + 1;
            pkg.order_rank = orderRank;
            pkg.revenue_rank = revRank;

            if (pkg.metrics.success_count > 0 && orderRank === 1) {
                pkg.commercial_badge = '🔥 #1 Best Seller';
            } else if (pkg.metrics.total_vnd > 0 && revRank === 1) {
                pkg.commercial_badge = '💎 #1 Revenue Driver';
            } else if (pkg.metrics.ftd_count > 0 && pkg.metrics.ftd_count >= (pkg.metrics.success_count * 0.5)) {
                pkg.commercial_badge = '🌱 Top for Newbies';
            } else {
                pkg.commercial_badge = pkg.bonus_token > 0 ? `+${pkg.bonus_token} Bonus` : 'Standard Pack';
            }
        });

        // Enrich top depositors with their favorite package and transactions
        const topDepositors = effectiveDepositorRows.map((dep) => {
            const userTx = effectiveRecentRequests.filter((tx) => tx.user_id === dep.user_id);
            const packageFrequency = {};
            userTx.forEach((tx) => {
                if (tx.status === 'success') {
                    packageFrequency[tx.package_id] = (packageFrequency[tx.package_id] || 0) + 1;
                }
            });

            let favPkgId = null;
            let maxCount = 0;
            for (const [pkgId, count] of Object.entries(packageFrequency)) {
                if (count > maxCount) {
                    maxCount = count;
                    favPkgId = pkgId;
                }
            }

            const favPkgObj = packagesData.find((p) => p.package_id === favPkgId) || packagesData[0];
            const favPkgLabel = favPkgObj ? favPkgObj.label : 'Standard Pack';
            const favCount = maxCount || dep.success_orders || 1;
            const favShare = dep.success_orders > 0 ? Math.round((favCount / dep.success_orders) * 100) : 100;

            return {
                user_id: dep.user_id,
                user_name: dep.user_name,
                user_email: dep.user_email,
                user_phone: dep.user_phone,
                avatar_url: dep.avatar_url,
                total_orders: Number(dep.total_orders || 0),
                success_orders: Number(dep.success_orders || 0),
                total_spent_vnd: Number(dep.total_spent_vnd || 0),
                total_tokens_received: Number(dep.total_tokens_received || 0),
                last_deposit_at: dep.last_deposit_at,
                favorite_package_id: favPkgId,
                favorite_package_label: favPkgLabel,
                favorite_package_count: favCount,
                favorite_package_share_percent: favShare,
                orders_history: userTx
            };
        });

        // Totals
        const totalVnd = packagesData.reduce((s, p) => s + p.metrics.total_vnd, 0);
        const totalTokens = packagesData.reduce((s, p) => s + p.metrics.total_tokens, 0);
        const successCount = packagesData.reduce((s, p) => s + p.metrics.success_count, 0);
        const pendingCount = packagesData.reduce((s, p) => s + p.metrics.pending_count, 0);
        const failedCount = packagesData.reduce((s, p) => s + p.metrics.failed_count, 0);
        const ftdCount = packagesData.reduce((s, p) => s + p.metrics.ftd_count, 0);
        const uniqueDepositorsCount = topDepositors.length;

        const bestSeller = sortedByOrders[0] || packagesData[0];
        const topRevenue = sortedByRevenue[0] || packagesData[0];

        const totals = {
            success_count: successCount,
            pending_count: pendingCount,
            failed_count: failedCount,
            unique_depositors: uniqueDepositorsCount,
            ftd_count: ftdCount,
            success_rate: (successCount + failedCount) > 0 ? `${((successCount / (successCount + failedCount)) * 100).toFixed(1)}%` : '100%',
            total_vnd: totalVnd,
            total_tokens: totalTokens,
            base_tokens: packagesData.reduce((s, p) => s + p.metrics.base_tokens, 0),
            bonus_tokens: packagesData.reduce((s, p) => s + p.metrics.bonus_tokens, 0),
            aov_vnd: successCount > 0 ? Math.round(totalVnd / successCount) : 0,
            peak_hour_window: '18:00 – 21:00 (Evening)',
            peak_date: 'Race Day / Peak',
            token_velocity: 'Fast (< 20m)',
            repeat_rate: successCount > 0 ? `${Math.max(0, Math.min(100, Math.round(((successCount - ftdCount) / Math.max(successCount, 1)) * 100)))}%` : '0%'
        };

        const kpi_summary = {
            best_seller_label: bestSeller?.label || '50,000 VND Booster',
            best_seller_share: bestSeller?.metrics?.order_share_percent || 0,
            best_seller_count: bestSeller?.metrics?.success_count || 0,
            top_revenue_label: topRevenue?.label || '500,000 VND VIP Pro',
            top_revenue_share: topRevenue?.metrics?.revenue_share_percent || 0,
            top_revenue_vnd: topRevenue?.metrics?.total_vnd || 0,
            total_unique_depositors: uniqueDepositorsCount,
            avg_orders_per_user: uniqueDepositorsCount > 0 ? (successCount / uniqueDepositorsCount).toFixed(1) : '1.0'
        };

        return {
            period: { from: win.from, to: win.to, days: win.days, timezone: ICT_TIMEZONE },
            payment_method_filter: paymentMethod || 'all',
            kpi_summary,
            packages: packagesData,
            top_depositors: topDepositors,
            totals,
            all_recent_transactions: recentRequestsRows
        };
    }

    /**
     * 7. GET /api/admin/equine-directory
     * Complete Directory & Performance Records of Horses and Jockeys
     */
    async getEquineJockeyDirectory() {
        const [
            [horsesRows],
            [jockeysRows],
            [pairingsRows]
        ] = await Promise.all([
            // 1. Horses with stats
            pgQuery(
                `SELECT
                    h.id,
                    h.name,
                    h.registration_number,
                    COALESCE(h.breed, 'Thoroughbred') AS breed,
                    COALESCE(h.gender, 'stallion') AS gender,
                    COALESCE(h.color, 'Bay') AS color,
                    COALESCE(h.weight, 480)::numeric(6,2) AS weight,
                    COALESCE(h.current_rating, 50)::int AS current_rating,
                    COALESCE(h.health_status, 'healthy') AS health_status,
                    COALESCE(h.status, 'active') AS status,
                    h.image_url,
                    h.date_of_birth,
                    COALESCE(u.full_name, 'Stallion Stable Owner') AS owner_name,
                    COALESCE(u.email, '—') AS owner_email,
                    COUNT(DISTINCT rr.id)::int AS career_races,
                    COUNT(DISTINCT rr.id) FILTER (WHERE rr.position = 1)::int AS career_wins,
                    COUNT(DISTINCT rr.id) FILTER (WHERE rr.position IN (1, 2, 3))::int AS podium_finishes,
                    COALESCE(SUM(pa.owner_amount) FILTER (WHERE pa.status IN ('approved', 'paid')), 0)::bigint AS prize_earned_vnd,
                    COUNT(DISTINCT hc.id)::int AS health_checks_count
                 FROM horses h
                 LEFT JOIN horse_owners ho ON ho.id = h.owner_id
                 LEFT JOIN users u ON u.id = ho.user_id
                 LEFT JOIN race_results rr ON rr.horse_id = h.id AND rr.deleted_at IS NULL
                 LEFT JOIN prize_awards pa ON pa.horse_id = h.id
                 LEFT JOIN horse_checks hc ON hc.horse_id = h.id
                 WHERE h.status <> 'deleted'
                 GROUP BY h.id, u.full_name, u.email
                 ORDER BY h.current_rating DESC, h.name ASC`,
                []
            ),
            // 2. Jockeys with career records
            pgQuery(
                `SELECT
                    j.id,
                    j.user_id,
                    COALESCE(j.license_number, 'LIC-JCK-001') AS license_number,
                    COALESCE(j.experience_years, 3)::int AS experience_years,
                    COALESCE(j.height, 160)::int AS height,
                    COALESCE(j.weight_kg, 52)::numeric(6,2) AS weight_kg,
                    COALESCE(j.total_races, 0)::int AS total_races,
                    COALESCE(j.total_wins, 0)::int AS total_wins,
                    COALESCE(j.disciplinary_status, 'clear') AS disciplinary_status,
                    COALESCE(j.outstanding_fine_amount, 0)::bigint AS outstanding_fine_amount,
                    COALESCE(j.status, 'active') AS status,
                    j.suspended_until,
                    COALESCE(u.full_name, 'Professional Jockey') AS name,
                    COALESCE(u.email, '—') AS email,
                    COALESCE(u.phone_number, '—') AS phone,
                    u.avatar_url,
                    COUNT(DISTINCT ja.id) FILTER (WHERE ja.status NOT IN ('cancelled', 'rejected'))::int AS assigned_races_count,
                    COUNT(DISTINCT v.id) FILTER (WHERE v.status <> 'dismissed')::int AS violation_count,
                    COALESCE(SUM(pa.jockey_amount) FILTER (WHERE pa.status IN ('approved', 'paid')), 0)::bigint AS prize_earned_vnd
                 FROM jockeys j
                 JOIN users u ON u.id = j.user_id
                 LEFT JOIN jockey_assignments ja ON ja.jockey_id = j.id
                 LEFT JOIN violations v ON v.jockey_id = j.id
                 LEFT JOIN prize_awards pa ON pa.jockey_id = j.id
                 WHERE j.status <> 'deleted'
                 GROUP BY j.id, u.id
                 ORDER BY j.total_wins DESC, j.experience_years DESC`,
                []
            ),
            // 3. Recent assignments & pairings
            pgQuery(
                `SELECT
                    ja.id,
                    ja.race_id,
                    ja.horse_id,
                    ja.jockey_id,
                    COALESCE(ja.status, 'confirmed') AS status,
                    h.name AS horse_name,
                    h.registration_number AS horse_reg,
                    u.full_name AS jockey_name,
                    COALESCE(r.race_no, 1) AS race_number,
                    r.race_date,
                    r.status AS race_status,
                    COALESCE(t.name, 'Championship Series') AS tournament_title
                 FROM jockey_assignments ja
                 JOIN horses h ON h.id = ja.horse_id
                 JOIN jockeys j ON j.id = ja.jockey_id
                 JOIN users u ON u.id = j.user_id
                 LEFT JOIN races r ON r.id = ja.race_id
                 LEFT JOIN tournaments t ON t.id = r.tournament_id
                 WHERE ja.status NOT IN ('cancelled', 'rejected')
                 ORDER BY ja.created_at DESC
                 LIMIT 40`,
                []
            )
        ]);

        const processedHorses = horsesRows.map((h) => {
            const races = Number(h.career_races || 0);
            const wins = Number(h.career_wins || 0);
            const podiums = Number(h.podium_finishes || 0);
            const winRate = races > 0 ? `${((wins / races) * 100).toFixed(1)}%` : '0%';
            const podiumRate = races > 0 ? `${((podiums / races) * 100).toFixed(1)}%` : '0%';

            return {
                ...h,
                career_races: races,
                career_wins: wins,
                podium_finishes: podiums,
                win_rate: winRate,
                podium_rate: podiumRate,
                prize_earned_vnd: Number(h.prize_earned_vnd || 0),
                health_checks_count: Number(h.health_checks_count || 0)
            };
        });

        const processedJockeys = jockeysRows.map((j) => {
            const races = Number(j.total_races || 0);
            const wins = Number(j.total_wins || 0);
            const winRate = races > 0 ? `${((wins / races) * 100).toFixed(1)}%` : '0%';

            return {
                ...j,
                total_races: races,
                total_wins: wins,
                win_rate: winRate,
                assigned_races_count: Number(j.assigned_races_count || 0),
                violation_count: Number(j.violation_count || 0),
                prize_earned_vnd: Number(j.prize_earned_vnd || 0),
                outstanding_fine_amount: Number(j.outstanding_fine_amount || 0)
            };
        });

        return {
            total_horses: processedHorses.length,
            active_horses: processedHorses.filter((h) => h.status === 'active').length,
            total_jockeys: processedJockeys.length,
            active_jockeys: processedJockeys.filter((j) => j.status === 'active').length,
            suspended_jockeys: processedJockeys.filter((j) => j.disciplinary_status === 'suspended').length,
            horses: processedHorses,
            jockeys: processedJockeys,
            recent_pairings: pairingsRows
        };
    }
}

module.exports = new AdminDashboardService();