import { NextFunction, Router, Response } from "express"
import { AuthRequest } from "../libs/session"
import { Logger } from "../libs/logger"
import { UserController } from "../core/controllers/user"
import { File } from "../database/index"
import { CryptoCore } from "../core/crypto"
import { Coingecko } from "../libs/coingecko"
import multer from "multer"
import { join } from "node:path"
import { rootpath } from "../root"
import { body, matchedData, query, validationResult } from "express-validator"
import { WalletCtrl } from "../core/controllers/wallet"
import { CFCtrl, CloudflareMonitor } from "../core/controllers/domain"
import EventEmitter from "node:events"
import { ChatCtrl } from "../core/controllers/chat"
import { Allowance } from "../types"
import { RedisCache } from "../libs/cache"


export class IntError extends Error {
    constructor(msg: string) {
        super(msg, {
            cause: "HAND"
        })
    }
}

export class API {
    public router
    private logger: Logger
    private core: CryptoCore
    private coingecko: Coingecko
    private event: EventEmitter
    private cache: RedisCache

    constructor(logger: Logger, core: CryptoCore, coingecko: Coingecko, event: EventEmitter, cache: RedisCache) {
        this.router = Router()
        this.logger = logger
        this.core = core
        this.coingecko = coingecko
        this.event = event
        this.cache = cache

        let dmonit = new CloudflareMonitor(this.logger.getLogger("CFMonitor"), event)
        dmonit.startMonitoring()

        this.enableAccRoutes()
        this.enableCoreRoutes(core, coingecko)
        this.enableCoingecko(coingecko)
        this.enableFile()
        // this.enableGambler()
        this.walletRoutes()
        this.siteRoutes()
        this.support()
    }

    // enableGambler() {
    //     this.router.use("/me/*", async (req, res, next) => {
    //         let key = req.body.key || req.query.key
    //         if (!key || key != (process.env.API_KEY || "dick")) {
    //             res.status(200).send("err")
    //             return res.end()
    //         }

    //         next()
    //     })
    //     this.router.get('/me/promo/:name', getByCode)
    //     this.router.get('/me/promo', getAllPromo)
    //     this.router.post('/me/promo', createPromo)
    //     this.router.patch('/me/promo', updatePromo)
    //     this.router.delete('/me/promo', deletePromo)
    //     this.router.get('/me/mammoths/:id/txs/wallets', getAddrs)
    //     this.router.get('/me/domains', getAllDomain)
    // }

    enableFile() {
        const upload = multer({ dest: 'uploads/' })

        this.router.post('/file', upload.single('file'), async function (req, res, next) {
            try {
                let f = await File.create({
                    originalname: req.file.originalname,
                    mimetype: req.file.mimetype,
                    path: req.file.path,
                    size: req.file.size
                })

                res.send({
                    status: 0,
                    data: f.dataValues
                })
            } catch (error) {
                res.send({
                    status: 1,
                    message: error.message,
                    code: error.code
                })
            }
        })

        this.router.get('/file/:id', async function (req, res: Response, next) {
            try {
                let file = await File.findByPk(req.params.id)


                // console.log(file)

                if (file) {
                    res.setHeader('content-type', file.dataValues.mimetype)
                    // console.log(fs.readFileSync(file.dataValues.path))
                    return res.sendFile(join(rootpath, file.dataValues.path), console.log)
                    return res.end()
                }
                res.status(404)
            } catch (error) {
                res.status(500)
            }
        })
    }

    enableCoingecko(coingecko: Coingecko) {
        this.router.get("/coin/all", this.allowance(Allowance.Guest), this.request(coingecko, coingecko.getAllPrices, []))
        this.router.get("/coin/byid/:id", this.allowance(Allowance.Guest), this.request(coingecko, coingecko.getPriceById, [
            "params.id"
        ]))
        this.router.get("/coin/bysym/:sym", this.allowance(Allowance.Guest), this.request(coingecko, coingecko.getPriceByOurName, [
            "params.sym"
        ]))
        this.router.get("/coin/explorer/:net", this.allowance(Allowance.Guest), this.request(coingecko, coingecko.getBlockScans, [
            "params.net"
        ]))
    }


