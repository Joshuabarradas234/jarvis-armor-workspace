# JARVIS Core: set-up and everyday use (version 1.80.1)

JARVIS Core is the part of JARVIS that keeps working when you are away from the PC. It can:

- **Call you.** It can give you a wake-up call, read you the overnight report at 06:00 on weekdays, or ring when something is urgent.
- **WhatsApp you.** It sends reports, the requests that need your OK, and alerts. You can reply to it like a chat.
- **Work overnight.** At 02:30 it runs the audit (Optimize): it looks for stale facts and conflicting agent rules, fixes the safe ones and asks you about the rest.
- **Review itself.** At 03:00 it checks what is not working or could work better and prepares up to two improvements.
- **Build features on request.** Say "Jarvis, add a feature: …" or WhatsApp "feature: …".
- **Handle email.** It sorts and labels your Gmail and drafts replies. **Nothing is sent without your YES.**
- **Watch your numbers.** It tells you if any of them moves more than you allow.

It **always asks you first** about anything that involves your business, other people, money, its agents' rules or its own code.

---

## 1. Install

1. Download `JARVIS-1.80.1-update.zip` from the GitHub release, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.
3. Open **Settings → JARVIS Core**. The Settings page has the same steps as below.

## 2. Set up (about 15 minutes)

| What | Where | Why |
|---|---|---|
| Your mobile number | Settings → JARVIS Core → You | Where JARVIS calls and messages you. It is kept on this PC only. Until it is saved, nothing is sent to a phone. |
| Claude API key | console.anthropic.com → API keys | JARVIS's brain. The tower uses the same key. |
| Twilio account | twilio.com/try-twilio. Verify **your mobile number** | Phone calls and WhatsApp. |
| Account SID and Auth Token | Twilio Console home page | Let JARVIS use your Twilio account. |
| A Twilio number with Voice | Phone Numbers → Buy a number | The number JARVIS calls from. |
| Geo permissions | Voice → Settings → Geo permissions → allow **United Kingdom** | Needed if the Twilio number is not a UK number. |
| WhatsApp sandbox | Messaging → Try it out → Send a WhatsApp message. From your phone, send the `join …` code to **+1 415 523 8886**. Leave "When a message comes in" empty. | Lets JARVIS WhatsApp you. |
| Gmail app password (optional) | Google Account → Security → 2-Step Verification, then App passwords → "JARVIS" | Email sorting and drafts. |
| CallMeBot (optional) | callmebot.com | A free backup route for WhatsApp messages. |

Then press **Save**, **Send a test WhatsApp** and **Test call**.

**Good to know**

- **The WhatsApp 24-hour rule.** JARVIS can message you freely only within 24 hours of your last message to him. Say **goodnight** to him on WhatsApp each evening, and the morning report will get through. If the window has closed, he tries CallMeBot, then a text message.
- **The sandbox forgets you after three days.** Twilio's test sandbox drops your number three days after you send the `join …` code. JARVIS handles this as follows:
  - He notices your `join …` message.
  - Before it lapses, he sends you a link that renews it in one tap. The link is also in the goodnight reply when the sandbox lapses within a day and a half.
  - If it does lapse, he says so on the morning call and by CallMeBot or text, and shows it in JARVIS Core.

  While it has lapsed, approvals by message wait until you rejoin. A WhatsApp sender of your own never lapses. You register one in the Twilio Console under Messaging → Senders → WhatsApp senders.
- **Twilio's free trial is not enough.** Since 2026 a trial account only sends Twilio's own sample messages and calls, so JARVIS's calls, WhatsApps and texts are refused ("trial accounts have limited parameter access"). Upgrade the account (Console → **Upgrade**, pay as you go) and add some credit. Your trial number and settings carry over. Calls and messages cost pennies each: see twilio.com/pricing.
- **Keep the PC on and plugged in** overnight. JARVIS stops Windows from sleeping while something is scheduled, but closing the lid can still put the PC to sleep.

