'use strict';

/**
 * Sequelize model — `tournaments` table.
 */

module.exports = (sequelize, DataTypes) => {
    const Tournament = sequelize.define(
        'tournaments',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            name: { type: DataTypes.STRING(255), allowNull: false },
            description: { type: DataTypes.TEXT },
            location: { type: DataTypes.STRING(255) },
            image_url: { type: DataTypes.STRING(512) },
            image_public_id: { type: DataTypes.STRING(255) },
            start_date: { type: DataTypes.DATE },
            end_date: { type: DataTypes.DATE },
            status: { type: DataTypes.STRING(32), defaultValue: 'draft' },
            created_by: { type: DataTypes.UUID, allowNull: false }
        },
        { tableName: 'tournaments' }
    );

    Tournament.associate = (models) => {
        Tournament.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
        Tournament.hasMany(models.Round, { foreignKey: 'tournament_id', as: 'rounds' });
        Tournament.hasMany(models.Race, { foreignKey: 'tournament_id', as: 'races' });
        Tournament.hasMany(models.Registration, { foreignKey: 'tournament_id', as: 'registrations' });
        Tournament.hasMany(models.Prize, { foreignKey: 'tournament_id', as: 'prizes' });
        Tournament.hasMany(models.RegistrationCancellationTicket, { foreignKey: 'tournament_id', as: 'cancellation_tickets' });
    };

    return Tournament;
};