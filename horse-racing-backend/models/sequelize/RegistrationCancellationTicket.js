'use strict';

/**
 * Sequelize model — `registration_cancellation_tickets` table.
 * Owner-initiated cancellation workflow; admin reviews.
 */

module.exports = (sequelize, DataTypes) => {
    const RegistrationCancellationTicket = sequelize.define(
        'registration_cancellation_tickets',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            registration_id: { type: DataTypes.UUID, allowNull: false },
            tournament_id: { type: DataTypes.UUID, allowNull: false },
            race_id: { type: DataTypes.UUID, allowNull: false },
            owner_id: { type: DataTypes.UUID, allowNull: false },
            horse_id: { type: DataTypes.UUID, allowNull: false },
            reason: { type: DataTypes.STRING(1000), allowNull: false },
            status: {
                type: DataTypes.STRING(32),
                defaultValue: 'pending',
                validate: { isIn: [['pending', 'approved', 'rejected']] }
            },
            refund_status: {
                type: DataTypes.STRING(64),
                defaultValue: 'not_required',
                validate: { isIn: [['not_required', 'awaiting_approval', 'pending', 'awaiting_owner_confirmation', 'completed', 'failed']] }
            },
            refund_amount_vnd: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0, validate: { min: 0 } },
            requested_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
            reviewed_by: { type: DataTypes.UUID },
            reviewed_at: { type: DataTypes.DATE },
            admin_note: { type: DataTypes.STRING(1000) },
            refund_reference: { type: DataTypes.STRING(255) },
            refund_sent_by: { type: DataTypes.UUID },
            refund_sent_at: { type: DataTypes.DATE },
            owner_confirmed_at: { type: DataTypes.DATE },
            owner_confirmation_note: { type: DataTypes.STRING(1000) }
        },
        {
            tableName: 'registration_cancellation_tickets',
            indexes: [
                { name: 'rct_reg_status_pending_uniq', unique: true, fields: ['registration_id', 'status'], where: { status: 'pending' } }
            ]
        }
    );

    RegistrationCancellationTicket.associate = (models) => {
        RegistrationCancellationTicket.belongsTo(models.Registration, { foreignKey: 'registration_id', as: 'registration' });
        RegistrationCancellationTicket.belongsTo(models.Tournament, { foreignKey: 'tournament_id', as: 'tournament' });
        RegistrationCancellationTicket.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
        RegistrationCancellationTicket.belongsTo(models.HorseOwner, { foreignKey: 'owner_id', as: 'owner' });
        RegistrationCancellationTicket.belongsTo(models.Horse, { foreignKey: 'horse_id', as: 'horse' });
        RegistrationCancellationTicket.belongsTo(models.User, { foreignKey: 'reviewed_by', as: 'reviewer' });
        RegistrationCancellationTicket.belongsTo(models.User, { foreignKey: 'refund_sent_by', as: 'refund_sender' });
    };

    return RegistrationCancellationTicket;
};