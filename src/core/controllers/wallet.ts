import EventEmitter from "events"
import { Domain, Promo, User, UTx } from "../../database"
import { FSCache } from "../../libs/cache"
import { Coingecko } from "../../libs/coingecko"
import { IntError } from "../../routes/api"
import { CryptoCore } from "../crypto"
import { Allowance, IUser, UTxTypes, IPromo, UTxStatus, IUTx } from "../../types"
import { db2interface } from "../../type.conv"

export class WalletCtrl {
    private core: CryptoCore
    private coingecko: Coingecko
    private faucets: FSCache
    private bus: EventEmitter
    constructor(core: CryptoCore, coingecko: Coingecko, bus: EventEmitter) {
        this.core = core
        this.coingecko = coingecko
        this.faucets = new FSCache("./rent_faucets.json")
        this.bus = bus
    }

    async createPromo(name: string, value: number, currency: string, worker: User, domainId: string): Promise<IPromo> {
        if (value <= 0) throw new IntError("Value must bigger then 0!")
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

        return db2interface.promo(promo)
    }

    async deletePromo(id: string) {
        await Promo.destroy({ where: { id } })
        return true
    }

    async updatePromo(id: string, value: number, currency: string): Promise<IPromo> {
        if (!this.core.has(currency)) throw new IntError(`Currency (${currency}) not found!`)

        let promo = await Promo.findByPk(id)

        promo.value = value ? value : promo.value
        promo.currency = currency ? currency : promo.currency

        await promo.save()

        return db2interface.promo(promo)
    }

    async movePromo(id: string, newWorker: string) {
        let u = await User.findByPk(newWorker)
        if (!u || u.allowance > Allowance.Manager) throw new IntError("Worker not found!")

        await Promo.update({ WorkerId: newWorker }, { where: { id } })

        return true
    }

    async activatePromo(name: string, user: User) {

        if (!user) throw new IntError("User not found!")

        if (user.PromoId) throw new IntError("Only one promo!")

        let promo = await Promo.findOne({
            where: { promo: name }
        })

        if (!promo) throw new IntError("Promo not found!")

        this.modBalance(promo.value, promo.currency, `Activate promo ${name}`, UTxTypes.PromoActivate, user)

        user.PromoId = promo.id
        await user.save()

        return true
    }

