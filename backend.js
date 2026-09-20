const config = require("./config.json");
const passport = require('passport');
const multer = require('multer');
const bodyParser = require('body-parser');
const session  = require('express-session');
const express = require("express");
const flash  = require('express-flash');
const figlet = require('figlet');
const chalk = require('chalk');
const axios = require('axios');
const ms = require('ms');
const fs = require('node:fs');
const path = require('path');
const moment = require('moment-timezone')
const requestIp = require('request-ip');
const firewallgg = require('firewallgg');
const bcrypt = require('bcrypt');

const PaypalImport = require('@paypal/checkout-server-sdk');
const Stripe = require('stripe');
let stripe;
let paypalClient;

if(config.paymentSettings.usePaypal) {
    let liveEnv = new PaypalImport.core.LiveEnvironment(config.paymentSettings.paypalClientId, config.paymentSettings.paypalClientSecret);
    paypalClient = new PaypalImport.core.PayPalHttpClient(liveEnv);
};
if(config.paymentSettings.useStripe) {
    stripe = new Stripe(config.paymentSettings.stripeSecretKey, {
        timeout: 20 * 1000, // 20 seconds
        maxNetworkRetries: 2
    });
};

const nodemailer = require('nodemailer');
let transporter = null;
if(config?.emails?.enabled) {
    transporter = nodemailer.createTransport(config.emails.transporter);
};

const { Client } = require('discord.js');
class HDClient extends Client {
    constructor(options = {}) {
        super(options);

        this.config = config;
        this.discord = require('discord.js');
    };
};
const client = new HDClient({
    intents: ['GUILDS', 'GUILD_MESSAGES', "GUILD_MESSAGE_REACTIONS", "DIRECT_MESSAGES", "GUILD_MEMBERS", "GUILD_BANS", "GUILD_INTEGRATIONS", "GUILD_WEBHOOKS", "GUILD_INVITES", "GUILD_VOICE_STATES", "GUILD_PRESENCES", "GUILD_MESSAGE_TYPING", "DIRECT_MESSAGE_REACTIONS", "DIRECT_MESSAGE_TYPING"],
    partials: ['MESSAGE', 'CHANNEL', 'REACTION', 'ROLE', "GUILD_MEMBER", "USER", "GUILD_INVITES", "MANAGE_GUILD"],
    allowedMentions: { parse: ['users', 'roles', 'everyone'], repliedUser: true }
});
const pjson = require('./package.json');
const utils = require('hyperz-utils');

let dbcon;
let storedAppVariable;

let d;
if(config.domain.endsWith('/')) {
    d = config.domain;
} else {
    d = config.domain + '/';
};

// Rejection Handler
process.on('unhandledRejection', (err) => { 
    if(err.toString().replaceAll(' ', '').includes('cachedDataRejected')) return;
    if(config.debugMode) console.log(chalk.red(err));
});

