'use strict';

/**
 * Sequelize model — `role_application_documents` table.
 */

module.exports = (sequelize, DataTypes) => {
    const RoleApplicationDocument = sequelize.define(
        'role_application_documents',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            role_application_id: { type: DataTypes.UUID, allowNull: false },
            type: { type: DataTypes.STRING(64), allowNull: false },
            url: { type: DataTypes.STRING(512), allowNull: false },
            public_id: { type: DataTypes.STRING(255) },
            note: { type: DataTypes.TEXT }
        },
        { tableName: 'role_application_documents', timestamps: false }
    );

    RoleApplicationDocument.associate = (models) => {
        RoleApplicationDocument.belongsTo(models.RoleApplication, { foreignKey: 'role_application_id', as: 'application' });
    };

    return RoleApplicationDocument;
};