## JARVIS 1.106.0: JARVIS follows your Claude chats

## New

- **Each Claude chat gets a progress card on its suit.** JARVIS reads the Claude chats on this ZenBook: the ones in the Claude app's **Code** tab, such as "WhatsApp task management system" or "La Bottega community networking app".
  - **A new chat:** a card in the hall asks **which suit it's for**. Choose the suit and click **Link it**, or **Not for a suit**, or **Later**, which asks again in six hours. He never guesses; he always asks you first.
  - **When you open that suit,** a **CLAUDE** line under "Where you were" shows the task, how far along it is, how much is left and how many questions are waiting on you. Click it for the full card:
    - a progress bar and where things stand;
    - **What's left**;
    - **Questions for you**;
    - **Next steps**;
    - **Done**.
  - **Keeping up to date:** while a chat is open, its card refreshes every ten minutes, and its suit's case in the hall shows a small **CLAUDE** badge. When the chat goes quiet, the card is brought up to date once more. **Update now** refreshes it straight away, and **Unlink** takes the chat off the suit.
- **Private by design.**
  - JARVIS reads only the words you and Claude wrote, never what the tools ran or the files they read.
  - Anything that looks like a key, a token or a password is blanked out first.
  - The cards are written with **Claude Code on your own Claude plan**, so there's no API bill. If Claude Code isn't available, your Claude key is used.
  - The chats JARVIS runs by himself in the background are skipped.

## Before it can write cards

Claude Code on this ZenBook needs signing in again: its sign-in has run out. Open a terminal (**Windows key**, type `cmd`, then **Enter**), type `claude` and press **Enter**, then type `/login` and follow the steps in your browser. Until then, a linked suit's card says so, rather than waiting for ever. JARVIS's meeting notes and the Tower use the same Claude Code, so this fixes them too.

## On the Mac mini

Click **Install now**. The Mac has no Claude chats of its own, so the cards appear on the ZenBook, where your chats are.

## Install on Windows

Click **Install now** on the banner in JARVIS, or **INSTALL JARVIS 1.106.0** in the tray menu.

Or by hand:

1. Download `JARVIS-Armor-Workspace-1.106.0-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_106_0`.
