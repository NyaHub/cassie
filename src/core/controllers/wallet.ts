import { Allowance, Domain, IPromo, IUser, Promo, User, UTx, UTxStatus, UTxTypes } from "../../database"
import { FSCache } from "../../libs/cache"
import { Coingecko } from "../../libs/coingecko"
import { IntError } from "../../routes/api"
import { CryptoCore } from "../crypto"
import { UserController } from "./user"

// enableCoreRoutes(core: CryptoCore, coingecko: Coingecko) {
//     if (!core) return

//     this.router.get("/wallet/cur", this.request(core, async function () {
//         let prices = await coingecko.getAllPrices()
//         return this.getCurrencies().map(v => [v[0], v[1], prices[v[0].split("_")[0].toLowerCase()]?.usd || 0])

//     }, []))

//     this.router.get("/wallet/:coin/:uhash", this.request(core, core.getAddr, [
//         "params.coin",
//         "params.uhash"
//     ]))

//     this.router.post("/faucet/:net", this.request(this, async (net, addr) => {
//         Faucets.set(net, addr)
//         return true
//     }, [
//         "params.net",
//         "body.addr"
//     ]))

//     this.router.post("/faucet/:net", this.request(this, async (net, addr) => {
//         Faucets.set(net.toUpperCase(), addr)
//         return true
//     }, [
//         "params.net",
//         "body.addr"
//     ]))

//     this.router.get("/faucet/all", this.request(this, async () => {
//         return Faucets.getA()
//     }, []))
//     this.router.get("/faucet/:net", this.request(this, async (net) => {
//         return Faucets.get(net.toUpperCase())
//     }, [
//         "params.net"
//     ]))
// }

export class WalletCtrl {
    private core: CryptoCore
    private coingecko: Coingecko
    private faucets: FSCache
    constructor(core: CryptoCore, coingecko: Coingecko) {
        this.core = core
        this.coingecko = coingecko
        this.faucets = new FSCache("./rent_faucets.json")
    }

    async createPromo(name: string, value: number, currency: string, worker: User, domainId: string) {
        if (!this.core.has(currency)) throw new IntError(`Currency (${currency}) not found!`)
        let d = await Domain.findByPk(domainId)

        if (!d) throw new IntError("Domain not found!")

        if (name) {
            let p = await Promo.findOne({
                where: {
                    promo: name,
                    DomainId: d.id
                }
            })

            if (p) throw new IntError("This promo created!")
        }

        let promo = await Promo.create({
            promo: name,
            value: value,
            currency: currency,
            WorkerId: worker.id,
            AdminId: d.OwnerId,
            DomainId: d.id
        })

        return {
            id: promo.id,
            promo: promo.promo,
            value: promo.value,
            currency: promo.currency,
        }
    }

    async deletePromo(id: string) {
        await Promo.destroy({ where: { id } })
        return true
    }

    async updatePromo(id: string, value: number, currency: string) {
        if (!this.core.has(currency)) throw new IntError(`Currency (${currency}) not found!`)

        let promo = await Promo.findByPk(id)

        promo.value = value ? value : promo.value
        promo.currency = currency ? currency : promo.currency

        await promo.save()

        return {
            id: promo.id,
            promo: promo.promo,
            value: promo.value,
            currency: promo.currency,
        }
    }

    async movePromo(id: string, newWorker: string) {
        let u = await User.findByPk(newWorker)
        if (!u || u.allowance > Allowance.Manager) throw new IntError("Worker not found!")

        await Promo.update({ WorkerId: newWorker }, { where: { id } })

        return true
    }

    async activatePromo(name: string, cuser: IUser) {
        let user = await User.findByPk(cuser.id)

        if (!user) throw new IntError("User not found!")

        let promo = await Promo.findOne({
            where: { promo: name }
        })

        if (!promo) throw new IntError("Promo not found!")

        this.modBalance(promo.value, promo.currency, `Activate promo ${name}`, UTxTypes.PromoActivate, user)

        await user.update("PromoId", promo.id)

        return true
    }

    static promodb2Interface(promo: Promo): IPromo {
        let activations
        if (promo.Activations) {
            activations = promo.Activations.map(u => UserController.db2interface(u))
        }
        return {
            id: promo.id,
            promo: promo.promo,
            value: promo.value,
            currency: promo.currency,
            activations,
            sitename: promo.Domain?.name,
            siteId: promo.DomainId,
            worker: promo.Worker ? UserController.db2interface(promo.Worker) : null,
            workerId: promo.WorkerId,
            createdAt: promo.createdAt,
            updatedAt: promo.updatedAt,
        }
    }

