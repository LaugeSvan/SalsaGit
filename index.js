require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, ChannelType, Events } = require('discord.js');
const { Octokit } = require("@octokit/rest");
const { createAppAuth } = require("@octokit/auth-app");
const express = require('express');

// --- CONFIGURATION ---
const { 
    DISCORD_TOKEN, GUILD_ID, CATEGORY_ID,
    GITHUB_APP_ID, GITHUB_INSTALLATION_ID,
    PORT = 8080 // Default to 8080 or whatever custom port you set in .env
} = process.env;

// Load the private key from the .pem file
const privateKey = fs.readFileSync('./private-key.pem', 'utf8');

// Initialize Octokit (GitHub App)
const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
        appId: GITHUB_APP_ID,
        privateKey: privateKey,
        installationId: Number(GITHUB_INSTALLATION_ID),
    },
});

// Initialize Discord Client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const app = express();
app.use(express.json());

// --- CORE LOGIC: Check repo and create setup ---
async function processRepo(owner, repoName) {
    console.log(`🔎 Checking repo: ${repoName}...`);
    try {
        const response = await octokit.repos.getContent({
            owner,
            repo: repoName,
            path: '.discord_bot'
        });

        const content = Buffer.from(response.data.content, 'base64').toString();

        if (content.trim().toUpperCase().includes('CREATE')) {
            const guild = await client.guilds.fetch(GUILD_ID);
            const channelName = repoName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

            let channel = guild.channels.cache.find(c => c.name === channelName);
            
            // 1. Ensure Discord Channel exists
            if (!channel) {
                console.log(`🚀 Creating channel: #${channelName}`);
                channel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: CATEGORY_ID
                });
            } else {
                console.log(`ℹ️ Channel #${channelName} exists. Checking webhook...`);
            }

            // 2. Check if GitHub Webhook already exists to avoid duplicates
            const { data: hooks } = await octokit.repos.listWebhooks({ owner, repo: repoName });
            const webhookExists = hooks.some(h => h.config.url.includes('discord.com/api/webhooks'));

            if (!webhookExists) {
                console.log(`🔗 Creating missing GitHub Webhook for ${repoName}...`);
                
                // We need a Discord Webhook URL. If the channel was just created, we make one.
                // If it already existed, we try to find an existing one or make a new one.
                let discordWebhook;
                const existingWebhooks = await channel.fetchWebhooks();
                discordWebhook = existingWebhooks.find(w => w.name === 'GitHub App Notifier');

                if (!discordWebhook) {
                    discordWebhook = await channel.createWebhook({ name: 'GitHub App Notifier' });
                }

                await octokit.repos.createWebhook({
                    owner,
                    repo: repoName,
                    name: 'web',
                    config: {
                        url: `${discordWebhook.url}/github`,
                        content_type: 'json'
                    },
                    events: ['push', 'pull_request', 'issues']
                });
                console.log(`✅ GitHub Webhook linked to #${channelName}`);
            } else {
                console.log(`✅ Webhook already configured for ${repoName}`);
            }
            
            console.log(`✅ Success! Setup verified for ${repoName}`);
        }
    } catch (error) {
        if (error.status === 404) {
            console.log(`❌ No '.discord_bot' found in ${repoName}`);
        } else {
            console.error(`❌ Error in ${repoName}:`, error.message);
        }
    }
}

// --- SCANNER: Checks all accessible projects ---
async function scanExistingRepos() {
    console.log("🕵️ Beginning repository scan...");
    try {
        const { data } = await octokit.apps.listReposAccessibleToInstallation();
        for (const repo of data.repositories) {
            await processRepo(repo.owner.login, repo.name);
        }
        console.log("✨ Scan complete!");
    } catch (error) {
        console.error("❌ Could not scan repos:", error.message);
    }
}

// --- WEBHOOK RECEIVER (Real-time) ---
app.post('/salsagitwebhook', async (req, res) => {
    const event = req.headers['x-github-event'];
    const payload = req.body;

    if (event === 'push' || (event === 'repository' && payload.action === 'created')) {
        if (payload.repository) {
            await processRepo(payload.repository.owner.login, payload.repository.name);
        }
    }
    res.status(200).send('OK');
});

// --- START BOT ---
client.once(Events.ClientReady, async (c) => {
    console.log(`🤖 Bot is online! Logged in as: ${c.user.tag}`);
    await scanExistingRepos();
});

client.login(DISCORD_TOKEN);

// Listen on '0.0.0.0' to allow external connections to your server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 SalsaGit Server listening on port ${PORT}`);
});