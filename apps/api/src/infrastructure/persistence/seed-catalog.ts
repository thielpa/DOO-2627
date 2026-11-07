export type Entry = [question: string, correct: string, ...wrong: [string, string, string]];

// Starter catalog for learners of German: sentences, grammar and idioms.
export const catalog: { id: string; name: string; entries: Entry[] }[] = [
  {
    id: "food",
    name: "Food & Drink",
    entries: [
      [
        'Translate: "Ich hätte gern ein Glas Wasser ohne Kohlensäure."',
        "I'd like a glass of still water.",
        "I have a glass of sparkling water.",
        "I would like a glass of water with ice.",
        "I had a glass of water without a straw.",
      ],
      ['Complete: "Kannst du mir bitte ___ Salz geben?"', "das", "die", "der", "dem"],
      [
        'What does "Das ist nicht mein Bier" really mean?',
        "That's not my problem.",
        "I don't drink beer.",
        "This beer isn't mine.",
        "I ordered something else.",
      ],
      [
        "Which sentence is correct?",
        "Wir essen heute Abend im Restaurant.",
        "Wir heute Abend essen im Restaurant.",
        "Heute Abend wir essen im Restaurant.",
        "Wir essen heute Abend im Restaurant gegessen.",
      ],
      [
        'Complete: "Der Kuchen schmeckt heute ___ als gestern."',
        "besser",
        "gut",
        "am besten",
        "guter",
      ],
      [
        'Translate: "The soup is too hot to eat."',
        "Die Suppe ist zu heiß zum Essen.",
        "Die Suppe ist so heiß für essen.",
        "Die Suppe hat zu heiß zu essen.",
        "Die Suppe ist zu warm, um sie zu kochen.",
      ],
    ],
  },
  {
    id: "travel",
    name: "Travel",
    entries: [
      ['Complete: "Wir fahren morgen ___ Berlin."', "nach", "zu", "in", "bei"],
      [
        'Complete: "Ich habe meinen Koffer im Hotel ___."',
        "vergessen",
        "vergesst",
        "vergaß",
        "vergessene",
      ],
      [
        'Translate: "Wann fährt der nächste Zug nach München ab?"',
        "When does the next train to Munich leave?",
        "Where does the next train to Munich stop?",
        "When did the last train from Munich arrive?",
        "How long does the train to Munich take?",
      ],
      [
        'What does "Ich verstehe nur Bahnhof" really mean?',
        "I don't understand a thing.",
        "I only understand the train station.",
        "I'm looking for the station.",
        "I can read the timetable.",
      ],
      ['Complete: "Entschuldigung, wie komme ich ___ Flughafen?"', "zum", "zur", "zu den", "am"],
      [
        "Which sentence is correct?",
        "Gestern sind wir ans Meer gefahren.",
        "Gestern haben wir ans Meer gefahren.",
        "Gestern wir sind ans Meer gefahren.",
        "Gestern sind wir ans Meer gefahrt.",
      ],
    ],
  },
  {
    id: "everyday",
    name: "Everyday Life",
    entries: [
      [
        'Which reply fits "Wie geht es Ihnen?" in a formal situation?',
        "Danke, gut. Und Ihnen?",
        "Danke, gut. Und dir?",
        "Mir geht's um zehn Uhr.",
        "Ich gehe nach Hause.",
      ],
      [
        'Complete so it means "I\'m looking forward to the weekend": "Ich freue mich ___ das Wochenende."',
        "auf",
        "über",
        "für",
        "an",
      ],
      [
        'Translate: "Could you speak a bit more slowly, please?"',
        "Könnten Sie bitte etwas langsamer sprechen?",
        "Können Sie bitte etwas leiser sprechen?",
        "Könnten Sie bitte langsam sprechen gewesen?",
        "Sprechen Sie bitte noch einmal?",
      ],
      [
        'What does "Ich drücke dir die Daumen!" mean?',
        "I'll keep my fingers crossed for you!",
        "I'm pressing your button!",
        "Thumbs up, well done!",
        "Hold on tight!",
      ],
      [
        'Complete: "Wenn ich Zeit ___, würde ich dich besuchen."',
        "hätte",
        "habe",
        "hatte",
        "haben",
      ],
      [
        "Which sentence is correct?",
        "Ich weiß nicht, ob er heute kommt.",
        "Ich weiß nicht, ob er kommt heute.",
        "Ich weiß nicht, ob kommt er heute.",
        "Ich nicht weiß, ob er heute kommt.",
      ],
    ],
  },
];
