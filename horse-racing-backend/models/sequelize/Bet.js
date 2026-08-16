'use strict';

/**
 * Sequelize model — `bets` table.
 * `odds_snapshot{}` → JSONB.
 */

module.exports = (sequelize, DataTypes) => {
    const Bet = sequelize.define(
        'bets',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            spectator_id: { type: DataTypes.UUID, allowNull: false },
            race_id: { type: DataTypes.UUID, allowNull: false },
            predicted_horse_id: { type: DataTypes.UUID, allowNull: false },
            stake_amount: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
            odds_market_id: { type: DataTypes.UUID },
            potential_payout: { type: DataTypes.DECIMAL(15, 2), allowNull: false, validate: { min: 0 } },
            payout_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0, validate: { min: 0 } },
            status: {
                type: DataTypes.STRING(32),
                defaultValue: 'pending',
                validate: { isIn: [['pending', 'won', 'lost', 'cancelled']] }
            },
            settled_result_id: { type: DataTypes.UUID },
            settled_by: { type: DataTypes.UUID },
            settled_at: { type: DataTypes.DATE },
            submitted_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
            checked_at: { type: DataTypes.DATE },
            odds_snapshot: { type: DataTypes.JSONB }
        },
        { tableName: 'bets' }
    );

    Bet.associate = (models) => {
        Bet.belongsTo(models.User, { foreignKey: 'spectator_id', as: 'spectator' });
        Bet.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
        Bet.belongsTo(models.Horse, { foreignKey: 'predicted_horse_id', as: 'predicted_horse' });
        Bet.belongsTo(models.RaceOddsMarket, { foreignKey: 'odds_market_id', as: 'odds_market' });
        Bet.belongsTo(models.RaceResult, { foreignKey: 'settled_result_id', as: 'settled_result' });
        Bet.belongsTo(models.User, { foreignKey: 'settled_by', as: 'settler' });
    };

    return Bet;
};