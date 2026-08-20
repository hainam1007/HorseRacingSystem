'use strict';

/**
 * Sequelize model — `racetracks` table.
 * A racetrack owns one versioned eligibility rule; races persist a copy of
 * that rule when they are created so subsequent edits cannot alter history.
 */

module.exports = (sequelize, DataTypes) => {
    const Racetrack = sequelize.define(
        'racetracks',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
            name: { type: DataTypes.STRING(255), allowNull: false },
            address: { type: DataTypes.STRING(512) },
            province: { type: DataTypes.STRING(255) },
            country_code: {
                type: DataTypes.STRING(2),
                allowNull: false,
                defaultValue: 'VN',
                validate: { is: /^VN$/ }
            },
            status: {
                type: DataTypes.STRING(16),
                allowNull: false,
                defaultValue: 'draft',
                validate: { isIn: [['draft', 'active', 'inactive']] }
            },
            eligibility_rule: { type: DataTypes.JSONB, allowNull: false },
            rule_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1 } },
            created_by: { type: DataTypes.UUID },
            updated_by: { type: DataTypes.UUID }
        },
        {
            tableName: 'racetracks',
            indexes: [
                { name: 'racetracks_code_uniq', unique: true, fields: ['code'] },
                { name: 'racetracks_status_idx', fields: ['status'] }
            ]
        }
    );

    Racetrack.associate = (models) => {
        Racetrack.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
        Racetrack.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updater' });
        Racetrack.hasMany(models.Race, { foreignKey: 'racetrack_id', as: 'races' });
    };

    return Racetrack;
};