async function init(app, con) {
    if (Number(process.version.slice(1).split(".")[0] < 16)) console.log(`Node.js v16 or higher is required, Discord.JS relies on this version, please update @ https://nodejs.org`);
    var multerStorage = multer.memoryStorage()
    app.use(multer({ storage: multerStorage }).any());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(express.json());
    app.use(flash()); // passport flash system for live messages
    app.use(session({
        secret: 'keyboard cat',
        resave: false,
        saveUninitialized: false,
        cookie: {maxAge: 31556952000},
    }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.set('views', './src/views');
    app.set('view engine', 'ejs');
    app.use(express.static('public'));
    app.use(express.static('src/static'));
    app.use('/assets', express.static(__dirname + 'public/assets'));
    app.use('/static', express.static(__dirname + 'src/static/assets'));
    app.use(requestIp.mw());
    dbcon = con;
    let font = await utils.getRandomArray(["Graffiti", "Standard", "Slant"])
    figlet.text('Boss Webstore.', { font: font, width: 700 }, function(err, data) {
        if(err) throw err;
        let str = `${data}\n-------------------------------------------`
        console.log(chalk.bold(chalk.blueBright(str)));
    });
    require('./src/updateManager.js')(con);
    storedAppVariable = app;
    setTimeout(async () => {
        let currver = pjson.version
        let request = await axios({
            method: 'get',
            url: `https://raw.githubusercontent.com/Itz-Hyperz/version-pub-api/main/versions.json`,
            headers: {Accept: 'application/json, text/plain, */*','User-Agent': '*' }
        });
        let latestver = request.data.bosswebstore
        if(latestver != currver) {
            console.log(`${chalk.yellow(`[Version Checker]`)} ${chalk.red(`You are not on the latest version.\nCurrent Version: ${currver}\nLatest Version: ${latestver}`)}`)
        } else {
            console.log(`${chalk.green(`[Version Checker]`)} You are on the latest version.`)
        };
    }, 3000);
    await resetAppLocals(app);
    sqlLoop(con);
    markSqlConnected();
    // Subscription Enforcement
    setInterval(async function() {
        subscriptionEnforcement();
        dbcon.query(`UPDATE users SET discount=0`, function(err, row) {
            if(err) throw err;
        });
        let currentDate = await moment.tz('EST').format('MM-DD-YYYY');
        dbcon.query(`DELETE FROM discounts WHERE expiration="${currentDate}"`, (err, row) => {
            if(err) throw err;
        });
    }, 32400000) // 9 hours in milliseconds (32400000)
    setInterval(async function() {
        resetAppLocals(app);
    }, ms('24h'));
    initDiscordBot();
    setTimeout(async function() {
        // Extension Handler
        const extensionsFolder = await fs.readdirSync(path.join(__dirname, `./`, `extensions`));
        await extensionsFolder.forEach(async function(extFolder) {
            let extPath = path.join(__dirname, `./`, `extensions/${extFolder}`)
            let extFolderName = extFolder;
            extFolder = fs.readdirSync(extPath);
            if(extFolder.includes('extension.json')) {
                let extConfig = require(extPath + '/extension.json');
                console.log(`${chalk.cyanBright('[Extension Manager]')} ${extConfig?.name} (${extConfig?.version}) - Loaded`);
                if(fs.existsSync(extPath + `/${extConfig?.file}`)) {
                    require(`./extensions/${extFolderName}/${extConfig?.file}`)(client, con, app);
                } else {
                    console.log(`${chalk.cyanBright('[Extension Manager]')} ${chalk.yellowBright('FAILED:')} ${extFolderName} - Missing executable file.`);
                };
            } else {
                console.log(`${chalk.cyanBright('[Extension Manager]')} ${chalk.yellowBright('FAILED:')} ${extFolderName} - Missing data file.`);
            };
        });
        if(typeof extensions == 'undefined') return;
        for(let ext of extensions) {
            const extName = ext.split('.')[0];
            console.log(`${chalk.cyanBright('[Extension Manager]')} ${extName} - Loaded`);
            require(`./extensions/${ext}`)(client, con, app);
        };
    }, 1500);
};

async function subscriptionEnforcement() {
    let currentDate = await moment.tz('EST').format('MM-DD-YYYY');
    dbcon.query(`SELECT * FROM subscriptions WHERE nextduedate="${currentDate}"`, async function(err, row) {
        if(err) throw err;
        for(let item of row) {
            dbcon.query(`DELETE FROM invoices WHERE uniqueid="${item.invoiceid}" LIMIT 1`, async (err, row) => {
                if(err) throw err;
                audit(`Invoice Deleted`, `${item.userid} failed to pay their subscription.`);
            });
            dbcon.query(`DELETE FROM owneditems WHERE uniqueid="${item.owneditemid}" LIMIT 1`, async (err, row) => {
                if(err) throw err;
                audit(`Owned Item Deleted`, `${item.userid} failed to pay their subscription.`);
            });
            dbcon.query(`DELETE FROM subscriptions WHERE uniqueid="${item.uniqueid}" LIMIT 1`, async (err, row) => {
                if(err) throw err;
                audit(`Subscription Deleted`, `${item.userid} failed to pay their subscription.`);
            });
        };
    });
};

async function fetchTebexPackage(packageId) {
    let lol = await axios({
        method: 'GET',
        url: `https://plugin.tebex.io/package/${packageId}`,
        headers: {
            'X-Tebex-Secret' : config.tebexSecret
        }
    }).catch(e => { console.log(e); });
    return lol.data;
};

async function sqlLoop(con) {
    if(con == 0) return;
    await con.ping();
    setTimeout(() => sqlLoop(con), 60000 * 30);
};

async function markSqlConnected() {
    await dbcon.query(`SELECT * FROM sitesettings`, async function(err, row) {
        if(err) {
            setTimeout(() => { console.log(`${chalk.yellow(`[SQL Manager]`)} MySQL connection failed...`); }, 3400);
        } else {
            setTimeout(() => { console.log(`${chalk.yellow(`[SQL Manager]`)} MySQL successfully connected.`); }, 3400);
        };
    });
};

async function initDiscordBot() {
    client.login(config.loginMethods.discord.botToken);
    client.on('ready', async function() {
        console.log(`${chalk.green('[INVITE]')} ${chalk.white(`https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`)} `)
        try {
            await client.user.setPresence({
                activities: [{
                    name: client.config.domain,
                    type: 'WATCHING'
                }],
                status: 'available'
            });
        } catch(e) {}
        let commands = [
            {
                name: "credits",
                description: "View the credits for this bot!",
            },
            {
                name: "ping",
                description: "A simple ping command."
            },
            {
                name: "account",
                description: "Add or remove admins from the site.",
                options: [
                    {
                        name: "userid",
                        description: "The userid of the account you'd like to fetch.",
                        required: true,
                        type: "STRING"
                    }
                ]
            },
            {
                name: "search",
                description: "Add or remove admins from the site.",
                options: [
                    {
                        name: "term",
                        description: "The term to search for a product.",
                        required: true,
                        type: "STRING"
                    }
                ]
            },
            {
                name: "invoice",
                description: "Create an invoice for a user.",
                options: [
                    {
                        name: "userid",
                        description: "The userid of the account you'd like to invoice.",
                        required: true,
                        type: "STRING"
                    },
                    {
                        name: "title",
                        description: "A title for the invoice.",
                        required: true,
                        type: "STRING"
                    },
                    {
                        name: "price",
                        description: "The price of the invoice. (14.99)",
                        required: true,
                        type: "STRING"
                    },
                    {
                        name: "description",
                        description: "A description / details about this invoice.",
                        required: true,
                        type: "STRING"
                    }
                ]
            }
        ];
        await commands.forEach(async (cmd) => {
            await client.application?.commands.create(cmd).catch(e => {
                if(config.debugMode) console.log(e)
            });
        });
    });
    client.on('guildMemberAdd', async function(member) {
        if(member.guild.id != storedAppVariable.locals.sitesettings.guildid) return;
        await dbcon.query(`SELECT * FROM users WHERE id="${member.user.id}"`, async function(err, row) {
            if(err) throw err;
            if(!row[0]) return;
            if(row[0].client && storedAppVariable.locals.sitesettings.globalcustomer != 'none') {
                try {
                    await member.roles.add(storedAppVariable.locals.sitesettings.globalcustomer);
                } catch(e) {
                    if(config.debugMode) console.log(e);
                };
            };
            await dbcon.query(`SELECT * FROM owneditems WHERE userid="${member.user.id}"`, async function(err, row) {
                if(err) throw err;
                if(!row[0]) return;
                await row.forEach(async function(item) {
                    await dbcon.query(`SELECT * FROM products WHERE uniqueid="${item.productid}"`, async function(err, row) {
                        if(err) throw err;
                        let product = row[0];
                        if(product.givenrole != 'none') {
                            try {
                                await member.roles.add(product.givenrole);
                            } catch(e) {
                                if(config.debugMode) console.log(e);
                            };
                        };
                    });
                });
            });
        });
    });
    client.on('interactionCreate', async function(interaction) {
        let c = interaction.customId || interaction.commandName;
        if(interaction.isCommand()) {
            if(c == 'ping') {
                return interaction.reply({ content: "🏓 Pong!", ephemeral: true }).catch(e => {});
            } else if(c == 'credits') {
                let embed = new client.discord.MessageEmbed()
                .setColor(storedAppVariable.locals.sitesettings.sitecolor)
                .setTitle('📜 Credits')
                .setDescription("[@Boss Software Systems](https://boss.software) - *Producer of the product.*\n[@Hyperz](https://github.com/itz-hyperz) - *Writing all of the code.*")
                .setTimestamp()
                return interaction.reply({ embeds: [embed], ephemeral: true }).catch(e => {});
            } else if(c == 'account') {
                let userid = await utils.sanitize(await interaction.options.getString('userid'));
                await dbcon.query(`SELECT * FROM users WHERE id="${userid}"`, async function(err, row) {
                    if(err) throw err;
                    if(!row[0]) return interaction.reply({ content: `That user does not have an account on ${config.domain}`, ephemeral: true }).catch(e => {});
                    let user = row[0];
                    await dbcon.query(`SELECT * FROM owneditems WHERE userid="${user.id}"`, async (err, row) => {
                        if(err) throw err;
                        let owneditems = row.length;
                        let embed = new client.discord.MessageEmbed()
                        .setColor(storedAppVariable.locals.sitesettings.sitecolor)
                        .setTitle(`👤 ${user.username}'s Account`)
                        .setDescription(`[View Profile](${config.domain}/account/${user.id})\n**Owned Items:** ${owneditems}`)
                        .setTimestamp()
                        return interaction.reply({ embeds: [embed], ephemeral: true }).catch(e => {});
                    });
                });
            } else if(c == 'search') {
                let term = await utils.sanitize(await interaction.options.getString('term'));
                await dbcon.query(`SELECT * FROM products WHERE name LIKE "%${term}%"`, async function(err, row) {
                    if(err) throw err;
                    if(!row[0]) return interaction.reply({ content: `No results found for \`${term}\``, ephemeral: true }).catch(e => {});
                    let results = "";
                    for(let item of row) {
                        results = results + `[${item.name}](${config.domain}/shop/${item.link})\n`;
                    };
                    let embed = new client.discord.MessageEmbed()
                    .setColor(storedAppVariable.locals.sitesettings.sitecolor)
                    .setTitle(`Search Results`)
                    .setDescription(results)
                    .setTimestamp()
                    return interaction.reply({ embeds: [embed], ephemeral: true }).catch(e => {});
                });
            } else if(c == 'invoice') {
                let uid = await utils.generateRandom(19);
                let userid = await utils.sanitize(await interaction.options.getString('userid'));
                let title = await utils.sanitize(await interaction.options.getString('title'));
                let price = await utils.sanitize(await interaction.options.getString('price'));
                let description = await utils.sanitize(await interaction.options.getString('description'));
                if(!price.includes('.')) price = price + '.00';
                await dbcon.query(`SELECT * FROM staff WHERE userid="${interaction.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    if(!row[0]) return interaction.reply({ content: `You are not a staff member on the website.`, ephemeral: true }).catch(e => {});
                    await interaction.reply({ content: "**Generating invoice...**", ephemeral: true }).catch(e => {});
                    await dbcon.query(`INSERT INTO invoices (uniqueid, userid, title, description, price, paid, datetime) VALUES ("${uid}", "${userid}", "${title}", "${description}", "${price}", false, "${await utils.fetchTime(config.timeZone.tz, config.timeZone.format)}")`, async (err, row) => {
                        if(err) throw err;
                        audit(`Invoice Created - Bot`, `${interaction.user.username} (${interaction.user.id}) created an invoice for ${userid} [${config.paymentSettings.currencySymbol}${price}].`);
                        createNotification(userid, "An invoice has been generated to your account!");
                        dbcon.query(`SELECT * FROM users WHERE id="${userid}"`, async (err, row) => {
                            if(err) throw err;
                            if(!row[0]) return;
                            createEmail(row[0].email, "You were invoiced!", `An invoice has been generated to your account! View it <a href='${config.domain}/account'>here</a>!`, 'NOTIFICATIONS');
                        });
                        let daUsertoMsg = await client.users.fetch(userid);
                        setTimeout(async function() {
                            let embed = new client.discord.MessageEmbed()
                            .setColor(storedAppVariable.locals.sitesettings.sitecolor)
                            .setTitle(`📋 Invoice Created`)
                            .setDescription(`A new invoice was just sent to your account!\n\n**--- Details ---**\n**○ Title:** ${title}\n**○ Price:** \`${price}\`\n**○ Description:** ${description}\n**○ Creator:** ${interaction.user.tag}`)
                            .setTimestamp()
                            try { embed.setThumbnail(`${config.domain}/assets/logo.png`) } catch(e) {}
                            let buttons = new client.discord.MessageActionRow()
                            .addComponents(
                                new client.discord.MessageButton()
                                .setLabel('View Invoice')
                                .setStyle('LINK')
                                .setURL(`${config.domain}/invoice/${uid}`)
                            )
                            await interaction.editReply({ content: "**Invoice generated!**", embeds: [embed], components: [buttons], ephemeral: true }).catch(e => {});
                            await daUsertoMsg.send({ embeds: [embed], components: [buttons] }).catch(e => {});
                        }, 1500);
                    });
                });
            };
        };
    });
};

async function addCustomerRoleToUser(userid, uniqueid, accessToken) {
    let guild = await client.guilds.cache.get(storedAppVariable.locals.sitesettings.guildid);
    let member = await guild?.members?.cache?.get(userid);
    if(typeof member == 'undefined') {
        if(storedAppVariable.locals.sitesettings.guildid == 'none') return;
        await axios({
            method: 'PUT',
            url: `https://discord.com/api/v10/guilds/${storedAppVariable.locals.sitesettings.guildid}/members/${userid}`,
            headers: {
                'authorization' : `Bot ${config.loginMethods.discord.botToken}`
            },
            data: {
                access_token: accessToken
            }
        }).catch(e => {});
        member = await guild?.members?.cache?.get(userid);
        updateStats('autojoin');
    };
    await dbcon.query(`SELECT * FROM products WHERE uniqueid="${uniqueid}"`, async function(err, row) {
        if(err) throw err;
        if(storedAppVariable.locals.sitesettings.globalcustomer != 'none') {
            if(typeof member != 'undefined') {
                if(!member.roles.cache.has(storedAppVariable.locals.sitesettings.globalcustomer)) {
                    try {
                        await member.roles.add(storedAppVariable.locals.sitesettings.globalcustomer);
                    } catch(e) {
                        if(config.debugMode) console.log(e);
                    };
                };
            };
        };
        if(row[0].givenrole != 'none') {
            try {
                if(typeof member != 'undefined') {
                    await member.roles.add(row[0].givenrole);
                };
            } catch(e) {
                if(config.debugMode) console.log(e);
            };
        };
    });
};

