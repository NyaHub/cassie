import axios from "axios"
import EventEmitter from "events"
import { CFAcc, Domain, User } from "../../database"
import { Logger } from "../../libs/logger"
import { CloudflareAccount, CloudflareAPI } from "../../libs/cloudflare"
import { IntError } from "../../routes/api"
import { DomainStatus, IUser, Allowance } from "../../types"
import { db2interface } from "../../type.conv"

interface AddDomainResult {
    domain: string,
    attachedAccount: CFAcc,
    zoneId: string,
    nameServers: string[]
}

export class CFCtrl {
    private manager: CloudflareManager
    private logger: Logger
    constructor(logger: Logger) {
        this.logger = logger
        this.manager = new CloudflareManager(this.logger.getLogger("CloudflareManager"))
    }

    async addDomain(domain: string, name: string, owner: IUser) {
        let zoneInfo
        try {
            zoneInfo = await this.manager.addDomain(domain)
            let d = await Domain.create({
                status: DomainStatus.pending,
                domain,
                nsList: zoneInfo.nameServers,
                zoneId: zoneInfo.zoneId,
                name,
                AccountId: zoneInfo.attachedAccount.id,
                OwnerId: owner.id
            })

            return {
                id: d.id,
                status: DomainStatus[d.status],
                domain: d.domain,
                nsList: d.nsList,
                name: d.name
            }
        } catch (e) {
            this.logger.err(`Domain create error: ${e.message}` + JSON.stringify({ zoneInfo, name, domain, AccountId: zoneInfo.attachedAccount.id }))
            throw new IntError("Somthing wet wrong!")
        }
    }

    async deleteDomain(id: string) {
        let domain = await Domain.findByPk(id, { include: { model: CFAcc, as: "Account" } })

        if (!domain) throw new IntError("Domain not found!")

        await this.manager.deleteDomainZone(domain.Account, domain.zoneId)

        return true
    }

    async get(id: string) {
        let d = await Domain.findByPk(id)
        return db2interface.domain(d)
    }

    async getAllDomain(page: number, per_page: number, user: IUser) {

        let limit = per_page || 50
        let offset = (page || 0) * limit

        let opts = {
            limit,
            offset,
            include: [
                // { model: User, as: "Users" },
                // { model: Promo, as: "Promos" },
            ]
        }

        switch (user.allowance) {
            case Allowance.System:
            case Allowance.Owner: {
                let max = await Domain.count()
                let domain = (await Domain.findAll(opts)).map(e => db2interface.domain(e))

                return {
                    domain,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Admin: {
                let max = await Domain.count({ where: { OwnerId: user.id } })
                let domain = (await Domain.findAll({ where: { OwnerId: user.id }, ...opts })).map(e => db2interface.domain(e))
                return {
                    domain,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Manager: {
                let wdom = await User.findByPk(user.id, { include: { model: Domain, as: "Domain" } })
                let max = await Domain.count({ where: { OwnerId: wdom.Domain.OwnerId } })
                let domain = (await Domain.findAll({ where: { OwnerId: wdom.Domain.OwnerId }, ...opts })).map(e => db2interface.domain(e))
                return {
                    domain,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            default: throw new IntError("Low Allowance!")
        }
    }

    async editName(id: string, name: string) {
        await Domain.update({ name }, { where: { id } })

        return this.get(id)
    }

    async moveSite(siteId: string, userId: string, who: User) {
        let u = await User.findByPk(userId)
        if (!u) throw new IntError("User not found!")

        if (who.allowance >= Allowance.Owner) {
            await Domain.update({
                OwnerId: userId
            }, {
                where: {
                    id: siteId
                }
            })
        } else {
            await Domain.update({
                OwnerId: userId
            }, {
                where: {
                    id: siteId,
                    OwnerId: who.id
                }
            })
        }

        return this.get(siteId)
    }
}

export class CloudflareManager {
    private logger: Logger

    constructor(logger: Logger) {
        this.logger = logger
    }

    async addDomain(domain: string): Promise<AddDomainResult> {
        let attachedAccount: CFAcc | null = null
        let zoneId: string | null = null
        let nameServers: string[] = []

        let accounts = await CFAcc.findAll()

        for (const account of accounts) {
            try {
                const isAccountValid = await CloudflareAPI.checkAccount(account)
                if (isAccountValid == 0) {
                    const zoneInfo = await CloudflareAPI.addDomainZone(account, domain)
                    if (zoneInfo) {
                        attachedAccount = account
                        zoneId = zoneInfo.zoneId
                        nameServers = zoneInfo.nameServers

                        await CloudflareAPI.addWildcardRecord(account, zoneInfo.zoneId)

                        break
                    }
                } else if (isAccountValid == 2) {
                    account.destroy().catch((e => {
                        this.logger.err(`Account destory error: ${e.message}`)
                    }))
                }
            } catch (error) {
                this.logger.err(`Account ${account.id} is dead or http err: error message: ${error.message}`)
                account.destroy().catch((e => {
                    this.logger.err(`Account destory error: ${e.message}`)
                }))
            }
        }

        return {
            domain,
            attachedAccount,
            zoneId,
            nameServers
        }
    }

    async deleteDomainZone(account: CloudflareAccount, zoneId: string): Promise<boolean> {
        return CloudflareAPI.deleteDomainZone(account, zoneId)
    }
}

export class CloudflareMonitor {

    private logger: Logger
    private bus: EventEmitter

    constructor(logger: Logger, bus: EventEmitter) {
        this.logger = logger
        this.bus = bus
    }

    async checkDomains() {
        try {
            const domains = await Domain.findAll({
                where: {
                    status: DomainStatus.pending
                },
                include: CFAcc
            })

            for (const domain of domains) {
                const url = `https://api.cloudflare.com/client/v4/zones/${domain.zoneId}`

                try {
                    const res = await axios({
                        url,
                        headers: {
                            'X-Auth-Email': domain.Account.email,
                            'X-Auth-Key': domain.Account.apiKey,
                            'Content-Type': 'application/json',
                        },
                        method: "get"
                    })

                    if (DomainStatus[<string>res.data.result.status] != domain.status) {
                        domain.status = DomainStatus[<string>res.data.result.status]
                        await domain.save()
                    }
                } catch (error) {
                    this.logger.info(`CF Acc dead ${domain.Account.id} ${domain.Account.email}:${domain.Account.password}`)
                    this.bus.emit("cf_acc_dead", {
                        id: domain.Account.id,
                        email: domain.Account.email,
                        password: domain.Account.password,
                        apiKey: domain.Account.apiKey,
                        accountId: domain.Account.accountId
                    })
                }
            }
        } catch (e) {
            this.logger.err("Some error: " + e.message)
        }
    }

    startMonitoring() {
        setTimeout(async () => {
            this.logger.info("CloudflareMonitor start...")
            await this.checkDomains()
            this.startMonitoring()
            this.logger.info("CloudflareMonitor wait...")
        }, 1000 * 10 * 60)
    }
}