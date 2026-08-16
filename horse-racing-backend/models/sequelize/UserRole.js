'use strict';

/**
 * Sequelize model — `user_roles` table.
 * Many-to-many pivot between users and roles.
 */

module.exports = (sequelize, DataTypes) => {
    const UserRole = sequelize.define(
        'user_roles',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            user_id: { type: DataTypes.UUID, allowNull: false },
            role_id: { type: DataTypes.UUID, allowNull: false }
        },
{
                tableName: 'user_roles',
                timestamps: false,
                indexes: [
                    { name: 'user_roles_user_role_uniq', unique: true, fields: ['user_id', 'role_id'], where: { deleted_at: null } }
                ]
            }
    );

    UserRole.associate = (models) => {
        UserRole.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
        UserRole.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
    };

    return UserRole;
};