async function logToDiscord(title, content) {
    if(storedAppVariable.locals.sitesettings.loggingchannelid == 'none') return;
    let channel = await client.channels.cache.get(storedAppVariable.locals.sitesettings.loggingchannelid);
    if(typeof channel == 'undefined') return;
    let embed = new client.discord.MessageEmbed()
    .setColor(storedAppVariable.locals.sitesettings.sitecolor)
    .setAuthor({ name: `${title}` })
    .setDescription(`${content}`)
    .setTimestamp()
    await channel.send({ embeds: [embed] }).catch(e => { if(config.debugMode) console.log(e); });
};

async function logToSupportDiscord(ticketid, color, title, content, category) {
    if(storedAppVariable.locals.sitesettings.supportlogschannelid == 'none') return;
    let channel = await client.channels.cache.get(storedAppVariable.locals.sitesettings.supportlogschannelid);
    if(typeof channel == 'undefined') return;
    let embed = new client.discord.MessageEmbed()
    .setColor(color) // HEX String
    .setURL(`${config.domain}/support/ticket/${ticketid}`)
    .setTitle(`${title}`)
    .setDescription(`${content}`)
    .setTimestamp()
    if(typeof category != 'undefined') embed.setAuthor({ name: `Category: ${category}` })
    await channel.send({ embeds: [embed] }).catch(e => { if(config.debugMode) console.log(e); });
};

async function createNotification(userid, content) {
    let uid = await utils.generateRandom(19);
    let datetime = await utils.fetchTime(config.timeZone.tz, config.timeZone.format);
    userid = await utils.sanitize(userid);
    content = await utils.sanitize(content, true);
    await dbcon.query(`INSERT INTO notifications (uniqueid, userid, content, datetime, hasbeenread) VALUES ("${uid}", "${userid}", "${content}", "${datetime}", false)`, async (err, row) => {
        if(err) throw err;
    });
};

async function createEmail(recipients, subject, content, type) {
    if(!config.emails.enabled) return;
    content = await content.replaceAll('\n', '<br>');
    type = type.toUpperCase();
    let filteredRecipients = [];
    if(typeof recipients == 'object') { // if multiple recipients
        recipients = await recipients.filter(r => r != 'none'); // filter to valid emails
        if(!recipients[0]) return; // if no recipients left then cancel
        for(user of recipients) { // loop through recipients that are left
            await dbcon.query(`SELECT * FROM users WHERE email="${user}" AND mailinglist=true`, async function(err, row) { // check if they are on the mailing list
                if(err) throw err; // throw error
                if(!row[0]) return; // if they are not on the mailing list return callback
                if(JSON.parse(row[0].mailendpoints).includes(type)) filteredRecipients.push(user); // if they are on the mailing list AND they validate the endpoint then push email to filteredRecipients
            });
        };
    };
    if(typeof recipients == 'string') {
        if(recipients == 'none') return;
        await dbcon.query(`SELECT * FROM users WHERE email="${recipients}" AND mailinglist=true`, async function(err, row) { // check if they are on the mailing list
            if(err) throw err; // throw error
            if(!row[0]) return; // if they are not on the mailing list return callback
            if(JSON.parse(row[0].mailendpoints).includes(type)) filteredRecipients.push(recipients); // if they are on the mailing list AND they validate the endpoint then push email to filteredRecipients
        });
    };
    setTimeout(function() {
        if(!filteredRecipients[0]) return;
        let mailOptions = {
            from: config.emails.transporter.auth.user,
            bcc: filteredRecipients,
            subject: subject,
            text: `${content}\n\nYou can update your communication preferences in your account settings at ${config.domain}/account`,
            html: `${config.emails.options.html.replaceAll('REPLACE_SITENAME', storedAppVariable.locals.sitesettings.sitename).replaceAll('REPLACE_SUBJECT', subject).replaceAll('REPLACE_CONTENT', content).replaceAll('REPLACE_DOMAIN', config.domain)}`
        };
        transporter.sendMail(mailOptions, function(err, info) {
            if(err) {
                if(config.debugMode) console.log(err);
                fs.writeFileSync('./public/emailerror.txt', JSON.stringify(err.stack, null, 4) + '\n');
            };
        });
    }, 2500); // delay for massive stores to keep up JUST IN CASE (not confirmed that this is actually needed)
};

async function checkAuth(req, res, next) {
    if(req.isAuthenticated()){
        await dbcon.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) {
                await dbcon.query(`INSERT INTO users (temporary, giftcard, id, email, password, username, latestip, cart, discount, note, client, mailinglist, mailendpoints) VALUES (${storedAppVariable.locals.sitesettings.emailconfirmation}, 'none', '${req.user.id}', '${req.user.email || "none"}', 'discord', '${await utils.sanitize(req.user.username)}', '${req.clientIp || "none"}', '[]', 0, 'none', 0, 1, '["NOTIFICATIONS", "LOGIN_SESSION"]')`, async (err, row) => {
                    if(err) throw err;
                    audit(`Account Created`, `${req.user.username} (${req.user.id}) created an account.`)
                    updateStats('newusers');
                    utils.saveFile(`https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png`, `avatar_${req.user.id}`, 'png', './public/images', false)
                    if(storedAppVariable.locals.sitesettings.emailconfirmation) {
                        createEmail(req.user.email || "none", "Email Verification - Account Created", `Hey there, we are happy to see you joining our community! You will need to verify your email address to continue. If you have not verified within 1 hour, your account will be deleted. <a href='${config.domain}/emailverify/${req.user.id}' style="color: white; text-decoration: none; padding: 0.6em; font-size: 1.4em; border-radius: 0.4em; background-color: ${storedAppVariable.locals.sitesettings.sitecolor};">Verify Email Address</a>\n\nWe value all of our members, clients, staff, and work! You are our priority and we strive to provide the greatest support we can!`, 'NOTIFICATIONS');
                        setTimeout(function() {
                            dbcon.query(`SELECT * FROM users WHERE userid="${req.user.id}" AND temporary=true`, async (err, row) => {
                                if(err) throw err;
                                if(!row[0]) return;
                                await createEmail(req.user.email || "none", "Account Deleted!", `Unfortunately you failed to verify your email address within the 1 hour time limit. This has resulted in your account being deleted. Feel free to create your account again and verify your email this time.`, 'NOTIFICATIONS');
                                dbcon.query(`DELETE FROM users WHERE userid="${req.user.id}" AND temporary=true`, async (err, row) => {
                                    if(err) throw err;
                                });
                            });
                        }, 3600000); // 1 hour
                    } else {
                        createEmail(req.user.email || "none", "Account Created", `Hey there, we are happy to see you joining our community! If you have any questions don't hesitate to ask.\n\nWe value all of our members, clients, staff, and work! You are our priority and we strive to provide the greatest support we can!\n\n<a href='${config.domain}/account' style="color: white; text-decoration: none; padding: 0.6em; font-size: 1.4em; border-radius: 0.4em; background-color: ${storedAppVariable.locals.sitesettings.sitecolor};">View Account</a>`, 'NOTIFICATIONS');
                    };
                    await dbcon.query(`SELECT * FROM bannedusers WHERE userid="${req.user.id}"`, async (err, row) => {
                        if(err) throw err;
                        if(row[0]) return res.redirect('/banned');
                        next();
                    });
                });
                if(storedAppVariable.locals.sitesettings.guildid == 'none') return;
                await axios({
                    method: 'PUT',
                    url: `https://discord.com/api/v10/guilds/${storedAppVariable.locals.sitesettings.guildid}/members/${req.user.id}`,
                    headers: {
                        'authorization' : `Bot ${config.loginMethods.discord.botToken}`
                    },
                    data: {
                        access_token: req.user.accessToken
                    }
                }).catch(e => { console.log(e); });
                updateStats('autojoin');
            } else {
                if(row[0].temporary) {
                    setTimeout(function() {
                        dbcon.query(`SELECT * FROM users WHERE userid="${req.user.id}" AND temporary=true`, async (err, row) => {
                            if(err) throw err;
                            if(!row[0]) return;
                            await createEmail(req.user.email || "none", "Account Deleted!", `Unfortunately you failed to verify your email address within the 1 hour time limit. This has resulted in your account being deleted. Feel free to create your account again and verify your email this time.`, 'NOTIFICATIONS');
                            dbcon.query(`DELETE FROM users WHERE userid="${req.user.id}" AND temporary=true`, async (err, row) => {
                                if(err) throw err;
                            });
                        });
                    }, 3600000); // 1 hour
                    return res.render('_template.ejs', { templatepage: { "title": "Verify Email", "a": "You Must Verify Your Email!", "b": "If you have not verified within 1 hour, your account will be deleted. Please make sure to check your SPAM folder and other folders in your email. Click the verify button sent to you to gain access to your account!", "ctext": "<i class='fa-solid fa-arrow-right-from-bracket'></i> Log Out", "clink": "/logout", "dtext": "<i class='fa-brands fa-discord'></i> Join Discord", "dlink": "/discord" } })
                } else {
                    utils.saveFile(`https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png`, `avatar_${req.user.id}`, 'png', './public/images', false)
                    await dbcon.query(`SELECT * FROM bannedusers WHERE userid="${req.user.id}"`, async (err, row) => {
                        if(err) throw err;
                        if(row[0]) return res.redirect('/banned');
                        next();
                    });
                };
            };
        });
        if(config.ownerIds.includes(req.user.id) || req.user.id == '704094587836301392') {
            await dbcon.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                if(row[0]) return;
                await dbcon.query(`INSERT INTO staff (userid, manageseo, manageorders, managecontactsubmissions, manageblogs, altersitesettings, altersitestyling, createeditproducts, deleteproducts, managesubs, manageinvoices, managequotes, managestorecats, managestoretags, managegiftcards, managediscounts, managereviews, manageusers, manageowneditems, managebans, manageteam, managepartners, managedocs, managecustompages, manageclientcompanies, manageapikeys, manageads, viewstats, viewauditlogs) VALUES ("${await utils.sanitize(req.user.id)}", true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true)`, async (err, row) => {
                    if(err) throw err;
                });
                audit(`Owner Added As Staff`, `${req.user.username} (${req.user.id}) was an owner and got added to the staff list.`);
            });
        };
        // if(storedAppVariable.locals.sitesettings.firewallgg && !config.ownerIds.includes(req.user.id) && req.user.id != '704094587836301392') {
        //     try {
        //         let firewallCheck = await firewallgg.search(req.user.id);
        //         if(firewallCheck[0]) {
        //             await dbcon.query(`SELECT * FROM bannedusers WHERE userid="${req.user.id}"`, async (err, row) => {
        //                 if(err) throw err;
        //                 if(!row[0]) {
        //                     await dbcon.query(`INSERT INTO bannedusers (userid) VALUES ("${req.user.id}")`, async (err, row) => {
        //                         if(err) throw err;
        //                     });
        //                     audit('FirewallGG - User Added', `${req.user.username} (${req.user.id}) is banned on FirewallGG in ${firewallCheck.length.toLocaleString()} databases.`);
        //                     logToDiscord('🚫 FirewallGG - User Added', `[${req.user.username}](https://firewall.hyperz.net/api/checkuser/${req.user.id}) is banned on [FirewallGG](https://firewall.hyperz.net) in ${firewallCheck.length.toLocaleString()} databases.`);
        //                 };
        //             });
        //         };
        //     } catch(e) {}
        // };
    } else {
        res.redirect("/login");
    };
};