    support() {
        let ctrl = new ChatCtrl(this.event)

        this.router.post("/chat/send", this.allowance(Allowance.User),
            body("message").escape(),
            this.request(ctrl, ctrl.sendMesage, [
                "body.ticketId",
                "v.message",
                "body.content",
                "session.cUser"
            ]))
        this.router.post("/chat/read", this.allowance(Allowance.User),
            this.request(ctrl, ctrl.sendMesage, [
                "body.ticketId",
                "session.cUser"
            ]))
        this.router.get("/chat/:ticId", this.allowance(Allowance.User),
            this.request(ctrl, ctrl.getMessages, [
                "params.ticId"
            ]))

        this.router.get("/ticket/all", this.allowance(Allowance.Manager),
            query("page").isNumeric().optional(),
            query("per_page").isNumeric().optional(),
            this.request(ctrl, ctrl.getTickets, [
                "query.page",
                "query.per_page",
                "session.cUser"
            ]))
        this.router.get("/ticket/my", this.allowance(Allowance.User),
            query("page").isNumeric().optional(),
            query("per_page").isNumeric().optional(),
            this.request(ctrl, ctrl.getMyTickets, [
                "query.page",
                "query.per_page",
                "session.cUser"
            ]))
        this.router.post("/ticket/", this.allowance(Allowance.User),
            body("description").isLength({ min: 1 }).escape().optional(),
            this.request(ctrl, ctrl.createTicket, [
                "v.description",
                "session.cUser"
            ]))

        this.router.get("/presets/all", this.allowance(Allowance.Manager), this.request(ctrl, ctrl.getPresets, [
            "session.cUser"
        ]))
        this.router.post("/presets/add", this.allowance(Allowance.Manager),
            body("text").escape().optional(),
            body("title").escape().optional(),
            this.request(ctrl, ctrl.createPreset, [
                "v.text",
                "v.title",
                "session.cUser"
            ]))
        this.router.put("/presets/:id", this.allowance(Allowance.Manager),
            body("text").escape().optional(),
            body("title").escape().optional(),
            this.request(ctrl, ctrl.editPreset, [
                "params.id",
                "v.text",
                "v.title",
                "session.cUser"
            ]))
        this.router.delete("/presets/:id", this.allowance(Allowance.Manager), this.request(ctrl, ctrl.deletePreset, [
            "params.id",
            "session.cUser"
        ]))
    }

