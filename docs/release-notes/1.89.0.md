## JARVIS 1.89.0: he remembers, reminds and reports back

## New

- **He remembers what you tell him.** Say "Jarvis, remember I take my coffee black" or "remember no calls before 8 on Saturdays".
  - It goes into a new **Remember** section of your standing orders, and he keeps it in mind.
  - See and edit everything he remembers in **JARVIS Core → Remember**, or say "forget …".
  - **Call rules** such as "No calls before 08:00 on Saturdays", "No calls after 9pm" or "Never call me on Sundays" are obeyed for the calls he makes on his own; he WhatsApps you instead. Wake-up calls you set yourself, and calls you ask for, still ring.
- **Bills and birthdays.** He WhatsApps you a few days before (3 unless you change it) and again on the day, from 09:00 and outside quiet hours.
  - Say "Jarvis, remind me about council tax, £152, on the 6th of every month" or "Mum's birthday is 12 March".
  - Or add them in **JARVIS Core → Remember**. Bills can repeat every month, birthdays every year, or a date can be one-off.
- **Call me when it's done.** When you give a floor a task, choose **WhatsApp me when done** or **Call me when done**. You can also change it on a job that is already running, or say "Jarvis, call me when the proposal is done".
  - At night it waits and comes as a WhatsApp in the morning.
  - An assembly line tells you when its last floor finishes.
- **Night shift for your plans.** On a plan step marked JARVIS or Agents, press **🌙 Give to the agents**, choose a floor, then **Tonight** or **Start now**.
  - Between 01:00 and 05:00 the floor works on it with a full brief from your plan, using that floor's budget.
  - JARVIS wakes the PC at 01:00 for it when Windows allows.
  - In the morning the step shows **The agents' draft is ready · Open it**. You check it and tick the step done.
- **Project wall.** In the Ideas room, each project in progress is a glowing ring round the core: the ring fills as the project moves along, coloured by its stage. Click a project's name to open its plan.

## Fixed

- Schedule lines that name days in the plural, such as "08:30 Saturdays — WhatsApp me the report", ran **every** day. They now run only on those days.
- A Tower job that you continued after it stopped is announced again when it finishes.

## Install

1. Download `JARVIS-Armor-Workspace-1.89.0-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_89_0`.
