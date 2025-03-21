// web server dependencies
import bodyParser from "body-parser"
import cookieParser from "cookie-parser"
import cors from "cors"
import express from "express"
import "dotenv/config"
import { setup as inittg } from "./routes/tg"
import twig from "twig"
// eq dependencies
import { sequelize, initdb, Domain, User } from "./database/index"
import { CryptoCore } from "./core/crypto"
import { API } from "./routes/api"
import { session } from "./libs/session"
import { CLITransport, FileTransport, Logger } from "./libs/logger"
import { createPk, getOrCreateCFGVar } from "./utils"
import EventEmitter from "node:events"
import { join } from "node:path"
import { Coingecko } from "./libs/coingecko"
import { createServer } from "node:http"

import { rootpath } from "./root"
import { AuthSockRequest, initSocket } from "./core/controllers/socket"
import fs from "node:fs"
import { db2interface } from "./type.conv"
import { RedisCache } from "./libs/cache"
import { WalletCtrl } from "./core/controllers/wallet"
import { SystemDefUser } from "./types"

(async () => {
    const logger = new Logger({
        loglevel: parseInt(process.env.LOG_LEVEL || "4"),
        transport: [
            new CLITransport(),
            new FileTransport()
        ]
    }, "app.ts")

    function profileMem() {
        logger.memory()
        setTimeout(profileMem, 60000)
    }
    profileMem()

    const cache = new RedisCache()

    initdb(logger.getLogger('Sequelize'))

    const eventBus = new EventEmitter()

    const port: number = parseInt((process.env.PORT || 3000).toString())
    const host: string = process.env.HOST || "0.0.0.0"
    const eth_node: string = process.env.ETH_NODE
    let session_pk: string = getOrCreateCFGVar('SESSION_PK', "./.env", createPk)


    /*    if (process.env.TG_ENBLED) {
            const tg_key: string = process.env.TG_KEY
    
            if (!tg_key) {
                logger.fat('TG_KEY env not foud!')
                process.abort()
            }
    
            inittg(tg_key, logger.getLogger("routes/tg.ts"))
        }*/
    const core = new CryptoCore({
        nodesConfPath: "nets.json",
        logger: logger.getLogger("core/crypto.ts"),
        event: eventBus,
        root: rootpath,
    })

    const coingecko = new Coingecko(logger.getLogger("libs/coingecko.ts"))

    eventBus.on("confirmedtx", async d => {
        d.usd = (await coingecko.getPriceByOurName(d.currency.split("_")[0])).usd * parseFloat(d.value)

        let walletCTRL = new WalletCtrl(core, coingecko, eventBus)

        walletCTRL.createDeposit(
            d.value,
            d.currency.split("_")[0].toLowerCase(),
            `new Deposit, ${coingecko.getBlockScans(d.currency.split("_")[1].toLowerCase()).replace('<txhash>', d.txhash)}`,
            d.uhash,
            User.build(SystemDefUser)
        )
    })

    const app = express()

    const server = createServer(app)

    twig.cache(false)
    app.set('trust proxy', 1)
    app.set('view engine', 'twig')
    app.set('view cache', false)
    app.set('views', './views')
    app.use(cors())
    app.use(logger.getMiddleware())
    app.use(express.static("public"));
    app.use(bodyParser.urlencoded({ extended: false }))
    app.use(bodyParser.json())
    app.use(cookieParser())
    app.use(async (req: AuthSockRequest, res, next) => {
        let domain = req.headers["host"].split(":")[0]

        let d = await cache.get(`domain:${domain}`)

        if (!d) {
            req.Domain = (await Domain.findOrCreate({
                defaults: {
                    status: 2,
                    domain,
                    nsList: [],
                    zoneId: "",
                    name: domain,
                },
                where: { domain }
            }))[0]

            await cache.set(`domain:${domain}`, req.Domain, 100 * 60) // ttl set to 100min

        }

        req.Domain = d
        next()
    })
    app.use(session(session_pk, "session", logger.getLogger("libs/session.ts"), cache))
    let { sockMidl, sockRoute } = initSocket(eventBus, server, logger.getLogger("socker.ts"), { pk: session_pk, name: "session", }, cache)

    app.use(sockMidl)

    const api = new API(logger.getLogger("routes/api.ts"), core, coingecko, eventBus, cache)

    app.use("/api/v1", api.router)
    app.get("/api/v1/sockData", sockRoute)

    app.get("/ref/:ref", async (req: AuthSockRequest, res) => {
        if (req.session.isAuth) return res.redirect("/")
        let refu = await User.findOne({
            where: {
                ref: req.params.ref
            }
        })
        if (refu) {
            res.cookie("_rrr", `${refu.id}|${refu.ref}`, {
                maxAge: Date.now() * 2
            })
            res.redirect("/register")
        }
        res.redirect("/")
    })

    app.get("/", (req, res) => {
        res.render("index.twig", {})
    })
    app.get("/*", (req: AuthSockRequest, res, next) => {
        if (!fs.existsSync(join(rootpath, 'views', req.path + ".twig"))) return next()
        let user = db2interface.user(req.session.cUser),
            domain = db2interface.domain(req.Domain)
        res.render(join(rootpath, 'views', req.path + ".twig"), {
            user,
            domain,
            userJSON: JSON.stringify(user),
            domainJSON: JSON.stringify(domain),
        })
    })

    server.listen(port, "0.0.0.0", async () => {
        logger.info("App listen on: 0.0.0.0:3000")
        await sequelize.sync({ alter: true })
    })
})()
