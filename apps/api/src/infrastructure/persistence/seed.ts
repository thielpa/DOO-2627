import { MikroORM } from "@mikro-orm/postgresql";
import { AnswerOption, Category, Lobby, Match, Question } from "../../domain";
import config from "./mikro-orm.config";
import { catalog } from "./seed-catalog";

const TIME_LIMIT_MS = 10_000;

function shuffle<T>(items: T[]): T[] {
  return items
    .map((item) => ({ item, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);
}

// `--reset` replaces the catalog. Running matches point to the old questions, so they are
// deleted as well.
const shouldReset = process.argv.includes("--reset");

const orm = await MikroORM.init(config);
const em = orm.em.fork();

if (shouldReset) {
  await em.nativeDelete(Lobby, {});
  await em.nativeDelete(Match, {});
  await em.nativeDelete(Question, {});
  await em.nativeDelete(Category, {});
  console.log("Deleted lobbies, matches and the question catalog.");
}

if ((await em.count(Category)) > 0) {
  console.log("Catalog already seeded, nothing to do. Use --reset to replace it.");
} else {
  for (const { id, name, entries } of catalog) {
    em.persist(new Category(id, name));
    for (const [text, correct, ...wrong] of entries) {
      const options = shuffle([
        new AnswerOption(crypto.randomUUID(), correct, true),
        ...wrong.map((option) => new AnswerOption(crypto.randomUUID(), option, false)),
      ]);
      em.persist(new Question(crypto.randomUUID(), id, text, "EASY", TIME_LIMIT_MS, options));
    }
  }
  await em.flush();
  console.log(`Seeded ${catalog.length} categories.`);
}

await orm.close();
