'use strict';

/**
 * Sequelize model — `racetracks` table.
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
            name: {
                type: DataTypes.STRING(255),
                allowNull: false
            },
            code: {
                type: DataTypes.STRING(64),
                allowNull: false,
                unique: true
            },
            location: {
                type: DataTypes.STRING(255)
            },
            max_horses: {
                type: DataTypes.INTEGER,
                defaultValue: 12,
                validate: { min: 1, max: 30 }
            },
            surface: {
                type: DataTypes.STRING(32),
                defaultValue: 'Turf',
                validate: { isIn: [['Turf', 'Dirt', 'Synthetic']] }
            },
            length_m: {
                type: DataTypes.INTEGER,
                defaultValue: 1400,
                validate: { min: 400, max: 4000 }
            },
            attributes: {
                type: DataTypes.JSONB,
                defaultValue: {}
            },
            description: {
                type: DataTypes.TEXT
            },
            status: {
                type: DataTypes.STRING(32),
                defaultValue: 'active',
                validate: { isIn: [['active', 'maintenance', 'inactive']] }
            }
        },
        { tableName: 'racetracks' }
    );

    Racetrack.associate = (models) => {
        Racetrack.hasMany(models.Tournament, { foreignKey: 'racetrack_id', as: 'tournaments' });
        Racetrack.hasMany(models.Race, { foreignKey: 'racetrack_id', as: 'races' });
    };

    return Racetrack;
};
