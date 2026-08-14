'use strict';

/**
 * Sequelize model — `race_engine_runs` table.
 */

module.exports = (sequelize, DataTypes) => {
    const RaceEngineRun = sequelize.define(
        'race_engine_runs',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            race_id: { type: DataTypes.UUID, allowNull: false, unique: true },
            engine_run_id: { type: DataTypes.STRING(255), allowNull: false, unique: true },
            status: { type: DataTypes.STRING(64), allowNull: false },
            started_at: { type: DataTypes.DATE },
            completed_at: { type: DataTypes.DATE },
            error: { type: DataTypes.TEXT }
        },
        { tableName: 'race_engine_runs' }
    );

    RaceEngineRun.associate = (models) => {
        RaceEngineRun.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
    };

    return RaceEngineRun;
};