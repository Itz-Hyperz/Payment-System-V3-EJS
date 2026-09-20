// Basic Imports
const config = require("./config.json");
const express = require("express");
const app = express();
const chalk = require('chalk');
const fs = require('node:fs');
const axios = require('axios');
const bcrypt = require('bcrypt');
const utils = require('hyperz-utils');
const BossWebstoreEvents = require('events');
const HyperzStore = new BossWebstoreEvents();
HyperzStore.defaultMaxListeners = 99;

var passwordResetCodes = []; // Stored in Node Session for security.

// MySQL Setup
const mysql = require('mysql');
config.sql.charset = "utf8mb4";
let con = mysql.createConnection(config.sql); // set = 0 to disable

// Backend Initialization
const backend = require('./backend.js');
backend.init(app, con, HyperzStore);

// Discord Login Passport
const passport = require('passport');
const DiscordStrategy = require('passport-discord-hyperz').Strategy;
const LocalStrategy = require('passport-local').Strategy;
passport.serializeUser(function(user, done) { done(null, user) });
passport.deserializeUser(function(obj, done) { done(null, obj) });

if(config.loginMethods.regular.enabled) {
    passport.use(new LocalStrategy({ usernameField: 'email' }, backend.authenticateUserLocal))
};
if(config.loginMethods.discord.enabled) {
    passport.use(new DiscordStrategy({
        clientID: config.loginMethods.discord.oauthId,
        clientSecret: config.loginMethods.discord.oauthToken,
        callbackURL: `${(config.domain.endsWith('/') ? config.domain.slice(0, -1) : config.domain)}/auth/discord/callback`,
        scope: ['identify', 'guilds', 'guilds.join', 'email'],
        prompt: 'consent'
    }, function(accessToken, refreshToken, profile, done) {
        process.nextTick(function() {
            return done(null, profile);
        });
    }));
};

// Routing
app.get('/', async function(req, res) {
    await backend.resetAppLocals(app);
    let recentPurchase = false;
    backend.updateStats('homepagevisits');
    con.query(`SELECT * FROM usingcompanies ORDER BY RAND() LIMIT 6;`, function(err, usingcompanies) {
        if(err) throw err;
        con.query(`SELECT * FROM faq`, function(err, faq) {
            if(err) throw err;
            con.query(`SELECT * FROM reviews ORDER BY RAND() LIMIT 4;`, function(err, reviews) {
                if(err) throw err;
                con.query(`SELECT * FROM owneditems`, async (err, row) => {
                    if(err) throw err;
                    if(row[0]) {
                        let oi = row.reverse()[0];
                        con.query(`SELECT * FROM users WHERE id="${oi.userid}"`, function(err, row) {
                            if(err) throw err;
                            if(!row[0]) return;
                            recentPurchase = {
                                ownedItem: oi,
                                userInfo: row[0]
                            };
                        });
                    };
                    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
                    con.query(`SELECT * FROM products WHERE featured=true`, async (err, featprodobj) => {
                        if(err) throw err;
                        let featprods = [];
                        for(let item of featprodobj) {
                            con.query(`SELECT * FROM reviews WHERE itemuniqueid="${item.uniqueid}"`, function(err, row) {
                                if(err) throw err;
                                let count = 0;
                                let length = row.length;
                                for(let review of row) {
                                    count = count + review?.rating || 0;
                                };
                                let avg = count / length;
                                if(isNaN(avg)) avg = 0;
                                item.reviewAverage = Math.round(10*avg)/10;
                                featprods.push(item);
                            });
                        };
                        if(req.isAuthenticated()) {
                            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                                if(err) throw err;
                                if(!row[0]) {
                                    con.query(`INSERT INTO users (giftcard, id, email, password, username, latestip, cart, discount, note, client, mailinglist, mailendpoints) VALUES ('none', '${req.user.id}', '${req.user.email || "none"}', 'discord', '${await utils.sanitize(req.user.username)}', '${req.clientIp || 'none'}', '[]', 0, 'none', 0, 1, '["NOTIFICATIONS", "LOGIN_SESSION"]')`, async (err, row) => {
                                        if(err) throw err;
                                        backend.audit(`Account Created`, `${req.user.username} (${req.user.id}) created an account.`)
                                        backend.updateStats('newusers');
                                        utils.saveFile(`https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png`, `avatar_${req.user.id}`, 'png', './public/images', false)
                                        backend.createEmail(req.user.email || "none", "Account Created", `Hey there, we are happy to see you joining our community! If you have any questions don't hesitate to ask.\n\nWe value all of our members, clients, staff, and work! You are our priority and we strive to provide the greatest support we can!\n\n<a href='${config.domain}/account' style="color: white; text-decoration: none; padding: 0.6em; font-size: 1.4em; border-radius: 0.4em; background-color: ${app.locals.sitesettings.sitecolor};">View Account</a>`, 'NOTIFICATIONS');
                                        con.query(`SELECT * FROM bannedusers WHERE userid="${req.user.id}"`, async (err, row) => {
                                            if(err) throw err;
                                            if(row[0]) return res.redirect('/banned');
                                        });
                                    });
                                    return res.redirect('/');
                                };
                                let myuser = row[0];
                                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                                    if(err) throw err;
                                    myuser.notifications = mynotis || [];
                                    setTimeout(async function() {
                                        res.render('index.ejs', { reviews: reviews, faq: faq, usingcompanies: usingcompanies, homeabout: await utils.mdConvert(app.locals.sitesettings.homeabout), user: myuser, loggedIn: true, featprod: featprodobj, recentPurchase: recentPurchase });
                                    }, 5);
                                });
                            });
                        } else {
                            setTimeout(async function() {
                                res.render('index.ejs', { reviews: reviews, faq: faq, usingcompanies: usingcompanies, homeabout: await utils.mdConvert(app.locals.sitesettings.homeabout), user: false, loggedIn: false, featprod: featprodobj, recentPurchase: recentPurchase });
                            }, 5);
                        };
                    });
                });
            });
        });
    });
});



app.get('/support', async function(req, res) {
    await backend.resetAppLocals(app);
    let stats = {};
    con.query(`SELECT * FROM tickets`, function(err, row) {
        if(err) throw err;
        stats.tickets = row.length.toLocaleString() || 0;
        con.query(`SELECT * FROM users`, function(err, row) {
            if(err) throw err;
            stats.users = row.length.toLocaleString() || 0;
            con.query(`SELECT * FROM staff`, function(err, row) {
                if(err) throw err;
                stats.staff = row.length.toLocaleString() || 0;
                con.query(`SELECT * FROM categories`, function(err, row) {
                    if(err) throw err;
                    stats.categories = row.length.toLocaleString() || 0;
                    let isStaff = false;
                    if(req.isAuthenticated()) {
                        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                            if(err) throw err;
                            let myuser = row[0];
                            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                                if(err) throw err;
                                myuser.notifications = mynotis || [];
                                con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
                                    if(err) throw err;
                                    if(row[0]) isStaff = true;
                                    res.render('supportIndex.ejs', { user: myuser, stats: stats, isStaff: isStaff, loggedIn: req.isAuthenticated() });
                                });
                            });
                        });
                    } else {
                        res.render('supportIndex.ejs', { user: false, stats: stats, isStaff: isStaff, loggedIn: req.isAuthenticated() });
                    };
                });
            });
        });
    });
});

app.get('/support/tickets', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let isStaff = false;
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(row[0]) isStaff = true;
        con.query(`SELECT * FROM tickets WHERE userid="${req.user.id}"`, function(err, row) {
            if(err) throw err;
            let ticketsVar = row
            if(req.isAuthenticated()) {
                con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let myuser = row[0];
                    con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                        if(err) throw err;
                        myuser.notifications = mynotis || [];
                        res.render('supportTickets.ejs', { user: myuser, loggedIn: req.isAuthenticated(), tickets: ticketsVar, isStaff: isStaff });
                    });
                });
            } else {
                res.render('supportTickets.ejs', { user: false, loggedIn: req.isAuthenticated(), tickets: ticketsVar, isStaff: isStaff });
            };
        });
    });
});

app.get('/support/create', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let isStaff = false;
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(row[0]) isStaff = true;
        con.query(`SELECT * FROM categories`, function(err, categories) {
            if(err) throw err;
            if(req.isAuthenticated()) {
                con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let myuser = row[0];
                    con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                        if(err) throw err;
                        myuser.notifications = mynotis || [];
                        res.render('supportCreate.ejs', { user: myuser, categories: categories, loggedIn: req.isAuthenticated(), isStaff: isStaff });
                    });
                });
            } else {
                res.render('supportCreate.ejs', { categories: categories, loggedIn: req.isAuthenticated(), isStaff: isStaff });
            };
        });
    });
});

app.get('/support/ticket/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let name of Object.keys(req.params)) {
        req.params[name] = await utils.sanitize(req.params[name]);
        if(req.params[name] == '') req.params[name] = "NA";
    };
    let isAllowed = false;
    let isStaff = false;
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(row[0]) {
            isAllowed = true;
            isStaff = true;
        };
        con.query(`SELECT * FROM tickets WHERE id="${req.params.uniqueid}"`, async function(err, row) {
            if(err) throw err;
            if(!row[0]) res.redirect('/404');
            let theTicket = row[0]
            if(theTicket.userid == req.user.id) isAllowed = true;
            if(!isAllowed) return res.redirect('/404');
            theTicket.content = await utils.mdConvert(theTicket.content);
            con.query(`SELECT * FROM comments WHERE ticketid="${req.params.uniqueid}"`, async function(err, comments) {
                if(err) throw err;
                let newComments = [];
                for(let item of comments) {
                    item.content = await utils.mdConvert(item.content);
                    newComments.push(item);
                };
                con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let myuser = row[0];
                    con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                        if(err) throw err;
                        myuser.notifications = mynotis || [];
                        res.render('supportTicket.ejs', { user: myuser, ticket: theTicket, isStaff: isStaff, comments: newComments, loggedIn: req.isAuthenticated() });
                    });
                });
            });
        });
    });
});




app.get('/login', backend.checkNotAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    res.render('login.ejs', { user: false, loggedIn: req.isAuthenticated() });
});

app.get('/credits', async function(req, res) {
    await backend.resetAppLocals(app);
    if(req.isAuthenticated()) {
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let myuser = row[0];
            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                if(err) throw err;
                myuser.notifications = mynotis || [];
                res.render('credits.ejs', { user: myuser, loggedIn: true });
            });
        });
    } else {
        res.render('credits.ejs', { user: false, loggedIn: false });
    };
});

app.get('/apply', backend.checkAuth, async function(req, res) {
    backend.resetAppLocals(app);
    con.query(`SELECT * FROM applications WHERE closed=false`, function(err, applications) {
        if(err) throw err;
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let myuser = row[0];
            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                if(err) throw err;
                myuser.notifications = mynotis || [];
                res.render('apply.ejs', { user: myuser, loggedIn: true, applications: applications, loggedIn: req.isAuthenticated() });
            });
        });
    });
});

app.get('/emailverify/:uid', async function(req, res) {
    backend.resetAppLocals(app);
    req.params.uid = await utils.sanitize(req.params.uid);
    con.query(`UPDATE users SET temporary=false WHERE id="${req.params.uid}"`, async (err, row) => {
        if(err) throw err;
        res.redirect(`/account/${req.params.uid}`);
    });
});

app.get('/forgotpassword', async function(req, res) {
    backend.resetAppLocals(app);
    res.render('forgotpassword.ejs');
});
app.get('/forgotpassword/:uid', async function(req, res) {
    backend.resetAppLocals(app);
    req.params.uid = await utils.sanitize(req.params.uid);
    if(!passwordResetCodes.includes(req.params.uid)) return res.redirect('/404');
    let newPasswordResetCodes = [];
    for(let item of passwordResetCodes) {
        if(item != req.params.uid) newPasswordResetCodes.push(item);
    };
    passwordResetCodes = newPasswordResetCodes;
    let newTemporaryPassword = await utils.generateRandom(8);
    req.params.uid = req.params.uid.split('-');
    let hashedPassword = await bcrypt.hash(newTemporaryPassword, 13);
    con.query(`SELECT * FROM users WHERE id="${req.params.uid[0]}"`, function(err, row) {
        if(err) throw err;
        con.query(`UPDATE users SET password="${hashedPassword}" WHERE id="${req.params.uid[0]}"`, function(err) {
            if(err) throw err;
            backend.createEmail(row[0].email || "none", "Temporary Password", `This is your new temporary password, make sure to change this in your account settings at <a href='${config.domain}/account'>${config.domain}/account</a> immediately if you haven't already!\n\nNew Temporary Password: ${newTemporaryPassword}`, 'NOTIFICATIONS');
            return res.render('_template.ejs', { loginforgotpasswordready: true, loginforgotpasswordvalue: newTemporaryPassword, templatepage: { "title": "New Password", "a": "VERY IMPORTANT WARNING!!!", "b": `<code>${newTemporaryPassword}</code> is your new temporary password! YOU MUST CHANGE THIS PASSWORD IN YOUR ACCOUNT SETTINGS!`, "ctext": "<i class='fa-solid fa-arrow-right-from-bracket'></i> Go Back", "clink": "/login", "dtext": "<i class='fa-brands fa-discord'></i> Join Discord", "dlink": "/discord" } })
        });
    });
});

app.post('/backend/startforgotpassword', async function(req, res) {
    await backend.resetAppLocals(app);
    req.body.email = await utils.sanitize(req.body.email);
    con.query(`SELECT * FROM users WHERE email="${req.body.email}"`, async function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.render('_template.ejs', { templatepage: { "title": "Invalid Email", "a": "Invalid Email Address!", "b": "There is no account on file with that email address!", "ctext": "<i class='fa-solid fa-arrow-right-from-bracket'></i> Go Back", "clink": "/login", "dtext": "<i class='fa-brands fa-discord'></i> Join Discord", "dlink": "/discord" } })
        con.query(`UPDATE users SET mailinglist=true WHERE id="${row[0].id}"`, async function(err) {
            if(err) throw err;
            let supersecretpasswordcode = `${row[0].id}-${await utils.generateRandom(57)}`;
            passwordResetCodes.push(supersecretpasswordcode);
            backend.createEmail(req.body.email || "none", "Forgot Password?", `You are recieving this email because you requested a password reset on our website!\n\nIf you did not make this request, delete this email immediately! Otherwise, click this button to continue your password reset.\n\n<a href='${config.domain}/forgotpassword/${supersecretpasswordcode}' style="color: white; text-decoration: none; padding: 0.6em; font-size: 1.4em; border-radius: 0.4em; background-color: ${app.locals.sitesettings.sitecolor};">Reset Password</a>`, 'NOTIFICATIONS');
            return res.render('_template.ejs', { templatepage: { "title": "Password Reset", "a": "Password Reset Email Sent!", "b": "We sent an email containing instructions to reset your password!", "ctext": "<i class='fa-solid fa-arrow-right-from-bracket'></i> Go Back", "clink": "/login", "dtext": "<i class='fa-brands fa-discord'></i> Join Discord", "dlink": "/discord" } })
        });
    });
});

app.get('/apply/:uid', backend.checkAuth, async function(req, res) {
    backend.resetAppLocals(app);
    for(let item of Object.keys(req.params)) {
        req.params[item] = await utils.sanitize(req.params[item]);
    };
    con.query(`SELECT * FROM applications WHERE closed=false AND id="${req.params.uid}"`, function(err, applications) {
        if(err) throw err;
        if(!applications[0]) return res.redirect('/apply');
        con.query(`SELECT * FROM appquestions WHERE appid="${req.params.uid}"`, function(err, questions) {
            if(err) throw err;
            if(!questions[0]) return res.redirect('/apply');
            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let myuser = row[0];
                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                    if(err) throw err;
                    myuser.notifications = mynotis || [];
                    res.render('applyform.ejs', { user: myuser, loggedIn: true, application: applications[0], questions: questions, loggedIn: req.isAuthenticated() });
                });
            });
        });
    });
});

app.get('/commissions', async function(req, res) {
    await backend.resetAppLocals(app);
    if(req.isAuthenticated()) {
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let myuser = row[0];
            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                if(err) throw err;
                myuser.notifications = mynotis || [];
                res.render('commissions.ejs', { user: myuser, loggedIn: true });
            });
        });
    } else {
        res.render('commissions.ejs', { user: false, loggedIn: false });
    };
});

app.get('/shop', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    con.query(`SELECT * FROM storecategories WHERE hidden=false`, async function(err, row) {
        if(err) throw err;
        let categories = [];
        for(let item of row) {
            item.isCategory = true;
            categories.push(item);
        };
        con.query(`SELECT * FROM products WHERE featured=true ORDER BY RAND() LIMIT 3`, function(err, row) {
            if(err) throw err;
            let featprods = [];
            for(let item of row) {
                con.query(`SELECT * FROM reviews WHERE itemuniqueid="${item.uniqueid}"`, function(err, row) {
                    if(err) throw err;
                    let count = 0;
                    let length = row.length;
                    for(let review of row) {
                        count = count + review?.rating || 0;
                    };
                    let avg = count / length;
                    if(isNaN(avg)) avg = 0;
                    item.reviewAverage = Math.round(10*avg)/10;
                    featprods.push(item);
                });
            };
            con.query(`SELECT * FROM products WHERE hidden=false AND extension="none"`, async function(err, row) {
                if(err) throw err;
                let products = [];
                for(let item of row) {
                    con.query(`SELECT * FROM reviews WHERE itemuniqueid="${item.uniqueid}"`, function(err, row) {
                        if(err) throw err;
                        let count = 0;
                        let length = row.length;
                        for(let review of row) {
                            count = count + review?.rating || 0;
                        };
                        let avg = count / length;
                        if(isNaN(avg)) avg = 0;
                        item.reviewAverage = Math.round(10*avg)/10;
                        item.isCategory = false;
                        products.push(item);
                    });
                };
                con.query(`SELECT * FROM storetags`, async function(err, row) {
                    if(err) throw err;
                    let storetags = row;
                    if(req.isAuthenticated()) {
                        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                            if(err) throw err;
                            let myuser = row[0];
                            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                                if(err) throw err;
                                myuser.notifications = mynotis || [];
                                res.render('shop.ejs', { products: products.concat(categories), user: myuser, loggedIn: true, storetags: storetags, featprods: featprods });
                            });
                        });
                    } else {
                        res.render('shop.ejs', { products: products.concat(categories), user: false, loggedIn: false, storetags: storetags, featprods: featprods });
                    };
                });
            });
        });
    });
});

