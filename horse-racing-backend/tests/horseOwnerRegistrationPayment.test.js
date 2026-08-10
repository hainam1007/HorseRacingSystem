const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

const { ROLE_NAMES } = require('../constants/roles');
const horseOwnerRepository = require('../repositories/horseOwnerRepository');
const emailService = require('../services/emailService');
const paymentGatewayService = require('../services/paymentGatewayService');
const raceEngineService = require('../services/raceEngineService');
const registrationSlotService = require('../services/registrationSlotService');
const horseOwnerService = require('../services/horseOwnerService');

const originals = {
  findProfileByUserId: horseOwnerRepository.findProfileByUserId,
  findHorseById: horseOwnerRepository.findHorseById,
  findTournamentById: horseOwnerRepository.findTournamentById,
  findRaceById: horseOwnerRepository.findRaceById,
  findRegistrationByRaceAndHorse: horseOwnerRepository.findRegistrationByRaceAndHorse,
  findRegistrationByPaymentOrderId: horseOwnerRepository.findRegistrationByPaymentOrderId,
  countApprovedRegistrationsByRaceIds: horseOwnerRepository.countApprovedRegistrationsByRaceIds,
  createRegistration: horseOwnerRepository.createRegistration,
  updateRegistrationById: horseOwnerRepository.updateRegistrationById,
  updateRegistrationByPaymentOrderId: horseOwnerRepository.updateRegistrationByPaymentOrderId,
  createPaymentUrl: paymentGatewayService.createPaymentUrl,
  verifySignature: paymentGatewayService.verifySignature,
  isPaymentSuccess: paymentGatewayService.isPaymentSuccess,
  extractGatewayTransactionId: paymentGatewayService.extractGatewayTransactionId,
  ensureRaceRegistrationIsUnlocked: raceEngineService.ensureRaceRegistrationIsUnlocked,
  initializeRaceSlots: registrationSlotService.initializeRaceSlots,
  releaseExpiredReservations: registrationSlotService.releaseExpiredReservations,
  reserveRaceSlot: registrationSlotService.reserveRaceSlot,
  releaseRaceSlot: registrationSlotService.releaseRaceSlot,
  releaseRegistrationSlot: registrationSlotService.releaseRegistrationSlot,
  isEmailConfigured: emailService.isEmailConfigured,
  sendRaceRegistrationConfirmedEmail: emailService.sendRaceRegistrationConfirmedEmail
};

test.afterEach(() => {
  Object.assign(horseOwnerRepository, {
    findProfileByUserId: originals.findProfileByUserId,
    findHorseById: originals.findHorseById,
    findTournamentById: originals.findTournamentById,
    findRaceById: originals.findRaceById,
    findRegistrationByRaceAndHorse: originals.findRegistrationByRaceAndHorse,
    findRegistrationByPaymentOrderId: originals.findRegistrationByPaymentOrderId,
    countApprovedRegistrationsByRaceIds: originals.countApprovedRegistrationsByRaceIds,
    createRegistration: originals.createRegistration,
    updateRegistrationById: originals.updateRegistrationById,
    updateRegistrationByPaymentOrderId: originals.updateRegistrationByPaymentOrderId
  });
  Object.assign(paymentGatewayService, {
    createPaymentUrl: originals.createPaymentUrl,
    verifySignature: originals.verifySignature,
    isPaymentSuccess: originals.isPaymentSuccess,
    extractGatewayTransactionId: originals.extractGatewayTransactionId
  });
  raceEngineService.ensureRaceRegistrationIsUnlocked = originals.ensureRaceRegistrationIsUnlocked;
  registrationSlotService.initializeRaceSlots = originals.initializeRaceSlots;
  registrationSlotService.releaseExpiredReservations = originals.releaseExpiredReservations;
  registrationSlotService.reserveRaceSlot = originals.reserveRaceSlot;
  registrationSlotService.releaseRaceSlot = originals.releaseRaceSlot;
  registrationSlotService.releaseRegistrationSlot = originals.releaseRegistrationSlot;
  emailService.isEmailConfigured = originals.isEmailConfigured;
  emailService.sendRaceRegistrationConfirmedEmail = originals.sendRaceRegistrationConfirmedEmail;
});