## 3. Talking to him

| On WhatsApp | Out loud ("Jarvis, …") | What happens |
|---|---|---|
| `goodnight` | "goodnight" | He logs your bedtime and tells you when he will call. The report then covers "since you went to bed at 10:40". |
| `good morning` / `report` | "what did I miss" / "overnight report" | The overnight report. |
| `call me` | "call me" | He rings you straight away. |
| `wake me at 6:30` / `call me in 20` | "wake me up at 6:30" | Sets a wake-up call. If you don't answer, he tries again. |
| `what needs me` | "what needs me" | Lists the requests waiting for your OK. |
| `feature: …` | "add a feature …" | He builds it in a copy of himself, then asks you before installing. |
| `audit` | "run the audit" | Runs Optimize now. |
| `undo` | "undo the last update" | Goes back to the previous version of himself. |
| `quiet` | (not available by voice) | No more messages until the morning unless something is urgent. |
| `join …` (sent to the sandbox) | (not available by voice) | Renews the WhatsApp sandbox. JARVIS notes the time so he can remind you three days later. |
| anything else | "Jarvis, …" (anything else) | He answers, and uses tools where they help. |

- **Say the name for anything that changes things.** Right after JARVIS speaks, you can answer without "Jarvis" ("what needs me", "approve 12"). Undo, restart to update, call me, the audit, self-review and new features always need the name, so a stray "roll back" in the room does nothing.
- **Messages sent while JARVIS was off.** When JARVIS starts again, he reads what you sent. Anything tied to that moment, like "call me", "goodnight", "undo", "quiet", a wake-up time or a feature, is not done hours late if you sent it more than 15 minutes earlier. He tells you instead, so you can send it again.

## 4. Approving things

Requests arrive numbered, with a four-character code:

> **#12** Send the reply to Sam Carter — code **K7M3**

- `YES 12 K7M3` approves it.
- `NO 12` declines it. Declining needs no code.
- `DETAILS 12` shows everything, including every changed line of a code update, and the full text of an email reply.
- `YES ALL Q4R8` approves everything in JARVIS's **latest** message, using the code printed on it. It never covers emails or updates to his own code: each of those needs its own number and code, so you read every email before it goes.

A bare "yes" or "ok" never approves anything. The code proves you are answering the message you actually read. After 5 wrong codes in 10 minutes, approvals by message pause for 30 minutes; after 10 in a day, for a day. **Text messages (SMS) can never answer a request, not even with a no**, because a text can be faked. Use WhatsApp, voice at the PC ("Jarvis, approve 12") or **JARVIS Core → Needs you**. An update to his own code is not approved by voice: he opens its changes on the screen, and you press Approve there once you have read them.

## 5. How self-updates stay safe

1. He copies himself into a private workshop folder and makes the change there. The running app is never edited.
2. Every file is checked:
   - Protected files are untouched: the boot loader, the approvals, the update checks, the preload bridge and package.json.
   - Nothing opens a network server or tunnel.
   - Nothing adds modules that reach other machines or start programs, code built from text, or changes to window security.
   - Nothing names or reaches into the approvals or the self-update machinery, from any file.
   - Nothing loads code from outside the checked files: no hidden Windows file streams (names with ':'), full paths, web or data: addresses, or names worked out while running.
   - Every script still parses.
   - The change is small enough to read in full.
3. You approve it with its code. The approval is tied to a fingerprint of those exact changes. If anything changes before it is installed, it is not installed. Installing writes the file contents only, and records a fingerprint of every file. At every start, the boot loader checks each file against that list. A version whose files were changed afterwards is not started: JARVIS runs the version before it and tells you.
   These checks catch mistakes and slips by the AI. They are not a lock against other programs on your PC, which can change JARVIS's files whatever it does. **Reading the changes before you approve them is what keeps you in charge.**
