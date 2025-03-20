import { User, Domain, Promo, Ticket } from "../../database/index"
import bcrypt from "bcrypt"
import { Session } from "../../libs/session"
import { createApiKey, genPassword } from "../../utils"
import { IntError } from "../../routes/api"
import { Allowance, DefaultUser, IUser, IUserEdit } from "../../types"
import { db2interface } from "../../type.conv"
import { Op } from "sequelize"
import { RedisCache } from "../../libs/cache"

export class UserController {
    private cache: RedisCache

    constructor(cache: RedisCache) {
        this.cache = cache
    }

    // register new user by admin
    async registerFromAdmin(email: string, login: string): Promise<IUser & { password: string }> {
        let password = genPassword(16)
        const user = await User.create({
            email,
            login,
            password
        })

        let ret: IUser & { password: string } = {
            ...db2interface.user(user),
            password
        }

        return ret
    }
    // login - email&password
    async login(login: string, password: string, session: Session, domain: Domain): Promise<IUser> {
        const users = await User.findAll({
            where: {
                username: login,
            },
            include: [
                { model: Domain, as: "Domain" },
                { model: Promo, as: "Activated" },
                { model: User, as: "referals" },
                { model: Ticket, as: "Tickets" }
            ]
        })

        let user

        for (let u of users) {
            if (bcrypt.compareSync(password, user.password)) {
                user = u
                break
            }
        }

        if (!user) throw new IntError("Invalid password or login")

        // if (!user || (user.allowance >= Allowance.User && user.DomainId != domain.id)) throw new IntError("Invalid password or login")

        await session.setData({ uuid: user.id })

        return db2interface.user(user)
    }
    // login - apitoken
    async loginByToken(token: string, session: Session, domain: Domain): Promise<{ user: IUser, authToken: string }> {
        const user = await User.findOne({
            where: {
                apitoken: token,
                DomainId: domain.id
            }
        })

        if (!user || (user.allowance >= Allowance.User && user.Domain.id != domain.id)) {
            throw new IntError("Invalid token!")
        }

        await session.setData({
            uuid: user.id
        })

        return {
            user: db2interface.user(user),
            authToken: session.authtoken
        }
    }
    // register - uname&email&password
    async register(username: string, email: string, password: string, session: Session, domain: Domain, ref: string): Promise<IUser> {

        if (ref) {
            let u = await User.findOne({
                where: { ref }
            })
            if (!u) ref = undefined
        }
        let us = await User.findAll({
            where: {
                username
            }
        })

        for (let u of us) {
            if (u.DomainId == domain.id || u.allowance < Allowance.User) throw new IntError("User already exists!")
        }

        const user = await User.create({
            username,
            email,
            password,
            DomainId: domain.id,
            refCode: ref
        })

        await session.setData({ uuid: user.id })

        return db2interface.user(user)
    }
    // get IUser - uuid|self
    async get(uuid: string, who?: User): Promise<IUser> {

        let user = await User.findByPk(uuid || who?.id, {
            include: [
                { model: Domain, as: "Domain" },
                { model: Promo, as: "Activated" },
                { model: Ticket, as: "Tickets" }
            ]
        })

        if (user) {
            let ref = await User.findAll({
                where: {
                    refCode: user.ref
                }
            })

            user.referals = ref
        }
        return db2interface.user(user ? user : User.build(DefaultUser), who.allowance < Allowance.User)
    }
    // change email|uname|password
    async edit(data: IUserEdit, uuid: string, who: User, domain: Domain): Promise<IUser> {

        if (data?.username) {
            let us = await User.findAll({
                where: {
                    username: data.username
                }
            })

            for (let u of us) {
                if (u.DomainId == domain.id || u.allowance < Allowance.User) throw new IntError("Username is already taken!")
            }
        }

        await User.update({
            email: data?.email,
            username: data?.username,
            password: data?.password,
        }, {
            where: { id: uuid || who?.id }
        })

        return await this.get(uuid, who)
    }
    // delete user
    async delete(uuid: string): Promise<boolean> {
        await User.destroy({
            where: {
                id: uuid
            }
        })

        return true
    }

    // edit allowance
    async allowance(uuid: string, allowance: Allowance, editor: IUser): Promise<boolean> {
        if (editor.allowance > allowance) throw new IntError("Invalid allowance!")

        let u = await User.findByPk(uuid)

        if (editor.allowance > u.allowance) throw new IntError("Invalid allowance!")

        u.allowance = allowance
        await u.save()

        return true
    }

    async getUsers(page: number, per_page: number, user: User): Promise<{
        users: IUser[],
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
                { model: Promo, as: "Activated" },
            ]
        }

        switch (user.allowance) {
            case Allowance.System:
            case Allowance.Owner: {
                let max = await User.count()
                let users = (await User.findAll(opts)).map(e => db2interface.user(e, false))

                return {
                    users,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Admin: {
                let doms = (await Domain.findAll({
                    where: {
                        OwnerId: user.id
                    }, attributes: ["id"]
                })).map(e => e.id)

                let u = await User.findAndCountAll({
                    where: {
                        DomainId: {
                            [Op.or]: doms
                        }
                    },
                    ...opts
                })
                return {
                    users: u.rows.map(e => db2interface.user(e, false)),
                    count: u.count,
                    pages: Math.ceil(u.count / limit)
                }
            }
            case Allowance.Manager: {
                let promos = (await Promo.findAll({ where: { WorkerId: user.id }, attributes: ["id"] })).map(e => e.id)

                let u = await User.findAndCountAll({
                    where: {
                        PromoId: {
                            [Op.or]: promos
                        }
                    },
                    ...opts
                })
                return {
                    users: u.rows.map(e => db2interface.user(e, false)),
                    count: u.count,
                    pages: Math.ceil(u.count / limit)
                }
            }
            default: throw new IntError("Low Allowance!")
        }
    }

    // change apitoken
    async generateToken(user: IUser): Promise<string> {
        let u = await User.findByPk(user.id)

        if (!u) throw new IntError("Invalid user! WTF!")

        u.apitoken = createApiKey()
        await u.save()

        return u.apitoken
    }
}