'use strict';

/**
 * Sequelize model — `jockey_assignment_standby_contracts` table.
 */

module.exports = (sequelize, DataTypes) => {
    const JockeyAssignmentStandbyContract = sequelize.define(
        'jockey_assignment_standby_contracts',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            assignment_id: { type: DataTypes.UUID, allowNull: false, unique: true },
            contract_number: { type: DataTypes.STRING(128) },
            title: { type: DataTypes.STRING(255) },
            file_url: { type: DataTypes.TEXT },
            file_public_id: { type: DataTypes.STRING(255) },
            file_type: { type: DataTypes.STRING(64) },
            file_name: { type: DataTypes.STRING(255) },
            signed_at: { type: DataTypes.DATE },
            uploaded_at: { type: DataTypes.DATE },
            confirmed_at: { type: DataTypes.DATE },
            rejected_at: { type: DataTypes.DATE },
            response_message: { type: DataTypes.TEXT },
            note: { type: DataTypes.TEXT }
        },
        { tableName: 'jockey_assignment_standby_contracts' }
    );

    JockeyAssignmentStandbyContract.associate = (models) => {
        JockeyAssignmentStandbyContract.belongsTo(models.JockeyAssignment, { foreignKey: 'assignment_id', as: 'assignment' });
    };

    return JockeyAssignmentStandbyContract;
};
