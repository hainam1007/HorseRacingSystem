const assert = require('node:assert/strict');
const test = require('node:test');

const emailService = require('../services/emailService');

test('race registration email includes race schedule and recommended pre-race inspection window', () => {
  const previousTimezone = process.env.APP_TIMEZONE;
  process.env.APP_TIMEZONE = 'Asia/Ho_Chi_Minh';

  try {
    const mail = emailService._private.buildRaceRegistrationConfirmationMail({
      user: {
        full_name: 'James Whitmore',
        email: 'james@example.com'
      },
      owner: {
        stable_name: 'Whitmore Racing'
      },
      horse: {
        name: 'Silver Comet',
        registration_number: 'GB-2026-0142'
      },
      tournament: {
        name: 'Saigon Summer Meeting',
        location: 'Phu Tho Racecourse'
      },
      race: {
        name: 'Maiden Sprint',
        race_date: new Date('2026-07-20T09:00:00.000Z'),
        location: 'Phu Tho Racecourse',
        distance: 1200
      },
      registration: {
        _id: 'registration-1',
        entry_fee_token: 0,
        entry_fee_vnd: 50000,
        payment_status: 'paid',
        status: 'approved'
      }
    });

    assert.equal(mail.to, 'james@example.com');
    assert.match(mail.subject, /Silver Comet/);
    assert.match(mail.text, /Monday, 20 July 2026 at 16:00 GMT\+7/);
    assert.match(mail.text, /Monday, 20 July 2026 at 14:00 GMT\+7/);
    assert.match(mail.text, /Monday, 20 July 2026 at 15:15 GMT\+7/);
    assert.match(mail.text, /50,000 VND via VNPay/);
    assert.match(mail.text, /fails or misses the pre-race inspection/i);
    assert.match(mail.text, /entry fee is not refunded/i);
  } finally {
    if (previousTimezone === undefined) {
      delete process.env.APP_TIMEZONE;
    } else {
      process.env.APP_TIMEZONE = previousTimezone;
    }
  }
});

test('race registration email escapes user-controlled HTML', () => {
  const mail = emailService._private.buildRaceRegistrationConfirmationMail({
    user: {
      full_name: '<script>alert(1)</script>',
      email: 'owner@example.com'
    },
    horse: { name: '<b>Fast</b>' },
    tournament: { name: 'Demo Meeting' },
    race: { name: 'Race 1' },
    registration: { status: 'approved' }
  });

  assert.doesNotMatch(mail.html, /<script>/);
  assert.match(mail.html, /&lt;script&gt;/);
  assert.match(mail.html, /&lt;b&gt;Fast&lt;\/b&gt;/);
});
