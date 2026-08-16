'use strict';

/**
 * Sequelize model — `race_run_finish_orders` table.
 */

module.exports = (sequelize, DataTypes) => {
    const RaceRunFinishOrder = sequelize.define(
        'race_run_finish_orders',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            race_run_id: { type: DataTypes.UUID, allowNull: false },
            horse_id: { type: DataTypes.UUID, allowNull: false },
            jockey_id: { type: DataTypes.UUID, allowNull: false },
            position: { type: DataTypes.INTEGER, allowNull: false },
            finish_time: { type: DataTypes.DECIMAL(8, 2), allowNull: false },
            score: { type: DataTypes.DECIMAL(8, 4) }
        },
        { tableName: 'race_run_finish_orders', timestamps: false }
    );

    RaceRunFinishOrder.associate = (models) => {
        RaceRunFinishOrder.belongsTo(models.RaceRun, { foreignKey: 'race_run_id', as: 'race_run' });
        RaceRunFinishOrder.belongsTo(models.Horse, { foreignKey: 'horse_id', as: 'horse' });
        RaceRunFinishOrder.belongsTo(models.Jockey, { foreignKey: 'jockey_id', as: 'jockey' });
    };

    return RaceRunFinishOrder;
};