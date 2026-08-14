'use strict';

/**
 * Sequelize model — `jockey_assignment_meetings` table.
 * Child of JockeyAssignment (1:1) — embedded `meeting{}` normalized.
 */

module.exports = (sequelize, DataTypes) => {
    const JockeyAssignmentMeeting = sequelize.define(
        'jockey_assignment_meetings',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            assignment_id: { type: DataTypes.UUID, allowNull: false, unique: true },
            title: { type: DataTypes.STRING(255) },
            meeting_url: { type: DataTypes.STRING(512) },
            meeting_time: { type: DataTypes.DATE },
            location_name: { type: DataTypes.STRING(255) },
            address: { type: DataTypes.TEXT },
            city: { type: DataTypes.STRING(128) },
            district: { type: DataTypes.STRING(128) },
            ward: { type: DataTypes.STRING(128) },
            map_url: { type: DataTypes.STRING(512) },
            contact_name: { type: DataTypes.STRING(128) },
            contact_phone: { type: DataTypes.STRING(32) },
            note: { type: DataTypes.TEXT },
            accepted_at: { type: DataTypes.DATE },
            rejected_at: { type: DataTypes.DATE },
            response_message: { type: DataTypes.TEXT }
        },
        { tableName: 'jockey_assignment_meetings' }
    );

    JockeyAssignmentMeeting.associate = (models) => {
        JockeyAssignmentMeeting.belongsTo(models.JockeyAssignment, { foreignKey: 'assignment_id', as: 'assignment' });
    };

    return JockeyAssignmentMeeting;
};