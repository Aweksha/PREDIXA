// Local time on purpose: the AI backtest computes its as-of date from the machine's
// local date, and a UTC date here can land a day later and include a "future" close.
function localDateString(d) {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function realTodayString() {
  return localDateString(new Date());
}

export function virtualTodayString() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return localDateString(d);
}
