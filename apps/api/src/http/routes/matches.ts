import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import type { UseCases } from "../../application";
import { playerIdOf } from "../player-id";

const badRequest = (message: string) => new HTTPException(400, { message });

const chooseCategoryBody = validator("json", (body: { categoryId?: unknown }) => {
  if (typeof body?.categoryId !== "string") throw badRequest("categoryId is required");
  return { categoryId: body.categoryId };
});

// The time needed is measured by the server, so the client only sends its choice.
const answerBody = validator("json", (body: { questionId?: unknown; optionId?: unknown }) => {
  const { questionId, optionId } = body ?? {};
  // optionId is null when the time ran out without an answer.
  if (typeof questionId !== "string" || (typeof optionId !== "string" && optionId !== null)) {
    throw badRequest("questionId and optionId are required");
  }
  return { questionId, optionId };
});

export const matchRoutes = (useCases: UseCases) =>
  new Hono()
    .get("/", async (c) => c.json(await useCases.listMyMatches.execute(playerIdOf(c))))
    .get("/:id", async (c) =>
      c.json(await useCases.getMatchView.execute(c.req.param("id"), playerIdOf(c))),
    )
    .post("/:id/category", chooseCategoryBody, async (c) => {
      const { categoryId } = c.req.valid("json");
      await useCases.chooseCategory.execute(c.req.param("id"), playerIdOf(c), categoryId);
      return c.body(null, 204);
    })
    // Reveals the next question and starts its clock; repeating it returns the same question.
    .post("/:id/questions/next", async (c) =>
      c.json(await useCases.showQuestion.execute(c.req.param("id"), playerIdOf(c))),
    )
    .post("/:id/answers", answerBody, async (c) => {
      const { questionId, optionId } = c.req.valid("json");
      return c.json(
        await useCases.answerQuestion.execute(
          c.req.param("id"),
          playerIdOf(c),
          questionId,
          optionId,
        ),
      );
    });