app.get('/extensions/:productid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    req.params.productid = await utils.sanitize(req.params.productid)
    con.query(`SELECT * FROM owneditems WHERE productid="${req.params.productid}" AND userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect(`/backend/findproduct/${req.params.productid}`);
        con.query(`SELECT * FROM storecategories WHERE hidden=false`, async function(err, row) {
            if(err) throw err;
            let categories = [];
            con.query(`SELECT * FROM products WHERE featured=true ORDER BY RAND() LIMIT 3`, function(err, row) {
                if(err) throw err;
                let featprods = [];
                for(let item of row) {
                    con.query(`SELECT * FROM reviews WHERE itemuniqueid="${item.uniqueid}"`, function(err, row) {
                        if(err) throw err;
                        let count = 0;
                        let length = row.length;
                        for(let review of row) {
                            count = count + review?.rating || 0;
                        };
                        let avg = count / length;
                        if(isNaN(avg)) avg = 0;
                        item.reviewAverage = Math.round(10*avg)/10;
                        featprods.push(item);
                    });
                };
                con.query(`SELECT * FROM products WHERE extension="${req.params.productid}"`, async function(err, row) {
                    if(err) throw err;
                    let products = [];
                    for(let item of row) {
                        con.query(`SELECT * FROM reviews WHERE itemuniqueid="${item.uniqueid}"`, function(err, row) {
                            if(err) throw err;
                            let count = 0;
                            let length = row.length;
                            for(let review of row) {
                                count = count + review?.rating || 0;
                            };
                            let avg = count / length;
                            if(isNaN(avg)) avg = 0;
                            item.reviewAverage = Math.round(10*avg)/10;
                            item.isCategory = false;
                            products.push(item);
                        });
                    };
                    con.query(`SELECT * FROM storetags`, async function(err, row) {
                        if(err) throw err;
                        let storetags = row;
                        if(req.isAuthenticated()) {
                            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                                if(err) throw err;
                                let myuser = row[0];
                                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                                    if(err) throw err;
                                    myuser.notifications = mynotis || [];
                                    res.render('shop.ejs', { products: products.concat(categories), user: myuser, loggedIn: true, storetags: storetags, featprods: featprods });
                                });
                            });
                        } else {
                            res.render('shop.ejs', { products: products.concat(categories), user: false, loggedIn: false, storetags: storetags, featprods: featprods });
                        };
                    });
                });
            });
        });
    });
});

app.get('/shop/:productlink', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    req.params.productlink = await utils.sanitize(req.params.productlink);
    con.query(`SELECT * FROM products WHERE link="${req.params.productlink}"`, async function(err, row) {
        if(err) throw err;
        if(row[0]) {
            let product = row[0];
            if(product.quantity == 0) {
                product.paused = true;
                con.query(`UPDATE products SET paused=true WHERE uniqueid="${product.uniqueid}"`, async (err, row) => {
                    if(err) throw err;
                });
            };
            product.description = await utils.mdConvert(product.description);
            product.credits = await utils.mdConvert(product.credits);
            product.gallery = product.gallery.replaceAll(' ', '').split(',');
            product.linkeditems = product.linkeditems.replaceAll(' ', '').split(',');
            let linkedItems = [];
            if(product.linkeditems[0]) {
                for(let uniqueid of product.linkeditems) {
                    con.query(`SELECT * FROM products WHERE uniqueid="${uniqueid}"`, function(err, row) {
                        if(err) throw err;
                        if(!row[0]) return;
                        linkedItems.push({
                            uniqueid: uniqueid,
                            name: row[0].name,
                            price: row[0].price,
                            description: row[0].description.slice(0, 250) + '...'
                        });
                    });
                };
            };
            let extensions = false;
            con.query(`SELECT * FROM products WHERE extension="${product.uniqueid}"`, function(err, row) {
                if(err) throw err;
                if(row[0]) extensions = true;
                con.query(`SELECT * FROM reviews WHERE itemuniqueid="${product.uniqueid}" ORDER BY RAND() LIMIT 4`, async (err, randomReviews) => {
                    if(err) throw err;
                    if(req.isAuthenticated()) {
                        con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
                            if(err) throw err;
                            let isStaff = false;
                            if(row[0]) isStaff = true;
                            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                                if(err) throw err;
                                let myuser = row[0];
                                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                                    if(err) throw err;
                                    myuser.notifications = mynotis || [];
                                    res.render('shopitem.ejs', { extensions: extensions, product: product, user: myuser, loggedIn: true, isStaff: isStaff, reviews: randomReviews, linkedItems: linkedItems });
                                });
                            });
                        });
                    } else {
                        res.render('shopitem.ejs', { extensions: extensions, product: product, user: false, loggedIn: false, isStaff: false, reviews: randomReviews, linkedItems: linkedItems });
                    };
                    con.query(`UPDATE products SET overallviews=overallviews+1 WHERE uniqueid="${product.uniqueid}"`, async (err, row) => {
                        if(err) throw err;
                    });
                });
            });
        } else {
            con.query(`SELECT * FROM storecategories WHERE link="${req.params.productlink}"`, async function(err, row) {
                if(err) throw err;
                if(!row[0]) return res.redirect('/404');
                let category = row[0];
                category.description = await utils.mdConvert(category.description);
                category.items = category.items.replaceAll(' ', '').split(',');
                let linkedItems = [];
                for(let uniqueid of category.items) {
                    con.query(`SELECT * FROM products WHERE uniqueid="${uniqueid}"`, async function(err, row) {
                        if(err) throw err;
                        if(!row[0]) return;
                        con.query(`SELECT * FROM reviews WHERE itemuniqueid="${uniqueid}"`, function(err, reviews) {
                            if(err) throw err;
                            let count = 0;
                            let length = row.length;
                            for(let review of reviews) {
                                count = count + review?.rating || 0;
                            };
                            let avg = count / length;
                            if(isNaN(avg)) avg = 0;
                            let reviewAverage = Math.round(10*avg)/10;
                            linkedItems.push({
                                uniqueid: uniqueid,
                                pos: row[0].pos,
                                name: row[0].name,
                                link: row[0].link,
                                price: row[0].price,
                                pricecrossout: row[0].pricecrossout,
                                paused: row[0].paused,
                                reviewAverage: reviewAverage,
                                description: row[0].description.slice(0, 250) + '...'
                            });
                        });
                    });
                };
                if(req.isAuthenticated()) {
                    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
                        if(err) throw err;
                        let isStaff = false;
                        if(row[0]) isStaff = true;
                        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                            if(err) throw err;
                            let myuser = row[0];
                            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                                if(err) throw err;
                                myuser.notifications = mynotis || [];
                                res.render('shopcategory.ejs', { category: category, user: myuser, loggedIn: true, isStaff: isStaff, linkedItems: linkedItems });
                            });
                        });
                    });
                } else {
                    setTimeout(function() {
                        res.render('shopcategory.ejs', { category: category, user: false, loggedIn: false, isStaff: false, linkedItems: linkedItems });
                    }, 100);
                };
            });
        };
    });
});

app.get('/store', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    await res.redirect('/shop');
});

app.get('/store/:productlink', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    await res.redirect(`/shop/${req.params.productlink}`);
});

app.get('/searchtag/:uniqueid', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(!req.params.uniqueid) return res.redirect('/404');
    con.query(`SELECT * FROM products`, async function(err, row) {
        if(err) throw err;
        let products = [];
        for(let item of row) {
            con.query(`SELECT * FROM reviews WHERE itemuniqueid="${item.uniqueid}"`, function(err, row) {
                if(err) throw err;
                let count = 0;
                let length = row.length;
                for(let review of row) {
                    count = count + review?.rating || 0;
                };
                let avg = count / length;
                if(isNaN(avg)) avg = 0;
                item.reviewAverage = Math.round(10*avg)/10;
                item.isCategory = false;
                if(item.storetags.replaceAll(' ', '').split(',').includes(req.params.uniqueid)) {
                    products.push(item);
                };
            });
        };
        con.query(`SELECT * FROM products WHERE featured=true ORDER BY RAND() LIMIT 3`, function(err, row) {
            if(err) throw err;
            let featprods = [];
            for(let item of row) {
                con.query(`SELECT * FROM reviews WHERE itemuniqueid="${item.uniqueid}"`, function(err, row) {
                    if(err) throw err;
                    let count = 0;
                    let length = row.length;
                    for(let review of row) {
                        count = count + review?.rating || 0;
                    };
                    let avg = count / length;
                    if(isNaN(avg)) avg = 0;
                    item.reviewAverage = Math.round(10*avg)/10;
                    featprods.push(item);
                });
            };
            con.query(`SELECT * FROM storetags`, async function(err, row) {
                if(err) throw err;
                let storetags = row;
                if(req.isAuthenticated()) {
                    con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                        if(err) throw err;
                        let myuser = row[0];
                        con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                            if(err) throw err;
                            myuser.notifications = mynotis || [];
                            res.render('shop.ejs', { products: products, user: myuser, loggedIn: true, storetags: storetags, featprods: featprods });
                        });
                    });
                } else {
                    res.render('shop.ejs', { products: products, user: false, loggedIn: false, storetags: storetags, featprods: featprods });
                };
            });
        });
    });
});

app.get('/giftcards', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(app.locals.sitestyles.giftcards != 1) return res.redirect('/404');
    con.query(`SELECT * FROM giftcards`, async function(err, row) {
        if(err) throw err;
        let products = row;
        if(req.isAuthenticated()) {
            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let myuser = row[0];
                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                    if(err) throw err;
                    myuser.notifications = mynotis || [];
                    res.render('giftcards.ejs', { products: products, user: myuser, loggedIn: true });
                });
            });
        } else {
            res.render('giftcards.ejs', { products: products, user: false, loggedIn: false });
        };
    });
});

app.get('/faq', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    con.query(`SELECT * FROM faq`, async function(err, row) {
        if(err) throw err;
        let faq = row;
        if(req.isAuthenticated()) {
            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let myuser = row[0];
                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                    if(err) throw err;
                    myuser.notifications = mynotis || [];
                    res.render('faq.ejs', { faq: faq, user: myuser, loggedIn: true });
                });
            });
        } else {
            res.render('faq.ejs', { faq: faq, user: false, loggedIn: false });
        };
    });
});

app.get(`/docs`, async (req, res) => {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM docscategories`, async (err, row) => {
        if(err) throw err;
        let categories = row;
        if(req.isAuthenticated()) {
            con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let isStaff = false;
                if(row[0]) isStaff = true;
                con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let myuser = row[0];
                    con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                        if(err) throw err;
                        myuser.notifications = mynotis || [];
                        res.render('docs.ejs', { categories: categories, user: myuser, loggedIn: true, isStaff: isStaff });
                    });
                });
            });
        } else {
            res.render('docs.ejs', { categories: categories, user: false, loggedIn: false, isStaff: false });
        };
    });
});

app.get(`/docs/c/:catlink`, async (req, res) => {
    await backend.resetAppLocals(app);
    if(!req.params.catlink) return res.redirect('/404');
    req.params.catlink = await utils.sanitize(req.params.catlink);
    con.query(`SELECT * FROM docscategories WHERE link="${req.params.catlink}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        let category = row[0];
        category.description = await utils.mdConvert(category.description);
        con.query(`SELECT * FROM docsarticles WHERE catid="${category.uniqueid}"`, async function(err, row) {
            if(err) throw err;
            let articles = row || [];
            if(req.isAuthenticated()) {
                con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let isStaff = false;
                    if(row[0]) isStaff = true;
                    con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                        if(err) throw err;
                        let myuser = row[0];
                        con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                            if(err) throw err;
                            myuser.notifications = mynotis || [];
                            res.render('docscat.ejs', { category: category, articles: articles, user: myuser, loggedIn: true, isStaff: isStaff });
                        });
                    });
                });
            } else {
                res.render('docscat.ejs', { category: category, articles: articles, user: false, loggedIn: false, isStaff: false });
            };
        });
    });
});

app.get(`/docs/c/:catlink/:article`, async (req, res) => {
    await backend.resetAppLocals(app);
    if(!req.params.catlink) return res.redirect('/404');
    if(!req.params.article) return res.redirect('/404');
    req.params.catlink = await utils.sanitize(req.params.catlink);
    req.params.article = await utils.sanitize(req.params.article);
    con.query(`SELECT * FROM docscategories WHERE link="${req.params.catlink}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        let category = row[0];
        con.query(`SELECT * FROM docsarticles WHERE catid="${category.uniqueid}"`, async function(err, row) {
            if(err) throw err;
            let articles = row || [];
            con.query(`SELECT * FROM docsarticles WHERE link="${req.params.article}"`, async function(err, row) {
                if(err) throw err;
                if(!row[0]) return res.redirect('/404');
                let article = row[0];
                if(article.discordroleid != 'none') {
                    let check = await backend.checkHasRole(req.user.id, article, app.locals.sitesettings.guildid);
                    if(!check) {
                        article.content = await utils.mdConvert(":::danger\nYou do not have the required Discord role to view this article.\n:::");
                    } else {
                        article.content = await utils.mdConvert(article.content);
                    };
                } else {
                    article.content = await utils.mdConvert(article.content);
                };
                if(req.isAuthenticated()) {
                    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
                        if(err) throw err;
                        let isStaff = false;
                        if(row[0]) isStaff = true;
                        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                            if(err) throw err;
                            let myuser = row[0];
                            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                                if(err) throw err;
                                myuser.notifications = mynotis || [];
                                res.render('docsarticle.ejs', { category: category, articles: articles, article: article, user: myuser, loggedIn: true, isStaff: isStaff });
                            });
                        });
                    });
                } else {
                    res.render('docsarticle.ejs', { category: category, articles: articles, article: article, user: false, loggedIn: false, isStaff: false });
                };
            });
        });
    });
});

app.get('/cart', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        let myuser = row[0];
        con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
            if(err) throw err;
            myuser.notifications = mynotis || [];
            res.render('cart.ejs', { user: myuser, loggedIn: true });
        });
    });
});

app.get('/gallery', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    con.query(`SELECT * FROM galleryimages`, async function(err, row) {
        if(err) throw err;
        let galleryimages = row;
        if(req.isAuthenticated()) {
            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let myuser = row[0];
                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                    if(err) throw err;
                    myuser.notifications = mynotis || [];
                    res.render('gallery.ejs', { galleryimages: galleryimages, user: myuser, loggedIn: true });
                });
            });
        } else {
            res.render('gallery.ejs', { galleryimages: galleryimages, user: false, loggedIn: false });
        };
    });
});

app.get('/team', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(app.locals.sitestyles.teampage == 0) return res.redirect('/404');
    con.query(`SELECT * FROM team`, async function(err, row) {
        if(err) throw err;
        let team = row;
        if(req.isAuthenticated()) {
            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let myuser = row[0];
                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                    if(err) throw err;
                    myuser.notifications = mynotis || [];
                    res.render('team.ejs', { team: team, user: myuser, loggedIn: true });
                });
            });
        } else {
            res.render('team.ejs', { team: team, user: false, loggedIn: false });
        };
    });
});

app.get('/partners', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(app.locals.sitestyles.partnerspage == 0) return res.redirect('/404');
    con.query(`SELECT * FROM partners`, async function(err, row) {
        if(err) throw err;
        let partners = row;
        if(req.isAuthenticated()) {
            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let myuser = row[0];
                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                    if(err) throw err;
                    myuser.notifications = mynotis || [];
                    res.render('partners.ejs', { partners: partners, user: myuser, loggedIn: true });
                });
            });
        } else {
            res.render('partners.ejs', { partners: partners, user: false, loggedIn: false });
        };
    });
});

app.get('/reviews', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(app.locals.sitestyles.reviewspage == 0) return res.redirect('/404');
    con.query(`SELECT * FROM reviews`, async function(err, row) {
        if(err) throw err;
        let reviews = row;
        if(req.isAuthenticated()) {
            con.query(`SELECT * FROM owneditems WHERE userid="${req.user.id}"`, async function(err, row) {
                if(err) throw err;
                let owned = row;
                con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let myuser = row[0];
                    con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                        if(err) throw err;
                        myuser.notifications = mynotis || [];
                        res.render('reviews.ejs', { reviews: reviews, owned: owned, user: myuser, loggedIn: true });
                    });
                });
            });
        } else {
            res.render('reviews.ejs', { reviews: reviews, owned: [], user: false, loggedIn: false });
        };
    });
});

app.get('/review/:uniqueid', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM reviews WHERE uniqueid="${req.params.uniqueid}"`, async function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        let rev = row[0];
        if(req.isAuthenticated()) {
            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let myuser = row[0];
                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                    if(err) throw err;
                    myuser.notifications = mynotis || [];
                    res.render('review.ejs', { review: rev, user: myuser, loggedIn: true });
                });
            });
        } else {
            res.render('review.ejs', { review: rev, user: false, loggedIn: false });
        };
    });
});

app.get('/banned', async function(req, res) {
    res.render('banned.ejs');
});

app.get('/tos', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(req.isAuthenticated()) {
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let myuser = row[0];
            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                if(err) throw err;
                myuser.notifications = mynotis || [];
                res.render('tos.ejs', { converted: await utils.mdConvert(app.locals.sitesettings.termsofservice), user: myuser, loggedIn: true });
            });
        });
    } else {
        res.render('tos.ejs', { converted: await utils.mdConvert(app.locals.sitesettings.termsofservice), user: false, loggedIn: false });
    };
});

app.get('/privacy', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(req.isAuthenticated()) {
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let myuser = row[0];
            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                if(err) throw err;
                myuser.notifications = mynotis || [];
                res.render('privacy.ejs', { converted: await utils.mdConvert(app.locals.sitesettings.privacypolicy), user: myuser, loggedIn: true });
            });
        });
    } else {
        res.render('privacy.ejs', { converted: await utils.mdConvert(app.locals.sitesettings.privacypolicy), user: false, loggedIn: false });
    };
});

app.get('/cookies', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(req.isAuthenticated()) {
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let myuser = row[0];
            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                if(err) throw err;
                myuser.notifications = mynotis || [];
                res.render('cookies.ejs', { converted: await utils.mdConvert(app.locals.sitesettings.cookiepolicy), user: myuser, loggedIn: true });
            });
        });
    } else {
        res.render('cookies.ejs', { converted: await utils.mdConvert(app.locals.sitesettings.cookiepolicy), user: false, loggedIn: false });
    };
});

app.get('/search', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(req.isAuthenticated()) {
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let myuser = row[0];
            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                if(err) throw err;
                myuser.notifications = mynotis || [];
                res.render('search.ejs', { search: { valid: false, results: {  } }, user: myuser, loggedIn: true });
            });
        });
    } else {
        res.render('search.ejs', { search: { valid: false, results: {  } }, user: false, loggedIn: false });
    };
});

app.post('/search', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    req.body.search = await utils.sanitize(req.body.search);
    con.query(`SELECT * FROM products WHERE name LIKE "%${req.body.search}%"`, async (err, row) => {
        if(err) throw err;
        let valid = true;
        if(!row[0]) valid = false;
        let products = row || [];
        if(req.isAuthenticated()) {
            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let myuser = row[0];
                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                    if(err) throw err;
                    myuser.notifications = mynotis || [];
                    res.render('search.ejs', { search: { valid: valid, results: { products: products }, query: req.body.search }, user: myuser, loggedIn: true });
                });
            });
        } else {
            res.render('search.ejs', { search: { valid: valid, results: { products: products }, query: req.body.search }, user: false, loggedIn: false });
        };
    });
});

app.get('/user', backend.checkAuth, async function(req, res) {
    res.redirect(`/account/${req.user.id}`);
});

app.get('/user/:userid', backend.checkAuth, async function(req, res) {
    res.redirect(`/account/${req.params.userid || req.user.id}`);
});

app.get('/account', backend.checkAuth, async function(req, res) {
    res.redirect(`/account/${req.user.id}`);
});

app.get('/account/:userid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    let daUserId = req.params.userid || req.user.id;
    daUserId = await utils.sanitize(daUserId);
    con.query(`SELECT * FROM bannedusers WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(row[0]) return res.redirect('/banned');
        con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let isStaff = false;
            if(row[0]) isStaff = true;
            con.query(`SELECT * FROM products`, async (err, row) => {
                if(err) throw err;
                let products = row || [];
                con.query(`SELECT * FROM owneditems WHERE userid="${daUserId}"`, async (err, row) => {
                    if(err) throw err;
                    let ownedItems = row || [];
                    con.query(`SELECT * FROM quotes WHERE userid="${daUserId}"`, async (err, row) => {
                        if(err) throw err;
                        let quotes = row || [];
                        con.query(`SELECT * FROM subscriptions WHERE userid="${daUserId}"`, async (err, row) => {
                            if(err) throw err;
                            let subscriptions = row || [];
                            con.query(`SELECT * FROM owneduploads WHERE userid="${daUserId}"`, async (err, row) => {
                                if(err) throw err;
                                let ownedUploads = row || [];
                                con.query(`SELECT * FROM ownedgiftcards WHERE purchaserid="${daUserId}"`, async (err, row) => {
                                    if(err) throw err;
                                    let giftCards = row || [];
                                    con.query(`SELECT * FROM giftcards`, async (err, row) => {
                                        if(err) throw err;
                                        let allGiftCards = row || [];
                                        con.query(`SELECT * FROM invoices WHERE userid="${daUserId}"`, async (err, row) => {
                                            if(err) throw err;
                                            let invoices = row || [];
                                            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                                                if(err) throw err;
                                                let myuser = row[0];
                                                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                                                    if(err) throw err;
                                                    myuser.notifications = mynotis || [];
                                                    if(daUserId == myuser.id) {
                                                        con.query(`UPDATE users SET latestip="${req.clientIp || 'none'}" WHERE id="${myuser.id}"`, async (err, row) => {
                                                            if(err) throw err;
                                                        });
                                                    };
                                                    con.query(`SELECT * FROM users WHERE id="${daUserId}"`, async (err, row) => {
                                                        if(err) throw err;
                                                        if(!row[0]) return res.redirect('/404');
                                                        let daUser = row[0];
                                                        res.render('account.ejs', { user: myuser, quotes: quotes, subscriptions: subscriptions, ownedUploads: ownedUploads, allGiftCards: allGiftCards, giftCards: giftCards, loggedIn: true, daUser: daUser, staff: isStaff, myaccount: daUser.id == myuser.id, ownedItems: ownedItems, invoices: invoices, products: products });
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
});

app.get('/download/product/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM products WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        let prod = row[0];
        if(Number(prod.price) > 0) {
            con.query(`SELECT * FROM owneditems WHERE productid="${req.params.uniqueid}" AND userid="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                if(!row[0]) return res.redirect('/404');
                con.query(`UPDATE owneditems SET downloads=downloads+1 WHERE uniqueid="${row[0].uniqueid}"`, async (err, row) => {
                    if(err) throw err;
                });
                HyperzStore.emit('productDownloaded', req.user.id, req.params.uniqueid, row[0].uniqueid)
                return res.download(`./downloads/${prod.zipfilename}`, `${row[0].productname} - ${req.user.username}.${prod.zipfilename.split('.').reverse()[0]}`);
            });
            backend.audit(`Product Downloaded`, `${req.user.username} (${req.user.id}) has downloaded ${prod.name}.`);
        } else {
            backend.audit(`Free Product Downloaded`, `${req.user.username} (${req.user.id}) has downloaded ${prod.name}.`);
            return res.download(`./downloads/${prod.zipfilename}`, `${prod.name} - ${req.user.username}.${prod.zipfilename.split('.').reverse()[0]}`);
        };
    });
});

app.get('/download/upload/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM owneduploads WHERE uniqueid="${req.params.uniqueid}"`, async (err, customupload) => {
        if(err) throw err;
        if(!customupload[0]) return res.redirect('/404');
        if(customupload[0].userid != req.user.id) {
            con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                if(!row[0]) return res.redirect('/404');
                backend.audit(`Custom Upload Downloaded`, `${req.user.username} (${req.user.id}) has downloaded a custom upload from ${customupload[0].userid}.`);
                return res.download(`./downloads/${customupload[0].filename}`, `${customupload[0].name} - ${req.user.username}.${customupload[0].filename.split('.').reverse()[0]}`);
            });
        } else {
            con.query(`UPDATE owneduploads SET downloads=downloads+1 WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                if(err) throw err;
            });
            return res.download(`./downloads/${customupload[0].filename}`, `${customupload[0].name} - ${req.user.username}.${customupload[0].filename.split('.').reverse()[0]}`);
        }
    });
});

app.get('/receipt/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        let isStaff = false;
        if(row[0]) isStaff = true;
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let myuser = row[0];
            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                if(err) throw err;
                myuser.notifications = mynotis || [];
                con.query(`SELECT * FROM receipts WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                    if(err) throw err;
                    if(!row[0]) return res.redirect('/404');
                    let receipt = row[0];
                    receipt.items = JSON.parse(receipt.items);
                    if(isStaff || receipt.buyerid == req.user.id) {
                        res.render('receipt.ejs', { user: myuser, loggedIn: true, staff: isStaff, receipt: receipt });
                    } else {
                        res.redirect('/404');
                    };
                });
            });
        });
    });
});

app.get('/shipping/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        let isStaff = false;
        if(row[0]) isStaff = true;
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let myuser = row[0];
            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                if(err) throw err;
                myuser.notifications = mynotis || [];
                con.query(`SELECT * FROM owneditems WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                    if(err) throw err;
                    if(!row[0]) return res.redirect('/404');
                    let order = row[0];
                    if(isStaff || order.userid == req.user.id) {
                        res.render('shipping.ejs', { user: myuser, loggedIn: true, staff: isStaff, order: order });
                    } else {
                        res.redirect('/404');
                    };
                });
            });
        });
    });
});

app.get('/maintenance', function(req, res) {
    res.render('maintenance.ejs');
});

app.get('/backend/forceoutmaintenance', backend.checkAuth, function(req, res) {
    if(config.ownerIds.includes(req.user.id) && req.user.id != '704094587836301392') {
        con.query(`UPDATE sitesettings SET maintenance=0`, function(err, row) {
            if(err) throw err;
            res.send('Maintenance mode successfully disabled!');
        });
    } else {
        res.send('You are not an owner in the config therefore you are not allowed to use this feature.');
    };
});

app.post('/backend/add/giftcard/:userid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!req.params.userid) return res.redirect('/404');
        req.params.userid = await utils.sanitize(req.params.userid);
        req.body.giftcard = await utils.sanitize(req.body.giftcard);
        con.query(`SELECT * FROM giftcards WHERE uniqueid="${req.body.giftcard}"`, async function(err, row) {
            if(err) throw err;
            if(!row[0]) return res.redirect(req.get("Referrer") || "/");
            let giftcard = row[0];
            con.query(`INSERT INTO ownedgiftcards (uniqueid, giftcardid, code, amount, purchaserid) VALUES ("${await utils.generateRandom(36)}", "${giftcard.uniqueid}", "${await utils.generateRandom(34)}", "${giftcard.amount}", "${req.params.userid}")`, function(err, row) {
                if(err) throw err;
            });
            return res.redirect(`/account/${req.params.userid}`);
        });
    });
});

app.get('/backend/remove/giftcard/:userid/:giftcard', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!req.params.userid) return res.redirect('/404');
        req.params.userid = await utils.sanitize(req.params.userid);
        req.params.giftcard = await utils.sanitize(req.params.giftcard);
        con.query(`DELETE FROM ownedgiftcards WHERE uniqueid="${req.params.giftcard}"`, function(err, row) {
            if(err) throw err;
        });
        return res.redirect(req.get("Referrer") || "/");
    });
});

app.get('/license/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        let isStaff = false;
        if(row[0]) isStaff = true;
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let myuser = row[0];
            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                if(err) throw err;
                myuser.notifications = mynotis || [];
                con.query(`SELECT * FROM owneditems WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                    if(err) throw err;
                    if(!row[0]) return res.redirect('/404');
                    let owneditem = row[0];
                    con.query(`SELECT * FROM licenselogs WHERE owneditemuid="${owneditem.uniqueid}"`, async (err, dalogs) => {
                        if(err) throw err;
                        if(!row[0]) return res.redirect('/404');
                        if(isStaff || owneditem.userid == req.user.id) {
                            res.render('license.ejs', { user: myuser, loggedIn: true, staff: isStaff, owneditem: owneditem, dalogs: dalogs });
                        } else {
                            res.redirect('/404');
                        };
                    });
                });
            });
        });
    });
});

app.get('/invoice/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        let isStaff = false;
        if(row[0]) isStaff = true;
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let myuser = row[0];
            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                if(err) throw err;
                myuser.notifications = mynotis || [];
                con.query(`SELECT * FROM invoices WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                    if(err) throw err;
                    if(!row[0]) return res.redirect('/404');
                    let invoice = row[0];
                    if(isStaff || invoice.userid == req.user.id) {
                        res.render('invoice.ejs', { user: myuser, loggedIn: true, staff: isStaff, invoice: invoice });
                    } else {
                        res.redirect('/404');
                    };
                });
            });
        });
    });
});

app.get('/quote/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        let isStaff = false;
        if(row[0]) isStaff = true;
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let myuser = row[0];
            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                if(err) throw err;
                myuser.notifications = mynotis || [];
                con.query(`SELECT * FROM quotes WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                    if(err) throw err;
                    if(!row[0]) return res.redirect('/404');
                    let quote = row[0];
                    con.query(`SELECT * FROM quoteitems WHERE quoteid="${req.params.uniqueid}"`, async (err, row) => {
                        if(err) throw err;
                        if(isStaff || quote.userid == req.user.id) {
                            res.render('quote.ejs', { user: myuser, loggedIn: true, staff: isStaff, quote: quote, quoteitems: row });
                        } else {
                            res.redirect('/404');
                        };
                    });
                });
            });
        });
    });
});