function stubRegistrationContext() {
  const ids = {
    userId: new mongoose.Types.ObjectId(),
    ownerId: new mongoose.Types.ObjectId(),
    horseId: new mongoose.Types.ObjectId(),
    tournamentId: new mongoose.Types.ObjectId(),
    raceId: new mongoose.Types.ObjectId()
  };

  horseOwnerRepository.findProfileByUserId = async () => ({ _id: ids.ownerId, user_id: ids.userId });
  horseOwnerRepository.findHorseById = async () => ({
    _id: ids.horseId,
    owner_id: ids.ownerId,
    name: 'Silver Comet',
    status: 'active'
  });
  horseOwnerRepository.findTournamentById = async () => ({
    _id: ids.tournamentId,
    name: 'Owner Cup'
  });
  horseOwnerRepository.findRaceById = async () => ({
    _id: ids.raceId,
    tournament_id: ids.tournamentId,
    name: 'Owner Cup Qualifier',
    status: 'scheduled',
    max_participants: 6,
    entry_fee: 50000,
    entry_fee_currency: 'VND'
  });
  horseOwnerRepository.findRegistrationByRaceAndHorse = async () => null;
  horseOwnerRepository.countApprovedRegistrationsByRaceIds = async () => [{ _id: ids.raceId, count: 5 }];
  raceEngineService.ensureRaceRegistrationIsUnlocked = async () => true;
  registrationSlotService.initializeRaceSlots = async () => true;
  registrationSlotService.releaseExpiredReservations = async () => 0;
  registrationSlotService.reserveRaceSlot = async () => true;
  registrationSlotService.releaseRaceSlot = async () => true;
  registrationSlotService.releaseRegistrationSlot = async () => true;

  return ids;
}

test('paid race registration creates a VNPay intent without using spectator tokens', async () => {
  const ids = stubRegistrationContext();
  let createdPayload = null;
  let emailCalled = false;

  horseOwnerRepository.createRegistration = async (payload) => {
    createdPayload = payload;
    return { _id: new mongoose.Types.ObjectId(), ...payload };
  };
  paymentGatewayService.createPaymentUrl = async ({ orderId, amountVnd, paymentMethod }) => {
    assert.match(orderId, /^REG-/);
    assert.equal(amountVnd, 50000);
    assert.equal(paymentMethod, 'VNPAY');
    return { order_id: orderId, payment_url: 'https://sandbox.vnpayment.vn/demo' };
  };
  emailService.sendRaceRegistrationConfirmedEmail = async () => {
    emailCalled = true;
  };

  const result = await horseOwnerService.registerHorseForRace(
    { _id: ids.userId, roles: [ROLE_NAMES.HORSE_OWNER] },
    { horse_id: ids.horseId, race_id: ids.raceId, payment_method: 'VNPAY' }
  );

  assert.equal(createdPayload.entry_fee_vnd, 50000);
  assert.equal(createdPayload.entry_fee_token, 0);
  assert.equal(createdPayload.payment_method, 'VNPAY');
  assert.equal(createdPayload.payment_status, 'pending');
  assert.equal(createdPayload.status, 'pending');
  assert.ok(createdPayload.payment_expires_at instanceof Date);
  assert.match(result.order_id, /^REG-/);
  assert.equal(result.payment_url, 'https://sandbox.vnpayment.vn/demo');
  assert.equal(emailCalled, false);
  assert.equal('wallet' in result, false);
});

test('successful VNPay callback auto-confirms registration and queues confirmation email', async () => {
  const registrationId = new mongoose.Types.ObjectId();
  const raceId = new mongoose.Types.ObjectId();
  const ownerId = new mongoose.Types.ObjectId();
  let updatedPayload = null;
  let emailContext = null;
  const registration = {
    _id: registrationId,
    payment_order_id: 'REG-TEST-SUCCESS',
    payment_method: 'VNPAY',
    payment_status: 'pending',
    slot_reserved: true,
    payment_expires_at: new Date(Date.now() + 60000),
    entry_fee_vnd: 50000,
    status: 'pending',
    race_id: { _id: raceId, name: 'Owner Cup Qualifier', max_participants: 6 },
    tournament_id: { _id: new mongoose.Types.ObjectId(), name: 'Owner Cup' },
    horse_id: { _id: new mongoose.Types.ObjectId(), name: 'Silver Comet' },
    owner_id: {
      _id: ownerId,
      stable_name: 'Whitmore Racing',
      user_id: { email: 'owner@example.com', full_name: 'James Whitmore' }
    }
  };

  horseOwnerRepository.findRegistrationByPaymentOrderId = async () => registration;
  registrationSlotService.releaseRegistrationSlot = async () => true;
  horseOwnerRepository.updateRegistrationByPaymentOrderId = async (orderId, update) => {
    assert.equal(orderId, registration.payment_order_id);
    updatedPayload = update.$set;
    return { ...registration, ...update.$set };
  };
  paymentGatewayService.verifySignature = () => ({ valid: true });
  paymentGatewayService.isPaymentSuccess = () => true;
  paymentGatewayService.extractGatewayTransactionId = () => 'VNPAY-TXN-001';
  emailService.isEmailConfigured = () => true;
  emailService.sendRaceRegistrationConfirmedEmail = async (context) => {
    emailContext = context;
    return { skipped: false };
  };

  const result = await horseOwnerService.handleRegistrationPaymentWebhook({
    vnp_TxnRef: registration.payment_order_id,
    vnp_Amount: '5000000',
    vnp_ResponseCode: '00'
  }, 'VNPAY');

  assert.equal(updatedPayload.payment_status, 'paid');
  assert.equal(updatedPayload.status, 'approved');
  assert.equal(updatedPayload.gateway_reference_id, 'VNPAY-TXN-001');
  assert.ok(updatedPayload.payment_paid_at instanceof Date);
  assert.equal(result.order.status, 'success');
  assert.equal(result.email_delivery.status, 'queued');
  assert.equal(emailContext.user.email, 'owner@example.com');
});

