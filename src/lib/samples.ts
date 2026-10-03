// The two sample poems on the landing page. Both are safe to ship: one is an original, the other is public domain.

export interface Sample {
  id: string;
  label: string;
  attribution: string;
  title: string;
  poem: string;
}

/** An original poem written for Stanza's tests. */
const LAMP = [
  "The lamp burns low beside the door,",
  "the kettle hums a quiet tune,",
  "the rain has found the wooden floor,",
  "and somewhere far, a patient moon.",
].join("\n");

/** William Blake, "A Poison Tree", Songs of Experience, 1794 (public domain). */
const POISON_TREE = [
  "I was angry with my friend:",
  "I told my wrath, my wrath did end.",
  "I was angry with my foe:",
  "I told it not, my wrath did grow.",
  "",
  "And I water'd it in fears,",
  "Night & morning with my tears;",
  "And I sunned it with smiles,",
  "And with soft deceitful wiles.",
  "",
  "And it grew both day and night,",
  "Till it bore an apple bright.",
  "And my foe beheld it shine,",
  "And he knew that it was mine,",
  "",
  "And into my garden stole",
  "When the night had veil'd the pole;",
  "In the morning glad I see",
  "My foe outstretch'd beneath the tree.",
].join("\n");

export const SAMPLES: Sample[] = [
  { id: "lamp", label: "The Lamp", attribution: "an original", title: "", poem: LAMP },
  { id: "poison-tree", label: "A Poison Tree", attribution: "William Blake, 1794", title: "A Poison Tree", poem: POISON_TREE },
];
