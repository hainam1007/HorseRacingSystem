'use strict';

/**
 * Sequelize model — `jockey_assignment_withdrawals` table.
 */

module.exports = (sequelize, DataTypes) => {
    const JockeyAssignmentWithdrawal = sequelize.define(
        'jockey_assignment_withdrawals',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            assignment_id: { type: DataTypes.UUID, allowNull: false, unique: true },
            initiated_by_party: {
                type: DataTypes.STRING(32),
                validate: { isIn: [['horse_owner', 'jockey']] }
            },
            initiated_by: { type: DataTypes.UUID },
            reason: { type: DataTypes.TEXT },
            withdrawn_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
        },
        { tableName: 'jockey_assignment_withdrawals' }
    );

    JockeyAssignmentWithdrawal.associate = (models) => {
        JockeyAssignmentWithdrawal.belongsTo(models.JockeyAssignment, { foreignKey: 'assignment_id', as: 'assignment' });
        JockeyAssignmentWithdrawal.belongsTo(models.User, { foreignKey: 'initiated_by', as: 'initiator' });
    };

    return JockeyAssignmentWithdrawal;
};