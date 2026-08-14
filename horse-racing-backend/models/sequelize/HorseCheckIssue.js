'use strict';

/**
 * Sequelize model — `horse_check_issues` table.
 */

module.exports = (sequelize, DataTypes) => {
    const HorseCheckIssue = sequelize.define(
        'horse_check_issues',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            horse_check_id: { type: DataTypes.UUID, allowNull: false },
            code: { type: DataTypes.STRING(64), allowNull: false },
            severity: { type: DataTypes.STRING(32) },
            note: { type: DataTypes.TEXT }
        },
        { tableName: 'horse_check_issues', timestamps: false }
    );

    HorseCheckIssue.associate = (models) => {
        HorseCheckIssue.belongsTo(models.HorseCheck, { foreignKey: 'horse_check_id', as: 'horse_check' });
    };

    return HorseCheckIssue;
};