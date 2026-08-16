'use strict';

/**
 * Sequelize model — `race_odds_market_odds` table.
 * Child of RaceOddsMarket — array of {horse_id, jockey_id, win_probability, …}.
 */

module.exports = (sequelize, DataTypes) => {
    const RaceOddsMarketOdd = sequelize.define(
        'race_odds_market_odds',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            odds_market_id: { type: DataTypes.UUID, allowNull: false },
            horse_id: { type: DataTypes.UUID, allowNull: false },
            jockey_id: { type: DataTypes.UUID },
            horse_no: { type: DataTypes.INTEGER },
            horse_name: { type: DataTypes.STRING(255) },
            jockey_name: { type: DataTypes.STRING(255) },
            win_probability: { type: DataTypes.DECIMAL(6, 5), allowNull: false, validate: { min: 0, max: 1 } },
            fair_odds: { type: DataTypes.DECIMAL(6, 2), allowNull: false, validate: { min: 1 } },
            game_odds: { type: DataTypes.DECIMAL(6, 2), allowNull: false, validate: { min: 1 } },
            generated_game_odds: { type: DataTypes.DECIMAL(6, 2), validate: { min: 1 } },
            probability_rank: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
            fallbacks_used: { type: DataTypes.ARRAY(DataTypes.STRING) }
        },
        { tableName: 'race_odds_market_odds' }
    );

    RaceOddsMarketOdd.associate = (models) => {
        RaceOddsMarketOdd.belongsTo(models.RaceOddsMarket, { foreignKey: 'odds_market_id', as: 'odds_market' });
        RaceOddsMarketOdd.belongsTo(models.Horse, { foreignKey: 'horse_id', as: 'horse' });
        RaceOddsMarketOdd.belongsTo(models.Jockey, { foreignKey: 'jockey_id', as: 'jockey' });
    };

    return RaceOddsMarketOdd;
};