'use strict';

/**
 * Sequelize model — `jockey_assignment_cancellation_requests` table.
 */

module.exports = (sequelize, DataTypes) => {
    const JockeyAssignmentCancellationRequest = sequelize.define(
        'jockey_assignment_cancellation_requests',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            assignment_id: { type: DataTypes.UUID, allowNull: false, unique: true },
            status: {
                type: DataTypes.STRING(32),
                defaultValue: 'pending',
                validate: { isIn: [['pending', 'approved', 'rejected']] }
            },
            initiated_by_party: {
                type: DataTypes.STRING(32),
                validate: { isIn: [['horse_owner', 'jockey']] }
            },
            initiated_by: { type: DataTypes.UUID },
            reason: { type: DataTypes.TEXT },
            requested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
            responded_by_party: {
                type: DataTypes.STRING(32),
                validate: { isIn: [['horse_owner', 'jockey']] }
            },
            responded_by: { type: DataTypes.UUID },
            response_message: { type: DataTypes.TEXT },
            responded_at: { type: DataTypes.DATE }
        },
        { tableName: 'jockey_assignment_cancellation_requests' }
    );

    JockeyAssignmentCancellationRequest.associate = (models) => {
        JockeyAssignmentCancellationRequest.belongsTo(models.JockeyAssignment, { foreignKey: 'assignment_id', as: 'assignment' });
        JockeyAssignmentCancellationRequest.belongsTo(models.User, { foreignKey: 'initiated_by', as: 'initiator' });
        JockeyAssignmentCancellationRequest.belongsTo(models.User, { foreignKey: 'responded_by', as: 'responder' });
    };

    return JockeyAssignmentCancellationRequest;
};