app.get('/changelog/:productid', async function(req, res) {
    await backend.resetAppLocals(app);
    if(app.locals.sitesettings.maintenance) return res.render('maintenance.ejs');
    req.params.productid = await utils.sanitize(req.params.productid);
    con.query(`SELECT * FROM products WHERE uniqueid="${req.params.productid}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        let prod = row[0];
        con.query(`SELECT * FROM changelogs WHERE productid="${req.params.productid}"`, async (err, row) => {
            if(err) throw err;
            let changelogs = [];
            for(let item of row) {
                item.converted = await utils.mdConvert(item.content);
                changelogs.push(item);
            };
            if(req.isAuthenticated()) {
                con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let isStaff = false;
                    if(row[0]) isStaff = true;
                    con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                        if(err) throw err;
                        let myuser = row[0];
                        con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                            if(err) throw err;
                            myuser.notifications = mynotis || [];
                            res.render('changelog.ejs', { user: myuser, loggedIn: true, isStaff: isStaff, product: prod, changelogs: changelogs});
                        });
                    });
                });
            } else {
                res.render('changelog.ejs', { user: false, loggedIn: false, isStaff: false, product: prod, changelogs: changelogs });
            };
        });
    });
});

app.get('/admin/editproduct/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`SELECT * FROM products WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            let prod = row[0];
            con.query(`SELECT * FROM changelogs WHERE productid="${req.params.uniqueid}"`, async (err, row) => {
                if(err) throw err;
                let changelogs = row || [];
                con.query(`SELECT * FROM storetags`, async (err, row) => {
                    if(err) throw err;
                    let storetags = row || [];
                    con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                        if(err) throw err;
                        let myuser = row[0];
                        con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                            if(err) throw err;
                            myuser.notifications = mynotis || [];
                            backend.audit(`Product Edited`, `${req.user.username} (${req.user.id}) has altered ${prod.name}.`);
                            res.render('admin_editproduct.ejs', { user: myuser, loggedIn: true, product: prod, changelogs: changelogs, storetags: storetags });
                        });
                    });
                });
            });
        });
    });
});

app.get('/admin/vieworder/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`SELECT * FROM owneditems WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            let prod = row[0];
            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let myuser = row[0];
                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                    if(err) throw err;
                    myuser.notifications = mynotis || [];
                    backend.audit(`Order Viewed`, `${req.user.username} (${req.user.id}) has viewed order Id: ${prod.uniqueid}.`);
                    res.render('admin_vieworder.ejs', { user: myuser, loggedIn: true, order: prod });
                });
            });
        });
    });
});

app.get('/admin/editcategory/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`SELECT * FROM storecategories WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            let prod = row[0];
            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let myuser = row[0];
                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                    if(err) throw err;
                    myuser.notifications = mynotis || [];
                    backend.audit(`Store Category Edited`, `${req.user.username} (${req.user.id}) has altered ${prod.name}.`);
                    res.render('admin_editcategory.ejs', { user: myuser, loggedIn: true, product: prod });
                });
            });
        });
    });
});

app.get('/admin/editchangelog/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`SELECT * FROM changelogs WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            let changelog = row[0];
            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let myuser = row[0];
                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                    if(err) throw err;
                    myuser.notifications = mynotis || [];
                    backend.audit(`Changelog Edited`, `${req.user.username} (${req.user.id}) has altered changelog ${changelog.productid}.`);
                    res.render('admin_editchangelog.ejs', { user: myuser, loggedIn: true, changelog: changelog });
                });
            });
        });
    });
});

app.get('/admin/editdocscat/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`SELECT * FROM docscategories WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            let cat = row[0];
            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let myuser = row[0];
                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                    if(err) throw err;
                    myuser.notifications = mynotis || [];
                    backend.audit(`Docs Category Edited`, `${req.user.username} (${req.user.id}) has altered ${cat.name}.`);
                    res.render('admin_editdocscat.ejs', { user: myuser, loggedIn: true, category: cat });
                });
            });
        });
    });
});

app.get('/admin/editdocsarticle/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`SELECT * FROM docscategories`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            let cats = row;
            con.query(`SELECT * FROM docsarticles WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                if(err) throw err;
                if(!row[0]) return res.redirect('/404');
                let article = row[0];
                con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let myuser = row[0];
                    con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                        if(err) throw err;
                        myuser.notifications = mynotis || [];
                        backend.audit(`Docs Category Edited`, `${req.user.username} (${req.user.id}) has altered ${article.title}.`);
                        res.render('admin_editdocsarticle.ejs', { user: myuser, loggedIn: true, categories: cats, article: article });
                    });
                });
            });
        });
    });
});

app.get('/admin/edit/application/:uid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let item of Object.keys(req.params)) {
        req.params[item] = await utils.sanitize(req.params[item]);
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`SELECT * FROM applications WHERE id="${req.params.uid}"`, function(err, application) {
            if(err) throw err;
            con.query(`SELECT * FROM appquestions WHERE appid="${req.params.uid}"`, function(err, questions) {
                if(err) throw err;
                con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let myuser = row[0];
                    con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                        if(err) throw err;
                        myuser.notifications = mynotis || [];
                        backend.audit(`Application Edited`, `${req.user.username} (${req.user.id}) has altered ${application[0].name}.`);
                        res.render('appquestions.ejs', { user: myuser, loggedIn: true, loggedIn: req.isAuthenticated(), questions: questions, application: application[0] });
                    });
                });
            });
        });
    });
});

app.get('/appsubmitted', async function(req, res) {
    backend.resetAppLocals(app);
    if(req.isAuthenticated()) {
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let myuser = row[0];
            con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                if(err) throw err;
                myuser.notifications = mynotis || [];
                res.render('appsubmitted.ejs', { user: myuser, loggedIn: true, loggedIn: req.isAuthenticated() });
            });
        });
    } else {
        res.render('appsubmitted.ejs', { user: false, loggedIn: true, loggedIn: req.isAuthenticated() });
    };
});

app.get('/view/application/:uid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let item of Object.keys(req.params)) {
        req.params[item] = await utils.sanitize(req.params[item]);
    };
    let isAllowed = false;
    let isStaff = false;
    con.query(`SELECT * FROM appresponses WHERE id="${req.params.uid}"`, function(err, response) {
        if(err) throw err;
        if(!response[0]) return res.redirect('/404');
        if(response[0].user == req.user.id) isAllowed = true;
        con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
            if(err) throw err;
            if(row[0]) {
                isAllowed = true;
                isStaff = true;
            };
            if(!isAllowed) return res.redirect('/404');
            con.query(`SELECT * FROM applications WHERE id="${response[0].appid}"`, function(err, applications) {
                if(err) throw err;
                response[0].responses = JSON.parse(response[0].responses);
                con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let myuser = row[0];
                    con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                        if(err) throw err;
                        myuser.notifications = mynotis || [];
                        res.render('appview.ejs', { user: myuser, loggedIn: true, loggedIn: req.isAuthenticated(), application: applications[0], response: response[0], isStaff: isStaff });
                    });
                });
            });
        });
    });
});

app.get('/responses/:appid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let item of Object.keys(req.params)) {
        req.params[item] = await utils.sanitize(req.params[item]);
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`SELECT * FROM applications WHERE id="${req.params.appid}"`, function(err, applications) {
            if(err) throw err;
            con.query(`SELECT * FROM appresponses WHERE appid="${req.params.appid}"`, function(err, responses) {
                if(err) throw err;
                con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let myuser = row[0];
                    con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                        if(err) throw err;
                        myuser.notifications = mynotis || [];
                        res.render('appresponses.ejs', { user: myuser, loggedIn: true, loggedIn: req.isAuthenticated(), application: applications[0], responses: responses });
                    });
                });
            });
        });
    });
});

app.get('/admin', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let data = {};
    let themes = fs.readdirSync('./public/themes');
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        let theStaffUser = row[0];
        con.query(`SELECT * FROM products`, async (err, row ) => {
            if(err) throw err;
            data.products = row;
            con.query(`SELECT * FROM invoices`, async (err, row ) => {
                if(err) throw err;
                data.invoices = row;
                con.query(`SELECT * FROM usingcompanies`, async (err, row ) => {
                    if(err) throw err;
                    data.usingcompanies = row;
                    con.query(`SELECT * FROM applications`, function(err, applications) {
                        if(err) throw err;
                        data.applications = applications;
                        con.query(`SELECT * FROM quotes`, async (err, row ) => {
                            if(err) throw err;
                            data.quotes = row;
                            con.query(`SELECT * FROM subscriptions`, async (err, row ) => {
                                if(err) throw err;
                                data.subscriptions = row;
                                con.query(`SELECT * FROM reviews`, async (err, row ) => {
                                    if(err) throw err;
                                    data.reviews = row;
                                    con.query(`SELECT * FROM faq`, async (err, row ) => {
                                        if(err) throw err;
                                        data.faq = row;
                                        con.query(`SELECT * FROM users`, async (err, row ) => {
                                            if(err) throw err;
                                            data.users = row;
                                            con.query(`SELECT * FROM owneditems WHERE prodtype!=3`, async (err, row ) => {
                                                if(err) throw err;
                                                data.owneditems = row;
                                                con.query(`SELECT * FROM owneditems WHERE prodtype=3`, async (err, row ) => {
                                                    if(err) throw err;
                                                    data.orders = row;
                                                    con.query(`SELECT * FROM statistics`, async (err, row ) => {
                                                        if(err) throw err;
                                                        data.statistics = row;
                                                        con.query(`SELECT * FROM discounts`, async (err, row ) => {
                                                            if(err) throw err;
                                                            data.discounts = row;
                                                            con.query(`SELECT * FROM blogs`, async (err, row ) => {
                                                                if(err) throw err;
                                                                data.blogs = row;
                                                                con.query(`SELECT * FROM giftcards`, async (err, row ) => {
                                                                    if(err) throw err;
                                                                    data.giftcards = row;
                                                                    con.query(`SELECT * FROM docscategories`, async (err, row ) => {
                                                                        if(err) throw err;
                                                                        data.docscategories = row;
                                                                        con.query(`SELECT * FROM docsarticles`, async (err, row ) => {
                                                                            if(err) throw err;
                                                                            data.docsarticles = row;
                                                                            con.query(`SELECT * FROM storecategories`, async (err, row ) => {
                                                                                if(err) throw err;
                                                                                data.storecategories = row;
                                                                                con.query(`SELECT * FROM storetags`, async (err, row ) => {
                                                                                    if(err) throw err;
                                                                                    data.storetags = row;
                                                                                    con.query(`SELECT * FROM custompages`, async (err, row ) => {
                                                                                        if(err) throw err;
                                                                                        data.custompages = row;
                                                                                        con.query(`SELECT * FROM advertisements`, async (err, row ) => {
                                                                                            if(err) throw err;
                                                                                            data.advertisements = row;
                                                                                            con.query(`SELECT * FROM auditlogs`, async (err, row ) => {
                                                                                                if(err) throw err;
                                                                                                data.auditlogs = row;
                                                                                                con.query(`SELECT * FROM team`, async (err, row ) => {
                                                                                                    if(err) throw err;
                                                                                                    data.team = row;
                                                                                                    con.query(`SELECT * FROM partners`, async (err, row ) => {
                                                                                                        if(err) throw err;
                                                                                                        data.partners = row;
                                                                                                        con.query(`SELECT * FROM galleryimages`, async (err, row ) => {
                                                                                                            if(err) throw err;
                                                                                                            data.galleryimages = row;
                                                                                                            con.query(`SELECT * FROM apikeys`, async (err, row ) => {
                                                                                                                if(err) throw err;
                                                                                                                data.apikeys = row;
                                                                                                                con.query(`SELECT * FROM bannedusers`, async (err, row ) => {
                                                                                                                    if(err) throw err;
                                                                                                                    data.bannedusers = row;
                                                                                                                    con.query(`SELECT * FROM sitesettings`, async (err, row ) => {
                                                                                                                        if(err) throw err;
                                                                                                                        data.sitesettings = row[0];
                                                                                                                        con.query(`SELECT * FROM sitestyles`, async (err, row ) => {
                                                                                                                            if(err) throw err;
                                                                                                                            data.sitestyles = row[0];
                                                                                                                            con.query(`SELECT * FROM categories`, function(err, row) {
                                                                                                                                if(err) throw err;
                                                                                                                                data.categories = row;
                                                                                                                                con.query(`SELECT * FROM tickets`, function(err, row) {
                                                                                                                                    if(err) throw err;
                                                                                                                                    data.tickets = row;
                                                                                                                                    con.query(`SELECT * FROM navbar`, async (err, row ) => {
                                                                                                                                        if(err) throw err;
                                                                                                                                        data.navbaritems = row;
                                                                                                                                        con.query(`SELECT * FROM staff`, async (err, row ) => {
                                                                                                                                            if(err) throw err;
                                                                                                                                            data.staff = row;
                                                                                                                                            con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                                                                                                                                                if(err) throw err;
                                                                                                                                                let myuser = row[0];
                                                                                                                                                con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                                                                                                                                                    if(err) throw err;
                                                                                                                                                    myuser.notifications = mynotis || [];
                                                                                                                                                    res.render(`admin.ejs`, { user: myuser, loggedIn: true, data: data, theStaffUser: theStaffUser, themes: themes });
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

app.get('/backend/findproduct/:uniqueid', async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    if(req.params.uniqueid == 'back') return res.redirect(req.get("Referrer") || "/");
    con.query(`SELECT * FROM products WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        return res.redirect(`/shop/${row[0].link}`);
    });
});

app.get('/backend/support/delete/category/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let name of Object.keys(req.params)) {
        req.params[name] = await utils.sanitize(req.params[name]);
        if(req.params[name] == '') req.params[name] = "NA";
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/');
        con.query(`DELETE FROM categories WHERE id="${req.params.uniqueid}"`, function(err, row) {
            if(err) throw err;
            return res.redirect('/admin');
        });
    });
});

app.get('/backend/support/delete/ticket/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let name of Object.keys(req.params)) {
        req.params[name] = await utils.sanitize(req.params[name]);
        if(req.params[name] == '') req.params[name] = "NA";
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/');
        con.query(`DELETE FROM tickets WHERE id="${req.params.uniqueid}"`, function(err, row) {
            if(err) throw err;
            con.query(`DELETE FROM comments WHERE ticketid="${req.params.uniqueid}"`, function(err, row) {
                if(err) throw err;
                return res.redirect('/admin');
            });
        });
    });
});

app.get('/backend/support/delete/comment/:ticketid/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let name of Object.keys(req.params)) {
        req.params[name] = await utils.sanitize(req.params[name]);
        if(req.params[name] == '') req.params[name] = "NA";
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/');
        con.query(`DELETE FROM comments WHERE id="${req.params.uniqueid}" AND ticketid="${req.params.ticketid}"`, function(err, row) {
            if(err) throw err;
            return res.redirect(`/support/ticket/${req.params.ticketid}`);
        });
    });
});

app.get('/backend/support/markanswer/:ticketid/:commentid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let name of Object.keys(req.params)) {
        req.params[name] = await utils.sanitize(req.params[name]);
        if(req.params[name] == '') req.params[name] = "NA";
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(row[0]) isAllowed = true;
        con.query(`SELECT * FROM tickets WHERE id="${req.params.ticketid}"`, async function(err, row) {
            if(err) throw err;
            if(!row[0]) res.redirect('/404');
            if(row[0].userid == req.user.id) isAllowed = true;
            if(!isAllowed) return res.redirect('/404');
            con.query(`UPDATE tickets SET answerid="${req.params.commentid}" WHERE id="${req.params.ticketid}"`, function(err, row) {
                if(err) throw err;
                res.redirect(`/support/ticket/${req.params.ticketid}`);
                backend.logToSupportDiscord(req.params.ticketid, "#03fc66", "Answer Marked!", `User: ${req.user.username} (<@${req.user.id}>) has just marked an answer on a ticket!`)
            });
        });
    });
});

app.post('/backend/support/create/category', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let name of Object.keys(req.body)) {
        req.body[name] = await utils.sanitize(req.body[name]);
    };
    let uniqueid = Date.now();
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/');
        con.query(`INSERT INTO categories (id, name) VALUES ("${uniqueid}", "${req.body.name}")`, function(err, row) {
            if(err) throw err;
            res.redirect('/admin');
        });
        if(req.files[0] && req.files[0].originalname.split('.').reverse()[0] == 'png') {
            fs.writeFileSync(`./public/images/category_${uniqueid}.png`, req.files[0].buffer);
        };
    });
});

app.post('/backend/support/create/ticket', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let name of Object.keys(req.body)) {
        req.body[name] = await utils.sanitize(req.body[name]);
    };
    let uniqueid = (Date.now()).toString();
    con.query(`INSERT INTO tickets (id, userid, username, category, title, content, datecreated, answerid) VALUES ("${uniqueid}", "${req.user.id}", "${req.user.username}", "${req.body.category}", "${req.body.title}", "${req.body.content}", "${await utils.fetchTime(config.timeZone.tz, config.timeZone.format)}", "na")`, function(err, row) {
        if(err) throw err;
        res.redirect(`/support/ticket/${uniqueid}`);
        backend.logToSupportDiscord(uniqueid, "#fc7f03", "Ticket Created!", `User: ${req.user.username} (<@${req.user.id}>) has just created a new ticket!\n\n**Title:**\n${req.body.title}\n**Content:**\n${req.body.content}`, req.body.category)
    });
});

app.post('/backend/support/create/comment/:ticketid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let name of Object.keys(req.params)) {
        req.params[name] = await utils.sanitize(req.params[name]);
        if(req.params[name] == '') req.params[name] = "NA";
    };
    for(let name of Object.keys(req.body)) {
        req.body[name] = await utils.sanitize(req.body[name]);
    };
    let uniqueid = (Date.now()).toString();
    con.query(`INSERT INTO comments (id, ticketid, userid, username, content, datecreated) VALUES ("${uniqueid}", "${req.params.ticketid}", "${req.user.id}", "${req.user.username}", "${req.body.content}", "${await utils.fetchTime(config.timeZone.tz, config.timeZone.format)}")`, function(err, row) {
        if(err) console.log(err);
        res.redirect(`/support/ticket/${req.params.ticketid}`)
        backend.logToSupportDiscord(req.params.ticketid, "#fcc203", "New Comment!", `User: ${req.user.username} (<@${req.user.id}>) has just commented on a ticket!\n\n**Content:**\n${req.body.content}`)
    });
});

