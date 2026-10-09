// Advance calendar dates in local time, keeping the clock across daylight saving changes.
function validRecurrence(value) {
  return value == null || ['daily', 'weekdays', 'weekly'].includes(value);
}
function nextOccurrence(time, recurrence, now = Date.now(), clock) {
  if (!recurrence || !validRecurrence(recurrence)) return null;
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return null;
  const hour=clock?.hour??date.getHours(), minute=clock?.minute??date.getMinutes(), second=date.getSeconds();
  date.setDate(date.getDate()+(recurrence==='weekly'?7:1));
  date.setHours(hour,minute,second,0);
  // Jump close to today first; then advance at most a week. Avoid loops over years offline.
  if (date.getTime() < now - 8*86400000) {
    const today=new Date(now);
    if (recurrence==='weekly') {
      const offset=(today.getDay()-date.getDay()+7)%7;
      date.setFullYear(today.getFullYear(),today.getMonth(),today.getDate()-offset);
    } else date.setFullYear(today.getFullYear(),today.getMonth(),today.getDate());
    date.setHours(hour,minute,second,0);
  }
  while (date.getTime()<=now || (recurrence==='weekdays' && [0,6].includes(date.getDay()))) {
    date.setDate(date.getDate()+(recurrence==='weekly'?7:1)); date.setHours(hour,minute,second,0);
  }
  return date.toISOString();
}
function validRecurrenceClock(clock) {
  return clock==null||(Number.isInteger(clock.hour)&&clock.hour>=0&&clock.hour<=23&&Number.isInteger(clock.minute)&&clock.minute>=0&&clock.minute<=59);
}
module.exports={validRecurrence,nextOccurrence,validRecurrenceClock};
