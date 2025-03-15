import { User, Domain, Promo, Ticket } from "../../database/index"
import bcrypt from "bcrypt"
import { Session } from "../../libs/session"
import { createApiKey, genPassword } from "../../utils"
import { IntError } from "../../routes/api"
import { Allowance, DefaultUser, IUser, IUserEdit } from "../../types"
import { db2interface } from "../../type.conv"

export class UserController {

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
        const user = await User.findOne({
            where: {
                username: login
            }
        })

        if (!user || (user.allowance >= Allowance.User && user.Domain.id != domain.id)) throw new IntError("Invalid password or login")

        if (!bcrypt.compareSync(password, user.password)) throw new IntError("Invalid password or login")

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
    async register(username: string, email: string, password: string, session: Session, domain: Domain): Promise<IUser> {

        const user = await User.create({
            username,
            email,
            password,
            DomainId: domain.id
        })

        await session.setData({ uuid: user.id })

        return db2interface.user(user)
    }
    // get IUser - uuid|self
    async get(uuid: string, who?: IUser): Promise<IUser> {
        let user = await User.findByPk(uuid || who.id, {
            include: [
                { model: Domain, as: "Domain" },
                { model: Promo, as: "Activated" },
                { model: User, as: "referals" },
                { model: Ticket, as: "Tickets" }
            ]
        })

        return db2interface.user(user ? user : User.build(DefaultUser))
    }
    // change email|uname|password
    async edit(data: IUserEdit, uuid: string): Promise<IUser> {

        await User.update({
            email: data.email,
            username: data.username,
            password: data.password,
        }, {
            where: { id: uuid }
        })

        return this.get(uuid)
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

    // get list of IUser
    async getUsers(): Promise<IUser[]> {
        let users = (await User.findAll({
            include: [
                { model: Domain, as: "Domain" },
                { model: Promo, as: "Activated" }
            ]
        })).map(u => db2interface.user(u))

        return users
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