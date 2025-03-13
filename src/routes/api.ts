import { NextFunction, Router, Response } from "express"
import { AuthRequest } from "../libs/session"
import { Logger } from "../libs/logger"
import { UserController } from "../core/controllers/user"
import { Allowance, File, MessagePreset } from "../database/index"
import { CryptoCore } from "../core/crypto"
import { ObjectId } from "mongodb"
import { Coingecko } from "../libs/coingecko"
import multer from "multer"
import { join } from "node:path"
import { rootpath } from "../root"
// import { createPromo, deletePromo, getAddrs, getAllDomain, getAllPromo, getByCode, updatePromo } from "./gambler"
// import { Faucets, FSCache } from "../libs/cache"
import { body, matchedData, param, query, validationResult } from "express-validator"
import { WalletCtrl } from "../core/controllers/wallet"
import { CFCtrl } from "../core/controllers/domain"

// const sup = new FSCache("./sup.json")

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

    constructor(logger: Logger, core: CryptoCore, coingecko: Coingecko) {
        this.router = Router()
        this.logger = logger
        this.core = core
        this.coingecko = coingecko

        // this.enableCFRoutes() // вот тут роуты клауда

        // DomainCron(logger.getLogger("DomainCron")) // следит за состоянием доменов

        this.enableAccRoutes() // это роуты для авторизации, эта платежка мой личный проект был, так что не удивляйся
        this.enableCoreRoutes(core, coingecko) // роуты платежки
        this.enableCoingecko(coingecko) // получение некоторой косметики и цен для крипты
        // this.enablePromo(coingecko) // пара роутов для агрегации промиков и депов
        // this.enableFile()
        // this.enableTPPresets()
        // this.enableGambler()
        // this.enableCBRoutes()
        this.walletRoutes()
        this.siteRoutes()
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

    // enableFile() {
    //     const upload = multer({ dest: 'uploads/' })

    //     this.router.post('/file', upload.single('file'), async function (req, res, next) {
    //         try {
    //             let f = await File.create({
    //                 originalname: req.file.originalname,
    //                 mimetype: req.file.mimetype,
    //                 path: req.file.path,
    //                 size: req.file.size
    //             })

    //             res.send({
    //                 status: 0,
    //                 data: f.dataValues
    //             })
    //         } catch (error) {
    //             res.send({
    //                 status: 1,
    //                 message: error.message,
    //                 code: error.code
    //             })
    //         }
    //     })

    //     this.router.get('/file/:id', async function (req, res: Response, next) {
    //         try {
    //             let file = await File.findByPk(req.params.id)


    //             // console.log(file)

    //             if (file) {
    //                 res.setHeader('content-type', file.dataValues.mimetype)
    //                 // console.log(fs.readFileSync(file.dataValues.path))
    //                 return res.sendFile(join(rootpath, file.dataValues.path), console.log)
    //                 return res.end()
    //             }
    //             res.status(404)
    //         } catch (error) {
    //             res.status(500)
    //         }
    //     })
    // }

    // enableTPPresets() {
    //     this.router.get("/presets/all", async (req, res, netx) => {
    //         try {
    //             res.send({
    //                 status: 0,
    //                 data: await MessagePreset.findAll()
    //             })
    //         } catch (error) {
    //             res.send({
    //                 status: 1,
    //                 message: error.message
    //             })
    //         }
    //     })
    //     this.router.post("/presets/add", async (req, res, netx) => {
    //         try {
    //             if (!req.body.text && !req.body.title) {
    //                 return res.send({
    //                     status: 1,
    //                     messge: "args error"
    //                 })
    //             }

    //             let text = req.body.text || req.body.title
    //             let title = req.body.title || text.slice(0, 15) + "..."

    //             let pres = await MessagePreset.create({
    //                 title,
    //                 text
    //             })

    //             res.send({
    //                 status: 0,
    //                 data: pres
    //             })
    //         } catch (error) {
    //             res.send({
    //                 status: 1,
    //                 message: error.message
    //             })
    //         }
    //     })
    //     this.router.put("/presets/:id", async (req, res, netx) => {
    //         try {
    //             await MessagePreset.update(req.body, { where: { id: req.params.id } })
    //             res.send({
    //                 status: 0,
    //                 data: await MessagePreset.findByPk(req.params.id)
    //             })
    //         } catch (error) {
    //             res.send({
    //                 status: 1,
    //                 message: error.message
    //             })
    //         }
    //     })
    //     this.router.delete("/presets/:id", async (req, res, netx) => {
    //         try {
    //             await MessagePreset.destroy({
    //                 where: {
    //                     id: req.params.id
    //                 }
    //             })
    //             res.send({
    //                 status: 0
    //             })
    //         } catch (error) {
    //             res.send({
    //                 status: 1,
    //                 message: error.message
    //             })
    //         }
    //     })

    //     this.router.get("/sup/first", async (req, res, next) => {
    //         res.send({
    //             status: 0,
    //             data: sup.get("fmsg")
    //         })
    //     })
    //     this.router.post("/sup/first", async (req, res, next) => {
    //         sup.set("fmsg", req.body.text)
    //         res.send({
    //             status: 0,
    //             data: sup.get("fmsg")
    //         })
    //     })
    // }

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

    // enablePromo(coingecko: Coingecko) {
    //     let parse_used = (used) => {
    //         if (typeof used === "string") {
    //             used = JSON.parse(used)
    //         }
    //         let t = []
    //         for (let u of used) {
    //             t.push({
    //                 uid: u.uid,
    //                 country: typeof u.country === "string" ? JSON.parse(u.country) : u.country
    //             })
    //         }

    //         return t
    //     }

    //     this.router.use("/promo/*", async (req, res, next) => {
    //         let key = req.body.key || req.query.key
    //         if (!key || key != (process.env.API_KEY || "dick")) {
    //             res.status(200).send("err")
    //             return res.end()
    //         }

    //         next()
    //     })
    //     this.router.get("/promo/all", async (req, res) => {
    //         try {
    //             let promos = await promocodes.find().toArray()

    //             let ret = []

    //             for (let promo of promos) {
    //                 let used = parse_used(promo.used)

    //                 let uids = [...used.map(v => v.uid), ...used.map(v => new ObjectId(v.uid + ""))]

    //                 let deps = await invoices.find({ user: { $in: uids } }).toArray()

    //                 let total = 0
    //                 for (let d of deps) {
    //                     d.sum = parseFloat(d.sum.toString())
    //                     d.usd_converted = (await coingecko.getPriceByOurName(d.currency.split('_')[0])).usd * d.sum
    //                     total += d.usd_converted
    //                 }

    //                 ret.push({
    //                     id: promo._id,
    //                     code: promo.code,
    //                     used,
    //                     currency: promo.currency,
    //                     sum: promo.sum,
    //                     usages: promo.usages,
    //                     times_used: promo.times_used,
    //                     expires: promo.expires,
    //                     vip: promo.vip,
    //                     dep: {
    //                         total, // total sum deposit in usd
    //                         count: deps.length, // count of deposits
    //                         deps: req.query.deps ? deps : null // dep arr
    //                     }
    //                 })
    //             }

    //             res.send({
    //                 status: 0,
    //                 data: ret
    //             })
    //         } catch (e) {
    //             this.logger.err(`[/promo/all]: ${e.code}: ${e.messasge}`)
    //             res.send({
    //                 status: 1,
    //                 message: e.message
    //             })
    //         }
    //     })
    //     this.router.get("/promo/:id", async (req, res) => {
    //         try {
    //             let promo = await promocodes.findOne({
    //                 _id: new ObjectId(req.params.id + "")
    //             })

    //             if (!promo) {
    //                 res.send({
    //                     status: 1,
    //                     message: "Pomo not found"
    //                 })
    //             }

    //             let used = parse_used(promo.used)

    //             let uids = [...used.map(v => v.uid), ...used.map(v => new ObjectId(v.uid + ""))]

    //             let deps = await invoices.find({ user: { $in: uids } }).toArray()

    //             let total = 0
    //             for (let d of deps) {
    //                 d.sum = parseFloat(d.sum.toString())
    //                 d.usd_converted = (await coingecko.getPriceByOurName(d.currency.split('_')[0])).usd * d.sum
    //                 total += d.usd_converted
    //             }

    //             res.send({
    //                 status: 0,
    //                 data: {
    //                     id: promo._id,
    //                     code: promo.code,
    //                     used,
    //                     currency: promo.currency,
    //                     sum: promo.sum,
    //                     usages: promo.usages,
    //                     times_used: promo.times_used,
    //                     expires: promo.expires,
    //                     vip: promo.vip,
    //                     dep: {
    //                         total,
    //                         count: deps.length,
    //                         deps: req.query.deps ? deps : null
    //                     }
    //                 }
    //             })
    //         } catch (e) {
    //             this.logger.err(`[/promo/${req.params.id}]: ${e.code}: ${e.messasge}`)
    //             res.send({
    //                 status: 1,
    //                 message: e.message
    //             })
    //         }
    //     })

    // }

    // enableCFRoutes() {
    //     this.router.use("/cf/*", async (req, res, next) => {
    //         let key = req.body.key || req.query.key
    //         if (!key || key != (process.env.API_KEY || "dick")) {
    //             res.status(200).send("err")
    //             return res.end()
    //         }

    //         next()
    //     })
    //     this.router.use("/claud/*", async (req, res, next) => {
    //         let key = req.body.key || req.query.key
    //         if (!key || key != (process.env.API_KEY || "dick")) {
    //             res.status(200).send("err")
    //             return res.end()
    //         }

    //         next()
    //     })
    //     this.router.post("/claud/add", async (req, res, next) => {
    //         // req.body = {domain, ip, name}
    //         let a
    //         while (true) {
    //             try {
    //                 if (!req.body.domain || !req.body.ip) {
    //                     res.send({
    //                         status: 1,
    //                         message: "Params error!"
    //                     })
    //                     return
    //                 }

    //                 const accs = await cfDB.find().toArray()

    //                 for (const acc of accs) {
    //                     if (!acc?.limit && !acc?.deleted && (await check(acc))) {
    //                         a = acc
    //                         break
    //                     } else {
    //                         await cfDB.updateOne({
    //                             _id: new ObjectId(acc._id)
    //                         }, {
    //                             $set: { deleted: true }
    //                         })
    //                     }
    //                 }

    //                 let cf = new CloudFlare(a.email, a.apiKey, a.accId)
    //                 let r = await cf.addDomain(req.body.domain, req.body.ip)
    //                 let ir = await domainDB.insertOne({
    //                     ...r,
    //                     accId: a._id,
    //                     name: req.body.name || req.body.domain.split(".").slice(-2).join(".")
    //                 })
    //                 return res.send({
    //                     status: 0,
    //                     data: {
    //                         _id: ir.insertedId,
    //                         ...r,
    //                         accId: a._id,
    //                         name: req.body.name
    //                     }
    //                 })
    //             } catch (error) {
    //                 if (error?.response?.data?.errors && error?.response?.data?.errors[0].code == 1118) {
    //                     await cfDB.updateOne({
    //                         _id: new ObjectId(a._id)
    //                     }, {
    //                         $set: {
    //                             limit: true
    //                         }
    //                     })
    //                     continue
    //                 } else {
    //                     this.logger.err(error.message + " " + JSON.stringify(error?.response?.data || []))
    //                     return res.send({
    //                         status: 1,
    //                         messge: "Server error"
    //                     })
    //                 }
    //             }
    //         }
    //     })
    //     this.router.put("/claud/:did", async (req, res, next) => {
    //         // req.body = {domain, ip, name}
    //         let a
    //         while (true) {
    //             try {
    //                 if (!req.body.name) {
    //                     res.send({
    //                         status: 1,
    //                         message: "Params error!"
    //                     })
    //                     return
    //                 }

    //                 let dom = await domainDB.findOne({
    //                     _id: new ObjectId(req.params.did + "")
    //                 })

    //                 if (!dom) {
    //                     res.send({
    //                         status: 1,
    //                         message: "Domain not found!"
    //                     })
    //                     return
    //                 }

    //                 let d = await domainDB.updateOne({ _id: dom._id }, {
    //                     name: req.body.name
    //                 })

    //                 res.send({
    //                     status: 0,
    //                     data: {
    //                         ...dom
    //                     }
    //                 })
    //             } catch (error) {
    //                 res.send({
    //                     status: 1,
    //                     message: "Server error"
    //                 })
    //                 // console.log(error)
    //                 this.logger.err(error.message)
    //             }
    //         }
    //     })
    //     this.router.delete("/claud/:zoneid", async (req, res: Response, next) => {
    //         // req.body = {}
    //         try {
    //             let d = await domainDB.findOne({
    //                 _id: new ObjectId("" + req.params.zoneid)
    //             })
    //             if (!d || d?.deleted) {
    //                 return res.send({
    //                     status: 0,
    //                     data: "ok"
    //                 })
    //             }
    //             let acc = await cfDB.findOne({
    //                 _id: new ObjectId("" + d.accId)
    //             })
    //             if (!acc) {
    //                 this.logger.err(`Account ${d.accId} not found`)
    //                 return res.send({
    //                     status: 1,
    //                     message: `Account not found`
    //                 })
    //             }
    //             if (acc?.deleted) {
    //                 return res.send({
    //                     status: 0,
    //                     data: "ok"
    //                 })
    //             }
    //             await cfDB.updateOne({
    //                 _id: new ObjectId(acc._id)
    //             }, {
    //                 $set: {
    //                     limit: false
    //                 }
    //             })
    //             let cf = new CloudFlare(acc.email, acc.apiKey, acc.accId)
    //             let r = await cf.deleteDomain(d.zoneId)
    //             await domainDB.deleteOne({ _id: new ObjectId(req.params.zoneid) })
    //             return res.send({
    //                 status: 0,
    //                 data: "ok"
    //             })
    //         } catch (error) {
    //             this.logger.err(error.message)
    //             return res.status(200).send({
    //                 status: 1,
    //                 message: "Server error"
    //             })
    //         }
    //     })

    //     this.router.post("/cf/add", async (req, res, next) => {
    //         // req.body = {domain, ip, name}
    //         let a
    //         while (true) {
    //             try {
    //                 if (!req.body.domain || !req.body.ip) {
    //                     res.status(200).send("err")
    //                     res.end()
    //                     return
    //                 }

    //                 const accs = await cfDB.find().toArray()

    //                 for (const acc of accs) {
    //                     if (!acc?.limit && !acc?.deleted && (await check(acc))) {
    //                         a = acc
    //                         break
    //                     } else {
    //                         await cfDB.updateOne({
    //                             _id: new ObjectId(acc._id)
    //                         }, {
    //                             $set: { deleted: true }
    //                         })
    //                     }
    //                 }

    //                 let cf = new CloudFlare(a.email, a.apiKey, a.accId)
    //                 let r = await cf.addDomain(req.body.domain, req.body.ip)
    //                 let ir = await domainDB.insertOne({
    //                     ...r,
    //                     accId: a._id,
    //                     name: req.body.name || req.body.domain.split(".").slice(-2).join(".")
    //                 })
    //                 return res.send({
    //                     _id: ir.insertedId,
    //                     ...r,
    //                     accId: a._id,
    //                     name: req.body.name
    //                 })
    //             } catch (error) {
    //                 if (error?.response?.data?.errors && error?.response?.data?.errors[0].code == 1118) {
    //                     await cfDB.updateOne({
    //                         _id: new ObjectId(a._id)
    //                     }, {
    //                         $set: {
    //                             limit: true
    //                         }
    //                     })
    //                     continue
    //                 } else {
    //                     res.status(200).send("err")
    //                     // console.log(error)
    //                     this.logger.err(error.message)
    //                 }
    //             }
    //         }
    //     })
    //     this.router.put("/cf/:did", async (req, res, next) => {
    //         // req.body = {domain, ip, name}
    //         let a
    //         while (true) {
    //             try {
    //                 if (!req.body.name) {
    //                     res.status(200).send("err")
    //                     res.end()
    //                     return
    //                 }

    //                 let dom = await domainDB.findOne({
    //                     _id: new ObjectId(req.params.did + "")
    //                 })

    //                 if (!dom) {
    //                     res.send("err1")
    //                     return
    //                 }

    //                 let d = await domainDB.updateOne({ _id: dom._id }, {
    //                     name: req.body.name
    //                 })

    //                 res.send({
    //                     ...dom
    //                 })
    //             } catch (error) {
    //                 res.status(200).send("err")
    //                 // console.log(error)
    //                 this.logger.err(error.message)
    //             }
    //         }
    //     })
    //     this.router.delete("/cf/:zoneid", async (req, res: Response, next) => {
    //         // req.body = {}
    //         try {
    //             let d = await domainDB.findOne({
    //                 _id: new ObjectId("" + req.params.zoneid)
    //             })
    //             if (!d || d?.deleted) {
    //                 return res.status(200).send("ok")
    //             }
    //             let acc = await cfDB.findOne({
    //                 _id: new ObjectId("" + d.accId)
    //             })
    //             if (!acc) {
    //                 this.logger.err(`Account ${d.accId} not found`)
    //                 return res.status(200).send("err")
    //             }
    //             if (acc?.deleted) {
    //                 return res.status(200).send("ok")
    //             }
    //             await cfDB.updateOne({
    //                 _id: new ObjectId(acc._id)
    //             }, {
    //                 $set: {
    //                     limit: false
    //                 }
    //             })
    //             let cf = new CloudFlare(acc.email, acc.apiKey, acc.accId)
    //             let r = await cf.deleteDomain(d.zoneId)
    //             await domainDB.deleteOne({ _id: new ObjectId(req.params.zoneid) })
    //             return res.status(200).send("ok")
    //         } catch (error) {
    //             this.logger.err(error.message)
    //             return res.status(200).send("err")
    //         }
    //     })
    // }

    enableAccRoutes() {
        const UserCtrl = new UserController()
        this.router.post("/acc/register", this.allowance(Allowance.Guest),
            body('username').trim().isAlphanumeric("en-US").isLength({ min: 3 }).escape(),
            body('email').trim().isEmail().normalizeEmail(),
            body('password').isStrongPassword({
                minLength: 12
            }), this.request(UserCtrl, UserCtrl.register, [
                "v.username",
                "v.email",
                "v.password",
                "session.",
                "Domain."
            ]))
        this.router.post("/acc/login",
            body('username').trim().notEmpty(),
            body('password').trim().notEmpty(),
            this.request(UserCtrl, UserCtrl.login, [
                "v.username",
                "body.password",
                "session."
            ]))
        this.router.post("/acc/login_by_token", this.request(UserCtrl, UserCtrl.loginByToken, [
            "body.token",
            "session."
        ]))
        this.router.post("/acc/allowance/:uuid", this.allowance(Allowance.Manager, false), this.request(UserCtrl, UserCtrl.allowance, [
            "params.uuid",
            "body.allowance"
        ]))
        this.router.get("/acc/newtoken", this.allowance(Allowance.User, false), this.request(UserCtrl, UserCtrl.generateToken, [
            "session.cUser"
        ]))

        this.router.get("/acc/all", this.allowance(Allowance.Manager), this.request(UserCtrl, UserCtrl.getUsers, []))

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
                "params.uuid",
                "body.user"
            ]))
        this.router.put("/acc/",
            body('user.username').optional().trim().isAlphanumeric("en-US").isLength({ min: 3 }).escape(),
            body('user.email').optional().trim().isEmail().normalizeEmail(),
            body('user.password').optional().isStrongPassword({
                minLength: 12
            }), this.allowance(Allowance.User, true), this.request(UserCtrl, UserCtrl.edit, [
                "params.uuid",
                "body.user"
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
        let walletCTRL = new WalletCtrl(this.core, this.coingecko)
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
        this.router.post("/faucet/:id/:coin", this.allowance(Allowance.Admin), this.request(walletCTRL, walletCTRL.getFaucet, [
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
            return this.getCurrencies().map(v => [v[0], v[1], prices[v[0].split("_")[0].toLowerCase()]?.usd || 0])
        }, []))

        this.router.get("/wallet/:coin/:uhash", this.request(core, core.getAddr, [
            "params.coin",
            "params.uhash"
        ]))
    }

    // enableCBRoutes() {
    //     this.router.get("/newMessage", (req, res, next) => {
    //         let data = JSON.parse(req.query.data)
    //         req.bus.emit('newMessage', {
    //             id: req.query.chatid, // id сообщения
    //             mammothId: data.user._id, // id мамонта
    //             text: data.message, // отсутствует если есть picture
    //             picture: "d ntreotq dthcbb nfrjuj ytn",//"название файла с изображением", // отсутствует если есть text
    //             side: data.user.roles.length > 0 ? "worker" : "mammoth", // отправитель (mammoth или worker)
    //             login: data.user.email,
    //             // country: "US",
    //             domain: data.user.domain,
    //             promo: data.user.promo,
    //             createdAt: data.created_at
    //         })
    //         res.end()
    //     })
    // }

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
                    message: "Forbidden!"
                })
            }
            next()
        }).bind(this)
    }
}
