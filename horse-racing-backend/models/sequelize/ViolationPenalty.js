'use strict';

/**
 * Sequelize model — `violation_penalties` table.
 * Holds 3 penalty sub-docs (suggested/proposed/penalty) per violation via `kind`.
 */

module.exports = (sequelize, DataTypes) => {
    const ViolationPenalty = sequelize.define(
        'violation_penalties',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            violation_id: { type: DataTypes.UUID, allowNull: false },
            kind: {
                type: DataTypes.STRING(16),
                allowNull: false,
                validate: { isIn: [['suggested', 'proposed', 'penalty']] }
            },
            type: { type: DataTypes.STRING(32) },
            score_deduction: { type: DataTypes.DECIMAL(6, 2), defaultValue: 0 },
            position_delta: { type: DataTypes.INTEGER, defaultValue: 0 },
            time_penalty_seconds: { type: DataTypes.DECIMAL(8, 2), defaultValue: 0 },
            suspension_days: { type: DataTypes.INTEGER, defaultValue: 0 },
            fine_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
            disqualified: { type: DataTypes.BOOLEAN, defaultValue: false },
            note: { type: DataTypes.TEXT }
        },
        {
            tableName: 'violation_penalties',
            indexes: [
                { name: 'violation_penalties_uniq', unique: true, fields: ['violation_id', 'kind'], where: { deleted_at: null } }
            ]
        }
    );

    ViolationPenalty.associate = (models) => {
        ViolationPenalty.belongsTo(models.Violation, { foreignKey: 'violation_id', as: 'violation' });
    };

    return ViolationPenalty;
};