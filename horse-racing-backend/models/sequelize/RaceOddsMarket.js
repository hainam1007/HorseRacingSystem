'use strict';

/**
 * Sequelize model — `race_odds_markets` table.
 * `odds[]`, `input_snapshot{}`, `model_metrics{}`, `input_diagnostics{}`
 * → JSONB or child table (odds normalized to child table).
 */

module.exports = (sequelize, DataTypes) => {
    const RaceOddsMarket = sequelize.define(
        'race_odds_markets',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            race_id: { type: DataTypes.UUID, allowNull: false, unique: true },
            status: {
                type: DataTypes.STRING(32),
                defaultValue: 'generated',
                validate: { isIn: [['generated', 'stale', 'open', 'closed', 'settled']] }
            },
            model_name: { type: DataTypes.STRING(128), defaultValue: 'probability_engine_history_v1' },
            model_version: { type: DataTypes.STRING(64), defaultValue: 'history_v1.0.0' },
            source: { type: DataTypes.STRING(128), defaultValue: 'app_probability_engine_history_v1_runtime' },
            payout_factor: { type: DataTypes.DECIMAL(6, 5), defaultValue: 0.85, validate: { min: 0, max: 1 } },
            model_input_version: { type: DataTypes.INTEGER, defaultValue: 0, validate: { min: 0 } },
            input_snapshot: { type: DataTypes.JSONB, defaultValue: {} },
            generated_by: { type: DataTypes.UUID },
            generated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
            manually_adjusted_by: { type: DataTypes.UUID },
            manually_adjusted_at: { type: DataTypes.DATE },
            manual_adjustment_note: { type: DataTypes.STRING(500) },
            model_metrics: { type: DataTypes.JSONB, defaultValue: {} },
            input_diagnostics: { type: DataTypes.JSONB }
        },
        { tableName: 'race_odds_markets' }
    );

    RaceOddsMarket.associate = (models) => {
        RaceOddsMarket.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
        RaceOddsMarket.belongsTo(models.User, { foreignKey: 'generated_by', as: 'generator' });
        RaceOddsMarket.belongsTo(models.User, { foreignKey: 'manually_adjusted_by', as: 'adjuster' });
        RaceOddsMarket.hasMany(models.RaceOddsMarketOdd, { foreignKey: 'odds_market_id', as: 'odds' });
        RaceOddsMarket.hasMany(models.Bet, { foreignKey: 'odds_market_id', as: 'bets' });
    };

    return RaceOddsMarket;
};