'use strict';

/**
 * Sequelize model — `rounds` table.
 */

module.exports = (sequelize, DataTypes) => {
    const Round = sequelize.define(
        'rounds',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            tournament_id: { type: DataTypes.UUID, allowNull: false },
            name: { type: DataTypes.STRING(255), allowNull: false },
            round_order: { type: DataTypes.INTEGER, allowNull: false },
            description: { type: DataTypes.TEXT },
            status: { type: DataTypes.STRING(32), defaultValue: 'draft' }
        },
        {
            tableName: 'rounds',
            indexes: [
                { name: 'rounds_tournament_order_uniq', unique: true, fields: ['tournament_id', 'round_order'], where: { deleted_at: null } }
            ]
        }
    );

    Round.associate = (models) => {
        Round.belongsTo(models.Tournament, { foreignKey: 'tournament_id', as: 'tournament' });
        Round.hasMany(models.Race, { foreignKey: 'round_id', as: 'races' });
    };

    return Round;
};