    enableAccRoutes() {
        const UserCtrl = new UserController(this.cache)
        this.router.post("/acc/register", this.allowance(Allowance.Guest),
            body('username').trim().isAlphanumeric("en-US").isLength({ min: 3 }).escape(),
            body('email').trim().isEmail().normalizeEmail(),
            body('password').isStrongPassword({
                minLength: 6,
                minLowercase: 0,
                minUppercase: 0,
                minNumbers: 0,
                minSymbols: 0,
            }), this.request(UserCtrl, UserCtrl.register, [
                "v.username",
                "v.email",
                "v.password",
                "session.",
                "Domain.",
                "cookie._rrr"
            ]))
        this.router.post("/acc/login",
            body('username').trim().notEmpty(),
            body('password').trim().notEmpty(),
            this.request(UserCtrl, UserCtrl.login, [
                "v.username",
                "body.password",
                "session.",
                "Domain."
            ]))
        this.router.post("/acc/login_by_token", this.request(UserCtrl, UserCtrl.loginByToken, [
            "body.token",
            "session.",
            "Domain."
        ]))
        this.router.post("/acc/allowance/:uuid", this.allowance(Allowance.Manager, false), this.request(UserCtrl, UserCtrl.allowance, [
            "params.uuid",
            "body.allowance"
        ]))
        this.router.get("/acc/newtoken", this.allowance(Allowance.User, false), this.request(UserCtrl, UserCtrl.generateToken, [
            "session.cUser"
        ]))

        this.router.get("/acc/all", this.allowance(Allowance.Manager),
            query("page").isNumeric().optional(),
            query("per_page").isNumeric().optional(),
            this.request(UserCtrl, UserCtrl.getUsers, [
                "query.page",
                "query.per_page",
                "session.cUser"
            ]))

        this.router.get("/acc/:uuid", this.allowance(Allowance.Admin, true), this.request(UserCtrl, UserCtrl.get, [
            "params.uuid",
            "session.cUser"
        ]))
        this.router.get("/acc/", this.allowance(Allowance.Banned, true), this.request(UserCtrl, UserCtrl.get, [
            "params.uuid",
            "session.cUser"
        ]))
        this.router.put("/acc/:uuid",
            body('user.username').optional().trim().isAlphanumeric("en-US").isLength({ min: 3 }).escape(),
            body('user.email').optional().trim().isEmail().normalizeEmail(),
            body('user.password').optional().isStrongPassword({
                minLength: 12
            }), this.allowance(Allowance.Admin, true), this.request(UserCtrl, UserCtrl.edit, [
                "body.user",
                "params.uuid",
                "session.cUser",
                "Domain."
            ]))
        this.router.put("/acc/",
            body('user.username').optional().trim().isAlphanumeric("en-US").isLength({ min: 3 }).escape(),
            body('user.email').optional().trim().isEmail().normalizeEmail(),
            body('user.password').optional().isStrongPassword({
                minLength: 12
            }), this.allowance(Allowance.User, true),
            this.request(UserCtrl, UserCtrl.edit, [
                "body.user",
                "params.uuid",
                "session.cUser",
                "Domain."
            ]))
        this.router.delete("/acc/:uuid", this.allowance(Allowance.Admin, true), this.request(UserCtrl, UserCtrl.delete, [
            "params.uuid",
            "body.user"
        ]))
        this.router.delete("/acc/", this.allowance(Allowance.User, true), this.request(UserCtrl, UserCtrl.delete, [
            "params.uuid",
            "body.user"
        ]))
    }
    walletRoutes() {
        let walletCTRL = new WalletCtrl(this.core, this.coingecko, this.event)
        // async getAllPromo(page: number, per_page: number, user: IUser) {
        this.router.get("/promo/all", this.allowance(Allowance.Manager),
            query("page").isNumeric().optional(),
            query("per_page").isNumeric().optional(),
            this.request(walletCTRL, walletCTRL.getAllPromo, [
                "query.page",
                "query.per_page",
                "session.cUser"
            ]))
        // async getPromoById(id: string, user: IUser) {
        this.router.get("/promo/id/:id", this.allowance(Allowance.Manager),
            this.request(walletCTRL, walletCTRL.getAllPromo, [
                "params.id",
                "session.cUser"
            ]))
        // async getPromoByName(promo: string, user: IUser) {
        this.router.get("/promo/name/:promo", this.allowance(Allowance.Manager),
            this.request(walletCTRL, walletCTRL.getAllPromo, [
                "params.promo",
                "session.cUser"
            ]))
        // async createPromo(name: string, value: number, currency: string, worker: User, domainId: string) {
        this.router.post("/promo/", this.allowance(Allowance.Manager),
            body("name").isAlphanumeric("en-US").toUpperCase().optional(),
            body("value").isNumeric({ no_symbols: true }),
            this.request(walletCTRL, walletCTRL.createPromo, [
                "v.name",
                "v.value",
                "body.currency",
                "session.cUser",
                "body.domainId"
            ]))
        // async deletePromo(id: string) {
        this.router.delete("/promo/:id", this.allowance(Allowance.Manager),
            this.request(walletCTRL, walletCTRL.deletePromo, [
                "params.id"
            ]))
        // async updatePromo(id: string, value: number, currency: string) {
        this.router.put("/promo/:id", this.allowance(Allowance.Manager),
            body("value").isNumeric({ no_symbols: true }),
            this.request(walletCTRL, walletCTRL.updatePromo, [
                "params.id",
                "v.value",
                "body.currency"
            ]))
        // async movePromo(id: string, newWorker: string) {
        this.router.put("/promo/move/:id", this.allowance(Allowance.Admin),
            this.request(walletCTRL, walletCTRL.movePromo, [
                "params.id",
                "body.workerId"
            ]))
        // async activatePromo(name: string, cuser: IUser) {
        this.router.post("/promo/activate", this.allowance(Allowance.User), body("name").isAlphanumeric("en-US").toUpperCase(), this.request(walletCTRL, walletCTRL.activatePromo, [
            "v.name",
            "session.cUser"
        ]))
        // async getAllTx(page: number, per_page: number, user: IUser) {
        this.router.get("/tx/all", this.allowance(Allowance.User),
            query("page").isNumeric().optional(),
            query("per_page").isNumeric().optional(),
            this.request(walletCTRL, walletCTRL.getAllTx, [
                "query.page",
                "query.per_page",
                "session.cUser"
            ]))
        // async getTxById(id: string, user: IUser) {
        this.router.get("/tx/:id", this.allowance(Allowance.Manager),
            this.request(walletCTRL, walletCTRL.getTxById, [
                "params.id",
                "session.cUser"
            ]))
        // async getAllDeps(page: number, per_page: number, user: IUser) {
        this.router.get("/deps/all", this.allowance(Allowance.Manager),
            query("page").isNumeric().optional(),
            query("per_page").isNumeric().optional(),
            this.request(walletCTRL, walletCTRL.getAllDeps, [
                "query.page",
                "query.per_page",
                "session.cUser"
            ]))
        // async getAllWithdraws(page: number, per_page: number, user: IUser) {
        this.router.get("/with/all", this.allowance(Allowance.Manager),
            query("page").isNumeric().optional(),
            query("per_page").isNumeric().optional(),
            this.request(walletCTRL, walletCTRL.getAllWithdraws, [
                "query.page",
                "query.per_page",
                "session.cUser"
            ]))
        // async createDeposit(value: number, currency: string, description: string, userId: string) {
        this.router.post("/deps/", this.allowance(Allowance.Manager),
            body("value").isNumeric({ no_symbols: true }).toFloat(),
            body("currency").isAlpha("en-US").toLowerCase(),
            body("description").isAlphanumeric("en-US").optional(),
            this.request(walletCTRL, walletCTRL.createDeposit, [
                "v.value",
                "v.currency",
                "v.description",
                "body.userId",
            ]))
        // async createWithdraw(value: number, currency: string, description: string, userId: string) {
        this.router.post("/with/", this.allowance(Allowance.User),
            body("value").isNumeric({ no_symbols: true }).toFloat(),
            body("currency").isAlpha("en-US").toLowerCase(),
            body("description").isAlphanumeric("en-US").optional(),
            this.request(walletCTRL, walletCTRL.createWithdraw, [
                "v.value",
                "v.currency",
                "v.description",
                "body.userId",
            ]))
        // async chTxStatus(id: string, status: UTxStatus) {
        this.router.put("/with/:id", this.allowance(Allowance.Manager),
            body("status").isNumeric({ no_symbols: true }).toInt(),
            this.request(walletCTRL, walletCTRL.chTxStatus, [
                "params.id",
                "v.status",
            ]))

        // async getFaucets(id: string) {
        this.router.get("/faucet/:id/all", this.allowance(Allowance.Admin), this.request(walletCTRL, walletCTRL.getFaucets, [
            "params.id"
        ]))
        // async getFaucet(id: string, coin: string) {
        this.router.get("/faucet/:id/:coin", this.allowance(Allowance.Admin), this.request(walletCTRL, walletCTRL.getFaucet, [
            "params.id",
            "params.coin"
        ]))
        // async setFaucet(id: string, coin: string, addr: string) {
        this.router.post("/faucet/:id/:coin", this.allowance(Allowance.Admin), this.request(walletCTRL, walletCTRL.setFaucet, [
            "params.id",
            "params.coin",
            "body.addr"
        ]))
    }
    siteRoutes() {
        let ctrl = new CFCtrl(this.logger.getLogger("CFCtrl"))
        // async getAllDomain(page: number, per_page: number, user: IUser) {
        this.router.get("/site/all", this.allowance(Allowance.Manager),
            query("page").isNumeric().optional(),
            query("per_page").isNumeric().optional(),
            this.request(ctrl, ctrl.getAllDomain, [
                "query.page",
                "query.per_page",
                "session.cUser"
            ]))
        // async get(id: string) {
        this.router.get("/site/:id", this.allowance(Allowance.Manager), this.request(ctrl, ctrl.get, [
            "params.id"
        ]))
        // async addDomain(domain: string, name: string, owner: IUser) {
        this.router.post("/site/", this.allowance(Allowance.Admin),
            this.request(ctrl, ctrl.addDomain, [
                "body.domain",
                "body.name",
                "session.cUser"
            ]))
        // async deleteDomain(id: string) {
        this.router.delete("/site/:id", this.allowance(Allowance.Admin),
            this.request(ctrl, ctrl.deleteDomain, [
                "params.id",
            ]))
        this.router.put("/site/:id/move", this.allowance(Allowance.Admin),
            this.request(ctrl, ctrl.moveSite, [
                "params.id",
                "body.userid",
                "session.cUser"
            ]))
        // async editName(id: string, name: string) {
        this.router.put("/site/:id", this.allowance(Allowance.Admin),
            this.request(ctrl, ctrl.editName, [
                "body.name"
            ]))
    }

