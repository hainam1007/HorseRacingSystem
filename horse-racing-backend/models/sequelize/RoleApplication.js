'use strict';

/**
 * Sequelize model — `role_applications` table.
 * User applies to upgrade role; admin reviews.
 * `application_data` Mixed → JSONB; `documents[]` → child table.
 */

module.exports = (sequelize, DataTypes) => {
    const RoleApplication = sequelize.define(
        'role_applications',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            user_id: { type: DataTypes.UUID, allowNull: false },
            requested_role: {
                type: DataTypes.STRING(32),
                allowNull: false,
                validate: { isIn: [['horse_owner', 'jockey', 'race_referee']] }
            },
            status: { type: DataTypes.STRING(32), defaultValue: 'pending' },
            application_data: { type: DataTypes.JSONB, defaultValue: {} },
            admin_note: { type: DataTypes.TEXT },
            reviewed_by: { type: DataTypes.UUID },
            reviewed_at: { type: DataTypes.DATE }
        },
        { tableName: 'role_applications' }
    );

    RoleApplication.associate = (models) => {
        RoleApplication.belongsTo(models.User, { foreignKey: 'user_id', as: 'applicant' });
        RoleApplication.belongsTo(models.User, { foreignKey: 'reviewed_by', as: 'reviewer' });
        RoleApplication.hasMany(models.RoleApplicationDocument, { foreignKey: 'role_application_id', as: 'documents' });
    };

    return RoleApplication;
};