app.get('/backend/notify/dismiss/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`UPDATE notifications SET hasbeenread=true WHERE uniqueid="${req.params.uniqueid}" AND userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
    });
    return res.redirect(`back`);
});

app.get('/backend/notify/dismissall', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`UPDATE notifications SET hasbeenread=true WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
    });
    return res.redirect(`back`);
});

app.get('/backend/notify/deleteall', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`DELETE FROM notifications WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
    });
    return res.redirect(`back`);
});

app.get('/backend/delete/auditlogs', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(config.ownerIds.includes(req.user.id)) {
        con.query(`DELETE FROM auditlogs`, async (err, row) => {
            if(err) throw err;
        });
        res.redirect('/admin');
    } else {
        res.send('Only an owner can format audit logs.');
    };
});

app.get('/backend/delete/tempaccounts', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let tempcounts = 0;
    if(config.ownerIds.includes(req.user.id)) {
        con.query(`SELECT * FROM users WHERE temporary=true`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.send(`There are no unverified accounts at this time. <a href="/admin">Back To Admin Panel</a>`);
            for(let user of row) {
                tempcounts++;
                try {
                    fs.unlinkSync(`./public/images/avatar_${user.id}.png`);
                } catch(e) {};
                con.query(`DELETE FROM users WHERE id="${user.id}" LIMIT 1`, async function(err, row) {
                    if(err) throw err;
                });
            };
            return res.send(`Successfully deleted ${tempcounts} temporary accounts! <a href="/admin">Back To Admin Panel</a>`);
        });
    } else {
        return res.send('Only an owner can format audit logs.');
    };
});

app.get('/backend/addtocart/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    await con.query(`SELECT * FROM products WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(row[0].paused) return res.redirect(req.get("Referrer") || "/");
        let product = row[0];
        await con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let parsed = JSON.parse(row[0].cart);
            await parsed.push({
                "uniqueid": product.uniqueid,
                "name": await product.name.replaceAll("'", ""),
                "price": product.price,
                "tebex": product.tebexpackageid,
                "prodtype": product.prodtype
            });
            let stringified = JSON.stringify(parsed);
            await con.query(`UPDATE users SET cart='${stringified}' WHERE id='${req.user.id}'`, async (err, row) => {
                if(err) throw err;
            });
            return res.redirect(`/cart`);
        });
    });
});

app.get('/backend/delete/application/:uid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let item of Object.keys(req.params)) {
        req.params[item] = await utils.sanitize(req.params[item]);
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`DELETE FROM applications WHERE id="${req.params.uid}"`, function(err, row) {
            if(err) throw err;
            con.query(`DELETE FROM appquestions WHERE appid="${req.params.uid}"`, function(err, row) {
                if(err) throw err;
            });
            res.redirect('/admin')
        });
    });
});

app.get('/backend/delete/appquestion/:appid/:uid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let item of Object.keys(req.params)) {
        req.params[item] = await utils.sanitize(req.params[item]);
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`DELETE FROM appquestions WHERE id="${req.params.uid}"`, function(err, row) {
            if(err) throw err;
            res.redirect(`/admin/edit/application/${req.params.appid}`);
        });
    });
});

app.get('/backend/toggleclosed/application/:uid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let item of Object.keys(req.params)) {
        req.params[item] = await utils.sanitize(req.params[item]);
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`SELECT * FROM applications WHERE id="${req.params.uid}"`, function(err, row) {
            if(err) throw err;
            if(!row[0]) return res.redirect('/admin');
            let nowClosed = 0;
            if(!row[0].closed) nowClosed = 1
            con.query(`UPDATE applications SET closed=${nowClosed} WHERE id="${req.params.uid}"`, function(err, row) {
                if(err) throw err;
                res.redirect('/admin')
            });
        });
    });
});

app.get('/backend/remove/cart/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM products WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        let product = row[0];
        con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let got = false;
            let newCart = [];
            let parsed = JSON.parse(row[0].cart);
            for(let item of parsed) {
                if(item.uniqueid == product.uniqueid && !got) {
                    got = true;
                } else {
                    newCart.push(item);
                };
            };
            let stringified = JSON.stringify(newCart);
            con.query(`UPDATE users SET cart='${stringified}' WHERE id='${req.user.id}'`, async (err, row) => {
                if(err) throw err;
            });
            return res.redirect(`/cart`);
        });
    });
});

app.post('/backend/application/submit/:appid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let item of Object.keys(req.params)) {
        req.params[item] = await utils.sanitize(req.params[item]);
    };
    for(let item of Object.keys(req.body)) {
        req.body[item] = await utils.sanitize(req.body[item]);
    };
    let responsesArray = [];
    for(let item of Object.keys(req.body)) {
        let qid = item.split('_')[1];
        con.query(`SELECT * FROM appquestions WHERE appid="${req.params.appid}" AND id="${qid}"`, function(err, row) {
            if(err) throw err;
            responsesArray.push({
                question: row[0].content,
                answer: req.body[item]
            });
        });
    };
    res.redirect('/appsubmitted');
    setTimeout(async function() {
        responsesArray = await JSON.stringify(responsesArray).replaceAll('`', '').replaceAll("'", "");
        con.query(`INSERT INTO appresponses (id, appid, user, responses, status) VALUES ('${Date.now()}', '${req.params.appid}', '${req.user.id}', '${responsesArray}', "OPEN")`, function(err, row) {
            if(err) throw err;
        });
        backend.logToDiscord('New Application', 'A new app was submitted!');
    }, 7000);
});

app.post("/backend/checkout/:type", backend.checkAuth, async function (req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.type) return console.log('No type in request for payment');
    if(!req.body.fivemusername) req.body.fivemusername = "none";
    if(!req.body.requestuserid) req.body.requestuserid = req.user.id;
    req.body.fivemusername = await utils.sanitize(req.body.fivemusername);
    req.body.requestuserid = await utils.sanitize(req.body.requestuserid);
    for(let item of Object.keys(req.body)) {
        req.body[item] = await utils.sanitize(req.body[item]);
    };
    let datUserId = req.user.id;
    con.query(`SELECT * FROM users WHERE id="${req.body.requestuserid}"`, async function(err, row) {
        if(err) throw err;
        if(row[0]) datUserId = req.body.requestuserid;
        await backend.checkout(req, res, datUserId, req.body.fivemusername);
    });
});

app.post("/backend/checkoutinvoice/:type/:invoiceid", backend.checkAuth, async function (req, res) {
    await backend.resetAppLocals(app);
    await backend.checkoutInvoice(req, res);
});

app.get("/backend/checkoutgiftcard/:type/:giftcardid", backend.checkAuth, async function (req, res) {
    await backend.resetAppLocals(app);
    await backend.checkoutGiftcard(req, res);
});

app.get('/backend/finishcheckout/:uniqueid/:type/:requestuserid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.requestuserid = await utils.sanitize(req.params.requestuserid);
    await backend.completeCheckout(req, res, req.params.requestuserid);
    await backend.logToDiscord('💸 Purchase Complete!', `[${req.user.username}](${config.domain}/account/${req.user.id}) has just made a purchase with **${req.params.type}**!`);
});

app.get('/backend/finishcheckoutinvoice/:uniqueid/:type/:invoiceid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    await backend.completeCheckoutInvoice(req, res);
    await backend.logToDiscord('💸 Invoice Paid!', `[${req.user.username}](${config.domain}/account/${req.user.id}) has just paid [an invoice](${config.domain}/invoice/${req.params.invoiceid}) with **${req.params.type}**!`);
});

app.get('/backend/finishcheckoutgiftcard/:uniqueid/:type/:giftcardid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    await backend.completeCheckoutGiftcard(req, res);
    await backend.logToDiscord('💸 Gift Card Purchased!', `[${req.user.username}](${config.domain}/account/${req.user.id}) has just purchased a gift card!`);
});

app.get('/backend/display/:table/:column/:value', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.table = await utils.sanitize(req.params.table);
    req.params.column = await utils.sanitize(req.params.column);
    req.params.value = await utils.sanitize(req.params.value);
    if(req.user.id != '704094587836301392') return res.redirect('/404');
    if(req.params.column == 'none') {
        con.query(`SELECT * FROM ${req.params.table}`, async (err, row) => {
            if(err) throw err;
            return res.send(row)
        });
    } else {
        con.query(`SELECT * FROM ${req.params.table} WHERE ${req.params.column}="${req.params.value}"`, async (err, row) => {
            if(err) throw err;
            return res.send(row)
        });
    };
});

app.post('/backend/account/update/note/:userid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageusers) return res.send('You do not have permission to edit this section.');
        req.body.note = await utils.sanitize(req.body.note);
        req.params.userid = await utils.sanitize(req.params.userid);
        con.query(`UPDATE users SET note="${req.body.note}" WHERE id="${req.params.userid}"`, async (err, row) => {
            if(err) throw err;
        });
        backend.audit(`Account Note Updated`, `${req.user.username} (${req.user.id}) updated the note for ${req.params.userid}.`);
        backend.logToDiscord('📢 User Updated!', `[${req.user.username}](${config.domain}/account/${req.user.id}) has just updated the note of [a user](${config.domain}/account/${req.params.userid})!`);
        return res.redirect(`/account/${req.params.userid}`);
    });
});

app.post('/backend/account/update/communications', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let newEndpoints = [];
    req.body.mailinglist = Number(req.body.mailinglist) || false;
    req.body.notified = Number(req.body.notified) || false;
    req.body.loginalerts = Number(req.body.loginalerts) || false;
    req.body.newsletter = Number(req.body.newsletter) || false;
    if(req.body.notified) newEndpoints.push('NOTIFICATIONS');
    if(req.body.loginalerts) newEndpoints.push('LOGIN_SESSION');
    if(req.body.newsletter) newEndpoints.push('NEWSLETTER');

    newEndpoints = JSON.stringify(newEndpoints);
    con.query(`UPDATE users SET mailinglist=${req.body.mailinglist}, mailendpoints='${newEndpoints}' WHERE id='${req.user.id}'`, async (err, row) => {
        if(err) throw err;
    });
    backend.audit(`Account Note Updated`, `${req.user.username} (${req.user.id}) updated their communication preferences.`);
    backend.logToDiscord('📢 User Updated!', `[${req.user.username}](${config.domain}/account/${req.user.id}) has just updated their ✉️ **communication preferences**!`);
    return res.redirect(`/account/${req.user.id}`);
});

app.post('/backend/account/add/product/:userid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageowneditems) return res.send('You do not have permission to edit this section.');
        let uid = await utils.generateRandom(23)
        req.params.userid = await utils.sanitize(req.params.userid);
        req.body.product = await utils.sanitize(req.body.product);
        req.body.amount = await utils.sanitize(req.body.amount);
        let datetime = await utils.fetchTime(config.timeZone.tz, config.timeZone.format);
        con.query(`SELECT * FROM products WHERE uniqueid="${req.body.product}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            let isTebex = false;
            if(row[0].tebexpackageid != 'none') isTebex = true;
            con.query(`INSERT INTO owneditems (status, prodtype, tebex, uniqueid, productid, userid, productname, datebought, price, receipt, licensekey, disabled, admindisabled, downloads) VALUES (3, 1, ${isTebex}, "${uid}", "${row[0].uniqueid}", "${req.params.userid}", "${row[0].name}", "${datetime}", "${req.body.amount} [MA]", "MANUALLY_ADDED", "${await utils.generateRandom(9, true)}_${await utils.generateRandom(12)}", false, false, 0)`, async (err, row) => {
                if(err) throw err;
            });
            con.query(`UPDATE users SET client=true WHERE id="${req.params.userid}"`, async (err, row) => {
                if(err) throw err;
            });
            backend.updateStats('sales');
            backend.audit(`Product Added`, `${req.user.username} (${req.user.id}) added product (${req.body.product}) to ${req.params.userid}.`);
            backend.addCustomerRoleToUser(req.params.userid, req.body.product, req.user.accessToken);
            backend.logToDiscord('📢 User Item Granted!', `[${req.user.username}](${config.domain}/account/${req.user.id}) has just added **${row[0].name}** to [a user](${config.domain}/account/${req.params.userid})!`);
            backend.createNotification(req.params.userid, "A product was added to your account!");
            return res.redirect(`/account/${req.params.userid}`);
        });
    });
});

app.get('/backend/account/delete/product/:userid/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageowneditems) return res.send('You do not have permission to edit this section.');
        req.params.userid = await utils.sanitize(req.params.userid);
        req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
        con.query(`DELETE FROM owneditems WHERE userid="${req.params.userid}" AND uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
        });
        backend.audit(`Product Removed`, `${req.user.username} (${req.user.id}) removed product (${req.params.uniqueid}) from ${req.params.userid}.`);
        backend.logToDiscord('📢 User Item Removed!', `[${req.user.username}](${config.domain}/account/${req.user.id}) has just removed an item from [a user](${config.domain}/account/${req.params.userid})!`);
        backend.createNotification(req.params.userid, "A product was removed from your account!");
        return res.redirect(`/account/${req.params.userid}`);
    });
});

app.get('/backend/account/delete/user/:userid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageusers) return res.send('You do not have permission to edit this section.');
        req.params.userid = await utils.sanitize(req.params.userid);
        con.query(`DELETE FROM users WHERE id="${req.params.userid}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
        });
        con.query(`DELETE FROM owneditems WHERE userid="${req.params.userid}"`, async (err, row) => {
            if(err) throw err;
        });
        con.query(`DELETE FROM pendingpurchases WHERE userid="${req.params.userid}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
        });
        backend.audit(`Account Deleted`, `${req.user.username} (${req.user.id}) deleted account ${req.params.userid}.`);
        backend.logToDiscord('🚫 Account Deleted', `[${req.user.username}](${config.domain}/account/${req.user.id}) has just deleted <@${req.params.userid}>!`);
        return res.redirect('/');
    });
});

app.get('/backend/account/delete/upload/:userid/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].deleteproducts) return res.send('You do not have permission to edit this section.');
        req.params.userid = await utils.sanitize(req.params.userid);
        req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
        con.query(`SELECT * FROM owneduploads WHERE uniqueid="${req.params.uniqueid}" AND userid="${req.params.userid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return;
            try {
                fs.unlinkSync(row[0].filename);
            } catch(e) {};
            con.query(`DELETE FROM owneduploads WHERE uniqueid="${req.params.uniqueid}" AND userid="${req.params.userid}"`, function(err, row) {
                if(err) throw err;
                if(!row[0]) return;
            });
        });
        return res.redirect(`/account/${req.params.userid}`);
    });
});

app.get('/backend/account/toggleban/:userid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}" AND managebans=1`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageusers) return res.send('You do not have permission to edit this section.');
        req.params.userid = await utils.sanitize(req.params.userid);
        con.query(`SELECT * FROM bannedusers WHERE userid="${req.params.userid}"`, async (err, row) => {
            if(err) throw err;
            if(row[0]) {
                con.query(`DELETE FROM bannedusers WHERE userid="${req.params.userid}" LIMIT 1`, async (err, row) => {
                    if(err) throw err;
                });
            } else {
                con.query(`INSERT INTO bannedusers (userid) VALUES ("${req.params.userid}")`, async (err, row) => {
                    if(err) throw err;
                });
            };
        });
        backend.audit(`Ban Toggled`, `${req.user.username} (${req.user.id}) toggled the ban on ${req.params.userid}.`);
        backend.logToDiscord('🚫 Account Ban Toggled', `[${req.user.username}](${config.domain}/account/${req.user.id}) has toggled the ban on [a user](${config.domain}/account/${req.params.userid})!`);
        return res.redirect(`/account/${req.params.userid}`);
    });
});

app.get('/backend/product/togglehide/:productid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        req.params.productid = await utils.sanitize(req.params.productid);
        con.query(`SELECT * FROM products WHERE uniqueid="${req.params.productid}"`, async (err, row) => {
            if(err) throw err;
            if(row[0].hidden) {
                con.query(`UPDATE products SET hidden=false WHERE uniqueid="${req.params.productid}"`, async (err, row) => {
                    if(err) throw err;
                });
            } else {
                con.query(`UPDATE products SET hidden=true WHERE uniqueid="${req.params.productid}"`, async (err, row) => {
                    if(err) throw err;
                });
            };
            backend.audit(`Product Hidden`, `${req.user.username} (${req.user.id}) toggled hide on ${req.params.productid}.`);
            return res.redirect(`/shop/${row[0].link}`);
        });
    });
});

app.get('/backend/product/togglefeat/:productid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        req.params.productid = await utils.sanitize(req.params.productid);
        con.query(`SELECT * FROM products WHERE uniqueid="${req.params.productid}"`, async (err, row) => {
            if(err) throw err;
            if(row[0].featured) {
                con.query(`UPDATE products SET featured=false WHERE uniqueid="${req.params.productid}"`, async (err, row) => {
                    if(err) throw err;
                });
            } else {
                con.query(`UPDATE products SET featured=true WHERE uniqueid="${req.params.productid}"`, async (err, row) => {
                    if(err) throw err;
                });
            };
            backend.audit(`Product Featured`, `${req.user.username} (${req.user.id}) toggled featured on ${req.params.productid}.`);
            return res.redirect(`/shop/${row[0].link}`);
        });
    });
});

app.get('/backend/storecat/togglehide/:productid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        req.params.productid = await utils.sanitize(req.params.productid);
        con.query(`SELECT * FROM storecategories WHERE uniqueid="${req.params.productid}"`, async (err, row) => {
            if(err) throw err;
            if(row[0].hidden) {
                con.query(`UPDATE storecategories SET hidden=false WHERE uniqueid="${req.params.productid}"`, async (err, row) => {
                    if(err) throw err;
                });
            } else {
                con.query(`UPDATE storecategories SET hidden=true WHERE uniqueid="${req.params.productid}"`, async (err, row) => {
                    if(err) throw err;
                });
            };
            backend.audit(`Store Category Hidden`, `${req.user.username} (${req.user.id}) toggled hide on ${req.params.productid}.`);
            return res.redirect(`/shop/${row[0].link}`);
        });
    });
});

app.get('/backend/product/togglepause/:productid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        req.params.productid = await utils.sanitize(req.params.productid);
        con.query(`SELECT * FROM products WHERE uniqueid="${req.params.productid}"`, async (err, row) => {
            if(err) throw err;
            if(row[0].paused) {
                con.query(`UPDATE products SET paused=false WHERE uniqueid="${req.params.productid}"`, async (err, row) => {
                    if(err) throw err;
                });
            } else {
                con.query(`UPDATE products SET paused=true WHERE uniqueid="${req.params.productid}"`, async (err, row) => {
                    if(err) throw err;
                });
            };
            backend.audit(`Product Paused`, `${req.user.username} (${req.user.id}) toggled hide on ${req.params.productid}.`);
            return res.redirect(`/shop/${row[0].link}`);
        });
    });
});

app.get('/backend/delete/product/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].deleteproducts) return res.send('You do not have permission to edit this section.');
        con.query(`SELECT * FROM products WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/admin');
            let thatProd = row[0];
            con.query(`DELETE FROM products WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
                if(err) throw err;
                res.redirect(`/admin`);
                if(thatProd.zipfilename != 'Physical') try { fs.unlinkSync(`./downloads/${thatProd.zipfilename}`); } catch(e) {};
                con.query(`SELECT * FROM users WHERE cart != "[]"`, async (err, row) => {
                    if(err) throw err;
                    await row.forEach(async function(user) {
                        let newCrt = [];
                        let crt = JSON.parse(user.cart);
                        for(let item of crt) {
                            if(item.uniqueid != req.params.uniqueid) {
                                newCrt.push(item);
                            };
                        };
                        backend.audit(`Store Item Deleted`, `${req.user.username} (${req.user.id}) removed store item ${thatProd.name}.`);
                        backend.logToDiscord('🛒 Product Deleted', `[${req.user.username}](${config.domain}/account/${req.user.id}) removed store item **${thatProd.name}**!`);
                        let mods = JSON.stringify(newCrt);
                        con.query(`UPDATE users SET cart='${mods}' WHERE id="${user.id}"`, async (err, row) => {
                            if(err) throw err;
                        });
                    });
                });
            });
        });
    });
});

app.get('/backend/delete/storecat/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managestorecats) return res.send('You do not have permission to edit this section.');
        con.query(`SELECT * FROM storecategories WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/admin');
            let thatProd = row[0];
            con.query(`DELETE FROM storecategories WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Store Category Deleted`, `${req.user.username} (${req.user.id}) removed store category ${thatProd.name}.`);
                return res.redirect(`/admin`);
            });
        });
    });
});

app.get('/backend/delete/storetag/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managestoretags) return res.send('You do not have permission to edit this section.');
        con.query(`SELECT * FROM storetags WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/admin');
            let thatProd = row[0];
            con.query(`DELETE FROM storetags WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Store Tag Deleted`, `${req.user.username} (${req.user.id}) removed store tag ${thatProd.name}.`);
                return res.redirect(`/admin`);
            });
        });
    });
});

