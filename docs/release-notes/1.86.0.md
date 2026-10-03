## JARVIS 1.86.0: your approved updates on GitHub

## New

- **Approved self-updates go to GitHub for you.** When JARVIS installs an update that you approved in the app, he also uploads the same change to your GitHub repository as a pull request: a proposed change, waiting for you.
  - GitHub's tests run on it.
  - When they show ✅, press **Merge** on GitHub. Merging publishes the next version automatically.
  - Nothing reaches your main code before you press Merge.
- **The link comes to you.** JARVIS WhatsApps you the link, and **JARVIS Core → My updates** shows each pull request with **Open** and **Try again** buttons.
- **Setup:** add a GitHub key in **Settings → JARVIS Core → GitHub**. The page explains how to make one in about three minutes. Press **Test GitHub** to check it.

## Safety

- The key works for one repository only, is stored encrypted on your PC, and JARVIS's own self-updates cannot read it or change how he uses GitHub.
- JARVIS never writes to the main code himself.
- If your GitHub code changed the same files after the version he built on, he uploads nothing and asks you to install the latest release first.

## Install

1. Download `JARVIS-Armor-Workspace-1.86.0-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_86_0`.