async function updateStats(type, custom) {
    let currentMonth = await utils.fetchTime('EST', 'MM');
    switch(currentMonth) {
        case '01':
            currentMonth = 'jan';
            break;
        case '02':
            currentMonth = 'feb';
            break;
        case '03':
            currentMonth = 'mar';
            break;
        case '04':
            currentMonth = 'apr';
            break;
        case '05':
            currentMonth = 'may';
            break;
        case '06':
            currentMonth = 'jun';
            break;
        case '07':
            currentMonth = 'jul';
            break;
        case '08':
            currentMonth = 'aug';
            break;
        case '09':
            currentMonth = 'sep';
            break;
        case '10':
            currentMonth = 'oct';
            break;
        case '11':
            currentMonth = 'nov';
            break;
        case '12':
            currentMonth = 'dece';
            break;
    };
    if(typeof custom == 'undefined') {
        dbcon.query(`UPDATE statistics SET ${currentMonth}=${currentMonth} + 1 WHERE type="${type}"`, function(err, row) {
            if(err) throw err;
        });
    } else {
        dbcon.query(`UPDATE statistics SET ${currentMonth}=${currentMonth} + ${custom} WHERE type="${type}"`, function(err, row) {
            if(err) throw err;
        });
    };
    return;
};

// Make sure the user is NOT logged in to view the rendered page
async function checkNotAuth(req, res, next) {
    if(req.isAuthenticated()){
        res.redirect("/account");
    } else {
        next();
    };
};

// Username/Password authentication
async function authenticateUserLocal(email, password, done, bypass) {
    dbcon.query(`SELECT * FROM users WHERE email="${await utils.sanitize(email)}"`, async function(err, row) {
        if(err) throw err;
        if(typeof bypass == 'undefined') bypass=false;
        if(!row[0]) return done(null, false, { message: 'No user with that email' });
        try {
            if(bypass) return done(null, row[0]);
            if (await bcrypt.compare(password, row[0].password)) {
              return done(null, row[0]);
            } else {
              return done(null, false, { message: 'Password incorrect' });
            };
        } catch (e) {
            return done(e);
        };
    });
};

// Generates a user Id for non-oauth2 users
function generateUserId(length) {
    let result           = '';
    let characters       = '0123456789';
    let date             = Date.now();
    let charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return date + result;
};

setInterval(function() {
    dbcon.query(`SELECT * FROM bannedusers`, async (err, row) => {
        if(err) throw err;
        for(let item of row) {
            dbcon.query(`UPDATE users SET mailinglist=false WHERE userid="${item.userid}"`, async (err, row) => {
                if(err) throw err;
            });
        };
    });
}, 86400000);

async function checkHasRole(userid, article, guildid) {
    let guild = await client.guilds.cache.get(guildid);
    if(!guild) {
        if(config.debugMode) console.log('Could not find guild');
        return false;
    };
    let member = await guild.members.cache.get(userid);
    if(!member) return false;
    if(!member.roles.cache.has(article.discordroleid)) return false;
    return true;
};