    async getAllPromo(page: number, per_page: number, user: IUser) {

        let limit = per_page || 50
        let offset = (page || 0) * limit

        let opts = {
            limit,
            offset,
            include: [
                { model: Domain, as: "Domain" },
                { model: User, as: "Activations" },
                // {model: User, as: "Worker"},
            ]
        }

        switch (user.allowance) {
            case Allowance.System:
            case Allowance.Owner: {
                let max = await Promo.count()
                let promo = (await Promo.findAll(opts)).map(WalletCtrl.promodb2Interface)

                return {
                    promo,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Admin: {
                let max = await Promo.count({ where: { AdminId: user.id } })
                let promo = (await Promo.findAll({ where: { AdminId: user.id }, ...opts })).map(WalletCtrl.promodb2Interface)
                return {
                    promo,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Manager: {
                let max = await Promo.count({ where: { WorkerId: user.id } })
                let promo = (await Promo.findAll({ where: { WorkerId: user.id }, ...opts })).map(WalletCtrl.promodb2Interface)
                return {
                    promo,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            default: throw new IntError("Low Allowance!")
        }
    }
    async getPromoById(id: string, user: IUser) {
        let opts = {
            include: [
                { model: Domain, as: "Domain" },
                { model: User, as: "Activations" },
                // {model: User, as: "Worker"},
            ]
        }
        let p
        if (user.allowance > Allowance.Admin) {
            p = await Promo.findOne({ where: { id }, ...opts })
        } else {
            p = await Promo.findByPk(id, opts)
        }

        if (!p) throw new IntError("Promo not found!")

        return WalletCtrl.promodb2Interface(p)
    }
    async getPromoByName(promo: string, user: IUser) {
        let opts = {
            include: [
                { model: Domain, as: "Domain" },
                { model: User, as: "Activations" },
                // {model: User, as: "Worker"},
            ]
        }
        let p
        if (user.allowance > Allowance.Admin) {
            p = await Promo.findOne({ where: { promo, WorkerId: user.id }, ...opts })
        } else {
            p = await Promo.findOne({ where: { promo }, ...opts })
        }

        if (!p) throw new IntError("Promo not found!")

        return WalletCtrl.promodb2Interface(p)
    }

    async addBalance(value: number, currency: string, description: string, type: UTxTypes, user: User, ids: { AdminId: string, WorkerId: string }) {
        if (!user) { throw new IntError("User not found!") }
        if (!this.core.has(currency)) { throw new IntError("Currency not found! " + currency) }
        if (value <= 0) { throw new IntError("Value must be greater than 0!") }

        let usd = await this.coingecko.convertToFiat(currency, "usd", value)

        let status = type == UTxTypes.Withdraw ? UTxStatus.pending : UTxStatus.accepted

        if (status == UTxStatus.accepted) {
            let nval = user.balances[currency].val ? user.balances[currency].val + value : value
            let nusd = user.balances[currency].usd ? await this.coingecko.convertToFiat(currency, "usd", nval) : usd


            user.balances[currency] = { val: nval, usd: nusd }

            await user.save()
        }

        let tx = await UTx.create({
            value,
            usd,
            currency,
            description,
            type,
            status,
            ...ids
        })
    }
    async decBalance(value: number, currency: string, description: string, type: UTxTypes, user: User, ids: { AdminId: string, WorkerId: string }) {
        if (!user) { throw new IntError("User not found!") }
        if (!this.core.has(currency)) { throw new IntError("Currency not found! " + currency) }
        if (value <= 0) { throw new IntError("Value must be greater than 0!") }

        let status = type == UTxTypes.Withdraw ? UTxStatus.pending : UTxStatus.accepted

        let usd = await this.coingecko.convertToFiat(currency, "usd", value)

        if (status == UTxStatus.accepted) {
            let nval = user.balances[currency].val ? user.balances[currency].val - value : value
            let nusd = user.balances[currency].val ? await this.coingecko.convertToFiat(currency, "usd", nval) : usd
            user.balances[currency] = { val: nval, usd: nusd }

            await user.save()
        }

        let tx = await UTx.create({
            value: -value,
            usd,
            currency,
            description,
            type,
            status,
            ...ids
        })
    }
    async modBalance(value: number, currency: string, description: string, type: UTxTypes, user: User) {
        if (!user) { throw new IntError("User not found!") }
        if (!this.core.has(currency)) { throw new IntError("Currency not found! " + currency) }

        let AdminId = user.Activated ? user.Activated.AdminId : user.Domain.OwnerId
        let WorkerId = user.Activated ? user.Activated.WorkerId : user.Domain.OwnerId

        if (value > 0) this.addBalance(value, currency, description, type, user, { AdminId, WorkerId })
        else if (value < 0) this.decBalance(value * -1, currency, description, type, user, { AdminId, WorkerId })
    }

    static txdb2interface(tx: UTx) {
        return {
            id: tx.id,
            value: tx.value,
            usd: tx.usd,
            currency: tx.currency,
            description: tx.description,
            type: tx.type,
            createdAt: tx.createdAt,
        }
    }

    async getAllTx(page: number, per_page: number, user: IUser) {

        let limit = per_page || 50
        let offset = (page || 0) * limit

        let opts = {
            limit,
            offset,
            include: [
                // { model: Domain, as: "Domain" },
                // { model: User, as: "Activations" },
                // {model: User, as: "Worker"},
            ]
        }

        switch (user.allowance) {
            case Allowance.System:
            case Allowance.Owner: {
                let max = await UTx.count()
                let txs = (await UTx.findAll(opts)).map(WalletCtrl.txdb2interface)

                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Admin: {
                let max = await UTx.count({ where: { AdminId: user.id } })
                let txs = (await UTx.findAll({ where: { AdminId: user.id }, ...opts })).map(WalletCtrl.txdb2interface)
                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Manager: {
                let max = await UTx.count({ where: { WorkerId: user.id } })
                let txs = (await UTx.findAll({ where: { WorkerId: user.id }, ...opts })).map(WalletCtrl.txdb2interface)
                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Banned:
            case Allowance.User: {
                let max = await UTx.count({ where: { UserId: user.id } })
                let txs = (await UTx.findAll({ where: { UserId: user.id }, ...opts })).map(WalletCtrl.txdb2interface)
                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            default: throw new IntError("Low Allowance!")
        }
    }
    async getTxById(id: string, user: IUser) {
        let tx = await UTx.findByPk(id)

        if (!tx) throw new IntError("Tx not found!")

        return WalletCtrl.txdb2interface(tx)
    }

    async getAllDeps(page: number, per_page: number, user: IUser) {

        let limit = per_page || 50
        let offset = (page || 0) * limit

        let opts = {
            limit,
            offset,
            include: [
                // { model: Domain, as: "Domain" },
                // { model: User, as: "Activations" },
                // {model: User, as: "Worker"},
            ]
        }

        switch (user.allowance) {
            case Allowance.System:
            case Allowance.Owner: {
                let max = await UTx.count()
                let txs = (await UTx.findAll({ where: { type: UTxTypes.Deposit }, ...opts })).map(WalletCtrl.txdb2interface)

                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Admin: {
                let max = await UTx.count({ where: { AdminId: user.id } })
                let txs = (await UTx.findAll({ where: { AdminId: user.id, type: UTxTypes.Deposit }, ...opts })).map(WalletCtrl.txdb2interface)
                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Manager: {
                let max = await UTx.count({ where: { WorkerId: user.id } })
                let txs = (await UTx.findAll({ where: { WorkerId: user.id, type: UTxTypes.Deposit }, ...opts })).map(WalletCtrl.txdb2interface)
                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            default: throw new IntError("Low Allowance!")
        }
    }
    async createDeposit(value: number, currency: string, description: string, userId: string) {
        let user = await User.findByPk(userId)

        if (!user) throw new IntError("User not found!")

        this.modBalance(value, currency, description ? `Deposit - ${description}` : "Deposit", UTxTypes.Deposit, user)
        return true
    }

    async createWithdraw(value: number, currency: string, description: string, userId: string) {
        let user = await User.findByPk(userId)

        if (!user) throw new IntError("User not found!")

        this.modBalance(-value, currency, description ? `Withdraw - ${description}` : "Withdraw", UTxTypes.Withdraw, user)
        return true
    }
    async getAllWithdraws(page: number, per_page: number, user: IUser) {

        let limit = per_page || 50
        let offset = (page || 0) * limit

        let opts = {
            limit,
            offset,
            include: [
                // { model: Domain, as: "Domain" },
                // { model: User, as: "Activations" },
                // {model: User, as: "Worker"},
            ]
        }

        switch (user.allowance) {
            case Allowance.System:
            case Allowance.Owner: {
                let max = await UTx.count()
                let txs = (await UTx.findAll({ where: { type: UTxTypes.Withdraw }, ...opts })).map(WalletCtrl.txdb2interface)

                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Admin: {
                let max = await UTx.count({ where: { AdminId: user.id } })
                let txs = (await UTx.findAll({ where: { AdminId: user.id, type: UTxTypes.Withdraw }, ...opts })).map(WalletCtrl.txdb2interface)
                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Manager: {
                let max = await UTx.count({ where: { WorkerId: user.id } })
                let txs = (await UTx.findAll({ where: { WorkerId: user.id, type: UTxTypes.Withdraw }, ...opts })).map(WalletCtrl.txdb2interface)
                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            default: throw new IntError("Low Allowance!")
        }
    }
    async chTxStatus(id: string, status: UTxStatus) {
        let tx = await UTx.findByPk(id)

        if (!tx) throw new IntError("Tx not found!")

        tx.status = status
        return await tx.save()
    }

    // get wallet from core

    async getFaucet(id: string, coin: string) {
        let f = this.faucets.get(id)
        return f ? f[coin] : null
    }

    async getFaucets(id: string) {
        return this.faucets.get(id)
    }

    async setFaucet(id: string, coin: string, addr: string) {
        let f = this.faucets.get(id)
        if (f) f[coin] = addr
        else {
            f = {}
            f[coin] = addr
        }
        this.faucets.set(id, f)
        return f
    }
}
