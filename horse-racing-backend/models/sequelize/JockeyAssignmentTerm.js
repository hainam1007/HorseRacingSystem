'use strict';

/**
 * Sequelize model — `jockey_assignment_terms` table.
 */

module.exports = (sequelize, DataTypes) => {
    const JockeyAssignmentTerm = sequelize.define(
        'jockey_assignment_terms',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            assignment_id: { type: DataTypes.UUID, allowNull: false, unique: true },
            agreed_terms: { type: DataTypes.TEXT },
            meeting_note: { type: DataTypes.TEXT },
            agreed_at: { type: DataTypes.DATE },
            sent_at: { type: DataTypes.DATE },
            confirmed_at: { type: DataTypes.DATE },
            rejected_at: { type: DataTypes.DATE },
            response_message: { type: DataTypes.TEXT },
            updated_by: { type: DataTypes.UUID }
        },
        { tableName: 'jockey_assignment_terms' }
    );

    JockeyAssignmentTerm.associate = (models) => {
        JockeyAssignmentTerm.belongsTo(models.JockeyAssignment, { foreignKey: 'assignment_id', as: 'assignment' });
        JockeyAssignmentTerm.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updater' });
    };

    return JockeyAssignmentTerm;
};