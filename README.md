# Here's how to use SalsaGit
SalsaGit is a powerful tool for managing your Git repositories with ease on discord. Follow the steps below to get started:

## 🛠️ Configuration Guide

### 1. Setup Discord
- Create an app at [Discord Developer Portal](https://discord.com/developers/applications).
- Enable **Server Members** and **Message Content** intents.
- Copy your **Bot Token**, **Server ID**, and **Category ID**.

### 2. Setup GitHub App
- Create an app at [GitHub App Settings](https://github.com/settings/apps).
- Set **Administration: Read/Write** and **Contents: Read-only** permissions.
- Download the `.pem` file and save it as `private-key.pem` in the project root.
- Install the app on your account and copy the **App ID** and **Installation ID**.

### 3. Setup Tunnel
- Get a proxy URL from [Smee.io](https://smee.io/).

---

## 🚀 Usage
1. Fill in your `.env` file based on the steps above. (Check `.env.example` for reference)
2. Run `npm install` and `node index.js`.
3. In any GitHub repository, create a file named `.discord_bot`.
4. Add the word `CREATE` to that file and push.
5. SalsaGit will instantly create a Discord channel and link GitHub notifications to it!

---

## 🛡️ Security
Add `*.pem` and `.env` to your `.gitignore` to protect your credentials.