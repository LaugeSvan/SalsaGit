require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, ChannelType, Events } = require('discord.js');
const { Octokit } = require("@octokit/rest");
const { createAppAuth } = require("@octokit/auth-app");
const express = require('express');
const SmeeClient = require('smee-client');

// --- KONFIGURATION ---
const { 
    DISCORD_TOKEN, GUILD_ID, CATEGORY_ID, SMEE_URL,
    GITHUB_APP_ID, GITHUB_INSTALLATION_ID,
    PORT = 3000 
} = process.env;

// Indlæs den private nøgle fra filen
const privateKey = fs.readFileSync('./private-key.pem', 'utf8');

// Initialiser Octokit (GitHub App)
const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
        appId: GITHUB_APP_ID,
        privateKey: privateKey,
        installationId: Number(GITHUB_INSTALLATION_ID),
    },
});

// Initialiser Discord Client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const app = express();
app.use(express.json());

// --- KERNEFUNKTION: Tjek repo og opret setup ---
async function processRepo(owner, repoName) {
    console.log(`🔎 Tjekker repo: ${repoName}...`);
    try {
        const response = await octokit.repos.getContent({
            owner,
            repo: repoName,
            path: '.discord_bot' // Navnet vi endte på
        });

        const content = Buffer.from(response.data.content, 'base64').toString();

        if (content.trim().toUpperCase().includes('CREATE')) {
            const guild = await client.guilds.fetch(GUILD_ID);
            const channelName = repoName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');

            // Find eksisterende kanal
            let channel = guild.channels.cache.find(c => c.name === channelName);
            
            if (!channel) {
                console.log(`🚀 Betingelse opfyldt! Opretter kanal: #${channelName}`);
                
                // 1. Opret kanal
                channel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: CATEGORY_ID
                });

                // 2. Opret Discord Webhook
                const discordWebhook = await channel.createWebhook({
                    name: 'GitHub App Notifier'
                });

                // 3. Opret GitHub Webhook (forbinder repo til den nye kanal)
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
                console.log(`✅ Succes! Setup færdigt for ${repoName}`);
            } else {
                console.log(`ℹ️ Kanal #${channelName} findes allerede. Springer over.`);
            }
        }
    } catch (error) {
        if (error.status === 404) {
            console.log(`❌ Ingen '.discord_bot' fundet i ${repoName}`);
        } else {
            console.error(`❌ Fejl i ${repoName}:`, error.message);
        }
    }
}

// --- SCANNER: Tjekker alle tilgængelige projekter ---
async function scanExistingRepos() {
    console.log("🕵️ Begynder scanning af repositories...");
    try {
        const { data } = await octokit.apps.listReposAccessibleToInstallation();
        const repositories = data.repositories;
        
        for (const repo of repositories) {
            await processRepo(repo.owner.login, repo.name);
        }
        console.log("✨ Scanning fuldført!");
    } catch (error) {
        console.error("❌ Kunne ikke scanne repos:", error.message);
    }
}

// --- WEBHOOK MODTAGER (Til push/oprettelse i realtid) ---
app.post('/webhook', async (req, res) => {
    const event = req.headers['x-github-event'];
    const payload = req.body;

    if (event === 'push' || (event === 'repository' && payload.action === 'created')) {
        if (payload.repository) {
            await processRepo(payload.repository.owner.login, payload.repository.name);
        }
    }
    res.status(200).send('OK');
});

// --- SMEE TUNNEL ---
const smee = new SmeeClient({
    source: SMEE_URL,
    target: `http://localhost:${PORT}/webhook`,
    logger: console
});
smee.start();

// --- START BOT ---
client.once(Events.ClientReady, async (c) => {
    console.log(`🤖 Bot er online! Logget ind som: ${c.user.tag}`);
    // Kør scanneren ved opstart
    await scanExistingRepos();
});

client.login(DISCORD_TOKEN);
app.listen(PORT, () => console.log(`🌐 Webhook server kører på port ${PORT}`));