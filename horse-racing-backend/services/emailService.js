const nodemailer = require('nodemailer');

function isEmailConfigured() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);
}

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
}

function getFromAddress() {
  return process.env.EMAIL_FROM || process.env.EMAIL_USER;
}

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getEntityName(entity, fallback) {
  if (!entity) {
    return fallback;
  }

  return entity.name || entity.full_name || fallback;
}

function formatDateTime(value) {
  if (!value) {
    return 'To be confirmed';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'To be confirmed';
  }

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  }).format(date);
}

function getPreRaceInspectionSchedule(raceDate) {
  if (!raceDate || Number.isNaN(new Date(raceDate).getTime())) {
    return {
      arrival: 'To be confirmed',
      deadline: 'To be confirmed'
    };
  }

  const raceTime = new Date(raceDate).getTime();

  return {
    arrival: formatDateTime(new Date(raceTime - (2 * 60 * 60 * 1000))),
    deadline: formatDateTime(new Date(raceTime - (45 * 60 * 1000)))
  };
}

function buildRaceRegistrationConfirmationMail(context) {
  const user = context.user || {};
  const owner = context.owner || {};
  const horse = context.horse || {};
  const tournament = context.tournament || {};
  const race = context.race || {};
  const registration = context.registration || {};
  const inspection = getPreRaceInspectionSchedule(race.race_date);
  const ownerName = user.full_name || owner.stable_name || 'Horse Owner';
  const horseName = getEntityName(horse, 'Registered horse');
  const raceName = getEntityName(race, 'Selected race');
  const tournamentName = getEntityName(tournament, 'Tournament');
  const roundName = getEntityName(race.round_id || race.round, 'Not specified');
  const venue = race.location || tournament.location || 'To be confirmed';
  const registrationId = registration._id || registration.id || 'Pending reference';
  const feeVnd = Number(registration.entry_fee_vnd || 0);
  const feeText = feeVnd > 0
    ? feeVnd.toLocaleString('en-US') + ' VND via VNPay'
    : 'No entry fee required';
  const details = [
    ['Entry reference', registrationId],
    ['Horse', horseName],
    ['Horse registration number', horse.registration_number || 'Not specified'],
    ['Tournament', tournamentName],
    ['Race', raceName],
    ['Round', roundName],
    ['Race date and time', formatDateTime(race.race_date)],
    ['Venue', venue],
    ['Distance', race.distance ? race.distance + ' metres' : 'Not specified'],
    ['Recommended arrival for pre-race inspection', inspection.arrival],
    ['Recommended inspection completion deadline', inspection.deadline],
    ['Entry fee', feeText],
    ['Payment status', registration.payment_status || 'not_required'],
    ['Registration status', registration.status || 'approved']
  ];
  const textDetails = details.map(function(item) {
    return item[0] + ': ' + item[1];
  });
  const htmlDetails = details.map(function(item) {
    return '<tr><td style="padding:6px 12px 6px 0;color:#555;vertical-align:top;">' + escapeHtml(item[0])
      + '</td><td style="padding:6px 0;font-weight:600;vertical-align:top;">' + escapeHtml(item[1]) + '</td></tr>';
  }).join('');

  return {
    to: user.email,
    subject: 'Race Entry Confirmed - ' + horseName + ' - ' + raceName,
    text: [
      'Hello ' + ownerName + ',',
      '',
      'Your race entry has been confirmed.',
      '',
      ...textDetails,
      '',
      'Next steps:',
      '1. Invite and contract an eligible primary jockey for this horse and race.',
      '2. Bring the horse passport/identification, vaccination and health records, and required racing equipment.',
      '3. Present the horse for the referee pre-race inspection within the recommended window above.',
      '',
      'Important: The pre-race times in this email are recommended demo operating times and may be adjusted by race officials. A horse that fails or misses the pre-race inspection will be excluded from the race, and the entry fee is not refunded.',
      '',
      'Stable: ' + (owner.stable_name || 'Not specified')
    ].join('\n'),
    html: [
      '<p>Hello ' + escapeHtml(ownerName) + ',</p>',
      '<p>Your race entry has been <strong>confirmed</strong>.</p>',
      '<table style="border-collapse:collapse;">' + htmlDetails + '</table>',
      '<h3>Next steps</h3>',
      '<ol>',
      '<li>Invite and contract an eligible primary jockey for this horse and race.</li>',
      '<li>Bring the horse passport/identification, vaccination and health records, and required racing equipment.</li>',
      '<li>Present the horse for the referee pre-race inspection within the recommended window above.</li>',
      '</ol>',
      '<p><strong>Important:</strong> The pre-race times in this email are recommended demo operating times and may be adjusted by race officials. A horse that fails or misses the pre-race inspection will be excluded from the race, and the entry fee is not refunded.</p>',
      '<p>Stable: ' + escapeHtml(owner.stable_name || 'Not specified') + '</p>'
    ].join('')
  };
}

async function sendMail(mailOptions) {
  if (!isEmailConfigured()) {
    return {
      skipped: true,
      reason: 'Email credentials are not configured'
    };
  }

  const transporter = getTransporter();
  const info = await transporter.sendMail(Object.assign({}, mailOptions, {
    from: getFromAddress()
  }));

  return {
    skipped: false,
    message_id: info.messageId
  };
}

async function sendVerificationEmail(user, otp, expiresAt) {
  return sendMail({
    to: user.email,
    subject: 'Your Horse Racing verification OTP',
    text: [
      'Hello ' + user.full_name + ',',
      '',
      'Your verification OTP is:',
      otp,
      '',
      'This OTP expires at: ' + expiresAt.toISOString()
    ].join('\n'),
    html: [
      '<p>Hello ' + user.full_name + ',</p>',
      '<p>Your verification OTP is:</p>',
      '<p style="font-size:24px;font-weight:bold;letter-spacing:4px;">' + otp + '</p>',
      '<p>This OTP expires at: ' + expiresAt.toISOString() + '</p>'
    ].join('')
  });
}

async function sendPasswordResetEmail(user, otp, expiresAt) {
  return sendMail({
    to: user.email,
    subject: 'Your Horse Racing password reset OTP',
    text: [
      'Hello ' + user.full_name + ',',
      '',
      'Your password reset OTP is:',
      otp,
      '',
      'This OTP expires at: ' + expiresAt.toISOString()
    ].join('\n'),
    html: [
      '<p>Hello ' + user.full_name + ',</p>',
      '<p>Your password reset OTP is:</p>',
      '<p style="font-size:24px;font-weight:bold;letter-spacing:4px;">' + otp + '</p>',
      '<p>This OTP expires at: ' + expiresAt.toISOString() + '</p>'
    ].join('')
  });
}

async function sendRaceRegistrationConfirmedEmail(context) {
  return sendMail(buildRaceRegistrationConfirmationMail(context));
}

module.exports = {
  isEmailConfigured,
  sendPasswordResetEmail,
  sendRaceRegistrationConfirmedEmail,
  sendVerificationEmail,
  _private: {
    buildRaceRegistrationConfirmationMail,
    formatDateTime,
    getPreRaceInspectionSchedule
  }
};