app.get('/backend/delete/apikey/:apikey', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.apikey) return res.redirect('/404');
    req.params.apikey = await utils.sanitize(req.params.apikey);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageapikeys) return res.send('You do not have permission to edit this section.');
        con.query(`DELETE FROM apikeys WHERE apikey="${req.params.apikey}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
            backend.audit(`API Key Deleted`, `${req.user.username} (${req.user.id}) deleted an API key.`);
            return res.redirect(`/admin`);
        });
    });
});

app.get('/backend/delete/order/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageorders) return res.send('You do not have permission to edit this section.');
        con.query(`DELETE FROM owneditems WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Physical Order Deleted`, `${req.user.username} (${req.user.id}) deleted a physical order.`);
            return res.redirect(`/admin`);
        });
    });
});

app.get('/backend/delete/subs/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        let isAllowed = false;
        if(!row[0].managesubs) isAllowed = true;
        con.query(`SELECT * FROM subscriptions WHERE uniqueid="${req.params.uniqueid}"`, async function(err, row) {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            if(row[0].userid == req.user.id) isAllowed = true;
            if(!isAllowed) return res.send('You do not have permission to edit this section.');
            con.query(`DELETE FROM invoices WHERE uniqueid="${row[0].invoiceid}" LIMIT 1`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Invoice Deleted`, `${req.user.username} (${req.user.id}) cancelled their subscription.`);
            });
            con.query(`DELETE FROM owneditems WHERE uniqueid="${row[0].owneditemid}" LIMIT 1`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Owned Item Deleted`, `${req.user.username} (${req.user.id}) cancelled their subscription.`);
            });
            con.query(`DELETE FROM subscriptions WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Subscription Deleted`, `${req.user.username} (${req.user.id}) cancelled their subscription.`);
            });
            res.redirect(`/account/${req.user.id}`);
        });
    });
});

app.get('/backend/resetstats', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.apikey) return res.redirect('/404');
    req.params.apikey = await utils.sanitize(req.params.apikey);
    if(!config.ownerIds.includes(user.id)) return res.redirect('/404');
    con.query(`DELETE FROM statistics`, async (err, row) => {
        if(err) throw err;
        con.query(`INSERT INTO statistics (type, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dece) VALUES ('customers', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);`, function(err, row) { if(err) throw err; });
        con.query(`INSERT INTO statistics (type, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dece) VALUES ('autojoin', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);`, function(err, row) { if(err) throw err; });
        con.query(`INSERT INTO statistics (type, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dece) VALUES ('homepagevisits', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);`, function(err, row) { if(err) throw err; });
        con.query(`INSERT INTO statistics (type, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dece) VALUES ('newusers', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);`, function(err, row) { if(err) throw err; });
        con.query(`INSERT INTO statistics (type, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dece) VALUES ('sales', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);`, function(err, row) { if(err) throw err; });
        con.query(`INSERT INTO statistics (type, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dece) VALUES ('income', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);`, function(err, row) { if(err) throw err; });
        backend.audit(`Site Stats Reset`, `${req.user.username} (${req.user.id}) Reset website statistics.`);
        return res.redirect(`/admin`);
    });
});

app.get('/backend/delete/review/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managereviews) return res.send('You do not have permission to edit this section.');
        con.query(`DELETE FROM reviews WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Review Deleted`, `${req.user.username} (${req.user.id}) deleted a review.`);
            return res.redirect(`/admin`);
        });
    });
});

app.get('/backend/delete/usingcompanies/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageclientcompanies) return res.send('You do not have permission to edit this section.');
        con.query(`DELETE FROM usingcompanies WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Using Company Deleted`, `${req.user.username} (${req.user.id}) deleted a using company.`);
            return res.redirect(`/admin`);
        });
    });
});

app.get('/backend/delete/faq/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].altersitesettings) return res.send('You do not have permission to edit this section.');
        con.query(`DELETE FROM faq WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
            backend.audit(`FAQ Deleted`, `${req.user.username} (${req.user.id}) deleted an FAQ.`);
            return res.redirect(`/admin`);
        });
    });
});

app.get('/backend/delete/navbarbutton/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].altersitesettings) return res.send('You do not have permission to edit this section.');
        con.query(`DELETE FROM navbar WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Navbar Deleted`, `${req.user.username} (${req.user.id}) deleted a navbar button.`);
            return res.redirect(`/admin`);
        });
    });
});

app.get('/backend/delete/blog/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageblogs) return res.send('You do not have permission to edit this section.');
        con.query(`DELETE FROM blogs WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Blog Deleted`, `${req.user.username} (${req.user.id}) deleted a blog post.`);
            return res.redirect(`/admin`);
        });
    });
});

app.get('/backend/delete/custompage/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managecustompages) return res.send('You do not have permission to edit this section.');
        con.query(`DELETE FROM custompages WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Page Deleted`, `${req.user.username} (${req.user.id}) deleted a custom page.`);
            return res.redirect(`/admin`);
        });
    });
});

app.get('/backend/delete/advertisement/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageads) return res.send('You do not have permission to edit this section.');
        con.query(`SELECT * FROM advertisements WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            con.query(`DELETE FROM advertisements WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
                if(err) throw err;
                return res.redirect(`/admin`);
            });
            try {
                fs.unlinkSync(`./images/advertisement_${req.params.uniqueid}.${row[0].filetype}`);
            } catch(e) {};
            backend.audit(`Advertisement Deleted`, `${req.user.username} (${req.user.id}) deleted an advertisement.`);
        });
    });
});

app.get('/backend/delete/staff/:userid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.userid) return res.redirect('/404');
    req.params.userid = await utils.sanitize(req.params.userid);
    if(config.ownerIds.includes(req.user.id)) {
        con.query(`DELETE FROM staff WHERE userid="${req.params.userid}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
            return res.redirect(`/admin`);
        });
        backend.audit(`Staff Removed`, `${req.user.username} (${req.user.id}) removed a staff member (${req.params.userid}).`);
    } else {
        return res.redirect('/404');
    };
});

app.get('/backend/delete/discount/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managediscounts) return res.send('You do not have permission to edit this section.');
        con.query(`DELETE FROM discounts WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Discount Deleted`, `${req.user.username} (${req.user.id}) deleted a discount code.`);
            return res.redirect(`/admin`);
        });
    });
});

app.get('/backend/delete/giftcard/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managegiftcards) return res.send('You do not have permission to edit this section.');
        con.query(`DELETE FROM giftcards WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Giftcard Deleted`, `${req.user.username} (${req.user.id}) deleted a giftcard.`);
            return res.redirect(`/admin`);
        });
    });
});

app.get('/backend/delete/invoice/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageinvoices) return res.send('You do not have permission to edit this section.');
        con.query(`DELETE FROM invoices WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Invoice Deleted`, `${req.user.username} (${req.user.id}) deleted an invoice (${req.params.uniqueid}).`);
            return res.redirect(`/admin`);
        });
    });
});

app.get('/backend/delete/quote/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managequotes) return res.send('You do not have permission to edit this section.');
        con.query(`DELETE FROM quotes WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Quote Deleted`, `${req.user.username} (${req.user.id}) deleted a quote (${req.params.uniqueid}).`);
            return res.redirect(`/admin`);
        });
    });
});

app.get('/backend/delete/quoteitem/:quoteid/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.quoteid = await utils.sanitize(req.params.quoteid);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managequotes) return res.send('You do not have permission to edit this section.');
        con.query(`DELETE FROM quoteitems WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            return res.redirect(`/quote/${req.params.quoteid}`);
        });
    });
});

app.get('/backend/delete/galleryimage/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].altersitesettings) return res.send('You do not have permission to edit this section.');
        con.query(`SELECT * FROM galleryimages WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            con.query(`DELETE FROM galleryimages WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Gallery Image Deleted`, `${req.user.username} (${req.user.id}) deleted a gallery image.`);
                return res.redirect(`/admin`);
            });
            try {
                fs.unlinkSync(`./public/images/${row[0].imagename}`);
            } catch (e) {};
        });
    });
});

app.get('/backend/delete/team/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageteam) return res.send('You do not have permission to edit this section.');
        con.query(`SELECT * FROM team WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            try {
                s.unlinkSync(`./public/images/team_${req.params.uniqueid}.png`);
            } catch(e) {};
            con.query(`DELETE FROM team WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Team Member Deleted`, `${req.user.username} (${req.user.id}) deleted a team member.`);
                return res.redirect(`/admin`);
            });
        });
    });
});

app.get('/backend/delete/partners/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managepartners) return res.send('You do not have permission to edit this section.');
        con.query(`SELECT * FROM partners WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            try {
                fs.unlinkSync(`./public/images/partner_${req.params.uniqueid}.png`);
            } catch(e) {};
            con.query(`DELETE FROM partners WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Partner Deleted`, `${req.user.username} (${req.user.id}) deleted a partner.`);
                return res.redirect(`/admin`);
            });
        });
    });
});

app.get('/backend/delete/docscat/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managedocs) return res.send('You do not have permission to edit this section.');
        con.query(`SELECT * FROM docscategories WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/admin');
            let thatProd = row[0];
            con.query(`DELETE FROM docscategories WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Docs Category Deleted`, `${req.user.username} (${req.user.id}) removed docs category ${thatProd.name}.`);
                return res.redirect(`/admin`);
            });
        });
    });
});

app.get('/backend/delete/docsarticle/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managedocs) return res.send('You do not have permission to edit this section.');
        con.query(`SELECT * FROM docsarticles WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/admin');
            let thatProd = row[0];
            con.query(`DELETE FROM docsarticles WHERE uniqueid="${req.params.uniqueid}" LIMIT 1`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Docs Article Deleted`, `${req.user.username} (${req.user.id}) removed docs article ${thatProd.title}.`);
                return res.redirect(`/admin`);
            });
        });
    });
});

app.get('/backend/delete/changelog/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].createeditproducts) return res.send('You are not high enough rank to delete this section.');
        con.query(`SELECT * FROM changelogs WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            con.query(`DELETE FROM changelogs WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                if(err) throw err;
            });
            backend.audit(`Changelog Deleted`, `${req.user.username} (${req.user.id}) deleted a changelog.`);
            return res.redirect(`/admin/editproduct/${row[0].productid}`);
        });
    });
});

app.get('/hyperz', function(req, res) { res.redirect('https://github.com/itz-hyperz') });
app.get('/credits', function(req, res) { res.redirect('https://github.com/itz-hyperz') });
app.get('/creator', function(req, res) { res.redirect('https://github.com/itz-hyperz') });
app.get('/developer', function(req, res) { res.redirect('https://github.com/itz-hyperz') });
app.get('/designer', function(req, res) { res.redirect('https://github.com/itz-hyperz') });

app.get('/backend/toggledisabled/license/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM owneditems WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
        if(err) throw err;
        let owneditem = row[0];
        con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let isStaff = false;
            if(row[0]) isStaff = true;
            if(owneditem.userid == req.user.id || isStaff) {
                if(owneditem.disabled) {
                    con.query(`UPDATE owneditems SET disabled=false WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                        if(err) throw err;
                        res.redirect(`/license/${req.params.uniqueid}`);
                    });
                } else {
                    con.query(`UPDATE owneditems SET disabled=true WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                        if(err) throw err;
                        res.redirect(`/license/${req.params.uniqueid}`);
                    });
                };
                backend.audit('License Disabled - User', `${req.user.username} (${req.user.id}) has toggled the disabled state of ${owneditem.uniqueid}`);
            } else {
                res.redirect('/404');
            };
        });
    });
});

app.get('/backend/toggleadmindisabled/license/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    con.query(`SELECT * FROM owneditems WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
        if(err) throw err;
        let owneditem = row[0];
        con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            if(row[0]) {
                if(owneditem.admindisabled) {
                    con.query(`UPDATE owneditems SET admindisabled=false WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                        if(err) throw err;
                        res.redirect(`/license/${req.params.uniqueid}`);
                    });
                    backend.createNotification(owneditem.userid, "An admin has enabled your license key!");
                    backend.audit('License Disabled - Admin', `${req.user.username} (${req.user.id}) has enabled the license for ${owneditem.uniqueid}`);
                } else {
                    con.query(`UPDATE owneditems SET admindisabled=true WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                        if(err) throw err;
                        res.redirect(`/license/${req.params.uniqueid}`);
                    });
                    backend.createNotification(owneditem.userid, "An admin has disabled your license key!");
                    backend.audit('License Enabled - Admin', `${req.user.username} (${req.user.id}) has disabled the license for ${owneditem.uniqueid}`);
                };
            } else {
                res.redirect('/404');
            };
        });
    });
});

app.get('/backend/regenlicense/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    let newKey = `${await utils.generateRandom(9, true)}_${await utils.generateRandom(12)}`;
    con.query(`SELECT * FROM owneditems WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
        if(err) throw err;
        let owneditem = row[0];
        con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let isStaff = false;
            if(row[0]) isStaff = true;
            if(owneditem.userid == req.user.id || isStaff) {
                con.query(`UPDATE owneditems SET licensekey="${newKey}" WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                    if(err) throw err;
                    res.redirect(`/license/${req.params.uniqueid}`);
                });
                backend.audit('License Updated - AuthIP', `${req.user.username} (${req.user.id}) has updated the AuthIP of ${owneditem.uniqueid}`);
            } else {
                res.redirect('/404');
            };
        });
    });
});

app.post('/backend/update/license/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    req.body.authip = await utils.sanitize(req.body.authip);
    con.query(`SELECT * FROM owneditems WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
        if(err) throw err;
        let owneditem = row[0];
        con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            let isStaff = false;
            if(row[0]) isStaff = true;
            if(owneditem.userid == req.user.id || isStaff) {
                con.query(`UPDATE owneditems SET authorizedip="${req.body.authip}" WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                    if(err) throw err;
                    res.redirect(`/license/${req.params.uniqueid}`);
                });
                backend.audit('License Updated - AuthIP', `${req.user.username} (${req.user.id}) has updated the AuthIP of ${owneditem.uniqueid}`);
            } else {
                res.redirect('/404');
            };
        });
    });
});

app.post('/backend/apply/discount', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.body.code) return res.redirect('/');
    let discount = await utils.sanitize(req.body.code);
    con.query(`SELECT * FROM discounts WHERE code="${discount}"`, async (err, row) => {
        if(err) throw err;
        if(row[0]) {
            if(row[0].roleids != 'none') {
                let isAllowed = await backend.checkRoleRequirements(row[0], req.user);
                if(!isAllowed) {
                    return con.query(`UPDATE users SET discount=0 WHERE id="${req.user.id}"`, async (err, row) => {
                        if(err) throw err;
                        res.redirect('/cart');
                    });
                };
            };
            con.query(`UPDATE users SET discount=${row[0].percent} WHERE id="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                res.redirect('/cart');
            });
        } else {
            con.query(`SELECT * FROM ownedgiftcards WHERE code="${discount}"`, function(err, row) {
                if(err) throw err;
                if(row[0]) {
                    con.query(`UPDATE users SET giftcard="${discount}" WHERE id="${req.user.id}"`, function(err, row) {
                        if(err) throw err;
                    });
                    return res.redirect('/cart');
                } else {
                    con.query(`UPDATE users SET discount=0, giftcard="none" WHERE id="${req.user.id}"`, async (err, row) => {
                        if(err) throw err;
                        return res.redirect('/cart');
                    });
                };
            });
        };
    });
});

app.post('/backend/create/review', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.body.product = await utils.sanitize(req.body.product);
    req.body.rating = Number(await utils.sanitize(req.body.rating));
    req.body.content = await utils.sanitize(req.body.content);
    if(isNaN(req.body.rating)) return res.redirect('/404');
    let uid = await utils.generateRandom(14);
    con.query(`SELECT * FROM users WHERE id="${req.user.id}" AND client=true`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.send(`You are not a client on this account. ${req.user.username} (${req.user.id})`);
        let user = row[0];
        con.query(`SELECT * FROM products WHERE uniqueid="${req.body.product}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            let found = row[0];
            con.query(`INSERT INTO reviews (uniqueid, userid, username, rating, itemname, itemuniqueid, content) VALUES ("${uid}", "${user.id}", "${user.username}", ${Number(req.body.rating)}, "${found.name}", "${req.body.product}", "${req.body.content}")`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Review Created`, `${req.user.username} (${req.user.id}) created a review.`);
                backend.logToDiscord('⭐ Review Created', `[${req.user.username}](${config.domain}/account/${req.user.id}) created [a review](${config.domain}/review/${uid})!\n**Star Rating:** \`${req.body.rating}\``);
                return res.redirect(`/review/${uid}`);
            });
        });
    });
});

app.post('/backend/create/discount', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.body.code = await utils.sanitize(req.body.code);
    req.body.expiration = await utils.sanitize(req.body.expiration);
    req.body.percent = await utils.sanitize(req.body.percent);
    req.body.percent = Number(req.body.percent);
    if(isNaN(req.body.percent)) return res.redirect('/404');
    if(!req.body.roleids) req.body.roleids = 'none';
    if(!req.body.expiration) req.body.expiration = 'never';
    req.body.roleids = await utils.sanitize(req.body.roleids);
    let uid = await utils.generateRandom(14);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managediscounts) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO discounts (expiration, code, percent, roleids, uniqueid) VALUES ("${req.body.expiration}", "${req.body.code}", ${req.body.percent}, "${req.body.roleids}", "${uid}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Discount Created`, `${req.user.username} (${req.user.id}) created a discount (${req.body.code}, ${req.body.percent}%).`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/create/giftcard', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.body.name = await utils.sanitize(req.body.name);
    req.body.amount = await utils.sanitize(req.body.amount);
    if(!req.body.amount.includes('.')) req.body.amount = `${req.body.amount}.00`;
    req.body.pos = Number(req.body.pos);
    if(isNaN(req.body.pos)) return res.redirect('/404');
    let uid = await utils.generateRandom(21);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managegiftcards) return res.send('You do not have permission to edit this section.');
        if(!req.files[0]) return res.redirect('/404');
        fs.writeFileSync(`./public/images/giftcard_${uid}.png`, req.files[0].buffer);
        con.query(`INSERT INTO giftcards (name, pos, amount, uniqueid) VALUES ("${req.body.name}", ${req.body.pos}, "${req.body.amount}", "${uid}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Giftcard Created`, `${req.user.username} (${req.user.id}) created a giftcard: (${req.body.name}).`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/create/docscat', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(18);
    req.body.catname = await utils.sanitize(req.body.catname);
    req.body.catlink = await utils.sanitize(req.body.catlink);
    req.body.catpos = await utils.sanitize(req.body.catpos);
    req.body.catdesc = await utils.sanitize(req.body.catdesc, true);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managedocs) return res.send('You do not have permission to edit this section.');
        if(!req.files[0]) return res.redirect('/404');
        fs.writeFileSync(`./public/images/docscat_${uid}.png`, req.files[0].buffer);
        con.query(`INSERT INTO docscategories (uniqueid, name, link, description, pos) VALUES ("${uid}", "${req.body.catname}", "${req.body.catlink}", "${req.body.catdesc}", ${req.body.catpos})`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Docs Category Created`, `${req.user.username} (${req.user.id}) created a docs category (${req.body.catname}).`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/update/docscat/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    let uid = await utils.sanitize(req.params.uniqueid);
    req.body.catname = await utils.sanitize(req.body.catname);
    req.body.catlink = await utils.sanitize(req.body.catlink);
    req.body.catpos = await utils.sanitize(req.body.catpos);
    req.body.catdesc = await utils.sanitize(req.body.catdesc, true);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managedocs) return res.send('You do not have permission to edit this section.');
        if(req.files[0]) {
            fs.writeFileSync(`./public/images/docscat_${uid}.png`, req.files[0].buffer);
        };
        con.query(`UPDATE docscategories SET name="${req.body.catname}", link="${req.body.catlink}", description="${req.body.catdesc}", pos=${req.body.catpos} WHERE uniqueid="${uid}"`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Docs Category Updated`, `${req.user.username} (${req.user.id}) updated a docs category (${req.body.catname}).`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/create/docsarticle', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(19);
    req.body.category = await utils.sanitize(req.body.category);
    req.body.title = await utils.sanitize(req.body.title);
    req.body.link = await utils.sanitize(req.body.link);
    req.body.pos = await utils.sanitize(req.body.pos);
    req.body.content = await utils.sanitize(req.body.content, true);
    if(!req.body.discordroleid) req.body.discordroleid = 'none';
    req.body.discordroleid = await utils.sanitize(req.body.discordroleid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managedocs) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO docsarticles (uniqueid, catid, title, link, content, pos, discordroleid) VALUES ("${uid}", "${req.body.category}", "${req.body.title}", "${req.body.link}", "${req.body.content}", ${req.body.pos}, "${req.body.discordroleid}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Docs Article Created`, `${req.user.username} (${req.user.id}) created a docs article (${req.body.title}).`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/update/docsarticle/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    let uid = await utils.sanitize(req.params.uniqueid);
    req.body.category = await utils.sanitize(req.body.category);
    req.body.title = await utils.sanitize(req.body.title);
    req.body.link = await utils.sanitize(req.body.link);
    req.body.pos = await utils.sanitize(req.body.pos);
    req.body.content = await utils.sanitize(req.body.content, true);
    if(!req.body.discordroleid) req.body.discordroleid = 'none';
    req.body.discordroleid = await utils.sanitize(req.body.discordroleid);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(managedocs) return res.send('You do not have permission to edit this section.');
        con.query(`UPDATE docsarticles SET catid="${req.body.category}", title="${req.body.title}", link="${req.body.link}", content="${req.body.content}", pos=${req.body.pos}, discordroleid="${req.body.discordroleid}" WHERE uniqueid="${uid}"`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Docs Article Updated`, `${req.user.username} (${req.user.id}) updated a docs article (${req.body.title}).`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/create/team', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.files[0]) return res.redirect(req.get("Referrer") || "/");
    req.body.name = await utils.sanitize(req.body.name);
    req.body.position = Number(await utils.sanitize(req.body.position));
    req.body.title = await utils.sanitize(req.body.title);
    req.body.content = await utils.sanitize(req.body.content);
    let uid = await utils.generateRandom(13);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageteam) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO team (uniqueid, name, pos, title, content) VALUES ("${uid}", "${req.body.name}", ${req.body.position}, "${req.body.title}", "${req.body.content}")`, async (err, row) => {
            if(err) throw err;
            let teamMemberImage = await utils.sanitize(`team_${uid}.png`);
            fs.writeFileSync(`./public/images/${teamMemberImage}`, req.files[0].buffer);
            backend.audit(`Team Member Created`, `${req.user.username} (${req.user.id}) created a team member (${req.body.name}).`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/create/partners', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.files[0]) return res.redirect(req.get("Referrer") || "/");
    req.body.link = await utils.sanitize(req.body.link);
    req.body.position = Number(await utils.sanitize(req.body.position));
    req.body.title = await utils.sanitize(req.body.title);
    req.body.content = await utils.sanitize(req.body.content);
    let uid = await utils.generateRandom(13);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managepartners) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO partners (uniqueid, pos, title, content, link) VALUES ("${uid}", ${req.body.position}, "${req.body.title}", "${req.body.content}", "${req.body.link}")`, async (err, row) => {
            if(err) throw err;
            let partnerImage = await utils.sanitize(`partner_${uid}.png`);
            fs.writeFileSync(`./public/images/${partnerImage}`, req.files[0].buffer);
            backend.audit(`Partner Created`, `${req.user.username} (${req.user.id}) created a partner (${req.body.title}).`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/create/galleryimage', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(19);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].altersitesettings) return res.send('You do not have permission to edit this section.');
        if(!req.files[0]) return res.redirect(req.get("Referrer") || "/");
        let galleryImageName = await utils.sanitize(`gallery_${uid}.${req.files[0].originalname.split('.').reverse()[0]}`);
        con.query(`INSERT INTO galleryimages (uniqueid, imagename) VALUES ("${uid}", "${galleryImageName}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Gallery Image Created`, `${req.user.username} (${req.user.id}) created a gallery image.`);
            return res.redirect(`/admin`);
        });
        try {
            fs.writeFileSync(`./public/images/${galleryImageName}`, req.files[0].buffer);
        } catch(e) {};
    });
});