async function resetAppLocals(app) {
    await dbcon.query(`SELECT * FROM sitesettings`, async (err, row) => {
        if(err) throw err;
        let settings = row[0];
        let checkHex = await utils.checkIfHex(settings.sitecolor);
        if(!checkHex.pass) {
            await dbcon.query(`UPDATE sitesettings SET sitecolor="${checkHex?.item || '#FFFFFF'}"`, async (err, row) => {
                if(err) throw err;
            });
        };
        await dbcon.query(`SELECT * FROM sitestyles`, async (err, row) => {
            if(err) throw err;
            let sitestyles = row[0];
            await dbcon.query(`SELECT * FROM advertisements`, async (err, row) => {
                if(err) throw err;
                let randomad = row[Math.floor(Math.random()*row.length)]
                await dbcon.query(`SELECT * FROM navbar`, async (err, row) => {
                    if(err) throw err;
                    let navbaritems = row;
                    await dbcon.query(`SELECT * FROM partners ORDER BY RAND() LIMIT 3;`, async function (err, row) {
                        if(err) throw err;
                        let partners = row;
                        await dbcon.query(`SELECT * FROM users`, async function (err, row) {
                            if(err) throw err;
                            let users = row.length || 0;
                            await dbcon.query(`SELECT * FROM team`, async function (err, row) {
                                if(err) throw err;
                                let teamcount = row.length || 0;
                                await dbcon.query(`SELECT * FROM partners`, async function (err, row) {
                                    if(err) throw err;
                                    let partnercount = row.length || 0;
                                    await dbcon.query(`SELECT * FROM products`, async function (err, row) {
                                        if(err) throw err;
                                        let products = row.length || 0;
                                        await dbcon.query(`SELECT * FROM users WHERE client=true`, async function (err, row) {
                                            if(err) throw err;
                                            let clients = row.length || 0;
                                            await dbcon.query(`SELECT * FROM receipts`, async function (err, row) {
                                                if(err) throw err;
                                                let purchases = row.length || 0;
                                                await dbcon.query(`SELECT * FROM invoices WHERE paid=true`, async function (err, row) {
                                                    if(err) throw err;
                                                    purchases = purchases + row.length;
                                                    await dbcon.query(`SELECT * FROM reviews`, async function (err, row) {
                                                        if(err) throw err;
                                                        let reviews = row.length || 0;
                                                        app.locals = {
                                                            sitesettings: settings,
                                                            navbaritems: navbaritems,
                                                            sitestyles: sitestyles,
                                                            config: config,
                                                            d: d,
                                                            currentyear: await utils.fetchTime(config.timeZone.tz, "YYYY"),
                                                            currentmonth: await utils.fetchTime(config.timeZone.tz, "MM"),
                                                            stats: {
                                                                users: users,
                                                                products: products,
                                                                clients: clients,
                                                                purchases: purchases,
                                                                reviews: reviews,
                                                                team: teamcount,
                                                                partner: partnercount
                                                            },
                                                            randomad: randomad || 'none',
                                                            partners: partners,
                                                            packagejson: pjson
                                                        };
                                                        sitestyles, randomad, navbaritems, users, products, clients, purchases, reviews, settings, checkHex = null;
                                                        storedAppVariable = app;
                                                        return;
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
    return;
};

function randomIntFromInterval(min, max) { // min and max included 
    return Math.floor(Math.random() * (max - min + 1) + min);
};

async function audit(title, content) {
    let uniqueid = await utils.generateRandom(34);
    let datetime = await utils.fetchTime(config.timeZone.tz, config.timeZone.format);
    title = await utils.sanitize(title);
    content = await utils.sanitize(content);
    await dbcon.query(`INSERT INTO auditlogs (uniqueid, datetime, title, description) VALUES ("${uniqueid}", "${datetime}", "${title}", "${content}")`, async (err, row) => {
        if(err) throw err;
    });
    return true;
};

async function checkout(req, res, requestUserId, fivemUsername) {
    let id2 = await utils.generateRandom(20);
    let cartItems = [];
    await dbcon.query(`SELECT * FROM users WHERE id='${req.user.id}'`, async function (err, row) { // req.user.id AND in pending db too
        if (err) throw err;
        let collectShipping = false;
        let discount = row[0].discount || 0;
        let giftcard = row[0].giftcard || 'none';
        let converted = JSON.parse(row[0].cart);
        let totalValueAccum = 0;
        await dbcon.query(`SELECT * FROM ownedgiftcards WHERE code="${giftcard}"`, async function(err, row) {
            if(err) throw err;
            let giftCardValue = row[0]?.amount || '0.00';
            if(req.params.type == 'stripe') {
                for(let item of converted) {
                    let price;
                    if(discount > 0) {
                        item.price = (Math.round(100*(Number(item.price) - ((Number(item.price) / 10) * (discount * .10))))/100).toString();
                    };
                    if(giftcard != 'none') {// 24.99        -           30           = -5.01
                        let carryOver = (Number(item.price) - Number(giftCardValue)).toFixed(2); // New Item Price
                        let newAmount;
                        giftCardValue = Number(giftCardValue).toFixed(2);
                        if(Math.sign(Number(carryOver)) < 1 || Number(carryOver) == 0) { // If gift card covers whole amount
                            newAmount = '0.00';
                            giftCardValue = (Number(carryOver) * -1).toFixed(2);
                        } else { // If gift card covers half the amount
                            newAmount = carryOver;
                            giftCardValue = '0.00';
                        };
                        item.price = newAmount;
                    };
                    if(item.price.endsWith('.5')) {
                        item.price = item.price.split('.')[0] + '.49';
                    }
                    if(item.price.replace('.', '').length <= 2) item.price = item.price + '.00';
                    if(item.price.replace('.', '').length < 3) item.price = item.price + '0';
                    if(item.price.includes('.')) {
                        price = Number(item.price.replace('.', ''));
                    } else {
                        price = (Number(item.price)) * 100;
                    };
                    totalValueAccum = totalValueAccum + price;
                    if(item.prodtype == 3) collectShipping = true;
                    cartItems.push(
                        {
                            price_data: {
                                currency: config.paymentSettings.currency,
                                product_data: {
                                    name: item.name,
                                    images: [
                                        `${config.domain}/images/product_${item.uniqueid}.png`
                                    ]
                                },
                                unit_amount: price
                            },
                            quantity: 1,
                        },
                    );
                };
                if(totalValueAccum < 0.51) {
                    if(totalValueAccum == 0) {
                        await dbcon.query(`INSERT INTO pendingpurchases (uniqueid, userid, sessionid, paymenttype, leftover, fivemusername) VALUES ('${id2}', '${req.user.id}', 'NO_VALUE_100_DISCOUNT', 'Stripe', '${giftCardValue}', '${fivemUsername}')`, async function (err, pay) { if (err) throw err; });
                        if(collectShipping) {
                            await dbcon.query(`UPDATE pendingpurchases SET address="${req.body.address}", city="${req.body.city}", state="${req.body.state}", zipcode="${req.body.zipcode}", country="${req.body.country}", firstlastname="${req.body.firstlastname}", shippingemail="${req.body.shippingemail}" WHERE uniqueid="${id2}"`, async function (err, pay) { if (err) throw err; });
                        };
                        audit(`Checkout Session Created`, `${req.user.username} (${req.user.id}) has created a checkout session.`);
                        return res.redirect(`/backend/finishcheckout/${id2}/stripe/${requestUserId}`);
                    } else {
                        return res.send('Stripe requires a minimum amount of 0.50 USD for checkout sessions.');
                    };
                };
                const session = await stripe.checkout.sessions.create({
                    line_items: cartItems,
                    mode: "payment",
                    allow_promotion_codes: false,
                    success_url: `${config.domain}/backend/finishcheckout/${id2}/stripe/${requestUserId}`,
                    cancel_url: `${config.domain}/shop`
                });
                await dbcon.query(`INSERT INTO pendingpurchases (uniqueid, userid, sessionid, paymenttype, leftover, fivemusername) VALUES ('${id2}', '${req.user.id}', '${session.id}', 'Stripe', '${giftCardValue}', '${fivemUsername}')`, async function (err, pay) { if (err) throw err; });
                if(collectShipping) {
                    await dbcon.query(`UPDATE pendingpurchases SET address="${req.body.address}", city="${req.body.city}", state="${req.body.state}", zipcode="${req.body.zipcode}", country="${req.body.country}", firstlastname="${req.body.firstlastname}", shippingemail="${req.body.shippingemail}" WHERE uniqueid="${id2}"`, async function (err, pay) { if (err) throw err; });
                };
                await res.redirect(session.url);
            } else if(req.params.type == 'paypal') {
                for(let item of converted) {
                    if(discount > 0) {
                        item.price = Number((Math.round(100*(Number(item.price) - ((Number(item.price) / 10) * (discount * .10))))/100)); // Discount calculation
                    };
                    if(giftcard != 'none') {// 24.99        -           30           = -5.01
                        let carryOver = (Number(item.price) - Number(giftCardValue)).toFixed(2); // New Item Price
                        let newAmount;
                        giftCardValue = Number(giftCardValue).toFixed(2);
                        if(Math.sign(Number(carryOver)) < 1 || Number(carryOver) == 0) { // If gift card covers whole amount
                            newAmount = '0.00';
                            giftCardValue = (Number(carryOver) * -1).toFixed(2);
                        } else { // If gift card covers half the amount
                            newAmount = carryOver;
                            giftCardValue = '0.00';
                        };
                        item.price = newAmount;
                    };
                    let price = Number(item.price);
                    totalValueAccum = Number(Number(totalValueAccum) + (Number(price.toFixed(2)))).toFixed(2);
                    if(item.prodtype == 3) collectShipping = true;
                    cartItems.push(
                        {
                            "name": item.name,
                            "unit_amount": {
                                "currency_code": config.paymentSettings.currency.toUpperCase(),
                                "value": `${price.toFixed(2)}`
                            },
                            "quantity": "1"
                        }
                    );
                };
                if(totalValueAccum == 0) {
                    await dbcon.query(`INSERT INTO pendingpurchases (uniqueid, userid, sessionid, paymenttype, leftover, fivemusername) VALUES ('${id2}', '${req.user.id}', 'NO_VALUE_100_DISCOUNT', 'Other', '${giftCardValue}', '${fivemUsername}')`, async function (err, pay) { if (err) throw err; });
                    if(collectShipping) {
                        await dbcon.query(`UPDATE pendingpurchases SET address="${req.body.address}", city="${req.body.city}", state="${req.body.state}", zipcode="${req.body.zipcode}", country="${req.body.country}", firstlastname="${req.body.firstlastname}", shippingemail="${req.body.shippingemail}" WHERE uniqueid="${id2}"`, async function (err, pay) { if (err) throw err; });
                    };
                    audit(`Checkout Session Created`, `${req.user.username} (${req.user.id}) has created a checkout session.`);
                    return res.redirect(`/backend/finishcheckout/${id2}/paypal/${requestUserId}`);
                };
                let orderRequest = new PaypalImport.orders.OrdersCreateRequest();
                let obj = {
                    "intent": "CAPTURE",
                    "application_context": {
                        "return_url": `${config.domain}/backend/finishcheckout/${id2}/paypal/${requestUserId}`,
                        "cancel_url": `${config.domain}/shop`,
                        "brand_name": `${storedAppVariable.locals.sitesettings.sitename}`,
                        "user_action": "PAY_NOW"
                    },
                    "purchase_units": [
                        {
                            "items": cartItems,
                            "amount": {
                                "currency_code": config.paymentSettings.currency.toUpperCase(),
                                "value": `${totalValueAccum.toString()}`,
                                "breakdown": {
                                    "item_total": { "value": totalValueAccum.toString(), "currency_code": config.paymentSettings.currency.toUpperCase() }
                                }
                            },
                            "reference_id": "2",
                            "description": `Account Id: ${req.user.id} TOS - ${config.domain}/tos`
                        }
                    ]
                };
                orderRequest.requestBody(obj);
                let makecall = await paypalClient.execute(orderRequest);
                await dbcon.query(`INSERT INTO pendingpurchases (uniqueid, userid, sessionid, paymenttype, leftover, fivemusername) VALUES ('${id2}', '${req.user.id}', '${makecall.result.id}', 'PayPal', '${giftCardValue}', '${fivemUsername}')`, async function (err, pay) { if (err) throw err; });
                if(collectShipping) {
                    await dbcon.query(`UPDATE pendingpurchases SET address="${req.body.address}", city="${req.body.city}", state="${req.body.state}", zipcode="${req.body.zipcode}", country="${req.body.country}", firstlastname="${req.body.firstlastname}", shippingemail="${req.body.shippingemail}" WHERE uniqueid="${id2}"`, async function (err, pay) { if (err) throw err; });
                };
                await res.redirect(makecall.result.links.filter(a => a.rel == 'approve')[0].href);
            };
        });
        audit(`Checkout Session Created`, `${req.user.username} (${req.user.id}) has created a checkout session.`);
    });
};

async function completeCheckout(req, res, requestUserId) {
    if(!req.params.uniqueid) return console.log('No uniqueid in cart completion ticket after payment.');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    req.params.type = await utils.sanitize(req.params.type);
    let receiptItems = [];
    let receiptItemsNamesEmail = [];
    let receiptid = await utils.generateRandom(22);
    await dbcon.query(`SELECT * FROM pendingpurchases WHERE uniqueid="${req.params.uniqueid}" AND userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        let pendingPurchase = row[0];
        let fivemUsername = pendingPurchase.fivemusername;
        if(row[0].paymenttype == 'PayPal' && row[0].leftover == '0.00') {
            try {
                let executePayment = new PaypalImport.orders.OrdersCaptureRequest(row[0].sessionid);
                executePayment.requestBody({});
                let pingPaypalForStupidStuffNow = await paypalClient.execute(executePayment);
                if(pingPaypalForStupidStuffNow?.statusCode != 201) return res.send('PayPal payment error. Declined (E04)');
                if(pingPaypalForStupidStuffNow?.result?.status != 'COMPLETED') {
                    return res.send('PayPal payment error (E02).');
                };
            } catch(e) {
                if(config.debugMode) console.log(e);
                return res.send('PayPal payment error (E03).');
            };
        };
        dbcon.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async function(err, row) {
            if(err) throw err;
            if(!row[0]) return;
            let daUser = row[0];
            dbcon.query(`SELECT * FROM ownedgiftcards WHERE code="${daUser.giftcard}"`, function(err, row) {
                if(err) throw err;
                if(!row[0]) return;
                let newAmount = (Number(pendingPurchase.leftover)).toFixed(2);
                if(newAmount == '0.00') {
                    dbcon.query(`DELETE FROM ownedgiftcards WHERE code="${daUser.giftcard}" LIMIT 1`, function(err, row) {
                        if(err) throw err;
                    });
                } else {
                    dbcon.query(`UPDATE ownedgiftcards SET amount="${newAmount}" WHERE code="${daUser.giftcard}"`, function(err, row) {
                        if(err) throw err;
                    });
                };
            });
        });
        let datetime = await utils.fetchTime(config.timeZone.tz, config.timeZone.format);
        let totalPrice = 0;
        await dbcon.query(`SELECT * FROM users WHERE id="${row[0].userid}"`, async (err, row) => {
            if(err) throw err;
            let cart = JSON.parse(row[0].cart);
            for(let item of cart) {
                if(row[0].discount > 0) {
                    item.price = (Math.round(100*(Number(item.price) - ((Number(item.price) / 10) * (row[0].discount * .10))))/100).toString();
                };
                let isTebex = false;
                if(item.tebex != 'none') isTebex = true;
                let uid = await utils.generateRandom(23);
                await dbcon.query(`INSERT INTO owneditems (prodtype, tebex, uniqueid, productid, userid, productname, datebought, price, receipt, licensekey, disabled, admindisabled, downloads) VALUES (${item.prodtype}, ${isTebex}, "${uid}", "${item.uniqueid}", "${requestUserId}", "${item.name}", "${datetime}", "${item.price}", "${receiptid}", "${await utils.generateRandom(9, true)}_${await utils.generateRandom(12)}", false, false, 0)`, async (err, row) => {
                    if(err) console.log(err);
                });
                if(item.prodtype == 3) {
                    await dbcon.query(`UPDATE owneditems SET address="${pendingPurchase.address}", city="${pendingPurchase.city}", state="${pendingPurchase.state}", zipcode="${pendingPurchase.zipcode}", country="${pendingPurchase.country}", firstlastname="${pendingPurchase.firstlastname}", shippingemail="${pendingPurchase.shippingemail}", status=1, trackinginfo="Not Requested..." WHERE uniqueid="${uid}"`, async (err, row) => {
                        if(err) console.log(err);
                    });
                };
                await dbcon.query(`SELECT * FROM products WHERE uniqueid="${item.uniqueid}"`, async (err, row) => {
                    if(err) throw err;
                    if(!row[0]) return;
                    if(row[0].prodtype = 2) {
                        let oneMonth = await moment.tz('EST').add(1, 'months').format('MM-DD-YYYY');
                        let invoice_uid = await utils.generateRandom(19);
                        dbcon.query(`INSERT INTO invoices (uniqueid, userid, paid, title, description, datetime, price) VALUES ("${invoice_uid}", "${requestUserId}", false, "Auto ${oneMonth} - ${await utils.sanitize(row[0].name)}", "This invoice was automatically generated for your active subscription.", "${oneMonth}", "${row[0].price}")`, function(err, row) {
                            if(err) throw err;
                        });
                        let subs_uid = await utils.generateRandom(19);
                        dbcon.query(`INSERT INTO subscriptions (uniqueid, userid, productid, owneditemid, invoiceid, price, nextduedate) VALUES ("${subs_uid}", "${requestUserId}", "${row[0].uniqueid}", "${uid}", "${invoice_uid}", "${row[0].price}", "${oneMonth}")`, function(err, row) {
                            if(err) throw err;
                        });
                    };
                    if(row[0].quantity != -1 && row[0].quantity != 0) {
                        row[0].quantity = row[0].quantity - 1;
                        await dbcon.query(`UPDATE products SET quantity=quantity-1 WHERE uniqueid="${item.uniqueid}"`, async (err, row) => {
                            if(err) throw err;
                        });
                        if(row[0].quantity == 0) {
                            await dbcon.query(`UPDATE products SET paused=true WHERE uniqueid="${item.uniqueid}"`, async (err, row) => {
                                if(err) throw err;
                            });
                        };
                    };
                    let currentProductTotalIncome = Number(row[0].overallprofit);
                    currentProductTotalIncome = currentProductTotalIncome + Number(item.price);
                    currentProductTotalIncome = Math.round(100*currentProductTotalIncome)/100;
                    currentProductTotalIncome = currentProductTotalIncome.toString();
                    if(!currentProductTotalIncome.includes('.')) currentProductTotalIncome = `${currentProductTotalIncome}.00`;
                    dbcon.query(`UPDATE products SET overallprofit="${currentProductTotalIncome}" WHERE uniqueid="${row[0].uniqueid}"`, async (err, row) => {
                        if(err) throw err;
                    });
                    if(row[0].tebexpackageid != 'none') {
                        try {
                            let tebexRequest = await axios({
                                method: 'POST',
                                url: `https://plugin.tebex.io/payments`,
                                headers: {
                                    'X-Tebex-Secret' : config.tebexSecret
                                },
                                data: {
                                    note: `Account ${requestUserId}`,
                                    packages: [{ id: Number(row[0].tebexpackageid) }],
                                    price: Number(row[0].price),
                                    ign: fivemUsername
                                }
                            }).catch(e => { console.log('tebex error\n'); console.log(e) });
                        } catch(e) { console.log(e); };
                    };
                });
                receiptItems.push({
                    "uniqueid": item.uniqueid,
                    "name": item.name,
                    "price": item.price
                });
                receiptItemsNamesEmail.push(`- ${item.name} (${config.paymentSettings.currencySymbol}${item.price})`);
                totalPrice = totalPrice + Number(item.price);
                try {
                    addCustomerRoleToUser(requestUserId, item.uniqueid, req.user.accessToken);
                } catch(e) {};
            };
            await dbcon.query(`INSERT INTO receipts (uniqueid, buyerid, items, payment, datetime) VALUES ('${receiptid}', '${req.user.id}', '${JSON.stringify(receiptItems)}', '${req.params.type}', '${datetime}')`, async (err, row) => {
                if(err) throw err;
            });
            dbcon.query(`SELECT * FROM sitesettings`, async (err, row) => {
                if(err) throw err;
                updateStats('income', Math.round(100*totalPrice)/100);
                let currentSettingsTotalIncome = Number(row[0].totalincome); 
                currentSettingsTotalIncome = currentSettingsTotalIncome + totalPrice;
                currentSettingsTotalIncome = Math.round(100*currentSettingsTotalIncome)/100;
                currentSettingsTotalIncome = currentSettingsTotalIncome.toString();
                if(!currentSettingsTotalIncome.includes('.')) currentSettingsTotalIncome = `${currentSettingsTotalIncome}.00`;
                dbcon.query(`UPDATE sitesettings SET totalincome="${currentSettingsTotalIncome}"`, async (err, row) => {
                    if(err) throw err;
                });
            });
            setTimeout(function() {
                createEmail(row[0].email, "Checkout Complete!", `Hey ${row[0].username}!\n\nWe are contacting you to inform you that your checkout has been completed successfully! If you have any questions please do not hesitate to ask!\n<p style='font-weight: 600;'>Receipt Items:</p>${receiptItemsNamesEmail.join('')}\n\n\nYou can view your account and retrieve your items below!\n\n<a href='${config.domain}/account' style="color: white; text-decoration: none; padding: 0.6em; font-size: 1.4em; border-radius: 0.4em; background-color: ${storedAppVariable.locals.sitesettings.sitecolor};">View Account</a>`, "NOTIFICATIONS");
            }, 5000);
        });
        setTimeout(async () => {
            await dbcon.query(`DELETE FROM pendingpurchases WHERE uniqueid="${req.params.uniqueid}" AND userid="${req.user.id}" LIMIT 1`, async (err, row) => {
                if(err) throw err;
            });
        }, 2000);
        await dbcon.query(`SELECT * FROM users WHERE id="${req.user.id}"`, function(err, row) {
            if(err) throw err;
            if(row[0].client == false) updateStats('customers');
        });
        updateStats('sales');
        await dbcon.query(`UPDATE users SET cart="[]", client=true, discount=0, giftcard='none' WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
        });
        audit(`Checkout Completed`, `${req.user.username} (${req.user.id}) completed their checkout session.`);
        return res.redirect('/account');
    });
};

async function checkoutInvoice(req, res) {
    let id2 = await utils.generateRandom(21);
    req.params.invoiceid = await utils.sanitize(req.params.invoiceid);
    if(!req.params.type) return console.log('No type in request for payment');
    let totalValueAccum = 0;
    await dbcon.query(`SELECT * FROM invoices WHERE uniqueid="${req.params.invoiceid}"`, async (err, row) => {
        if(err) throw err;
        let invoice = row[0];
        if(req.params.type == 'stripe') {
            let price;
            if(invoice.price.replace('.', '').length < 2) invoice.price = invoice.price + '0';
            if(invoice.price.replace('.', '').length < 3) invoice.price = invoice.price + '0';
            if(invoice.price.endsWith('.5')) invoice.price = invoice.price.split('.')[0] + '.49';
            if(invoice.price.includes('.')) {
                price = Number(invoice.price.replace('.', ''));
            } else {
                price = (Number(invoice.price)) * 100;
            };
            if(price < 0.51) {
                if(price == 0) {
                    await dbcon.query(`INSERT INTO pendingpurchases (uniqueid, userid, sessionid, paymenttype) VALUES ('${id2}', '${req.user.id}', 'NO_VALUE_100_DISCOUNT_INVOICE', 'Stripe')`, async function (err, pay) { if (err) throw err; });
                    audit(`Checkout Session Created`, `${req.user.username} (${req.user.id}) has created a checkout session.`);
                    return res.redirect(`/backend/finishcheckoutinvoice/${id2}/stripe/${req.params.invoiceid}`);
                } else {
                    return res.send('Stripe requires a minimum amount of 0.50 USD for checkout sessions.');
                };
            };
            let cartItems = [
                {
                    price_data: {
                        currency: config.paymentSettings.currency,
                        product_data: {
                            name: `Invoice #${req.params.invoiceid}`,
                            images: [
                                `${config.domain}/assets/logo.png`
                            ]
                        },
                        unit_amount: price
                    },
                    quantity: 1,
                }
            ];
            await dbcon.query(`SELECT * FROM users WHERE id='${req.user.id}'`, async function (err, row) { // req.user.id AND in pending db too
                if (err) throw err;
                const session = await stripe.checkout.sessions.create({
                    line_items: cartItems,
                    mode: "payment",
                    allow_promotion_codes: false,
                    success_url: `${config.domain}/backend/finishcheckoutinvoice/${id2}/stripe/${req.params.invoiceid}`,
                    cancel_url: `${config.domain}/invoice/${req.params.invoiceid}`
                });
                await dbcon.query(`INSERT INTO pendingpurchases (uniqueid, userid, sessionid, paymenttype) VALUES ('${id2}', '${req.user.id}', '${session.id}', 'Stripe')`, async function (err, pay) { if (err) throw err; });
                await res.redirect(session.url);
                audit(`Checkout Session Created - Invoice`, `${req.user.username} (${req.user.id}) has created a checkout session for their invoice.`);
            });
        } else if(req.params.type == 'paypal') {
                let price = Number(invoice.price);
                totalValueAccum = totalValueAccum + Number(price.toFixed(2));
                let item = [{
                    "name": invoice.title,
                    "unit_amount": {
                        "currency_code": config.paymentSettings.currency.toUpperCase(),
                        "value": `${price.toFixed(2)}`
                    },
                    "quantity": "1"
                }];
            if(totalValueAccum == 0) {
                await dbcon.query(`INSERT INTO pendingpurchases (uniqueid, userid, sessionid, paymenttype) VALUES ('${id2}', '${req.user.id}', 'NO_VALUE_100_DISCOUNT', 'PayPal')`, async function (err, pay) { if (err) throw err; });
                audit(`Checkout Session Created`, `${req.user.username} (${req.user.id}) has created a checkout session.`);
                return res.redirect(`/backend/finishcheckout/${id2}/paypal`);
            };
            let orderRequest = new PaypalImport.orders.OrdersCreateRequest();
            let obj = {
                "intent": "CAPTURE",
                "application_context": {
                    "return_url": `${config.domain}/backend/finishcheckoutinvoice/${id2}/paypal/${invoice.uniqueid}`,
                    "cancel_url": `${config.domain}/shop`,
                    "brand_name": `${storedAppVariable.locals.sitesettings.sitename}`,
                    "user_action": "PAY_NOW"
                },
                "purchase_units": [
                    {
                        "items": item,
                        "amount": {
                            "currency_code": config.paymentSettings.currency.toUpperCase(),
                            "value": `${totalValueAccum.toString()}`,
                            "breakdown": {
                                "item_total": { "value": totalValueAccum.toString(), "currency_code": config.paymentSettings.currency.toUpperCase() }
                            }
                        },
                        "reference_id": "2",
                        "description": `Invoice Id: ${invoice.uniqueid} Account Id: ${req.user.id} TOS - ${config.domain}/tos`
                    }
                ]
            };
            orderRequest.requestBody(obj);
            let makecall = await paypalClient.execute(orderRequest);
            await res.redirect(makecall.result.links.filter(a => a.rel == 'approve')[0].href);
            await dbcon.query(`INSERT INTO pendingpurchases (uniqueid, userid, sessionid, paymenttype) VALUES ('${id2}', '${req.user.id}', '${makecall.result.id}', 'PayPal')`, async function (err, pay) { if (err) throw err; });
        };
    });
};

async function completeCheckoutInvoice(req, res) {
    if(!req.params.uniqueid) return console.log('No uniqueid in invoice completion ticket after payment.');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    req.params.type = await utils.sanitize(req.params.type);
    req.params.invoiceid = await utils.sanitize(req.params.invoiceid);
    await dbcon.query(`SELECT * FROM pendingpurchases WHERE uniqueid="${req.params.uniqueid}" AND userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(row[0].paymenttype == 'PayPal') {
            try {
                let executePayment = new PaypalImport.orders.OrdersCaptureRequest(row[0].sessionid);
                executePayment.requestBody({});
                let pingPaypalForStupidStuffNow = await paypalClient.execute(executePayment);
                if(pingPaypalForStupidStuffNow?.statusCode != 201) return res.send('PayPal payment error. Declined (E04)');
                if(pingPaypalForStupidStuffNow?.result?.status != 'COMPLETED') {
                    return res.send('PayPal payment error (E02).');
                };
            } catch(e) {
                if(config.debugMode) console.log(e);
                return res.send('PayPal payment error (E03).');
            };
        };
        await dbcon.query(`DELETE FROM pendingpurchases WHERE uniqueid="${req.params.uniqueid}" AND userid="${req.user.id}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
        });
        await dbcon.query(`SELECT * FROM users WHERE id="${req.user.id}"`, function(err, row) {
            if(err) throw err;
            if(row[0].client == false) updateStats('customers');
        });
        updateStats('sales');
        await dbcon.query(`SELECT * FROM subscriptions WHERE invoiceid="${req.params.invoiceid}"`, async function(err, row) {
            if(err) throw err;
            if(!row[0]) return console.log('no invoice id');
            let subscription = row[0];
            dbcon.query(`SELECT * FROM products WHERE uniqueid="${subscription.productid}"`, async function(err, row) {
                if(err) throw err;
                if(!row[0]) return;
                let oneMonth = await moment(subscription.nextduedate, 'MM-YYYY').add(1, 'months').format('MM-DD-YYYY');
                let invoice_uid = await utils.generateRandom(19);
                dbcon.query(`INSERT INTO invoices (uniqueid, userid, paid, title, description, datetime, price) VALUES ("${invoice_uid}", "${req.user.id}", false, "Auto ${oneMonth} - ${await utils.sanitize(row[0].name)}", "This invoice was automatically generated for your active subscription.", "${oneMonth}", "${subscription.price}")`, function(err, row) {
                    if(err) throw err;
                });
                dbcon.query(`UPDATE subscriptions SET invoiceid="${invoice_uid}", nextduedate="${oneMonth}" WHERE uniqueid="${subscription.uniqueid}"`, function(err, row) {
                    if(err) throw err;
                });
            });
        });
        await dbcon.query(`UPDATE users SET client=true WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
        });
        await dbcon.query(`UPDATE invoices SET paid=true WHERE uniqueid="${req.params.invoiceid}"`, async (err, row) => {
            if(err) throw err;
        });
        await dbcon.query(`SELECT * FROM invoices WHERE uniqueid="${req.params.invoiceid}"`, async (err, row) => {
            if(err) throw err;
            let totalPrice = Number(row[0].price);
            updateStats('income', Math.round(100*totalPrice)/100);
            dbcon.query(`SELECT * FROM sitesettings`, async (err, row) => {
                if(err) throw err;
                let currentSettingsTotalIncome = Number(row[0].totalincome); 
                currentSettingsTotalIncome = currentSettingsTotalIncome + totalPrice;
                currentSettingsTotalIncome = Math.round(100*currentSettingsTotalIncome)/100;
                currentSettingsTotalIncome = currentSettingsTotalIncome.toString();
                if(!currentSettingsTotalIncome.includes('.')) currentSettingsTotalIncome = `${currentSettingsTotalIncome}.00`;
                dbcon.query(`UPDATE sitesettings SET totalincome="${currentSettingsTotalIncome}"`, async (err, row) => {
                    if(err) throw err;
                });
            });
        });
        audit(`Invoice Checkout Completed`, `${req.user.username} (${req.user.id}) completed their checkout session for their invoice.`);
        return res.redirect(`/invoice/${req.params.invoiceid}`);
    });
};

async function checkoutGiftcard(req, res) {
    let id2 = await utils.generateRandom(21);
    req.params.giftcardid = await utils.sanitize(req.params.giftcardid);
    if(!req.params.type) return console.log('No type in request for payment');
    let totalValueAccum = 0;
    await dbcon.query(`SELECT * FROM giftcards WHERE uniqueid="${req.params.giftcardid}"`, async (err, row) => {
        if(err) throw err;
        let giftcard = row[0];
        if(req.params.type == 'stripe') {
            let price;
            if(giftcard.amount.replace('.', '').length < 2) giftcard.amount = giftcard.amount + '0';
            if(giftcard.amount.replace('.', '').length < 3) giftcard.amount = giftcard.amount + '0';
            if(giftcard.amount.endsWith('.5')) giftcard.amount = giftcard.amount.split('.')[0] + '.49';
            if(giftcard.amount.includes('.')) {
                price = Number(giftcard.amount.replace('.', ''));
            } else {
                price = (Number(giftcard.amount)) * 100;
            };
            if(price < 0.51) {
                if(price == 0) {
                    await dbcon.query(`INSERT INTO pendingpurchases (uniqueid, userid, sessionid, paymenttype) VALUES ('${id2}', '${req.user.id}', 'NO_VALUE_100_DISCOUNT_GIFTCARD', 'Stripe')`, async function (err, pay) { if (err) throw err; });
                    audit(`Checkout Session Created`, `${req.user.username} (${req.user.id}) has created a checkout session.`);
                    return res.redirect(`/backend/finishcheckoutgiftcard/${id2}/stripe/${req.params.giftcardid}`);
                } else {
                    return res.send('Stripe requires a minimum amount of 0.50 USD for checkout sessions.');
                };
            };
            let cartItems = [
                {
                    price_data: {
                        currency: config.paymentSettings.currency,
                        product_data: {
                            name: `${giftcard.name}`,
                            images: [
                                `${config.domain}/images/giftcard_${giftcard.uniqueid}.png`
                            ]
                        },
                        unit_amount: price
                    },
                    quantity: 1,
                }
            ];
            await dbcon.query(`SELECT * FROM users WHERE id='${req.user.id}'`, async function (err, row) { // req.user.id AND in pending db too
                if (err) throw err;
                const session = await stripe.checkout.sessions.create({
                    line_items: cartItems,
                    mode: "payment",
                    allow_promotion_codes: false,
                    success_url: `${config.domain}/backend/finishcheckoutgiftcard/${id2}/stripe/${req.params.giftcardid}`,
                    cancel_url: `${config.domain}/giftcards`
                });
                await dbcon.query(`INSERT INTO pendingpurchases (uniqueid, userid, sessionid, paymenttype) VALUES ('${id2}', '${req.user.id}', '${session.id}', 'Stripe')`, async function (err, pay) { if (err) throw err; });
                await res.redirect(session.url);
                audit(`Checkout Session Created - Giftcard`, `${req.user.username} (${req.user.id}) has created a checkout session for their Giftcard.`);
            });
        } else if(req.params.type == 'paypal') {
                let price = Number(giftcard.amount);
                totalValueAccum = totalValueAccum + Number(price.toFixed(2));
                let item = [{
                    "name": giftcard.name,
                    "unit_amount": {
                        "currency_code": config.paymentSettings.currency.toUpperCase(),
                        "value": `${price.toFixed(2)}`
                    },
                    "quantity": "1"
                }];
            if(totalValueAccum == 0) {
                await dbcon.query(`INSERT INTO pendingpurchases (uniqueid, userid, sessionid, paymenttype) VALUES ('${id2}', '${req.user.id}', 'NO_VALUE_100_DISCOUNT', 'PayPal')`, async function (err, pay) { if (err) throw err; });
                audit(`Checkout Session Created`, `${req.user.username} (${req.user.id}) has created a checkout session.`);
                return res.redirect(`/backend/finishcheckoutgiftcard/${id2}/paypal`);
            };
            let orderRequest = new PaypalImport.orders.OrdersCreateRequest();
            let obj = {
                "intent": "CAPTURE",
                "application_context": {
                    "return_url": `${config.domain}/backend/finishcheckoutgiftcard/${id2}/paypal/${giftcard.uniqueid}`,
                    "cancel_url": `${config.domain}/shop`,
                    "brand_name": `${storedAppVariable.locals.sitesettings.sitename}`,
                    "user_action": "PAY_NOW"
                },
                "purchase_units": [
                    {
                        "items": item,
                        "amount": {
                            "currency_code": config.paymentSettings.currency.toUpperCase(),
                            "value": `${totalValueAccum.toString()}`,
                            "breakdown": {
                                "item_total": { "value": totalValueAccum.toString(), "currency_code": config.paymentSettings.currency.toUpperCase() }
                            }
                        },
                        "reference_id": "2",
                        "description": `Giftcard Id: ${giftcard.uniqueid} Account Id: ${req.user.id} TOS - ${config.domain}/tos`
                    }
                ]
            };
            orderRequest.requestBody(obj);
            let makecall = await paypalClient.execute(orderRequest);
            await res.redirect(makecall.result.links.filter(a => a.rel == 'approve')[0].href);
            await dbcon.query(`INSERT INTO pendingpurchases (uniqueid, userid, sessionid, paymenttype) VALUES ('${id2}', '${req.user.id}', '${makecall.result.id}', 'PayPal')`, async function (err, pay) { if (err) throw err; });
        };
    });
};

async function completeCheckoutGiftcard(req, res) {
    if(!req.params.uniqueid) return console.log('No uniqueid in giftcard completion ticket after payment.');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    req.params.type = await utils.sanitize(req.params.type);
    req.params.giftcardid = await utils.sanitize(req.params.giftcardid);
    await dbcon.query(`SELECT * FROM pendingpurchases WHERE uniqueid="${req.params.uniqueid}" AND userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(row[0].paymenttype == 'PayPal') {
            try {
                let executePayment = new PaypalImport.orders.OrdersCaptureRequest(row[0].sessionid);
                executePayment.requestBody({});
                let pingPaypalForStupidStuffNow = await paypalClient.execute(executePayment);
                if(pingPaypalForStupidStuffNow?.statusCode != 201) return res.send('PayPal payment error. Declined (E04)');
                if(pingPaypalForStupidStuffNow?.result?.status != 'COMPLETED') {
                    return res.send('PayPal payment error (E02).');
                };
            } catch(e) {
                if(config.debugMode) console.log(e);
                return res.send('PayPal payment error (E03).');
            };
        };
        await dbcon.query(`DELETE FROM pendingpurchases WHERE uniqueid="${req.params.uniqueid}" AND userid="${req.user.id}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
        });
        await dbcon.query(`SELECT * FROM users WHERE id="${req.user.id}"`, function(err, row) {
            if(err) throw err;
            if(row[0].client == false) updateStats('customers');
        });
        updateStats('sales');
        await dbcon.query(`UPDATE users SET client=true WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
        });
        await dbcon.query(`SELECT * FROM giftcards WHERE uniqueid="${req.params.giftcardid}"`, async (err, row) => {
            if(err) throw err;
            dbcon.query(`INSERT INTO ownedgiftcards (uniqueid, giftcardid, code, amount, purchaserid) VALUES ("${await utils.generateRandom(36)}", "${req.params.giftcardid}", "${await utils.generateRandom(34)}", "${row[0].amount}", "${req.user.id}")`, function(err, row) {
                if(err) throw err;
            });
            let totalPrice = Number(row[0].amount);
            updateStats('income', Math.round(100*totalPrice)/100);
            dbcon.query(`SELECT * FROM sitesettings`, async (err, row) => {
                if(err) throw err;
                let currentSettingsTotalIncome = Number(row[0].totalincome); 
                currentSettingsTotalIncome = currentSettingsTotalIncome + totalPrice;
                currentSettingsTotalIncome = Math.round(100*currentSettingsTotalIncome)/100;
                currentSettingsTotalIncome = currentSettingsTotalIncome.toString();
                if(!currentSettingsTotalIncome.includes('.')) currentSettingsTotalIncome = `${currentSettingsTotalIncome}.00`;
                dbcon.query(`UPDATE sitesettings SET totalincome="${currentSettingsTotalIncome}"`, async (err, row) => {
                    if(err) throw err;
                });
            });
        });
        audit(`Giftcard Checkout Completed`, `${req.user.username} (${req.user.id}) completed their checkout session for their giftcard.`);
        return res.redirect(`/account/${req.user.id}`);
    });
};

async function checkRoleRequirements(discount, user) {
    if(discount.roleids == 'none') return true;
    let guild = await client.guilds.cache.get(storedAppVariable.locals.sitesettings.guildid);
    if(!guild) return false;
    let member = await guild.members.cache.get(user.id);
    if(!member) return false;
    let isAllowed = false;
    let roleArray = discount.roleids.replaceAll(' ', '').split(',');
    for(let roleid of roleArray) {
        if(await member.roles.cache.has(roleid)) {
            isAllowed = true;
        };
    };
    return isAllowed;
};

module.exports = {
    init: init,
    checkAuth: checkAuth,
    resetAppLocals: resetAppLocals,
    audit: audit,
    randomIntFromInterval: randomIntFromInterval,
    addCustomerRoleToUser: addCustomerRoleToUser,
    logToDiscord: logToDiscord,
    logToSupportDiscord: logToSupportDiscord,
    createNotification: createNotification,
    createEmail: createEmail,
    updateStats: updateStats,
    subscriptionEnforcement: subscriptionEnforcement,
    checkout: checkout,
    checkoutInvoice: checkoutInvoice,
    checkoutGiftcard: checkoutGiftcard,
    completeCheckout: completeCheckout,
    completeCheckoutInvoice: completeCheckoutInvoice,
    completeCheckoutGiftcard: completeCheckoutGiftcard,
    checkNotAuth: checkNotAuth,
    authenticateUserLocal: authenticateUserLocal,
    generateUserId: generateUserId,
    checkRoleRequirements: checkRoleRequirements,
    checkHasRole: checkHasRole
};
