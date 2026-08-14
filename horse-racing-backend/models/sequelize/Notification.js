'use strict';

/**
 * Sequelize model — `notifications` table.
 */

module.exports = (sequelize, DataTypes) => {
    const Notification = sequelize.define(
        'notifications',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            user_id: { type: DataTypes.UUID, allowNull: false },
            title: { type: DataTypes.STRING(255), allowNull: false },
            content: { type: DataTypes.TEXT, allowNull: false },
            type: { type: DataTypes.STRING(64) },
            is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
            created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
        },
        { tableName: 'notifications' }
    );

    Notification.associate = (models) => {
        Notification.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    };

    return Notification;
};