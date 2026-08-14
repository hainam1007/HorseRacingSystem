'use strict';

/**
 * Sequelize model — `race_result_applied_violations` table.
 */

module.exports = (sequelize, DataTypes) => {
    const RaceResultAppliedViolation = sequelize.define(
        'race_result_applied_violations',
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
            tableName: 'race_result_applied_violations',
            timestamps: false,
            indexes: [
                { name: 'race_result_applied_violations_uniq', unique: true, fields: ['race_result_id', 'violation_id'], where: { deleted_at: null } }
            ]
        }
    );

    RaceResultAppliedViolation.associate = (models) => {
        RaceResultAppliedViolation.belongsTo(models.RaceResult, { foreignKey: 'race_result_id', as: 'race_result' });
        RaceResultAppliedViolation.belongsTo(models.Violation, { foreignKey: 'violation_id', as: 'violation' });
    };

    return RaceResultAppliedViolation;
};