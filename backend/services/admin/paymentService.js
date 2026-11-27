const paymentModel = require('../../models/admin/paymentModel');
const coachModel = require('../../models/admin/coachModel');

const httpError = (status, message) => Object.assign(new Error(message), { status });

const shape = r => ({
  id: r.id,
  bandBookingId: r.band_booking_id,
  amount: Number(r.amount),
  receivedAt: r.received_at,
  divided: !!r.divided_at,
  dividedAt: r.divided_at || null,
  requester: r.requester,
  bookingDate: r.booking_date,
  bookingDateLabel: r.date_label || r.booking_date,
  bookingStart: r.booking_start,
  forName: r.for_name
});

exports.list = async () => {
  const [payments, unpaid] = await Promise.all([
    paymentModel.listWithBookings(),
    paymentModel.unpaidBookings()
  ]);
  return {
    payments: payments.map(shape),
    unpaidBookings: unpaid
  };
};

exports.record = async ({ bandBookingId, amount, receivedAt }) => {
  if (!Number.isInteger(bandBookingId) || bandBookingId <= 0) throw httpError(400, 'Choose a band booking.');
  const parsed = Number(amount);
  if (!isFinite(parsed) || parsed <= 0) throw httpError(400, 'Enter a positive amount.');
  if (!receivedAt || !/^\d{4}-\d{2}-\d{2}$/.test(receivedAt)) throw httpError(400, 'Choose a valid date received.');
  const id = await paymentModel.create({ bandBookingId, amount: parsed, receivedAt });
  const row = await paymentModel.findById(id);
  return { payment: shape(row) };
};

exports.divide = async id => {
  const row = await paymentModel.findById(id);
  if (!row) throw httpError(404, 'Payment not found.');
  if (row.divided_at) throw httpError(400, 'This payment has already been divided.');

  const bandCoaches = await coachModel.listBand();
  if (!bandCoaches.length) throw httpError(400, 'No band coaches found. Turn on the Band switch for coaches first.');

  const totalCents = Math.round(Number(row.amount) * 100);
  const memberCount = bandCoaches.length;
  const base = Math.floor(totalCents / memberCount);
  const remainder = totalCents % memberCount;

  const shares = bandCoaches.map((c, i) => ({
    paymentId: id,
    coachId: c.id,
    amount: ((base + (i === 0 ? remainder : 0)) / 100).toFixed(2)
  }));

  await paymentModel.insertShares(shares);
  await paymentModel.markDivided(id);

  const updated = await paymentModel.findById(id);
  const sharesWithNames = bandCoaches.map((c, i) => ({
    coachId: c.id,
    name: c.name,
    amount: Number(shares[i].amount)
  }));

  return { payment: shape(updated), shares: sharesWithNames };
};

exports.getShares = async id => {
  const shares = await paymentModel.getShares(id);
  return shares.map(s => ({ coachId: s.coach_id, name: s.name, amount: Number(s.amount) }));
};