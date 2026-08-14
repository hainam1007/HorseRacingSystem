'use strict';

/**
 * Sequelize model — `race_runs` table.
 * Embedded `participants[]` and `finish_order[]` → child tables.
 */

module.exports = (sequelize, DataTypes) => {
    const RaceRun = sequelize.define(
        'race_runs',
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
                validate: { isIn: [['generated', 'used', 'cancelled']] }
            },
            generated_by: { type: DataTypes.UUID },
            generated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
            seed: { type: DataTypes.STRING(255) }
        },
        { tableName: 'race_runs' }
    );

    RaceRun.associate = (models) => {
        RaceRun.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
        RaceRun.belongsTo(models.User, { foreignKey: 'generated_by', as: 'generator' });
        RaceRun.hasMany(models.RaceRunParticipant, { foreignKey: 'race_run_id', as: 'participants' });
        RaceRun.hasMany(models.RaceRunFinishOrder, { foreignKey: 'race_run_id', as: 'finish_order' });
    };

    return RaceRun;
};