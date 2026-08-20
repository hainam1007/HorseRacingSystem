'use strict';

/**
 * Sequelize model — `users` table.
 *
 * Core platform account. Schema mirrors the legacy ORM definition.
 */

module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define(
        'users',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            full_name: { type: DataTypes.STRING(255), allowNull: false },
            email: { type: DataTypes.STRING(255), allowNull: false, validate: { isEmail: true } },
            password: { type: DataTypes.STRING(255), allowNull: false },
            phone_number: { type: DataTypes.STRING(32) },
            date_of_birth: { type: DataTypes.DATE },
            avatar_url: { type: DataTypes.STRING(512) },
            avatar_public_id: { type: DataTypes.STRING(255) },
            status: {
                type: DataTypes.STRING(32),
                allowNull: false,
                defaultValue: 'active',
                validate: { isIn: [['active', 'inactive', 'pending_verification', 'suspended', 'banned', 'deleted']] }
            },
            email_verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
            email_verified_at: { type: DataTypes.DATE },
            email_verification_token: { type: DataTypes.STRING(255) },
            email_verification_expires_at: { type: DataTypes.DATE },
            password_reset_token: { type: DataTypes.STRING(255) },
            password_reset_expires_at: { type: DataTypes.DATE },
            password_changed_at: { type: DataTypes.DATE }
        },
        {
            tableName: 'users',
            indexes: [
                { name: 'users_phone_idx', fields: ['phone_number'], where: { phone_number: { [sequelize.Sequelize.Op.ne]: null } } }
            ]
        }
    );

    User.associate = (models) => {
        User.hasMany(models.UserRole, { foreignKey: 'user_id', as: 'user_roles' });
        User.hasOne(models.HorseOwner, { foreignKey: 'user_id', as: 'horse_owner_profile' });
        User.hasOne(models.Jockey, { foreignKey: 'user_id', as: 'jockey_profile' });
        User.hasOne(models.RaceReferee, { foreignKey: 'user_id', as: 'referee_profile' });
        User.hasOne(models.Wallet, { foreignKey: 'user_id', as: 'wallet' });
        User.hasMany(models.Notification, { foreignKey: 'user_id', as: 'notifications' });
        User.hasMany(models.TransactionHistory, { foreignKey: 'user_id', as: 'transactions' });
        User.hasMany(models.Bet, { foreignKey: 'spectator_id', as: 'bets' });
        User.hasMany(models.RoleApplication, { foreignKey: 'user_id', as: 'role_applications' });
        User.hasMany(models.DepositRequest, { foreignKey: 'user_id', as: 'deposit_requests' });
        User.hasMany(models.RedemptionHistory, { foreignKey: 'user_id', as: 'redemption_histories' });
        User.hasMany(models.Tournament, { foreignKey: 'created_by', as: 'created_tournaments' });
        User.hasMany(models.Horse, { foreignKey: 'rating_updated_by', as: 'rating_updates' });
        User.hasMany(models.Racetrack, { foreignKey: 'created_by', as: 'created_racetracks' });
        User.hasMany(models.Racetrack, { foreignKey: 'updated_by', as: 'updated_racetracks' });
        User.hasMany(models.HorseCheck, { foreignKey: 'ballast_confirmed_by', as: 'ballast_confirmations' });
    };

    return User;
};
