'use strict';

/**
 * Sequelize model — `registrations` table.
 * Horse-owner entry into a race. `gears[]` → child table.
 */

module.exports = (sequelize, DataTypes) => {
    const Registration = sequelize.define(
        'registrations',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            tournament_id: { type: DataTypes.UUID, allowNull: false },
            race_id: { type: DataTypes.UUID, allowNull: false },
            horse_id: { type: DataTypes.UUID, allowNull: false },
            owner_id: { type: DataTypes.UUID, allowNull: false },
            horse_no: { type: DataTypes.INTEGER, validate: { min: 1 } },
            draw: { type: DataTypes.INTEGER, validate: { min: 1 } },
            rating_snapshot: { type: DataTypes.INTEGER, validate: { min: 0, max: 140 } },
            declared_weight_kg: { type: DataTypes.DECIMAL(6, 2), defaultValue: 54.5, validate: { min: 40, max: 75 } },
            entry_finalized_at: { type: DataTypes.DATE },
            entry_finalized_by: { type: DataTypes.UUID },
            status: { type: DataTypes.STRING(32), defaultValue: 'pending' },
            note: { type: DataTypes.TEXT },
            admin_note: { type: DataTypes.TEXT },
            entry_fee_vnd: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0, validate: { min: 0 } },
            entry_fee_token: { type: DataTypes.INTEGER, defaultValue: 0, validate: { min: 0 } },
            payment_status: {
                type: DataTypes.STRING(32),
                defaultValue: 'not_required',
                validate: { isIn: [['not_required', 'pending', 'paid', 'failed', 'refund_pending', 'refund_sent', 'refunded']] }
            },
            payment_method: {
                type: DataTypes.STRING(16),
                validate: { isIn: [['VNPAY']] }
            },
            payment_order_id: { type: DataTypes.STRING(255) },
            payment_expires_at: { type: DataTypes.DATE },
            gateway_reference_id: { type: DataTypes.STRING(255) },
            payment_transaction_id: { type: DataTypes.UUID },
            payment_paid_at: { type: DataTypes.DATE },
            payment_refunded_at: { type: DataTypes.DATE },
            slot_reserved: { type: DataTypes.BOOLEAN, defaultValue: false },
            slot_reserved_at: { type: DataTypes.DATE },
            slot_released_at: { type: DataTypes.DATE },
            registered_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
            approved_by: { type: DataTypes.UUID },
            approved_at: { type: DataTypes.DATE },
            eligibility_status: {
                type: DataTypes.STRING(32),
                validate: { isIn: [['eligible', 'conditional_ballast', 'ineligible']] }
            },
            eligibility_snapshot: { type: DataTypes.JSONB },
            eligibility_checked_at: { type: DataTypes.DATE }
        },
        {
            tableName: 'registrations',
            indexes: [
                { name: 'registrations_race_horse_uniq', unique: true, fields: ['race_id', 'horse_id'], where: { deleted_at: null } },
                { name: 'registrations_race_horse_no_uniq', unique: true, fields: ['race_id', 'horse_no'], where: { horse_no: { [sequelize.Sequelize.Op.ne]: null }, deleted_at: null } },
                { name: 'registrations_race_draw_uniq', unique: true, fields: ['race_id', 'draw'], where: { draw: { [sequelize.Sequelize.Op.ne]: null }, deleted_at: null } },
                { name: 'registrations_payment_order_id_uniq', unique: true, fields: ['payment_order_id'], where: { payment_order_id: { [sequelize.Sequelize.Op.ne]: null }, deleted_at: null } },
                { name: 'registrations_gateway_reference_id_uniq', unique: true, fields: ['gateway_reference_id'], where: { gateway_reference_id: { [sequelize.Sequelize.Op.ne]: null }, deleted_at: null } }
            ]
        }
    );

    Registration.associate = (models) => {
        Registration.belongsTo(models.Tournament, { foreignKey: 'tournament_id', as: 'tournament' });
        Registration.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
        Registration.belongsTo(models.Horse, { foreignKey: 'horse_id', as: 'horse' });
        Registration.belongsTo(models.HorseOwner, { foreignKey: 'owner_id', as: 'owner' });
        Registration.belongsTo(models.User, { foreignKey: 'entry_finalized_by', as: 'entry_finalizer' });
        Registration.belongsTo(models.User, { foreignKey: 'approved_by', as: 'approver' });
        Registration.belongsTo(models.TransactionHistory, { foreignKey: 'payment_transaction_id', as: 'payment_transaction' });
        Registration.hasMany(models.RegistrationGear, { foreignKey: 'registration_id', as: 'gears' });
        Registration.hasOne(models.RegistrationCancellationTicket, { foreignKey: 'registration_id', as: 'cancellation_ticket' });
    };

    return Registration;
};
