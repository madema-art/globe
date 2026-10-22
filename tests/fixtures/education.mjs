export function syntheticRecord(id = 'm900001') {
  return {
    schemaVersion: 1, id, category: 'event', subjectType: 'Synthetic subject', authoredLocale: 'ja',
    clues: Array.from({ length: 5 }, (_, i) => ({ text: `仮の手がかり${i + 1}`, sourceIds: ['r1'] })),
    answer: {
      identity: '仮の回答',
      target: { kind: 'point', referenceFrame: 'WGS84', latitude: 12.25, longitude: -34.5, label: '仮の地点', modernContext: '現代の仮座標' },
      explanation: '仮の説明', sourceIds: ['r1'],
    },
    history: {
      date: { kind: 'range', label: '仮の年代', start: { year: 1500, era: 'BCE', approximate: true }, end: { year: 200, era: 'CE', approximate: false } },
      cultures: ['仮の文化'],
    },
    sources: [{ id: 'r1', url: 'https://example.invalid/reference', title: 'Synthetic reference', publisher: 'Synthetic publisher', accessedOn: '2026-10-22', notes: 'No real historical claims.' }],
    uncertainty: '仮の不確実性',
    editorial: { clueOrderReviewed: true, reviewStatus: 'source-checked-sample', notes: 'Synthetic fixture, not historical content.' },
    relatedIds: [],
    localizations: { en: {
      clues: Array.from({ length: 5 }, (_, i) => `Synthetic clue ${i + 1}`),
      identity: 'Synthetic answer', targetLabel: 'Synthetic target', modernContext: 'Modern synthetic coordinates',
      explanation: 'Synthetic educational explanation', dateLabel: 'Synthetic date range', cultures: ['Synthetic culture'], uncertainty: 'Synthetic uncertainty',
    } },
  };
}
export const syntheticLibrary = () => [syntheticRecord(), syntheticRecord('m900002')];
