const manilaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

exports.getManilaDateTime = (date = new Date()) => {
  const parts = Object.fromEntries(
    manilaFormatter.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    seconds: parts.second
  };
};

exports.isFutureManilaTime = (date, time, now = new Date()) => {
  const current = exports.getManilaDateTime(now);
  return `${date} ${time}:00` > `${current.date} ${current.time}:${current.seconds}`;
};

const manilaDateTimeToEpoch = dateTime => {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(dateTime || '');
  if (!match) throw new TypeError('Expected a Manila-local date and time.');
  const [, year, month, day, hour, minute, second] = match.map(Number);
  return Date.UTC(year, month - 1, day, hour - 8, minute, second);
};

exports.isWithinRescheduleCutoff = (dateTime, now = new Date()) =>
  manilaDateTimeToEpoch(dateTime) - now.getTime() <= 24 * 60 * 60 * 1000;

exports.isFutureManilaDateTime = (dateTime, now = new Date()) =>
  manilaDateTimeToEpoch(dateTime) > now.getTime();

exports.isInRescheduleReminderWindow = (dateTime, now = new Date()) => {
  const hoursUntil = manilaDateTimeToEpoch(dateTime) - now.getTime();
  return hoursUntil > 24 * 60 * 60 * 1000 && hoursUntil <= 48 * 60 * 60 * 1000;
};