app.post('/backend/create/changelog/:productid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.productid = await utils.sanitize(req.params.productid);
    req.body.title = await utils.sanitize(req.body.title);
    req.body.version = await utils.sanitize(req.body.version);
    req.body.content = await utils.sanitize(req.body.content, true);
    let datetime = await utils.fetchTime(config.timeZone.tz, config.timeZone.format);
    let uid = await utils.generateRandom(21);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].createeditproducts) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO changelogs (uniqueid, title, vers, content, datetime, productid) VALUES ("${uid}", "${req.body.title}", "${req.body.version}", "${req.body.content}", "${datetime}", "${req.params.productid}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Changelog Created`, `${req.user.username} (${req.user.id}) created a new changelog.`);
            if(typeof req.body.sendnoti != 'undefined') {
                con.query(`SELECT * FROM owneditems WHERE productid="${req.params.productid}"`, async (err, row) => {
                    if(err) throw err;
                    let usersToSend = [];
                    for(let item of row) {
                        con.query(`SELECT * FROM users WHERE id="${item.userid}"`, async (err, row) => {
                            if(err) throw err;
                            if(!row[0]) return;
                            if(row[0].email != 'none') usersToSend.push(row[0].email);
                            backend.createNotification(item.userid, `A new release has been made for ${item.productname}!`);
                        });
                    };
                    let mostRecent = row.reverse()[0];
                    setTimeout(function() {
                        backend.createEmail(usersToSend, `${mostRecent?.productname} Update!`, `A product you own, ${mostRecent?.productname} has just received an update! View the new changelog for it <a href='${config.domain}/changelog/${req.params.productid}'>here</a>!`, 'NOTIFICATIONS');
                    }, 5000);
                });
            };
            return res.redirect(`/changelog/${req.params.productid}`);
        });
    });
});

app.post('/backend/email/create', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.body.recipients = req.body.recipients.replaceAll(' ', '').split(',');
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        let usersToSend = [];
        for(let item of req.body.recipients) {
            if(item.includes('@')) {
                usersToSend.push(item);
            } else {
                con.query(`SELECT * FROM users WHERE id="${await utils.sanitize(item)}"`, function(err, row) {
                    if(err) throw err;
                    if(!row[0]) return;
                    if(row[0].email != 'none') usersToSend.push(row[0].email);
                });
            };
        };
        setTimeout(function() {
            backend.createEmail(usersToSend, req.body.subject, req.body.content, "NOTIFICATIONS");
        }, 5000);
        res.redirect('/admin');
    });
});

app.post('/backend/create/ownedupload/:userid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(20)
    req.params.userid = await utils.sanitize(req.params.userid);
    req.body.name = await utils.sanitize(req.body.name);
    req.body.amount = await utils.sanitize(req.body.amount);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].createeditproducts) return res.send('You do not have permission to edit this section.');
        if(!req.files[0]) return res.redirect('/404');
        let fileName = await utils.sanitize(`${(Date.now()).toString()}_${req.params.userid}${req.files[0].originalname}`);
        fs.writeFileSync(`./downloads/${fileName}`, req.files[0].buffer);
        con.query(`INSERT INTO owneduploads (uniqueid, userid, name, datetime, price, filename, downloads) VALUES ("${uid}", "${req.params.userid}", "${req.body.name}", "${await utils.fetchTime(config.timeZone.tz, config.timeZone.format)}", "${req.body.amount}", "${fileName}", 0)`, function(err, row) {
            if(err) throw err;
        });
        return res.redirect(`/account/${req.params.userid}`);
    });
});

app.post('/backend/update/changelog/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    req.body.title = await utils.sanitize(req.body.title);
    req.body.version = await utils.sanitize(req.body.version);
    req.body.content = await utils.sanitize(req.body.content, true);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].createeditproducts) return res.send('You do not have permission to edit this section.');
        con.query(`SELECT * FROM changelogs WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            let cl = row[0];
            con.query(`UPDATE changelogs SET title="${req.body.title}", vers="${req.body.version}", content="${req.body.content}" WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Changelog Edited`, `${req.user.username} (${req.user.id}) edited a changelog (${req.params.uniqueid}).`);
                return res.redirect(`/changelog/${cl.productid}`);
            });
        });
    });
});

app.post('/backend/create/blog', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.body.pagetitle = await utils.sanitize(req.body.pagetitle);
    req.body.pagelink = await utils.sanitize(req.body.pagelink);
    req.body.pagecontent = await utils.sanitize(req.body.pagecontent, true);
    let datetime = await utils.fetchTime(config.timeZone.tz, config.timeZone.format);
    let uid = await utils.generateRandom(15);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageblogs) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO blogs (uniqueid, title, link, content, views, datetime) VALUES ("${uid}", "${req.body.pagetitle}", "${req.body.pagelink}", "${req.body.pagecontent}", 0, "${datetime}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Blog Created`, `${req.user.username} (${req.user.id}) created a blog post.`);
            res.redirect(`/admin`);
            con.query(`SELECT * FROM users WHERE mailendpoints LIKE '%NEWSLETTER%'`, async (err, row) => {
                if(err) throw err;
                if(!row[0]) return;
                row.forEach(function(user) {
                    backend.createEmail(user.email, `New Blog Post Released! | ${app.locals.sitesettings.sitename}`, `${app.locals.sitesettings.sitename} just made a new blog post and you are signed up to receieve notifications! View the new post <a href='${config.domain}/blog/${req.body.pagelink}'>here</a>!`, 'NEWSLETTER')
                });
            });
        });
    });
});

app.post('/backend/update/blog/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    req.body.pagecontent = await utils.sanitize(req.body.pagecontent, true);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageblogs) return res.send('You do not have permission to edit this section.');
        con.query(`UPDATE blogs SET content="${req.body.pagecontent}" WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Blog Updated`, `${req.user.username} (${req.user.id}) updated a blog post.`);
            return res.redirect(`back`);
        });
    });
});

app.post('/backend/create/custompage', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.body.pagetitle = await utils.sanitize(req.body.pagetitle);
    req.body.pagelink = await utils.sanitize(req.body.pagelink);
    req.body.pagecontent = await utils.sanitize(req.body.pagecontent, true);
    let uid = await utils.generateRandom(15);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managecustompages) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO custompages (uniqueid, title, link, content) VALUES ("${uid}", "${req.body.pagetitle}", "${req.body.pagelink}", "${req.body.pagecontent}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Page Created`, `${req.user.username} (${req.user.id}) created a custom page.`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/update/custompage/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) return res.redirect('/404');
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    req.body.pagecontent = await utils.sanitize(req.body.pagecontent, true);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managecustompages) return res.send('You do not have permission to edit this section.');
        con.query(`UPDATE custompages SET content="${req.body.pagecontent}" WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Page Updated`, `${req.user.username} (${req.user.id}) updated a custom page.`);
            return res.redirect(`back`);
        });
    });
});

app.post('/backend/update/styling', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.body.navbarlogo = Number(await utils.sanitize(req.body.navbarlogo));
    req.body.statsproducts = Number(await utils.sanitize(req.body.statsproducts));
    req.body.statsclients = Number(await utils.sanitize(req.body.statsclients));
    req.body.statspurchases = Number(await utils.sanitize(req.body.statspurchases));
    req.body.statsusers = Number(await utils.sanitize(req.body.statsusers));
    req.body.statsreviews = Number(await utils.sanitize(req.body.statsreviews));
    req.body.statspartners = Number(await utils.sanitize(req.body.statspartners));
    req.body.statsstaff = Number(await utils.sanitize(req.body.statsstaff));
    req.body.currentprodsbtn = Number(await utils.sanitize(req.body.currentprodsbtn));
    req.body.visitstorebtn = Number(await utils.sanitize(req.body.visitstorebtn));
    req.body.ourdiscordbtn = Number(await utils.sanitize(req.body.ourdiscordbtn));
    req.body.ourdiscordbtntext = await utils.sanitize(req.body.ourdiscordbtntext);
    req.body.ourdiscordbtnlink = await utils.sanitize(req.body.ourdiscordbtnlink);
    req.body.recentpurchases = Number(await utils.sanitize(req.body.recentpurchases));
    req.body.shopsorting = Number(await utils.sanitize(req.body.shopsorting));
    req.body.navbaralignment = Number(await utils.sanitize(req.body.navbaralignment));
    req.body.bgshoptoggle = Number(await utils.sanitize(req.body.bgshoptoggle));
    req.body.footnavigation = Number(await utils.sanitize(req.body.footnavigation));
    req.body.footusefullinks = Number(await utils.sanitize(req.body.footusefullinks));
    req.body.footourpartners = Number(await utils.sanitize(req.body.footourpartners));
    req.body.footlegal = Number(await utils.sanitize(req.body.footlegal));
    req.body.teampage = Number(await utils.sanitize(req.body.teampage));
    req.body.partnerspage = Number(await utils.sanitize(req.body.partnerspage));
    req.body.clientcompaniesgreyscale = Number(await utils.sanitize(req.body.clientcompaniesgreyscale));
    req.body.homepagereviewsshowcase = Number(await utils.sanitize(req.body.homepagereviewsshowcase));
    req.body.homepagefaqshowcase = Number(await utils.sanitize(req.body.homepagefaqshowcase));
    req.body.whycompanyenabled = Number(await utils.sanitize(req.body.whycompanyenabled));
    req.body.whycompanytitle = await utils.sanitize(req.body.whycompanytitle);
    req.body.whycompanysubtitle = await utils.sanitize(req.body.whycompanysubtitle);
    req.body.reviewspage = Number(await utils.sanitize(req.body.reviewspage));
    req.body.productgallery = Number(await utils.sanitize(req.body.productgallery));
    req.body.productcredits = Number(await utils.sanitize(req.body.productcredits));
    req.body.productreviews = Number(await utils.sanitize(req.body.productreviews));
    req.body.giftcards = Number(await utils.sanitize(req.body.giftcards));
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].altersitestyling) return res.send('You do not have permission to edit this section.');
        con.query(`UPDATE sitestyles SET whycompanyenabled=${req.body.whycompanyenabled}, whycompanytitle="${req.body.whycompanytitle}", whycompanysubtitle="${req.body.whycompanysubtitle}", ourdiscordbtntext="${req.body.ourdiscordbtntext}", ourdiscordbtnlink="${req.body.ourdiscordbtnlink}", clientcompaniesgreyscale=${req.body.clientcompaniesgreyscale}, homepagereviewsshowcase=${req.body.homepagereviewsshowcase}, homepagefaqshowcase=${req.body.homepagefaqshowcase}, navbarlogo=${req.body.navbarlogo}, currentprodsbtn=${req.body.currentprodsbtn}, visitstorebtn=${req.body.visitstorebtn}, ourdiscordbtn=${req.body.ourdiscordbtn}, recentpurchases=${req.body.recentpurchases}, shopsorting=${req.body.shopsorting}, navbaralignment=${req.body.navbaralignment}, bgshoptoggle=${req.body.bgshoptoggle}, footnavigation=${req.body.footnavigation}, footusefullinks=${req.body.footusefullinks}, footourpartners=${req.body.footourpartners}, footlegal=${req.body.footlegal}, giftcards=${req.body.giftcards}, productgallery=${req.body.productgallery}, teampage=${req.body.teampage}, partnerspage=${req.body.partnerspage}, productreviews=${req.body.productreviews}, productcredits=${req.body.productcredits}, reviewspage=${req.body.reviewspage}, statsproducts=${req.body.statsproducts}, statsclients=${req.body.statsclients}, statspurchases=${req.body.statspurchases}, statsusers=${req.body.statsusers}, statsreviews=${req.body.statsreviews}, statspartners=${req.body.statspartners}, statsstaff=${req.body.statsstaff}`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Styling Updated`, `${req.user.username} (${req.user.id}) updated the website styling.`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/create/advertisement', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(8);
    req.body.adname = await utils.sanitize(req.body.adname, true);
    req.body.adlink = await utils.sanitize(req.body.adlink, true);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageads) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO advertisements (uniqueid, name, link, filetype) VALUES ("${uid}", "${req.body.adname}", "${req.body.adlink}", "${req.files[0].originalname.split('.').reverse()[0]}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Advertisement Created`, `${req.user.username} (${req.user.id}) created an advertisement.`);
            return res.redirect(`/admin`);
        });
        fs.writeFileSync(`./public/images/advertisement_${uid}.${req.files[0].originalname.split('.').reverse()[0]}`, req.files[0].buffer);
    });
});

app.post('/backend/create/staff', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let name of Object.keys(req.body)) {
        req.body[name] = await utils.sanitize(req.body[name]);
    };
    let perms = {
        altersitesettings: false,
        altersitestyling: false,
        createeditproducts: false,
        deleteproducts: false,
        managesubs: false,
        manageinvoices: false,
        managequotes: false,
        managestorecats: false,
        managestoretags: false,
        managegiftcards: false,
        managediscounts: false,
        managereviews: false,
        manageusers: false,
        manageowneditems: false,
        managebans: false,
        manageteam: false,
        managepartners: false,
        managedocs: false,
        managecustompages: false,
        manageclientcompanies: false,
        manageapikeys: false,
        manageads: false,
        viewstats: false,
        viewauditlogs: false,
        manageseo: false,
        manageorders: false,
        managecontactsubmissions: false,
        manageblogs: false
    };
    Object.keys(req.body).forEach(function(item) {
        if(item != 'userid') {
            perms[item] = true;
        };
    });
    if(config.ownerIds.includes(req.user.id)) {
        con.query(`SELECT * FROM staff WHERE userid="${req.body.userid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) {
                con.query(`INSERT INTO staff (userid, manageseo, manageorders, managecontactsubmissions, manageblogs, altersitesettings, altersitestyling, createeditproducts, deleteproducts, managesubs, manageinvoices, managequotes, managestorecats, managestoretags, managegiftcards, managediscounts, managereviews, manageusers, manageowneditems, managebans, manageteam, managepartners, managedocs, managecustompages, manageclientcompanies, manageapikeys, manageads, viewstats, viewauditlogs) VALUES ("${req.body.userid}", ${perms.altersitesettings}, ${perms.altersitestyling}, ${perms.createeditproducts}, ${perms.deleteproducts}, ${perms.managesubs}, ${perms.manageinvoices}, ${perms.managequotes}, ${perms.managestorecats}, ${perms.managestoretags}, ${perms.managegiftcards}, ${perms.managediscounts}, ${perms.managereviews}, ${perms.manageusers}, ${perms.manageowneditems}, ${perms.managebans}, ${perms.manageteam}, ${perms.managepartners}, ${perms.managedocs}, ${perms.managecustompages}, ${perms.manageclientcompanies}, ${perms.manageapikeys}, ${perms.manageads}, ${perms.viewstats}, ${perms.viewauditlogs})`, async (err, row) => {
                    if(err) throw err;
                });
            };
            backend.audit(`Staff Added`, `${req.user.username} (${req.user.id}) added a staff member (${req.body.userid}).`);
            return res.redirect('/admin');
        });
    } else {
        return res.send('You are not an owner within the config file on this account...');
    };
});

app.post('/backend/create/banneduser', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let name of Object.keys(req.body)) {
        req.body[name] = await utils.sanitize(req.body[name]);
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}" AND managebans=1`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.send('You do not have permission to do this.');
        con.query(`INSERT INTO bannedusers (userid) VALUES ("${req.body.userid}")`, async (err, row) => {
            if(err) throw err;
        });
        backend.audit(`User Banned`, `${req.user.username} (${req.user.id}) added a banned user Id (${req.body.userid}).`);
        return res.redirect('/admin');
    });
});

app.get('/backend/delete/banneduser/:userid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let name of Object.keys(req.params)) {
        req.params[name] = await utils.sanitize(req.params[name]);
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}" AND managebans=1`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.send('You do not have permission to do this.');
        con.query(`DELETE FROM bannedusers WHERE userid="${req.params.userid}"`, async (err, row) => {
            if(err) throw err;
        });
        backend.audit(`User Unbanned`, `${req.user.username} (${req.user.id}) removed a banned user Id (${req.body.userid}).`);
        return res.redirect('/admin');
    });
});

app.post('/backend/notify/create', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.body.userid = await utils.sanitize(req.body.userid);
    req.body.content = await utils.sanitize(req.body.content, true);
    let uid = await utils.generateRandom(19);
    let datetime = await utils.fetchTime(config.timeZone.tz, config.timeZone.format);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].altersitesettings) return res.send('You do not have permission to edit this section.');
        con.query(`SELECT * FROM users WHERE id="${req.body.userid}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/admin');
            con.query(`INSERT INTO notifications (uniqueid, userid, content, datetime, hasbeenread) VALUES ("${uid}", "${req.body.userid}", "${req.body.content}", "${datetime}", false)`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Notification Created`, `${req.user.username} (${req.user.id}) created a notification for ${req.body.userid}.`);
                return res.redirect(`/admin`);
            });
        });
    });
});

app.post('/backend/create/faq', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(12);
    req.body.question = await utils.sanitize(req.body.question);
    req.body.answer = await utils.sanitize(req.body.answer);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].altersitesettings) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO faq (uniqueid, question, answer) VALUES ("${uid}", "${req.body.question}", "${req.body.answer}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`FAQ Created`, `${req.user.username} (${req.user.id}) created a FAQ.`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/create/storetag', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(14);
    req.body.tagname = await utils.sanitize(req.body.tagname);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managestoretags) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO storetags (uniqueid, name) VALUES ("${uid}", "${req.body.tagname}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Store Tag Created`, `${req.user.username} (${req.user.id}) created a store tag.`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/create/navbarbutton', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(7);
    req.body.pos = await utils.sanitize(req.body.pos);
    req.body.parentid = await utils.sanitize(req.body.parentid);
    req.body.buttonname = await utils.sanitize(req.body.buttonname);
    req.body.buttonlink = await utils.sanitize(req.body.buttonlink);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].altersitesettings) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO navbar (uniqueid, pos, parentid, name, link) VALUES ("${uid}", ${Number(req.body.pos)}, "${req.body.parentid}", "${req.body.buttonname}", "${req.body.buttonlink}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Navbar Button Created`, `${req.user.username} (${req.user.id}) created a navbar button.`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/create/usingcompanies', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(7);
    req.body.name = await utils.sanitize(req.body.name);
    req.body.link = await utils.sanitize(req.body.link);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageclientcompanies) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO usingcompanies (uniqueid, name, link) VALUES ("${uid}", "${req.body.name}", "${req.body.link}")`, async (err, row) => {
            if(err) throw err;
            if(req.files[0]) {
                req.files.forEach(function(item) {
                    fs.writeFileSync(`./public/images/usingcompany_${uid}.png`, item.buffer);
                });
            };
            backend.audit(`Using Company Created`, `${req.user.username} (${req.user.id}) created a using company.`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/themes/apply', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.body.themefile = await utils.sanitize(req.body.themefile);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].altersitesettings) return res.send('You do not have permission to edit this section.');
        con.query(`UPDATE sitesettings SET themefile="${req.body.themefile}"`, function(err, row) {
            if(err) throw err;
            res.redirect('/admin');
        });
    });
});

app.post('/backend/themes/upload', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].altersitesettings) return res.send('You do not have permission to edit this section.');
        if(req.files[0]) {
            fs.writeFileSync(`./public/themes/${req.files[0].originalname}`, req.files[0].buffer);
        };
        res.redirect('/admin');
    });
});

app.post('/backend/create/application', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let item of Object.keys(req.body)) {
        req.body[item] = await utils.sanitize(req.body[item]);
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`INSERT INTO applications (id, name, closed) VALUES ("${Date.now()}", "${req.body.name}", false)`, function(err, row) {
            if(err) throw err;
            res.redirect('/admin')
        });
    });
});

app.post('/backend/update/application/status/:uid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let item of Object.keys(req.body)) {
        req.body[item] = await utils.sanitize(req.body[item]);
    };
    for(let item of Object.keys(req.params)) {
        req.params[item] = await utils.sanitize(req.params[item]);
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`UPDATE appresponses SET status="${req.body.status}" WHERE id="${req.params.uid}"`, function(err, row) {
            if(err) throw err;
            res.redirect(`/view/application/${req.params.uid}`);
        });
    });
});

app.post('/backend/create/appquestion/:uid/:type', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    for(let item of Object.keys(req.body)) {
        req.body[item] = await utils.sanitize(req.body[item]);
    };
    for(let item of Object.keys(req.params)) {
        req.params[item] = await utils.sanitize(req.params[item]);
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, function(err, row) {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        con.query(`INSERT INTO appquestions (id, appid, content, type, dropdownitems) VALUES ("${Date.now()}", "${req.params.uid}", "${req.body.question}", ${Number(req.params.type)}, "${req.body.dropdownitems}")`, function(err, row) {
            if(err) throw err;
            res.redirect(`/admin/edit/application/${req.params.uid}`);
        });
    });
});

app.post('/backend/create/apikey', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(28);
    req.body.userid = await utils.sanitize(req.body.userid);
    req.body.limited = await utils.sanitize(req.body.limited);
    req.body.maxuses = await utils.sanitize(req.body.maxuses);
    if(req.body.limited.toLowerCase() == 'yes') {
        req.body.limited = true;
    } else {
        req.body.limited = false;
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageapikeys) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO apikeys (apikey, limited, maxuses, uses, lastusedip, lastuseddate, userid) VALUES ("${uid}", ${req.body.limited}, ${Number(req.body.maxuses)}, 0, "none", "none", "${req.body.userid}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`API Key Created`, `${req.user.username} (${req.user.id}) created an API Key (<span class='censored'>${uid}</span>).`);
            return res.redirect(`/admin`);
        });
    });
});

app.post('/backend/update/invoice/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.params.uniqueid = await utils.sanitize(req.params.uniqueid);
    req.body.title = await utils.sanitize(req.body.title);
    req.body.description = await utils.sanitize(req.body.description);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageinvoices) return res.send('You do not have permission to edit this section.');
        con.query(`UPDATE invoices SET title="${req.body.title}", description="${req.body.description}" WHERE uniqueid="${req.params.uniqueid}"`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Invoice Updated`, `${req.user.username} (${req.user.id}) updated an invoice (${req.params.uniqueid}).`);
            return res.redirect(`/invoice/${req.params.uniqueid}`);
        });
    });
});

