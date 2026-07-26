function pick(items, hint) {
  let list = items;
  if (hint) {
    const h = list.filter((i) => (i.brand + ' ' + i.title).toLowerCase().includes(hint));
    if (h.length) list = h;
  }
  if (!list.length) return null;
  const sorted = list.slice().sort((a, b) => a.krw - b.krw);
  return sorted[Math.floor(sorted.length / 2)];
}