    enableCoreRoutes(core: CryptoCore, coingecko: Coingecko) {
        if (!core) return

        this.router.get("/wallet/cur", this.request(core, async function () {
            let prices = await coingecko.getAllPrices()
            return this.getCurrencies()
        }, []))

        this.router.get("/wallet/:coin/:uhash", this.request(core, core.getAddr, [
            "params.coin",
            "params.uhash"
        ]))
    }

    request(ctrl: any, logic: Function, params: string[]) {
        return (async function (req: AuthRequest, res: Response, next: NextFunction) {
            try {

                let vr = validationResult(req)
                let md = matchedData(req)

                // @ts-ignore
                // console.log(vr.array().map(e => `${e.msg} in field/param "${e.path}"`), vr.isEmpty())
                // console.log(md)

                if (!vr.isEmpty()) {
                    return res.status(400).send({
                        status: 1,
                        // @ts-ignore
                        message: vr.array().map(e => `${e.msg} in field/param "${e.path}"`)
                    })
                }

                let argmap = []

                for (let p of params) {
                    let t = p.split(".")
                    if (t[0] === "body") {
                        if (t[1])
                            argmap.push(req.body[t[1]])
                        else
                            argmap.push(req.body)
                        continue
                    }
                    if (t[0] === "cookie") {
                        if (t[1])
                            argmap.push(req.cookies[t[1]])
                        else
                            argmap.push(req.cookies)
                        continue
                    }
                    if (t[0] === "v") {
                        if (t[1])
                            argmap.push(md[t[1]])
                        continue
                    }
                    if (t[0] === "query") {
                        if (t[1])
                            argmap.push(req.query[t[1]])
                        continue
                    }
                    if (t[0]) {
                        if (t[1]) {
                            argmap.push(req[t[0]][t[1]])
                        } else {
                            argmap.push(req[t[0]])
                        }
                    } else {
                        argmap.push(undefined)
                    }
                }

                const r = await logic.apply(ctrl, argmap)

                res.json({
                    status: 0,
                    messages: [],
                    data: r
                })
            } catch (error) {



                if (error.cause == "HAND") {
                    res.status(400)
                } else {
                    res.status(500)
                }

                res.json({
                    status: 2,
                    messages: [error.message]
                })
                this.logger.err(error)
                console.log(error)
            }
        }).bind(this)
    }

    allowance(minAllowance: Allowance, self: boolean = false) {
        return (async function (req: AuthRequest, res: Response, next: NextFunction) {
            this.logger.info(minAllowance, self, req.session.cUser, req.session.isAuth, req.path)
            if (self && req.session.isAuth && req.session.cUser.id === req.params?.uuid) {
                return next()
            }
            if (req.session.cUser.allowance > minAllowance) {
                return res.status(403).json({
                    status: 1,
                    messages: "Forbidden!"
                })
            }
            next()
        }).bind(this)
    }
}
