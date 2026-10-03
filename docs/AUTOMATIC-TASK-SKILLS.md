# Automatic Tower skills

Open the Tower, choose a floor, then select **Skills**.

Every real Tower task that passes review saves a recipe automatically: the steps planned for the work, the completion checks, writing preferences, review corrections and a link to the source result. This also covers tasks sent to the Tower from meeting follow-through, schedules, page tasks and other floors. It does not turn ordinary chats, to-dos or unfinished work into skills, and it does not retrain the underlying AI model.

By default, a recipe becomes available to future tasks when you press **Accept result**. To use recipes immediately after an agent's review passes, choose **After the agent review passes** and save the learning setting. This setting applies across all three halls. Failed reviews and owner-rejected results remain correction lessons, never active recipes. Rehearsals are excluded.

For a new task, JARVIS matches the task and desired outcome against active recipes on the same floor. It passes up to three relevant, distinct methods to the lead, workers and reviewer. It does not copy the old deliverable. Your current brief, facts, permissions and spending limits take priority. Skills do not send messages, run commands or approve work themselves.

Use **Switch off** to exclude a recipe from future tasks. Search finds older entries; use Newer/Older to browse. Learning settings and switches take effect on the next task, without changing a run already in progress. Usage and later acceptance/rework counts help you assess a recipe; they do not prove it improved the outcome.

Recipes are saved in tower.json and included in JARVIS's settings backup. They survive the 80-run history limit. Keep backing up the original work folders separately. On upgrading, eligible tasks still in History are captured once; older records may contain only step titles because their full instructions were not retained. Already discarded history cannot be recovered by this feature.

Saving a recipe makes no additional AI request. Applying it adds bounded text to the normal task prompts, so provider token costs can increase. Repeated jobs can reuse methods, but faster completion or higher quality is not guaranteed.