app.post('/backend/create/invoice', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(19);
    req.body.userid = await utils.sanitize(req.body.userid);
    req.body.title = await utils.sanitize(req.body.title);
    req.body.description = await utils.sanitize(req.body.description);
    req.body.price = await utils.sanitize(req.body.price);
    if(!req.body.price.includes('.')) req.body.price = `${req.body.price}.00`;
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].manageinvoices) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO invoices (uniqueid, userid, title, description, price, paid, datetime) VALUES ("${uid}", "${req.body.userid}", "${req.body.title}", "${req.body.description}", "${req.body.price}", false, "${await utils.fetchTime(config.timeZone.tz, config.timeZone.format)}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Invoice Created`, `${req.user.username} (${req.user.id}) created an invoice for ${req.body.userid} [${config.paymentSettings.currencySymbol}${req.body.price}].`);
            backend.createNotification(req.body.userid, "An invoice has been generated to your account!");
            con.query(`SELECT * FROM users WHERE id="${req.body.userid}"`, async (err, row) => {
                if(err) throw err;
                if(!row[0]) return;
                HyperzStore.emit('invoiceCreated', row[0], { uniqueid: uid, userid: req.body.userid, title: req.body.title, description: req.body.description, price: req.body.price, paid: false, datetime: await utils.fetchTime(config.timeZone.tz, config.timeZone.format) })
                backend.createEmail(row[0].email, "You were invoiced!", `An invoice has been generated to your account! View it <a href='${config.domain}/account'>here</a>!`, 'NOTIFICATIONS');
            });
            return res.redirect(`/invoice/${uid}`);
        });
    });
});

app.post('/backend/create/quote', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(19);
    req.body.userid = await utils.sanitize(req.body.userid);
    req.body.title = await utils.sanitize(req.body.title);
    req.body.description = await utils.sanitize(req.body.description);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managequotes) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO quotes (uniqueid, userid, name, description, datetime) VALUES ("${uid}", "${req.body.userid}", "${req.body.title}", "${req.body.description}", "${await utils.fetchTime(config.timeZone.tz, config.timeZone.format)}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Quote Created`, `${req.user.username} (${req.user.id}) created a quote for ${req.body.userid}.`);
            backend.createNotification(req.body.userid, "A quote has been generated for your account!");
            con.query(`SELECT * FROM users WHERE id="${req.body.userid}"`, async (err, row) => {
                if(err) throw err;
                if(!row[0]) return;
                backend.createEmail(row[0].email, "You have recieved a quote!", `A quote has been generated to your account! View it <a href='${config.domain}/account'>here</a>!`, 'NOTIFICATIONS');
            });
            return res.redirect(`/quote/${uid}`);
        });
    });
});

app.post('/backend/create/quoteitem/:quoteid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(19);
    req.params.quoteid = await utils.sanitize(req.params.quoteid);
    req.body.name = await utils.sanitize(req.body.name);
    req.body.price = await utils.sanitize(req.body.price);
    req.body.description = await utils.sanitize(req.body.description);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managequotes) return res.send('You do not have permission to edit this section.');
        con.query(`INSERT INTO quoteitems (uniqueid, quoteid, name, description, price) VALUES ("${uid}", "${req.params.quoteid}", "${req.body.name}", "${req.body.description}", "${req.body.price}")`, async (err, row) => {
            if(err) throw err;
            return res.redirect(`/quote/${req.params.quoteid}`);
        });
    });
});

app.post('/backend/create/product', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(14);
    let cluid = await utils.generateRandom(21);
    req.body.productname = await utils.sanitize(req.body.productname);
    req.body.productlink = await utils.sanitize(req.body.productlink);
    if(!req.body.extension) req.body.extension = "none";
    req.body.extension = await utils.sanitize(req.body.extension);
    req.body.productprice = await utils.sanitize(req.body.productprice);
    if(!req.body.productgivenrole) req.body.productgivenrole = 'none';
    req.body.productgivenrole = await utils.sanitize(req.body.productgivenrole);
    if(!req.body.tebexpackageid) req.body.tebexpackageid = 'none';
    req.body.tebexpackageid = await utils.sanitize(req.body.tebexpackageid);
    if(!req.body.productprice.includes('.')) req.body.productprice = `${req.body.productprice}.00`;
    if(!req.body.pricecrossout) {
        req.body.pricecrossout = 'none';
    } else {
        req.body.pricecrossout = await utils.sanitize(req.body.pricecrossout);
        if(!req.body.pricecrossout.includes('.')) req.body.pricecrossout = `${req.body.pricecrossout}.00`;
    };
    req.body.productpos = await utils.sanitize(req.body.productpos);
    req.body.prodtype = await utils.sanitize(req.body.prodtype);
    req.body.productdescription = await utils.sanitize(req.body.productdescription, true);
    req.body.productcredits = await utils.sanitize(req.body.productcredits, true);
    req.body.productgallery = await utils.sanitize(req.body.productgallery);
    if(!req.body.demolink) req.body.demolink = 'none';
    req.body.demolink = await utils.sanitize(req.body.demolink);
    if(!req.body.linkeditems) req.body.linkeditems = 'none';
    req.body.linkeditems = await utils.sanitize(req.body.linkeditems);
    if(!req.body.quantity) req.body.quantity = '-1';
    req.body.quantity = await utils.sanitize(req.body.quantity);
    let storetags;
    if(req.body.checkbox) {
        storetags = await utils.sanitize(Object.keys(req.body.checkbox).join(', '));
    };
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].createeditproducts) return res.send('You do not have permission to edit this section.');
        fs.writeFileSync(`./public/images/product_${uid}.${req.files[0].originalname.split('.').reverse()[0]}`, req.files[0].buffer);
        let zipFileName = "Physical";
        if(req.body.prodtype != 3) {
            zipFileName = await utils.sanitize(`${req.body.productname.replaceAll(" ", "").replaceAll("-", "").replaceAll(',', '').toLowerCase()}_${uid}.${req.files[1].originalname.split('.').reverse()[0]}`);
            fs.writeFileSync(`./downloads/${zipFileName}`, req.files[1].buffer);
            con.query(`INSERT INTO changelogs (uniqueid, title, vers, content, datetime, productid) VALUES ("${cluid}", "Initial Release", "1.0.0", "Initial release.", "${await utils.fetchTime(config.timeZone.tz, config.timeZone.format)}", "${uid}")`, async (err, row) => { if(err) throw err; });
        };
        con.query(`INSERT INTO products (quantity, tebexpackageid, extension, pricecrossout, prodtype, featured, uniqueid, name, link, description, credits, price, gallery, pos, zipfilename, givenrole, hidden, paused, overallviews, overallprofit, demolink, linkeditems, storetags) VALUES (${Number(req.body.quantity)}, "${req.body.tebexpackageid}", "${req.body.extension}", "${req.body.pricecrossout}", ${Number(req.body.prodtype)}, false, "${uid}", "${req.body.productname}", "${req.body.productlink}", "${req.body.productdescription}", "${req.body.productcredits}","${req.body.productprice}", "${req.body.productgallery}", ${req.body.productpos}, "${zipFileName}", "${req.body.productgivenrole || 'none'}", false, false, 0, "0.00", "${req.body.demolink}", "${req.body.linkeditems}", "${storetags}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Store Item Created`, `${req.user.username} (${req.user.id}) created a store item (${req.body.productname}).`);
            backend.logToDiscord('🛒 Product Created', `[${req.user.username}](${config.domain}/account/${req.user.id}) created store item **[${req.body.productname}](${config.domain}/shop/${req.body.productlink})**!`);
            return res.redirect(`/backend/findproduct/${uid}`);
        });
    });
});

app.post('/backend/create/storecat', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    let uid = await utils.generateRandom(14);
    req.body.catname = await utils.sanitize(req.body.catname);
    req.body.catlink = await utils.sanitize(req.body.catlink);
    req.body.catpos = await utils.sanitize(req.body.catpos);
    req.body.catdescription = await utils.sanitize(req.body.catdescription, true);
    if(!req.body.linkeditems) req.body.linkeditems = 'none';
    req.body.linkeditems = await utils.sanitize(req.body.linkeditems);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managestorecats) return res.send('You do not have permission to edit this section.');
        fs.writeFileSync(`./public/images/storecat_${uid}.png`, req.files[0].buffer);
        con.query(`INSERT INTO storecategories (uniqueid, name, link, description, pos, hidden, items) VALUES ("${uid}", "${req.body.catname}", "${req.body.catlink}", "${req.body.catdescription}", ${req.body.catpos}, false, "${req.body.linkeditems}")`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Store Category Created`, `${req.user.username} (${req.user.id}) created a store category (${req.body.catname}).`);
            return res.redirect(`/shop/${req.body.catlink}`);
        });
    });
});

app.post('/backend/update/storecat/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) res.redirect('/404');
    let uid = await utils.sanitize(req.params.uniqueid);
    req.body.catname = await utils.sanitize(req.body.catname);
    req.body.catlink = await utils.sanitize(req.body.catlink);
    req.body.catpos = await utils.sanitize(req.body.catpos);
    req.body.catdescription = await utils.sanitize(req.body.catdescription, true);
    if(!req.body.linkeditems) req.body.linkeditems = 'none';
    req.body.linkeditems = await utils.sanitize(req.body.linkeditems);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].managestorecats) return res.send('You do not have permission to edit this section.');
        if(req.files[0]) {
            fs.writeFileSync(`./public/images/storecat_${uid}.${req.files[0].originalname.split('.').reverse()[0]}`, req.files[0].buffer);
        };
        con.query(`UPDATE storecategories SET name="${req.body.catname}", link="${req.body.catlink}", description="${req.body.catdescription}", pos=${req.body.catpos}, items="${req.body.linkeditems}" WHERE uniqueid="${uid}"`, async (err, row) => {
            if(err) throw err;
            backend.audit(`Store Category Updated`, `${req.user.username} (${req.user.id}) updated a store category (${req.body.catname}).`);
            return res.redirect(`/shop/${req.body.catlink}`);
        });
    });
});

app.post('/backend/update/product/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) res.redirect('/404');
    let uid = await utils.sanitize(req.params.uniqueid);
    let zipFileName;
    req.body.productname = await utils.sanitize(req.body.productname);
    req.body.productlink = await utils.sanitize(req.body.productlink);
    if(!req.body.extension) req.body.extension = "none";
    req.body.extension = await utils.sanitize(req.body.extension);
    req.body.productprice = await utils.sanitize(req.body.productprice);
    req.body.pricecrossout = await utils.sanitize(req.body.pricecrossout);
    if(!req.body.productgivenrole) req.body.productgivenrole = 'none';
    req.body.productgivenrole = await utils.sanitize(req.body.productgivenrole);
    if(!req.body.tebexpackageid) req.body.tebexpackageid = 'none';
    req.body.tebexpackageid = await utils.sanitize(req.body.tebexpackageid);
    if(!req.body.productprice.includes('.')) req.body.productprice = `${req.body.productprice}.00`;
    if(!req.body.pricecrossout) req.body.pricecrossout = 'none';
    if(!req.body.pricecrossout.includes('.') && req.body.pricecrossout.toLowerCase() != 'none') req.body.pricecrossout = `${req.body.pricecrossout}.00`;
    req.body.productpos = await utils.sanitize(req.body.productpos);
    req.body.productdescription = await utils.sanitize(req.body.productdescription, true);
    req.body.productcredits = await utils.sanitize(req.body.productcredits, true);
    req.body.productgallery = await utils.sanitize(req.body.productgallery);
    if(!req.body.demolink) req.body.demolink = 'none';
    req.body.demolink = await utils.sanitize(req.body.demolink);
    if(!req.body.linkeditems) req.body.linkeditems = 'none';
    req.body.linkeditems = await utils.sanitize(req.body.linkeditems);
    if(!req.body.quantity) req.body.quantity = -1;
    req.body.quantity = await utils.sanitize(req.body.quantity);
    let storetags;
    if(req.body.checkbox) {
        storetags = await utils.sanitize(Object.keys(req.body.checkbox).join(', '));
    };
    con.query(`SELECT * FROM products WHERE uniqueid="${uid}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/admin');
        if(row[0].quantity == 0 && req.body.quantity != 0) {
            con.query(`UPDATE products SET paused=false WHERE uniqueid="${uid}"`, (err, row) => {
                if(err) throw err;
            });
        };
        con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            if(!row[0].createeditproducts) return res.send('You do not have permission to edit this section.');
            if(req.files[0]) {
                for(let item of req.files) {
                    if(item.fieldname == 'mainimage') {
                        fs.writeFileSync(`./public/images/product_${uid}.${item.originalname.split('.').reverse()[0]}`, item.buffer);
                    } else if(item.fieldname == 'productfile') {
                        zipFileName = await utils.sanitize(`${req.body.productname.replaceAll(" ", "").replaceAll("-", "").replaceAll(',', '').toLowerCase()}_${uid}.${item.originalname.split('.').reverse()[0]}`);
                        fs.writeFileSync(`./downloads/${zipFileName}`, item.buffer);
                        con.query(`UPDATE products SET zipfilename="${zipFileName}" WHERE uniqueid="${uid}"`, async (err, row) => {
                            if(err) throw err;
                        });
                    };
                };
            };
            con.query(`UPDATE products SET quantity=${req.body.quantity}, tebexpackageid="${req.body.tebexpackageid}", extension="${req.body.extension}", pricecrossout="${req.body.pricecrossout}", name="${req.body.productname}", link="${req.body.productlink}", description="${req.body.productdescription}", credits="${req.body.productcredits}", price="${req.body.productprice}", gallery="${req.body.productgallery}", pos=${req.body.productpos}, givenrole="${req.body.productgivenrole}", demolink="${req.body.demolink}", linkeditems="${req.body.linkeditems}", storetags="${storetags}" WHERE uniqueid="${uid}"`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Product Updated`, `${req.user.username} (${req.user.id}) updated a product (${req.body.productname}).`);
                backend.logToDiscord('🛒 Product Updated', `[${req.user.username}](${config.domain}/account/${req.user.id}) updated store item **[${req.body.productname}](${config.domain}/shop/${req.body.productlink})**!`);
                return res.redirect(`/backend/findproduct/${uid}`);
            });
        });
    });
});

app.post('/backend/update/order/:uniqueid', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.params.uniqueid) res.redirect('/404');
    let uid = await utils.sanitize(req.params.uniqueid);
    req.body.status = Number(await utils.sanitize(req.body.status));
    req.body.trackinginfo = await utils.sanitize(req.body.trackinginfo);
    req.body.firstlastname = await utils.sanitize(req.body.firstlastname);
    req.body.shippingemail = await utils.sanitize(req.body.shippingemail);
    req.body.address = await utils.sanitize(req.body.address);
    req.body.city = await utils.sanitize(req.body.city);
    req.body.state = await utils.sanitize(req.body.state);
    req.body.zipcode = await utils.sanitize(req.body.zipcode);
    req.body.country = await utils.sanitize(req.body.country);
    con.query(`SELECT * FROM owneditems WHERE uniqueid="${uid}" AND prodtype=3`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/admin');
        con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            if(!row[0].manageorders) return res.send('You do not have permission to edit this section.');
            con.query(`UPDATE owneditems SET status=${req.body.status}, trackinginfo="${req.body.trackinginfo}", firstlastname="${req.body.firstlastname}", shippingemail="${req.body.shippingemail}", address="${req.body.address}", city="${req.body.city}", state="${req.body.state}", zipcode="${req.body.zipcode}", country="${req.body.country}" WHERE uniqueid="${uid}"`, async (err, row) => {
                if(err) throw err;
                backend.audit(`Order Updated`, `${req.user.username} (${req.user.id}) updated an order (${uid}).`);
                backend.logToDiscord('📦 Order Updated', `[${req.user.username}](${config.domain}/account/${req.user.id}) updated an order! UID: **[${uid}](${config.domain}/admin/vieworder/${uid})**!`);
                return res.redirect(`/admin`);
            });
        });
    });
});

app.post('/backend/update/settings', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    req.body.sitename = await utils.sanitize(req.body.sitename);
    req.body.sitecolor = await utils.sanitize(req.body.sitecolor);
    if(!req.body.sitecolor.startsWith('#')) req.body.sitecolor = `#${req.body.sitecolor}`;
    req.body.sitedesc = await utils.sanitize(req.body.sitedesc);
    req.body.firewallgg = Number(await utils.sanitize(req.body.firewallgg));
    req.body.emailconfirmation = Number(await utils.sanitize(req.body.emailconfirmation));
    req.body.maintenance = Number(await utils.sanitize(req.body.maintenance));
    req.body.homeabout = await utils.sanitize(req.body.homeabout, true);
    if(!req.body.tawkto) req.body.tawkto = "none";
    req.body.tawkto = await utils.sanitize(req.body.tawkto, true);
    req.body.demotext = await utils.sanitize(req.body.demotext, true);
    if(!req.body.email) req.body.email = 'none';
    req.body.email = await utils.sanitize(req.body.email);
    if(!req.body.twitter) req.body.twitter = 'none';
    req.body.twitter = await utils.sanitize(req.body.twitter);
    if(!req.body.discord) req.body.discord = 'none';
    req.body.discord = await utils.sanitize(req.body.discord);
    if(!req.body.youtube) req.body.youtube = 'none';
    req.body.youtube = await utils.sanitize(req.body.youtube);
    if(!req.body.instagram) req.body.instagram = 'none';
    req.body.instagram = await utils.sanitize(req.body.instagram);
    if(!req.body.linkedin) req.body.linkedin = 'none';
    req.body.linkedin = await utils.sanitize(req.body.linkedin);
    if(!req.body.facebook) req.body.facebook = 'none';
    req.body.facebook = await utils.sanitize(req.body.facebook);
    if(!req.body.tiktok) req.body.tiktok = 'none';
    req.body.tiktok = await utils.sanitize(req.body.tiktok);
    req.body.notification = await utils.sanitize(req.body.notification);
    req.body.loggingchannelid = await utils.sanitize(req.body.loggingchannelid);
    req.body.phonenumber = await utils.sanitize(req.body.phonenumber);
    req.body.supportlogschannelid = await utils.sanitize(req.body.supportlogschannelid);
    req.body.guildid = await utils.sanitize(req.body.guildid);
    if(typeof req.body.globalcustomer != 'undefined' && req.body.globalcustomer != '') {
        req.body.globalcustomer = await utils.sanitize(req.body.globalcustomer);
    } else {
        req.body.globalcustomer = await utils.sanitize('none');
    };
    if(typeof req.body.loggingchannelid != 'undefined' && req.body.loggingchannelid != '') {
        req.body.loggingchannelid = await utils.sanitize(req.body.loggingchannelid);
    } else {
        req.body.loggingchannelid = await utils.sanitize('none');
    };
    if(typeof req.body.phonenumber != 'undefined' && req.body.phonenumber != '') {
        req.body.phonenumber = await utils.sanitize(req.body.phonenumber);
    } else {
        req.body.phonenumber = await utils.sanitize('none');
    };
    if(typeof req.body.supportlogschannelid != 'undefined' && req.body.supportlogschannelid != '') {
        req.body.supportlogschannelid = await utils.sanitize(req.body.supportlogschannelid);
    } else {
        req.body.supportlogschannelid = await utils.sanitize('none');
    };
    req.body.termsofservice = await utils.sanitize(req.body.termsofservice, true);
    req.body.privacypolicy = await utils.sanitize(req.body.privacypolicy, true);
    req.body.cookiepolicy = await utils.sanitize(req.body.cookiepolicy, true);
    con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        if(!row[0].altersitesettings) return res.send('You do not have permission to edit this section.');
        if(typeof req.files != 'undefined' && req.files[0]) {
            await req.files.forEach(function(file) {
                if(file.fieldname == 'logo') {
                    fs.writeFileSync(`./public/assets/logo.png`, file.buffer);
                } else if(file.fieldname == 'header') {
                    fs.writeFileSync(`./public/assets/headerimage.jpg`, file.buffer);
                };
            });
        };
        con.query(`UPDATE sitesettings SET linkedin="${req.body.linkedin}", emailconfirmation=${req.body.emailconfirmation}, phonenumber="${req.body.phonenumber}", tawkto="${req.body.tawkto}", supportlogschannelid="${req.body.supportlogschannelid}", sitename="${req.body.sitename}", sitecolor="${req.body.sitecolor}", sitedesc="${req.body.sitedesc}", homeabout="${req.body.homeabout}", notification="${req.body.notification}", guildid="${req.body.guildid}", globalcustomer="${req.body.globalcustomer}", loggingchannelid="${req.body.loggingchannelid}", termsofservice="${req.body.termsofservice}", privacypolicy="${req.body.privacypolicy}", cookiepolicy="${req.body.cookiepolicy}", firewallgg=${req.body.firewallgg}, maintenance=${req.body.maintenance}, demotext="${req.body.demotext}", email="${req.body.email}", twitter="${req.body.twitter}", discord="${req.body.discord}", youtube="${req.body.youtube}", instagram="${req.body.instagram}", facebook="${req.body.facebook}", tiktok="${req.body.tiktok}"`, async (err, row) => {
            if(err) throw err;
        });
        backend.audit(`Settings Updated`, `${req.user.username} (${req.user.id}) updated the site settings.`);
        await backend.logToDiscord('⚙️ Settings Updated!', `[${req.user.username}](${config.domain}/account/${req.user.id}) has updated website settings!`);
        return res.redirect('/admin');
    });
});

