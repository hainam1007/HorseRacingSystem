'use strict';

/**
 * Sequelize model — `prizes` table.
 */

module.exports = (sequelize, DataTypes) => {
    const Prize = sequelize.define(
        'prizes',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            tournament_id: { type: DataTypes.UUID, allowNull: false },
            race_id: { type: DataTypes.UUID, allowNull: false },
            prize_name: { type: DataTypes.STRING(255), allowNull: false },
            position: { type: DataTypes.INTEGER },
            amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
            percent: { type: DataTypes.DECIMAL(6, 2), defaultValue: 0 },
            currency: { type: DataTypes.STRING(8), defaultValue: 'VND' },
            description: { type: DataTypes.TEXT }
        },
        {
            tableName: 'prizes',
            indexes: [
                { name: 'prizes_race_position_idx', fields: ['race_id', 'position'] }
            ]
        }
    );

    Prize.associate = (models) => {
        Prize.belongsTo(models.Tournament, { foreignKey: 'tournament_id', as: 'tournament' });
        Prize.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
        Prize.hasMany(models.PrizeAward, { foreignKey: 'prize_id', as: 'awards' });
    };

    return Prize;
};