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

        const [current, previous, totalUsers, activeWallets, walletAggRows, pendingDeposits, pendingBets, liveRaces, scheduledRaces, unresolvedIncidents, unpublishedResultsRows, dailyUsers, dailyDeposits, dailyBets, dailyRaces, raceStatuses, topRaces, upcomingRaces] = await Promise.all([
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
            this._upcomingRaces()
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
        const run = (sql, queryParams = params) => pgQuery(sql, queryParams).then(([rows]) => rows.map((row) => ({
            id: row.id,
            name: row.name || 'Unknown',
            races: Number(row.races || 0),
            wins: Number(row.wins || 0),
            value: Number(row.value || 0),
            deposited: Number(row.deposited || 0),
            staked: Number(row.staked || 0),
            payout: Number(row.payout || 0)
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
                    COALESCE(SUM(b.payout_amount) FILTER (WHERE b.status = 'won'), 0)::numeric AS value,
                    COALESCE(SUM(b.stake_amount), 0)::numeric AS staked,
                    COALESCE(SUM(b.payout_amount), 0)::numeric AS payout,
                    COALESCE((SELECT SUM(dr.total_token) FROM deposit_requests dr
                        WHERE dr.user_id = u.id AND dr.status = 'success'
                          AND dr.created_at BETWEEN ? AND ? AND dr.deleted_at IS NULL), 0)::numeric AS deposited
                FROM users u JOIN bets b ON b.spectator_id = u.id JOIN races r ON r.id = b.race_id
                WHERE b.deleted_at IS NULL AND ${raceFilter} GROUP BY u.id, u.full_name ORDER BY races DESC, name`, [fromDate, toDate, fromDate, toDate])
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
}

module.exports = new AdminDashboardService();