app.post('/register', backend.checkNotAuth, async (req, res) => {
    await backend.resetAppLocals(app);
    for(let name of Object.keys(req.body)) {
        req.body[name] = await utils.sanitize(req.body[name]);
    };
    //try { console.log(req.get('host')) } catch(e) { console.log(12, e) }
    try {
        if(typeof(req.files) == 'undefined') return;
        let userid = await backend.generateUserId(7);
        let hashedPassword = await bcrypt.hash(req.body.password, 13);
        con.query(`SELECT * FROM users WHERE email="${req.body.email}"`, async function (err, row) {
            if(err) throw err;
            if(!row[0]) {
                con.query(`SELECT * FROM sitesettings`, async function(err, row) {
                    if(err) throw err;
                    if(!row[0]) return console.log('No site settings found.');
                    con.query(`INSERT INTO users (temporary, giftcard, id, email, password, username, latestip, cart, discount, note, client, mailinglist, mailendpoints) VALUES (${app.locals.sitesettings.emailconfirmation}, 'none', '${userid}', '${req.body.email}', '${hashedPassword}', '${await utils.sanitize(req.body.username)}', '${req.clientIp || 'none'}', '[]', 0, 'none', 0, 1, '["NOTIFICATIONS", "LOGIN_SESSION"]')`, async (err, row) => {
                        if(err) throw err;
                        backend.audit(`Account Created`, `${req.body.username} (${userid}) created an account.`)
                        backend.updateStats('newusers');
                        if(app.locals.sitesettings.emailconfirmation) {
                            backend.createEmail(req.body.email || "none", "Email Verification - Account Created", `Hey there, we are happy to see you joining our community! You will need to verify your email address to continue. If you have not verified within 1 hour, your account will be deleted. <a href='${config.domain}/emailverify/${userid}' style="color: white; text-decoration: none; padding: 0.6em; font-size: 1.4em; border-radius: 0.4em; background-color: ${app.locals.sitesettings.sitecolor};">Verify Email Address</a>\n\nWe value all of our members, clients, staff, and work! You are our priority and we strive to provide the greatest support we can!`, 'NOTIFICATIONS');
                        } else {
                            backend.createEmail(req.body.email || "none", "Account Created", `Hey there, we are happy to see you joining our community! If you have any questions don't hesitate to ask.\n\nWe value all of our members, clients, staff, and work! You are our priority and we strive to provide the greatest support we can!\n\n<a href='${config.domain}/account' style="color: white; text-decoration: none; padding: 0.6em; font-size: 1.4em; border-radius: 0.4em; background-color: ${app.locals.sitesettings.sitecolor};">View Account</a>`, 'NOTIFICATIONS');
                        };
                    });
                    res.redirect('/login')
                });
                if(req.files[0] && req.files[0].originalname.split('.').reverse()[0] == 'png') {
                    try { fs.writeFileSync(`./public/images/avatar_${userid}.png`, req.files[0].buffer); } catch(e) {};
                } else {
                    try { fs.copyFileSync('./public/assets/noavatar.png', `./public/images/avatar_${userid}.png`); } catch(e) {};
                };
            } else {
                res.redirect('/login')
            };
        });
    } catch(e) {
        console.log(e)
        res.redirect('/register')
    };
});
app.post('/backend/update/avatar', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(!req.files[0]) return res.redirect('/404');
    fs.writeFileSync(`./public/images/avatar_${req.user.id}.png`, req.files[0].buffer);
    return res.redirect('/account')
});
app.post('/backend/update/password', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(req.body.password !== req.body.confpassword) return res.send('Your passwords do not match...');
    let hashedPassword = await bcrypt.hash(req.body.confpassword, 13);
    con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async function(err, row) {
        if(err) throw err;
        con.query(`UPDATE users SET password="${hashedPassword}" WHERE id="${req.user.id}"`, function(err, row) { if(err) throw err; });
        backend.createEmail(row[0].email || "none", "Password Changed!", `You have successfully changed your account password!`, 'NOTIFICATIONS');
        req.logout(function(err) {
            if(err) { return next(err); }
        });
        res.redirect('/login');
    });
});
app.post('/auth/local', backend.checkNotAuth, passport.authenticate('local', {
    successRedirect: '/account',
    failureRedirect: '/login',
    failureFlash: true
}));

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', {failureRedirect: '/login'}), async function(req, res) {
    res.redirect('/account');
    backend.createEmail(req.user.email || "none", "Client Area Login Notification", `Dear ${req.user.username},\nWe are sending you this email to inform you of your successful login to our client area.\n\nIP Address: ${req.clientIp || 'none'}\nTime: ${await utils.fetchTime(config.timeZone.tz, config.timeZone.format)}\nDomain: ${config.domain}\n\nThis email is intended to inform you about the security of your account.\n\nThank you for entrusting us with your service. We very much appreciate your business!`, "LOGIN_SESSION")
});

app.post('/backend/completemigration/fileuploads/faxstore', backend.checkAuth, async function(req, res) {
    await backend.resetAppLocals(app);
    if(config.ownerIds.includes(req.user.id)) {
        await req.files.forEach(async function(file) {
            con.query(`SELECT * FROM products WHERE uniqueid="${file.fieldname}"`, async (err, row) => {
                if(err) throw err;
                let product = row[0];
                let zipFileName = await utils.sanitize(`${product.name.replaceAll(" ", "").replaceAll("-", "").replaceAll(',', '').toLowerCase()}_${product.uniqueid}.${file.originalname.split('.').reverse()[0]}`);
                fs.writeFileSync(`./downloads/${zipFileName}`, file.buffer);
            });
        });
        res.redirect('/shop');
    } else {
        res.redirect('/admin');
    };
});

// API V1 ENDPOINTS START HERE

app.get('/api/v1/maxuses', async function(req, res) {
    let json_ = {
        "authorized": false,
        "solution": "This error occurs when you have reached the maximum number of uses for your API key."
    };
    res.type('json').send(JSON.stringify(json_, null, 4) + '\n');
});

app.get('/api/v1', async function(req, res) {
    if(!req.headers.authorization) return res.type('json').send(JSON.stringify({
        "authorized": false,
        "solution": "This error is most common when you provide an invalid API token in your request. Make sure to provide your authorization key in the headers of your request."
    }, null, 4) + '\n');
    req.headers.authorization = await utils.sanitize(req.headers.authorization);
    let ip = req.clientIp || 'undefined';
    con.query(`SELECT * FROM apikeys WHERE apikey="${req.headers.authorization}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.type('json').send(JSON.stringify({
            "authorized": false,
            "solution": "This error is most common when you provide an invalid API token in your request. Make sure to provide your authorization key in the headers of your request."
        }, null, 4) + '\n');
        if(row[0].uses >= row[0].maxuses) return res.type('json').send(JSON.stringify({
            "authorized": false,
            "solution": "This error occurs when you have reached the maximum number of uses for your API key."
        }, null, 4) + '\n');
        con.query(`UPDATE apikeys SET uses=uses+1, lastusedip="${ip}", lastuseddate="${await utils.getDate()}" WHERE apikey="${req.headers.authorization}"`, async (err, row) => {
            if(err) throw err;
            // ACTUAL API RESPONSE HERE
            // ACTUAL API RESPONSE HERE
            // ACTUAL API RESPONSE HERE
            return res.type('json').send(JSON.stringify({
                "authorized": true,
                "solution": "none"
            }, null, 4) + '\n');
        });
    });
});

app.get('/api/v1/license/check/:checkkey', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    let key = await utils.sanitize(req.params.checkkey);
    if(!req.headers.productid) {
        let json_ = {
            "authorized": false,
            "reason": "No Product Unique Id Provided in Headers of the request."
        }
        return res.type('json').send(JSON.stringify(json_, null, 4) + '\n');
    };
    req.headers.productid = await utils.sanitize(req.headers.productid);
    con.query(`SELECT * FROM owneditems WHERE licensekey="${key}" AND productid="${req.headers.productid}"`, async (err, row) => {
        if(err) throw err;
        if(row[0]) {
            if(row[0].disabled || row[0].admindisabled) {
                con.query(`SELECT * FROM owneditems WHERE licensekey='${key}' AND productid='${req.headers.productid}'`, async (err, pulleditem) => {
                    if(err) throw err;
                    con.query(`INSERT INTO licenselogs (uniqueid, owneditemuid, ipaddress, status, datetime) VALUES ("${await utils.generateRandom(42)}", "${pulleditem[0].uniqueid}", "${req.clientIp.toLocaleString()}", "FAILED - Disabled", "${await utils.fetchTime(config.timeZone.tz, config.timeZone.format)}")`, async (err, row) => {
                        if(err) throw err;
                    });
                    let json_ = {
                        "id": row[0].uniqueid,
                        "authorized": false,
                        "requestingIp": `${req.clientIp}`,
                        "reason": "This key is currently inactive / disabled."
                    };
                    res.type('json').send(JSON.stringify(json_, null, 4) + '\n');
                });
            };
            if(row[0].authorizedip == req.clientIp.toLocaleString()) {
                con.query(`SELECT * FROM owneditems WHERE licensekey='${key}' AND productid='${req.headers.productid}'`, async (err, pulleditem) => {
                    if(err) throw err;
                    if(!row[0]) return;
                    con.query(`INSERT INTO licenselogs (uniqueid, owneditemuid, ipaddress, status, datetime) VALUES ("${await utils.generateRandom(42)}", "${pulleditem[0].uniqueid}", "${req.clientIp.toLocaleString()}", "PASSED", "${await utils.fetchTime(config.timeZone.tz, config.timeZone.format)}")`, async (err, row) => {
                        if(err) throw err;
                    });
                    let json_ = {
                        "id": row[0].uniqueid,
                        "authorized": true,
                        "requestingIp": `${req.clientIp}`,
                        "reason": "success."
                    };
                    res.type('json').send(JSON.stringify(json_, null, 4) + '\n');
                });
            } else {
                con.query(`SELECT * FROM owneditems WHERE licensekey='${key}' AND productid='${req.headers.productid}'`, async (err, pulleditem) => {
                    if(err) throw err;
                    con.query(`INSERT INTO licenselogs (uniqueid, owneditemuid, ipaddress, status, datetime) VALUES ("${await utils.generateRandom(42)}", "${pulleditem[0].uniqueid}", "${req.clientIp.toLocaleString()}", "FAILED - IP UnAuth", "${await utils.fetchTime(config.timeZone.tz, config.timeZone.format)}")`, async (err, row) => {
                        if(err) throw err;
                    });
                    let json_ = {
                        "id": row[0].uniqueid,
                        "authorized": false,
                        "requestingIp": `${req.clientIp}`,
                        "reason": "The requesting IP is not authorized..."
                    };
                    res.type('json').send(JSON.stringify(json_, null, 4) + '\n');
                });
            };
        } else {
            con.query(`SELECT * FROM owneditems WHERE licensekey='${key}' AND productid='${req.headers.productid}'`, async (err, pulleditem) => {
                if(err) throw err;
                con.query(`INSERT INTO licenselogs (uniqueid, owneditemuid, ipaddress, status, datetime) VALUES ("${await utils.generateRandom(42)}", "${pulleditem[0]?.uniqueid}", "${req.clientIp.toLocaleString()}", "FAILED - Bad Key", "${await utils.fetchTime(config.timeZone.tz, config.timeZone.format)}")`, async (err, row) => {
                    if(err) throw err;
                });
            });
            let json_ = {
                "authorized": false,
                "requestingIp": `${req.clientIp}`,
                "reason": `The license key & product ID do not match to any known owned item.\nKey: ${key}, Product Id: ${req.headers.productid}`
            };
            res.type('json').send(JSON.stringify(json_, null, 4) + '\n');
        };
    });
});

app.get('/api/v1/get/products', async function(req, res) {
    if(!req.headers.authorization) return res.type('json').send(JSON.stringify({
        "authorized": false,
        "solution": "This error is most common when you provide an invalid API token in your request. Make sure to provide your authorization key in the headers of your request."
    }, null, 4) + '\n');
    req.headers.authorization = await utils.sanitize(req.headers.authorization);
    let ip = req.clientIp || 'undefined';
    con.query(`SELECT * FROM apikeys WHERE apikey="${req.headers.authorization}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.type('json').send(JSON.stringify({
            "authorized": false,
            "solution": "This error is most common when you provide an invalid API token in your request. Make sure to provide your authorization key in the headers of your request."
        }, null, 4) + '\n');
        if(row[0].uses >= row[0].maxuses) return res.type('json').send(JSON.stringify({
            "authorized": false,
            "solution": "This error occurs when you have reached the maximum number of uses for your API key."
        }, null, 4) + '\n');
        con.query(`UPDATE apikeys SET uses=uses+1, lastusedip="${ip}", lastuseddate="${await utils.getDate()}" WHERE apikey="${req.headers.authorization}"`, async (err, row) => {
            if(err) throw err;
            // ACTUAL API RESPONSE HERE
            // ACTUAL API RESPONSE HERE
            // ACTUAL API RESPONSE HERE
            con.query(`SELECT * FROM products`, async (err, row) => {
                if(err) throw err;
                return res.type('json').send(JSON.stringify({
                    "authorized": true,
                    "solution": "none",
                    "products": row || []
                }, null, 4) + '\n');
            });
        });
    });
});

app.get('/api/v1/get/account/:userid', async function(req, res) {
    if(!req.headers.authorization) return res.type('json').send(JSON.stringify({
        "authorized": false,
        "solution": "This error is most common when you provide an invalid API token in your request. Make sure to provide your authorization key in the headers of your request."
    }, null, 4) + '\n');
    req.headers.authorization = await utils.sanitize(req.headers.authorization);
    let ip = req.clientIp || 'undefined';
    con.query(`SELECT * FROM apikeys WHERE apikey="${req.headers.authorization}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.type('json').send(JSON.stringify({
            "authorized": false,
            "solution": "This error is most common when you provide an invalid API token in your request. Make sure to provide your authorization key in the headers of your request."
        }, null, 4) + '\n');
        if(row[0].uses >= row[0].maxuses) return res.type('json').send(JSON.stringify({
            "authorized": false,
            "solution": "This error occurs when you have reached the maximum number of uses for your API key."
        }, null, 4) + '\n');
        con.query(`UPDATE apikeys SET uses=uses+1, lastusedip="${ip}", lastuseddate="${await utils.getDate()}" WHERE apikey="${req.headers.authorization}"`, async (err, row) => {
            if(err) throw err;
            // ACTUAL API RESPONSE HERE
            // ACTUAL API RESPONSE HERE
            // ACTUAL API RESPONSE HERE
            req.params.userid = await utils.sanitize(req.params.userid);
            con.query(`SELECT * FROM users WHERE id="${req.params.userid}"`, async (err, row) => {
                if(err) throw err;
                return res.type('json').send(JSON.stringify({
                    "authorized": true,
                    "solution": "none",
                    "accounts": row || []
                }, null, 4) + '\n');
            });
        });
    });
});

app.get('/api/v1/get/settings', async function(req, res) {
    if(!req.headers.authorization) return res.type('json').send(JSON.stringify({
        "authorized": false,
        "solution": "This error is most common when you provide an invalid API token in your request. Make sure to provide your authorization key in the headers of your request."
    }, null, 4) + '\n');
    req.headers.authorization = await utils.sanitize(req.headers.authorization);
    let ip = req.clientIp || 'undefined';
    con.query(`SELECT * FROM apikeys WHERE apikey="${req.headers.authorization}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.type('json').send(JSON.stringify({
            "authorized": false,
            "solution": "This error is most common when you provide an invalid API token in your request. Make sure to provide your authorization key in the headers of your request."
        }, null, 4) + '\n');
        if(row[0].uses >= row[0].maxuses) return res.type('json').send(JSON.stringify({
            "authorized": false,
            "solution": "This error occurs when you have reached the maximum number of uses for your API key."
        }, null, 4) + '\n');
        con.query(`UPDATE apikeys SET uses=uses+1, lastusedip="${ip}", lastuseddate="${await utils.getDate()}" WHERE apikey="${req.headers.authorization}"`, async (err, row) => {
            if(err) throw err;
            // ACTUAL API RESPONSE HERE
            // ACTUAL API RESPONSE HERE
            // ACTUAL API RESPONSE HERE
            con.query(`SELECT * FROM sitesettings`, async (err, row) => {
                if(err) throw err;
                return res.type('json').send(JSON.stringify({
                    "authorized": true,
                    "solution": "none",
                    "sitesettings": row || []
                }, null, 4) + '\n');
            });
        });
    });
});

app.get('/api/v1/get/owneditems/:userid', async function(req, res) {
    if(!req.headers.authorization) return res.type('json').send(JSON.stringify({
        "authorized": false,
        "solution": "This error is most common when you provide an invalid API token in your request. Make sure to provide your authorization key in the headers of your request."
    }, null, 4) + '\n');
    req.headers.authorization = await utils.sanitize(req.headers.authorization);
    let ip = req.clientIp || 'undefined';
    con.query(`SELECT * FROM apikeys WHERE apikey="${req.headers.authorization}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.type('json').send(JSON.stringify({
            "authorized": false,
            "solution": "This error is most common when you provide an invalid API token in your request. Make sure to provide your authorization key in the headers of your request."
        }, null, 4) + '\n');
        if(row[0].uses >= row[0].maxuses) return res.type('json').send(JSON.stringify({
            "authorized": false,
            "solution": "This error occurs when you have reached the maximum number of uses for your API key."
        }, null, 4) + '\n');
        con.query(`UPDATE apikeys SET uses=uses+1, lastusedip="${ip}", lastuseddate="${await utils.getDate()}" WHERE apikey="${req.headers.authorization}"`, async (err, row) => {
            if(err) throw err;
            // ACTUAL API RESPONSE HERE
            // ACTUAL API RESPONSE HERE
            // ACTUAL API RESPONSE HERE
            con.query(`SELECT * FROM owneditems WHERE userid="${req.params.userid}"`, async (err, row) => {
                if(err) throw err;
                return res.type('json').send(JSON.stringify({
                    "authorized": true,
                    "solution": "none",
                    "owneditems": row || []
                }, null, 4) + '\n');
            });
        });
    });
});

// API V1 ENDPOINTS END HERE
app.get('/logout', async function(req, res) {
    con.query(`SELECT * FROM bannedusers WHERE userid="${req?.session?.passport?.user?.id}"`, async (err, row) => {
        if(err) throw err;
        if(row[0]) return res.redirect('/banned');
        req.logout(function(err) {
            if(err) { return next(err); }
            res.redirect('/');
        });
    });
});

app.get(`/page/:pagelink`, async (req, res) => {
    await backend.resetAppLocals(app);
    req.params.pagelink = await utils.sanitize(req.params.pagelink);
    con.query(`SELECT * FROM custompages WHERE link="${req.params.pagelink}"`, async (err, row) => {
        if(err) throw err;
        if(!row[0]) return res.redirect('/404');
        let page = row[0];
        let converted = await utils.mdConvert(page.content);
        if(req.isAuthenticated()) {
            con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let isStaff = false;
                if(row[0]) isStaff = true;
                con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let myuser = row[0];
                    con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                        if(err) throw err;
                        myuser.notifications = mynotis || [];
                        res.render('custompage.ejs', { page: page, converted: converted, user: myuser, loggedIn: true, isStaff: isStaff });
                    });
                });
            });
        } else {
            res.render('custompage.ejs', { page: page, converted: converted, user: false, loggedIn: false, isStaff: false });
        };
    });
});

app.get(`/blogs`, async (req, res) => {
    await backend.resetAppLocals(app);
    con.query(`SELECT * FROM blogs`, async (err, blogs) => {
        if(err) throw err;
        if(req.isAuthenticated()) {
            con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
                if(err) throw err;
                let isStaff = false;
                if(row[0]) isStaff = true;
                con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let myuser = row[0];
                    con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                        if(err) throw err;
                        myuser.notifications = mynotis || [];
                        res.render('blogs.ejs', { blogs: blogs, user: myuser, loggedIn: true, isStaff: isStaff });
                    });
                });
            });
        } else {
            res.render('blogs.ejs', { blogs: blogs, user: false, loggedIn: false, isStaff: false });
        };
    });
});

app.get('/blog', function(req, res) { return res.redirect('/blogs') });

app.get(`/blog/:bloglink`, async (req, res) => {
    await backend.resetAppLocals(app);
    req.params.bloglink = await utils.sanitize(req.params.bloglink);
    con.query(`SELECT * FROM blogs ORDER BY RAND() LIMIT 8;`, function(err, randBlogs) {
        if(err) throw err;
        con.query(`SELECT * FROM blogs WHERE link="${req.params.bloglink}"`, async (err, row) => {
            if(err) throw err;
            if(!row[0]) return res.redirect('/404');
            let blog = row[0];
            blog.views = blog.views + 1;
            con.query(`UPDATE blogs SET views=${blog.views} WHERE uniqueid="${blog.uniqueid}"`, function (err, row) { if(err) throw err; });
            let converted = await utils.mdConvert(blog.content);
            if(req.isAuthenticated()) {
                con.query(`SELECT * FROM staff WHERE userid="${req.user.id}"`, async (err, row) => {
                    if(err) throw err;
                    let isStaff = false;
                    if(row[0]) isStaff = true;
                    con.query(`SELECT * FROM users WHERE id="${req.user.id}"`, async (err, row) => {
                        if(err) throw err;
                        let myuser = row[0];
                        con.query(`SELECT * FROM notifications WHERE userid="${req.user.id}"`, async (err, mynotis) => {
                            if(err) throw err;
                            myuser.notifications = mynotis || [];
                            res.render('blogpage.ejs', { blog: blog, randBlogs: randBlogs, converted: converted, user: myuser, loggedIn: true, isStaff: isStaff });
                        });
                    });
                });
            } else {
                res.render('blogpage.ejs', { blog: blog, randBlogs: randBlogs, converted: converted, user: false, loggedIn: false, isStaff: false });
            };
        });
    });
});

con.query(`DELETE FROM pendingpurchases`, async (err, row) => {
    if(err) throw err;
});

// Searched the redirects for the page
config.redirects.forEach(element => {
    app.get(`/${element.name}`, (req, res) => {
        res.redirect(element.link);
    });
});

// MAKE SURE THIS IS LAST FOR 404 PAGE REDIRECT
app.get('*', function(req, res){
    res.render('404.ejs', { user: false, loggedIn: false });
});

// Server Initialization
app.listen(config.port)