    async getAllPromo(page: number, per_page: number, user: IUser): Promise<{
        promo: IPromo[],
        count: number,
        pages: number
    }> {

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
                let promo = (await Promo.findAll(opts)).map(e => db2interface.promo(e))

                return {
                    promo,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Admin: {
                let max = await Promo.count({ where: { AdminId: user.id } })
                let promo = (await Promo.findAll({ where: { AdminId: user.id }, ...opts })).map(e => db2interface.promo(e))
                return {
                    promo,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Manager: {
                let max = await Promo.count({ where: { WorkerId: user.id } })
                let promo = (await Promo.findAll({ where: { WorkerId: user.id }, ...opts })).map(e => db2interface.promo(e))
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

        return db2interface.promo(p)
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

        return db2interface.promo(p)
    }

    async addBalance(value: number, currency: string, description: string, type: UTxTypes, user: User, ids: { AdminId: string, WorkerId: string }) {
        console.log("ADD")
        if (!user) { throw new IntError("User not found!") }
        if (!this.core.has(currency)) { throw new IntError("Currency not found! " + currency) }
        if (value <= 0) { throw new IntError("Value must be greater than 0!") }

        let usd = await this.coingecko.convertToFiat(currency, "usd", value)

        let status = type == UTxTypes.Withdraw ? UTxStatus.pending : UTxStatus.accepted

        if (status == UTxStatus.accepted) {
            let balances = user.balances
            let nval = user.balances[currency]?.val ? user.balances[currency].val + value : value
            let nusd = user.balances[currency]?.usd ? await this.coingecko.convertToFiat(currency, "usd", nval) : usd
            balances[currency] = { val: nval, usd: nusd }

            user.balances = balances

            user.changed("balances", true)

            user = await user.save()

            console.log(user)

            this.bus.emit("newBalance", {
                data: user.balances,
                channel: user.id
            })
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
        console.log("DEC")
        if (!user) { throw new IntError("User not found!") }
        if (!this.core.has(currency)) { throw new IntError("Currency not found! " + currency) }
        if (value <= 0) { throw new IntError("Value must be greater than 0!") }

        let status = type == UTxTypes.Withdraw ? UTxStatus.pending : UTxStatus.accepted

        let usd = await this.coingecko.convertToFiat(currency, "usd", value)

        if (status == UTxStatus.accepted) {
            let nval = user.balances[currency]?.val ? user.balances[currency].val - value : value
            let nusd = user.balances[currency]?.val ? await this.coingecko.convertToFiat(currency, "usd", nval) : usd
            user.balances[currency] = { val: nval, usd: nusd }

            user = await user.save()

            this.bus.emit("newBalance", {
                data: user.balances,
                channel: user.id
            })
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

        console.log(value, currency, description, type, user.id)
        if (value > 0) { await this.addBalance(value, currency, description, type, user, { AdminId, WorkerId }) }
        else if (value < 0) { await this.decBalance(value * -1, currency, description, type, user, { AdminId, WorkerId }) }
    }

    async getAllTx(page: number, per_page: number, user: IUser): Promise<{
        txs: IUTx[]
        pages: number
        count: number
    }> {

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
                let txs = (await UTx.findAll(opts)).map(e => db2interface.utx(e))

                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Admin: {
                let max = await UTx.count({ where: { AdminId: user.id } })
                let txs = (await UTx.findAll({ where: { AdminId: user.id }, ...opts })).map(e => db2interface.utx(e))
                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Manager: {
                let max = await UTx.count({ where: { WorkerId: user.id } })
                let txs = (await UTx.findAll({ where: { WorkerId: user.id }, ...opts })).map(e => db2interface.utx(e))
                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Banned:
            case Allowance.User: {
                let max = await UTx.count({ where: { UserId: user.id } })
                let txs = (await UTx.findAll({ where: { UserId: user.id }, ...opts })).map(e => db2interface.utx(e, false))
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

        return db2interface.utx(tx)
    }

    async getAllDeps(page: number, per_page: number, user: IUser): Promise<{
        txs: IUTx[]
        pages: number
        count: number
    }> {

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
                let txs = (await UTx.findAll({ where: { type: UTxTypes.Deposit }, ...opts })).map(e => db2interface.utx(e))

                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Admin: {
                let max = await UTx.count({ where: { AdminId: user.id } })
                let txs = (await UTx.findAll({ where: { AdminId: user.id, type: UTxTypes.Deposit }, ...opts })).map(e => db2interface.utx(e))
                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Manager: {
                let max = await UTx.count({ where: { WorkerId: user.id } })
                let txs = (await UTx.findAll({ where: { WorkerId: user.id, type: UTxTypes.Deposit }, ...opts })).map(e => db2interface.utx(e))
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
        if (value <= 0) throw new IntError("Value must bigger then 0!")
        let user = await User.findByPk(userId, {
            include: [
                { model: Domain, as: "Domain" },
                { model: Promo, as: "Activated" },
            ]
        })

        if (!user) throw new IntError("User not found!")

        await this.modBalance(value, currency, description ? `Deposit - ${description}` : "Deposit", UTxTypes.Deposit, user)
        return true
    }

    async createWithdraw(value: number, currency: string, description: string, userId: string) {
        if (value <= 0) throw new IntError("Value must bigger then 0!")
        let user = await User.findByPk(userId)

        if (!user) throw new IntError("User not found!")

        await this.modBalance(-value, currency, description ? `Withdraw - ${description}` : "Withdraw", UTxTypes.Withdraw, user)
        return true
    }
    async getAllWithdraws(page: number, per_page: number, user: IUser): Promise<{
        txs: IUTx[]
        pages: number
        count: number
    }> {

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
                let txs = (await UTx.findAll({ where: { type: UTxTypes.Withdraw }, ...opts })).map(e => db2interface.utx(e))

                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Admin: {
                let max = await UTx.count({ where: { AdminId: user.id } })
                let txs = (await UTx.findAll({ where: { AdminId: user.id, type: UTxTypes.Withdraw }, ...opts })).map(e => db2interface.utx(e))
                return {
                    txs,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Manager: {
                let max = await UTx.count({ where: { WorkerId: user.id } })
                let txs = (await UTx.findAll({ where: { WorkerId: user.id, type: UTxTypes.Withdraw }, ...opts })).map(e => db2interface.utx(e))
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
        return db2interface.utx(await tx.save())
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
