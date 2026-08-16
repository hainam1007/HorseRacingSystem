'use strict';

/**
 * Sequelize model — `race_result_penalty_snapshot_violations` table.
 */

module.exports = (sequelize, DataTypes) => {
    const RaceResultPenaltySnapshotViolation = sequelize.define(
        'race_result_penalty_snapshot_violations',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            race_result_id: { type: DataTypes.UUID, allowNull: false },
            violation_id: { type: DataTypes.UUID, allowNull: false }
        },
        {
            tableName: 'race_result_penalty_snapshot_violations',
            timestamps: false,
            indexes: [
                { name: 'race_result_penalty_snapshot_violations_uniq', unique: true, fields: ['race_result_id', 'violation_id'], where: { deleted_at: null } }
            ]
        }
    );

    RaceResultPenaltySnapshotViolation.associate = (models) => {
        RaceResultPenaltySnapshotViolation.belongsTo(models.RaceResult, { foreignKey: 'race_result_id', as: 'race_result' });
        RaceResultPenaltySnapshotViolation.belongsTo(models.Violation, { foreignKey: 'violation_id', as: 'violation' });
    };

    return RaceResultPenaltySnapshotViolation;
};