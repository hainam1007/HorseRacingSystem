'use strict';

/**
 * Sequelize model — `jockey_assignments` table.
 * Owner↔jockey invitation lifecycle. All embedded sub-docs (meeting, terms, etc.)
 * normalized to child tables.
 */

module.exports = (sequelize, DataTypes) => {
    const JockeyAssignment = sequelize.define(
        'jockey_assignments',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            race_id: { type: DataTypes.UUID, allowNull: false },
            horse_id: { type: DataTypes.UUID, allowNull: false },
            owner_id: { type: DataTypes.UUID, allowNull: false },
            jockey_id: { type: DataTypes.UUID, allowNull: false },
            assignment_type: {
                type: DataTypes.STRING(16),
                defaultValue: 'primary',
                validate: { isIn: [['primary', 'backup']] }
            },
            backup_priority: { type: DataTypes.INTEGER, validate: { min: 1 } },
            backup_for_assignment_id: { type: DataTypes.UUID },
            status: { type: DataTypes.STRING(64), defaultValue: 'meeting_invited' },
            invitation_message: { type: DataTypes.TEXT },
            response_message: { type: DataTypes.TEXT },
            invited_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
            responded_at: { type: DataTypes.DATE }
        },
        { tableName: 'jockey_assignments' }
    );

    JockeyAssignment.associate = (models) => {
        JockeyAssignment.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
        JockeyAssignment.belongsTo(models.Horse, { foreignKey: 'horse_id', as: 'horse' });
        JockeyAssignment.belongsTo(models.HorseOwner, { foreignKey: 'owner_id', as: 'owner' });
        JockeyAssignment.belongsTo(models.Jockey, { foreignKey: 'jockey_id', as: 'jockey' });
        JockeyAssignment.belongsTo(models.JockeyAssignment, { foreignKey: 'backup_for_assignment_id', as: 'backup_for' });
        JockeyAssignment.hasOne(models.JockeyAssignmentMeeting, { foreignKey: 'assignment_id', as: 'meeting' });
        JockeyAssignment.hasOne(models.JockeyAssignmentTerm, { foreignKey: 'assignment_id', as: 'terms' });
        JockeyAssignment.hasOne(models.JockeyAssignmentStandbyTerm, { foreignKey: 'assignment_id', as: 'standby_terms' });
        JockeyAssignment.hasOne(models.JockeyAssignmentContract, { foreignKey: 'assignment_id', as: 'contract' });
        JockeyAssignment.hasOne(models.JockeyAssignmentStandbyContract, { foreignKey: 'assignment_id', as: 'standby_contract' });
        JockeyAssignment.hasOne(models.JockeyAssignmentPromotion, { foreignKey: 'assignment_id', as: 'promotion' });
        JockeyAssignment.hasOne(models.JockeyAssignmentCancellationRequest, { foreignKey: 'assignment_id', as: 'cancellation_request' });
        JockeyAssignment.hasOne(models.JockeyAssignmentWithdrawal, { foreignKey: 'assignment_id', as: 'withdrawal' });
    };

    return JockeyAssignment;
};