4. He restarts into the new version when you are not using him. If the new version does not start (twice), JARVIS goes back to the previous one **by himself** and tells you.
5. You can always undo, in any of these ways:
   - Say "Jarvis, undo the last update".
   - WhatsApp `undo`.
   - Tray → **UNDO LAST SELF-UPDATE**.
   - Tray → **RESTART WITHOUT SELF-UPDATES**, which runs exactly the version you installed.

When you install a new zip from me, self-updates built on the older version are kept, but switched off. This way, an old change can't undo what the new version brings.

## 6. Standing orders

He works from the file `Documents\JARVIS\Standing orders.md`, which you can edit in Notepad or in **JARVIS Core → Schedule**. Each schedule line is plain English, for example:

```
- 06:00 weekdays — Call me with the overnight report. If I don't answer, try again twice, 5 minutes apart.
- Every 30 minutes (07:00–23:00) — Check my email: label everything and draft replies. Never send without asking.
```

Under **Facts about my business**, list anything he should know. The overnight audit checks those facts for anything stale or contradictory.

### What he remembers, bills and birthdays (1.89)

Say "Jarvis, remember …" and he writes it under **Remember** in your standing orders, so he keeps it in mind; "forget …" takes it out. Lines such as "No calls before 08:00 on Saturdays" are call rules: he WhatsApps you instead of ringing for the calls he makes on his own. Wake-up calls you set yourself still ring.

For bills, birthdays and other dates, say "remind me about …" or add them in **JARVIS Core → Remember**. He WhatsApps you a few days before and on the day, from 09:00 and outside quiet hours.

When you give the Tower a job, you can ask him to **WhatsApp** or **call** you when it is done.

### Waking the PC for calls (1.88)

If the PC is asleep, JARVIS cannot call. So he keeps one Windows task, **JARVIS wake-up**, set two minutes before his next call or message (or plan steps you gave the agents for the night). Windows wakes the PC for it, and JARVIS stays awake for a few minutes to do the job. The task is in your own account, he moves it as your schedule changes, and he removes it when you quit him. Switch it off in **Settings → JARVIS Core → Quiet hours and nights**.

Windows only does this when **Allow wake timers** is on in your power plan. The settings page shows whether it is and, if not, where to turn it on. Many laptops allow it only when plugged in.

## 7. What it does not do (yet)

- **Calls are one-way.** JARVIS speaks, then sends the same words to WhatsApp, and you answer there. To talk back on the call itself, the PC would have to accept connections from the internet, for example through a tunnel. That opening has not been made, and JARVIS may not add one himself.
- **Voice notes and pictures sent on WhatsApp** are not read yet. Type your message instead.

## Your approved updates on GitHub (1.86)

When JARVIS installs a self-update that you approved, he can also upload the same change to your GitHub repository as a **pull request**: a proposed change that waits there. Here is what happens next:

1. GitHub's **Tests** run on it, and it shows ✅ or ❌.
2. You press **Merge** on GitHub when it shows ✅. Nothing reaches the main code before that.
3. Merging raises the version number, so **Publish update** releases it automatically.

JARVIS also WhatsApps you the link. In **JARVIS Core → My updates**, each installed self-update shows its pull request, with **Open** and **Try again** buttons.

To switch it on, make a GitHub key. You only do this once:

1. On github.com, open your picture → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Name it JARVIS and choose an expiry date.
3. Under **Repository access**, choose **Only select repositories**, then pick your JARVIS repository.
4. Under **Repository permissions**, set **Contents** and **Pull requests** to **Read and write**.
5. Generate the token, then paste it into **Settings → JARVIS Core → GitHub** and press **Save**. Press **Test GitHub** to check it.

Safety:

- The key is stored encrypted on your PC.
- JARVIS's self-updates cannot change the GitHub code or read the key (`src/brain/github.js` is protected).
- He never writes to the main code himself.
- He refuses to upload a change if your GitHub code has changed the same files since the version he built on. In that case, install the latest release and he rebuilds the update.
