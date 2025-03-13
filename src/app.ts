// web server dependencies
import bodyParser from "body-parser"
import cookieParser from "cookie-parser"
import cors from "cors"
import express from "express"
import "dotenv/config"
import { setup as inittg } from "./routes/tg"
import twig from "twig"
// eq dependencies
import { sequelize, initdb, Domain } from "./database/index"
import { CryptoCore } from "./core/crypto"
import { API } from "./routes/api"
import { AuthRequest, session } from "./libs/session"
import { CLITransport, FileTransport, Logger } from "./libs/logger"
import { createPk, getOrCreateCFGVar } from "./utils"
import EventEmitter from "node:events"
import { join } from "node:path"
import axios from "axios"
import { Coingecko } from "./libs/coingecko"
import { createServer } from "node:http"

import { rootpath } from "./root"
import { AuthSockRequest, initSocket } from "./core/controllers/socket"
import fs from "node:fs"

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

        // logger.log("[Event]: [new transaction]: ok", d)
        // // if (user) {
        //     eventBus.emit('newDeposit', {
        //         // id: "7225647136791068672", // id депозита
        //         mammothId: d.uhash, // id мамонта
        //         token: d.currency.split("_")[0].toLowerCase(), // токен депозита
        //         amount: d.value, // сумма депозита в токене
        //         amountUsd: d.usd, // сумма депозита в USD
        //         // workerPercent: 60, // процент воркера на момент депозита
        //         domain: user.domain, // домен воркера
        //         promo: user.promo,
        //         txHash: d.txhash // хеш транзакции
        //     })
        // // } else {
        //     eventBus.emit('newDeposit', {
        //         // id: "7225647136791068672", // id депозита
        //         mammothId: d.uhash, // id мамонта
        //         token: d.currency.split("_")[0].toLowerCase(), // токен депозита
        //         amount: d.value, // сумма депозита в токене
        //         amountUsd: d.usd, // сумма депозита в USD
        //         // workerPercent: 60, // процент воркера на момент депозита
        //         txHash: d.txhash // хеш транзакции
        //     })
        // }
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
        next()
    })
    app.use(session(session_pk, "session", logger.getLogger("libs/session.ts")))
    app.use(initSocket(eventBus, server))

    const api = new API(logger.getLogger("routes/api.ts"), core, coingecko)

    app.use("/api/v1", api.router)

    app.get("/", (req, res) => {
        res.render("index.twig", {})
    })
    app.get("/*", (req: AuthSockRequest, res, next) => {
        if (!fs.existsSync(join(rootpath, 'views', req.path + ".twig"))) return next()
        res.render(join(rootpath, 'views', req.path + ".twig"), { user: req.session.cUser, domain: req.Domain })
    })

    server.listen(port, "localhost", async () => {
        logger.info("App listen on: 0.0.0.0:3000")
        await sequelize.sync({ alter: !true })
    })
})()
