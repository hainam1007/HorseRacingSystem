'use strict';

/**
 * Sequelize model — `roles` table.
 * Static role catalogue (admin, horse_owner, jockey, race_referee, spectator).
 */

module.exports = (sequelize, DataTypes) => {
    const Role = sequelize.define(
        'roles',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            role_name: {
                type: DataTypes.STRING(64),
                allowNull: false,
                unique: true,
                validate: { isIn: [['admin', 'horse_owner', 'jockey', 'race_referee', 'spectator']] }
            },
            description: { type: DataTypes.TEXT }
        },
        { tableName: 'roles' }
    );

    Role.associate = (models) => {
        Role.hasMany(models.UserRole, { foreignKey: 'role_id', as: 'user_roles' });
    };

    return Role;
};