const chalk = require('chalk');
const config = require('../config.json');
const fs = require('node:fs');
module.exports = async function(con) {

    // SQL Structure
    let data = [
        {
            tablename: "sitesettings",
            columns: [
                {
                    name: "sitename",
                    type: "TEXT",
                },
                {
                    name: "sitedesc",
                    type: "TEXT",
                },
                {
                    name: "sitecolor",
                    type: "TEXT",
                },
                {
                    name: "notification",
                    type: "TEXT",
                },
                {
                    name: "homeabout",
                    type: "TEXT",
                },
                {
                    name: "termsofservice",
                    type: "TEXT",
                },
                {
                    name: "privacypolicy",
                    type: "TEXT",
                },
                {
                    name: "cookiepolicy",
                    type: "TEXT",
                },
                {
                    name: "guildid",
                    type: "TEXT",
                },
                {
                    name: "themefile",
                    type: "TEXT"
                },
                {
                    name: "globalcustomer",
                    type: "TEXT",
                },
                {
                    name: "totalincome",
                    type: "TEXT",
                },
                {
                    name: "loggingchannelid",
                    type: "TEXT"
                },
                {
                    name: "supportlogschannelid",
                    type: "TEXT"
                },
                {
                    name: "firewallgg",
                    type: "BOOLEAN"
                },
                {
                    name: "maintenance",
                    type: "BOOLEAN"
                },
                {
                    name: "demotext",
                    type: "TEXT"
                },
                {
                    name: "tawkto",
                    type: "TEXT"
                },
                {
                    name: "email",
                    type: "TEXT"
                },
                {
                    name: "twitter",
                    type: "TEXT"
                },
                {
                    name: "discord",
                    type: "TEXT"
                },
                {
                    name: "youtube",
                    type: "TEXT"
                },
                {
                    name: "instagram",
                    type: "TEXT"
                },
                {
                    name: "facebook",
                    type: "TEXT"
                },
                {
                    name: "tiktok",
                    type: "TEXT"
                },
                {
                    name: "emailconfirmation",
                    type: "boolean"
                },
                {
                    name: "phonenumber",
                    type: "TEXT"
                },
                {
                    name: "linkedin",
                    type: "TEXT"
                }
            ]
        },
        {
            tablename: "navbar",
            columns: [
                {
                    name: "name",
                    type: "text"
                },
                {
                    name: "link",
                    type: "text"
                },
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "pos",
                    type: "INT"
                },
                {
                    name: "parentid",
                    type: "TEXT"
                }
            ]
        },
        {
            tablename: "contactforms",
            columns: [
                {
                    name: "name",
                    type: "TEXT"
                },
                {
                    name: "email",
                    type: "TEXT"
                },
                {
                    name: "uniqueid",
                    type: "TEXT"
                },
                {
                    name: "request",
                    type: "TEXT"
                },
                {
                    name: "datetime",
                    type: "TEXT"
                }
            ]
        },
        {
            tablename: "whycompanies",
            columns: [
                {
                    name: "icon",
                    type: "TEXT"
                },
                {
                    name: "iconcolor",
                    type: "TEXT"
                },
                {
                    name: "uniqueid",
                    type: "TEXT"
                },
                {
                    name: "title",
                    type: "TEXT"
                },
                {
                    name: "content",
                    type: "TEXT"
                }
            ]
        },
        {
            tablename: "applications",
            columns: [
                {
                    name: "name",
                    type: "text"
                },
                {
                    name: "closed",
                    type: "boolean"
                },
                {
                    name: "id",
                    type: "text"
                }
            ]
        },
        {
            tablename: "appquestions",
            columns: [
                {
                    name: "appid",
                    type: "text"
                },
                {
                    name: "content",
                    type: "text"
                },
                {
                    name: "type",
                    type: "INT"
                },
                {
                    name: "dropdownitems",
                    type: "text"
                },
                {
                    name: "id",
                    type: "text"
                }
            ]
        },
        {
            tablename: "appresponses",
            columns: [
                {
                    name: "appid",
                    type: "text"
                },
                {
                    name: "user",
                    type: "text"
                },
                {
                    name: "responses",
                    type: "text"
                },
                {
                    name: "status",
                    type: "text"
                },
                {
                    name: "id",
                    type: "text"
                }
            ]
        },
        {
            tablename: "usingcompanies",
            columns: [
                {
                    name: "name",
                    type: "text"
                },
                {
                    name: "link",
                    type: "text"
                },
                {
                    name: "uniqueid",
                    type: "text"
                }
            ]
        },
        {
            tablename: "categories",
            columns: [
                {
                    name: "name",
                    type: "text"
                },
                {
                    name: "id",
                    type: "text"
                }
            ]
        },
        {
            tablename: "tickets",
            columns: [
                {
                    name: "id",
                    type: "text"
                },
                {
                    name: "username",
                    type: "text"
                },
                {
                    name: "category",
                    type: "text"
                },
                {
                    name: "title",
                    type: "text"
                },
                {
                    name: "content",
                    type: "text"
                },
                {
                    name: "datecreated",
                    type: "text"
                },
                {
                    name: "answerid",
                    type: "text"
                },
                {
                    name: "userid",
                    type: "text"
                }
            ]
        },
        {
            tablename: "comments",
            columns: [
                {
                    name: "ticketid",
                    type: "text"
                },
                {
                    name: "userid",
                    type: "text"
                },
                {
                    name: "username",
                    type: "text"
                },
                {
                    name: "content",
                    type: "text"
                },
                {
                    name: "datecreated",
                    type: "text"
                },
                {
                    name: "id",
                    type: "text"
                }
            ]
        },
        {
            tablename: "statistics",
            columns: [
                {
                    name: "type",
                    type: "text"
                },
                {
                    name: "jan",
                    type: "INT"
                },
                {
                    name: "feb",
                    type: "INT"
                },
                {
                    name: "mar",
                    type: "INT"
                },
                {
                    name: "apr",
                    type: "INT"
                },
                {
                    name: "may",
                    type: "INT"
                },
                {
                    name: "jun",
                    type: "INT"
                },
                {
                    name: "jul",
                    type: "INT"
                },
                {
                    name: "aug",
                    type: "INT"
                },
                {
                    name: "sep",
                    type: "INT"
                },
                {
                    name: "oct",
                    type: "INT"
                },
                {
                    name: "nov",
                    type: "INT"
                },
                {
                    name: "dece",
                    type: "INT"
                }
            ]
        },
        {
            tablename: "quotes",
            columns: [
                {
                    name: "name",
                    type: "text"
                },
                {
                    name: "description",
                    type: "text"
                },
                {
                    name: "userid",
                    type: "text"
                },
                {
                    name: "datetime",
                    type: "text"
                },
                {
                    name: "uniqueid",
                    type: "text"
                }
            ]
        },
        {
            tablename: "quoteitems",
            columns: [
                {
                    name: "name",
                    type: "text"
                },
                {
                    name: "description",
                    type: "text"
                },
                {
                    name: "price",
                    type: "text"
                },
                {
                    name: "quoteid",
                    type: "text"
                },
                {
                    name: "uniqueid",
                    type: "text"
                }
            ]
        },
        {
            tablename: "subscriptions",
            columns: [
                {
                    name: "userid",
                    type: "text"
                },
                {
                    name: "productid",
                    type: "text"
                },
                {
                    name: "owneditemid",
                    type: "text"
                },
                {
                    name: "invoiceid",
                    type: "text"
                },
                {
                    name: "price",
                    type: "text"
                },
                {
                    name: "nextduedate",
                    type: "text"
                },
                {
                    name: "uniqueid",
                    type: "text"
                }
            ]
        },
        {
            tablename: "sitestyles",
            columns: [
                {
                    name: "navbarlogo",
                    type: "INT"
                },
                {
                    name: "whycompanyenabled",
                    type: "INT"
                },
                {
                    name: "whycompanytitle",
                    type: "TEXT"
                },
                {
                    name: "whycompanysubtitle",
                    type: "TEXT"
                },
                {
                    name: "ourdiscordbtntext",
                    type: "TEXT"
                },
                {
                    name: "ourdiscordbtnlink",
                    type: "TEXT"
                },
                {
                    name: "statsproducts",
                    type: "INT"
                },
                {
                    name: "statsclients",
                    type: "INT"
                },
                {
                    name: "statspurchases",
                    type: "INT"
                },
                {
                    name: "statsusers",
                    type: "INT"
                },
                {
                    name: "statsreviews",
                    type: "INT"
                },
                {
                    name: "statspartners",
                    type: "INT"
                },
                {
                    name: "statsstaff",
                    type: "INT"
                },
                {
                    name: "currentprodsbtn",
                    type: "INT"
                },
                {
                    name: "visitstorebtn",
                    type: "INT"
                },
                {
                    name: "ourdiscordbtn",
                    type: "INT"
                },
                {
                    name: "recentpurchases",
                    type: "INT"
                },
                {
                    name: "shopsorting",
                    type: "INT"
                },
                {
                    name: "navbaralignment",
                    type: "INT"
                },
                {
                    name: "bgshoptoggle",
                    type: "INT"
                },
                {
                    name: "footnavigation",
                    type: "INT"
                },
                {
                    name: "footusefullinks",
                    type: "INT"
                },
                {
                    name: "footourpartners",
                    type: "INT"
                },
                {
                    name: "footlegal",
                    type: "INT"
                },
                {
                    name: "teampage",
                    type: "INT"
                },
                {
                    name: "partnerspage",
                    type: "INT"
                },
                {
                    name: "reviewspage",
                    type: "INT"
                },
                {
                    name: "productgallery",
                    type: "INT"
                },
                {
                    name: "productreviews",
                    type: "INT"
                },
                {
                    name: "productcredits",
                    type: "INT"
                },
                {
                    name: "giftcards",
                    type: "INT"
                },
                {
                    name: "clientcompaniesgreyscale",
                    type: "INT"
                },
                {
                    name: "homepagereviewsshowcase",
                    type: "INT"
                },
                {
                    name: "homepagefaqshowcase",
                    type: "INT"
                }
            ]
        },
        {
            tablename: "faq",
            columns: [
                {
                    name: "question",
                    type: "text"
                },
                {
                    name: "answer",
                    type: "text"
                },
                {
                    name: "uniqueid",
                    type: "text"
                },
            ]
        },
        {
            tablename: "seoschema",
            columns: [
                {
                    name: "content",
                    type: "text"
                },
                {
                    name: "link",
                    type: "text"
                },
                {
                    name: "uniqueid",
                    type: "text"
                },
            ]
        },
        {
            tablename: "blogs",
            columns: [
                {
                    name: "title",
                    type: "text"
                },
                {
                    name: "content",
                    type: "text"
                },
                {
                    name: "datetime",
                    type: "text"
                },
                {
                    name: "link",
                    type: "text"
                },
                {
                    name: "views",
                    type: "INT"
                },
                {
                    name: "uniqueid",
                    type: "text"
                }
            ]
        },
        {
            tablename: "changelogs",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "title",
                    type: "text"
                },
                {
                    name: "vers",
                    type: "text"
                },
                {
                    name: "content",
                    type: "text"
                },
                {
                    name: "datetime",
                    type: "text"
                },
                {
                    name: "productid",
                    type: "TEXT"
                }
            ]
        },
        {
            tablename: "users",
            columns: [
                {
                    name: "id",
                    type: "text"
                },
                {
                    name: "email",
                    type: "text"
                },
                {
                    name: "password",
                    type: "text"
                },
                {
                    name: "username",
                    type: "text"
                },
                {
                    name: "latestip",
                    type: "text"
                },
                {
                    name: "cart",
                    type: "text"
                },
                {
                    name: "discount",
                    type: "INT"
                },
                {
                    name: "giftcard",
                    type: "TEXT"
                },
                {
                    name: "note",
                    type: "text"
                },
                {
                    name: "client",
                    type: "boolean"
                },
                {
                    name: "mailinglist",
                    type: "boolean"
                },
                {
                    name: "mailendpoints",
                    type: "TEXT"
                },
                {
                    name: "temporary",
                    type: "boolean"
                }
            ]
        },
        {
            tablename: "products",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "tebexpackageid",
                    type: "text"
                },
                {
                    name: "name",
                    type: "text"
                },
                {
                    name: "link",
                    type: "text"
                },
                {
                    name: "description",
                    type: "text"
                },
                {
                    name: "credits",
                    type: "text"
                },
                {
                    name: "price",
                    type: "text"
                },
                {
                    name: "pricecrossout",
                    type: "text"
                },
                {
                    name: "prodtype",
                    type: "INT"
                },
                {
                    name: "gallery",
                    type: "text"
                },
                {
                    name: "pos",
                    type: "INT"
                },
                {
                    name: "zipfilename",
                    type: "text"
                },
                {
                    name: "givenrole",
                    type: "TEXT",
                },
                {
                    name: "hidden",
                    type: "boolean"
                },
                {
                    name: "paused",
                    type: "boolean"
                },
                {
                    name: "overallprofit",
                    type: "TEXT"
                },
                {
                    name: "overallviews",
                    type: "INT"
                },
                {
                    name: "demolink",
                    type: "TEXT"
                },
                {
                    name: "linkeditems",
                    type: "TEXT"
                },
                {
                    name: "featured",
                    type: "BOOLEAN"
                },
                {
                    name: "quantity",
                    type: "INT"
                },
                {
                    name: "storetags",
                    type: "TEXT"
                },
                {
                    name: "extension",
                    type: "TEXT"
                }
            ]
        },
        {
            tablename: "owneditems",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "productid",
                    type: "text"
                },
                {
                    name: "userid",
                    type: "text"
                },
                {
                    name: "productname",
                    type: "text"
                },
                {
                    name: "datebought",
                    type: "text"
                },
                {
                    name: "price",
                    type: "text"
                },
                {
                    name: "receipt",
                    type: "text"
                },
                {
                    name: "licensekey",
                    type: "text"
                },
                {
                    name: "authorizedip",
                    type: "text"
                },
                {
                    name: "disabled",
                    type: "boolean"
                },
                {
                    name: "tebex",
                    type: "boolean"
                },
                {
                    name: "admindisabled",
                    type: "boolean"
                },
                {
                    name: "downloads",
                    type: "INT"
                },
                {
                    name: "prodtype",
                    type: "INT"
                },
                {
                    name: "trackinginfo",
                    type: "TEXT"
                },
                {
                    name: "status",
                    type: "INT"
                },
                {
                    name: "address",
                    type: "TEXT"
                },
                {
                    name: "city",
                    type: "TEXT"
                },
                {
                    name: "state",
                    type: "TEXT"
                },
                {
                    name: "zipcode",
                    type: "TEXT"
                },
                {
                    name: "country",
                    type: "TEXT"
                },
                {
                    name: "firstlastname",
                    type: "TEXT"
                },
                {
                    name: "shippingemail",
                    type: "TEXT"
                }
            ]
        },
        {
            tablename: "owneduploads",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "name",
                    type: "text"
                },
                {
                    name: "price",
                    type: "text"
                },
                {
                    name: "filename",
                    type: "text"
                },
                {
                    name: "userid",
                    type: "text"
                },
                {
                    name: "datetime",
                    type: "text"
                },
                {
                    name: "downloads",
                    type: "INT"
                }
            ]
        },
        {
            tablename: "giftcards",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "name",
                    type: "text"
                },
                {
                    name: "amount",
                    type: "text"
                },
                {
                    name: "pos",
                    type: "INT"
                }
            ]
        },
        {
            tablename: "ownedgiftcards",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "giftcardid",
                    type: "text"
                },
                {
                    name: "code",
                    type: "text"
                },
                {
                    name: "amount",
                    type: "text"
                },
                {
                    name: "purchaserid",
                    type: "text"
                }
            ]
        },
        {
            tablename: "storecategories",
            columns: [
                {
                    name: "name",
                    type: "text"
                },
                {
                    name: "link",
                    type: "text"
                },
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "pos",
                    type: "INT"
                },
                {
                    name: "hidden",
                    type: "boolean"
                },
                {
                    name: "description",
                    type: "text"
                },
                {
                    name: "items",
                    type: "text"
                }
            ]
        },
        {
            tablename: "storetags",
            columns: [
                {
                    name: "name",
                    type: "text"
                },
                {
                    name: "uniqueid",
                    type: "text"
                },
            ]
        },
        {
            tablename: "licenselogs",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "owneditemuid",
                    type: "text"
                },
                {
                    name: "ipaddress",
                    type: "text"
                },
                {
                    name: "status",
                    type: "text"
                },
                {
                    name: "datetime",
                    type: "text"
                }
            ]
        },
        {
            tablename: "team",
            columns: [
                {
                    name: "uniqueid",
                    type: "TEXT"
                },
                {
                    name: "name",
                    type: "TEXT"
                },
                {
                    name: "pos",
                    type: "INT"
                },
                {
                    name: "title",
                    type: "TEXT"
                },
                {
                    name: "content",
                    type: "TEXT"
                }
            ]
        },
        {
            tablename: "partners",
            columns: [
                {
                    name: "uniqueid",
                    type: "TEXT"
                },
                {
                    name: "pos",
                    type: "INT"
                },
                {
                    name: "title",
                    type: "TEXT"
                },
                {
                    name: "content",
                    type: "TEXT"
                },
                {
                    name: "link",
                    type: "TEXT"
                }
            ]
        },
        {
            tablename: "galleryimages",
            columns: [
                {
                    name: "uniqueid",
                    type: "TEXT"
                },
                {
                    name: "imagename",
                    type: "TEXT"
                }
            ]
        },
        {
            tablename: "discounts",
            columns: [
                {
                    name: "code",
                    type: "text"
                },
                {
                    name: "percent",
                    type: "INT"
                },
                {
                    name: "roleids",
                    type: "TEXT"
                },
                {
                    name: "expiration",
                    type: "TEXT"
                },
                {
                    name: "uniqueid",
                    type: "text"
                }
            ]
        },
        {
            tablename: "pendingpurchases",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "userid",
                    type: "text"
                },
                {
                    name: "sessionid",
                    type: "text"
                },
                {
                    name: "paymenttype",
                    type: "text"
                },
                {
                    name: "leftover",
                    type: "text"
                },
                {
                    name: "fivemusername",
                    type: "TEXT"
                },
                {
                    name: "address",
                    type: "TEXT"
                },
                {
                    name: "city",
                    type: "TEXT"
                },
                {
                    name: "state",
                    type: "TEXT"
                },
                {
                    name: "zipcode",
                    type: "TEXT"
                },
                {
                    name: "country",
                    type: "TEXT"
                },
                {
                    name: "firstlastname",
                    type: "TEXT"
                },
                {
                    name: "shippingemail",
                    type: "TEXT"
                }
            ]
        },
        {
            tablename: "receipts",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "buyerid",
                    type: "text"
                },
                {
                    name: "items",
                    type: "text"
                },
                {
                    name: "payment",
                    type: "text"
                },
                {
                    name: "datetime",
                    type: "text"
                }
            ]
        },
        {
            tablename: "reviews",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "userid",
                    type: "text"
                },
                {
                    name: "username",
                    type: "text"
                },
                {
                    name: "rating",
                    type: "INT"
                },
                {
                    name: "itemname",
                    type: "text"
                },
                {
                    name: "itemuniqueid",
                    type: "text"
                },
                {
                    name: "content",
                    type: "text"
                }
            ]
        },
        {
            tablename: "custompages",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "title",
                    type: "text"
                },
                {
                    name: "link",
                    type: "varchar(255)"
                },
                {
                    name: "content",
                    type: "text"
                }
            ]
        },
        {
            tablename: "advertisements",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "name",
                    type: "text"
                },
                {
                    name: "link",
                    type: "text"
                },
                {
                    name: "filetype",
                    type: "text"
                }
            ]
        },
        {
            tablename: "invoices",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "userid",
                    type: "text"
                },
                {
                    name: "paid",
                    type: "boolean"
                },
                {
                    name: "title",
                    type: "text"
                },
                {
                    name: "description",
                    type: "text"
                },
                {
                    name: "datetime",
                    type: "text"
                },
                {
                    name: "price",
                    type: "text"
                }
            ]
        },
        {
            tablename: "auditlogs",
            columns: [
                {
                    name: "datetime",
                    type: "text"
                },
                {
                    name: "title",
                    type: "text"
                },
                {
                    name: "description",
                    type: "text"
                },
                {
                    name: "uniqueid",
                    type: "text"
                }
            ]
        },
        {
            tablename: "notifications",
            columns: [
                {
                    name: "uniqueid",
                    type: "text"
                },
                {
                    name: "userid",
                    type: "text"
                },
                {
                    name: "content",
                    type: "text"
                },
                {
                    name: "datetime",
                    type: "text"
                },
                {
                    name: "hasbeenread",
                    type: "boolean"
                }
            ]
        },
        {
            tablename: "apikeys",
            columns: [
                {
                    name: "apikey",
                    type: "text"
                },
                {
                    name: "limited",
                    type: "boolean"
                },
                {
                    name: "maxuses",
                    type: "INT"
                },
                {
                    name: "uses",
                    type: "INT"
                },
                {
                    name: "lastusedip",
                    type: "text"
                },
                {
                    name: "lastuseddate",
                    type: "text"
                },
                {
                    name: "userid",
                    type: "text"
                },
                {
                    name: "permissions",
                    type: "TEXT"
                }
            ]
        },
        {
            tablename: "bannedusers",
            columns: [
                {
                    name: "userid",
                    type: "text"
                }
            ]
        },
        {
            tablename: "staff",
            columns: [
                {
                    name: "userid",
                    type: "text"
                },
                {
                    name: "altersitesettings",
                    type: "BOOLEAN"
                },
                {
                    name: "altersitestyling",
                    type: "BOOLEAN"
                },
                {
                    name: "createeditproducts",
                    type: "BOOLEAN"
                },
                {
                    name: "deleteproducts",
                    type: "BOOLEAN"
                },
                {
                    name: "managesubs",
                    type: "BOOLEAN"
                },
                {
                    name: "manageinvoices",
                    type: "BOOLEAN"
                },
                {
                    name: "managequotes",
                    type: "BOOLEAN"
                },
                {
                    name: "managestorecats",
                    type: "BOOLEAN"
                },
                {
                    name: "managestoretags",
                    type: "BOOLEAN"
                },
                {
                    name: "managegiftcards",
                    type: "BOOLEAN"
                },
                {
                    name: "manageorders",
                    type: "BOOLEAN"
                },
                {
                    name: "manageblogs",
                    type: "BOOLEAN"
                },
                {
                    name: "managecontactsubmissions",
                    type: "BOOLEAN"
                },
                {
                    name: "manageseo",
                    type: "BOOLEAN"
                },
                {
                    name: "managediscounts",
                    type: "BOOLEAN"
                },
                {
                    name: "managereviews",
                    type: "BOOLEAN"
                },
                {
                    name: "manageusers",
                    type: "BOOLEAN"
                },
                {
                    name: "manageowneditems",
                    type: "BOOLEAN"
                },
                {
                    name: "managebans",
                    type: "BOOLEAN"
                },
                {
                    name: "manageteam",
                    type: "BOOLEAN"
                },
                {
                    name: "managepartners",
                    type: "BOOLEAN"
                },
                {
                    name: "managedocs",
                    type: "BOOLEAN"
                },
                {
                    name: "managecustompages",
                    type: "BOOLEAN"
                },
                {
                    name: "manageclientcompanies",
                    type: "BOOLEAN"
                },
                {
                    name: "manageapikeys",
                    type: "BOOLEAN"
                },
                {
                    name: "manageads",
                    type: "BOOLEAN"
                },
                {
                    name: "viewstats",
                    type: "BOOLEAN"
                },
                {
                    name: "viewauditlogs",
                    type: "BOOLEAN"
                }
            ]
        },
    ];

    // Looping and checking if the tables are complete
    await data.forEach(async function(d) {
        let query = `CREATE TABLE ${d.tablename} (`;
        await d.columns.forEach(async function(pass) {
            if(query.endsWith('(')) {
                query = query + ` ${pass.name} ${pass.type}`;
            } else {
                query = query + `, ${pass.name} ${pass.type}`;
            };
        });
        await con.query(`SELECT * FROM ${d.tablename}`, async function(err, row) {
            if(err) {
                console.log(`${chalk.redBright('[Update Manager]')} ${d.tablename} table not found, creating...`);
                await con.query(`${query} );`, async function(err, row) {
                    if(err) throw err;
                });
            } else {
                await con.query(`SHOW COLUMNS FROM ${d.tablename}`, async function(err, row2) {
                    if(err) throw err;
                    let tbl = [];
                    await row2.forEach(async function(arow) {
                        await tbl.push(arow.Field.toLowerCase());
                    });
                    await d.columns.forEach(async function(pass) {
                        if(!tbl.includes(pass.name.toLowerCase())) {
                            console.log(`${chalk.redBright('[Update Manager]')} ${pass.name} column not found in ${d.tablename} table, creating...`);
                            await con.query(`ALTER TABLE ${d.tablename} ADD ${pass.name} ${pass.type}`, async function(err, row) {
                                if(err) throw err;
                            });
                        };
                    });
                });
            };
        });
    });

    // Extra queries needed to fix new data types
    setTimeout(async function() {
        await con.query(`UPDATE users SET giftcard='none' WHERE giftcard IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`SELECT * FROM statistics`, function(err, row) {
            if(err) throw err;
            if(row[0]) return;
            con.query(`INSERT INTO statistics (type, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dece) VALUES ('customers', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);`, function(err, row) { if(err) throw err; });
            con.query(`INSERT INTO statistics (type, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dece) VALUES ('autojoin', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);`, function(err, row) { if(err) throw err; });
            con.query(`INSERT INTO statistics (type, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dece) VALUES ('homepagevisits', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);`, function(err, row) { if(err) throw err; });
            con.query(`INSERT INTO statistics (type, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dece) VALUES ('newusers', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);`, function(err, row) { if(err) throw err; });
            con.query(`INSERT INTO statistics (type, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dece) VALUES ('sales', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);`, function(err, row) { if(err) throw err; });
            con.query(`INSERT INTO statistics (type, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dece) VALUES ('income', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);`, function(err, row) { if(err) throw err; });
        });
        await con.query(`UPDATE sitestyles SET currentprodsbtn=1, visitstorebtn=1, ourdiscordbtn=1, recentpurchases=1, shopsorting=1, navbaralignment=1, bgshoptoggle=1, footnavigation=1, footusefullinks=1, footourpartners=1, footlegal=1 WHERE currentprodsbtn IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE sitestyles SET navbarlogo=0 WHERE navbarlogo IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE sitesettings SET tawkto="none" WHERE tawkto IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE products SET quantity=-1 WHERE quantity IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE discounts SET expiration="never" WHERE expiration IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE products SET extension="none" WHERE extension IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`DELETE FROM staff WHERE altersitesettings IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE products SET tebexpackageid="none" WHERE tebexpackageid IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE owneditems SET tebex=false WHERE tebex IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE sitesettings SET supportlogschannelid="none" WHERE supportlogschannelid IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        // Big Boss Update!
        await con.query(`UPDATE sitesettings SET emailconfirmation=false, phonenumber="none" WHERE emailconfirmation IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE navbar SET parentid="none", pos=1 WHERE parentid IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE sitestyles SET clientcompaniesgreyscale=0, homepagereviewsshowcase=0, homepagefaqshowcase=0 WHERE clientcompaniesgreyscale IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE users SET temporary=false WHERE temporary IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`SELECT * FROM products WHERE subscription=true`, async (err, row) => {
            if(err) throw err;
            if(row[0]) {
                await con.query(`UPDATE products SET prodtype=2 WHERE subscription=true`, async (err, row) => {
                    if(err) throw err;
                });
                await con.query(`SELECT * FROM subscriptions`, async (err, row) => {
                    if(err) throw err;
                    for(let subscription of row) {
                        await con.query(`UPDATE owneditems SET prodtype=2 WHERE uniqueid="${subscription.owneditemid}"`, async (err, row) => {
                            if(err) throw err;
                        });
                    };
                });
                await con.query(`ALTER TABLE products DROP COLUMN subscription`, async (err, row) => {
                    if(err) throw err;
                });
            } else {
                await con.query(`UPDATE products SET prodtype=1 WHERE prodtype IS NULL`, async (err, row) => {
                    if(err) throw err;
                });
                await con.query(`UPDATE owneditems SET prodtype=1 WHERE prodtype IS NULL`, async (err, row) => {
                    if(err) throw err;
                });
            };
        });
        await con.query(`SELECT * FROM products WHERE prodtype=2`, async (err, row) => {
            if(err) throw err;
            for(let item of row) {
                if(item.prodtype == 1) {
                    await con.query(`UPDATE owneditems SET prodtype=1 WHERE productid="${item.productid}"`, async (err, row) => {
                        if(err) throw err;
                    });
                } else if(item.prodtype == 2) {
                    await con.query(`UPDATE owneditems SET prodtype=2 WHERE productid="${item.productid}"`, async (err, row) => {
                        if(err) throw err;
                    });
                } else if(item.prodtype == 3) {
                    await con.query(`UPDATE owneditems SET prodtype=3 WHERE productid="${item.productid}"`, async (err, row) => {
                        if(err) throw err;
                    });
                };
            };
        });
        await con.query(`UPDATE sitestyles SET whycompanyenabled=0, whycompanytitle="Built for small businesses", whycompanysubtitle="Tools & resources for all businesses, from startups to legacy companies. We are here to help them all!", ourdiscordbtntext="Our Discord" WHERE whycompanyenabled IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE staff SET manageorders=true, manageblogs=true, managecontactsubmissions=true, manageseo=true WHERE manageorders IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE sitestyles SET ourdiscordbtnlink="/discord" WHERE ourdiscordbtnlink IS NULL`, async (err, row) => {
            if(err) throw err;
        });
        await con.query(`UPDATE sitesettings SET linkedin="none" WHERE linkedin IS NULL`, async (err, row) => {
            if(err) throw err;
        });
    }, 5000);

    let madeAChange = false;
    let newConfig = config;
    // Main Settings
    if(typeof newConfig.domain == 'undefined') { newConfig.domain = "http://localhost:3000"; console.log(`${chalk.redBright('[Update Manager]')} Config domain Created...`); madeAChange = true; };
    if(typeof newConfig.port == 'undefined') { newConfig.port = 3000; console.log(`${chalk.redBright('[Update Manager]')} Config port Created...`); madeAChange = true; };
    if(typeof newConfig.tebexSecret == 'undefined') { newConfig.tebexSecret = "YOUR_TEBEX_SECRET"; console.log(`${chalk.redBright('[Update Manager]')} Config tebexSecret Created...`); madeAChange = true; };
    if(typeof newConfig.debugMode == 'undefined') { newConfig.debugMode = false; console.log(`${chalk.redBright('[Update Manager]')} Config debugMode Created...`); madeAChange = true; };
    if(typeof newConfig.ownerIds == 'undefined') { newConfig.ownerIds = ["704094587836301392", "YOUR_USER_ID"]; console.log(`${chalk.redBright('[Update Manager]')} Config ownerIds Created...`); madeAChange = true; };
    if(typeof newConfig.importHyperzBans == 'undefined') { newConfig.importHyperzBans = true; console.log(`${chalk.redBright('[Update Manager]')} Config importHyperzBans Created...`); madeAChange = true; };
    // SQL Settings
    if(typeof newConfig.sql == 'undefined') { newConfig.sql = {}; console.log(`${chalk.redBright('[Update Manager]')} Config SQL Created...`); madeAChange = true; };
    if(typeof newConfig.sql.host == 'undefined') { newConfig.sql.host = "localhost"; console.log(`${chalk.redBright('[Update Manager]')} Config SQL host Created...`); madeAChange = true; };
    if(typeof newConfig.sql.user == 'undefined') { newConfig.sql.user = "root"; console.log(`${chalk.redBright('[Update Manager]')} Config SQL user Created...`); madeAChange = true; };
    if(typeof newConfig.sql.password == 'undefined') { newConfig.sql.password = ""; console.log(`${chalk.redBright('[Update Manager]')} Config SQL password Created...`); madeAChange = true; };
    if(typeof newConfig.sql.database == 'undefined') { newConfig.sql.database = "hyperzstore"; console.log(`${chalk.redBright('[Update Manager]')} Config SQL database Created...`); madeAChange = true; };
    // Discord Settings
    if(typeof newConfig.loginMethods == 'undefined') { newConfig.loginMethods = {}; console.log(`${chalk.redBright('[Update Manager]')} Config loginMethods Created...`); madeAChange = true; };
    if(typeof newConfig.loginMethods.regular == 'undefined') { newConfig.loginMethods.regular = {}; console.log(`${chalk.redBright('[Update Manager]')} Config loginMethods regular Created...`); madeAChange = true; };
    if(typeof newConfig.loginMethods.regular.enabled == 'undefined') { newConfig.loginMethods.regular.enabled = true; console.log(`${chalk.redBright('[Update Manager]')} Config loginMethods regular enabled Created...`); madeAChange = true; };
    if(typeof newConfig.loginMethods.discord == 'undefined') { newConfig.loginMethods.discord = {}; console.log(`${chalk.redBright('[Update Manager]')} Config loginMethods discord Created...`); madeAChange = true; };
    if(typeof newConfig.loginMethods.discord.enabled == 'undefined') { newConfig.loginMethods.discord.enabled = false; console.log(`${chalk.redBright('[Update Manager]')} Config loginMethods discord enabled Created...`); madeAChange = true; };
    if(typeof newConfig.loginMethods.discord.oauthId == 'undefined') { newConfig.loginMethods.discord.oauthId = "YOUR_CLIENT_ID"; console.log(`${chalk.redBright('[Update Manager]')} Config loginMethods discord oauthId Created...`); madeAChange = true; };
    if(typeof newConfig.loginMethods.discord.oauthToken == 'undefined') { newConfig.loginMethods.discord.oauthToken = "YOUR_CLIENT_SECRET"; console.log(`${chalk.redBright('[Update Manager]')} Config loginMethods discord oauthToken Created...`); madeAChange = true; };
    if(typeof newConfig.loginMethods.discord.botToken == 'undefined') { newConfig.loginMethods.discord.botToken = ""; console.log(`${chalk.redBright('[Update Manager]')} Config discord botToken Created...`); madeAChange = true; };
    // Payment Settings
    if(typeof newConfig.paymentSettings == 'undefined') { newConfig.paymentSettings = {}; console.log(`${chalk.redBright('[Update Manager]')} Config paymentSettings Created...`); madeAChange = true; };
    if(typeof newConfig.paymentSettings.useStripe == 'undefined') { newConfig.paymentSettings.useStripe = false; console.log(`${chalk.redBright('[Update Manager]')} Config paymentSettings useStripe Created...`); madeAChange = true; };
    if(typeof newConfig.paymentSettings.stripePublicKey == 'undefined') { newConfig.paymentSettings.stripePublicKey = "YOUR_STRIPE_PUBLIC_KEY"; console.log(`${chalk.redBright('[Update Manager]')} Config paymentSettings stripePublicKey Created...`); madeAChange = true; };
    if(typeof newConfig.paymentSettings.stripeSecretKey == 'undefined') { newConfig.paymentSettings.stripeSecretKey = "YOUR_STRIPE_SECRET_KEY"; console.log(`${chalk.redBright('[Update Manager]')} Config paymentSettings stripeSecretKey Created...`); madeAChange = true; };
    if(typeof newConfig.paymentSettings.usePaypal == 'undefined') { newConfig.paymentSettings.usePaypal = false; console.log(`${chalk.redBright('[Update Manager]')} Config paymentSettings usePaypal Created...`); madeAChange = true; };
    if(typeof newConfig.paymentSettings.paypalClientId == 'undefined') { newConfig.paymentSettings.paypalClientId = "YOUR_PAYPAL_CLIENT_ID"; console.log(`${chalk.redBright('[Update Manager]')} Config paymentSettings paypalClientId Created...`); madeAChange = true; };
    if(typeof newConfig.paymentSettings.paypalClientSecret == 'undefined') { newConfig.paymentSettings.paypalClientSecret = "YOUR_PAYPAL_CLIENT_SECRET"; console.log(`${chalk.redBright('[Update Manager]')} Config paymentSettings paypalClientSecret Created...`); madeAChange = true; };
    if(typeof newConfig.paymentSettings.currency == 'undefined') { newConfig.paymentSettings.currency = "usd"; console.log(`${chalk.redBright('[Update Manager]')} Config paymentSettings currency Created...`); madeAChange = true; };
    if(typeof newConfig.paymentSettings.currencySymbol == 'undefined') { newConfig.paymentSettings.currencySymbol = "$"; console.log(`${chalk.redBright('[Update Manager]')} Config paymentSettings currencySymbol Created...`); madeAChange = true; };
    // Email Settings
    let replaceHTML = "<div style='padding: 1em; word-break: break-word; word-wrap: break-word;'><img src='REPLACE_DOMAIN/assets/logo.png' width='125px' height='125px' style='text-align: center; margin-left: auto; margin-right: auto;'><h2 stype='padding-bottom: 8px; width: 70%; margin-left: auto; margin-right: auto; border-bottom: solid 2px black'>REPLACE_SITENAME</h2><hr><p style='text-align: start; font-weight: 600; padding-bottom: 10px; font-size: 1.1em;'>REPLACE_SUBJECT</p> <p style='text-align: start; padding-bottom: 1em;'>REPLACE_CONTENT</p><hr><a href='REPLACE_DOMAIN/account' style='padding: 1em;' target='_blank'>Change Communication Preferences</a></div>";
    if(typeof newConfig.emails == 'undefined') { newConfig.emails = {}; console.log(`${chalk.redBright('[Update Manager]')} Config emails Created...`); madeAChange = true; };
    if(typeof newConfig.emails.enabled == 'undefined') { 
        newConfig.emails.enabled = false; console.log(`${chalk.redBright('[Update Manager]')} Config emails enabled Created...`);
        madeAChange = true;
        if(typeof newConfig.emails.transporter == 'undefined') { newConfig.emails.transporter = {}; console.log(`${chalk.redBright('[Update Manager]')} Config emails transporter Created...`); };
        if(typeof newConfig.emails.transporter.service == 'undefined') { newConfig.emails.transporter.service = 'gmail'; console.log(`${chalk.redBright('[Update Manager]')} Config emails transporter service Created...`); };
        if(typeof newConfig.emails.transporter.auth == 'undefined') { newConfig.emails.transporter.auth = {}; console.log(`${chalk.redBright('[Update Manager]')} Config emails transporter auth Created...`); };
        if(typeof newConfig.emails.transporter.auth.user == 'undefined') { newConfig.emails.transporter.auth.user = 'example@gmail.com'; console.log(`${chalk.redBright('[Update Manager]')} Config emails transporter auth user Created...`); };
        if(typeof newConfig.emails.transporter.auth.pass == 'undefined') { newConfig.emails.transporter.auth.pass = '1234'; console.log(`${chalk.redBright('[Update Manager]')} Config emails transporter auth pass Created...`); };
        if(typeof newConfig.emails.options == 'undefined') { newConfig.emails.options = {}; console.log(`${chalk.redBright('[Update Manager]')} Config emails options Created...`); };
        if(typeof newConfig.emails.options.html == 'undefined') { newConfig.emails.options.html = replaceHTML; console.log(`${chalk.redBright('[Update Manager]')} Config emails options html Created...`); };
    };
    // Timezone Settings
    if(typeof newConfig.timeZone == 'undefined') { newConfig.timeZone = {}; console.log(`${chalk.redBright('[Update Manager]')} Config timeZone Created...`); madeAChange = true; };
    if(typeof newConfig.timeZone.tz == 'undefined') { newConfig.timeZone.tz = "EST"; console.log(`${chalk.redBright('[Update Manager]')} Config timeZone tz Created...`); madeAChange = true; };
    if(typeof newConfig.timeZone.format == 'undefined') { newConfig.timeZone.format = "MM-DD-YYYY hh:mm A"; console.log(`${chalk.redBright('[Update Manager]')} Config timeZone format Created...`); madeAChange = true; };
    // Redirect Settings
    if(typeof newConfig.redirects == 'undefined') { newConfig.redirects = []; console.log(`${chalk.redBright('[Update Manager]')} Config redirects Created...`); madeAChange = true; };
    // PUSH UPDATES TO CONFIG FILE
    if(madeAChange) {
        let updatedConfig = JSON.stringify(newConfig, null, 4) + '\n';
        fs.writeFileSync('./config.json', updatedConfig);
        console.log(chalk.yellowBright('Changes were made to your config file, please restart this product again.'))
        process.exit(1);
    } else {
        setTimeout(function() {
            console.log(`${chalk.redBright('[Update Manager]')} Configuration file is up to date!`)
        }, 2000);
    };

};

// Rejection Handler
process.on('unhandledRejection', (err) => { 
    if(err.toString().replaceAll(' ', '').includes('cachedDataRejected')) {
        console.log('-----------------------------------');
        console.log('License system was messed with or invalid NodeJS version...');
        console.log(chalk.red('Please read the ToS before continuing...'));
        console.log('-----------------------------------');
        process.exit(1);
    }
});