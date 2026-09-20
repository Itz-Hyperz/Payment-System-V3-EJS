# Payment-System-V3-EJS

Refer to [the Knowledgebase](https://github.com/Itz-Hyperz/Knowledgebase) for EJS Website Install Instructions.

---

# Payment System V3

### The store that actually sells.
##### Built by [Boss Software Systems](https://boss.software) · Crafted by Hyperz

---

> V1 took payments.  
> V2 looked like a store.  
> **V3 is the whole business.**

Self-hosted. Yours. No platform tax on every sale.  
Express + EJS + MySQL — Stripe, PayPal, and Tebex in one checkout.  
Digital downloads. Subscriptions. Boxes that ship. Gift cards. License keys. Discord login.  
Staff permissions that don’t hand everyone the keys to the kingdom.

This is the private V3 stack that runs [boss.software](https://boss.software).  
The one the repo calls *crazy hard compared to the V2 model*.

---

## Why V3 feels different

| Then | Now |
| :--- | :--- |
| A checkout form taped to a landing page | A full storefront with cart, receipts, and owned items |
| One product type | Download · Subscribe · Ship |
| Hope the zip arrives | License keys, authorized IPs, download counts, license logs |
| Everyone is admin | Granular staff roles — products, orders, SEO, bans, ads |
| “We’ll invoice you later” | Quotes, invoices, and gift cards in the same panel |

---

## Sell anything. From one panel.

### Three ways to take money
- **Standard** — instant file delivery after payment
- **Subscription** — recurring invoices, next-due dates, owned-item link
- **Manually filled** — clothes, merch, hardware — address, city, state, zip, country, tracking, received / shipped / delivered

### Three ways they pay
- **Stripe**
- **PayPal Checkout**
- **Tebex** packages for game-server shops

Flip the rails in `config.json`. Set currency and symbol. Keep the catalog.

### Merchandising that looks expensive
Featured products. Crossed-out prices. Stock quantity. Store tags and categories.  
Galleries. Demo links. Linked items. Hidden and paused products.  
Gift cards customers can buy and gift. Discount codes with percent off, roles, and expiration.

---

## The customer’s world

A cart that remembers.  
An account with purchases, receipts, mailing-list preferences, and notifications.  
Email that looks like you — logo, site name, subject, a link to change communication prefs.  
Login with email **or** Discord OAuth when the community *is* the store.

They don’t bounce to a third-party storefront that forgets your brand.  
They stay on **your** domain.

---

## The operator’s world

Income totals. Monthly statistics — customers, visits, new users, sales, income.  
Audit logs. Staff matrix so the intern can manage reviews without deleting products.

**Staff can be granted (or denied):**

- Site settings & styling
- Products, categories, tags
- Subscriptions, invoices, quotes
- Gift cards, discounts, orders
- Blogs, contact forms, SEO
- Reviews, users, owned items, bans
- Team, partners, docs, custom pages
- Client companies, API keys, ads
- Stats and audit logs

Tickets with comments.  
Applications with custom questions.  
Docs categories and articles — even gated by Discord role.  
Custom pages. Partner logos. Team bios. FAQ. Changelogs per product.  
Tawk.to. Maintenance mode. Demo banner. Firewall toggle. Ban list.

---

## Built for shops that live in Discord *and* on the web

- Discord OAuth + bot token
- Role grants after purchase (`givenrole` on the product)
- Logging channel and support-logs channel
- Redirects to your Discord
- Optional Hyperz ban import if you already live in that ecosystem
- FiveM username on pending purchases when the catalog is a server store

Game communities. Resource shops. Agencies that quote custom work and then deliver a zip.  
If you sell files, access, or objects — V3 was drawn around that loop.

---

## The stack you actually own

```
Node.js  ·  Express  ·  EJS  ·  MySQL
Passport  ·  bcrypt  ·  Stripe  ·  PayPal
Discord.js  ·  Nodemailer  ·  Multer  ·  Sessions
```

- Theme file + site color + navbar alignment
- Extensions folder when you need a bolt-on
- API keys with permissions, use caps, last-used IP
- SEO schema per page
- License: source on GitHub (GPL-3.0)
- Package name in the wild: `bosswebstore`

You host it. You keep the database. You keep the receipts.

---

## Who this is for

**You**, if any of these sting:

- A hosted storefront takes a cut and still looks generic
- Digital goods and physical merch live in two different tools
- “Can you send an invoice?” means opening another app
- Staff need access without owning the whole machine
- Your customers already live in Discord and you refuse to make them create a third account

Not a bank. Not a card network.  
A **store operating system** — take the money, deliver the file, ship the box, keep the books where you can see them.

---

## The line

**Stop renting a checkout.**  
**Own the store.**

---

### Payment System V3-EJS

**Boss Software Systems** · Northern Michigan  
Petoskey · Harbor Springs · Charlevoix · and anywhere the site will load

**Source**  
[github.com/Itz-Hyperz/Payment-System-V3-EJS](https://github.com/Itz-Hyperz/Payment-System-V3-EJS)

**Studio**  
[boss.software](https://boss.software)  
howdy@boss.software  
(231) 622-5485

---

*V1 but on steroids.*  
*V2 but it actually ships.*  
*V3 — the private build that goes crazy hard.*

