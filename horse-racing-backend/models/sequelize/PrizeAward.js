'use strict';

/**
 * Sequelize model — `prize_awards` table.
 */

module.exports = (sequelize, DataTypes) => {
    const PrizeAward = sequelize.define(
        'prize_awards',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            prize_id: { type: DataTypes.UUID, allowNull: false },
            race_result_id: { type: DataTypes.UUID, allowNull: false, unique: true },
            horse_id: { type: DataTypes.UUID, allowNull: false },
            owner_id: { type: DataTypes.UUID, allowNull: false },
            jockey_id: { type: DataTypes.UUID },
            position: { type: DataTypes.INTEGER },
            amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
            gross_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
            owner_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
            jockey_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
            currency: { type: DataTypes.STRING(8), defaultValue: 'VND' },
            status: {
                type: DataTypes.STRING(32),
                defaultValue: 'calculated',
                validate: { isIn: [['calculated', 'approved', 'paid', 'cancelled']] }
            },
            awarded_at: { type: DataTypes.DATE },
            calculated_at: { type: DataTypes.DATE },
            approved_at: { type: DataTypes.DATE },
            approved_by: { type: DataTypes.UUID },
            paid_at: { type: DataTypes.DATE },
            paid_by: { type: DataTypes.UUID }
        },
        { tableName: 'prize_awards' }
    );

    PrizeAward.associate = (models) => {
        PrizeAward.belongsTo(models.Prize, { foreignKey: 'prize_id', as: 'prize' });
        PrizeAward.belongsTo(models.RaceResult, { foreignKey: 'race_result_id', as: 'race_result' });
        PrizeAward.belongsTo(models.Horse, { foreignKey: 'horse_id', as: 'horse' });
        PrizeAward.belongsTo(models.HorseOwner, { foreignKey: 'owner_id', as: 'owner' });
        PrizeAward.belongsTo(models.Jockey, { foreignKey: 'jockey_id', as: 'jockey' });
        PrizeAward.belongsTo(models.User, { foreignKey: 'approved_by', as: 'approver' });
        PrizeAward.belongsTo(models.User, { foreignKey: 'paid_by', as: 'payer' });
    };

    return PrizeAward;
};