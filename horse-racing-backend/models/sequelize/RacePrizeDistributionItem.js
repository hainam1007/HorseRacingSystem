'use strict';

/**
 * Sequelize model — `race_prize_distribution_items` table.
 * Child of Race — array of {position, percent, amount, label}.
 */

module.exports = (sequelize, DataTypes) => {
    const RacePrizeDistributionItem = sequelize.define(
        'race_prize_distribution_items',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            race_id: { type: DataTypes.UUID, allowNull: false },
            position: { type: DataTypes.INTEGER, allowNull: false },
            percent: { type: DataTypes.DECIMAL(6, 2), validate: { min: 0, max: 100 } },
            amount: { type: DataTypes.DECIMAL(15, 2), validate: { min: 0 } },
            label: { type: DataTypes.STRING(128) }
        },
        { tableName: 'race_prize_distribution_items' }
    );

    RacePrizeDistributionItem.associate = (models) => {
        RacePrizeDistributionItem.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
    };

    return RacePrizeDistributionItem;
};