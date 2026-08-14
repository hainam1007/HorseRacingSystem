'use strict';

/**
 * Sequelize model — `race_run_participants` table.
 */

module.exports = (sequelize, DataTypes) => {
    const RaceRunParticipant = sequelize.define(
        'race_run_participants',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            race_run_id: { type: DataTypes.UUID, allowNull: false },
            horse_id: { type: DataTypes.UUID, allowNull: false },
            jockey_id: { type: DataTypes.UUID, allowNull: false },
            assignment_id: { type: DataTypes.UUID },
            lane: { type: DataTypes.INTEGER },
            seed_position: { type: DataTypes.INTEGER }
        },
        { tableName: 'race_run_participants', timestamps: false }
    );

    RaceRunParticipant.associate = (models) => {
        RaceRunParticipant.belongsTo(models.RaceRun, { foreignKey: 'race_run_id', as: 'race_run' });
        RaceRunParticipant.belongsTo(models.Horse, { foreignKey: 'horse_id', as: 'horse' });
        RaceRunParticipant.belongsTo(models.Jockey, { foreignKey: 'jockey_id', as: 'jockey' });
        RaceRunParticipant.belongsTo(models.JockeyAssignment, { foreignKey: 'assignment_id', as: 'assignment' });
    };

    return RaceRunParticipant;
};