test('failed VNPay callback rejects the pending entry and does not send email', async () => {
  const registration = {
    _id: new mongoose.Types.ObjectId(),
    payment_order_id: 'REG-TEST-FAILED',
    payment_method: 'VNPAY',
    payment_status: 'pending',
    slot_reserved: true,
    entry_fee_vnd: 50000,
    status: 'pending'
  };
  let emailCalled = false;

  horseOwnerRepository.findRegistrationByPaymentOrderId = async () => registration;
  registrationSlotService.releaseRegistrationSlot = async () => true;
  horseOwnerRepository.updateRegistrationById = async (id, update) => ({ ...registration, ...update.$set });
  paymentGatewayService.verifySignature = () => ({ valid: true });
  paymentGatewayService.isPaymentSuccess = () => false;
  emailService.sendRaceRegistrationConfirmedEmail = async () => {
    emailCalled = true;
  };

  const result = await horseOwnerService.handleRegistrationPaymentWebhook({
    vnp_TxnRef: registration.payment_order_id,
    vnp_ResponseCode: '24'
  }, 'VNPAY');

  assert.equal(result.registration.payment_status, 'failed');
  assert.equal(result.registration.status, 'rejected');
  assert.equal(result.order.status, 'failed');
  assert.equal(emailCalled, false);
});

test('successful payment after reservation expiry is routed to refund review', async () => {
  const registration = {
    _id: new mongoose.Types.ObjectId(),
    payment_order_id: 'REG-TEST-EXPIRED',
    payment_method: 'VNPAY',
    payment_status: 'pending',
    slot_reserved: true,
    payment_expires_at: new Date(Date.now() - 60000),
    entry_fee_vnd: 50000,
    status: 'pending',
    race_id: { _id: new mongoose.Types.ObjectId() }
  };
  let confirmationCalled = false;

  horseOwnerRepository.findRegistrationByPaymentOrderId = async () => registration;
  horseOwnerRepository.updateRegistrationById = async (id, update) => ({
    ...registration,
    ...update.$set
  });
  horseOwnerRepository.updateRegistrationByPaymentOrderId = async () => {
    confirmationCalled = true;
    return null;
  };
  registrationSlotService.releaseRegistrationSlot = async () => true;
  paymentGatewayService.verifySignature = () => ({ valid: true });
  paymentGatewayService.isPaymentSuccess = () => true;

  const result = await horseOwnerService.handleRegistrationPaymentWebhook({
    vnp_TxnRef: registration.payment_order_id,
    vnp_Amount: '5000000',
    vnp_ResponseCode: '00'
  }, 'VNPAY');

  assert.equal(result.registration.payment_status, 'refund_pending');
  assert.equal(result.registration.status, 'rejected');
  assert.equal(result.order.status, 'failed');
  assert.equal(confirmationCalled, false);
});

test('full race is rejected before a VNPay order is created', async () => {
  const ids = stubRegistrationContext();
  let gatewayCalled = false;
  let createCalled = false;

  horseOwnerRepository.countApprovedRegistrationsByRaceIds = async () => [{ _id: ids.raceId, count: 6 }];
  horseOwnerRepository.createRegistration = async () => {
    createCalled = true;
  };
  paymentGatewayService.createPaymentUrl = async () => {
    gatewayCalled = true;
  };

  await assert.rejects(
    horseOwnerService.registerHorseForRace(
      { _id: ids.userId, roles: [ROLE_NAMES.HORSE_OWNER] },
      { horse_id: ids.horseId, race_id: ids.raceId }
    ),
    (error) => error.statusCode === 409 && error.details.registration_unavailable_reason === 'race_full'
  );

  assert.equal(createCalled, false);
  assert.equal(gatewayCalled, false);
});
